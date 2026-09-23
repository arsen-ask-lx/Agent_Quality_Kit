// Недоступная история — cannot, даже когда сам репозиторий существует.
import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { delimiter, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { project, run, aqkEnv } from "./_fixture.mjs";
const check = join(dirname(fileURLToPath(import.meta.url)), "../../../kit/gates/test-not-adjusted/check.sh").replace(/\\/g, "/");
function fixture(t) {
  const p = project(t, { "src/value.py": "value = 1\n" });
  assert.equal(run(p, "git", ["add", "src/value.py"]).code, 0);
  assert.equal(run(p, "git", ["commit", "-qm", "fixture"]).code, 0);
  const bin = join(p.dir, "bin");
  mkdirSync(bin);
  const stub = join(bin, "checkwash");
  writeFileSync(stub, '#!/bin/sh\nprintf called > checkwash-called\nprintf \'%s\\n\' \'{"findings":[],"config_errors":[]}\'\n');
  chmodSync(stub, 0o755);
  return { p, env: { PATH: `${bin}${delimiter}${process.env.PATH}`, AQK_TEST_RANGE: "" } };
}
for (const range of ["", "missing-ref..HEAD", "HEAD:src/value.py..HEAD"]) {
  test(`test-not-adjusted: недоступная база ${range || "HEAD~1"} не даёт успех`, (t) => {
    const { p, env } = fixture(t);
    const r = run(p, "bash", [check, "."], { ...env, AQK_TEST_RANGE: range });
    assert.equal(r.code, 2, r.out);
    assert.match(r.out, /НЕ СОСТОЯЛАСЬ/);
    assert.equal(existsSync(join(p.dir, "checkwash-called")), false);
  });
}
test("test-not-adjusted: явно доступная база работает и с единственным коммитом", (t) => {
  const { p, env } = fixture(t);
  const r = run(p, "bash", [check, "."], { ...env, AQK_TEST_RANGE: "HEAD..HEAD" });
  assert.equal(r.code, 0, r.out);
  assert.equal(existsSync(join(p.dir, "checkwash-called")), true);
});
for (const valid of [false, true]) {
  test(`doctor различает недоступную историю и чистый доступный диапазон: ${valid}`, (t) => {
    const { p, env } = fixture(t);
    writeFileSync(join(p.dir, "AGENTS.md"), "# Fixture\n");
    mkdirSync(join(p.dir, "rules"));
    writeFileSync(join(p.dir, "rules/testing.md"), "# Testing\n");
    writeFileSync(join(p.dir, ".aqk.yml"), `aqk: 1\nentry: [AGENTS.md]\nrules: rules\ngates:\n  history: 'bash "${check}" .'\n`);
    const r = aqkEnv(p, { ...env, AQK_TEST_RANGE: valid ? "HEAD..HEAD" : "", AQK_PROBE: "0", AQK_FEEDBACK: "0" }, "doctor", "--run", "--min", "1");
    assert.equal(r.code, valid ? 0 : 1, r.out);
    const report = readFileSync(join(p.dir, ".aqk/last-run.md"), "utf8");
    assert.match(report, valid ? /^✔ history/m : /^\? history/m);
  });
}
