// Проверки разбора истории для `aqk probe`. Написаны ДО кода: без них нельзя отличить
// «функция работает» от «функция написана».
import test from "node:test";
import assert from "node:assert/strict";
import { isFix, fixHotspots, probeSummary, probeVerdictPaired, countProbe } from "../lib/history.mjs";
import { probeableGates, gatesState, extAlternatives, planProbeGates, isCode } from "../commands/probe.mjs";
import { blindAdvice } from "../lib/advice.mjs";

// Признак починки берётся из ТЕМЫ коммита, а не из тела: тема — единственное, что пишут все,
// и единственное, что видно в `git log --oneline`. Три написания, потому что репозитории
// бывают на двух языках и с conventional commits.
test("темой починки считаются fix, исправ и почин — на обоих языках и с областью", () => {
  assert.equal(isFix("fix: гейт молчал на красном"), true);
  assert.equal(isFix("fix(prove): windows-пути"), true);
  assert.equal(isFix("Исправлено: разбор манифеста"), true);
  assert.equal(isFix("починка отчёта"), true);
  assert.equal(isFix("FIX: заглавными тоже"), true);
});

// Слово «fix» внутри обычной темы починкой не делает: иначе «feat: prefix для путей» попадёт
// в рейтинг, и рейтинг перестанет что-либо значить.
test("не всякое упоминание fix — починка", () => {
  assert.equal(isFix("feat: prefix для путей"), false);
  assert.equal(isFix("docs: как чинить гейт"), false);
  assert.equal(isFix("refactor: суффиксы"), false);
  assert.equal(isFix(""), false);
});

// НАСТОЯЩИЙ формат `git log --format=%s --name-only`, снятый с живого репозитория 2026-09-09:
// тема, ПУСТАЯ строка, пути, и сразу следующая тема — без пустой строки перед ней.
// Первая версия этого теста была написана по моему представлению о формате (пустая строка
// СЛЕДОВАЛА за файлами), код под неё разобрал историю неверно и нашёл ноль починок там, где
// их сорок пять. Тот же класс, что и дважды сегодня: проверял замысел, а не вывод.
const LOG = [
  "fix: разбор манифеста",
  "",
  "tool/lib/manifest.mjs",
  "tool/selfcheck/units.mjs",
  "feat: новая запись",
  "",
  "kit/gates/x/check.sh",
  "fix(manifest): кавычки",
  "",
  "tool/lib/manifest.mjs",
  "README.md",
].join("\n");

test("рейтинг считает только файлы из коммитов-починок", () => {
  const hot = fixHotspots(LOG, { isCode: () => true });
  assert.deepEqual(hot[0], { path: "tool/lib/manifest.mjs", fixes: 2 });
  // Файл из коммита-фичи в рейтинг не попадает вовсе.
  assert.equal(hot.some((h) => h.path === "kit/gates/x/check.sh"), false);
});

test("рейтинг отсеивает то, что не код: документ чинят иначе, чем программу", () => {
  const hot = fixHotspots(LOG, { isCode: (p) => p.endsWith(".mjs") });
  assert.equal(hot.some((h) => h.path === "README.md"), false);
  assert.equal(hot.length, 2);
});

test("пустая история — пустой рейтинг, а не падение", () => {
  assert.deepEqual(fixHotspots("", { isCode: () => true }), []);
});


// Пробуется ЛЮБАЯ непустая команда: образец подсаживается в копию проекта, а не в аргумент
// команды, поэтому форма команды больше ничего не решает. До 2026-09-10 здесь стояло обратное
// правило — «кончается каталогом», — и из-за него проба не запускалась у шести чужих
// репозиториев из семи.
test("пробуется любая непустая команда, форма больше не решает", () => {
  const man = { gates: {
    dir: "bash gates/x/check.sh .",
    npm: "npm test",
    glob: "eslint lib/**/*.js",
    empty: "",
    blank: "   ",
  } };
  assert.deepEqual(probeableGates(man).map(([n]) => n), ["dir", "npm", "glob"]);
});

