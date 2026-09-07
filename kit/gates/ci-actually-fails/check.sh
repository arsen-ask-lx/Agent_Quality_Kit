#!/usr/bin/env sh
# Конвейер, который гасит провал проверки: шаг выполнен, круг зелёный, проверка не сработала.
#
# ЗАЧЕМ ОТДЕЛЬНО ОТ «гейт запускается конвейером». Та проверка отвечает на вопрос «упомянут ли»,
# и на этом останавливается. Мы нашли дыру в собственной оснастке: конфиг с `run: pytest || true`
# проходил её зелёным — команда упомянута, а провалиться не может никогда. «Упомянут» и
# «работает» — разные утверждения, и весь этот стандарт стоит на том, чтобы их не путать.
DIR="${1:-.}"

CI=$(find "$DIR/.github/workflows" "$DIR/.gitlab-ci.yml" "$DIR/.circleci" "$DIR/Jenkinsfile" \
     -type f 2>/dev/null)
[ -z "$CI" ] && { echo "конвейера нет — эта проверка не про тебя"; exit 0; }

# Что считается ПРОВЕРКОЙ. Список намеренно закрытый: маскировка бывает законной — необязательная
# выгрузка отчёта, публикация артефакта, уведомление. Красить всякий `continue-on-error` значит
# получить гейт, который выключат первым. Красим только гашение того, что выносит вердикт.
RUNNERS='aqk|doctor --run|pytest|tox|nox|unittest|jest|vitest|mocha|jasmine|karma|playwright|cypress|eslint|tsc|ruff|flake8|pylint|mypy|pyright|bandit|semgrep|gitleaks|trivy|rubocop|golangci-lint|golint|govet|go vet|go test|staticcheck|shellcheck|hadolint|actionlint|codespell|reviewdog|cargo test|cargo clippy|mvn|gradle|phpstan|psalm|npm test|npm run (test|lint|check|typecheck)|yarn (test|lint)|pnpm (test|lint)|make (test|lint|check)'

# Закрытый список не поспевает: замер по чужим репозиториям нашёл шаг «Run reviewdog
# (github-pr-check)» под `continue-on-error: true`, и ни одно имя из списка в нём не звучало.
# Поэтому вторая примета — СЛОВО в имени шага или в команде. Целым словом: «checkout» не
# «check», иначе первый же `actions/checkout` красил бы каждый конвейер на свете.
WORDS='([Ll]int|[Tt]est|[Cc]heck|[Vv]erify|[Aa]udit|[Ss]can|[Tt]ypecheck|[Cc]overage)([^A-Za-z]|$)'

# Проверка из манифеста — тоже проверка, как бы она ни называлась в этом проекте.
MAN="$DIR/.aqk.yml"
if [ -f "$MAN" ]; then
  KEYS=$(tr -d '\r' < "$MAN" | awk '/^gates:/{g=1;next} /^[A-Za-z]/{g=0} g && /^[[:space:]]+[A-Za-z0-9_-]+:/{
      sub(/^[[:space:]]*[A-Za-z0-9_-]*:[[:space:]]*/,""); gsub(/^"|"$/,"");
      n=split($0,w," "); for(i=1;i<=n;i++) if (index(w[i],"/")) { print w[i]; break }
    }')
fi

