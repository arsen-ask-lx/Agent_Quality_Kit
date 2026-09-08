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

# Node на Windows видит мир глазами Windows, а Git Bash — глазами POSIX: путь вида
# /tmp/tmp.XXXX, отданный в `node -e`, там не существует, и проверка падает не на том, что
# проверяет. Поймано дважды на windows-прогоне — сперва на `learn`, потом на установке хука.
# Поэтому node запускается ИЗ каталога и получает относительный путь: помощник, а не памятка,
# потому что памятку третий раз забудут ровно так же, как забыли второй.
node_in() { D="$1"; shift; ( cd "$D" && node "$@" ); }

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
# ПОЧЕМУ ПРИМАНКА ИМЕННО gate-not-weakened. У записи должен быть ТОЛЬКО переносимый рецепт:
# иначе на машине, где стоит ruff или eslint, установка возьмёт рецепт под язык, и проверка
# станет печатать чужой формат вывода. Так и вышло — прогон был зелёным локально и красным в
# конвейере ровно потому, что в конвейер добавили ruff: четыре проверки искали в выводе наши
# «почини: …» и «путь:строка», а получали формат ruff. Прогон, чей исход зависит от того, что
# случайно стоит на машине, не проверяет ничего.
R="$WORK/ratchet"; mkdir -p "$R"; cd "$R" || exit 1
git init -q .
printf 'x = 1  # noqa\n' > old.py
node "$CLI" init >/dev/null 2>&1
node "$CLI" add gate-not-weakened >/dev/null 2>&1
node "$CLI" ratchet gate-not-weakened >/dev/null 2>&1

# Судим по вердикту гейта, а не по коду возврата doctor: он ненулевой и по другим
# причинам (в свежей папке нет .gitignore), и проверка бы врала о храповике.
OUT="$(node "$CLI" doctor --run 2>&1)"
case "$OUT" in
  *"новых нарушений"*) bad "храповик не пропустил старое — правило нельзя ввести в живой проект" ;;
  *) ok "храповик пропустил старое нарушение" ;;
esac

printf 'y = 2  # noqa\n' > new.py
OUT="$(node "$CLI" doctor --run 2>&1)"
case "$OUT" in
  *"новых нарушений"*) ok "храповик не пустил новое нарушение" ;;
  *) bad "храповик пропустил НОВОЕ нарушение — это советчик, а не гейт" ;;
esac

# Второй прогон с тем же новым нарушением обязан краснеть так же. Пока реестр перезаписывался
# всем текущим списком, одно исправленное нарушение затягивало в долг ВСЕ новые: один красный
# прогон — и дальше зелено навсегда. «Может ли новый код добавить нарушение и пройти?» — мог.
printf 'z = 3  # noqa\n' > another.py
node "$CLI" doctor --run >/dev/null 2>&1
rm old.py
OUT="$(node "$CLI" doctor --run 2>&1)"
OUT2="$(node "$CLI" doctor --run 2>&1)"
case "$OUT2" in
  *"новых нарушений"*) ok "новое нарушение не попадает в реестр вслед за исправленным" ;;
  *) bad "исправление одного нарушения затянуло новые в долг" "второй прогон зелёный" ;;
esac
rm -f another.py
printf 'x = 1  # noqa\n' > old.py
node "$CLI" ratchet gate-not-weakened >/dev/null 2>&1 || true

rm -f new.py old.py
node "$CLI" doctor --run >/dev/null 2>&1
if grep -q 'old.py' ratchets/gate-not-weakened.txt; then
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

# --- 9. разбор ошибки: три случая различаются прогоном, а не памятью ---------
# «Сторожа не было», «сторож был и не сработал», «сторож был и его обошли» — разные починки.
# Пока их различает человек по памяти, чинят обычно не то. Здесь их различает прогон.
Y="$WORK/why"; mkdir -p "$Y"; cd "$Y" || exit 1
git init -q .
node "$CLI" init >/dev/null 2>&1
printf 'q = 1  # noqa\n' > x.py

OUT="$(node "$CLI" why "миграция базы применена задом наперёд" 2>&1)"
case "$OUT" in
  *"Сторожа не было"*) ok "why: намерения нет в каталоге — сторожа не было" ;;
  *) bad "why не сказал, что сторожа не было" "$OUT" ;;
esac

OUT="$(node "$CLI" why "подавление проверки целиком без причины" 2>&1)"
case "$OUT" in
  *"не поставлен"*) ok "why: запись есть в каталоге, но в проекте не поставлена" ;;
  *) bad "why не отличил «не поставлен» от «не было»" "$OUT" ;;
esac

node "$CLI" add gate-not-weakened >/dev/null 2>&1
OUT="$(node "$CLI" why "подавление проверки целиком без причины" 2>&1)"
case "$OUT" in
  *"его обошли"*) ok "why: сторож стоит и ловит — значит его обошли" ;;
  *) bad "why не отличил «обошли» от «не сработал»" "$OUT" ;;
esac

rm x.py
OUT="$(node "$CLI" why "подавление проверки целиком без причины" 2>&1)"
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
# USERPROFILE задаётся рядом с HOME: `os.homedir()` на Windows читает именно его, и без этого
# отметка уезжала в настоящий домашний каталог раннера — к этой проверке она там уже лежала от
# предыдущих прогонов init, и просьба не печаталась. Изоляция, которая не изолирует, хуже её
# отсутствия: проверка краснела не на дефекте.
# Отметка живёт вне репозитория — внутри .aqk/ она либо закоммитится в чужой проект, либо
# потеряется при повторном init --force.
FAKEHOME="$(mktemp -d)"
D1="$(mktemp -d)"
OUT1=$( cd "$D1" && HOME="$FAKEHOME" USERPROFILE="$FAKEHOME" node "$CLI" init 2>&1 )
if printf '%s' "$OUT1" | grep -qi 'звезд'; then
  ok "первый init на новой машине зовёт поставить звезду"
else
  bad "первый init не упомянул звезду/обратную связь" "$OUT1"
fi
D2="$(mktemp -d)"
OUT2=$( cd "$D2" && HOME="$FAKEHOME" USERPROFILE="$FAKEHOME" node "$CLI" init 2>&1 )
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
# Путь отдаётся оболочкой, а Node на Windows не понимает «/d/a/…» из Git Bash. Читаем из
# текущего каталога, а не подставляем абсолютный путь в код.
PKGVER=$( cd "$ROOT" && node -p "require('./package.json').version" )
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
# Утечку русского ищем СЛОВАМИ, а не диапазоном [а-яА-ЯёЁ]. Диапазон непереносим: в сборке grep
# из MSYS он сравнивает байты, и «—», «·», ««»» из обычной типографики попадают в него — на
# Windows проверка насчитывала пять «кириллических» строк в чисто английском выводе. Литеральные
# слова совпадают одинаково везде, что тот же прогон и подтвердил.
# Сверка ключей каталогов (units.mjs) доказывает, что строки не разошлись, но не доказывает,
# что выбор языка вообще доехал до вывода. Это проверяется только запуском.
EN_OUT=$(AQK_LANG=en node "$CLI" 2>&1)
RU_OUT=$(AQK_LANG=ru node "$CLI" 2>&1)
if printf '%s' "$EN_OUT" | grep -q "install a gate from the catalogue" &&
   ! printf '%s' "$EN_OUT" | grep -qE 'гейт|каталог|проверк|уровен|репозитор' &&
   printf '%s' "$RU_OUT" | grep -q "поставить гейт из каталога"; then
  ok "справка печатается на двух языках, в английской нет кириллицы"
else
  # Диагностика по каждому условию отдельно. Прежняя печатала первые строки вывода — по ним
  # видно, что вывод английский, и совершенно не видно, какая из трёх сверок не сошлась.
  EN_HAS=$(printf '%s' "$EN_OUT" | grep -c "install a gate from the catalogue")
  EN_CYR=$(printf '%s' "$EN_OUT" | grep -cE 'гейт|каталог|проверк|уровен|репозитор')
  RU_HAS=$(printf '%s' "$RU_OUT" | grep -c "поставить гейт из каталога")
  bad "выбор языка не доехал до вывода" "англ.фраза=$EN_HAS кириллица_в_англ=$EN_CYR рус.фраза=$RU_HAS"
