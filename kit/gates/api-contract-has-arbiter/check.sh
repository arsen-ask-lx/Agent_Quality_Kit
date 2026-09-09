#!/usr/bin/env sh
# Спецификация API лежит — а держит ли её кто-нибудь.
#
# ЗАЧЕМ ИМЕННО ЭТО. `openapi.yaml` — обещание чужому коду: вот поля, вот типы, вот что
# обязательно. Обещание, которое никто не сверяет с сервером, расходится с ним молча и
# обнаруживается у потребителя. Это наш центральный класс, только на уровне API.
#
# ЗАМЕР, ИЗ КОТОРОГО ВЗЯЛАСЬ ЗАПИСЬ (2026-09-09). Стенд: сервер врёт в каждом поле ответа —
# `id` строкой вместо числа, обязательного `email` нет вовсе, `created_at` не дата. Пятисоток
# при этом нет, коды ответа честные. Кто что сказал:
#   spectral (spectral:oas)              -> код 0, три замечания: нет контакта, описания, тегов
#   schemathesis, умолчания              -> код 1, три нарушения схемы в ответах
#   schemathesis -c not_a_server_error   -> код 0, «18 из 18 прошли»
# Отсюда обе красные ветки этой проверки: держать спецификацию некому — и держать поручено
# тому, кто по построению не может покраснеть.
DIR="${1:-.}"
SKIP_LIB="$(dirname "$0")/../_skip.sh"
if [ ! -f "$SKIP_LIB" ]; then
  echo "рядом с проверкой нет _skip.sh — обход не собран, проверка не состоялась"
  echo "  почини: скопируй гейт вместе с файлом kit/gates/_skip.sh, он общий на весь каталог"
  exit 2
fi
. "$SKIP_LIB"

# --- есть ли договор ----------------------------------------------------------
# По имени файла, а не по расположению: спецификацию кладут в корень, в `docs/`, рядом с
# приложением. Расширение обязательно разбираемое — `openapi.md` это рассказ о договоре.
# `-print` в конце ОБЯЗАТЕЛЕН. Без него действие по умолчанию применяется ко всему выражению,
# и ветка `-prune -o` печатает сами обойдённые каталоги: в списке спецификаций оказывались
# `./.git` и `./.aqk`. Найдено аудитом фич 2026-09-09, образцами не ловилось.
SPECS=$(find "$DIR" $(skip_find) -type f \
  \( -iname 'openapi*.yaml' -o -iname 'openapi*.yml' -o -iname 'openapi*.json' \
  -o -iname 'swagger*.yaml' -o -iname 'swagger*.yml' -o -iname 'swagger*.json' \
  -o -iname 'asyncapi*.yaml' -o -iname 'asyncapi*.yml' -o -iname 'asyncapi*.json' \) \
  -print 2>/dev/null | own_samples_filter "$DIR" | grep -v '^$')
[ -z "$SPECS" ] && { echo "спецификации API здесь нет — эта проверка не про тебя"; exit 0; }

# --- кто её держит ------------------------------------------------------------
# Четыре семьи держателей, и они отвечают на РАЗНЫЕ вопросы — подробности в README:
#   сверка с сервером  schemathesis, dredd, portman, newman, pact — «документ не врёт»
#   линт документа     spectral, redocly, vacuum, openapi-spec-validator, swagger-cli
#   ломающие правки    oasdiff — «вчерашний клиент переживёт сегодняшний выпуск»
#   потребитель        openapi-typescript, orval, oapi-codegen, openapi-generator, kubb —
#                      типы порождены договором, и расхождение ломает сборку
HOLDERS='schemathesis|dredd|portman|newman[[:space:]]+run|pact-broker|pact-verifier|can-i-deploy|spectral[[:space:]]+lint|redocly[[:space:]]+(lint|bundle)|vacuum[[:space:]]+(lint|report|html-report)|openapi-spec-validator|swagger-cli|oasdiff|openapi-typescript|orval|oapi-codegen|openapi-generator|kubb'
# Ищем в том, что ЗАПУСКАЮТ: конвейер, оболочечные скрипты, сборочные файлы, объявления пакета
# и манифест самого комплекта. Не в коде: упоминание инструмента в исходнике — не его запуск.
FOUND=$(grep -rnE "$HOLDERS" $(skip_grep) \
  --include=*.yml --include=*.yaml --include=*.sh --include=*.json --include=*.toml \
  --include=*.ini --include=*.cfg --include=*.mk --include=Makefile --include=Justfile \
  --include=justfile --include=Taskfile.yml --include=*.gradle --include=Jenkinsfile \
  "$DIR" 2>/dev/null | own_samples_filter "$DIR" | grep -v '^$')