test("манифест без гейтов не роняет разбор", () => {
  assert.deepEqual(probeableGates(null), []);
  assert.deepEqual(probeableGates({ gates: [] }), []);
});

// Образцы каталога исключены по той же причине, по какой их исключает каждая сканирующая
// проверка: они существуют, чтобы быть неправильными, и «горячими» быть не могут.
test("горячим считается код, но не документ и не образец каталога", () => {
  assert.equal(isCode("src/a.py"), true);
  assert.equal(isCode("tool/lib/core.mjs"), true);
  assert.equal(isCode("README.md"), false);
  assert.equal(isCode("gates/secrets-not-in-code/red/a.py"), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// Итог пробы. Написано ДО кода 2026-09-10, после замера на чужеподобном проекте.
//
// ЗАЧЕМ. Итог считался одним числом: `blind ? «есть дыры» : «поймано всё»`. Исходов у
// пробы три (`probeVerdict`: caught · blind · unknown), а ветки две — и `unknown`
// молча падал в «поймано всё». Замер: проба, где ЕДИНСТВЕННАЯ запись вернула
// «нечем проверить — инструмент не установлен», напечатала «в пробованных местах
// каждый применимый класс кем-то ловится». Ошибка запуска выдана за чистоту — ровно
// тот класс, ради которого написан весь стандарт, в нашей же главной команде.
test("итог пробы: ничего не запустилось — это НЕ чистота", () => {
  assert.equal(probeSummary({ caught: 0, blind: 0, unknown: 4 }), "nothing-ran");
});

test("итог пробы: поймано и при этом что-то не проверили — это НЕ чистота", () => {
  assert.equal(probeSummary({ caught: 3, blind: 0, unknown: 2 }), "partial");
});

// Исходы перечислены исчерпывающе: у каждого сочетания есть имя, и ни одно не
// сваливается в соседнее по умолчанию.
test("итог пробы: остальные сочетания названы каждое своим именем", () => {
  assert.equal(probeSummary({ caught: 3, blind: 0, unknown: 0 }), "clean");
  assert.equal(probeSummary({ caught: 0, blind: 2, unknown: 0 }), "blind");
  assert.equal(probeSummary({ caught: 3, blind: 2, unknown: 1 }), "blind");
  assert.equal(probeSummary({ caught: 0, blind: 0, unknown: 0 }), "nothing-probed");
});

// ─────────────────────────────────────────────────────────────────────────────
// Отчего проба не состоялась. Написано ДО кода 2026-09-10.
//
// ЗАЧЕМ. `scanningGates` намеренно берёт только гейты, чья команда кончается каталогом:
// подставить образец больше некуда. Фильтр верен, сломан ОТВЕТ. При двух объявленных
// гейтах проба говорила «гейтов не объявлено — нечем пробовать, сначала: aqk add» и
// отправляла человека заводить то, что у него уже есть.
//

test("гейтов нет вовсе — и это другое состояние", () => {
  assert.deepEqual(gatesState({ gates: {} }), { state: "none", declared: 0, probeable: 0 });
  assert.deepEqual(gatesState(null), { state: "none", declared: 0, probeable: 0 });
});

// Пустая команда не считается объявленным гейтом: объявление без команды ничего не
// защищает, и его же отклоняет `gates-are-runnable`.
test("пустая команда гейтом не считается", () => {
  assert.deepEqual(gatesState({ gates: { a: "", b: "  " } }), { state: "none", declared: 0, probeable: 0 });
});

test("объявленные гейты пригодны все — состояний осталось два", () => {
  const man = { gates: { scan: "bash gates/x/check.sh .", test: "npm test" } };
  assert.deepEqual(gatesState(man), { state: "ok", declared: 2, probeable: 2 });
});

// Файлы, которым проба НЕ ДЕЛАЛАСЬ ВОВСЕ, тоже обязаны попадать в итог. Написано ДО кода
// 2026-09-10, после прогона на самом комплекте: из пяти горячих файлов два (`.mjs`) не
// пробовались никак — красного образца такого расширения в каталоге нет ни одного, — а итог
// сказал «каждый применимый класс кем-то ловится». Оговорка «в пробованных местах» верна
// буквально и обманывает по смыслу: она молча сужает утверждение до мест, где проба удалась,
// и никогда не говорит, сколько мест пропущено. Ровно та тишина, которая читается как чисто.
test("итог пробы: непробованные файлы не дают права говорить «чисто»", () => {
  assert.equal(probeSummary({ caught: 3, blind: 0, unknown: 0, unprobed: 2 }), "partial");
  assert.equal(probeSummary({ caught: 0, blind: 0, unknown: 0, unprobed: 2 }), "nothing-probed");
});

test("итог пробы: «чисто» — только когда пропущенных нет", () => {
  assert.equal(probeSummary({ caught: 3, blind: 0, unknown: 0, unprobed: 0 }), "clean");
});

// ─────────────────────────────────────────────────────────────────────────────
// Парный вердикт пробы: гейт прогоняется ДВАЖДЫ — по чистой песочнице и по ней же с
// подсаженным образцом. Написано ДО кода 2026-09-10.
//
// ЗАЧЕМ. Проба умела подставлять образец только гейтам, чья команда кончается каталогом.
// Замер на семи склонированных чужих репозиториях: у шести из семи (chalk, execa, axios,
// requests, click, dependency-cruiser) команды — `xo`, `eslint lib/**/*.js`, `mocha --require…`,
// `pytest`, — и проба не запускалась вовсе. То есть на настоящих проектах она давала ноль
// сведений.
//
// Способ взят не из головы: так работает мутационное тестирование двадцать лет. Stryker
// копирует проект во временный каталог, симлинкует `node_modules` и гоняет там РОДНУЮ команду
// тестов; PIT и mutmut делают то же. Прогон по чистой копии («dry run») там обязателен —
// без него нельзя отличить «поймал подсадку» от «был красным и до неё».
function pairs(before, after) {
  return { before: before.map(([name, code]) => ({ name, code })),
           after: after.map(([name, code]) => ({ name, code })) };
}

test("парный вердикт: был зелёным, с подсадкой покраснел — поймано", () => {
  const { before, after } = pairs([["lint", 0], ["test", 0]], [["lint", 0], ["test", 1]]);
  assert.equal(probeVerdictPaired(before, after).verdict, "caught");
});

test("парный вердикт: был зелёным и остался — не поймано никем", () => {
  const { before, after } = pairs([["lint", 0], ["test", 0]], [["lint", 0], ["test", 0]]);
  assert.equal(probeVerdictPaired(before, after).verdict, "blind");
});

// Гейт, красный ЕЩЁ ДО подсадки, о подсадке не говорит ничего: его краснота объясняется
// состоянием проекта. Считать её поимкой значит выдавать чужой долг за свою заслугу.
test("парный вердикт: гейт был красным до подсадки — судить по нему нельзя", () => {
  const { before, after } = pairs([["lint", 1]], [["lint", 1]]);
  const r = probeVerdictPaired(before, after);
  assert.equal(r.verdict, "unknown");
  assert.equal(r.alreadyRed, 1);
  assert.equal(r.usable, 0);
});

// Сбой ЗАПУСКА (код не 0 и не 1) исключает ОДИН гейт, а не весь вердикт: если сосед
// отработал и поймал, знание получено.
test("парный вердикт: сбой одного гейта не отменяет поимку другим", () => {
  const { before, after } = pairs([["broken", 127], ["test", 0]], [["broken", 127], ["test", 1]]);
  const r = probeVerdictPaired(before, after);
  assert.equal(r.verdict, "caught");
  assert.equal(r.failed, 1);
  assert.equal(r.usable, 1);
});

test("парный вердикт: судить не по чему — все гейты либо сломаны, либо уже красные", () => {
  const { before, after } = pairs([["a", 127], ["b", 1]], [["a", 127], ["b", 1]]);
  const r = probeVerdictPaired(before, after);
  assert.equal(r.verdict, "unknown");
  assert.equal(r.failed, 1);
  assert.equal(r.alreadyRed, 1);
});

// Позеленение от подсадки — тоже не поимка, а признак, что гейт смотрит не туда.
test("парный вердикт: гейт позеленел от подсадки — это не поимка", () => {
  const { before, after } = pairs([["odd", 1]], [["odd", 0]]);
  assert.equal(probeVerdictPaired(before, after).verdict, "unknown");
});

// Гейт работал ДО подсадки и сломался ОТ неё. Он мог быть тем самым ловцом — «никто не ловит»
// о нём сказать нельзя. Найдено пробой на самом комплекте 2026-09-11: образец лёг на место
// kit/gates/_skip.sh, общей библиотеки двенадцати гейтов, все двенадцать вышли с кодом 2 —
// включая gate-not-weakened, который в отдельной папке этот образец ловит. Остальные молчали,
// и проба назвала класс слепым; doctor повторил это человеку жирным.
test("парный вердикт: подсадка сломала работавший гейт — «не смогли», а не «слеп»", () => {
  const { before, after } = pairs([["lint", 0], ["units", 0]], [["lint", 2], ["units", 0]]);
  const r = probeVerdictPaired(before, after);
  assert.equal(r.verdict, "unknown");
  assert.equal(r.brokenByPlant, 1);
  // Поимка соседом остаётся поимкой: знание получено, и сломанный гейт его не отменяет.
  const other = pairs([["lint", 0], ["units", 0]], [["lint", 2], ["units", 1]]);
  assert.equal(probeVerdictPaired(other.before, other.after).verdict, "caught");
});

test("парный вердикт: гейтов нет вовсе", () => {
  assert.equal(probeVerdictPaired([], []).verdict, "unknown");
});

// ─────────────────────────────────────────────────────────────────────────────
// Семьи расширений. Написано ДО кода 2026-09-10.
//
// ЗАЧЕМ. Образец подбирается по ТОЧНОМУ совпадению расширения, и это правило верное: питоновский
// образец в проекте на TypeScript не проверит ничего, а покажет «не прикрыто» — ложная тревога
// того же класса, что молчащий гейт, только наоборот.
//
// Но `.js` и `.mjs` — это один язык и одно содержимое, а не два. Прогон пробы на САМОМ комплекте
// 2026-09-10: два горячих файла из пяти — `tool/i18n/en.mjs` и `ru.mjs`, — и обоим ответили «в
// каталоге нет красного образца под .mjs». Комплект целиком написан в этом расширении, то есть
// проба слепа к собственному коду. Заводить второй набор файлов ради той же строчки кода —
// дублирование, которое разойдётся через месяц.
//
// Семьи узкие намеренно. `.jsx`/`.tsx` сюда не входят: у них своя разметка, и образец без неё
// проверит не то, ради чего запись существует.
test("семья расширений: .mjs и .cjs берут образец .js, и наоборот", () => {
  assert.deepEqual(extAlternatives(".mjs"), [".mjs", ".js", ".cjs"]);
  assert.deepEqual(extAlternatives(".js"), [".js", ".mjs", ".cjs"]);
});

test("семья расширений: .ts со своими, и точное совпадение всегда первое", () => {
  assert.equal(extAlternatives(".mts")[0], ".mts");
  assert.ok(extAlternatives(".mts").includes(".ts"));
  assert.ok(!extAlternatives(".ts").includes(".js"));
});

// Расширение вне семьи остаётся один на один с собой: это и есть запрет подсовывать
// питоновский образец в чужой язык.
test("семья расширений: одиночка не получает чужих родственников", () => {
  assert.deepEqual(extAlternatives(".py"), [".py"]);
  assert.deepEqual(extAlternatives(".rs"), [".rs"]);
  assert.deepEqual(extAlternatives(".tsx"), [".tsx"]);
});

// ─────────────────────────────────────────────────────────────────────────────
// План пробы: каким гейтом пробовать, в каком порядке и каким — не пробовать. Написано ДО кода.
//
// ЗАЧЕМ. Цена пробы = (файлы × записи) × сумма длительностей ВСЕХ гейтов. На самом комплекте
// после перехода на песочницу это стало больше десяти минут и упёрлось в таймаут: среди 30
// гейтов есть `smoke` на 58 секунд, и он гонялся заново на каждую подсадку. Команда, которая
// идёт четверть часа, не запускается никем — то есть чинить надо здесь, а не «когда-нибудь».
//
// Длительности берутся из СУХОГО ПРОГОНА, который и так обязателен, — лишних запусков нет.
// Порядок: от быстрых к медленным, чтобы ранний выход на первом красном срабатывал чаще.
// Слишком медленные исключаются, но НЕ молча: их имена обязаны попасть в вывод, иначе
// «никто не ловит» будет означать «никто из тех, кого мы решили спросить».
test("план пробы: гейты идут от быстрых к медленным", () => {
  const before = [
    { name: "smoke", code: 0, ms: 58000 },
    { name: "lint", code: 0, ms: 300 },
    { name: "types", code: 0, ms: 4000 },
  ];
  const plan = planProbeGates(before, { slowMs: 20000 });
  assert.deepEqual(plan.use.map((g) => g.name), ["lint", "types"]);
});

test("план пробы: слишком медленный назван поимённо, а не выброшен молча", () => {
  const before = [{ name: "smoke", code: 0, ms: 58000 }, { name: "lint", code: 0, ms: 300 }];
  const plan = planProbeGates(before, { slowMs: 20000 });
  assert.deepEqual(plan.tooSlow.map((g) => g.name), ["smoke"]);
});

// Уже красный и сломанный не попадают в план вообще: судить по ним нельзя, а гонять их на
// каждую подсадку — платить за то, что всё равно не будет засчитано.
test("план пробы: уже красные и несработавшие в план не берутся", () => {
  const before = [
    { name: "red", code: 1, ms: 100 },
    { name: "broken", code: 127, ms: 50 },
    { name: "ok", code: 0, ms: 100 },
  ];
  const plan = planProbeGates(before, { slowMs: 20000 });
  assert.deepEqual(plan.use.map((g) => g.name), ["ok"]);
  assert.deepEqual(plan.tooSlow, []);
});

// Все годные оказались медленными — пробовать нечем, и это НЕ «никто не ловит».
test("план пробы: все годные медленные — пробовать нечем", () => {
  const plan = planProbeGates([{ name: "smoke", code: 0, ms: 58000 }], { slowMs: 20000 });
  assert.deepEqual(plan.use, []);
  assert.deepEqual(plan.tooSlow.map((g) => g.name), ["smoke"]);
});

// ─────────────────────────────────────────────────────────────────────────────
// Счёт непокрытого: КЛАССЫ, а не проба×файл. Написано ДО кода 2026-09-10.
//
// ЗАЧЕМ. Замер на десяти живых репозиториях: у requests, click, flask и httpx проба сказала
// «непокрытых классов: 18». Различных классов там ШЕСТЬ — они просто повторены по трём горячим
// файлам. Втрое завышенное число, и завышаем его мы сами, ровно тем приёмом, который ловим у
// других: считаем события, а называем их сущностями.
//
// Списки у всех четырёх проектов совпали побайтово — то есть ответ говорит не про репозиторий,
// а про связку `ruff + pytest`. Это законный ответ («ваш инструментарий не покрывает вот эти
// шесть классов»), но продавать его как восемнадцать находок ИМЕННО У ВАС нельзя.
//
// Число проб остаётся видно отдельно: «шесть классов на трёх файлах» и «шесть классов на
// одном» — разные факты, и сливать их тоже нельзя.
test("счёт непокрытого: шесть классов на трёх файлах — это шесть, а не восемнадцать", () => {
  const recs = [];
  for (const f of ["a.py", "b.py", "c.py"]) {
    for (const e of ["secrets", "dead-code", "print", "swallowed", "todo", "suppress"]) {
      recs.push({ entry: e, file: f, verdict: "blind" });
    }
  }
  const r = countProbe(recs);
  assert.equal(r.blindClasses, 6);
  assert.equal(r.probes, 18);
});

// Класс, слепой ХОТЬ ГДЕ-ТО, — дыра. Пойманный в одном файле и слепой в другом остаётся дырой:
// «где-то ловится» не защищает то место, где не ловится.
test("счёт непокрытого: слепой хоть где-то считается непокрытым", () => {
  const r = countProbe([
    { entry: "secrets", file: "a.py", verdict: "caught" },
    { entry: "secrets", file: "b.py", verdict: "blind" },
    { entry: "todo", file: "a.py", verdict: "caught" },
  ]);
  assert.equal(r.blindClasses, 1);
  assert.equal(r.caughtClasses, 2);
});

test("счёт непокрытого: исходы разложены по своим корзинам", () => {
  const r = countProbe([
    { entry: "a", file: "f", verdict: "caught" },
    { entry: "b", file: "f", verdict: "unknown" },
    { entry: "c", file: "f", verdict: "blind" },
  ]);
  assert.deepEqual(
    { b: r.blindClasses, c: r.caughtClasses, u: r.unknownClasses, p: r.probes },
    { b: 1, c: 1, u: 1, p: 3 });
});

test("счёт непокрытого: пусто не роняет", () => {
  assert.deepEqual(countProbe([]), { blindClasses: 0, caughtClasses: 0, unknownClasses: 0, probes: 0 });
});

// ─────────────────────────────────────────────────────────────────────────────
// Непокрытый класс объясняется, а не называется. Написано ДО кода 2026-09-10.
//
// ЗАЧЕМ. Проба находит настоящие дыры — и печатает про них «close it: aqk add <имя>», то есть
// «поставь нашу штуку». Человек, который видит комплект впервые, закрывает окно.
//
// А готовая однострочная команда под его стек У НАС УЖЕ ЛЕЖИТ, в `recipes` записи каталога. Мы
// её просто не показываем. Замер руками на `requests` (самый скачиваемый python-пакет): в
// `src/requests/utils.py` — 75 коммитов-починок; дописана функция с `except Exception: pass`;
// их собственные `ruff` и `pytest` дали 0 и на чистой копии, и на подсаженной. Строка, которая
// бы это поймала, — `ruff check --select BLE,TRY400,SIM105 .` — лежала в нашем каталоге всё это
// время.
//
// Польза обязана быть видна ДО установки комплекта: скопировал строку, увидел находки у себя —
// и только тогда думаешь, ставить ли нас. Отчёт, который учит, а не отчитывается.
test("совет по непокрытому классу даёт команду под стек, а не «поставь нас»", () => {
  const entry = {
    slug: "swallowed-error",
    recipes: {
      any: "bash {gate}/check.sh {dir}",
      python: "ruff check --select BLE,TRY400,SIM105 {dir}",
    },
  };
  const a = blindAdvice(entry, { langs: new Set(["python"]) }, { file: "src/requests/utils.py", fixes: 75 });
  assert.equal(a.command, "ruff check --select BLE,TRY400,SIM105 .",
    "команда обязана быть готовой к вставке: {dir} подставлен, {gate} не годится");
  assert.equal(a.file, "src/requests/utils.py");
  assert.equal(a.fixes, 75);
});

// Переносимый рецепт зовёт наш файл — вставить его человеку, у которого комплекта нет, нельзя.
// Тогда команды нет, и совет остаётся один: поставить запись.
test("совет: переносимый рецепт вставить некуда — команда не выдумывается", () => {
  const entry = { slug: "x", recipes: { any: "bash {gate}/check.sh {dir}" } };
  assert.equal(blindAdvice(entry, { langs: new Set(["python"]) }, { file: "a.py", fixes: 1 }).command, null);
});

test("совет: у стека нет своего рецепта — команды нет", () => {
  const entry = { slug: "x", recipes: { python: "ruff check {dir}" } };
  assert.equal(blindAdvice(entry, { langs: new Set(["go"]) }, { file: "a.go", fixes: 2 }).command, null);
});

// Python-проекту показывалась ссылка на eslint и knip: поле `tool` у записи общее на все языки.
// Совет, в котором половина не про тебя, читается весь как «не про тебя».
test("совет: адрес инструмента — того, которым начинается команда", () => {
  const entry = {
    slug: "dead-code",
    tool: "https://github.com/jendrikseipp/vulture · https://github.com/webpro-nl/knip",
    recipes: { python: "vulture --min-confidence 60 {dir}", javascript: "npx knip" },
  };
  assert.equal(blindAdvice(entry, { langs: new Set(["python"]) }).tool, "https://github.com/jendrikseipp/vulture");
  // Команды нет или имя не совпало — весь список: лучше лишняя ссылка, чем ни одной.
  assert.equal(blindAdvice(entry, { langs: new Set(["go"]) }).tool, entry.tool);
  assert.equal(blindAdvice({ slug: "x" }, { langs: new Set() }).tool, null);
});

test("совет: пустая запись не роняет разбор", () => {
  assert.equal(blindAdvice({}, { langs: new Set() }, {}).command, null);
  assert.equal(blindAdvice({}, {}, {}).command, null);
});

// Безъязыковой родной рецепт годится в совет так же, как языковой: секреты ищутся в любом
// файле, и именно они чаще всего оказывались в непокрытых на чужих проектах.
test("совет: безъязыковой родной рецепт тоже даёт команду", () => {
  const entry = { slug: "secrets-not-in-code",
    recipes: { native: "gitleaks dir --no-banner {dir}", any: "bash {gate}/check.sh {dir}" } };
  const a = blindAdvice(entry, { langs: new Set(["python"]) }, { file: "a.py", fixes: 9 });
  assert.equal(a.command, "gitleaks dir --no-banner .");
});

// Из совета вычищается то, что относится к НАМ, а не к его проекту. Исключение наших красных
// образцов (`gates/*/red`) нужно установленному гейту — рядом с ним лежат образцы. Человеку,
// который команду только копирует, эти флаги бессмысленны и подрывают доверие: он видит, что
// инструмент говорит про какие-то чужие каталоги, которых у него нет.
test("совет: исключения наших образцов в команду не попадают", () => {
  const entry = { slug: "no-print-in-prod", recipes: { javascript:
    "eslint --no-config-lookup --ignore-pattern 'gates/*/red/**' --ignore-pattern 'gates/*/green/**' --rule '{\"no-console\":\"error\"}' {dir}" } };
  const a = blindAdvice(entry, { langs: new Set(["javascript"]) }, {});
  assert.ok(!a.command.includes("gates/"), `в совете остались наши каталоги: ${a.command}`);
  assert.ok(a.command.includes("no-console"), "правило потерялось вместе с исключениями");
  assert.ok(a.command.startsWith("eslint "), a.command);
});

test("совет: команда без наших исключений не портится", () => {
  const entry = { slug: "x", recipes: { python: "ruff check --select T20 {dir}" } };
  assert.equal(blindAdvice(entry, { langs: new Set(["python"]) }, {}).command, "ruff check --select T20 .");
});
