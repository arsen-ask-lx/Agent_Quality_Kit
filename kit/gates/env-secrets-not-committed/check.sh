#!/usr/bin/env sh
# Файл окружения с настоящими значениями лежит в git: пароль, токен или ключ разошёлся со всеми
# клонами — и из истории его уже не вычистить.
#
# ЗАЧЕМ СВОЯ ПРОВЕРКА, если есть сканеры секретов. Замер 2026-09-11 на закоммиченном `.env`
# (research/competitors/agentlint.md): наш `secrets-not-in-code` узнаёт секрет только по формату
# поставщика (`sk_live_…`); `gitleaks` 8.30.1 — по формату и по ЭНТРОПИИ: случайную строку
# (`wN7rQ2vLx9Tp`, энтропия 3,6) он ловит, а пароль, придуманный человеком (`Sup3rS3cret2024`,
# `hunter2hunter2`), пропускает. У такого пароля нет ни формата, ни энтропии — его узнают
# только по ИМЕНИ ключа. `detect-secrets` 1.5.0 имя ключа читает и оба ловит, но `.env.local`
# не видит вовсе: такой файл личный по определению, что бы в нём ни лежало.
#
# ДВА ПРАВИЛА, и второе не шире, чем нужно.
#   1. `.env.local` и `.env.*.local` в git — находка всегда. Документация Vite: «.env.*.local
#      files are local-only and can contain sensitive variables. You should add `*.local` to your
#      `.gitignore`»; Next.js: «.env*.local are intended to be ignored through .gitignore».
#   2. Остальные `.env*` в git — находка, только если внутри ключ-секрет с НАСТОЯЩИМ значением.
#      Не любой `.env`: Next.js велит коммитить `.env.test`, во многих проектах на Vite
#      коммитят `.env` с публичными настройками, а зашифрованный `dotenvx` файл коммитить
#      рекомендует сам dotenv («Should I commit my .env file? No. Unless you encrypt it with
#      dotenvx»). Проверка «файл есть в git» без чтения значений врала бы на всех троих.
#
# ЗНАЧЕНИЕ НЕ ПЕЧАТАЕТСЯ. Вывод гейта попадает в лог конвейера; напечатать пароль значило бы
# завести вторую утечку ради сообщения о первой. Называются файл, строка и имя ключа.
DIR="${1:-.}"
# Существование файла проверяется ДО `.`: под dash неудачный `.` завершает скрипт немедленно, и
# запасная ветка не выполняется никогда (замерено 2026-09-08 на соседней записи).
SKIP_LIB="$(dirname "$0")/../_skip.sh"
if [ ! -f "$SKIP_LIB" ]; then
  echo "рядом с проверкой нет _skip.sh — обход не собран, проверка не состоялась"
  echo "  почини: скопируй гейт вместе с файлом kit/gates/_skip.sh, он общий на весь каталог"
  exit 2
fi
. "$SKIP_LIB"
if [ "${AQK_SKIP_READY:-}" != 1 ]; then
  echo "_skip.sh есть, но обход не собрался — проверка НЕ СОСТОЯЛАСЬ, а не прошла"
  echo "  почини: замени kit/gates/_skip.sh целым файлом из каталога"
  exit 2
fi

# Образцы (gates.sh) несут список отслеживаемых файлов в `.aqk-tracked`: вложенный .git внутри
# каталога комплекта создал бы embedded-репозиторий. В настоящем проекте спрашиваем git.
if [ -f "$DIR/.aqk-tracked" ]; then
  LIST=$(cat "$DIR/.aqk-tracked")
else
  if ! (cd "$DIR" 2>/dev/null && git rev-parse --git-dir >/dev/null 2>&1); then
    echo "не git-репозиторий — закоммитить сюда нечего"
    exit 0
  fi
  # core.quotePath=false: иначе путь с не-ASCII приходит в кавычках, и якорь «$» не совпадает.
  LIST=$(cd "$DIR" && git -c core.quotePath=false ls-files 2>/dev/null)
fi
LIST=$(printf '%s\n' "$LIST" | tr -d '\r')

# Кандидаты — файлы окружения по имени. Шаблоны (`.example`, `.sample`, `.template`, `.dist`) и
# каталоги заготовок и тестовых данных — не утечка: их кладут намеренно, чтобы скопировать.
# Замер на соседней записи: больше половины совпадений по имени были такими.
ENVS=$(printf '%s\n' "$LIST" \
  | grep -E '(^|/)\.env(\.[A-Za-z0-9_.-]+)?$' \
  | grep -vE '\.(example|sample|template|dist|schema)$' \
  | grep -vE '(^|/)(templates?|examples?|samples?|fixtures?|__fixtures__|testdata|test_data|dist)/' \
  | grep -vE '(^|/)kit/gates/[^/]+/(red|green)(/|$)' \
  || true)
if command -v own_samples_filter >/dev/null 2>&1 || type own_samples_filter >/dev/null 2>&1; then
  ENVS=$(printf '%s\n' "$ENVS" | own_samples_filter "$DIR" | grep -v '^$' || true)
fi
[ -z "$ENVS" ] && exit 0