fi

# --- 33. ссылка на репозиторий ведёт в репозиторий -----------------------------
# Ссылку собирали из имени пакета. Когда имя стало коротким («agent-quality-kit» вместо
# «github:владелец/репозиторий»), просьба про звезду поехала на github.com/agent-quality-kit —
# несуществующую страницу. Единственное место, где мы просим человека о чём-то, вело в никуда.
FBDIR="$(mktemp -d)"; FBPROJ="$(mktemp -d)"
FB_OUT=$( cd "$FBPROJ" && git init -q . && HOME="$FBDIR" USERPROFILE="$FBDIR" node "$CLI" init 2>&1 )
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
  printf 'a = 1  # noqa\n' > src/a.py &&
  node "$CLI" start > /tmp/aqk-start.log 2>&1
)
REP_OUT=$( cd "$REPDIR" && node "$CLI" report 2>&1 ); REP_CODE=$?
if [ "$REP_CODE" -ne 0 ] && printf '%s' "$REP_OUT" | grep -q '❌ gate-not-weakened'; then
  ok "report краснеет кодом возврата и называет упавший гейт"
else
  # Код возврата отчёта не говорит, ПОЧЕМУ он ноль: гейт не сработал, не установился или
  # установился не тот. Спрашиваем сам гейт напрямую — это и есть разница между «отчёт врёт»
  # и «проверка не ловит на этой системе».
  G_LS=$( cd "$REPDIR" && ls gates 2>&1 | tr '\n' ' ' )
  G_DECL=$( cd "$REPDIR" && sed -n '/^gates:/,$p' .aqk.yml 2>/dev/null | grep -cE '^[[:space:]]+[A-Za-z0-9_-]+:' )
  G_OUT=$( cd "$REPDIR" && bash gates/gate-not-weakened/check.sh . 2>&1 | head -2 ); G_CODE=$?
  bad "report не отличает красное от зелёного" "код отчёта $REP_CODE; гейт напрямую: код $G_CODE, вывод «$(printf '%s' "$G_OUT" | tr '\n' ' ')»; в gates/: «$G_LS»; объявлено гейтов: $G_DECL; хвост start: «$(tail -4 /tmp/aqk-start.log 2>/dev/null | tr '\n' ' ')»"
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
printf 'mine = 1  # noqa\n' > "$IGNDIR/src/mine.py"
printf 'theirs = 1  # noqa\n' > "$IGNDIR/third-party/inner/theirs.py"
OUT_BEFORE="$(bash "$ROOT/kit/gates/gate-not-weakened/check.sh" "$IGNDIR" 2>&1)"
printf '# принесено из другого репозитория\nthird-party/\n' > "$IGNDIR/.aqkignore"
OUT_AFTER="$(bash "$ROOT/kit/gates/gate-not-weakened/check.sh" "$IGNDIR" 2>&1)"
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

# --- 41. порог различает «ступень ниже» и «упал гейт» -------------------------
# ЗАЧЕМ. При упавшем гейте печаталось «Порог AQK-1 НЕ пройден: сейчас AQK-1» — утверждение,
# противоречащее само себе. Человек шёл чинить манифест, а падал гейт. Это две разные
# развилки, и сообщение обязано их различать, иначе оно отправляет чинить не то.
TDIR="$(mktemp -d)"
( cd "$TDIR" && git init -q . && node "$CLI" init >/dev/null 2>&1 )
printf 'gates:\n  always-fails: "false"\n' >> "$TDIR/.aqk.yml"
OUT_GATE="$( cd "$TDIR" && node "$CLI" doctor --run --min 1 2>&1 )"; RC_GATE=$?
# Ступень ниже порога: пустой манифест без входа и правил.
EDIR="$(mktemp -d)"; ( cd "$EDIR" && git init -q . && printf 'aqk: 1\n' > .aqk.yml )
OUT_LVL="$( cd "$EDIR" && node "$CLI" doctor --min 3 2>&1 )"; RC_LVL=$?
if [ "$RC_GATE" -ne 0 ] && [ "$RC_LVL" -ne 0 ] &&
   printf '%s' "$OUT_GATE" | grep -q 'always-fails' &&
   ! printf '%s' "$OUT_GATE" | grep -qE '(НЕ пройден|NOT passed): (сейчас|currently) AQK-1' &&
   printf '%s' "$OUT_LVL" | grep -qE '(НЕ пройден|NOT passed)'; then
  ok "порог различает упавший гейт и недобранную ступень"
else
  bad "сообщение о пороге не различает две развилки" "гейт: $(printf '%s' "$OUT_GATE" | tail -2 | tr '\n' ' ')"
fi
rm -rf "$TDIR" "$EDIR"

# --- 42. duplicate-code: пара упорядочена, а не как отдал обход ---------------
# ЗАЧЕМ. Ключ пары складывался в порядке, в котором файлы отдал find, а он разный на разных
# системах (здесь — по хешу имени, не по алфавиту и не по времени создания). Реестр, снятый
# на одной машине, краснел в конвейере целиком: те же дубли читались как новые. Хуже: храповик
# объявлял их исправленными и вычёркивал — реестр портился. Инвариант: пара внутри строки
# всегда лексикографическая, тогда ключ одинаков на любой системе.
DD="$(mktemp -d)"
BLOCK='def f():\n    a = 1\n    b = 2\n    c = 3\n    d = 4\n    e = 5\n    g = 6\n    h = 7\n    return a\n'
printf "$BLOCK" > "$DD/zz.py"; printf "$BLOCK" > "$DD/aa.py"
LINE="$(bash "$ROOT/kit/gates/duplicate-code/check.sh" "$DD" 2>&1 | sed "s#$DD/##g" | grep 'одинаков' | head -1)"
FIRST="${LINE%% и *}"; REST="${LINE#* и }"; SECOND="${REST%%:*}"
if [ -n "$LINE" ] && [ "${FIRST%%:*}" \< "$SECOND" ]; then
  ok "duplicate-code упорядочивает пару лексикографически"
else
  bad "пара идёт в порядке обхода — реестр разъедется между машинами" "$LINE"
fi
rm -rf "$DD"

# --- 43. храповик: ключ переживает сдвиг строки в ПЕРВОМ файле пары -----------
# ЗАЧЕМ. keys() убирал номер строки шаблоном ':<число>:', а у первого файла пары за номером
# идёт ' и '. Номер оставался в ключе, и сдвиг кода в первом файле читался как новое
# нарушение — ровно то, от чего храповик защищает.
RDIR="$(mktemp -d)"
printf '# реестр\na.tsx: и b.tsx: одинаковый кусок\n' > "$RDIR/reg.txt"
bash "$ROOT/kit/ratchet/ratchet.sh" "$RDIR/reg.txt" \
  printf 'a.tsx:171 и b.tsx:188: одинаковый кусок\n' >/dev/null 2>&1; RC_SHIFT=$?
if [ "$RC_SHIFT" -eq 0 ]; then
  ok "храповик: номер строки убран у обоих файлов пары"
else
  bad "сдвиг строки в первом файле пары читается как новое нарушение" "код $RC_SHIFT"
fi
rm -rf "$RDIR"

# --- 44. манифест называет опечатку в имени поля -------------------------------
# ЗАЧЕМ. Разбор принимает любое имя поля. `gate:` вместо `gates:` молча означало «гейтов не
# объявлено»: вердикт выходил неверный, а причина не называлась. Человек шёл искать ошибку в
# проекте, а она была в одной букве манифеста. Тишина неотличима от успеха — тот самый класс,
# против которого построен стандарт, только внутри самой программы.
MDIR="$(mktemp -d)"
( cd "$MDIR" && git init -q . && node "$CLI" init >/dev/null 2>&1 )
sed -i 's/^gates:/gate:/' "$MDIR/.aqk.yml"
OUT_TYPO="$( cd "$MDIR" && node "$CLI" doctor 2>&1 )"
OUT_OK="$( cd "$MDIR" && sed -i 's/^gate:/gates:/' .aqk.yml && node "$CLI" doctor 2>&1 )"
if printf '%s' "$OUT_TYPO" | grep -qE '(does not know|не знает).*gate' &&
   ! printf '%s' "$OUT_OK" | grep -qE '(does not know|не знает)'; then
  ok "манифест называет неизвестное поле и молчит на верном"
