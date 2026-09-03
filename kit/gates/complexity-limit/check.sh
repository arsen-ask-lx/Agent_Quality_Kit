#!/usr/bin/env sh
# Грубая мера сложности: глубина вложенности. Это НЕ замена цикломатической сложности —
# готовые правила считают ветвления и инструкции и делают это точнее. Здесь запасной вариант
# для стеков, где готового инструмента нет.
#
# ЗАЧЕМ ВООБЩЕ. 29 ветвлений в одной функции — это код, который никто не держит в голове
# целиком: ни человек, ни агент. Агент в таком месте начинает переписывать вместо правки.
DIR="${1:-.}"
. "$(dirname "$0")/../_skip.sh" 2>/dev/null || SKIP_NAMES=".git .aqk node_modules .venv"
MAX="${AQK_MAX_DEPTH:-5}"

# shellcheck disable=SC2046
find "$DIR" $(skip_find "$DIR") -type f \
     \( -name '*.py' -o -name '*.js' -o -name '*.jsx' -o -name '*.ts' -o -name '*.tsx' \
        -o -name '*.go' -o -name '*.rb' -o -name '*.java' -o -name '*.cs' -o -name '*.php' \) \
     -print 2>/dev/null \
  | while IFS= read -r F; do is_generated "$F" || printf '%s\n' "$F"; done \
  | xargs -r awk -v MAX="$MAX" '
        # Один обход на все файлы: процесс на каждый файл дал 19 секунд на 4000 файлов.
        # Разметка вложена по природе: пять уровней тегов — это не сложная логика, а обычная
        # вёрстка. Меряя её тем же пределом, гейт краснеет на нормальном коде и его выключают.
        function limit() { return (wf ~ /\.(jsx|tsx|vue|svelte)$/) ? MAX + 3 : MAX }
        function flush() { if (worst > limit()) print wf ":" wl ": вложенность " worst ", предел " limit() }
        FNR == 1 { flush(); worst = 0; wl = 0; wf = FILENAME }
        /^[[:space:]]*$/ { next }
        {
          # ширина отступа: табуляция считается за четыре пробела
          line = $0; n = 0
          while (match(line, /^[ \t]/)) {
            n += (substr(line, 1, 1) == "\t") ? 4 : 1
            line = substr(line, 2)
          }
          depth = int(n / 4)
          if (depth > worst) { worst = depth; wl = FNR }
        }
        END { flush() }
      ' > /tmp/.cplx.$$ 2>/dev/null

if [ -s /tmp/.cplx.$$ ]; then
  cat /tmp/.cplx.$$; rm -f /tmp/.cplx.$$
  echo "  почини: выдели вложенные ветки в отдельные функции или выйди раньше."
  echo "  такой код не держат в голове целиком — ни человек, ни агент; агент начинает"
  echo "  переписывать его вместо правки."
  exit 1
fi
rm -f /tmp/.cplx.$$
exit 0
