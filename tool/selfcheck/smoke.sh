#!/usr/bin/env bash
# tool/selfcheck/smoke.sh — проверка комплекта на чистой папке, как у постороннего человека.
#
# ЗАЧЕМ. До этого правильность проверялась глазами и памятью: «вроде работало». Инструмент,
# который ставят одной командой в чужие проекты, так проверять нельзя — сломанный `init`
# обнаружится у пользователя, а не у автора.
#
# ЧЕГО ЭТА ПРОВЕРКА НЕ ДЕЛАЕТ. Не проверяет содержание разложенных документов и не ходит в сеть
# (установку с GitHub проверяет человек перед выпуском). Инструмент, молчащий о своих пробелах,
# хуже отсутствующего.
#
#   bash tool/selfcheck/smoke.sh

set -uo pipefail

# Язык вывода закреплён: проверки ниже сверяют русский текст, а без этой строки они зависели бы
# от локали машины — на англоязычном раннере зелёное стало бы красным без единой правки в коде.
export AQK_LANG=ru

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CLI="$ROOT/tool/program.mjs"
PASS=0
FAIL=0

ok()   { printf '  \033[32m✔\033[0m  %s\n' "$1"; PASS=$((PASS + 1)); }
bad()  { printf '  \033[31m✘\033[0m  %s\n' "$1"; printf '      %s\n' "${2:-}"; FAIL=$((FAIL + 1)); }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

printf '\n\033[1mtool/selfcheck/smoke.sh\033[0m\n\n'

# --- 1. синтаксис самой программы ------------------------------------------
if node --check "$CLI" 2>/dev/null; then ok "программа разбирается"; else bad "программа не разбирается"; fi

cd "$WORK" || exit 1
git init -q .

# --- 2. init раскладывает комплект -----------------------------------------
node "$CLI" init >/dev/null 2>&1
# Считаем не «сколько-то файлов», а ровно то, что лежит в комплекте: жёсткое число
# устаревает при первой же правке состава и роняет проверку на пустом месте.
EXPECT=$(find "$ROOT/kit/docs" "$ROOT/kit/rules" -type f | wc -l)
GOT=$(find .aqk -type f 2>/dev/null | wc -l)
if [ "$GOT" -eq "$EXPECT" ]; then
  ok "init разложил весь комплект: $GOT файлов"
else
  bad "разложено $GOT из $EXPECT файлов комплекта"
fi

# Ищем по имени на любой глубине: раскладка внутри .aqk/docs — дело владельца комплекта,
# а обязательность файла от неё не зависит.
for f in .aqk.yml AGENTS.md CLAUDE.md; do
  [ -f "$f" ] || bad "не создан обязательный файл" "$f"
done
for n in general.md index.md project-baseline.md; do
  find .aqk -type f -name "$n" | grep -q . || bad "не создан обязательный файл" "$n"
done
ok "обязательные файлы на месте"

# --- 3. ЗЕЛЁНЫЙ ОБРАЗЕЦ: повтор ничего не портит ---------------------------
# Именно этого свойства ждут от команды, которую запускают вслепую по инструкции.
echo "правка человека" >> AGENTS.md
node "$CLI" init >/dev/null 2>&1
if grep -q "правка человека" AGENTS.md; then ok "повторный init не перезаписал чужие правки"; else bad "повторный init затёр правки человека"; fi

# --- 4. init --force перезаписывает, раз его просили явно -------------------
node "$CLI" init --force >/dev/null 2>&1
if grep -q "правка человека" AGENTS.md; then bad "init --force не перезаписал, хотя обязан"; else ok "init --force перезаписал, как просили"; fi

# --- 5. doctor считает ступени ---------------------------------------------
OUT="$(node "$CLI" doctor 2>&1)"
case "$OUT" in
  *"AQK-0"*) ok "doctor печатает ступени" ;;
  *) bad "doctor не напечатал ступени" "$OUT" ;;
esac

node "$CLI" doctor --min 0 >/dev/null 2>&1 && ok "порог AQK-0 пройден" || bad "порог AQK-0 не пройден на свежем проекте"
node "$CLI" doctor --min 3 >/dev/null 2>&1 && bad "порог AQK-3 пройден на пустом проекте — проверка врёт" || ok "порог AQK-3 честно не пройден"

# --- 6. КРАСНЫЙ ОБРАЗЕЦ: журнал не принимает запись без вывода --------------
if echo "просто сломалось" | node "$CLI" note "проверка" >/dev/null 2>&1; then
  bad "журнал принял запись без раздела «Вывод»"
else
  ok "журнал отклонил запись без вывода"
fi

# --- 7. сверка по намерению: находит своё и не выдумывает чужого -------------
# ЗЕЛЁНЫЙ: описание чужими словами обязано найти существующую запись.
OUT="$(node "$CLI" find "отладочная печать в проде" 2>&1)"
case "$OUT" in
  *"no-print-in-prod"*) ok "find нашёл запись по описанию другими словами" ;;
  *) bad "find не нашёл no-print-in-prod" "$OUT" ;;
esac

# КРАСНЫЙ: намерения, которого нет, находить нельзя. Ложное «такое уже есть» хуже
# отсутствия поиска: человек не заведёт нужный гейт, решив, что он есть.
OUT="$(node "$CLI" find "проверять что миграции базы обратимы" 2>&1)"
case "$OUT" in
  *"Такого намерения в каталоге нет"*) ok "find не выдумал совпадение" ;;
  *) bad "find нашёл несуществующее намерение" "$OUT" ;;
esac

