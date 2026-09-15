#!/usr/bin/env sh
# Команда, которую свод велит запускать, существует в проекте.
#
# ЗАЧЕМ ИМЕННО ЭТО. Агент берёт команды из свода дословно. Скрипт переименовали или удалили —
# свод продолжает велеть «npm run lint:cli», агент зовёт несуществующее, получает «Missing
# script» и дальше либо чинит не то, либо сообщает «проверил» про проверку, которой нет.
# Соседняя запись `entry-links-exist` ловит в своде несуществующие ФАЙЛЫ; эта — КОМАНДЫ.
#
# СЛУЧАИ, ИЗ КОТОРЫХ ВЗЯЛАСЬ ЗАПИСЬ (2026-09-11, выборка из 99 публичных репозиториев с
# AGENTS.md, где упомянут «npm run»; подробности — incidents/README.md):
#   notefig/notefig      скрипт lint:cli появился в cbb21a4c вместе со строкой в своде и в тот
#                        же день удалён в ffaf7d8c; свод всё ещё велит «npm run lint:cli»
#   JonnyKreng/pebble-navi  скрипт debug добавлен в 1630de8 вместе со строкой в своде, удалён
#                        через два дня в 757c563; строка «npm run debug» в своде осталась
# Во втором случае `debug` есть в зависимостях — поэтому скрипты берутся из блока "scripts",
# а не любым «"debug":» в файле: иначе ложное «есть».
DIR="${1:-.}"
SKIP_LIB="$(dirname "$0")/../_skip.sh"
if [ ! -f "$SKIP_LIB" ]; then
  echo "рядом с проверкой нет _skip.sh — обход не собран, проверка не состоялась"
  echo "  почини: скопируй гейт вместе с файлом kit/gates/_skip.sh, он общий на весь каталог"
  exit 2
fi
. "$SKIP_LIB"
# Файл на месте — этого мало: подмена содержимого давала код 0. Метка стоит в КОНЦЕ _skip.sh,
# поэтому проверка ловит и обрыв файла на середине.
if [ "${AQK_SKIP_READY:-}" != 1 ]; then
  echo "_skip.sh есть, но обход не собрался — проверка НЕ СОСТОЯЛАСЬ, а не прошла"
  echo "  почини: замени kit/gates/_skip.sh целым файлом из каталога"
  exit 2
fi

# --- своды агента ---------------------------------------------------------------
# То, что агент читает при запуске. README не берём: там пишут и команды для ЧУЖОГО проекта
# («в своём проекте запусти npm run aqk»). Регистр имени не важен: `agents.md` встречается.
ENTRIES=$( { find "$DIR" -maxdepth 1 -type f \( -iname 'agents.md' -o -iname 'claude.md' -o -iname 'gemini.md' \) -print
  for F in .claude/CLAUDE.md .github/copilot-instructions.md; do [ -f "$DIR/$F" ] && printf '%s\n' "$DIR/$F"; done
} 2>/dev/null | own_samples_filter "$DIR" | grep -v '^$')
[ -z "$ENTRIES" ] && { echo "свода агента здесь нет — сверять нечего"; exit 0; }

# --- что в проекте есть ---------------------------------------------------------
# Скрипты — только из блока "scripts" каждого package.json (рабочие пространства тоже: команда
# из свода часто живёт в пакете, а не в корне). Файл склеивается в строку: блок бывает и в одну.
# ИМЕНА СКРИПТОВ ЧИТАЕТ РАЗБОРЩИК JSON, А НЕ РЕГУЛЯРКА. Найдено 2026-09-15 на
# `jantimon/web-performance-debugger`: их скрипт `prebuild` содержит
# `rmSync('dist',{recursive:true,force:true})` — фигурная скобка ВНУТРИ значения. Прежний разбор
# `[^}]*` обрывался на ней, и шесть существующих скриптов объявлялись несуществующими. Письмо
# ушло бы живому человеку с неправдой.
#
# Структуру разбирает тот, кто умеет её разбирать. `package.json` означает проект на Node, и node
# там почти наверняка есть; но «почти» нам не годится — без него мы НЕ ПРОВЕРЯЕМ скрипты и
# говорим об этом, а не додумываем регуляркой.
NPM_BLIND=""
if command -v node >/dev/null 2>&1; then
  SCRIPTS=$(find "$DIR" $(skip_find) -type f -name package.json -print 2>/dev/null | own_samples_filter "$DIR" | grep -v '^$' \
    | while IFS= read -r P; do
        node -e 'try{const s=require("fs").readFileSync(process.argv[1],"utf8");const j=JSON.parse(s);for(const k of Object.keys(j.scripts||{}))console.log(k)}catch(e){}' "$P"
      done)
