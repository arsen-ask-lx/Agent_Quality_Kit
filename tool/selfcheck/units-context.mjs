// tool/selfcheck/units-context.mjs — блок состояния, который уходит В КОНТЕКСТ агента.
//
// ЗАЧЕМ ОТДЕЛЬНЫМ ФАЙЛОМ. У этого текста единственный читатель — машина, и цена ошибки другая,
// чем у терминального вывода: человек, увидев пустую строку, переспросит, а агент примет её за
// утверждение. Поэтому главная проверка здесь одна и та же во всех видах: **тишина не означает
// «чисто»**. Блок обязан говорить «неизвестно» там, где не знает, — иначе он врёт ровно тем
// способом, против которого написан весь комплект.
//
//   node --test tool/selfcheck/units-context.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { contextBlock, countArbiters, parseLastRun, withHook, hasOurHook, portableSelf } from "../commands/context.mjs";
import { CATALOGS } from "../i18n/index.mjs";
import { commandRows } from "../lib/core.mjs";
import { readFile } from "node:fs/promises";

const T = CATALOGS.ru.context;
const base = {
  entry: "AGENTS.md",
  level: { reached: 1, top: 3, missing: "гейты не доказаны" },
  rules: { total: 14, machine: 2, human: 12 },
  run: { when: "2026-09-08 11:00", red: [], skipped: 0, stale: false },
  ratchets: [],
};
const text = (over = {}) => contextBlock({ ...base, ...over }, T).join("\n");

// ГЛАВНАЯ. Прогона не было — сказать «неизвестно» словом. Пустая строка на этом месте
// прочитается агентом как «красных нет», и он пойдёт писать код по несуществующему разрешению.
test("без прогона блок говорит «неизвестно», а не молчит", () => {
  const t = text({ run: null });
  assert.match(t, /НЕИЗВЕСТНО/);
  assert.doesNotMatch(t, /красных нет/);
});

test("красные гейты названы поимённо", () => {
  const t = text({ run: { ...base.run, red: ["file-size-limit", "duplicate-code"] } });
  assert.match(t, /file-size-limit/);
  assert.match(t, /duplicate-code/);
});

// Проект с двадцатью красными не должен вытеснять собой весь контекст: ровно та деградация,
// ради избежания которой блок и делается коротким.
test("длинный список красных обрезается и называет остаток числом", () => {
  const red = Array.from({ length: 20 }, (_, i) => `гейт-${i}`);
  const t = text({ run: { ...base.run, red } });
  assert.match(t, /ещё 15/);
  assert.ok(!t.includes("гейт-9"), "шестой и дальше в список не попадают");
});

// Прогон, сделанный до последнего коммита, описывает не тот код, что лежит перед агентом.
test("устаревший прогон помечен, а не выдан за свежий", () => {
  const t = text({ run: { ...base.run, stale: true } });
  assert.match(t, /СТАРЕЕ/);
});

// То, ради чего второй пользователь и оценил promise-has-gate: «держит человек» значит
// «не держит никто», и это обязано быть сказано словами, а не выведено читателем из цифр.
test("правила без машинного арбитра названы прямо", () => {
  const t = text({ rules: { total: 12, machine: 0, human: 12 } });
  assert.match(t, /не держит никто/);
});

test("нет манифеста — уровень не выдумывается", () => {
  const t = text({ level: null });
  assert.match(t, /не вычислен/);
  assert.doesNotMatch(t, /AQK-0 из/);
});

// Потолок: блок влезает в глаза целиком. Замер 2026-09-08 — вход целиком в контекст роняет
// точность у всех проверенных моделей по мере роста, поэтому предел здесь предмет проверки,
// а не пожелание.
test("блок не разрастается даже на худшем входе", () => {
  const lines = contextBlock({
    ...base,
    run: { when: "…", red: Array.from({ length: 40 }, (_, i) => `г-${i}`), skipped: 9, stale: true },
    ratchets: Array.from({ length: 12 }, (_, i) => ({ name: `р-${i}`, count: i })),
  }, T);
  assert.ok(lines.length <= 16, `строк ${lines.length}, предел 16`);
});