# ОПРЕДЕЛЕНИЕ ЗАПИСИ КАТАЛОГА — НЕ НАХОДКА, и это касается не только своей записи. Соседняя
# запись `ci-actually-fails` держит в своём `check.sh` строку со списком запускалок, где
# перечислены все инструменты про API разом. Проверка находила её и решала, что спецификацию
# кто-то держит: договор не держал никто, а гейт был ЗЕЛЁНЫМ.
#
# Найдено аудитом фич 2026-09-09 — прогоном на настоящем проекте, а не образцами: красный и
# зелёный образцы лежат по одному, а в проекте записи стоят рядом. Признак определения взят
# самый надёжный: в той же папке лежит `gate.yml`.
FOUND=$(printf '%s\n' "$FOUND" | while IFS= read -r L; do
  F="${L%%:*}"
  [ -n "$F" ] || continue
  [ -f "$(dirname "$F")/gate.yml" ] && continue
  printf '%s\n' "$L"
done | grep -v '^$')

if [ -z "$FOUND" ]; then
  printf '%s\n' "$SPECS" | sed 's/$/: спецификацию не держит ни одна команда/'
  echo "  почини: заведи арбитра, который краснеет, когда сервер ушёл от договора —"
  echo "  «schemathesis run openapi.yaml --url <адрес>» в конвейере. Линтер спецификации"
  echo "  (spectral, redocly, vacuum) этого НЕ заменяет: он читает документ, а не сервер,"
  echo "  и на сервере, который врёт в каждом поле, остаётся зелёным."
  exit 1
fi

# --- держит, но провалиться не может -------------------------------------------
# `--checks not_a_server_error` (и короткое `-c`) оставляет от арбитра одну проверку: «не
# пятисотка». На замере выше это ровно код 0 при сервере, который врёт в каждом поле. Умолчание
# у schemathesis — ВСЕ проверки разом, поэтому такое сужение это не настройка, а отключение.
# КАК ОБЕЗВРЕЖЕН АРБИТР — вопрос к ОБЪЯВЛЕНИЮ запуска, а не к любому файлу, где эта строка
# встретилась. Граница взята не отсюда: `ci-actually-fails` уже проводит её теми же словами —
# «провал, погашенный внутри скрипта, это логика скрипта, а не конфиг конвейера». Внутри
# оболочечного скрипта вердикт решают `set -e`, `trap` и явный `exit`, и по одной строке о нём
# судить нельзя.
#
# Поймано на себе в тот же день: наш `smoke.sh` держит образцы нарушений в heredoc — и новая
# запись покраснела на собственном наборе проверок. Одна из трёх находок была вообще в
# КОММЕНТАРИИ, поясняющем замер; отсюда же `drop_comments`.
RUNS=$(printf '%s\n' "$FOUND" | grep -E '\.(ya?ml|toml|json|mk|gradle):|/(Makefile|Justfile|justfile|Jenkinsfile):' | drop_comments)

NARROW=$(printf '%s\n' "$RUNS" | grep -E '(-c|--checks)[[:space:]=]+not_a_server_error([[:space:]]|$|")')

# Вторая форма того же: `oasdiff breaking` БЕЗ `--fail-on`. Замер 2026-09-09 на паре
# спецификаций, где из ответа убрано обязательное поле: инструмент печатает
# «1 changes: 1 error … removed the required property `email`» — и выходит с НУЛЁМ. С
# `--fail-on ERR` на той же паре код 1, а на паре без ломающих изменений снова 0.
# Вывод громкий и красный на вид, конвейер зелёный — самая коварная форма молчания.
#
# Форма `uses: oasdiff/oasdiff-action/...` не считается находкой: действие роняет прогон само.
# Подкоманда `changelog` тоже: она затем и нужна, чтобы напечатать, а не уронить.
LOUD=$(printf '%s\n' "$RUNS" | grep -E 'oasdiff[[:space:]]+breaking' | grep -v 'oasdiff-action' | grep -v -- '--fail-on')

if [ -n "$NARROW$LOUD" ]; then
  [ -z "$NARROW" ] || printf '%s\n' "$NARROW" | sed 's/$/  <- арбитр сужен до «не пятисотка»/'
  [ -z "$LOUD" ] || printf '%s\n' "$LOUD" | sed 's/$/  <- печатает ломающие изменения и выходит с нулём/'
  [ -z "$NARROW" ] || {
    echo "  почини: убери «--checks not_a_server_error» — у schemathesis по умолчанию включены"
    echo "  ВСЕ проверки, включая response_schema_conformance. Сужение до одной оставляет"
    echo "  зелёный прогон на сервере, который врёт в каждом поле ответа."
  }
  [ -z "$LOUD" ] || echo "  почини: добавь «--fail-on ERR» — без него oasdiff печатает находки и выходит с нулём."
  echo "  провал, погашенный «|| true» или «continue-on-error», — это ci-actually-fails."
  exit 1
fi
exit 0
