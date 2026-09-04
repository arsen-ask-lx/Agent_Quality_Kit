#!/usr/bin/env sh
# Ищет одинаковые блоки по восемь строк. Мера грубая — совпадение байт в байт после снятия
# отступов, — но именно так размножается код, который агент копирует из соседнего файла.
#
# ЗАЧЕМ. Дубль опаснее длины: правку вносят в одну копию из четырёх, три остаются со старым
# поведением, и расхождение всплывает через недели в другом месте.
DIR="${1:-.}"
. "$(dirname "$0")/../_skip.sh" 2>/dev/null || SKIP_NAMES=".git .aqk node_modules .venv"
WIN="${AQK_DUP_LINES:-8}"

# Тесты исключены намеренно. Повтор в тестах часто осознанный: читаемость там важнее сухости,
# и три похожих теста лучше одного хитрого. Случай «три однотипных — свести в один с набором
# входов» решается глазами по правилам тестирования, а не этим гейтом. На живом проекте все
# двадцать находок были в тестах — гейт, который краснеет только на них, выключат.
TESTS="-name test -prune -o -name tests -prune -o -name spec -prune -o -name __tests__ -prune -o"

# shellcheck disable=SC2046
find "$DIR" $(skip_find "$DIR") $TESTS -type f \
     ! -name 'test_*' ! -name '*_test.*' ! -name '*.test.*' ! -name '*.spec.*' \
     -print 2>/dev/null | only_code | own_samples_filter "$DIR" \
  | while IFS= read -r F; do is_generated "$F" || printf '%s\n' "$F"; done \
  | xargs -r awk -v WIN="$WIN" '
      FNR == 1 { n = 0; delete buf }
      {
        line = $0
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", line)
        if (line == "" || line ~ /^([#]|\/\/)/) next     # пустые и комментарии не считаем
        buf[++n] = line
        if (n >= WIN) {
          key = ""
          for (i = n - WIN + 1; i <= n; i++) key = key buf[i] "\x1e"
          if (key in seen && seen[key] != FILENAME ":" (FNR - WIN + 1)) {
            print seen[key] " и " FILENAME ":" (FNR - WIN + 1) ": одинаковые " WIN " строк"
          } else if (!(key in seen)) {
            seen[key] = FILENAME ":" (FNR - WIN + 1)
          }
        }
      }
    ' 2>/dev/null | sort -u \
  | awk -F' и |: ' '
      # Один повторённый кусок даёт столько сообщений, на сколько окон он делится: восемь
      # строк — восемь почти одинаковых строк отчёта. Схлопываем в одну на пару файлов.
      { split($1, a, ":"); split($2, b, ":"); pair = a[1] " и " b[1]
        if (!(pair in seen)) { seen[pair] = $1 " и " $2 }
        cnt[pair]++ }
      END { for (p in seen) print seen[p] ": одинаковый кусок" (cnt[p] > 1 ? " (окон: " cnt[p] ")" : "") }
    ' | sort > /tmp/.dup.$$

if [ -s /tmp/.dup.$$ ]; then
  head -20 /tmp/.dup.$$
  N=$(wc -l < /tmp/.dup.$$); [ "$N" -gt 20 ] && echo "  … и ещё $((N - 20))"
  rm -f /tmp/.dup.$$
  echo "  почини: вынеси общее в одно место. Правку вносят в одну копию из четырёх —"
  echo "  остальные остаются со старым поведением, и это всплывает не сразу и не здесь."
  exit 1
fi
rm -f /tmp/.dup.$$
exit 0
