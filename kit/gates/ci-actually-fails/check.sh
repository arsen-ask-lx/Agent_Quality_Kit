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
# ХУКИ HUSKY — тот же вердикт, вынесенный раньше конвейера. Замер 2026-09-22: поиск GitHub
# `"|| true" path:.husky` — 4416 файлов; из 97 хуков проверку гасили 7 у пяти авторов
# (`pnpm lint-staged || true`, `commitlint --edit … || true`, `npm run lint:… || true`). Только
# блокирующие хуки: код выхода `post-merge`, `post-checkout` и прочих `post-*` git не читает, там
# гасить нечего. Внутренности `.husky/_/` — не хуки проекта.
HOOKS=$(find "$DIR/.husky" -maxdepth 1 -type f \( -name pre-commit -o -name pre-push \
        -o -name commit-msg -o -name prepare-commit-msg -o -name pre-merge-commit \
        -o -name pre-rebase -o -name applypatch-msg -o -name pre-applypatch \) 2>/dev/null)
CI="$CI${HOOKS:+
$HOOKS}"
CI="$(printf '%s\n' "$CI" | grep -v '^$')"
[ -z "$CI" ] && { echo "конвейера нет — эта проверка не про тебя"; exit 0; }

# Что считается ПРОВЕРКОЙ. Список намеренно закрытый: маскировка бывает законной — необязательная
# выгрузка отчёта, публикация артефакта, уведомление. Красить всякий `continue-on-error` значит
# получить гейт, который выключат первым. Красим только гашение того, что выносит вердикт.
# ПОЧЕМУ ЗДЕСЬ ЕСТЬ ИНСТРУМЕНТЫ ПРО API И ПОЧЕМУ НЕ ВСЕ ИХ ИМЕНА ЦЕЛИКОМ.
# Замер 2026-09-09: три шага — фаззер спецификации, детектор ломающих изменений и сверка с
# ожиданиями потребителей, — все три под `continue-on-error: true`, и эта проверка сказала
# «чисто», код 0. Список знал `pytest` и `eslint` и не знал ни одного инструмента про API,
# то есть самый дорогой класс проверок проходил как строка в логе.
# Имена сокращены до подкоманды там, где слово обиходное: `vacuum` без `lint` совпадает с
# обслуживанием базы (`psql -c 'VACUUM ANALYZE'`), а шаг обслуживания имеет полное право быть
# прощающим. Ложный красный дороже пропуска: гейт, который врёт, выключают целиком.
RUNNERS='aqk|doctor --run|lint-staged|commitlint|pytest|tox|nox|unittest|jest|vitest|mocha|jasmine|karma|playwright|cypress|eslint|tsc|ruff|flake8|pylint|mypy|pyright|bandit|semgrep|gitleaks|trivy|rubocop|golangci-lint|golint|govet|go vet|go test|staticcheck|shellcheck|hadolint|actionlint|codespell|reviewdog|cargo test|cargo clippy|mvn|gradle|phpstan|psalm|npm test|npm run (test|lint|check|typecheck)|yarn (test|lint)|pnpm (test|lint)|make (test|lint|check)|schemathesis|dredd|oasdiff|spectral lint|redocly (lint|bundle)|vacuum (lint|report|html-report)|pact-broker|pact-verifier|can-i-deploy|portman|newman run|manage.py spectacular'

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
  case "$F" in */.github/workflows/*) GHA=1 ;; *) GHA=0 ;; esac
  case "$F" in */.husky/*) HOOK=1 ;; *) HOOK=0 ;; esac
  RES=$(tr -d '\r' < "$F" | awk -v runners="$RUNNERS" -v words="$WORDS" -v keys="$KEYS" -v file="$F" -v redeemed="$REDEEMED" -v gha="$GHA" -v hook="$HOOK" '
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
    # Команда до первой трубы — запускалка проверки. Узко по замеру 2026-09-21 на 49 чужих
    # конвейерах: первая версия искала имя инструмента где угодно в строке и дала шесть ложных
    # из семи — `gitleaks` в адресе `curl … | tar`, `Trivy` в markdown-таблице внутри JS,
    # у playwright — «-g 5368|6428» в кавычках. Поэтому: труба только вне кавычек, `||` — не труба, и
    # перед ней на месте КОМАНДЫ стоит запускалка, а не её имя внутри адреса или строки.
    function pipedCheck(l,   i, c, q, p, seg, n, parts, cmd, bare) {
      if (isComment(l)) return 0
      sub(/^[[:space:]]*(-[[:space:]]+)?run[[:space:]]*:[[:space:]]*/, "", l)
      q = ""; p = 0
      for (i = 1; i <= length(l); i++) {
        c = substr(l, i, 1)
        if (q != "") { if (c == q) q = ""; continue }
        if (c == "\"" || c == "'"'"'" || c == "`") { q = c; continue }
        if (c == "|") { if (substr(l, i + 1, 1) == "|") { i++; continue } p = i; break }
      }
      if (!p) return 0
      seg = substr(l, 1, p - 1)
      # `cd web && npm test | tee …` — вердикт выносит последняя команда перед трубой.
      n = split(seg, parts, /&&|;/)
      return startsWithRunner(parts[n])
    }
    # Команда начинается с запускалки — а не содержит её имя где-то в адресе, строке или имени
    # переменной. Одно знание на трубу и на хуки: у хуков первая версия, искавшая имя где угодно,
    # покрасила `head -30 "$eslint_out" … || true` и шаблон `\.gitleaks\.toml$` внутри `grep`.
    function startsWithRunner(cmd,   bare) {
      sub(/^[[:space:]]+/, "", cmd)
      sub(/^([A-Za-z_][A-Za-z0-9_]*=[^[:space:]]*[[:space:]]+)+/, "", cmd)
      bare = cmd
      sub(/^((sudo|time|npx|bunx|uvx)[[:space:]]+(--no[[:space:]]+)?(--[[:space:]]+)?|(pnpm|yarn|bun)[[:space:]]+(exec[[:space:]]+|dlx[[:space:]]+|run[[:space:]]+)?|(uv|poetry|pipenv|hatch)[[:space:]]+run[[:space:]]+|python3?[[:space:]]+-m[[:space:]]+)+/, "", bare)
      return (cmd ~ ("^(" runners ")([^A-Za-z0-9_]|$)") || bare ~ ("^(" runners ")([^A-Za-z0-9_]|$)"))
    }
    # `|| true` гасит ВСЮ цепочку `&&` перед собой: в `yarn lint:fix && git add -A || true`
    # провал первой команды пропускает вторую и уходит в `true`. Поэтому запускалкой может быть
    # любое звено цепочки, но только на месте команды. Одно правило на конвейер и на хуки: в
    # конвейере ветка искала имя где угодно и красила `ls "${PLAYWRIGHT_BROWSERS_PATH…}" || true`
    # (замер 2026-09-22, 64 чужих конвейера).
    function maskedCheck(l,   seg, n, st, m, parts, j) {
      if (isComment(l) || l !~ /\|\|[[:space:]]*(true|:|exit[[:space:]]+0)/) return 0
      seg = l; sub(/\|\|[[:space:]]*(true|:|exit[[:space:]]+0).*$/, "", seg)
      sub(/^[[:space:]]*(-[[:space:]]+)?run[[:space:]]*:[[:space:]]*/, "", seg)
      n = split(seg, st, /;/)
      m = split(st[n], parts, /&&/)
      for (j = 1; j <= m; j++) if (startsWithRunner(parts[j])) return 1
      return 0
    }
    function isBoundary(l) { return l ~ /^[[:space:]]*-[[:space:]]/ || l ~ /^[A-Za-z_.-]+[[:space:]]*:/ }
    # Исход этого шага переспрашивают ниже — маска на нём законна.
    function isRedeemed(id,   j, nr) {
      if (id == "") return 0
      nr = split(redeemed, R, "\n")
      for (j = 1; j <= nr; j++) if (R[j] != "" && R[j] == id) return 1
      return 0
    }
    # Погашенная команда, о которой ещё не решено. Печатается, когда стало видно, что после неё
    # в блоке ничего нет: тогда исход шага действительно погашен.
    function reportMask(   ) {
      if (maskLine) printf "%s:%d: провал погашен прямо в команде: %s\n", file, maskLine, substr(maskText, 1, 90)
      maskLine = 0
    }
    function flush(   ) {
      if (blockStart && blockCheck && blockMask && !isRedeemed(blockId))
        printf "%s:%d: проверка не может провалиться — шаг под %s\n", file, blockCheckLine, blockMaskText
      # Труба решает по оболочке шага: своя `shell:` важнее всего, без неё на Windows это pwsh,
      # который выходит по коду нативной команды, а не последней в трубе.
      if (pipeLine && !fileSafe && !blockPipestatus && !(blockShellSeen ? blockShellSafe : curWin))
        printf "%s:%d: провал погашен трубой — без pipefail код шага равен коду последней команды: %s\n", file, pipeLine, substr(pipeText, 1, 90)
      blockStart = 0; blockCheck = 0; blockMask = 0; blockId = ""
      pipeLine = 0; blockPipefail = 0; blockPipestatus = 0; blockShellSeen = 0; blockShellSafe = 0
    }
    {
      # Гашение прямо в команде красится только для ЗАКРЫТОГО списка запускалок: «|| true» на
      # вспомогательной команде внутри скрипта (`docker network create … || true`) — это
      # идемпотентность, а не выключенная проверка.
      if (maskedCheck($0)) {
        # ОБВИНЯЕМ, ТОЛЬКО ЕСЛИ ПОГАШЕННАЯ КОМАНДА — ПОСЛЕДНЯЯ В БЛОКЕ. Замер 2026-09-14 по
        # семидесяти чужим конвейерам дал одно-единственное срабатывание, и оно было ЛОЖНЫМ:
        # `pnpm eslint src > out.txt || true` строкой ниже сверяется `diff` с эталоном —
        # инструмент ОБЯЗАН выйти ненулевым, а вердикт выносит следующая команда. Шаг
        # проваливается прекрасно. Инструмент, который обвиняет напрасно, выключают целиком,
        # поэтому здесь молчание честнее догадки.
        maskLine = NR; maskText = $0; sub(/^[[:space:]]+/, "", maskText)
        # В хуке правило «прощается, если дальше в блоке вердикт» не годится: блок — весь файл, и
        # любая следующая команда снимала бы обвинение. Прощается только вывод В ФАЙЛ — без
        # перенаправления следующей команде нечего сверять; `>/dev/null` и `2>&1` — не файл.
        redir = maskText; gsub(/[0-9]*>[[:space:]]*\/dev\/null/, "", redir); gsub(/[0-9]*>&[0-9]+/, "", redir)
        if (hook && redir !~ />/) reportMask()
      } else if (maskLine && !isComment($0) && $0 !~ /^[[:space:]]*$/) {
        # Печать вердикта не выносит: `echo` после гашения ничего не меняет.
        if ($0 ~ /^[[:space:]]*(-[[:space:]]+)?[A-Za-z0-9_.-]+[[:space:]]*:/) reportMask()
        else if ($0 !~ /^[[:space:]]*(echo|printf|cat|ls)[[:space:]]/) maskLine = 0
      }
      if (isBoundary($0)) flush()
      if (!blockStart) blockStart = NR
      # ТРУБА ПОСЛЕ ПРОВЕРКИ — третья форма гашения. Документация GitHub Actions: шаг без
      # `shell:` на Linux идёт как `bash -e {0}`, без pipefail, а явный `shell: bash` — как
      # `bash --noprofile --norc -eo pipefail {0}`. Без pipefail `pytest | tee log` выходит
      # кодом `tee`, то есть нулём. Найдено 2026-09-21: правило «пайп запрещён» из доклада
      # С. Шимы — у него так красный тест уехал на прод, а эта проверка на той же строке
      # молчала. Только для GitHub: оболочку по умолчанию других конвейеров мы не сверяли, и
      # молчать там честнее, чем гадать.
      if (gha && !isComment($0)) {
        if ($0 ~ /^[[:space:]]*defaults[[:space:]]*:/) defLine = NR
        if ($0 ~ /^[[:space:]]*runs-on[[:space:]]*:/) curWin = ($0 ~ /windows/ && $0 !~ /\$\{\{/)
        if ($0 ~ /^[[:space:]]*(-[[:space:]]+)?shell[[:space:]]*:/) {
          sh = $0; sub(/^[^:]*:[[:space:]]*/, "", sh); gsub(/["'"'"']/, "", sh); sub(/[[:space:]]+$/, "", sh)
          safe = (sh ~ /pipefail/ || sh == "bash" || sh ~ /^(pwsh|powershell|python|cmd)/)
          # `defaults: run: shell:` действует на все шаги ниже — считаем его на весь файл.
          # Если defaults стоит у одной задачи, соседние задачи мы тоже простим: молчание
          # здесь дешевле напрасного красного.
          if (defLine && NR - defLine <= 3) { if (safe) fileSafe = 1 }
          else { blockShellSeen = 1; blockShellSafe = safe }
        }
        if ($0 ~ /pipefail/) blockPipefail = 1
        # Код трубы переспросили: `exit ${PIPESTATUS[0]}` возвращает шагу код проверки.
        if ($0 ~ /PIPESTATUS/) blockPipestatus = 1
        if (!pipeLine && !blockPipefail && $0 !~ /^[[:space:]]*(-[[:space:]]+)?name[[:space:]]*:/ && pipedCheck($0)) {
          pipeLine = NR; pipeText = $0; sub(/^[[:space:]]+/, "", pipeText)
        }
      }
      if (!blockCheck && looksLikeCheck($0)) { blockCheck = 1; blockCheckLine = NR }
      if (isMask($0)) { blockMask = 1; blockMaskText = $0; sub(/^[[:space:]]+/, "", blockMaskText) }
      if (!isComment($0) && $0 ~ /^[[:space:]]*(-[[:space:]]+)?id[[:space:]]*:/) {
        blockId = $0; sub(/^[^:]*:[[:space:]]*/, "", blockId); gsub(/[[:space:]"'"'"']/, "", blockId)
      }
    }
    END { reportMask(); flush() }' 2>/dev/null)
  [ -z "$RES" ] || BAD="$BAD$RES
"
done

LEFT="$(printf '%s' "$BAD" | grep -v '^$')"
[ -z "$LEFT" ] && exit 0
printf '%s\n' "$LEFT"
echo "  почини: убери «|| true» и «continue-on-error» с шага, который выносит вердикт."
echo "  труба после проверки: дай шагу «shell: bash» или начни команду с «set -o pipefail»."
echo "  шаг, который не может провалиться, — это не проверка, а строка в логе."
exit 1