else
  bad "опечатка в поле манифеста проходит молча" "$(printf '%s' "$OUT_TYPO" | grep -i 'know\|знает' | head -1)"
fi
rm -rf "$MDIR"

# --- 45. родной рецепт не читает то, что не читают переносимые -----------------
# ЗАЧЕМ. own_samples_filter знал про образцы гейтов и .aqkignore, но не про SKIP_NAMES:
# их применяли только переносимые проверки при обходе, а родному инструменту список не
# доставался вовсе. На живом проекте (Django + React, 2750 файлов кода) первой находкой
# duplicate-code оказались методички САМОГО комплекта в .aqk/docs — родной jscpd прошёлся
# по каталогу, который положил init. Вывод — 5597 строк. Такой гейт выключают целиком,
# ровно как сказано в шапке _skip.sh про 94% чужих находок.
NDIR="$(mktemp -d)"
mkdir -p "$NDIR/.aqk/docs" "$NDIR/node_modules/pkg" "$NDIR/src"
printf 'нарушение\n' > "$NDIR/.aqk/docs/guide.md"
printf 'нарушение\n' > "$NDIR/node_modules/pkg/index.js"
printf 'нарушение\n' > "$NDIR/src/mine.py"
# «Инструмент» печатает пути и возвращает отказ — как настоящий родной линтер.
# Пути в цветовых кодах — как их печатает jscpd: имя каталога идёт не после «/» и не с начала
# строки, а сразу за escape-последовательностью. Фильтр по границе пути их не видел, и на живом
# проекте вывод сократился с 5597 строк до 5505 — то есть не сократился.
cat > "$NDIR/fake-tool.sh" <<'EOT'
printf ' - \033[1m\033[32m.aqk/docs/guide.md:markdown\033[39m\033[22m [8:1 - 20:5]\n'
printf ' - \033[1m\033[32mnode_modules/pkg/index.js:javascript\033[39m\033[22m [1:1 - 9:2]\n'
printf ' - \033[1m\033[32msrc/mine.py:python\033[39m\033[22m [1:1 - 9:2]\n'
exit 1
EOT
OUT_N="$(cd "$NDIR" && sh "$ROOT/kit/gates/_native.sh" . sh ./fake-tool.sh 2>&1)"
if printf '%s' "$OUT_N" | grep -q 'src/mine.py' &&
   ! printf '%s' "$OUT_N" | grep -q '\.aqk/docs' &&
   ! printf '%s' "$OUT_N" | grep -q 'node_modules'; then
  ok "родной рецепт молчит про .aqk и node_modules, но видит свой код"
else
  bad "родной инструмент выдаёт то, что переносимые не читают" "$(printf '%s' "$OUT_N" | tr '\n' ' ')"
fi
rm -rf "$NDIR"

# --- 46. commit-explains-itself и синтетический merge-коммит -------------------
# ЗАЧЕМ. При разборе предложения изменений GitHub выкладывает не коммит автора, а синтетический
# merge-коммит с сообщением «Merge <sha> into <sha>». Гейт читал именно его, не находил разделов
# отчёта и краснел — на КАЖДОМ предложении изменений в КАЖДОМ проекте, куда его поставили.
# Поймано настоящим прогоном конвейера на этой же ветке, а не рассуждением.
CDIR="$(mktemp -d)"
(
  cd "$CDIR" && git init -q . && git config user.email a@b.c && git config user.name a
  printf 'один\n' > f.txt && git add -A
  git commit -q -m "feat: первый" -m "Сделано: завёл файл" -m "Не уверен: ни в чём"
  git checkout -q -b feature
  printf 'два\n' >> f.txt && git add -A
  git commit -q -m "feat: второй" -m "Сделано: дописал строку" -m "Не уверен: ни в чём"
  git checkout -q master 2>/dev/null || git checkout -q main
  # Ровно та форма сообщения, которую делает GitHub для ветки предложения изменений.
  git merge -q --no-ff feature -m "Merge $(git rev-parse --short feature) into $(git rev-parse --short HEAD)"
) >/dev/null 2>&1
OUT_M="$(bash "$ROOT/kit/gates/commit-explains-itself/check.sh" "$CDIR" 2>&1)"; RC_M=$?
# Вторая форма — та, что делает кнопка Merge на сайте. Слова другие, случай тот же: сообщение
# сочинил не автор. Шаблон «Merge … into …» её не ловил, и main покраснел бы после первого же
# вливания через кнопку.
CDIR2="$(mktemp -d)"
(
  cd "$CDIR2" && git init -q . && git config user.email a@b.c && git config user.name a
  printf 'один\n' > f.txt && git add -A
  git commit -q -m "feat: первый" -m "Сделано: завёл файл" -m "Не уверен: ни в чём"
  git checkout -q -b feature
  printf 'два\n' >> f.txt && git add -A
  git commit -q -m "feat: второй" -m "Сделано: дописал строку" -m "Не уверен: ни в чём"
  git checkout -q master 2>/dev/null || git checkout -q main
  git merge -q --no-ff feature -m "Merge pull request #15 from owner/feature"
) >/dev/null 2>&1
bash "$ROOT/kit/gates/commit-explains-itself/check.sh" "$CDIR2" >/dev/null 2>&1; RC_PR=$?
rm -rf "$CDIR2"
if [ "$RC_M" -eq 0 ] && [ "$RC_PR" -eq 0 ]; then
  ok "commit-explains-itself смотрит на коммит автора, а не на merge-коммит конвейера"
else
  bad "гейт краснеет на слитом предложении изменений" "checkout-форма: $RC_M, кнопка Merge: $RC_PR"
fi
rm -rf "$CDIR"

# --- 47. doctor --baseline ставит галочки прогоном, а не по памяти -------------
# ЗАЧЕМ. Методичка про обязательный минимум — 50 пунктов — была единственным местом, где
# комплект просил верить на слово, что человек её прочитал и сверился. Ручной проход по живому
# проекту нашёл настоящее (логирование не задано, задачи конвейера не запускались ни разу),
# но дисциплина не масштабируется. Проверяем главное: значок ставит признак, а не автор.
BDIR2="$(mktemp -d)"
( cd "$BDIR2" && git init -q . && node "$CLI" init >/dev/null 2>&1 )
OUT_EMPTY="$( cd "$BDIR2" && node "$CLI" doctor --baseline 2>&1 )"
# Кладём общепринятые признаки трёх РАЗНЫХ экосистем: нейтральность к стеку — условие, а не
# пожелание. Проверка, знающая только про npm, объявила бы половину мира несоответствующей.
printf 'x\n' > "$BDIR2/Cargo.lock"; printf 'x\n' > "$BDIR2/ruff.toml"; printf 'x\n' > "$BDIR2/Dockerfile"
OUT_FULL="$( cd "$BDIR2" && node "$CLI" doctor --baseline 2>&1 )"
BEFORE=$(printf '%s' "$OUT_EMPTY" | grep -c '✔' || true)
AFTER=$(printf '%s' "$OUT_FULL" | grep -c '✔' || true)
if printf '%s' "$OUT_FULL" | grep -qE 'cargo.lock' &&
   printf '%s' "$OUT_FULL" | grep -qE 'ruff.toml' &&
   printf '%s' "$OUT_FULL" | grep -qE 'dockerfile' &&
   [ "$AFTER" -gt "$BEFORE" ]; then
  ok "doctor --baseline засчитывает признаки разных экосистем и называет, чем подтверждено"
else
  bad "baseline не видит признаков или не называет доказательство" "было ✔ $BEFORE, стало $AFTER"
fi
rm -rf "$BDIR2"