# --- 5а. подсказки печатают вызов, который сработает ------------------------
# Через npx команды `aqk` в системе нет. Подсказка «aqk doctor» отправляет человека
# в «команда не найдена» на первом же шаге — проверено на живой установке с GitHub.
OUT="$(node "$CLI" 2>&1)"
case "$OUT" in
  *"node "*"doctor"*) ok "справка печатает тот вызов, которым программу запустили" ;;
  *) bad "справка советует команду, которой у человека нет" "$OUT" ;;
esac

# --- 5б. без манифеста уровень не выносит приговор проекту ------------------
# «Уровень не достигнут» на зрелом проекте читается как «проект плохой». Сообщение обязано
# объяснять, что мерится машиночитаемость, а не практика.
N="$WORK/nomanifest"; mkdir -p "$N"; cd "$N" || exit 1
git init -q .
OUT="$(node "$CLI" doctor 2>&1)"
case "$OUT" in
  *"стандарт в этом репозитории не заведён"*"не оценка проекта"*)
    ok "без манифеста сказано, что это не оценка проекта" ;;
  *) bad "без манифеста доктор выносит приговор проекту" "$OUT" ;;
esac
cd "$WORK" || exit 1

# --- 7б. составной триггер: скрыто и названа причина ------------------------
# Запись про конвейер касается тех, у кого есть И гейты, И конвейер. В свежем проекте
# конвейера нет — она обязана быть скрыта, и обязана сказать почему.
# Гейт объявляем — значит первое условие выполнено; конвейера нет — второе нет.
# Так проверяется именно СЛОЖЕНИЕ условий, а не первое попавшееся.
C="$WORK/trigger"; mkdir -p "$C"; cd "$C" || exit 1
git init -q .
node "$CLI" init >/dev/null 2>&1
node "$CLI" add secrets-not-in-code >/dev/null 2>&1
OUT="$(node "$CLI" doctor 2>&1)"
case "$OUT" in
  *"gates-run-in-ci"*"нет конвейера"*) ok "составной триггер скрыл запись и назвал причину" ;;
  *) bad "запись про конвейер показана там, где конвейера нет" "$OUT" ;;
esac
cd "$WORK" || exit 1

# --- 7в. запись без переносимого рецепта не выдаётся за проверенную --------
# «Нечем проверить здесь» обязано отличаться и от «принято», и от «отклонено»: иначе
# непроверенная запись едет в каталог как рабочая.
OUT="$(bash "$ROOT/tool/selfcheck/gates.sh" 2>&1)"
case "$OUT" in
  *"НЕ ПРОВЕРЕНА здесь"*|*"принято"*) ok "непроверенные записи считаются отдельно" ;;
  *) bad "проверка каталога не различает непроверенные записи" "$OUT" ;;
esac

