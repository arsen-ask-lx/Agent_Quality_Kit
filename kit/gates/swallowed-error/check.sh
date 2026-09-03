#!/usr/bin/env sh
# Тихо проглоченная ошибка — отказ, о котором никто не узнал. Система продолжает работать
# «как будто всё хорошо», а причина всплывает через недели и в другом месте.
DIR="${1:-.}"

awk '
  FILENAME ~ /\/(\.git|\.aqk|node_modules|dist|build|vendor)\// { next }
  SKIPRED == 1 && FILENAME ~ /\/red\// { next }

  # python: except ...: с пустым телом
  prev ~ /^[[:space:]]*except([[:space:]]|:)/ && $0 ~ /^[[:space:]]*(pass|\.\.\.)[[:space:]]*$/ {
    print FILENAME ":" FNR ": перехват без обработки — " gensub(/^[[:space:]]+/, "", 1, prev)
  }
  # python в одну строку
  /^[[:space:]]*except[^:]*:[[:space:]]*(pass|\.\.\.)[[:space:]]*$/ {
    print FILENAME ":" FNR ": перехват без обработки — " gensub(/^[[:space:]]+/, "", 1, $0)
  }
  # js/java/go-подобные: catch (...) { } пустой
  /catch[[:space:]]*(\([^)]*\))?[[:space:]]*\{[[:space:]]*\}/ {
    print FILENAME ":" FNR ": перехват без обработки — " gensub(/^[[:space:]]+/, "", 1, $0)
  }
  # обещания: .catch(() => {})
  /\.catch\([^)]*=>[[:space:]]*\{[[:space:]]*\}\)/ {
    print FILENAME ":" FNR ": перехват без обработки — " gensub(/^[[:space:]]+/, "", 1, $0)
  }
  { prev = $0 }
' SKIPRED="$(case "$DIR" in *red) echo 0 ;; *) echo 1 ;; esac)" \
  $(find "$DIR" -type f \( -name '*.py' -o -name '*.js' -o -name '*.jsx' -o -name '*.ts' \
      -o -name '*.tsx' -o -name '*.java' -o -name '*.cs' -o -name '*.rb' -o -name '*.php' \) \
      -not -path '*/.git/*' -not -path '*/.aqk/*' -not -path '*/node_modules/*' 2>/dev/null) > /tmp/.swallowed.$$ 2>/dev/null

if [ -s /tmp/.swallowed.$$ ]; then
  cat /tmp/.swallowed.$$
  echo "  почини: либо обработай и запиши в лог, либо пробрось дальше."
  echo "  тихий перехват — это отказ, о котором никто не узнает, пока не станет поздно."
  rm -f /tmp/.swallowed.$$
  exit 1
fi
rm -f /tmp/.swallowed.$$
exit 0
