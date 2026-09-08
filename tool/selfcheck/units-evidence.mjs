// tool/selfcheck/units-evidence.mjs — проверки привязки доказательства к дифу.
//
// ЗАЧЕМ ОТДЕЛЬНЫМ ФАЙЛОМ. `units.mjs` во второй раз перерос собственный предел в 500 строк —
// его поймал наш же гейт file-size-limit, и это уже второй такой развод (первым был
// `units-level.mjs`). Шов по смыслу: здесь всё про то, чем доказан диф, и ничего больше.
//
//   node --test tool/selfcheck/units-evidence.mjs

import test from "node:test";
import assert from "node:assert/strict";

// --- покрытие дифа доказательством ------------------------------------------
//
// ЗАЧЕМ. Правило «готово = доказано» было единственным центральным правилом свода, за которым
// не следила машина: сторожем стоял человек. Прогон donecheck по восьми нашим коммитам показал,
// чего это стоило: `.github/workflows/publish.yml` менялся и не был назван ни одной командой
// проверки — и именно он оказался сломан. Механизм взят оттуда (AtharvaMaik/donecheck, MIT),
// сопоставление сделано СТРОГИМ, в отличие от него: он считает файл покрытым и по голому имени,
// а имя `check.sh` в нашем каталоге носят двадцать разных файлов.
test("покрытие: файл считается доказанным, только если гейт назвал ЕГО путь", async () => {
  const { coverage } = await import("../lib/evidence.mjs");
  const res = [
    { name: "tests", cmd: "node --test", out: "ok 1 - src/pay.js:12 покрыт" },
    { name: "lint", cmd: "bash kit/gates/x/check.sh .", out: "" },
  ];
  const cov = coverage(["src/pay.js", "src/refund.js"], res);
  assert.deepEqual(cov.covered.get("src/pay.js"), ["tests"]);
  // refund.js не назван никем, но `lint` был направлен в корень — значит он в «молчании»,
  // а не в «никто не смотрел». Разница между этими двумя и есть смысл третьего состояния.
  assert.deepEqual(cov.silent.get("src/refund.js"), ["lint"]);
  assert.deepEqual(cov.uncovered, []);
});

test("покрытие: голое имя файла не считается доказательством", async () => {
  const { coverage } = await import("../lib/evidence.mjs");
  // «check.sh» в выводе не означает, что проверен ИМЕННО kit/gates/todo/check.sh: этим именем
  // в каталоге зовутся два десятка разных файлов. Мягкое сравнение дало бы тишину — то есть
  // ровно тот отказ, против которого написана вся эта проверка.
  const res = [{ name: "g", cmd: "bash run.sh", out: "проверено check.sh" }];
  const cov = coverage(["kit/gates/todo/check.sh"], res);
  assert.deepEqual(cov.uncovered, ["kit/gates/todo/check.sh"]);
});

test("покрытие: путь с ./ и цветом в выводе всё равно засчитывается", async () => {
  const { coverage } = await import("../lib/evidence.mjs");
  const esc = String.fromCharCode(27);
  const res = [{ name: "g", cmd: "x", out: `${esc}[31m./src/pay.js:9${esc}[0m нашлось` }];
  const cov = coverage(["src/pay.js"], res);
  assert.deepEqual(cov.uncovered, []);
});

// Расписка обязана меняться, когда меняется хоть что-то из того, о чём она отчитывается:
// базовый коммит, набор команд, содержимое файлов. Иначе «прогнал, потом поправил ещё три
// файла» неотличимо от «прогнал».
test("расписка: хеш доказательства меняется от правки файла и от смены команды", async () => {
  const { evidenceHash } = await import("../lib/evidence.mjs");
  const a = evidenceHash("base1", [{ cmd: "t" }], [["f.js", "one"]]);
  assert.equal(evidenceHash("base1", [{ cmd: "t" }], [["f.js", "one"]]), a);
  assert.notEqual(evidenceHash("base1", [{ cmd: "t" }], [["f.js", "two"]]), a);
  assert.notEqual(evidenceHash("base1", [{ cmd: "u" }], [["f.js", "one"]]), a);
  assert.notEqual(evidenceHash("base2", [{ cmd: "t" }], [["f.js", "one"]]), a);
});

test("покрытие: молчащая проверка отличается и от назвавшей, и от не смотревшей", async () => {
  const { coverage } = await import("../lib/evidence.mjs");
  const res = [
    { name: "size", cmd: "bash check.sh .", out: "" },              // направлен в корень, промолчал
    { name: "tests", cmd: "node --test", out: "src/pay.js:1 ок" },  // назвал файл
  ];
  const dirs = new Set(["."]);
  const cov = coverage(["src/pay.js", "src/quiet.js"], res, (p) => dirs.has(p));
  assert.deepEqual(cov.covered.get("src/pay.js"), ["tests"]);
  assert.deepEqual(cov.silent.get("src/quiet.js"), ["size"]);
  assert.deepEqual(cov.uncovered, []);
});

test("покрытие: файл вне всех целей остаётся не тронутым никем", async () => {
  const { coverage } = await import("../lib/evidence.mjs");
  const res = [{ name: "size", cmd: "bash check.sh tool", out: "" }];
  const cov = coverage(["tool/a.js", ".github/workflows/ci.yml"], res, (p) => p === "tool");
  assert.deepEqual(cov.silent.get("tool/a.js"), ["size"]);
  assert.deepEqual(cov.uncovered, [".github/workflows/ci.yml"]);
});
