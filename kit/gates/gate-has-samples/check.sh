#!/usr/bin/env sh
# Гейт без образцов — непроверенное утверждение. Красный образец доказывает, что
# гейт ловит брак; зелёный — что он молчит на исправном коде. Зелёный важнее:
# именно он ловит гейт, который ругается на предписанное им же написание.
DIR="${1:-.}"
MAN="$DIR/.aqk.yml"
[ -f "$MAN" ] || { echo "нет .aqk.yml — проверять нечего"; exit 0; }

SAMPLES=$(sed -n 's/^samples:[[:space:]]*"\{0,1\}\([^"#]*\)"\{0,1\}[[:space:]]*$/\1/p' "$MAN" | head -1)
KEYS=$(awk '/^gates:/{g=1;next} /^[A-Za-z]/{g=0} g && /^[[:space:]]+[A-Za-z0-9_-]+:/{sub(/:.*/,"");gsub(/[[:space:]]/,"");print}' "$MAN")

[ -z "$KEYS" ] && { echo "гейтов не объявлено — проверять нечего"; exit 0; }

BAD=0
for K in $KEYS; do
  if [ -z "$SAMPLES" ]; then
    echo "гейт «$K»: в .aqk.yml не заполнено поле samples"
    echo "  почини: заведи каталог образцов и укажи его в samples"
    BAD=1
    continue
  fi
  for KIND in red green; do
    if [ ! -d "$DIR/$SAMPLES/$K/$KIND" ]; then
      echo "гейт «$K»: нет образца $KIND ($SAMPLES/$K/$KIND)"
      echo "  почини: положи код, на котором гейт обязан $( [ $KIND = red ] && echo краснеть || echo молчать )"
      BAD=1
    fi
  done
done
exit $BAD