# Секрет узнаётся по имени ключа и по значению. Ложные — это то, что в git класть МОЖНО:
#   · публичные по устройству переменные сборки (`NEXT_PUBLIC_`, `VITE_`, `REACT_APP_`, …) —
#     они и так уезжают в браузер;
#   · пустое значение, ссылка `${VAR}`/`$VAR`, заглушка (`changeme`, `<…>`, `your_…`);
#   · значения по умолчанию для локального стенда (`postgres`, `root`, `admin`, `guest`…) —
#     тот же пароль стоит в каждом docker-compose для разработки;
#   · зашифрованное `dotenvx` (`encrypted:…`); числа и логические (`TOKEN_TTL=86400`);
#   · короче восьми знаков — настоящий пароль короче почти не бывает, а «dev» и «x» бывают.
# Интервалы `{n}` в регулярках НЕ использовать: mawk из node:22-slim их не понимает, и две
# записи каталога однажды молчали на своих красных образцах ровно из-за этого.
# Построчно, а не `for F in $ENVS`: путь с пробелом развалился бы на части. Цикл в конвейере
# идёт в подоболочке, поэтому находки собираются в вывод, а не в переменную-флаг.
OUT=$(printf '%s\n' "$ENVS" | while IFS= read -r F; do
  BASE=${F##*/}
  case "$BASE" in
    .env.local|.env.*.local)
      # В каталоге тестов и демо-приложений `.env.local` — фикстура: библиотека показывает или
      # проверяет, что умеет его читать. Замер 2026-09-11: `tests/.env.local` у motdotla/dotenv
      # и `playgrounds/*/.env.local` у инструментов для Next.js — обе находки ложные. Правило 2
      # (настоящий пароль внутри) там действует: утечка в тестах остаётся утечкой.
      if printf '%s\n' "$F" | grep -qE '(^|/)(tests?|__tests__|specs?|playgrounds?|demos?)/'; then :; else
        echo "$F: личный файл окружения отслеживается git — «.local» по определению только для этой машины"
        continue
      fi ;;
    # Next.js: «.env.test file should be included in your repository».
    .env.test|.env.testing) continue ;;
  esac
  [ -f "$DIR/$F" ] || continue
  HITS=$(tr -d '\r' < "$DIR/$F" | awk '
    function placeholder(v, l) {
      l = tolower(v)
      if (l == "") return 1
      if (l ~ /^encrypted:/) return 1
      if (l ~ /^\$/) return 1
      if (l ~ /^<.*>$/) return 1
      if (l ~ /^(your|example|dummy|placeholder|replace|change)[-_ a-z0-9]*$/) return 1
      if (l ~ /^(changeme|todo|none|null|secret|password|test|dev|development|local|localhost)$/) return 1
      if (l ~ /^(postgres|mysql|root|admin|guest|redis|minioadmin|user|pass)$/) return 1
      if (l ~ /^x+$/ || l ~ /^\*+$/ || l ~ /^\.+$/) return 1
      if (l ~ /^[0-9]+$/ || l ~ /^(true|false|yes|no|on|off)$/) return 1
      return 0
    }
    /^[ \t]*#/ || /^[ \t]*$/ { next }
    {
      line = $0
      sub(/^[ \t]*export[ \t]+/, "", line)
      eq = index(line, "=")
      if (eq == 0) next
      key = substr(line, 1, eq - 1); val = substr(line, eq + 1)
      gsub(/^[ \t]+|[ \t]+$/, "", key); gsub(/^[ \t]+|[ \t]+$/, "", val)
      sub(/[ \t]+#.*$/, "", val)
      if (val ~ /^".*"$/ || val ~ /^\047.*\047$/) val = substr(val, 2, length(val) - 2)
      k = toupper(key)
      if (k ~ /^(NEXT_PUBLIC_|VITE_|REACT_APP_|PUBLIC_|EXPO_PUBLIC_|NUXT_PUBLIC_|GATSBY_)/) next
      # Пароль внутри адреса: схема://пользователь:пароль@хост.
      if (match(val, /:\/\/[^\/:@ ]+:[^\/@ ]+@/)) {
        cred = substr(val, RSTART + 3, RLENGTH - 4); pw = substr(cred, index(cred, ":") + 1)
        if (!placeholder(pw)) { print NR ": " key " — пароль внутри адреса"; next }
      }
      if (k !~ /(PASSWORD|PASSWD|SECRET|TOKEN|API_?KEY|PRIVATE_?KEY|ACCESS_?KEY|CREDENTIAL)/) next
      if (placeholder(val) || length(val) < 8) next
      print NR ": " key " — похоже на настоящее значение"
    }')
  [ -n "$HITS" ] && printf '%s\n' "$HITS" | sed "s|^|$F:|; s|\$| (само значение не печатаю)|"
done)

[ -z "$OUT" ] && exit 0
printf '%s\n' "$OUT"
echo "  почини: git rm --cached <файл> и добавь его в .gitignore; в git оставь .env.example с пустыми"
echo "  значениями. И смени эти пароли и ключи: из истории git их уже не вычистить."
exit 1
