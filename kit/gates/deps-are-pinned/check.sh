#!/usr/bin/env sh
# Рядом с объявлением зависимостей обязан лежать файл с закреплёнными версиями. Без него
# завтрашняя сборка соберёт другое, и «у меня работает» становится неопровержимым: сравнить
# нечего.
DIR="${1:-.}"
BAD=0

# Объявление без единой зависимости закреплять нечем и незачем: пакетный менеджер не создаст
# файл версий там, где версий нет. Требовать его — красить гейт на пустом месте.
has_deps_declared() {
  case "$1" in
    package.json)  grep -qE '"(dependencies|devDependencies|peerDependencies)"[[:space:]]*:[[:space:]]*\{[[:space:]]*"' "$DIR/$1" ;;
    # go.sum вообще не создаётся, если модуль использует только стандартную библиотеку —
    # требовать его там означает красить гейт на пустом месте, а не ловить нарушение.
    go.mod)        grep -qE '^require\b' "$DIR/$1" ;;
    *)             return 0 ;;
  esac
}

need() {
  MANIFEST="$1"; shift
  [ -f "$DIR/$MANIFEST" ] || return 0
  has_deps_declared "$MANIFEST" || return 0
  for LOCK in "$@"; do
    [ -f "$DIR/$LOCK" ] && return 0
  done
  echo "$MANIFEST: нет файла с закреплёнными версиями (ожидался один из: $*)"
  echo "  почини: создай его командой пакетного менеджера и положи в репозиторий."
  BAD=1
}

need package.json  package-lock.json yarn.lock pnpm-lock.yaml npm-shrinkwrap.json
need pyproject.toml poetry.lock uv.lock pdm.lock
need go.mod        go.sum
need Cargo.toml    Cargo.lock
need Gemfile       Gemfile.lock
need composer.json composer.lock

# requirements.txt закрепляют не отдельным файлом, а точными версиями в самом файле
if [ -f "$DIR/requirements.txt" ]; then
  LOOSE=$(grep -nE '^[A-Za-z0-9_.-]+([[:space:]]*(>=|<=|>|<|~=|\^)|[[:space:]]*$)' "$DIR/requirements.txt" 2>/dev/null)
  if [ -n "$LOOSE" ]; then
    echo "$LOOSE" | sed 's|^|requirements.txt:|'
    echo "  почини: закрепи точные версии через ==, иначе сборка завтра соберёт другое."
    BAD=1
  fi
fi

exit $BAD
