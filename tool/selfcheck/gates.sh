#!/usr/bin/env bash
# tool/selfcheck/gates.sh — проверка записей каталога. Это фильтр на входе: запись, чей
# арбитр не краснеет на красном образце или не молчит на зелёном, в каталог не
# попадает. Отбор делает машина, а не внимательность рецензента, — иначе каталог
# за полгода превращается в свалку правдоподобных утверждений.
#
#   bash tool/selfcheck/gates.sh

set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CAT="$ROOT/kit/gates"
PASS=0; FAIL=0; WARN=0; UNVERIFIED=0

ok()   { printf '  \033[32m✔\033[0m  %s\n' "$1"; PASS=$((PASS+1)); }
bad()  { printf '  \033[31m✘\033[0m  %s\n' "$1"; FAIL=$((FAIL+1)); }
warn() { printf '  \033[33m!\033[0m  %s\n' "$1"; WARN=$((WARN+1)); }
# «Условная запись» и «нечем проверить здесь» — разные состояния, и счётчики разные.
skip() { printf '  \033[33m~\033[0m  %s\n' "$1"; UNVERIFIED=$((UNVERIFIED+1)); }

field() { sed -n "s/^$2:[[:space:]]*\(.*\)$/\1/p" "$1" | head -1; }

printf '\n\033[1mtool/selfcheck/gates.sh\033[0m\n\n'
[ -d "$CAT" ] || { echo "  каталога гейтов нет"; exit 1; }

for GATE in "$CAT"/*/; do
  SLUG="$(basename "$GATE")"
  YML="$GATE/gate.yml"

  [ -f "$YML" ] || { bad "$SLUG: нет gate.yml"; continue; }

  # --- обязательные поля -----------------------------------------------------
  INTENT="$(field "$YML" intent)"
  PROOF="$(field "$YML" proof)"
  [ -n "$INTENT" ] || bad "$SLUG: пустое поле intent — по нему идёт дедупликация"

  # Заготовка от `aqk new` не должна проехать как запись: незаполненный гейт — мёртвое
  # правило, а мёртвое правило учит игнорировать и живые.
  if grep -q 'ЗАПОЛНИ' "$YML" "$GATE/README.md" "$GATE/check.sh" 2>/dev/null; then
    bad "$SLUG: заготовка не заполнена — остались метки ЗАПОЛНИ"
    continue
  fi
  [ -n "$PROOF" ]  || bad "$SLUG: пустое поле proof — «это хорошая практика» не принимается"
  grep -q '^trigger:' "$YML" || bad "$SLUG: нет trigger — запись показывалась бы всем подряд"

  # Два раздела README обязательны нормой каталога. Пока их не проверяла машина, четыре записи
  # из четырнадцати жили без раздела про готовый аналог и четыре — без «чего НЕ ловит».
  # Правило нормы, за которым не следит машина, — это пожелание.
  grep -qiE 'готовы(й аналог|й инструмент|е правил)|готового аналога' "$GATE/README.md" 2>/dev/null \
    || bad "$SLUG: в README нет раздела про готовый аналог — «не искал» и «нет» разные утверждения"
  grep -qiE 'чего НЕ ловит' "$GATE/README.md" 2>/dev/null \
    || bad "$SLUG: в README нет раздела «чего НЕ ловит» — граница записи обязана быть названа"

  case "$PROOF" in
    *incidents/*) : ;;
    *) warn "$SLUG: доказательство не ссылается на журнал шишек — запись условная" ;;
  esac

  # --- образцы ---------------------------------------------------------------
  # Проверяем переносимым рецептом, если он есть. Если его нет — берём первый рецепт под язык,
  # чью программу видно в системе: запись, которой нужен готовый инструмент, законна (правило
  # «сперва готовое»), но проверить её можно только там, где инструмент стоит.
  RECIPE="$(sed -n 's/^[[:space:]]*any:[[:space:]]*\(.*\)$/\1/p' "$YML" | head -1)"
  if [ -z "$RECIPE" ]; then
    # Каким рецептом написаны образцы — говорит сама запись. Угадывать нельзя: в системе может
    # стоять npx, и питоновские образцы поедут проверяться фронтовым инструментом. Так и вышло.
    FOR="$(sed -n 's/^samples_for:[[:space:]]*\(.*\)$/\1/p' "$YML" | head -1)"
    if [ -z "$FOR" ]; then
      bad "$SLUG: нет ни рецепта any, ни поля samples_for — нечем проверить образцы"
      continue
    fi
    RECIPE="$(sed -n "s/^[[:space:]]*$FOR:[[:space:]]*\(.*\)\$/\1/p" "$YML" | head -1)"
    if [ -z "$RECIPE" ]; then
      bad "$SLUG: samples_for указывает на «$FOR», а такого рецепта нет"
      continue
    fi
    PROG="$(printf '%s' "$RECIPE" | awk '{print $1}')"
    if ! command -v "$PROG" >/dev/null 2>&1; then
      skip "$SLUG: НЕ ПРОВЕРЕНА здесь — нужен «$PROG»"
      continue
    fi
  fi
  if [ ! -d "$GATE/red" ] || [ ! -d "$GATE/green" ]; then
    bad "$SLUG: нет красного или зелёного образца"; continue
  fi

  # Прогон арбитра по образцу. Возвращаем и код, и вывод: код возврата в одиночку
  # обманчив — отсутствующий скрипт тоже даёт ненулевой код, и «гейт покраснел»
  # неотличимо от «гейта нет». Урок audit_project 2026-08-27, п. 11.
  probe() {
    local cmd; cmd="$(echo "$RECIPE" | sed "s|{gate}|$GATE|; s|{dir}|$1|")"
    OUT="$(eval "$cmd" 2>&1)"; CODE=$?
  }

  probe "$GATE/red";   RED_CODE=$CODE; RED_OUT="$OUT"
  probe "$GATE/green"; GRN_CODE=$CODE; GRN_OUT="$OUT"

  if [ "$RED_CODE" -eq 127 ] || [ "$GRN_CODE" -eq 127 ]; then
    bad "$SLUG: арбитр не запускается — команда не найдена"
  elif [ "$RED_CODE" -eq 0 ]; then
    bad "$SLUG: арбитр промолчал на КРАСНОМ образце — гейт не ловит брак"
  elif [ -z "$RED_OUT" ]; then
    bad "$SLUG: арбитр покраснел на красном молча — по коду возврата не видно, ту ли поломку он нашёл"
  elif [ "$GRN_CODE" -ne 0 ]; then
    bad "$SLUG: арбитр покраснел на ЗЕЛЁНОМ образце — гейт ругается на исправный код"
  else
    ok "$SLUG"
  fi
done

printf '\n'
if [ "$FAIL" -eq 0 ]; then
  printf '  \033[32mзаписей принято: %s\033[0m' "$PASS"
else
  printf '  \033[31mотклонено: %s из %s\033[0m' "$FAIL" "$((PASS+FAIL))"
fi
[ "$WARN" -gt 0 ] && printf '  \033[33m(условных: %s)\033[0m' "$WARN"
[ "$UNVERIFIED" -gt 0 ] && printf '  \033[33m(не проверено здесь: %s)\033[0m' "$UNVERIFIED"
printf '\n\n'
exit "$FAIL"
