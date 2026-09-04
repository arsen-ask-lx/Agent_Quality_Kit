#!/usr/bin/env sh
# Тихо проглоченная ошибка — отказ, о котором никто не узнал. Система продолжает работать
# «как будто всё хорошо», а причина всплывает через недели и в другом месте.
DIR="${1:-.}"
. "$(dirname "$0")/../_skip.sh" 2>/dev/null || SKIP_NAMES=".git .aqk node_modules .venv"

# Список файлов собираем заранее. awk без файловых аргументов читает поток ввода и ждёт его
# вечно: на проекте без файлов этих языков проверка зависала навсегда — в конвейере и в хуке
# коммита, где поток ввода открыт. Найдено прогоном по проекту на Go.
FILES=$(find "$DIR" $(skip_find "$DIR") -type f -print 2>/dev/null | only_code | own_samples_filter "$DIR")
[ -z "$FILES" ] && exit 0

printf '%s\n' "$FILES" | xargs -r awk '
  FILENAME ~ /\/(\.git|\.aqk|node_modules|dist|build|vendor)\// { next }

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
  # go: пустое тело после проверки ошибки, либо ошибка присвоена в пустоту
  prev ~ /if[[:space:]]+err[[:space:]]*!=[[:space:]]*nil/ && $0 ~ /^[[:space:]]*\}[[:space:]]*$/ {
    print FILENAME ":" FNR ": ошибка проверена и выброшена — " gensub(/^[[:space:]]+/, "", 1, prev)
  }
  /^[[:space:]]*_[[:space:]]*=[[:space:]]*err[[:space:]]*$/ {
    print FILENAME ":" FNR ": ошибка присвоена в пустоту — " gensub(/^[[:space:]]+/, "", 1, $0)
  }
  # rust: результат отброшен без разбора
  /\.ok\(\);[[:space:]]*$/ || /let[[:space:]]+_[[:space:]]*=[^;]*\?[[:space:]]*;/ {
    print FILENAME ":" FNR ": результат отброшен без разбора — " gensub(/^[[:space:]]+/, "", 1, $0)
  }
  # обещания: .catch(() => {})
  /\.catch\([^)]*=>[[:space:]]*\{[[:space:]]*\}\)/ {
    print FILENAME ":" FNR ": перехват без обработки — " gensub(/^[[:space:]]+/, "", 1, $0)
  }
  { prev = $0 }
' > /tmp/.swallowed.$$ 2>/dev/null

if [ -s /tmp/.swallowed.$$ ]; then
  cat /tmp/.swallowed.$$
  echo "  почини: либо обработай и запиши в лог, либо пробрось дальше."
  echo "  тихий перехват — это отказ, о котором никто не узнает, пока не станет поздно."
  rm -f /tmp/.swallowed.$$
  exit 1
fi
rm -f /tmp/.swallowed.$$
exit 0