# --- 48. start не бросает установку из-за одной записи ------------------------
# ЗАЧЕМ. Записи вроде dead-code нужен настоящий инструмент; переносимого рецепта у неё нет.
# На машине без него установка ПАДАЛА целиком: человек получал три сторожа вместо двенадцати и
# ни слова про остальные девять. Найдено прогоном на Windows, где нет ни ruff, ни vulture.
# Воспроизводим без Windows: урезаем PATH до одного node — инструментов не видно так же.
NRDIR="$(mktemp -d)"; NRBIN="$(mktemp -d)"
ln -sf "$(command -v node)" "$NRBIN/node"
( cd "$NRDIR" && git init -q . && mkdir -p src && printf 'a = 1  # noqa\n' > src/a.py )
NR_OUT=$( cd "$NRDIR" && PATH="$NRBIN" node "$CLI" start 2>&1 ); NR_CODE=$?
NR_GATES=$( ls "$NRDIR/gates" 2>/dev/null | grep -cv '^_' )
if [ "$NR_CODE" -eq 0 ] && [ "$NR_GATES" -ge 5 ] &&
   [ -f "$NRDIR/gates/gate-not-weakened/check.sh" ]; then
  ok "start пропускает запись без пригодного инструмента и ставит остальные ($NR_GATES)"
else
  bad "start бросил установку из-за одной записи" "код $NR_CODE, поставлено $NR_GATES, хвост: $(printf '%s' "$NR_OUT" | tail -2 | tr '\n' ' ')"
fi
rm -rf "$NRDIR" "$NRBIN"

# --- 48г. подделка не берёт уровень выше первого -------------------------------
# ЗАЧЕМ. Ступень AQK-2 называлась «гейты доказаны» и проверяла, что существуют две папки.
# Проект с гейтами `true` — командой, которая всегда отвечает «ок», — проходил порог AQK-3 и
# получал зелёный значок в README. Проверено прогоном 2026-09-07: три «гейта», ноль защиты,
# высший уровень. Это `pytest || true` на уровне всего стандарта.
FAKEDIR="$(mktemp -d)"
(
  cd "$FAKEDIR" && git init -q .
  mkdir -p gates ratchets incidents && printf '# Журнал\n' > incidents/README.md
  # Манифест пишется целиком, а не правится python-ом: проверка, которая на машине без python3
  # молча собирает ДРУГОЙ проект, доказывает не то, что называет. Найдено код-ревью 2026-09-07.
  {
    echo 'aqk: "0.6.0"'
    echo 'entry:'
    echo '  - AGENTS.md'
    echo 'rules: .aqk/rules'
    echo 'gates:'
    echo '  lint: "true"'
    echo '  test: "true"'
    echo '  security: "true"'
    echo 'samples: gates'
    echo 'ratchets: ratchets'
    echo 'lessons: incidents'
  } > .aqk.yml
  printf '# Свод\n' > AGENTS.md
  mkdir -p .aqk/rules && printf '# правила\n' > .aqk/rules/general.md
)
FAKE_OUT=$( cd "$FAKEDIR" && node "$CLI" doctor --run --min 3 2>&1 ); FAKE_CODE=$?
FAKE_PROVE=$( cd "$FAKEDIR" && node "$CLI" prove 2>&1 ); FAKE_PCODE=$?
# Проверяем ИМЕННО ту ступень, что назначена: без этого `grep 'AQK-1|AQK-3'` совпадал всегда,
# потому что doctor печатает все четыре строки в любом исходе. Пустая проверка хуже отсутствующей.
if [ "$FAKE_CODE" -ne 0 ] && [ "$FAKE_PCODE" -ne 0 ] &&
   printf '%s' "$FAKE_OUT" | grep -qE 'AQK-1\.?$|AQK-1[^0-9]' &&
   printf '%s' "$FAKE_OUT" | grep -qiE '(НЕ пройден|not passed|not reached)'; then
  ok "гейт «true» не берёт уровень выше первого"
else
  bad "подделка получила уровень" "порог: код $FAKE_CODE, доказательство: код $FAKE_PCODE, хвост: $(printf '%s' "$FAKE_OUT" | tail -2 | tr '\n' ' ')"
fi
rm -rf "$FAKEDIR"

# --- 48в. отказ установки называет, что поставить ------------------------------
# ЗАЧЕМ. Запись, у которой остался только рецепт под язык (`no-print-in-prod`, `swallowed-error`,
# `dead-code`), на машине без нужного инструмента ставиться не может — и это законно. Но отказ
# обязан быть действием, а не тупиком: «нет команды ни под python, ни общей» не говорит человеку
# ничего. Правило «находка без действия закрывает окно, а не дефект» — то же самое, что мы
# требуем от записей каталога, и к собственной программе оно относится так же.
# Найдено первым прогоном в чужом репозитории (httpx), 2026-09-07.
NODIR="$(mktemp -d)"; NOBIN="$(mktemp -d)"
ln -sf "$(command -v node)" "$NOBIN/node"
( cd "$NODIR" && git init -q . && mkdir -p src && printf 'x = 1\n' > src/a.py && PATH="$NOBIN" node "$CLI" init >/dev/null 2>&1 )
NO_OUT=$( cd "$NODIR" && PATH="$NOBIN" node "$CLI" add no-print-in-prod 2>&1 ); NO_CODE=$?
# Имя инструмента в отказе БЫЛО и до этой проверки — не хватало действия. Требуем оба:
# «ruff не установлен» — это диагноз, «поставь ruff» — это то, ради чего человек читает.
if [ "$NO_CODE" -ne 0 ] &&
   printf '%s' "$NO_OUT" | grep -q 'ruff' &&
   printf '%s' "$NO_OUT" | grep -qiE '(почини|поставь|install)'; then
  ok "отказ установки называет инструмент И что с ним делать"
else
  bad "отказ установки — тупик" "код $NO_CODE, вывод: $(printf '%s' "$NO_OUT" | tr '\n' ' ' | tail -c 200)"
fi
rm -rf "$NODIR" "$NOBIN"

# --- 48б. строгий режим приёмки: «не проверено» становится ошибкой -------------
# ЗАЧЕМ. «Записи не проверить, нет инструмента» — законное состояние на чужой машине и
# недопустимое на нашей: там инструменты ставит отдельный шаг, и жёлтая тильда вместо красного
# означает, что шаг не сработал. Ровно так и было: `pipx install vulture` стоял в конвейере с
# самого его появления, ставил vulture в каталог вне PATH, и запись dead-code не проверялась
# конвейером ни разу. Проверяем сам переключатель: на записи с заведомо отсутствующим
# инструментом обычный прогон зелёный, строгий — красный.
STPKG="$(mktemp -d)"
cp -r "$ROOT/tool" "$ROOT/kit" "$ROOT/package.json" "$STPKG/" 2>/dev/null
# Ломаем рецепт одной записи: программы с таким именем на машине нет ни у кого.
sed -i.bak 's|^  python: vulture .*|  python: aqk-nesuschestvuyuschiy-instrument {dir}|' \
  "$STPKG/kit/gates/dead-code/gate.yml" 2>/dev/null
# Переключатель задаётся явно в ОБЕ стороны. Без этого проверка наследовала AQK_GATES_STRICT
# из окружения — и в конвейере, где он поднят, «обычный» прогон был бы строгим, а проверка
# переключателя проверяла бы одно и то же дважды.
ST_SOFT_OUT=$(AQK_GATES_STRICT=0 bash "$STPKG/tool/selfcheck/gates.sh" 2>&1); ST_SOFT=$?
ST_HARD_OUT=$(AQK_GATES_STRICT=1 bash "$STPKG/tool/selfcheck/gates.sh" 2>&1); ST_HARD=$?
if [ "$ST_SOFT" -eq 0 ] && [ "$ST_HARD" -ne 0 ] &&
   printf '%s' "$ST_HARD_OUT" | grep -q 'строгий режим'; then
  ok "строгий режим делает «не проверено» ошибкой, обычный — нет"
else
  bad "строгий режим приёмки не работает" "обычный: $ST_SOFT, строгий: $ST_HARD"
fi
rm -rf "$STPKG"

