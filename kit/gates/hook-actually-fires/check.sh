#!/usr/bin/env sh
# Хук, который не сработает никогда: имя события с опечаткой, `matcher` на событии, которое его
# не поддерживает, либо команда, указывающая на файл, которого нет.
#
# ТРЕТИЙ КЛАСС ДОБАВЛЕН 2026-09-14, И НАШЁЛ ЕГО ЧУЖОЙ ИНСТРУМЕНТ. `agnix`, прогнанный по нашему
# же репозиторию, сказал «Script file not found» о ШЕСТИ хуках в нашем ЗЕЛЁНОМ образце: гейт с
# именем `hook-actually-fires` говорил «чисто» о настройке, где ни один хук сработать не мог.
# Это второй раз за неделю, когда соседский инструмент находит у нас то, чего не видят наши же
# проверки, — и ровно тот класс, ради которого написан весь комплект.
#
# ЗАЧЕМ. Человек заводит хук, чтобы машина держала то, что он держать не может: не дать
# сделать force-push, отформатировать после правки, не отпустить работу с красным линтером.
# Ошибку в имени события Claude Code НЕ показывает — хук просто никогда не вызывается.
# Настройка выглядит как защита и защитой не является. Это тот же класс, что `pytest || true`:
# зелёное, полученное по причине, не имеющей отношения к предмету.
#
# ОТКУДА СПИСОК СОБЫТИЙ. https://code.claude.com/docs/en/hooks — раздел Configuration, таблица
# «Each event type matches on a different field» и заголовки разделов. Снято 2026-09-07.
# Дословно оттуда же про matcher: "If you add a `matcher` field to an event without matcher
# support, it is silently ignored."
#
# ПОЧЕМУ ВСЁ-ТАКИ СПИСОК, А НЕ «БЛИЗКИЙ ПРОМАХ». Первая версия краснела только на именах,
# отличающихся от известного одной-двумя буквами: список стареет, и не хотелось объявлять
# опечаткой событие, появившееся после нас. Замер эту конструкцию убил. В `kevinreber/watch-party`
# лежит `"PreToolCall"` — хук, гоняющий typecheck и тесты перед `git commit` и `git push`,
# который не срабатывает никогда. От `PreToolUse` это имя отстоит на четыре правки, и проверка
# по близости его пропускала. Правило же, красящее всё незнакомое, на 39 чужих настройках дало
# ноль ложных.
#
# Размен назван вслух: событие, добавленное в Claude Code после нас, эта проверка объявит
# незнакомым. Это ложное срабатывание — видимое, громкое и чинится одной строкой здесь. Пропуск
# же не виден никак: хук молчит, и молчание неотличимо от того, что всё хорошо. Из двух ошибок
# мы выбираем шумную.
DIR="${1:-.}"