BAD=""
for F in $CI; do
  # Шаги, чей исход ПЕРЕСПРАШИВАЮТ ниже: `continue-on-error` на них стоит не ради прощения
  # провала, а чтобы дали выполниться шагам после — а вердикт выносится отдельным шагом
  # `if: steps.<id>.outcome == 'failure'` → `exit 1`. Найдено замером по fastapi
  # (`.github/workflows/pre-commit.yml`): проверка идёт под маской, потом чинит файлы и пушит
  # их в ветку, и только в конце роняет сборку. Гейт молчал там по случайности — слово-примета
  # не совпало; назови они шаг «lint», он покрасил бы законный уклад.
  #
  # Засчитывается только когда в файле есть И ссылка на исход, И падение: переспросить исход и
  # ничего с ним не сделать — то же самое прощение, только длиннее.
  REDEEMED=""
  if tr -d '\r' < "$F" | grep -qE '^[[:space:]]*(-[[:space:]]+)?run[[:space:]]*:.*(exit[[:space:]]+1|^[[:space:]]*false[[:space:]]*$)'; then
    REDEEMED=$(tr -d '\r' < "$F" | sed -n "s/.*steps\.\([A-Za-z0-9_-]*\)\.\(outcome\|conclusion\|result\).*/\1/p" | sort -u)
  fi
  # Разбор ПО ШАГАМ, а не по строкам. Построчно проверка врала в обе стороны: законный
  # `continue-on-error` на шаге выгрузки отчёта красил соседний шаг с тестами, а слово «test»
  # внутри перечисления типов коммита («feat|fix|test|chore») делало проверкой строку, которая
  # ничего не проверяет. Замер по чужим конвейерам дал 4 ложных из 10 — переписано на блоки.
  #
  # Шаг начинается элементом списка («- ») или ключом верхнего уровня: так устроен и github,
  # и gitlab, где `allow_failure` живёт на уровне задачи.
  RES=$(tr -d '\r' < "$F" | awk -v runners="$RUNNERS" -v words="$WORDS" -v keys="$KEYS" -v file="$F" -v redeemed="$REDEEMED" '
    function isComment(l) { return l ~ /^[[:space:]]*#/ }
    function looksLikeCheck(l,   j, nk) {
      if (isComment(l)) return 0
      # `uses:` — чужое действие. Его провал бывает законно необязательным: выгрузка отчёта,
      # комментарий в пул-реквест, уведомление. Вердикт выносит то, что ЗАПУСКАЮТ.
      if (l ~ /^[[:space:]]*(-[[:space:]]+)?uses[[:space:]]*:/) return 0
      if (l ~ runners) return 1
      # Проверка, объявленная в манифесте ЭТОГО проекта, — тоже проверка, как бы она ни
      # называлась. Это самая точная примета из трёх: не догадка по имени, а список, который
      # проект написал сам.
      nk = split(keys, K, "\n")
      for (j = 1; j <= nk; j++) if (K[j] != "" && index(l, K[j])) return 1
      # Слово-примета — ТОЛЬКО в имени шага. В теле команды оно ловит своё же упоминание:
      # «grep -oE (feat|fix|test|chore)» — это разбор заголовка коммита, а не проверка.
      if (l ~ /^[[:space:]]*(-[[:space:]]+)?name[[:space:]]*:/ && l ~ words) return 1
      return 0
    }
    function isMask(l) {
      return !isComment(l) && l ~ /^[[:space:]]*(continue-on-error|allow_failure|ignore_failure)[[:space:]]*:[[:space:]]*(true|yes)/
    }
    function isBoundary(l) { return l ~ /^[[:space:]]*-[[:space:]]/ || l ~ /^[A-Za-z_.-]+[[:space:]]*:/ }
    # Исход этого шага переспрашивают ниже — маска на нём законна.
    function isRedeemed(id,   j, nr) {
      if (id == "") return 0
      nr = split(redeemed, R, "\n")
      for (j = 1; j <= nr; j++) if (R[j] != "" && R[j] == id) return 1
      return 0
    }
    function flush(   ) {
      if (blockStart && blockCheck && blockMask && !isRedeemed(blockId))
        printf "%s:%d: проверка не может провалиться — шаг под %s\n", file, blockCheckLine, blockMaskText
      blockStart = 0; blockCheck = 0; blockMask = 0; blockId = ""
    }
    {
      # Гашение прямо в команде красится только для ЗАКРЫТОГО списка запускалок: «|| true» на
      # вспомогательной команде внутри скрипта (`docker network create … || true`) — это
      # идемпотентность, а не выключенная проверка.
      if (!isComment($0) && $0 ~ runners && $0 ~ /\|\|[[:space:]]*(true|:|exit[[:space:]]+0)/) {
        line = $0; sub(/^[[:space:]]+/, "", line)
        printf "%s:%d: провал погашен прямо в команде: %s\n", file, NR, substr(line, 1, 90)
      }
      if (isBoundary($0)) flush()
      if (!blockStart) blockStart = NR
      if (!blockCheck && looksLikeCheck($0)) { blockCheck = 1; blockCheckLine = NR }
      if (isMask($0)) { blockMask = 1; blockMaskText = $0; sub(/^[[:space:]]+/, "", blockMaskText) }
      if (!isComment($0) && $0 ~ /^[[:space:]]*(-[[:space:]]+)?id[[:space:]]*:/) {
        blockId = $0; sub(/^[^:]*:[[:space:]]*/, "", blockId); gsub(/[[:space:]"'"'"']/, "", blockId)
      }
    }
    END { flush() }' 2>/dev/null)
  [ -z "$RES" ] || BAD="$BAD$RES
"
done

LEFT="$(printf '%s' "$BAD" | grep -v '^$')"
[ -z "$LEFT" ] && exit 0
printf '%s\n' "$LEFT"
echo "  почини: убери «|| true» и «continue-on-error» с шага, который выносит вердикт."
echo "  шаг, который не может провалиться, — это не проверка, а строка в логе."
exit 1