else
  SCRIPTS=""
  NPM_BLIND=1
fi
HAS_PKG=$(find "$DIR" $(skip_find) -type f -name package.json -print 2>/dev/null | own_samples_filter "$DIR" | grep -v '^$' | head -1)

# Цели make: строка вне рецепта, слова до двоеточия; «VAR := x» — присваивание, не цель.
TARGETS=$(find "$DIR" $(skip_find) -type f \( -name Makefile -o -name makefile -o -name GNUmakefile -o -name '*.mk' \) -print 2>/dev/null \
  | own_samples_filter "$DIR" | grep -v '^$' | while IFS= read -r M; do
      awk '/^[^\t#][^=]*:([^=]|$)/ { sub(/:.*/, ""); n = split($0, a, /[ \t]+/); for (i = 1; i <= n; i++) if (a[i] != "") print a[i] }' "$M"
    done)

# ПОДКЛЮЧЁННЫЙ ФАЙЛ, КОТОРОГО У НАС НЕТ, ДЕЛАЕТ ПЕРЕЧЕНЬ ЦЕЛЕЙ НЕПОЛНЫМ. Найдено 2026-09-15 на
# `exoscale/cli`: их Makefile начинается с `include go.mk/init.mk`, а `go.mk` — подмодуль git,
# которого в клоне нет. Цели `build` и `test-verbose` объявлены там, и наше «такой цели нет» было
# бы письмом с неправдой в живую компанию.
#
# Молчим ОБО ВСЕХ целях make, а не о конкретной: какая именно объявлена в неподключённом файле,
# мы знать не можем. Это третий исход — «не смогли проверить», и он назван вслух, а не спрятан.
MK_BLIND=""
for M in $(find "$DIR" $(skip_find) -type f \( -name Makefile -o -name makefile -o -name GNUmakefile -o -name '*.mk' \) -print 2>/dev/null | own_samples_filter "$DIR" | grep -v '^$'); do
  for INC in $(sed -n 's/^[[:space:]]*-\{0,1\}include[[:space:]]\{1,\}//p' "$M" 2>/dev/null | tr ' ' '\n' | grep -v '^$'); do
    case "$INC" in
      *'$'*) continue ;;
    esac
    [ -e "$(dirname "$M")/$INC" ] || MK_BLIND="$MK_BLIND$INC
"
  done
done

# Рецепты just: «имя:», «@имя арг:», «alias имя := …».
RECIPES=$(find "$DIR" $(skip_find) -type f \( -name justfile -o -name Justfile -o -name .justfile \) -print 2>/dev/null \
  | own_samples_filter "$DIR" | grep -v '^$' | while IFS= read -r J; do
      awk '/^alias[ \t]+/ { print $2; next }
           /^@?[A-Za-z_][A-Za-z0-9_-]*([ \t][^:=]*)?:([^=]|$)/ { sub(/^@/, ""); sub(/[ \t:].*/, ""); print }' "$J"
    done)

has() { printf '%s\n' "$2" | grep -qxF -- "$1"; }

