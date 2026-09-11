// tool/selfcheck/units-prompt.mjs — задание для агента одним текстом (`aqk prompt`).
//
// ЗАЧЕМ. Между диагнозом и действием не было моста: `doctor` пишет человеку, `context` — «как
// дела» агенту, а «почини вот это, это и это» человек пересказывал сам. Идея — из разбора
// agentlint (research/competitors/agentlint.md, «Задание для агента»): правила поведения
// сверху, исправления по весу, в конце — как проверить. Их слабость не берём: у них «проверь» —
// это «балл вырос», у нас — команда, которая краснеет и зеленеет.
//
//   node --test tool/selfcheck/units-prompt.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { taskText } from "../commands/prompt.mjs";
import { CATALOGS } from "../i18n/index.mjs";

const T = CATALOGS.ru.prompt;
const base = {
  self: "aqk", manifest: true, run: { when: "2026-09-11 12:00", red: [], stale: false },
  blind: [], adopt: [], shim: null, start: [],
};
const text = (s) => taskText({ ...base, ...s }, T).join("\n");
const items = (s) => text(s).split("\n").filter((l) => /^\d+\. /.test(l));

test("правила поведения сверху и проверка в конце — всегда, даже когда пунктов нет", () => {
  const t = text({});
  assert.ok(t.indexOf(T.rulesTitle) < t.indexOf(T.verifyTitle), "правила идут до проверки");
  assert.match(t, /aqk doctor --run/, "без команды проверки «готово» ничем не доказано");
  assert.match(t, new RegExp(T.empty.slice(0, 20)), "пустое задание сказано словами");
});

test("красный гейт — пункт с командой, которая его запускает одного", () => {
  const it = items({ run: { when: "x", red: ["lint", "units"], stale: false } });
  assert.equal(it.length, 2);
  assert.match(it[0], /aqk doctor --run --only lint/);
});

// Прогона не было или он старше последнего коммита: список красных — про другой код. Первый
// пункт — прогнать; пустое задание при этом было бы утверждением «чисто», которого никто не делал.
test("нет прогона или он устарел — первый пункт «прогони», а не «всё чисто»", () => {
  const none = text({ run: null });
  assert.doesNotMatch(none, new RegExp(T.empty.slice(0, 20)), "без прогона задание не пустое");
  assert.match(items({ run: null })[0], /aqk doctor --run/);
  const stale = items({ run: { when: "x", red: ["lint"], stale: true } });
  assert.match(stale[0], /aqk doctor --run/, "устаревший прогон — сначала прогнать заново");
});

test("порядок по весу: манифест → красное → брак из пробы → свои проверки → свод → начало", () => {
  const it = items({
    manifest: false,
    run: { when: "x", red: ["lint"], stale: false },
    blind: [{ slug: "swallowed-error", file: "src/a.py", command: "ruff check --select BLE ." }],
    adopt: [{ name: "test", cmd: "npm test", source: "package.json" }],
    shim: "missing",
    start: [{ slug: "secrets-not-in-code", intent: "ключи не в коде", command: "gitleaks dir ." }],
  });
  assert.match(it[0], /aqk init/);
  assert.match(it[1], /lint/);
  assert.match(it[2], /swallowed-error.*src\/a\.py/);
  assert.match(it[3], /npm test/);
  assert.match(it[4], /@AGENTS\.md/);
  assert.equal(it.length, 5, "больше пяти за раз агент не удержит");
  assert.match(text({
    manifest: false, run: { when: "x", red: ["lint"], stale: false },
    blind: [{ slug: "s", file: "f", command: "" }], adopt: [{ name: "t", cmd: "c", source: "p" }],
    shim: "missing", start: [{ slug: "x", intent: "y", command: "" }],
  }), new RegExp(T.more(1).slice(0, 12)), "остаток назван числом, а не выброшен молча");
});

test("класс из пробы не повторяется в «начните с»; без готовой команды — aqk add", () => {
  const it = items({
    blind: [{ slug: "swallowed-error", file: "src/a.py", command: "" }],
    start: [{ slug: "swallowed-error", intent: "i", command: "" }, { slug: "todo-without-task", intent: "i", command: "" }],
  });
  assert.equal(it.length, 2);
  assert.match(it[0], /aqk add swallowed-error/);
  assert.match(it[1], /todo-without-task/);
});

// Гейт стоит, проба его гоняла — и он пропустил. Не «поставь» (стоит), а «здесь он слеп».
test("гейт стоит, но пропустил брак из пробы — пункт «разберись», сразу после красных", () => {
  const it = items({
    run: { when: "x", red: ["lint"], stale: false },
    missed: [{ slug: "swallowed-error", file: "src/a.py" }],
    start: [{ slug: "todo-without-task", intent: "i", command: "" }],
  });
  assert.match(it[1], /swallowed-error.*src\/a\.py/);
  assert.doesNotMatch(it[1], /aqk add/, "гейт уже стоит — ставить его второй раз бессмысленно");
});

test("у каждого пункта — чем доказать, что готово", () => {
  const it = items({
    run: { when: "x", red: ["lint"], stale: false },
    blind: [{ slug: "swallowed-error", file: "src/a.py", command: "" }],
    missed: [{ slug: "complexity-limit", file: "src/b.py" }],
    start: [{ slug: "todo-without-task", intent: "i", command: "" }],
  });
  for (const line of it) assert.match(line, new RegExp(T.done.slice(0, 6)), `пункт без арбитра: ${line}`);
});

test("оба языка несут одни и те же ключи задания", () => {
  const keys = (o) => Object.keys(o).sort().join(",");
  assert.equal(keys(CATALOGS.ru.prompt), keys(CATALOGS.en.prompt));
  // Пункты лежат глубже — пропущенный в одном языке пункт упал бы ошибкой только у того, кто
  // на этом языке работает.
  assert.equal(keys(CATALOGS.ru.prompt.item), keys(CATALOGS.en.prompt.item));
  assert.equal(keys(CATALOGS.ru.prompt.item.shim), keys(CATALOGS.en.prompt.item.shim));
});
