#!/usr/bin/env sh
# Коммит без мини-отчёта — риск того же класса, что несоответствие спеки коду: диффом можно
# проверить реализацию, но не то, понял ли автор замысел. Отчёт — дешёвый артефакт, который
# оставляет след для человека, читающего историю позже.
DIR="${1:-.}"

# Образцы (gates.sh) читают тело коммита из файла — реальный git log там взять неоткуда, а
# вложенный .git внутри каталога комплекта сам по себе создал бы embedded-репозиторий.
# В настоящем проекте COMMIT_MSG не бывает — читается последний реальный коммит.
if [ -f "$DIR/COMMIT_MSG" ]; then
  MSG=$(cat "$DIR/COMMIT_MSG")
else
  if ! (cd "$DIR" 2>/dev/null && git rev-parse --git-dir >/dev/null 2>&1); then
    echo "не git-репозиторий — проверять нечего"
    exit 0
  fi
  MSG=$(cd "$DIR" && git log -1 --format=%B 2>/dev/null)

  # Коммит, который трогает только журнал, отчёта в теле не требует: сама запись и есть отчёт,
  # причём подробнее — и её сторожит `lesson-has-outcome`. Иначе гейт воюет с командой `note`,
  # которая коммитит запись сама. Путь журнала берётся из манифеста, а не угадывается.
  LESSONS=$(sed -n 's/^lessons:[[:space:]]*//p' "$DIR/.aqk.yml" 2>/dev/null | head -1 | tr -d '"'"'"' \r')
  [ -z "$LESSONS" ] && LESSONS="incidents"
  case "$LESSONS" in http*) LESSONS="" ;; esac   # journal по адресу, а не путём — не применимо
  if [ -n "$LESSONS" ]; then
    FILES=$(cd "$DIR" && git show --pretty=format: --name-only HEAD 2>/dev/null | grep -v '^$')
    if [ -n "$FILES" ]; then
      OUTSIDE=$(printf '%s\n' "$FILES" | grep -v "^$LESSONS/" | grep -v "^$LESSONS\$")
      if [ -z "$OUTSIDE" ]; then
        echo "коммит трогает только журнал ($LESSONS) — запись и есть отчёт"
        exit 0
      fi
    fi
  fi
fi
[ -z "$MSG" ] && { echo "нет ни одного коммита — проверять нечего"; exit 0; }

MISSING=""
printf '%s\n' "$MSG" | grep -q "^Сделано:" || MISSING="$MISSING «Сделано:»"
printf '%s\n' "$MSG" | grep -q "^Не уверен:" || MISSING="$MISSING «Не уверен:»"

if [ -n "$MISSING" ]; then
  echo "последний коммит без мини-отчёта — не хватает:$MISSING"
  echo "  почини: допиши в тело коммита короткие разделы Сделано: / Не уверен: —"
  echo "  не пересказ диффа, а что понял и в чём сомневаешься."
  exit 1
fi
exit 0
