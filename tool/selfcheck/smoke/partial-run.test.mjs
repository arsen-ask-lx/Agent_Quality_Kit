// tool/selfcheck/smoke/partial-run.test.mjs — урезанный прогон называет себя урезанным.
//
// ЗАЧЕМ. `doctor --run --only good` при объявленном, но не запущенном красном `broken` печатал две
// строки подряд: «не запускались: broken — их состояние неизвестно, это не «зелёные»» и сразу
// «Всё объявленное зелёное.» — а заголовок отчёта для человека говорил то же «Всё объявленное
// зелёное». Найдено 2026-09-26 сверкой с cloudflare/security-audit-skill: у них урезанный прогон
// «states plainly that it is a partial pass», и никакого заявления о полном охвате.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { project, run, aqk } from "./_fixture.mjs";

function setup(t) {
  const p = project(t, { "README.md": "# x\n", "ok.sh": "exit 0\n", "bad.sh": "exit 1\n" });
  aqk(p, "init");
  const man = join(p.dir, ".aqk.yml");
  writeFileSync(man, readFileSync(man, "utf8").replace(/^gates:\n(?:[ \t]+.*\n?)*/m, "gates:\n  good: sh ok.sh\n  broken: sh bad.sh\n"));
  run(p, "git", ["add", "-A"]);
  run(p, "git", ["commit", "-qm", "x"]);
  return p;
}

test("вердикт урезанного прогона не говорит «всё объявленное зелёное»", (t) => {
  const p = setup(t);
  const r = aqk(p, "doctor", "--run", "--only", "good");
  assert.doesNotMatch(r.out, /Всё объявленное зелёное/, `про незапущенный broken сказано «зелёное»:\n${r.out}`);
  assert.match(r.out, /урезан[^\n]*broken/i, `вердикт не называет прогон урезанным и не называет пропущенное:\n${r.out}`);
});

test("заголовок отчёта для урезанного прогона не говорит «всё зелёное»", (t) => {
  const p = setup(t);
  aqk(p, "doctor", "--run", "--only", "good");
  const h1 = (readFileSync(join(p.dir, ".aqk", "report.html"), "utf8").match(/<h1>([^<]*)<\/h1>/) || [])[1] || "";
  assert.doesNotMatch(h1, /Всё объявленное зелёное/, `заголовок: ${h1}`);
  assert.match(h1, /урезан/i, `заголовок не называет прогон урезанным: ${h1}`);
});
