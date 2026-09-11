// tool/selfcheck/units-annotate.mjs — находки гейтов пометками GitHub Actions.
//
// ЗАЧЕМ. Находка гейта видна только в логе конвейера, куда почти никто не заглядывает. Строка
// `::error file=…,line=…,title=…::…` в выводе шага становится красной пометкой у строки файла в
// pull request. Идея — из разбора AgentLint (research/competitors/agentlint-0xmariowu.md).
// Формат — документация GitHub (workflow-commands); экранирование — официальный
// @actions/core (packages/core/src/command.ts: escapeData, escapeProperty), а не чужой код.
//
//   node --test tool/selfcheck/units-annotate.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { locate, annotations } from "../lib/annotate.mjs";

const exists = (f) => ["src/a.py", "AGENTS.md", "kit/x.sh"].includes(f);

test("locate: «файл:строка: находка» и «файл: находка»; без пути — ничего", () => {
  assert.deepEqual(locate("src/a.py:12: print(x) в прод-коде"), { file: "src/a.py", line: 12, message: "print(x) в прод-коде" });
  assert.deepEqual(locate("./AGENTS.md: «npm run debug» — такого скрипта нет"), { file: "AGENTS.md", line: null, message: "«npm run debug» — такого скрипта нет" });
  assert.deepEqual(locate("src/a.py:3:7: E501 line too long"), { file: "src/a.py", line: 3, message: "E501 line too long" });
  assert.equal(locate("прогон красный: 2 находки"), null);
  assert.equal(locate("  почини: убери print"), null, "совет — не находка");
});

test("упавший гейт — пометка у строки с советом; совещательный — предупреждение", () => {
  const r = annotations([
    { name: "no-print", ok: false, out: "src/a.py:12: print(x)\n  почини: замени на logger\n" },
    { name: "todo", ok: false, advisory: true, out: "src/a.py:3: TODO без задачи\n" },
    { name: "lint", ok: true, out: "src/a.py:1: не важно\n" },
  ], { exists });
  assert.equal(r.lines.length, 2, "зелёный гейт пометок не даёт");
  assert.equal(r.lines[0], "::error file=src/a.py,line=12,title=aqk%3A no-print::print(x) — почини: замени на logger");
  assert.match(r.lines[1], /^::warning file=src\/a\.py,line=3,/);
});

// Пометка на файл, которого нет, — пометка в никуда: GitHub повесит её на `.github`, и человек
// будет искать то, чего не существует. Такая находка идёт общей пометкой гейта без файла.
test("путь, которого нет в репозитории, и находка без пути — одна общая пометка гейта", () => {
  const r = annotations([
    { name: "gates-run-in-ci", ok: false, out: "гейт smoke не запускается конвейером\n" },
    { name: "ghost", ok: false, out: "vendor/lib.js:4: чужой файл\n" },
  ], { exists });
  assert.deepEqual(r.lines, [
    "::error title=aqk%3A gates-run-in-ci::гейт smoke не запускается конвейером",
    "::error title=aqk%3A ghost::vendor/lib.js:4: чужой файл",
  ]);
});

test("экранирование по @actions/core: % \\r \\n в тексте, ещё : и , в свойствах", () => {
  const r = annotations([{ name: "a,b", ok: false, out: "src/a.py:1: 100% готово, но\r нет\n" }], { exists });
  assert.equal(r.lines[0], "::error file=src/a.py,line=1,title=aqk%3A a%2Cb::100%25 готово, но%0D нет");
});

// Потолок. В документации GitHub лимита не нашли; в обсуждении сообщества 2020 года (#26680):
// «10 warning annotations and 10 error annotations per step». Держимся его, остаток — числом.
test("не больше 10 ошибок и 10 предупреждений; остаток назван числом", () => {
  const out = Array.from({ length: 14 }, (_, i) => `src/a.py:${i + 1}: находка ${i + 1}`).join("\n");
  const r = annotations([{ name: "g", ok: false, out }], { exists });
  assert.equal(r.lines.filter((l) => l.startsWith("::error")).length, 10);
  assert.equal(r.dropped, 4);
});
