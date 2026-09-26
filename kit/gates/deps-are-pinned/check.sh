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
    # Строки склеиваются до поиска: в обычном, отформатированном файле первая зависимость стоит
    # на новой строке, и поиск по одной строке принимал его за «зависимостей нет» — без
    # lock-файла гейт молчал. Аудит 2026-09-09 это назвал, а красный образец был написан в той
    # единственной форме, которую гейт ловил, и дефект дожил до 2026-09-26 (deps-pinned.test.mjs).
    package.json)  tr -d '\r\n' < "$DIR/$1" | grep -qE '"(dependencies|devDependencies|peerDependencies)"[[:space:]]*:[[:space:]]*\{[[:space:]]*"' ;;
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
# requirements.txt считается закреплением для pyproject.toml наравне с файлами блокировки:
# закрепляют не только poetry и uv. Замер по httpx: инструменты там закреплены до патча
# прямо в requirements.txt, а гейт требовал ещё и poetry.lock, которого в этом укладе не
# бывает вовсе. Файл засчитывается только если он сам проходит проверку ниже — иначе
# «есть requirements.txt» стало бы способом обойти гейт пустым файлом.
need pyproject.toml poetry.lock uv.lock pdm.lock requirements.txt
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

# Lock-файл, который конвейер выключил, ничего не закрепляет. У pnpm в CI соблюдение включено
# по умолчанию («For CI: true, if a lockfile is present», pnpm.io/cli/install), поэтому беда — только
# явный отказ флагом. Замер 2026-09-26: из 20 чужих конвейеров с этим флагом в 20 он стоит в
# команде установки при pnpm-lock.yaml в корне; у zizmor такой проверки нет. Строки-комментарии
# и выключенные файлы (*.disabled) не считаются: их никто не запускает.
if [ -f "$DIR/pnpm-lock.yaml" ] && [ -d "$DIR/.github/workflows" ]; then
  for WF in "$DIR"/.github/workflows/*.yml "$DIR"/.github/workflows/*.yaml; do
    [ -f "$WF" ] || continue
    HIT=$(tr -d '\r' < "$WF" | grep -nE -- '--no-frozen-lockfile|--frozen-lockfile=false' | grep -vE '^[0-9]+:[[:space:]]*#')
    if [ -n "$HIT" ]; then
      REL=".github/workflows/$(basename "$WF")"
      printf '%s\n' "$HIT" | sed "s|^\([0-9]*\):.*|$REL:\1: конвейер выключает pnpm-lock.yaml — ставит не те версии, что закреплены|"
      echo "  почини: убери --no-frozen-lockfile; если lock-файл разошёлся с package.json, обнови его командой pnpm install и закоммить."
      BAD=1
    fi
  done
fi

exit $BAD