# --- что свод велит запускать ---------------------------------------------------
# «npm run X» однозначен где угодно. «make X» и «just X» — только внутри кода (обратные кавычки,
# блоки): в прозе «make sure» — не команда. Шаблоны («npm run build:*», «make <цель>») и
# присваивания («make test V=1») пропускаются: они не называют одну команду.
MISS=0
# Список команд — через файл, а не через трубу: цикл в трубе идёт в подоболочке, и отметка
# о находке из него не возвращается.
TMP=$(mktemp) || exit 2
trap 'rm -f "$TMP"' EXIT
report() {
  echo "$1: «$2» — $3"
  MISS=1
}
while IFS= read -r E; do
  [ -n "$E" ] || continue
  # Код свода: строки блоков целиком, вне блоков — только вставки в обратных кавычках.
  CODE=$(awk '/^[ \t]*(```|~~~)/ { f = !f; next }
    f { print; next }
    { while (match($0, /`[^`]+`/)) { print substr($0, RSTART + 1, RLENGTH - 2); $0 = substr($0, RSTART + RLENGTH) } }' "$E")
  grep -oE '(npm|pnpm|yarn|bun)[[:space:]]+run[[:space:]]+[A-Za-z][A-Za-z0-9_:.-]*[*<{]?' "$E" \
    | grep -v '[*<{:]$' | sed 's/\.$//; s/[[:space:]][[:space:]]*/ /g' | sort -u > "$TMP"
  while IFS= read -r CMD; do
    # Без разборщика JSON перечень скриптов неполон, и «такого скрипта нет» — догадка.
    [ -n "$NPM_BLIND" ] && continue
    N=${CMD##* }
    has "$N" "$SCRIPTS" && continue
    if [ -n "$HAS_PKG" ]; then report "$E" "$CMD" "такого скрипта нет ни в одном package.json"
    else report "$E" "$CMD" "package.json в репозитории нет вовсе"; fi
  done < "$TMP"
  for N in $(printf '%s\n' "$CODE" | grep -E '(^|[^A-Za-z0-9_-])make[[:space:]]' | grep -vE -- '-C|--directory|-f[[:space:]]|--file' \
      | grep -oE '(^|[^A-Za-z0-9_-])make([[:space:]]+-[A-Za-z0-9]+)*[[:space:]]+[A-Za-z][A-Za-z0-9_.-]*=?' \
      | grep -v '=$' | sed 's/.*[[:space:]]//' | sort -u); do
    [ -n "$MK_BLIND" ] && continue
    has "$N" "$TARGETS" || report "$E" "make $N" "такой цели нет ни в одном Makefile"
  done
  for N in $(printf '%s\n' "$CODE" | grep -oE '(^|[^A-Za-z0-9_-])just[[:space:]]+[A-Za-z][A-Za-z0-9_-]*' \
      | sed 's/.*[[:space:]]//' | sort -u); do
    has "$N" "$RECIPES" || report "$E" "just $N" "такого рецепта нет в justfile"
  done
done <<EOF
$ENTRIES
EOF

if [ "$MISS" = 1 ]; then
  echo "  почини: верни команду в проект или исправь свод. Агент берёт команды из свода дословно:"
  echo "  несуществующая команда — это «Missing script» у агента и «проверил» про проверку, которой нет."
fi
# ЧТО МЫ НЕ СМОГЛИ ПОСМОТРЕТЬ — говорится вслух и при находках, и без них. Молчание здесь
# означало бы «цели make проверены», а они не проверены вовсе.
if [ -n "$NPM_BLIND" ]; then
  echo "  не проверено: скрипты npm. Разобрать package.json нечем — на этой машине нет node."
  echo "    почини: поставь node либо прогони проверку там, где он есть."
fi
if [ -n "$MK_BLIND" ]; then
  echo "  не проверено: цели make. Makefile подключает файлы, которых нет в этом каталоге:"
  printf '%s' "$MK_BLIND" | sort -u | sed 's/^/    /'
  echo "    обычно это подмодуль git — тогда проверять надо там, где он выгружен."
fi
exit "$MISS"
