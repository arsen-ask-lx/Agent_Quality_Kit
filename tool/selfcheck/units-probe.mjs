// Проверки разбора истории для `aqk probe`. Написаны ДО кода: без них нельзя отличить
// «функция работает» от «функция написана».
import test from "node:test";
import assert from "node:assert/strict";
import { isFix, fixHotspots, probeVerdict, probeSummary } from "../lib/history.mjs";
import { scanningGates, gatesState, isCode } from "../commands/probe.mjs";

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

// Три состояния, и сливать их нельзя. «Не смогли проверить» — не «прикрыто»: ровно та
// подмена, против которой написан весь комплект.
test("вердикт пробы различает поймано, не поймано и нечем проверить", () => {
  assert.equal(probeVerdict([{ code: 1 }, { code: 0 }]), "caught");
  assert.equal(probeVerdict([{ code: 0 }, { code: 0 }]), "blind");
  assert.equal(probeVerdict([{ code: 2 }, { code: 0 }]), "unknown");
  // Поймавший гейт сильнее непроверенного: класс закрыт, даже если рядом чего-то не хватает.
  assert.equal(probeVerdict([{ code: 2 }, { code: 1 }]), "caught");
  assert.equal(probeVerdict([]), "unknown");
});

// Пробовать можно только те гейты, которым есть куда подставить каталог: рецепт каталога
// кончается каталогом проверки, команда, написанная руками, — чем угодно. То же правило, по
// которому `prove` объявляет запись недоказуемой, а не сломанной.
test("пробуются только гейты, кончающиеся каталогом проверки", () => {
  const man = { gates: {
    ok: "bash gates/x/check.sh .",
    slash: "bash gates/y/check.sh ./",
    handmade: "eslint . --max-warnings 0",
    empty: "",
  } };
  assert.deepEqual(scanningGates(man).map(([n]) => n), ["ok", "slash"]);
});

test("манифест без гейтов не роняет разбор", () => {
  assert.deepEqual(scanningGates(null), []);
  assert.deepEqual(scanningGates({ gates: [] }), []);
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
// Цена не косметическая: `npm test`, `pytest -q`, `cargo test` каталогом не кончаются
// НИКОГДА. Для настоящего чужого проекта проба недостижима, и единственное, что об этом
// сообщалось, — неправда о его манифесте. У `prove` эта мысль сказана верно
// («некуда подставить каталог — команда написана руками»), у `probe` потерялась.
test("гейты есть, но подставлять некуда — это НЕ «гейтов нет»", () => {
  const man = { gates: { test: "npm test", lint: "npm run lint" } };
  assert.deepEqual(gatesState(man), { state: "unprobeable", declared: 2, probeable: 0 });
});

test("гейтов нет вовсе — и это другое состояние", () => {
  assert.deepEqual(gatesState({ gates: {} }), { state: "none", declared: 0, probeable: 0 });
  assert.deepEqual(gatesState(null), { state: "none", declared: 0, probeable: 0 });
});

// Пустая команда не считается объявленным гейтом: объявление без команды ничего не
// защищает, и его же отклоняет `gates-are-runnable`.
test("пустая команда гейтом не считается", () => {
  assert.deepEqual(gatesState({ gates: { a: "", b: "  " } }), { state: "none", declared: 0, probeable: 0 });
});

test("есть пригодный гейт — проба состоится, и непригодные посчитаны", () => {
  const man = { gates: { scan: "bash gates/x/check.sh .", test: "npm test" } };
  assert.deepEqual(gatesState(man), { state: "ok", declared: 2, probeable: 1 });
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