// --- разбор источников -------------------------------------------------------
// Имя арбитра — это имя гейта, а в именах гейтов есть дефисы. Класс `[^\s>-]` обрывал их
// молча: первый же живой запуск показал 13 правил вместо 14 и одного машинного вместо двух.
// Молча — потому что число выглядит правдоподобным, пока его не с чем сверить.
test("имя арбитра с дефисом считается машинным, а не теряется", () => {
  const md = [
    "- Правило один. <!-- aqk: deps-are-pinned -->",
    "- Правило два. <!-- aqk: человек -->",
    "- Правило три. <!-- aqk: gates -->",
  ].join("\n");
  assert.deepEqual(countArbiters(md, ["человек"]), { total: 3, machine: 2, human: 1 });
});

test("отчёт прошлого прогона отдаёт красные и число непроверенных", () => {
  const r = parseLastRun([
    "# aqk doctor --run — 2026-09-08 11:00",
    "level: AQK-1",
    "✔ smoke — 1.0s",
    "✘ file-size-limit — 0.1s",
    "~ dead-code — нет инструмента",
  ].join("\n"));
  assert.equal(r.when, "2026-09-08 11:00");
  assert.deepEqual(r.red, ["file-size-limit"]);
  assert.equal(r.skipped, 1);
});

test("пустой отчёт — это не «чисто», а отсутствие данных", () => {
  assert.equal(parseLastRun(""), null);
});

// Найдено ЗАМЕРОМ на шести чужих проектах, до того как хук попал в init: на `flask`, где нет
// ни .aqk.yml, ни AGENTS.md, блок всё равно писал «Свод правил: AGENTS.md». Тот же класс, что
// у doctor неделей раньше: умолчание выдаётся за факт, потому что на нашем репозитории
// умолчание и факт совпадают. Назвать агенту несуществующий файл хуже, чем промолчать: он
// пойдёт его читать и получит пустоту вместо правил.
test("несуществующая точка входа не называется как свод правил", () => {
  const t = text({ level: null, run: null, rules: null, entryExists: false });
  assert.doesNotMatch(t, /AGENTS\.md/);
});

test("существующая точка входа называется", () => {
  const t = text({ entryExists: true });
  assert.match(t, /AGENTS\.md/);
});

// --- хук уходит в ОБЩИЙ файл настроек ----------------------------------------
// `.claude/settings.json` кладут в git: он общий на команду, в отличие от settings.local.json.
// Значит команда внутри него обязана работать не только на той машине, где её записали.
// На машине разработчика SELF — абсолютный путь; у соседа такого пути нет, и хук молча
// не сработает. Молча — то есть блок состояния просто не появится, и никто не узнает.
test("абсолютный путь заменяется переносимым вызовом", () => {
  assert.equal(portableSelf("node /home/x/aqk/tool/program.mjs"), "npx agent-quality-kit");
  assert.equal(portableSelf("node C:\\x\\aqk\\tool\\program.mjs"), "npx agent-quality-kit");
});

test("переносимые вызовы остаются как есть", () => {
  assert.equal(portableSelf("aqk"), "aqk");
  assert.equal(portableSelf("npx agent-quality-kit"), "npx agent-quality-kit");
  assert.equal(portableSelf("node tool/program.mjs"), "node tool/program.mjs");
});

// Второй такой же хук — блок в контексте дважды: вдвое больше токенов и ровно ноль пользы.
test("хук не задваивается", () => {
  const once = withHook({}, "aqk context");
  assert.ok(hasOurHook(once, "aqk context"));
  assert.equal(once.hooks.SessionStart.length, 1);
});

// Чужие настройки в том же файле — права доступа, другие хуки — обязаны пережить установку.
test("чужие настройки переживают установку хука", () => {
  const before = { permissions: { deny: ["Read(./.env)"] }, hooks: { Stop: [{ hooks: [] }] } };
  const after = withHook(before, "aqk context");
  assert.deepEqual(after.permissions, before.permissions);
  assert.equal(after.hooks.Stop.length, 1);
  assert.equal(after.hooks.SessionStart.length, 1);
});