# --- 7г. проверка не зависает на проекте не на своём языке -------------------
# awk без файловых аргументов читает поток ввода и ждёт вечно. В терминале незаметно, в
# конвейере и в хуке коммита — намертво. Поток ввода здесь держим открытым нарочно.
E="$WORK/чужой-язык"; mkdir -p "$E"; printf 'fn main() {}\n' > "$E/main.rs"
# Поток ввода из /dev/zero: он никогда не кончается, но и ждать его не надо — здоровый гейт
# в него не заглядывает и выходит сразу. Спящий процесс в конвейере заставлял ждать себя.
STUCK=0
for G in "$ROOT"/kit/gates/*/check.sh; do
  timeout 5 bash "$G" "$E" >/dev/null 2>&1 < /dev/zero
  [ $? -eq 124 ] && { bad "гейт зависает на чужом языке" "$(basename "$(dirname "$G")")"; STUCK=1; }
done
[ $STUCK -eq 0 ] && ok "ни один гейт не зависает там, где его языка нет"

# --- 8. храповик: старое пропускает, новое не пускает ------------------------
# Главный вопрос к храповику: «может ли новый код добавить нарушение и пройти?»
# Может — значит это советчик, а не гейт.
R="$WORK/ratchet"; mkdir -p "$R"; cd "$R" || exit 1
git init -q .
printf 'def a():\n    print("старое")\n' > old.py
node "$CLI" init >/dev/null 2>&1
node "$CLI" add no-print-in-prod >/dev/null 2>&1
node "$CLI" ratchet no-print-in-prod >/dev/null 2>&1

# Судим по вердикту гейта, а не по коду возврата doctor: он ненулевой и по другим
# причинам (в свежей папке нет .gitignore), и проверка бы врала о храповике.
OUT="$(node "$CLI" doctor --run 2>&1)"
case "$OUT" in
  *"новых нарушений"*) bad "храповик не пропустил старое — правило нельзя ввести в живой проект" ;;
  *) ok "храповик пропустил старое нарушение" ;;
esac

printf 'def b():\n    print("новое")\n' > new.py
OUT="$(node "$CLI" doctor --run 2>&1)"
case "$OUT" in
  *"новых нарушений"*) ok "храповик не пустил новое нарушение" ;;
  *) bad "храповик пропустил НОВОЕ нарушение — это советчик, а не гейт" ;;
esac

# Второй прогон с тем же новым нарушением обязан краснеть так же. Пока реестр перезаписывался
# всем текущим списком, одно исправленное нарушение затягивало в долг ВСЕ новые: один красный
# прогон — и дальше зелено навсегда. «Может ли новый код добавить нарушение и пройти?» — мог.
printf 'def c():\n    print("ещё одно")\n' > another.py
node "$CLI" doctor --run >/dev/null 2>&1
rm old.py
OUT="$(node "$CLI" doctor --run 2>&1)"
OUT2="$(node "$CLI" doctor --run 2>&1)"
case "$OUT2" in
  *"новых нарушений"*) ok "новое нарушение не попадает в реестр вслед за исправленным" ;;
  *) bad "исправление одного нарушения затянуло новые в долг" "второй прогон зелёный" ;;
esac
rm -f another.py
printf 'def a():\n    print("старое")\n' > old.py
node "$CLI" ratchet no-print-in-prod >/dev/null 2>&1 || true

rm -f new.py old.py
node "$CLI" doctor --run >/dev/null 2>&1
if grep -q 'old.py' ratchets/no-print-in-prod.txt; then
  bad "исправленное осталось в реестре — храповик не затягивается"
else
  ok "исправленное вычеркнуто из реестра"
fi
cd "$WORK" || exit 1

# --- 8а. порядок «с нуля»: сторожа дня 0 ставятся до первой строки кода -------
# Сторож, поставленный на пустой проект, долга не создаёт. Он же, поставленный через полгода,
# краснеет на всём старом коде — и его выключают. Поэтому проверяем ровно это: после start
# гейты стоят И все зелёные.
S0="$WORK/start"; mkdir -p "$S0"; cd "$S0" || exit 1
git init -q .
node "$CLI" start >/dev/null 2>&1
N=$(awk '/^gates:/{g=1;next} /^[A-Za-z]/{g=0} g && /^[[:space:]]+[A-Za-z0-9_-]+:[[:space:]]*"/' .aqk.yml | wc -l)
if [ "$N" -ge 5 ]; then ok "start поставил сторожей дня 0 ($N)"; else bad "start почти ничего не поставил" "объявлено $N"; fi

OUT="$(node "$CLI" doctor --run 2>&1)"
case "$OUT" in
  *"✘"*"код "*) bad "сторожа дня 0 краснеют на пустом проекте" "$(printf '%s' "$OUT" | grep -A2 '✘' | head -6)" ;;
  *) ok "все сторожа дня 0 зелёные — долга нет" ;;
esac

# Образцы, скопированные в проект, — не код проекта. Пока они им считались, пустой репозиторий
# «становился» проектом на Python, и ему показывались записи про мёртвый код.
# Признак — не отсутствие слова, а причина рядом с ним: запись обязана быть СКРЫТА с
# пояснением «нет языков». Первая редакция искала само слово и падала на строке про скрытое.
case "$OUT" in
  *"dead-code"*"нет языков"*) ok "образцы гейтов не считаются кодом проекта" ;;
  *) bad "образцы гейтов посчитаны кодом проекта" "$(printf '%s' "$OUT" | grep 'dead-code')" ;;
esac
cd "$WORK" || exit 1

# На проекте, где код уже есть, это другой сценарий — и start обязан сказать об этом, а не
# красить весь старый код разом.
S1="$WORK/start-big"; mkdir -p "$S1"; cd "$S1" || exit 1
git init -q .
i=0; while [ $i -lt 40 ]; do printf 'x = %s\n' "$i" > "m$i.py"; i=$((i + 1)); done
node "$CLI" init >/dev/null 2>&1
OUT="$(node "$CLI" start 2>&1)"
case "$OUT" in
  *"другой сценарий"*) ok "start на живом коде отправляет в doctor, а не красит всё" ;;
  *) bad "start не отличил пустой проект от живого" "$OUT" ;;
esac
cd "$WORK" || exit 1

# --- 8б. проект называет свои каталоги, где печать — интерфейс ---------------
# Исключение объявляется В МАНИФЕСТЕ и потому видно глазами. Проверяем обе стороны: названный
# каталог пропускается, все остальные — нет. Исключение, которое прячет всё, бесполезно.
P="$WORK/printok"; mkdir -p "$P/cli" "$P/src"; cd "$P" || exit 1
printf 'def a():\n    print("вывод программы")\n' > cli/main.py
printf 'def b():\n    print("забытая отладка")\n' > src/service.py
OUT="$(AQK_PRINT_OK_DIRS=cli bash "$ROOT/kit/gates/no-print-in-prod/check.sh" . 2>&1)"
case "$OUT" in
  *"cli/main.py"*) bad "названный каталог не исключён" "$OUT" ;;
  *"src/service.py"*) ok "названный каталог пропущен, остальные проверяются" ;;
  *) bad "проверка печати не нашла отладку вне названного каталога" "$OUT" ;;
esac
cd "$WORK" || exit 1

# --- 9. разбор ошибки: три случая различаются прогоном, а не памятью ---------
# «Сторожа не было», «сторож был и не сработал», «сторож был и его обошли» — разные починки.
# Пока их различает человек по памяти, чинят обычно не то. Здесь их различает прогон.
Y="$WORK/why"; mkdir -p "$Y"; cd "$Y" || exit 1
git init -q .
node "$CLI" init >/dev/null 2>&1
printf 'def a():\n    print("отладка")\n' > x.py

OUT="$(node "$CLI" why "миграция базы применена задом наперёд" 2>&1)"
case "$OUT" in
  *"Сторожа не было"*) ok "why: намерения нет в каталоге — сторожа не было" ;;
  *) bad "why не сказал, что сторожа не было" "$OUT" ;;
esac

OUT="$(node "$CLI" why "отладочная печать уехала в прод" 2>&1)"
case "$OUT" in
  *"не поставлен"*) ok "why: запись есть в каталоге, но в проекте не поставлена" ;;
  *) bad "why не отличил «не поставлен» от «не было»" "$OUT" ;;
esac

node "$CLI" add no-print-in-prod >/dev/null 2>&1
OUT="$(node "$CLI" why "отладочная печать уехала в прод" 2>&1)"
case "$OUT" in
  *"его обошли"*) ok "why: сторож стоит и ловит — значит его обошли" ;;
  *) bad "why не отличил «обошли» от «не сработал»" "$OUT" ;;
esac

rm x.py
OUT="$(node "$CLI" why "отладочная печать уехала в прод" 2>&1)"
case "$OUT" in
  *"этой поломки не видит"*) ok "why: сторож стоит, а поломки не видит" ;;
  *) bad "why не отличил «не сработал» от «обошли»" "$OUT" ;;
esac

# Неуверенное совпадение не выбирается за человека: неверно названный случай отправляет
# чинить не то, а это дороже лишнего вопроса.
OUT="$(node "$CLI" why "файл вырос до девяти тысяч строк" 2>&1)"
case "$OUT" in
  *"Уверенного совпадения нет"*) ok "why не гадает при слабом совпадении" ;;
  *) bad "why выбрал запись при слабом совпадении" "$OUT" ;;
esac
cd "$WORK" || exit 1

# --- 20. new заводит заготовку в ПРОЕКТЕ, а не в комплекте -------------------
# Заготовка, созданная в каталоге пакета, для человека не существует: через npx пакет лежит во
# временной папке и исчезает вместе с ней. Работа сделана, результата нет.
NEWDIR="$(mktemp -d)"
( cd "$NEWDIR" && git init -q . && node "$CLI" new proba-obraztsa >/dev/null 2>&1 )
if [ -f "$NEWDIR/gates/proba-obraztsa/gate.yml" ]; then
  ok "new заводит заготовку в проекте"
else
  bad "new завёл заготовку не в проекте" "$(ls -d "$NEWDIR"/gates/* 2>/dev/null || echo 'в проекте пусто')"
fi
if [ -d "$ROOT/kit/gates/proba-obraztsa" ]; then
  bad "new написал в каталог комплекта из чужого проекта" "$ROOT/kit/gates/proba-obraztsa"
  rm -rf "$ROOT/kit/gates/proba-obraztsa"
else
  ok "new не трогает каталог комплекта из чужого проекта"
fi
# Заготовка обязана нести метки ЗАПОЛНИ: незаполненная запись не должна проехать как готовая.
if grep -rq 'ЗАПОЛНИ' "$NEWDIR/gates/proba-obraztsa" 2>/dev/null; then
  ok "заготовка помечена как незаполненная"
else
  bad "в заготовке нет меток ЗАПОЛНИ" "фильтр каталога не отличит её от готовой записи"
fi
rm -rf "$NEWDIR"

# --- 21. blob собирает все методички в один файл ------------------------------
BLOBDIR="$(mktemp -d)"
( cd "$BLOBDIR" && node "$CLI" blob >/dev/null 2>&1 )
EXPECT_MD=$(find "$ROOT/kit/docs" -name '*.md' | wc -l)
if [ -f "$BLOBDIR/GOD_AI.md" ]; then
  # Считаем только подписи, которые ставит сама склейка: путь в них начинается с kit/docs.
  # Первая редакция считала все строки «источник» и намеряла 20 при 13 файлах — сами методички
  # несут такие подписи внутри, указывая на проект, откуда перенесены.
  GOT_MD=$(grep -c '^<!-- источник: kit/docs' "$BLOBDIR/GOD_AI.md")
  if [ "$GOT_MD" -eq "$EXPECT_MD" ]; then
    ok "blob собрал все методички ($GOT_MD)"
  else
    bad "blob собрал не все методички" "в kit/docs $EXPECT_MD, в склейке $GOT_MD"
  fi
  # Ссылки на соседние файлы внутри склейки ведут в никуда: соседей рядом больше нет.
  if grep -qE '\]\((?!https?:)[^)]*\.md\)' "$BLOBDIR/GOD_AI.md" 2>/dev/null; then
    bad "в склейке остались ссылки на соседние файлы" "внутри одного файла они ведут в никуда"
  else
    ok "ссылки на соседние файлы в склейке сняты"
  fi
else
  bad "blob не создал GOD_AI.md" "$BLOBDIR"
fi
rm -rf "$BLOBDIR"

# --- 22. doctor на самом комплекте ------------------------------------------
# В исходнике комплекта разложенной копии `.aqk/` нет и быть не должно. Пока это не различалось,
# `doctor` краснел на собственном репозитории и требовал разложить комплект в комплект — то есть
# врал ровно там, где его показывают первым делом.
if ( cd "$ROOT" && node "$CLI" doctor >/dev/null 2>&1 ); then
  ok "doctor не краснеет на самом комплекте"
else
  bad "doctor краснеет на самом комплекте" "оригиналы лежат в kit/, разложенной копии здесь не бывает"
fi

# --- 23. Go-конвенция *_test.go опознаётся как тесты ------------------------
# Найдено прогоном на gin-gonic/gin: тесты лежат рядом с кодом как foo_test.go, без
# отдельной папки tests/ — признак has_tests молчал на полностью протестированном репозитории.
GODIR="$(mktemp -d)"
mkdir -p "$GODIR/pkg"
printf 'package pkg\nfunc Foo() {}\n' > "$GODIR/pkg/foo.go"
printf 'package pkg\nfunc TestFoo(t *testing.T) {}\n' > "$GODIR/pkg/foo_test.go"
( cd "$GODIR" && node "$CLI" init >/dev/null 2>&1 )
GOOUT=$( cd "$GODIR" && node "$CLI" doctor 2>&1 )
if printf '%s' "$GOOUT" | grep -E 'есть:.*\btests\b' >/dev/null; then
  ok "*_test.go опознаётся как тесты (Go)"
else
  bad "*_test.go не опознан как тесты" "признак has_tests молчит на репозитории gin-типа"
fi
rm -rf "$GODIR"

# --- 24. просьба про звезду и обратную связь — один раз на машину -----------
# Печатается один раз на установку (не на проект): второй init на этой же HOME её не повторяет.
# Отметка живёт вне репозитория — внутри .aqk/ она либо закоммитится в чужой проект, либо
# потеряется при повторном init --force.
FAKEHOME="$(mktemp -d)"
D1="$(mktemp -d)"
OUT1=$( cd "$D1" && HOME="$FAKEHOME" node "$CLI" init 2>&1 )
if printf '%s' "$OUT1" | grep -qi 'звезд'; then
  ok "первый init на новой машине зовёт поставить звезду"
else
  bad "первый init не упомянул звезду/обратную связь" "$OUT1"
fi
D2="$(mktemp -d)"
OUT2=$( cd "$D2" && HOME="$FAKEHOME" node "$CLI" init 2>&1 )
if printf '%s' "$OUT2" | grep -qi 'звезд'; then
  bad "init повторил просьбу про звезду на той же машине" "второй проект, та же HOME"
else
  ok "просьба про звезду не повторяется на той же машине"
fi
rm -rf "$FAKEHOME" "$D1" "$D2"

# --- 25. ссылки в kit/docs/ не битые -----------------------------------------
# entry-links-exist проверяет только корень проекта-получателя, а не kit/docs/ комплекта —
# методички туда не попадают вовсе. Нашли переносом файла: ../app-owner-strategy.md указывал
# мимо после того, как файл переехал в тот же каталог, что и index.md, — .md-ссылка молчала,
# доктор комплекта не краснел, потому что не туда смотрит.
BROKEN=0
while IFS= read -r -d '' MD; do
  DIR=$(dirname "$MD")
  grep -oE '\]\([^)]+\.md[^)]*\)' "$MD" 2>/dev/null | sed -E 's/^\]\(//; s/\)$//' | while IFS= read -r LINK; do
    TARGET="${LINK%%#*}"
    [ -z "$TARGET" ] && continue
    case "$TARGET" in http*) continue ;; esac
    [ -e "$DIR/$TARGET" ] || echo "$MD -> $LINK"
  done
done < <(find "$ROOT/kit/docs" -name '*.md' -print0) > /tmp/aqk-broken-doc-links.$$
if [ -s /tmp/aqk-broken-doc-links.$$ ]; then
  bad "в kit/docs/ есть битые ссылки на .md" "$(cat /tmp/aqk-broken-doc-links.$$)"
else
  ok "ссылки в kit/docs/ не битые"
fi
rm -f /tmp/aqk-broken-doc-links.$$

# --- 26. doctor печатает версию комплекта ------------------------------------
# Баг-репорт без версии нечем привязать к коммиту — заметили, заполняя .github/ISSUE_TEMPLATE/,
# где просили версию из шапки doctor, а шапка её не печатала вовсе.
PKGVER=$(node -e "console.log(require('$ROOT/package.json').version)")
DOCVER=$( cd "$ROOT" && node "$CLI" doctor 2>&1 | head -3)
if printf '%s' "$DOCVER" | grep -qF "$PKGVER"; then
  ok "doctor печатает версию комплекта ($PKGVER)"
else
  bad "doctor не печатает версию" "package.json: $PKGVER; шапка doctor: $(printf '%s' "$DOCVER" | tr '\n' ' ')"
fi

# --- 27. пользовательская red/green не путается с образцами каталога -------
# `--exclude-dir=red` смотрит только на имя папки, не на путь — реальный секрет в чужой red/
# (red-team тесты, что угодно) был невидим во всех проектах, куда ставили гейт. Проверка на
# самом опасном случае: secrets-not-in-code.
REDDIR="$(mktemp -d)"
mkdir -p "$REDDIR/red"
# Собран из частей, а не написан буквально: иначе secrets-not-in-code находит эту строку
# в собственном исходнике smoke.sh — гейт теперь смотрит по всему дереву, включая себя.
printf 'AKIA%s\n' 'ABCDEFGHIJKLMNOP' > "$REDDIR/red/config.py"
if bash "$ROOT/kit/gates/secrets-not-in-code/check.sh" "$REDDIR" >/dev/null 2>&1; then
  bad "секрет в пользовательской red/ невидим" "own_samples_filter смотрит по имени, не по пути"
else
  ok "секрет в пользовательской red/ виден (не путается с образцами каталога)"
fi
rm -rf "$REDDIR"

# --- 28. note требует ту же отметку, что потом проверяет lesson-has-outcome -
# Раньше note принимал любой текст со словом "вывод" — запись проходила note и тут же
# краснела на doctor --run, потому что гейт требует одну из трёх настоящих отметок.
NOTEJ="$(mktemp -d)"
( cd "$NOTEJ" && git init -q . && git config user.email t@t.com && git config user.name t \
  && mkdir -p incidents && echo "# Журнал" > incidents/README.md && git add -A && git commit -q -m init )
NOWORD=$(cd /tmp && AQK_HOME="$NOTEJ" sh -c 'echo "слово вывод здесь есть, но отметки нет" | node "'"$CLI"'" note "без отметки"' 2>&1; echo "EXIT:$?")
if printf '%s' "$NOWORD" | grep -q "EXIT:0"; then
  bad "note принял запись без настоящей отметки решения" "$(printf '%s' "$NOWORD" | head -3)"
else
  ok "note требует настоящую отметку (✅🔧📜👤), не просто слово «вывод»"
fi
rm -rf "$NOTEJ"

# --- 29. заготовка aqk new использует own_samples_filter, а не голое имя red/green -
# CHECK_SH_TEMPLATE нёс тот же баг, что чинили в семи существующих гейтах: --exclude-dir=red
# по имени, а не по пути. Каждый новый гейт, заведённый через `aqk new`, наследовал бы дыру.
NEWDIR2="$(mktemp -d)"
( cd "$NEWDIR2" && node "$CLI" init >/dev/null 2>&1 && node "$CLI" new probe-template >/dev/null 2>&1 )
if [ -f "$NEWDIR2/gates/_skip.sh" ] && grep -q 'own_samples_filter' "$NEWDIR2/gates/probe-template/check.sh"; then
  ok "заготовка aqk new использует own_samples_filter и несёт _skip.sh"
else
  bad "заготовка aqk new не подключает own_samples_filter или не копирует _skip.sh" "$NEWDIR2"
fi
rm -rf "$NEWDIR2"

# --- 30. doctor --run пишет короткий отчёт .aqk/last-run.md -----------------
# Список объявленных гейтов молчит о том, сколько из них реально работают именно сейчас —
# короткий отчёт после каждого прогона нужен и агенту в следующей сессии, и владельцу.
RUNDIR="$(mktemp -d)"
( cd "$RUNDIR" && node "$CLI" start >/dev/null 2>&1 && node "$CLI" doctor --run >/dev/null 2>&1 )
if [ -f "$RUNDIR/.aqk/last-run.md" ] && grep -q 'итого:' "$RUNDIR/.aqk/last-run.md"; then
  ok "doctor --run пишет .aqk/last-run.md"
else
  bad "doctor --run не написал отчёт" "$RUNDIR/.aqk/last-run.md"
fi
rm -rf "$RUNDIR"

# --- 31. commit-explains-itself и note не спорят друг с другом ---------------
# Собственная команда `note` делает коммит сама, и её тело — заголовок записи, без разделов
# «Сделано:»/«Не уверен:». Пока гейт этого не различал, каждая запись в журнал красила
# репозиторий, где стоят оба, — то есть инструмент воевал сам с собой.
CEDIR="$(mktemp -d)"
(
  cd "$CEDIR" && git init -q . && git config user.email t@t && git config user.name t
  mkdir -p incidents && echo "# журнал" > incidents/README.md
  # С комментарием в той же строке намеренно: программа режет «#…» при разборе манифеста
  # (tool/lib/manifest.mjs), и гейт обязан читать тот же файл по тем же правилам.
  printf 'lessons: incidents   # где копятся уроки\n' > .aqk.yml
  echo "код" > a.js
  git add -A && git commit -q -m "первый"
  echo "## запись" >> incidents/README.md && git add -A && git commit -q -m "lesson(aqk): шишка"
)
if bash "$ROOT/kit/gates/commit-explains-itself/check.sh" "$CEDIR" >/dev/null 2>&1; then
  ok "коммит только в журнал не требует мини-отчёта: запись и есть отчёт"
else
  bad "гейт краснеет на записи в журнал — спорит с собственной командой note"
fi
( cd "$CEDIR" && echo "ещё" >> a.js && git add -A && git commit -q -m "fix: без отчёта" )
if bash "$ROOT/kit/gates/commit-explains-itself/check.sh" "$CEDIR" >/dev/null 2>&1; then
  bad "гейт молчит на коммите в код без мини-отчёта"
else
  ok "коммит, трогающий код, мини-отчёт всё так же обязан нести"
fi

# В мелком клоне (actions/checkout берёт один коммит) git считает коммит корневым и выдаёт
# всё дерево как изменённое — состав коммита узнать нельзя. Молча требовать отчёт в этом
# случае нельзя: конвейер краснел бы на каждой записи журнала. Пропускаем, назвав причину
# и способ починки, — так же, как doctor называет причину в списке «не применимо».
SHDIR="$(mktemp -d)"
git clone -q --depth 1 "file://$CEDIR" "$SHDIR/r" 2>/dev/null
OUT=$(bash "$ROOT/kit/gates/commit-explains-itself/check.sh" "$SHDIR/r" 2>&1)
if [ $? -eq 0 ] && printf '%s' "$OUT" | grep -q "fetch-depth"; then
  ok "мелкий клон: гейт пропускает, назвав причину и способ починки"
else
  bad "в мелком клоне гейт врёт про состав коммита" "$OUT"
fi
rm -rf "$SHDIR" "$CEDIR"

# --- 32. вывод действительно на двух языках -----------------------------------
# Сверка ключей каталогов (units.mjs) доказывает, что строки не разошлись, но не доказывает,
# что выбор языка вообще доехал до вывода. Это проверяется только запуском.
EN_OUT=$(AQK_LANG=en node "$CLI" 2>&1)
RU_OUT=$(AQK_LANG=ru node "$CLI" 2>&1)
if printf '%s' "$EN_OUT" | grep -q "install a gate from the catalogue" &&
   ! printf '%s' "$EN_OUT" | grep -q '[а-яА-ЯёЁ]' &&
   printf '%s' "$RU_OUT" | grep -q "поставить гейт из каталога"; then
  ok "справка печатается на двух языках, в английской нет кириллицы"
else
  bad "выбор языка не доехал до вывода" "$(printf '%s' "$EN_OUT" | head -4)"
fi

# --- 33. ссылка на репозиторий ведёт в репозиторий -----------------------------
# Ссылку собирали из имени пакета. Когда имя стало коротким («agent-quality-kit» вместо
# «github:владелец/репозиторий»), просьба про звезду поехала на github.com/agent-quality-kit —
# несуществующую страницу. Единственное место, где мы просим человека о чём-то, вело в никуда.
FBDIR="$(mktemp -d)"; FBPROJ="$(mktemp -d)"
FB_OUT=$( cd "$FBPROJ" && git init -q . && HOME="$FBDIR" node "$CLI" init 2>&1 )
if printf '%s' "$FB_OUT" | grep -qE 'https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+'; then
  ok "просьба про звезду ведёт на репозиторий, а не на github.com/<имя пакета>"
else
  bad "ссылка на репозиторий собрана неверно" "$(printf '%s' "$FB_OUT" | grep -i github | head -2)"
fi
rm -rf "$FBDIR" "$FBPROJ"

# --- 34. обязательная форма отчёта -------------------------------------------
# ЗАЧЕМ. Первый чужой прогон дал отчёт «12 гейтов зелёные» — при том что все 12 стояли на
# слабейшем рецепте, а половина методичек не была прочитана. Пересказ по памяти выбирает
# удобное; отчёт обязан собираться прогоном.
REPDIR="$(mktemp -d)"
(
  cd "$REPDIR" && git init -q . && mkdir -p src &&
  printf 'def f():\n    print("debug")\n' > src/a.py &&
  node "$CLI" start >/dev/null 2>&1
)
REP_OUT=$( cd "$REPDIR" && node "$CLI" report 2>&1 ); REP_CODE=$?
if [ "$REP_CODE" -ne 0 ] && printf '%s' "$REP_OUT" | grep -q '❌ no-print-in-prod'; then
  ok "report краснеет кодом возврата и называет упавший гейт"
else
  bad "report не отличает красное от зелёного" "код $REP_CODE"
fi
if [ -f "$REPDIR/.aqk/report.md" ] && grep -q '^## ' "$REPDIR/.aqk/report.md"; then
  ok "report сохраняет .aqk/report.md"
else
  bad "report не сохранил файл отчёта" "$REPDIR/.aqk/report.md"
fi
# Путь к методичке ИЩЕТСЯ: baseline лежит в подпапке ai/, и жёстко вписанный путь уже соврал.
if printf '%s' "$REP_OUT" | grep -q '📖 .aqk/docs/ai/project-baseline.md'; then
  ok "report находит методичку в подпапке, а не пишет путь наизусть"
else
  bad "report не нашёл project-baseline.md" "$(printf '%s' "$REP_OUT" | grep -i baseline | head -1)"
fi
rm -rf "$REPDIR"

# --- 35. note пишет в журнал ЭТОГО проекта, а не в чужой ---------------------
# Команда требовала клон нашего репозитория и писала урок туда, игнорируя lessons: из
# манифеста проекта. Найдено первым чужим прогоном: человек завёл журнал руками.
NOTEDIR="$(mktemp -d)"; NOTEHOME="$(mktemp -d)"
(
  cd "$NOTEDIR" && git init -q . && git config user.email t@t && git config user.name t &&
  node "$CLI" init >/dev/null 2>&1 &&
  mkdir -p incidents &&
  sed -i 's|^lessons: ""|lessons: incidents|' .aqk.yml &&
  printf '**Вывод.** 🔧 завели проверку\n' | HOME="$NOTEHOME" AQK_HOME="" node "$CLI" note "шишка" >/dev/null 2>&1
)
if [ -f "$NOTEDIR/incidents/README.md" ] && grep -q 'шишка' "$NOTEDIR/incidents/README.md"; then
  ok "note пишет в journal этого проекта — lessons: из манифеста"
else
  bad "note проигнорировал lessons: и ушёл искать чужой клон" "$NOTEDIR/incidents/README.md"
fi
rm -rf "$NOTEDIR" "$NOTEHOME"

# --- 36. .aqkignore прячет принесённый извне код ------------------------------
# ЗАЧЕМ. В чужом проекте референс, принесённый из другого репозитория, попадал в находки
# всех сканирующих гейтов. Единственным лечением была правка КОПИИ _skip.sh в проекте —
# то есть настройка правкой чужого файла, которую затрёт следующий `aqk add`.
IGNDIR="$(mktemp -d)"
mkdir -p "$IGNDIR/third-party/inner" "$IGNDIR/src"
printf 'def f():\n    print("свой")\n' > "$IGNDIR/src/mine.py"
printf 'def f():\n    print("чужой")\n' > "$IGNDIR/third-party/inner/theirs.py"
OUT_BEFORE="$(bash "$ROOT/kit/gates/no-print-in-prod/check.sh" "$IGNDIR" 2>&1)"
printf '# принесено из другого репозитория\nthird-party/\n' > "$IGNDIR/.aqkignore"
OUT_AFTER="$(bash "$ROOT/kit/gates/no-print-in-prod/check.sh" "$IGNDIR" 2>&1)"
if printf '%s' "$OUT_BEFORE" | grep -q 'theirs.py' &&
   ! printf '%s' "$OUT_AFTER" | grep -q 'theirs.py' &&
   printf '%s' "$OUT_AFTER" | grep -q 'mine.py'; then
  ok ".aqkignore прячет чужой код и не трогает свой"
else
  bad ".aqkignore не работает" "до: $(printf '%s' "$OUT_BEFORE" | head -2) | после: $(printf '%s' "$OUT_AFTER" | head -2)"
fi
rm -rf "$IGNDIR"

# --- 37. родной рецепт не ругается на образцы гейтов --------------------------
# ЗАЧЕМ. Переносимая проверка прячет gates/<имя>/red|green через own_samples_filter, а родной
# инструмент о них не знает и выдаёт их как находки — в ЛЮБОМ проекте, куда поставили гейты.
# Всплыло, только когда починка поиска программ в PATH сделала родные рецепты достижимыми:
# до этого они молча не запускались. Гейт, который на 90% состоит из своих же образцов,
# выключают целиком — см. журнал, 2026-09-04.
if command -v vulture >/dev/null 2>&1; then
  NATDIR="$(mktemp -d)"
  (
    cd "$NATDIR" && git init -q . && git config user.email t@t && git config user.name t &&
    mkdir -p src && printf 'def used():\n    return 1\n\nprint(used())\n' > src/ok.py &&
    node "$CLI" init >/dev/null 2>&1 && node "$CLI" add dead-code >/dev/null 2>&1
  )
  NAT_CMD=$(sed -n 's/^  dead-code: "\(.*\)"$/\1/p' "$NATDIR/.aqk.yml")
  NAT_OUT=$( cd "$NATDIR" && eval "$NAT_CMD" 2>&1 )
  if printf '%s' "$NAT_OUT" | grep -q 'gates/'; then
    bad "родной рецепт выдаёт образцы гейтов как находки" "$(printf '%s' "$NAT_OUT" | head -2)"
  else
    ok "родной рецепт не ругается на образцы гейтов"
  fi
  rm -rf "$NATDIR"
else
  ok "родной рецепт не проверен здесь — нет vulture"
fi

# --- 38. badge выдаёт значок с тем же уровнем, что и doctor -------------------
# ЗАЧЕМ. Значок в чужом README — единственное, что делает стандарт видимым за пределами
# нашего репозитория. Если он покажет уровень, отличный от того, что считает doctor, это
# ровно то враньё, против которого весь стандарт.
BDIR="$(mktemp -d)"
(
  cd "$BDIR" && git init -q . && git config user.email t@t && git config user.name t &&
  mkdir -p src && printf 'def f():\n    return 1\n' > src/a.py &&
  node "$CLI" init >/dev/null 2>&1 && node "$CLI" add file-size-limit >/dev/null 2>&1
)
B_OUT=$( cd "$BDIR" && node "$CLI" badge 2>&1 )
B_LVL=$(printf '%s' "$B_OUT" | sed -n 's|.*img.shields.io/badge/AQK-\([0-9]\)-.*|\1|p' | head -1)
D_LVL=$( cd "$BDIR" && node "$CLI" doctor 2>&1 | sed -n 's/.*Уровень: AQK-\([0-9]\).*/\1/p' | head -1 )
if [ -n "$B_LVL" ] && [ "$B_LVL" = "$D_LVL" ]; then
  ok "badge выдаёт значок с уровнем doctor (AQK-$B_LVL)"
