#!/usr/bin/env sh
# Пределы: прод-код 500 строк, компонент интерфейса 300, тест 800.
#
# ЗАЧЕМ. Агент теряется в больших файлах и начинает переписывать вместо правки. И растут они
# не по замыслу: каждую новую фичу дописывают в тот же файл, потому что агенту так ближе по
# контексту. Числа спорные — важно, что предел существует и его считает машина.
DIR="${1:-.}"
BAD=0

for F in $(find "$DIR" -type f \
    \( -name '*.py' -o -name '*.js' -o -name '*.jsx' -o -name '*.ts' -o -name '*.tsx' \
       -o -name '*.go' -o -name '*.rb' -o -name '*.java' -o -name '*.cs' -o -name '*.php' \
       -o -name '*.rs' -o -name '*.vue' \) \
    -not -path '*/.git/*' -not -path '*/.aqk/*' -not -path '*/node_modules/*' \
    -not -path '*/dist/*' -not -path '*/build/*' -not -path '*/vendor/*' 2>/dev/null); do

  case "$DIR" in *red) : ;; *) case "$F" in */red/*) continue ;; esac ;; esac

  N=$(wc -l < "$F")
  case "$F" in
    *test*|*spec*|*_test.*|*.test.*|*.spec.*) LIMIT=800; KIND="тест" ;;
    *.jsx|*.tsx|*.vue)                        LIMIT=300; KIND="компонент" ;;
    *)                                        LIMIT=500; KIND="прод-код" ;;
  esac

  if [ "$N" -gt "$LIMIT" ]; then
    echo "$F: $N строк, предел для «$KIND» — $LIMIT"
    BAD=1
  fi
done

[ $BAD -eq 1 ] && {
  echo "  почини: раздели по смыслу, а не пополам. Файл растёт не по замыслу — в него"
  echo "  дописывают каждую новую правку, потому что так ближе по контексту."
  exit 1
}
exit 0
