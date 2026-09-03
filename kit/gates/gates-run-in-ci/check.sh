#!/usr/bin/env sh
# Гейт, который запускает только человек, работает ровно до первого «забыл». Конвейер не
# забывает. Проверяем: каждая команда из манифеста упомянута в конфиге конвейера.
DIR="${1:-.}"
MAN="$DIR/.aqk.yml"
[ -f "$MAN" ] || { echo "нет .aqk.yml — проверять нечего"; exit 0; }

CI=$(find "$DIR/.github/workflows" "$DIR/.gitlab-ci.yml" "$DIR/.circleci" "$DIR/Jenkinsfile" \
     -type f 2>/dev/null)
[ -z "$CI" ] && { echo "конвейера нет — эта проверка не про тебя"; exit 0; }

# Конвейер может гонять гейты не поимённо, а разом: `aqk doctor --run` запускает всё
# объявленное в манифесте. Тогда добавление гейта само добавляет его в конвейер, и требовать
# отдельный шаг на каждый — значит требовать лишней работы и ловить несуществующий брак.
# shellcheck disable=SC2086
if grep -qE 'doctor[[:space:]]+--run|--run[[:space:]]+.*doctor' $CI 2>/dev/null; then
  echo "конвейер запускает все объявленные гейты разом: doctor --run"
  exit 0
fi

NAMES=$(awk '/^gates:/{g=1;next} /^[A-Za-z]/{g=0} g && /^[[:space:]]+[A-Za-z0-9_-]+:/{print}' "$MAN")
[ -z "$NAMES" ] && { echo "гейтов не объявлено"; exit 0; }

BAD=0
echo "$NAMES" | while IFS= read -r L; do
  NAME=$(echo "$L" | sed 's/^[[:space:]]*\([A-Za-z0-9_-]*\):.*/\1/')
  CMD=$(echo "$L" | sed 's/^[[:space:]]*[A-Za-z0-9_-]*:[[:space:]]*//; s/^"//; s/"$//')
  [ -z "$CMD" ] && continue

  # Ищем самую опознаваемую часть команды: путь к скрипту, иначе всю команду целиком.
  KEY=$(echo "$CMD" | tr ' ' '\n' | grep '/' | head -1)
  [ -z "$KEY" ] && KEY="$CMD"

  # shellcheck disable=SC2086
  if ! grep -qF "$KEY" $CI 2>/dev/null; then
    echo "гейт «$NAME» не запускается конвейером: $CMD"
    echo "  почини: добавь шаг с этой командой в конфиг конвейера."
    echo "  гейт, который гоняет только человек, работает до первого «забыл»."
    exit 1
  fi
done || BAD=1
exit $BAD