else
  bad "badge и doctor разошлись в уровне" "badge=[$B_LVL] doctor=[$D_LVL]"
fi

# --- 39. badge молчит, когда гейт красный ------------------------------------
# ЗАЧЕМ. Значок, выданный при красном гейте, — это заявление автора, а не факт машины.
sed -i.bak 's|^  file-size-limit: .*|&\n  broken: "sh -c '"'"'exit 1'"'"'"|' "$BDIR/.aqk.yml"
B_RED=$( cd "$BDIR" && node "$CLI" badge 2>&1 ); B_RED_CODE=$?
# Условие «нет значка» само по себе зелёное и у несуществующей команды — поэтому здесь
# требуется ещё и названный виновник: иначе проверка не умеет краснеть.
if [ "$B_RED_CODE" -ne 0 ] && ! printf '%s' "$B_RED" | grep -q 'img.shields.io' &&
   printf '%s' "$B_RED" | grep -q 'broken'; then
  ok "badge отказывает при красном гейте"
else
  bad "badge выдал значок при красном гейте" "код=$B_RED_CODE $(printf '%s' "$B_RED" | head -2)"
fi
mv "$BDIR/.aqk.yml.bak" "$BDIR/.aqk.yml"

# --- 40. badge --check ловит устаревший значок в README ----------------------
# ЗАЧЕМ. Значок, который никто не пересчитывает, через месяц врёт. Смысл он приобретает
# только вместе с командой, которая роняет конвейер, когда README разошёлся с фактом.
printf '# проект\n\n[![AQK-3](https://img.shields.io/badge/AQK-3-2ea44f)](https://x)\n' > "$BDIR/README.md"
( cd "$BDIR" && node "$CLI" badge --check >/dev/null 2>&1 ); CHK_LIE=$?
printf '# проект\n\n[![AQK-%s](https://img.shields.io/badge/AQK-%s-2ea44f)](https://x)\n' "$D_LVL" "$D_LVL" > "$BDIR/README.md"
( cd "$BDIR" && node "$CLI" badge --check >/dev/null 2>&1 ); CHK_TRUE=$?
if [ "$CHK_LIE" -ne 0 ] && [ "$CHK_TRUE" -eq 0 ]; then
  ok "badge --check ловит устаревший значок и пропускает верный"
else
  bad "badge --check не различает верный и устаревший значок" "врущий=$CHK_LIE верный=$CHK_TRUE"
fi
rm -rf "$BDIR"

# --- итог -------------------------------------------------------------------
printf '\n'
if [ "$FAIL" -eq 0 ]; then
  printf '  \033[32mвсё зелёное: %s проверок\033[0m\n\n' "$PASS"
else
  printf '  \033[31mпровалено: %s из %s\033[0m\n\n' "$FAIL" "$((PASS + FAIL))"
fi

printf '  \033[2mне покрыто: содержание документов, установка с GitHub через npx\033[0m\n\n'
exit "$FAIL"
