#!/usr/bin/env sh
# Ищет одинаковые блоки по восемь строк. Мера грубая — совпадение байт в байт после снятия
# отступов, — но именно так размножается код, который агент копирует из соседнего файла.
#
# ЗАЧЕМ. Дубль опаснее длины: правку вносят в одну копию из четырёх, три остаются со старым
# поведением, и расхождение всплывает через недели в другом месте.
DIR="${1:-.}"
. "$(dirname "$0")/../_skip.sh" 2>/dev/null || SKIP_NAMES=".git .aqk node_modules .venv"
WIN="${AQK_DUP_LINES:-8}"

# shellcheck disable=SC2046
find "$DIR" $(skip_find "$DIR") -type f \
     \( -name '*.py' -o -name '*.js' -o -name '*.jsx' -o -name '*.ts' -o -name '*.tsx' \
        -o -name '*.go' -o -name '*.rb' -o -name '*.java' -o -name '*.cs' -o -name '*.php' \) \
     -print 2>/dev/null \
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
    ' 2>/dev/null | sort -u > /tmp/.dup.$$

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