# --- 49. выведенную запись не ставят, а называют преемника --------------------
# ЗАЧЕМ. Зрелость записи считается по доказательству, и объявить её нельзя — кроме одного
# состояния: `deprecated`. Оно объявляется, и весь его смысл в отказе: запись, которую всё ещё
# можно поставить одной командой, не выведена, а просто помечена. Проверяем сам отказ и то, что
# папка гейта в проекте НЕ появилась: половина установки хуже, чем её отсутствие.
#
# Каталог мутируем в КОПИИ пакета, а не в этом репозитории: проверка, которая правит собственные
# исходники, однажды упадёт посередине и оставит дерево грязным.
DEPKG="$(mktemp -d)"; DEPRJ="$(mktemp -d)"
cp -r "$ROOT/tool" "$ROOT/kit" "$ROOT/package.json" "$DEPKG/" 2>/dev/null
printf 'lifecycle: deprecated\nsuperseded_by: no-print-in-prod\n' >> "$DEPKG/kit/gates/todo-without-task/gate.yml"
( cd "$DEPRJ" && git init -q . && printf 'x = 1\n' > a.py && node "$DEPKG/tool/program.mjs" init >/dev/null 2>&1 )
DE_OUT=$( cd "$DEPRJ" && node "$DEPKG/tool/program.mjs" add todo-without-task 2>&1 ); DE_CODE=$?
if [ "$DE_CODE" -ne 0 ] &&
   printf '%s' "$DE_OUT" | grep -q 'no-print-in-prod' &&
   [ ! -d "$DEPRJ/gates/todo-without-task" ]; then
  ok "add отказывает в выведенной записи и называет ту, что её заменяет"
else
  bad "выведенная запись установилась или преемник не назван" "код $DE_CODE, папка: $([ -d "$DEPRJ/gates/todo-without-task" ] && echo есть || echo нет)"
fi
rm -rf "$DEPKG" "$DEPRJ"

# --- 50. --since показывает только то, что внёс диф ---------------------------
# ЗАЧЕМ. Первый прогон в живом проекте показывает долг за все годы. Стену красного не разбирают
# — проверку выключают целиком. Проверяем три исхода разом: старый долг молчит, новый краснеет,
# а гейт, который печатает вердикт без путей, НЕ становится зелёным от того, что его нечем сузить.
SCDIR="$(mktemp -d)"
(
  cd "$SCDIR" && git init -q . && git config user.email t@t && git config user.name t
  mkdir -p src && printf 'old = 1  # noqa\n' > src/old.py
  node "$CLI" init >/dev/null 2>&1
  node "$CLI" add gate-not-weakened >/dev/null 2>&1
  git add -A && git commit -qm "база" >/dev/null 2>&1
  printf 'fresh = 1  # noqa\n' > src/fresh.py
)
SC_WIDE=$( cd "$SCDIR" && node "$CLI" doctor --run 2>&1 )
SC_NARROW=$( cd "$SCDIR" && node "$CLI" doctor --run --since HEAD 2>&1 )
if printf '%s' "$SC_WIDE"   | grep -q 'old.py' &&
   printf '%s' "$SC_NARROW" | grep -q 'fresh.py' &&
   ! printf '%s' "$SC_NARROW" | grep -q 'old.py'; then
  ok "--since прячет старый долг и показывает внесённый дифом"
else
  bad "--since сузил не то" "широкий: $(printf '%s' "$SC_WIDE" | grep -c 'py:'), узкий: $(printf '%s' "$SC_NARROW" | grep -c 'py:')"
fi
# Несуществующая ссылка обязана быть отказом, а не тихим «сравнили с ничем».
SC_BAD=$( cd "$SCDIR" && node "$CLI" doctor --run --since net-takoy-vetki 2>&1 ); SC_BADCODE=$?
if [ "$SC_BADCODE" -ne 0 ] && printf '%s' "$SC_BAD" | grep -qi 'net-takoy-vetki'; then
  ok "--since с несуществующей ссылкой — отказ, а не тихое сравнение с ничем"
else
  bad "--since проглотил неверную ссылку" "код $SC_BADCODE"
fi
rm -rf "$SCDIR"

# --- 52. совет по починке не теряется в обрезке --------------------------------
# ЗАЧЕМ. Все записи каталога печатают «почини: …» последней строкой, а прогон показывал три
# первые и обрезал остальное — то есть ровно ту строку, ради которой человек смотрит на красное,
# он не видел никогда. Находка без действия закрывает окно, а не дефект.
ADIR="$(mktemp -d)"
(
  cd "$ADIR" && git init -q . && mkdir -p src
  for n in a b c d e; do printf '%s = 1  # noqa\n' "$n" > "src/$n.py"; done
  node "$CLI" init >/dev/null 2>&1
  node "$CLI" add gate-not-weakened >/dev/null 2>&1
)
A_OUT=$( cd "$ADIR" && node "$CLI" doctor --run 2>&1 )
if printf '%s' "$A_OUT" | grep -qiE '(почини|fix)[[:space:]]*:' &&
   printf '%s' "$A_OUT" | grep -qE 'py:[0-9]+'; then
  ok "совет по починке виден при обрезанных находках"
else
  bad "совет по починке потерялся" "находок в выводе: $(printf '%s' "$A_OUT" | grep -c 'py:')"
fi
rm -rf "$ADIR"

# --- 53. у долга есть цель и срок, и оба с последствием ------------------------
# ЗАЧЕМ. Реестр, который может только сокращаться, всё равно не знает, когда кончится, — и
# потому не кончается. Цель и срок без машинного последствия были бы украшением, поэтому
# проверяем ровно последствия: срок вышел — красное; цель достигнута — сказано вслух.
RDIR="$(mktemp -d)"
(
  cd "$RDIR" && git init -q . && mkdir -p src && printf 'a = 1  # noqa\n' > src/a.py
  node "$CLI" init >/dev/null 2>&1
  node "$CLI" add gate-not-weakened >/dev/null 2>&1
  node "$CLI" ratchet gate-not-weakened >/dev/null 2>&1
)
R_REG="$RDIR/ratchets/gate-not-weakened.txt"
if [ -f "$R_REG" ] && grep -q 'aqk-goal' "$R_REG"; then
  # Долг снят, новых нарушений нет — зелено.
  R_BASE=$( cd "$RDIR" && node "$CLI" doctor --run 2>&1 ); R_BASE_CODE=$?
  # Срок в прошлом — обязано покраснеть без единого нового нарушения.
  sed -i.bak 's/^# aqk-deadline:.*/# aqk-deadline: 2020-01-01/' "$R_REG"
  R_LATE=$( cd "$RDIR" && node "$CLI" doctor --run 2>&1 )
  if printf '%s' "$R_LATE" | grep -qi 'срок\|deadline'; then
    ok "срок долга вышел — храповик краснеет без новых нарушений"
  else
    bad "просроченный долг прошёл молча" "код базового прогона $R_BASE_CODE"
  fi
  # Цель заведомо достигнута — храповик обязан сказать, что обёртку пора убрать.
  sed -i.bak 's/^# aqk-deadline:.*/# aqk-deadline:/; s/^# aqk-goal:.*/# aqk-goal: 99/' "$R_REG"
  R_DONE=$( cd "$RDIR" && node "$CLI" doctor --run 2>&1 )
  if printf '%s' "$R_DONE" | grep -qi 'погашен\|paid off'; then
    ok "цель достигнута — храповик говорит убрать обёртку"
  else
    bad "погашенный долг не назван" "$(printf '%s' "$R_DONE" | grep -i ratchet | head -1)"
  fi
else
  bad "реестр долга не создан или без цели" "$R_REG"
fi
rm -rf "$RDIR"

# --- 54. упавший гейт не стирает реестр долга ----------------------------------
# ЗАЧЕМ. Провал без единой разобранной находки — это отказ инструмента, а не чистый прогон.
# Храповик вычёркивал ВЕСЬ реестр как исправленный, возвращал ноль и — после появления цели —
# предлагал снять защиту: «долг погашен, убери обёртку». Снятие защиты по итогам прогона,
# которого не было. Найдено ревью 2026-09-06.
WDIR="$(mktemp -d)"
mkdir -p "$WDIR/ratchets"
printf '# Реестр долга: проба\n# aqk-goal: 0\nsrc/a.py: печать\n' > "$WDIR/ratchets/t.txt"
W_OUT=$( cd "$WDIR" && bash "$ROOT/kit/ratchet/ratchet.sh" ratchets/t.txt sh -c 'exit 3' 2>&1 ); W_CODE=$?
W_LEFT=$(grep -c 'src/a.py' "$WDIR/ratchets/t.txt" || true)
if [ "$W_CODE" -ne 0 ] && [ "$W_LEFT" -eq 1 ] &&
   ! printf '%s' "$W_OUT" | grep -qi 'погашен'; then
  ok "упавший гейт не стирает реестр и не предлагает снять защиту"
