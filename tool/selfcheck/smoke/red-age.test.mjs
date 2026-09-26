// tool/selfcheck/smoke/red-age.test.mjs — прогон отделяет только что сломанное от давно висящего.
//
// ЗАЧЕМ. Отзыв с проекта владельца 2026-09-26: девять красных гейтов висели с 13.09, три свежие
// ошибки чуть не прошли незамеченными среди них. Возраст красного считается по `.aqk/history.jsonl`
// (см. `tool/lib/red-age.mjs`) и показывается в трёх местах: вердикт `doctor --run`, блок для агента
// и отчёт для человека.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { project, run, aqk } from "./_fixture.mjs";

function setup(t) {
  const p = project(t, {
    "README.md": "# x\n",
    "fail.sh": "exit 1\n",
    ".aqk.yml": "gates:\n  old: sh fail.sh\n  fresh: sh fail.sh\n",
  });
  run(p, "git", ["add", "."]);
  run(p, "git", ["commit", "-qm", "x"]);
  mkdirSync(join(p.dir, ".aqk"), { recursive: true });
  const past = ["2026-09-13", "2026-09-14", "2026-09-15"].map((d) =>
    JSON.stringify({ at: `${d}T12:00:00Z`, partial: false, skipped: [], gates: { old: "fail", fresh: "ok" } }));
  writeFileSync(join(p.dir, ".aqk", "history.jsonl"), past.join("\n") + "\n");
  return p;
}

test("doctor --run называет давний красный с датой, а новый — новым", (t) => {
  const p = setup(t);
  const r = aqk(p, "doctor", "--run");
  assert.match(r.out, /нов[^\n]*fresh/i, `новый красный не назван новым:\n${r.out}`);
  assert.match(r.out, /old[^\n]*13\.09[^\n]*4/, `давний красный без даты и числа прогонов:\n${r.out}`);
});

test("блок для агента и отчёт тоже различают новое и давнее", (t) => {
  const p = setup(t);
  aqk(p, "doctor", "--run");
  const ctx = aqk(p, "context").out;
  assert.match(ctx, /old[^\n]*13\.09/, `блок для агента не знает, что old висит давно:\n${ctx}`);
  const html = readFileSync(join(p.dir, ".aqk", "report.html"), "utf8");
  // Дата «13.09» и так стоит под графиком прогонов — проверять надо, что она названа У ГЕЙТА.
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.match(text, /висит давно[^.]*old[^.]*13\.09/i, "отчёт для человека не говорит, какой гейт висит и с какого дня");
});
