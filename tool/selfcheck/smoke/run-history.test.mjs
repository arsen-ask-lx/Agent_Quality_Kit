// Прогон дописывает строку в историю, а не только перезаписывает последний отчёт.
//
// ОТКУДА. Решение владельца 2026-09-26 (`PROJECT.md` §9а): человек не понимает, стало у него лучше
// или хуже. Замер того же дня: `.aqk/last-run.md` перезаписывается каждым прогоном, и ответить на
// вопрос нечем — даже будь у нас график, рисовать его не из чего. История — первый кирпич отчёта.
//
// ЧТО В СТРОКЕ И ПОЧЕМУ. Время, коммит, уровень, итог каждого гейта тремя состояниями (как в
// `last-run.md`: прошло · находка · не смогли) и пометка урезанного прогона. Без пометки график
// сравнил бы полный прогон с `--only`, и «стало лучше» означало бы «меньше проверяли».
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { project, aqk, run } from "./_fixture.mjs";

const history = (p) => readFileSync(join(p.dir, ".aqk", "history.jsonl"), "utf8")
  .split("\n").filter(Boolean).map((l) => JSON.parse(l));

test("каждый прогон — строка истории с коммитом, уровнем и итогом гейтов", (t) => {
  const p = project(t, { "src/a.py": "x = 1\n", ".gitignore": "x\n" });
  aqk(p, "init");
  const man = join(p.dir, ".aqk.yml");
  writeFileSync(man, readFileSync(man, "utf8").replace(/^gates:\s*$/m, 'gates:\n  quiet: "true"\n  loud: "false"') +
    "groups:\n  slow: [loud]\n", "utf8");
  run(p, "git", ["add", "-A"]);
  run(p, "git", ["commit", "-q", "-m", "init"]);
  const head = run(p, "git", ["rev-parse", "HEAD"]).out.trim();

  aqk(p, "doctor", "--run");
  aqk(p, "doctor", "--run", "--skip", "slow");

  const h = history(p);
  assert.equal(h.length, 2, `два прогона — две строки, а их ${h.length}`);
  const [full, part] = h;
  assert.equal(full.head, head, `коммит прогона не записан: ${JSON.stringify(full)}`);
  assert.ok(!Number.isNaN(Date.parse(full.at)), `время не записано: ${full.at}`);
  assert.equal(typeof full.level, "number", `уровень не записан: ${JSON.stringify(full)}`);
  assert.deepEqual(full.gates, { quiet: "ok", loud: "fail" }, `итог гейтов: ${JSON.stringify(full.gates)}`);
  assert.equal(full.partial, false, "полный прогон помечен урезанным");
  assert.equal(part.partial, true, "прогон с --skip не помечен урезанным — график сравнит его с полным");
  assert.deepEqual(part.skipped, ["loud"], `пропущенные не названы: ${JSON.stringify(part)}`);
});
