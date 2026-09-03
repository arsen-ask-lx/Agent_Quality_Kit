#!/usr/bin/env bash
# Собирает факты о состоянии AQK — числами и прогонами, а не по памяти.
# Каждая строка вывода: МЕТКА|ЗНАЧЕНИЕ|АРБИТР (чем это доказано).
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
cd "$ROOT" || exit 1

say() { printf '%s|%s|%s\n' "$1" "$2" "$3"; }

# --- уровень ---
LVL=$(node tool/program.mjs doctor 2>/dev/null | sed -n 's/.*Уровень: AQK-\([0-9]\).*/\1/p' | head -1)
say "уровень AQK" "${LVL:-не достигнут}" "node tool/program.mjs doctor"

# --- проверки самого комплекта ---
if bash tool/selfcheck/smoke.sh >/dev/null 2>&1; then S=зелёная; else S=КРАСНАЯ; fi
say "проверка комплекта" "$S" "bash tool/selfcheck/smoke.sh"
if bash tool/selfcheck/gates.sh >/dev/null 2>&1; then G=зелёная; else G=КРАСНАЯ; fi
say "проверка гейтов" "$G" "bash tool/selfcheck/gates.sh"

# --- гейты ---
N=$(find kit/gates -mindepth 1 -maxdepth 1 -type d | wc -l)
COND=$(bash tool/selfcheck/gates.sh 2>/dev/null | grep -c 'условная')
say "гейтов в каталоге" "$N (условных: $COND)" "kit/gates/*/gate.yml"

NOSAMPLE=$(for d in kit/gates/*/; do [ -d "$d/red" ] && [ -d "$d/green" ] || basename "$d"; done | wc -l)
say "гейтов без образцов" "$NOSAMPLE" "наличие red/ и green/"

# --- объявленные гейты этого репозитория ---
DECL=$(awk '/^gates:/{g=1;next} /^[A-Za-z]/{g=0} g && /^[[:space:]]+[A-Za-z0-9_-]+:/' .aqk.yml | wc -l)
say "гейтов объявлено здесь" "$DECL" ".aqk.yml"

# --- журнал ---
# Шишка — раздел с названным классом отказа; вводные и списки работ не в счёт. Считаем разделы,
# а не строки: у одной шишки бывает две отметки, а в шапке журнала лежит образец записи, — и
# построчный подсчёт давал 23 при 21 шишке. Ровно та цифра, ради которой заведён этот сторож.
set -- $(awk '
  /^## /                  { flush(); inc=0; g=0; f=0; n=0 }
  /^\*\*Класс:\*\*/       { inc=1 }
  /^> ✅/                  { g=1 }
  /^> 🔧/                  { f=1 }
  /^> 👤/                  { n=1 }
  END                     { flush(); print I+0, G+0, F+0, N+0 }
  function flush() { if (inc) { I++; if (g) G++; else if (f) F++; else if (n) N++ } }
' incidents/README.md)
INC=$1; GATE=$2; FIX=$3; NEVER=$4
say "записей в журнале" "$INC" "incidents/README.md"
say "чем кончились" "✅ $GATE  🔧 $FIX  👤 $NEVER" "отметки решения; сторожит lesson-has-outcome"

# --- документация ---
DOCS=$(find kit/docs -name '*.md' | wc -l)
LINES=$(find kit/docs -name '*.md' -exec cat {} + | wc -l)
say "методичек" "$DOCS файлов, $LINES строк" "kit/docs"
BROKEN=$(bash kit/gates/entry-links-exist/check.sh kit/docs 2>/dev/null | grep -c 'никуда')
say "битых ссылок" "$BROKEN" "kit/gates/entry-links-exist"

# --- очередь работ ---
TODO=$(grep -c '^| [0-9]* | \*\*' ТЗ.md 2>/dev/null || echo 0)
say "несделанных пунктов" "$TODO" "ТЗ.md §9"
