#!/usr/bin/env sh
# Пределы: прод-код 500 строк, компонент интерфейса 300, тест 800.
#
# ЗАЧЕМ. Агент теряется в больших файлах и начинает переписывать вместо правки. И растут они
# не по замыслу: каждую новую фичу дописывают в тот же файл, потому что агенту так ближе по
# контексту. Числа спорные — важно, что предел существует и его считает машина.
DIR="${1:-.}"
. "$(dirname "$0")/../_skip.sh" 2>/dev/null || SKIP_NAMES=".git .aqk node_modules .venv"

# Один обход и один wc на все файлы разом: на проекте в 36 тысяч файлов цикл с wc на каждый
# не укладывался в две минуты.
# shellcheck disable=SC2046
find "$DIR" $(skip_find "$DIR") -type f \
     \( -name '*.py' -o -name '*.js' -o -name '*.jsx' -o -name '*.ts' -o -name '*.tsx' \
        -o -name '*.go' -o -name '*.rb' -o -name '*.java' -o -name '*.cs' -o -name '*.php' \
        -o -name '*.rs' -o -name '*.vue' \) -print 2>/dev/null \
  | xargs -r wc -l 2>/dev/null \
  | awk '
      $2 == "total" { next }
      {
        n = $1; f = $2
        limit = 500; kind = "прод-код"
        if (f ~ /(test|spec)/)        { limit = 800; kind = "тест" }
        else if (f ~ /\.(jsx|tsx|vue)$/) { limit = 300; kind = "компонент" }
        if (n > limit) { print f ": " n " строк, предел для «" kind "» — " limit; bad = 1 }
      }
      END { exit bad ? 1 : 0 }
    ' || {
      echo "  почини: раздели по смыслу, а не пополам. Файл растёт не по замыслу — в него"
      echo "  дописывают каждую новую правку, потому что так ближе по контексту."
      exit 1
    }
exit 0
