#!/usr/bin/env bash
# Замер по корпусу: что говорит `test-not-adjusted` на каждом случае.
#
# Три числа считаются РАЗДЕЛЬНО, и это главное в замере:
#   пойман        — красный случай стал красным;
#   назван        — красный случай оставлен зелёным, НО гейт напечатал строку о находке. Это
#                   отдельное состояние, а не разновидность пропуска: решение «не ронять» принято
#                   по замеру цены (см. policy.py), и молчания здесь нет. Сливать его с пропуском
#                   значит мерить не то, что происходит;
#   ПРОПУЩЕН      — красный случай стал зелёным И гейт не сказал ничего;
#   ЛОЖНОЕ ОБВИНЕНИЕ — зелёный случай стал красным (законная работа заблокирована).
# Сливать второе с третьим нельзя: пропуск оставляет гейт бесполезным, ложное обвинение
# заставляет его ВЫКЛЮЧИТЬ, и тогда пропущено будет всё.
#
# Запуск: bash measure.sh [каталог-корпуса]   (по умолчанию — временный)
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../../.." && pwd)"
GATE="$ROOT/kit/gates/test-not-adjusted/check.sh"
CORPUS="${1:-$(mktemp -d)}"

python3 "$HERE/build.py" "$CORPUS" >/dev/null || exit 2

printf '%-34s %-8s %-6s %s\n' СЛУЧАЙ ОЖИДАЕМ КОД ИТОГ
caught=0; named=0; missed=0; false_acc=0; correct_silence=0; broke=0
for d in "$CORPUS"/*/; do
  name=$(basename "$d")
  [ -d "$d/before" ] || continue
  expect=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))[sys.argv[2]]['expect'])" "$CORPUS/cases.json" "$name")
  out=$(bash "$GATE" "$d" 2>&1); code=$?
  case "$expect:$code" in
    red:1)   verdict="пойман";            caught=$((caught+1));;
    red:0)   if printf '%s' "$out" | grep -qi 'почини'; then
               verdict="назван"; named=$((named+1))
             else verdict="ПРОПУЩЕН"; missed=$((missed+1)); fi;;
    green:0) verdict="молчит верно";      correct_silence=$((correct_silence+1));;
    green:1) verdict="ЛОЖНОЕ ОБВИНЕНИЕ";  false_acc=$((false_acc+1));;
    *)       verdict="НЕ СОСТОЯЛАСЬ";     broke=$((broke+1));;
  esac
  printf '%-34s %-8s %-6s %s\n' "$name" "$expect" "$code" "$verdict"
  [ "$verdict" = "ПРОПУЩЕН" ] || [ "$verdict" = "ЛОЖНОЕ ОБВИНЕНИЕ" ] || [ "$verdict" = "НЕ СОСТОЯЛАСЬ" ] &&
    printf '%s\n' "$out" | sed 's/^/      /'
done

echo
echo "пойман: $caught · назван: $named · ПРОПУЩЕН: $missed · молчит верно: $correct_silence · ЛОЖНОЕ ОБВИНЕНИЕ: $false_acc · не состоялась: $broke"
echo "корпус: $CORPUS"