else
  bad "упавший гейт съел реестр" "код $W_CODE, строк долга осталось $W_LEFT"
fi
# Директива с опечаткой обязана быть слышной: молчаливо отключённая цель — та же тишина.
printf '# Реестр\n# aqk-goal: скоро\nsrc/a.py: печать\n' > "$WDIR/ratchets/t.txt"
W_BAD=$( cd "$WDIR" && bash "$ROOT/kit/ratchet/ratchet.sh" ratchets/t.txt sh -c 'echo "src/a.py: печать"' 2>&1 )
if printf '%s' "$W_BAD" | grep -qi 'не число'; then
  ok "опечатка в директиве храповика названа, а не проглочена"
else
  bad "нечисловая цель отключилась молча" "$(printf '%s' "$W_BAD" | head -1)"
fi
rm -rf "$WDIR"

# --- 55. просроченный долг краснеет и при сужении по дифу ----------------------
# ЗАЧЕМ. Сообщение храповика про срок называет путь к реестру, а реестра в дифе нет: фильтр по
# путям отбрасывал единственную строку, находок не оставалось, и гейт печатался зелёным с
# пометкой «находки вне дифа». То есть `--since` отменял правило SPEC.md §7.6 ровно в том
# режиме, в котором его и запускают. Найдено ревью 2026-09-06.
DDIR="$(mktemp -d)"
(
  cd "$DDIR" && git init -q . && git config user.email t@t && git config user.name t
  mkdir -p src && printf 'a = 1  # noqa\n' > src/a.py
  node "$CLI" init >/dev/null 2>&1
  node "$CLI" add gate-not-weakened >/dev/null 2>&1
  node "$CLI" ratchet gate-not-weakened >/dev/null 2>&1
  sed -i.bak 's/^# aqk-deadline:.*/# aqk-deadline: 2020-01-01/' ratchets/gate-not-weakened.txt
  git add -A >/dev/null 2>&1 && git commit -qm base >/dev/null 2>&1
)
D_WIDE=$( cd "$DDIR" && node "$CLI" doctor --run 2>&1 )
D_NARROW=$( cd "$DDIR" && node "$CLI" doctor --run --since HEAD 2>&1 )
if printf '%s' "$D_WIDE" | grep -q 'gate-not-weakened' &&
   printf '%s' "$D_NARROW" | grep -qE 'gate-not-weakened.*(код|exit)' ; then
  ok "просроченный долг краснеет и при --since"
else
  bad "--since отменил срок долга" "узкий прогон: $(printf '%s' "$D_NARROW" | grep no-print | head -1 | cut -c1-90)"
fi
rm -rf "$DDIR"

# --- 56. совещательный гейт показан, но прогон не уронен -----------------------
# ЗАЧЕМ. Правило вводят в проект, где старый код ему не соответствует. Без третьего пути выбор
# из двух крайностей: включить и сломать сборку либо не включать вовсе. Проверяем обе стороны:
# без списка — роняет; со списком — показано и НАЗВАНО, а прогон зелёный. Молчание о
# совещательном гейте было бы выключенной проверкой, притворяющейся отсутствующей.
VDIR="$(mktemp -d)"
(
  cd "$VDIR" && git init -q . && mkdir -p src && printf 'a = 1  # noqa\n' > src/a.py
  node "$CLI" init >/dev/null 2>&1
  node "$CLI" add gate-not-weakened >/dev/null 2>&1
)
( cd "$VDIR" && node "$CLI" doctor --run --min 1 >/dev/null 2>&1 ); V_HARD=$?
printf '\nadvisory:\n  - gate-not-weakened\n' >> "$VDIR/.aqk.yml"
V_OUT=$( cd "$VDIR" && node "$CLI" doctor --run --min 1 2>&1 ); V_SOFT=$?
if [ "$V_HARD" -ne 0 ] && [ "$V_SOFT" -eq 0 ] &&
   printf '%s' "$V_OUT" | grep -qE 'advisory|совещательн' &&
   printf '%s' "$V_OUT" | grep -q 'src/a.py'; then
  ok "совещательный гейт показывает находки, называется и не роняет прогон"
else
  bad "совещательный режим работает не так" "обычный код $V_HARD, совещательный $V_SOFT"
fi
# Опечатка в имени поля обязана быть названа: «advisery:» молча означало бы «совещательных нет»,
# и правило, которое человек считал введённым, роняло бы сборку.
sed -i.bak 's/^advisory:/advisery:/' "$VDIR/.aqk.yml"
V_TYPO=$( cd "$VDIR" && node "$CLI" doctor 2>&1 )
if printf '%s' "$V_TYPO" | grep -qi 'advisery'; then
  ok "опечатка в имени поля манифеста названа"
else
  bad "опечатка в advisory проглочена" "$(printf '%s' "$V_TYPO" | tail -2 | head -1)"
fi
rm -rf "$VDIR"