# ПО ОДНОМУ ФАЙЛУ ЗА ПРОХОД, а не списком в один awk. Разбор идёт в END по накопленному тексту:
# при нескольких файлах в общем буфере FILENAME остаётся последним, а счётчик строк — сквозным,
# и находка из `settings.json` печаталась как `settings.local.json:71` вместо `settings.json:8`.
# Мало того что путь чужой: `--since` сверяет напечатанный путь с дифом, не находит его и
# считает находок ноль — гейт зеленеет. Найдено код-ревью 2026-09-07.
OUT=""
ERR=""
FOUND=0
for F in "$DIR/.claude/settings.json" "$DIR/.claude/settings.local.json" \
         "$DIR/.claude/hooks/hooks.json" "$DIR/.claude/hooks.json"; do
  [ -f "$F" ] || continue
  FOUND=1

  # Файл хуков без обёртки `"hooks": { … }` держит карту событий прямо в корне. Такой уклад
  # встречается в `hooks.json`, и без этой поправки триггер срабатывал, а проверять было нечего:
  # тишина неотличима от чистой настройки. В `settings.json` корневые ключи — `permissions`,
  # `env`, `model`, — и считать их событиями нельзя, поэтому послабление только для hooks.json.
  ROOT=0
  # Ищем именно ОБЪЕКТ на верхнем уровне: `"hooks": {`. Просто `"hooks":` не годится — этот же
  # ключ стоит внутри каждой группы («"matcher": "Bash", "hooks": [ … ]»), и грубый греп находил
  # его всегда, из-за чего поблажка не включалась никогда. Найдено прогоном образца.
  case "$F" in
    *hooks.json) tr -d '\n' < "$F" | grep -q '"hooks"[[:space:]]*:[[:space:]]*{' || ROOT=1 ;;
  esac

  RES=$(awk -v rootIsHooks="$ROOT" '
    BEGIN {
      split("SessionStart Setup InstructionsLoaded UserPromptSubmit UserPromptExpansion " \
            "MessageDisplay PreToolUse PermissionRequest PermissionDenied PostToolUse " \
            "PostToolUseFailure PostToolBatch Notification SubagentStart SubagentStop " \
            "TaskCreated TaskCompleted Stop StopFailure TeammateIdle ConfigChange CwdChanged " \
            "DirectoryAdded FileChanged WorktreeCreate WorktreeRemove PreCompact PostCompact " \
            "PreModelSwitch PostModelSwitch Elicitation ElicitationResult SessionEnd", KNOWN, " ")
      # События, у которых matcher не поддерживается вовсе: он молча игнорируется, и хук
      # срабатывает на каждом событии — шире, чем думает автор.
      split("UserPromptSubmit PostToolBatch Stop TeammateIdle TaskCreated TaskCompleted " \
            "WorktreeCreate WorktreeRemove MessageDisplay CwdChanged", NOMATCH, " ")
      for (i in NOMATCH) NOMATCHER[NOMATCH[i]] = 1
      for (i in KNOWN) NORM[normalize(KNOWN[i])] = KNOWN[i]
    }
    function normalize(s,   t) { t = tolower(s); gsub(/[^a-z0-9]/, "", t); return t }
    function min3(a, b, c) { if (a <= b && a <= c) return a; if (b <= c) return b; return c }
    function edit(a, b,   la, lb, i, j, prev, cur, cost) {
      la = length(a); lb = length(b)
      if (la == 0) return lb
      if (lb == 0) return la
      for (j = 0; j <= lb; j++) prev[j] = j
      for (i = 1; i <= la; i++) {
        cur[0] = i
        for (j = 1; j <= lb; j++) {
          cost = (substr(a, i, 1) == substr(b, j, 1)) ? 0 : 1
          cur[j] = min3(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
        }
        for (j = 0; j <= lb; j++) prev[j] = cur[j]
      }
      return prev[lb]
    }
    function judge(ev, ln,   nz, best, bestName, d, i) {
      for (i in KNOWN) if (KNOWN[i] == ev) return
      nz = normalize(ev)
      if (nz in NORM) {
        printf "%s:%d: событие «%s» написано не так, как его зовёт Claude Code — «%s». Хук не сработает никогда\n", file, ln, ev, NORM[nz]
        return
      }
      best = 99; bestName = ""
      for (i in KNOWN) { d = edit(nz, normalize(KNOWN[i])); if (d < best) { best = d; bestName = KNOWN[i] } }
      if (best <= 3)
        printf "%s:%d: событие «%s» Claude Code не знает — похоже на «%s». Хук не сработает никогда\n", file, ln, ev, bestName
      else
        printf "%s:%d: событие «%s» Claude Code не знает — хук не сработает никогда. Либо опечатка, либо событие новее этой проверки (список снят 2026-09-07)\n", file, ln, ev
    }
    # Разбор посимвольный с учётом строк и экранирования: `{` внутри строкового значения не
    # меняет глубину. Построчный греп здесь врал бы на любом однострочном json.
    FNR == 1 { file = FILENAME }
    { text = text $0 "\n" }
    END {
      n = length(text); depth = 0; instr = 0; esc = 0; line = 1
      hooksDepth = -1; evDepth = -1; ev = ""; key = ""; buf = ""; awaitMatcher = 0
      for (p = 1; p <= n; p++) {
        c = substr(text, p, 1)
        if (c == "\n") { line++; continue }
        if (instr) {
          if (esc) { esc = 0; buf = buf c; continue }
          if (c == "\\") { esc = 1; continue }
          if (c == "\"") {
            instr = 0; pending = buf; pendingLine = line
            # Значение matcher прочитано. Красим ТОЛЬКО осмысленный фильтр: пустая строка и «*»
            # означают «всё» — ровно то, что и происходит на событии без поддержки matcher, то
            # есть автор не обманут. Замер по 39 чужим настройкам: без этого сужения гейт краснел
            # на четырёх, и все четыре были «matcher»: "" либо "*", то есть шум.
            if (awaitCmd) {
              awaitCmd = 0
              printf "@CMD@%d@%s\n", cmdLine, pending
            }
            if (awaitMatcher) {
              awaitMatcher = 0
              if (pending != "" && pending != "*" && pending != ".*")
                printf "%s:%d: у события «%s» matcher не поддерживается — «%s» молча игнорируется, и хук срабатывает на каждом событии, а не на отобранных\n", file, matcherLine, matcherEv, pending
            }
            continue
          }
          buf = buf c; continue
        }
        if (c == "\"") { instr = 1; buf = ""; continue }
        if (c == ":") {
          key = pending; keyLine = pendingLine
          if (ev != "" && key == "matcher" && (ev in NOMATCHER)) { awaitMatcher = 1; matcherLine = keyLine; matcherEv = ev }
          # Команда хука. Существование файла проверяет ОБОЛОЧКА, а не awk: у awk нет способа
          # спросить файловую систему, не вызывая внешний процесс на каждую строку.
          if (key == "command") { awaitCmd = 1; cmdLine = keyLine }
          continue
        }
        # ЛЮБОЙ структурный символ снимает ожидание значения matcher. Без этого нестроковое
        # значение (`"matcher": null`, число, массив) оставляло флаг взведённым, и первая же
        # следующая строка документа — обычно ключ «hooks» — печаталась как значение matcher.
        # Найдено код-ревью 2026-09-07.
        if (c == "{" || c == "[") {
          awaitMatcher = 0; awaitCmd = 0
          depth++
          if (c == "{" && rootIsHooks == 1 && depth == 1 && hooksDepth == -1) hooksDepth = 1
          else if (c == "{" && key == "hooks" && hooksDepth == -1) hooksDepth = depth
          else if (hooksDepth != -1 && depth == hooksDepth + 1 && key != "") { ev = key; evDepth = depth; judge(key, keyLine) }
          key = ""; continue
        }
        if (c == "}" || c == "]") {
          awaitMatcher = 0; awaitCmd = 0
          if (depth == evDepth) { ev = ""; evDepth = -1 }
          if (depth == hooksDepth) hooksDepth = -1
          depth--; key = ""; continue
        }
        if (c == ",") { awaitMatcher = 0; awaitCmd = 0; key = ""; continue }
      }
    }
  ' "$F" 2>/tmp/.hookerr.$$)
  CODE=$?
  E=$(cat /tmp/.hookerr.$$ 2>/dev/null); rm -f /tmp/.hookerr.$$
  # Отказ инструмента и чистая настройка дают одинаково пустой вывод и противоположные выводы.
  # Разделяем их кодом возврата: «не смогли разобрать» — это 2, а не молчаливый ноль.
  if [ "$CODE" -ne 0 ] || [ -n "$E" ]; then
    ERR="$ERR$F: разобрать не удалось${E:+ — }$E
"
  fi
  # КОМАНДЫ ХУКОВ — отдельной дорожкой: awk отдал их помеченными строками, файловую систему
  # спрашивает оболочка.
  #
  # ГРАНИЦА НАМЕРЕННО УЗКАЯ. Красим только ОТНОСИТЕЛЬНЫЙ путь со слэшем: `.claude/hooks/x.sh`,
  # `scripts/guard.sh`. Программа из PATH (`npx`, `prettier`, `bash -c …`) нам не видна — у неё
  # нет пути, и «не нашли» означало бы обвинение по догадке. Абсолютный путь пропускаем: он
  # относится к чужой машине, а не к репозиторию. Из двух ошибок здесь выбирается молчание:
  # ложное обвинение выключает гейт целиком.
  CMDS=$(printf '%s\n' "$RES" | grep '^@CMD@' || true)
  RES=$(printf '%s\n' "$RES" | grep -v '^@CMD@' || true)
  if [ -n "$CMDS" ]; then
    MISS=$(printf '%s\n' "$CMDS" | while IFS= read -r L; do
      [ -z "$L" ] && continue
      LN=$(printf '%s' "$L" | cut -d@ -f3)
      CMD=$(printf '%s' "$L" | cut -d@ -f4-)
      # Переменная окружения, которой Claude Code называет корень проекта, — это и есть DIR.
      CMD=$(printf '%s' "$CMD" | sed 's|\${CLAUDE_PROJECT_DIR}/*||g; s|\$CLAUDE_PROJECT_DIR/*||g')
      # КАВЫЧКИ СНИМАЮТСЯ ПОСЛЕ ПЕРЕМЕННОЙ И ДО РАЗБОРА НА СЛОВА. Найдено замером 2026-09-15 по
      # `kupzed/catatz`: у них `node "$CLAUDE_PROJECT_DIR/.claude/hooks/adapter.mjs"` — путь
      # лежит ВНУТРИ кавычек вместе с переменной. Переменную мы снимали, кавычки оставались, и
      # файл искался по имени с кавычками. Пять «пропавших» хуков, и все пять на месте (200).
      # Письмо по такой находке было бы неправдой — а писать мы собирались именно по ним.
      CMD=$(printf '%s' "$CMD" | tr -d '"'"'"'"')
      # Первое слово — программа. Если это запускалка, файл стоит вторым.
      P=$(printf '%s' "$CMD" | awk "{print \$1}")
      case "$P" in
        bash|sh|node|python|python3|ruby|perl|deno|bun) P=$(printf '%s' "$CMD" | awk "{print \$2}") ;;
      esac
      case "$P" in
        ""|-*|/*) continue ;;
        */*) [ -e "$DIR/$P" ] || printf "%s:%s: команда хука указывает на «%s» — такого файла в проекте нет, хук не сработает никогда\n" "$F" "$LN" "$P" ;;
      esac
    done)
    [ -n "$MISS" ] && OUT="$OUT$MISS
"
  fi
  [ -n "$RES" ] && OUT="$OUT$RES
"
done

[ "$FOUND" -eq 0 ] && exit 0

if [ -n "$ERR" ]; then
  printf '%s' "$ERR"
  echo "  почини: покажи файл настроек глазами — проверка не смогла его разобрать."
  echo "  «не смогли проверить» и «нарушений нет» дают одинаково пустой список и разные выводы."
  exit 2
fi

ALL=$(printf '%s' "$OUT" | grep -v '^$')
[ -z "$ALL" ] && exit 0
printf '%s\n' "$ALL"
echo "  почини: сверь имя события с https://code.claude.com/docs/en/hooks, убери matcher там, где его нет,"
echo "  и верни на место файл, на который указывает команда, — либо убери сам хук."
echo "  хук с неверным именем не вызывается и об этом не сообщается — защита существует только на бумаге."
exit 1