// --- карта команд ------------------------------------------------------------
// Владелец: «агент плохо читает инструкцию — нужно влить карту и сам свод». Карта имеет смысл
// ровно до тех пор, пока она не отстала от программы. Второй список, живущий рядом с первым,
// через месяц врёт — это записано у нас в README про храповики и верно здесь буквально так же.
// Поэтому карта и справка собираются ИЗ ОДНОГО списка, а эта проверка сторожит, что список
// не отстал от диспетчера: команда, добавленная в switch и забытая в списке, роняет её.
test("карта команд не отстаёт от диспетчера", async () => {
  const src = await readFile(new URL("../program.mjs", import.meta.url), "utf8");
  // Флаговые формы (`--version`, `-v`) в карту не входят: карта перечисляет КОМАНДЫ, а флаг —
  // второе имя той же команды. Требовать их здесь значило бы дублировать строку справки.
  const dispatched = [...src.matchAll(/^\s{4}case "([a-z][a-z-]*)":/gm)].map((m) => m[1]);
  assert.ok(dispatched.length >= 10, `в диспетчере найдено ${dispatched.length} команд — разбор сломался`);
  const listed = new Set(commandRows(CATALOGS.ru).map((r) => r.name));
  const missing = dispatched.filter((n) => !listed.has(n));
  assert.deepEqual(missing, [], `в карте нет: ${missing.join(", ")}`);
});

// Полный блок — то, за что владелец согласился платить токенами: свод правил дословно, а не
// ссылка на него. Если он не дословный, плата внесена, а товар не получен.
test("полный блок несёт свод правил дословно", () => {
  const rules = "- Правило одно. <!-- aqk: человек -->\n- Правило два.";
  const t = contextBlock({ ...base, entryExists: true, full: { entry: "AGENTS.md", rows: [{ cmd: "aqk context", text: "состояние" }], text: rules } }, T).join("\n");
  assert.ok(t.includes(rules), "текст свода обязан войти целиком");
  assert.match(t, /aqk context/);
});

test("без --full свод не вливается — только ссылка на него", () => {
  const t = text({ entryExists: true });
  assert.doesNotMatch(t, /Правило одно/);
  assert.match(t, /AGENTS\.md/);
});

// --- СОСТОЯНИЯ ПРОБЫ: пять, а веток было три ---------------------------------------------
// ЗАЧЕМ. Блок читает машина: пустое место и «всё прикрыто» она примет за разрешение. Состояний
// у пробы пять — `never`, `off`, `unknown`, `stale`, `fresh`, — а печатались три ветки: «не
// делалась», «есть непрокрытое», иначе «всё прикрыто». В последнюю падали ДВА состояния, где мы
// как раз ничего не знаем:
//   off      — пробу выключили в манифесте (`probe: 0`);
//   unknown  — счётчик коммитов не взять либо в манифесте непонятое значение.
// Обе печатались как «в местах пробы всё прикрыто» — то есть выключенная и несостоявшаяся
// проверка выдавались за проверку, сказавшую «чисто».
test("выключенная и несостоявшаяся проба не выдаются за «всё прикрыто»", () => {
  // Якорь берётся из САМОГО текста, а не из представления о нём: первая редакция искала слово
  // «прикрыт», которого в строке про чистую пробу нет, — и краснела на исправном выводе.
  const clean = text({ probe: { state: "fresh", behind: 3, blind: 0 } });
  assert.match(clean, /каждый применимый класс/, "строка про чистую пробу пропала");

  const off = text({ probe: { state: "off", behind: null, blind: 0 } });
  assert.doesNotMatch(off, /всё прикрыто|прикрыто ничем нет/,
    `выключенная проба выдана за покрытие: ${off}`);
  assert.match(off, /выключен|отключен/i, `не сказано, что проба выключена: ${off}`);

  const unknown = text({ probe: { state: "unknown", behind: null, blind: 0 } });
  assert.match(unknown, /НЕИЗВЕСТНО|неизвестн/i, `несостоявшаяся проба не названа: ${unknown}`);
});