# --- 81. версия в README и llms.txt та же, что в package.json ---------------
# Обе строки — инструкция по установке для постороннего: `rev:` для pre-commit и `@vX.Y.Z` для
# GitHub Action. Устаревшая ставит человеку не тот комплект и молчит об этом: команда проходит,
# ставится прошлогодняя версия. AGENTS.md требует, чтобы README и llms.txt не расходились, —
# и без прибора требование не работало: на 2026-09-08 в README стояло v0.6.0, а в llms.txt
# v0.4.2, отставание на два выпуска. Проверка сравнивает обе с package.json, а не друг с другом:
# совпасть друг с другом они могут и будучи одинаково устаревшими.
VERS_BAD=""
for VF in README.md llms.txt; do
  [ -f "$ROOT/$VF" ] || continue
  # Берём только версии AQK — «v1.2.3» в примерах чужих действий (actions/checkout@v4) не наши.
  for V in $(grep -oE '(rev:[[:space:]]*|Agent_Quality_Kit@)v[0-9]+\.[0-9]+\.[0-9]+' "$ROOT/$VF" \
             | grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+' | sort -u); do
    [ "$V" = "v$PKGVER" ] || VERS_BAD="${VERS_BAD:+$VERS_BAD, }$VF: $V"
  done
done
if [ -z "$VERS_BAD" ]; then
  ok "версия в README и llms.txt совпадает с package.json (v$PKGVER)"
else
  bad "версия в документах разошлась с package.json" "package.json: v$PKGVER; найдено — $VERS_BAD"
fi

# --- 82. report --since называет, чем доказан диф ---------------------------
# Три состояния у файла, и разница между вторым и третьим — весь смысл раздела: «проверка
# обошла и промолчала» не то же самое, что «никто не смотрел». Двух состояний хватило ровно до
# первого прогона — `tool/commands/doctor.mjs` попал в «никем не проверен», хотя его обходят
# пять проверок; они молчали, потому что нашли чисто.
EVDIR="$(mktemp -d)"
(
  cd "$EVDIR" || exit 1
  git init -q . && git config user.email a@b.c && git config user.name t
  mkdir -p src gates/noisy
  printf 'x = 1\n' > src/kept.py
  # Гейт, который печатает путь: по нему файл становится «назван».
  printf '#!/usr/bin/env sh\necho "src/kept.py:1: нашёл"\nexit 0\n' > gates/noisy/check.sh
  printf 'aqk: "1"\nentry: [AGENTS.md]\ngates:\n  noisy: "sh gates/noisy/check.sh ."\n' > .aqk.yml
  printf '# правила\n' > AGENTS.md
  git add -A >/dev/null 2>&1 && git commit -qm base >/dev/null 2>&1
  printf 'y = 2\n' > src/quiet.py
  git add -A >/dev/null 2>&1 && git commit -qm second >/dev/null 2>&1
) >/dev/null 2>&1
EV_OUT=$( cd "$EVDIR" && AQK_LANG=ru node "$CLI" report --since HEAD~1 2>&1 )
EV_FILE="$EVDIR/.aqk/report.md"
if [ -f "$EV_FILE" ] && grep -q "src/quiet.py" "$EV_FILE" && grep -q "Чем доказан" "$EV_FILE"; then
  ok "report --since называет, чем доказан диф"
else
  bad "report --since не отчитался о покрытии" "$(printf '%s' "$EV_OUT" | tail -2 | head -1)"
fi
# Ссылка, которой нет, обязана быть названа: «сравнили не с тем» не должно читаться как «чисто».
EV_BAD=$( cd "$EVDIR" && AQK_LANG=ru node "$CLI" report --since no-such-ref 2>&1 )
if printf '%s' "$EV_BAD" | grep -q "no-such-ref"; then
  ok "report --since называет неразобранную ссылку"
else
  bad "report --since проглотил неверную ссылку" "$(printf '%s' "$EV_BAD" | tail -2 | head -1)"
fi
rm -rf "$EVDIR"

# --- 84. learn читает только напечатанное человеком --------------------------
# Поле promptSource отделяет реплику от результата инструмента. Без него первая версия отбора
# выдавала вставленные пути и ссылки вместо правил — «agent quality kit» 44 раза.
# Каталог логов кладём ВНУТРЬ проекта и передаём относительным путём. Абсолютный сюда не
# годится: Git Bash на Windows отдаёт «/tmp/…», а Node в том же окружении читает это как
# «C:\tmp\…» — переменная указывает в никуда, и проверка падает не по делу.
LRNP="$(mktemp -d)"; LRN=".cfg"
# Имя каталога логов спрашиваем у самой программы, а не считаем здесь. На Windows оболочка
# отдаёт «/tmp/…», а Node видит «C:\Users\…» — две разные строки, и тест падал не по делу.
# Правило перевода пути в имя сторожит модульная проверка logSlug, здесь проверяется конвейер.
SLUG=$( cd "$LRNP" && node -e "const {pathToFileURL}=require('node:url');import(pathToFileURL(process.argv[1]).href).then(m=>console.log(m.logSlug(process.cwd())))" "$ROOT/tool/commands/learn.mjs" )
mkdir -p "$LRNP/$LRN/projects/$SLUG"
{
  printf '{"type":"user","promptSource":"typed","timestamp":"2026-09-08T10:00:00Z","message":{"role":"user","content":"никогда не коммить прямо в основную ветку"}}\n'
  printf '{"type":"user","promptSource":"typed","timestamp":"2026-09-08T10:01:00Z","message":{"role":"user","content":"ок го дальше"}}\n'
  printf '{"type":"user","timestamp":"2026-09-08T10:02:00Z","message":{"role":"user","content":[{"type":"tool_result","content":"нельзя обязательно всегда"}]}}\n'
} > "$LRNP/$LRN/projects/$SLUG/s1.jsonl"
printf '# правила\n- Ничего особенного.\n' > "$LRNP/AGENTS.md"
printf 'aqk: "1"\nentry: [AGENTS.md]\n' > "$LRNP/.aqk.yml"
LRN_OUT=$( cd "$LRNP" && CLAUDE_CONFIG_DIR="$LRN" AQK_LANG=ru node "$CLI" learn 2>&1 )
if printf '%s' "$LRN_OUT" | grep -q "основную ветку" &&
   ! printf '%s' "$LRN_OUT" | grep -q "го дальше" &&
   printf '%s' "$LRN_OUT" | grep -q "напечатано человеком: 2"; then
  ok "learn берёт напечатанное человеком и не берёт вывод инструментов"
else
  bad "learn отобрал не то" "$(printf '%s' "$LRN_OUT" | tr '\n' ' ' | cut -c1-150)"
fi
# Правило, уже стоящее в точке входа, показывать незачем: команда не пересказывает свод.
printf '# правила\n- Никогда не коммить прямо в основную ветку.\n' > "$LRNP/AGENTS.md"
LRN_W=$( cd "$LRNP" && CLAUDE_CONFIG_DIR="$LRN" AQK_LANG=ru node "$CLI" learn 2>&1 )
if printf '%s' "$LRN_W" | grep -q "уже стоит в точке входа"; then
  ok "learn молчит о правиле, которое уже записано"
else
  bad "learn повторил записанное правило" "$(printf '%s' "$LRN_W" | tr '\n' ' ' | cut -c1-150)"
fi
# Читает переписку — значит на диск не пишет ничего. Проверяем буквально.
if [ ! -d "$LRNP/.aqk" ] || [ -z "$(ls -A "$LRNP/.aqk" 2>/dev/null)" ]; then
  ok "learn ничего не записал на диск"
else
  bad "learn создал файлы" "$(ls -A "$LRNP/.aqk" | tr '\n' ' ')"
fi
rm -rf "$LRNP"

# --- 87. --baseline не совмещается с --run и --min ---------------------------
# `--baseline` выходит с нулём всегда: это осмотр, а не прогон. Совмещённый с порогом он давал
# конвейер, который НЕ МОЖЕТ покраснеть — порог назван, гейты не запущены, код нулевой. Найдено
# ревью 2026-09-08. Отказ должен быть громким: молчаливое зелёное здесь дороже сломанной команды.
BLP="$(mktemp -d)"
( cd "$BLP" && git init -q . && printf 'aqk: "1"\nentry: [AGENTS.md]\n' > .aqk.yml && printf '# правила\n' > AGENTS.md ) >/dev/null 2>&1
BL_OK=$( cd "$BLP" && AQK_LANG=ru node "$CLI" doctor --baseline 2>&1 ); BL_OK_C=$?
BL_BAD=$( cd "$BLP" && AQK_LANG=ru node "$CLI" doctor --baseline --min 1 2>&1 ); BL_BAD_C=$?
BL_RUN=$( cd "$BLP" && AQK_LANG=ru node "$CLI" doctor --baseline --run 2>&1 ); BL_RUN_C=$?
if [ "$BL_OK_C" -eq 0 ] && [ "$BL_BAD_C" -ne 0 ] && [ "$BL_RUN_C" -ne 0 ] &&
   printf '%s' "$BL_BAD" | grep -q "не может покраснеть"; then
  ok "--baseline с --min и --run отказывает вслух, сам по себе работает"
else
  bad "--baseline не отказал на пороге" "коды: сам $BL_OK_C, с --min $BL_BAD_C, с --run $BL_RUN_C"
fi
rm -rf "$BLP"

# --- 88. записи каталога не ломаются от цвета в выводе арбитра ---------------
# Внутри GitHub Actions чужие инструменты КРАСЯТ вывод: там цвет поддержан, вне конвейера они
# его выключают сами. Разбор по началу строки тогда промахивается — строка начинается с
# escape-последовательности. Поймано конвейером 2026-09-08 на записи ci-not-hijackable: локально
# зелёная, в конвейере «формат сменился». Тот же класс уже записан в scope.mjs.
CLR_BAD=""
for CG in kit/gates/*/check.sh; do
  CS=$(basename "$(dirname "$CG")")
  # Только записи с готовым арбитром: у них вывод чужой, и красит его не наш код.
  grep -q "^requires:" "$(dirname "$CG")/gate.yml" 2>/dev/null || continue
  command -v "$(sed -n 's/^requires:[[:space:]]*//p' "$(dirname "$CG")/gate.yml" | head -1 | awk '{print $1}')" >/dev/null 2>&1 || continue
  PLAIN=$(bash "$CG" "$(dirname "$CG")/green" >/dev/null 2>&1; echo $?)
  COLOR=$(GITHUB_ACTIONS=true CI=true bash "$CG" "$(dirname "$CG")/green" >/dev/null 2>&1; echo $?)
  [ "$PLAIN" = "$COLOR" ] || CLR_BAD="${CLR_BAD:+$CLR_BAD, }$CS ($PLAIN vs $COLOR)"
done
if [ -z "$CLR_BAD" ]; then
  ok "вердикт записи не зависит от того, красит ли арбитр вывод"
else
  bad "цвет в выводе арбитра меняет вердикт" "$CLR_BAD"
fi

# --- 89. шапка doctor читает манифест, а не литеральные пути ------------------
# Отзыв второго пользователя 2026-09-08: у проекта `rules: .temper/rules`, правила на месте,
# СТУПЕНЬ по манифесту берётся — а шапка рисовала кресты за `.aqk/rules` и `.aqk/docs` и
# советовала сделать сделанное. Вывод расходился с собственным вердиктом программы, напечатанным
# на десять строк ниже. Модульная проверка сторожит функцию; эта — то, что её кто-то зовёт.
LYP="$(mktemp -d)"
( cd "$LYP" && git init -q . && mkdir -p .temper/rules .temper/docs &&
  printf 'правило\n' > .temper/rules/r.md && printf 'методичка\n' > .temper/docs/d.md &&
  printf '# вход\n' > CLAUDE.md && printf '.x\n' > .gitignore &&
  printf 'aqk: 1\nentry:\n  - CLAUDE.md\nrules: .temper/rules\ndocs: .temper/docs\ngates:\n  smoke: "true"\n' > .aqk.yml ) >/dev/null 2>&1
LY=$( cd "$LYP" && AQK_LANG=ru node "$CLI" doctor 2>&1 )
if printf '%s' "$LY" | grep -q "\.temper/rules" &&
   printf '%s' "$LY" | grep -q "\.temper/docs" &&
   printf '%s' "$LY" | grep -q "CLAUDE\.md" &&
   ! printf '%s' "$LY" | grep -q "\.aqk/rules" &&
   ! printf '%s' "$LY" | grep -q "неизвестное поле"; then
  ok "шапка doctor берёт правила, методички и вход из манифеста"
else
  bad "doctor проверил не то, что объявлено в манифесте" "$(printf '%s' "$LY" | head -8)"
fi
rm -rf "$LYP"

# --- 90. блок состояния: тишина не выдаётся за «чисто» -----------------------
# Читатель этого блока — машина. Человек, увидев пустое место, переспросит; агент примет его
# за утверждение и пойдёт писать код по несуществующему разрешению. Поэтому главное здесь одно:
# без прогона блок обязан сказать «неизвестно» СЛОВОМ.
CTXP="$(mktemp -d)"
( cd "$CTXP" && git init -q . ) >/dev/null 2>&1
CTX=$( cd "$CTXP" && AQK_LANG=ru node "$CLI" context 2>&1 ); CTX_C=$?
if [ "$CTX_C" -eq 0 ] &&
   printf '%s' "$CTX" | grep -q "НЕИЗВЕСТНО" &&
   printf '%s' "$CTX" | grep -q "не вычислен" &&
   ! printf '%s' "$CTX" | grep -q "AGENTS.md"; then
  ok "context без прогона говорит «неизвестно» и не называет несуществующий свод"
else
  bad "context выдал незнание за чистоту" "код $CTX_C: $(printf '%s' "$CTX" | head -5)"
fi

# --- 91. хук ставится в общий файл и не затирает чужие настройки --------------
mkdir -p "$CTXP/.claude"
printf '{ "permissions": { "deny": ["Read(./.env)"] } }\n' > "$CTXP/.claude/settings.json"
( cd "$CTXP" && AQK_LANG=ru node "$CLI" context --install ) >/dev/null 2>&1
AGAIN=$( cd "$CTXP" && AQK_LANG=ru node "$CLI" context --install 2>&1 )
HOOKS=$(node_in "$CTXP" -e 'const s=require("./.claude/settings.json");
  console.log([s.hooks?.SessionStart?.length, s.permissions?.deny?.length,
    /[/\\]program\.mjs/.test(JSON.stringify(s.hooks?.SessionStart||[]))].join(" "))' 2>&1)
if [ "$HOOKS" = "1 1 false" ] && printf '%s' "$AGAIN" | grep -q "уже стоит"; then
  ok "хук ставится один раз, переносимой командой, чужие настройки целы"
else
  bad "установка хука испортила настройки или задвоилась" "разбор: $HOOKS"
fi
rm -rf "$CTXP"

# --- 92. полный блок: карта и свод дословно ----------------------------------
# Решение владельца 2026-09-08, принятое ПОСЛЕ возражения про длину входа: агент читает файлы
# плохо, и лишние токены — плата за то, чтобы он не ошибался. Раз плата внесена, товар обязан
# быть доставлен: свод дословно, а не пересказ, и карта команд, а не половина карты.
FULP="$(mktemp -d)"
( cd "$FULP" && git init -q . &&
  printf '# Свод\n\n- Правило-маячок-для-проверки. <!-- aqk: человек -->\n' > AGENTS.md &&
  printf 'aqk: 1\nentry:\n  - AGENTS.md\n' > .aqk.yml ) >/dev/null 2>&1
FUL=$( cd "$FULP" && AQK_LANG=ru node "$CLI" context --full 2>&1 )
SHORT=$( cd "$FULP" && AQK_LANG=ru node "$CLI" context 2>&1 )
if printf '%s' "$FUL" | grep -q "Правило-маячок-для-проверки" &&
   printf '%s' "$FUL" | grep -q "doctor --run --since main" &&
   printf '%s' "$FUL" | grep -q "ЧТО УМЕЕТ ЭТОТ ИНСТРУМЕНТ" &&
   ! printf '%s' "$SHORT" | grep -q "Правило-маячок-для-проверки"; then
  ok "context --full несёт карту и свод дословно, обычный — нет"
else
  bad "полный блок не донёс свод или карту" "$(printf '%s' "$FUL" | head -4)"
fi

# --- 93. хук с --full ставится именно с флагом -------------------------------
( cd "$FULP" && AQK_LANG=ru node "$CLI" context --full --install ) >/dev/null 2>&1
FLAG=$(node_in "$FULP" -e 'const s=require("./.claude/settings.json");
  console.log(JSON.stringify(s.hooks?.SessionStart||[]).includes("--full"))' 2>&1)
if [ "$FLAG" = "true" ]; then
  ok "хук, поставленный с --full, зовёт полный блок, а не короткий"
else
  bad "хук потерял --full — вливался бы короткий блок" "разбор: $FLAG"
fi
rm -rf "$FULP"

# --- 94. отсев сгенерированных файлов: края, а не середина -------------------
# `drop_generated` заменил цикл `while read; do is_generated; done` — два процесса на файл.
# Замер на шести чужих проектах дал ноль расхождений, но отсеяно там было 5 файлов из 1242:
# такая сверка почти ничего не доказывает. Набор ниже нарочный, и он сразу нашёл ДВА
# расхождения, которых на живых проектах не было, — пробел и двоеточие в имени файла.
GENP="$(mktemp -d)"
mkg() { printf '%b' "$2" > "$GENP/$1"; }
mkg 'l1.js'        '// @generated\ncode\n'
mkg 'l5.js'        'a\nb\nc\nd\n// @generated\n'
mkg 'l6.js'        'a\nb\nc\nd\ne\n// @generated\n'
mkg 'upper.js'     '// @GENERATED\n'
mkg 'donotedit.js' '// Do Not Edit\n'
mkg 'autogen.js'   '// auto-generated by tool\n'
mkg 'genby.js'     '// Generated by protoc\n'
mkg 'cyr.js'       '// сгенерирован автоматически\n'
mkg 'cyrup.js'     '// СГЕНЕРИРОВАН\n'
mkg 'with space.js' '// @generated\n'
mkg 'with:colon.js' '// @generated\n'
mkg 'clean.js'     'const x = 1;\n'
: > "$GENP/empty.js"
KEPT=$( . "$ROOT/kit/gates/_skip.sh"; find "$GENP" -type f | sort | drop_generated | sed "s#$GENP/##" | sort | tr '\n' ' ' )
# Ожидания абсолютные, а не «как было раньше»: старая функция однажды уйдёт, а края останутся.
# l6 остаётся намеренно: маркер на шестой строке — это уже не шапка файла.
if [ "$KEPT" = "clean.js empty.js l6.js " ]; then
  ok "сгенерированные отсеяны по всем маркерам; пробел, двоеточие и граница 5-й строки учтены"
else
  bad "отсев сгенерированных изменился" "осталось: $KEPT"
fi
rm -rf "$GENP"

# --- итог -------------------------------------------------------------------
printf '\n'
if [ "$FAIL" -eq 0 ]; then
  printf '  \033[32mвсё зелёное: %s проверок\033[0m\n\n' "$PASS"
else
  printf '  \033[31mпровалено: %s из %s\033[0m\n\n' "$FAIL" "$((PASS + FAIL))"
fi

printf '  \033[2mне покрыто: содержание документов, установка с GitHub через npx\033[0m\n\n'
exit "$FAIL"
