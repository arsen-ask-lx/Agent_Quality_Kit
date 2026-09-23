// Ошибка внешнего процесса не становится успехом после фильтрации находок.
import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { project, run, aqk } from "./_fixture.mjs";
const root = join(dirname(fileURLToPath(import.meta.url)), "../../..").replace(/\\/g, "/");
const registry = "src/known.py: known issue\nsrc/unscanned.py: another issue\n";
function program(p, name, code, output) {
  const file = join(p.dir, "bin", name);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `#!/bin/sh\nprintf '%s\\n' '${output}'\nexit ${code}\n`);
  chmodSync(file, 0o755);
  return file.replace(/\\/g, "/");
}
for (const code of [2, 127, 143]) {
  test(`храповик сохраняет реестр и ошибку ${code} после частичного вывода`, (t) => {
    const p = project(t, { "reg.txt": registry });
    const command = program(p, "fixture", code, "src/known.py:1: known issue");
    const r = run(p, "bash", [`${root}/kit/ratchet/ratchet.sh`, "reg.txt", command]);
    assert.equal(r.code, 2, r.out);
    assert.equal(readFileSync(join(p.dir, "reg.txt"), "utf8"), registry);
    assert.match(r.out, /known issue/);
  });
}
for (const [name, code] of [["fixture", 1], ["vulture", 3], ["pylint", 24]]) {
  test(`известная находка ${name}/${code} остаётся допустимым долгом`, (t) => {
    const p = project(t, { "reg.txt": "src/known.py: known issue\n" });
    const command = program(p, name, code, "src/known.py:1: known issue");
    assert.equal(run(p, "bash", [`${root}/kit/ratchet/ratchet.sh`, "reg.txt", command]).code, 0);
  });
}
for (const output of ["", ".aqk/cache.py:1: failed while reading cache"]) {
  test(`native-обёртка не прячет ошибку при выводе ${JSON.stringify(output)}`, (t) => {
    const p = project(t);
    const command = program(p, "fixture", 2, output);
    const r = run(p, "bash", [`${root}/kit/gates/_native.sh`, ".", command]);
    assert.equal(r.code, 2, r.out);
  });
}
test("native нормализует находку vulture в код гейта и сохраняет фильтр образцов", (t) => {
  const p = project(t);
  const command = program(p, "vulture", 3, "src/known.py:1: known issue");
  const real = run(p, "bash", [`${root}/kit/gates/_native.sh`, ".", command]);
  assert.equal(real.code, 1, real.out);
  program(p, "vulture", 3, "gates/example/red/bad.py:1: intentional sample");
  const sample = run(p, "bash", [`${root}/kit/gates/_native.sh`, ".", command]);
  assert.equal(sample.code, 0, sample.out);
});
for (const code of [2, 143]) {
  test(`aqk ratchet не объявляет baseline после аварии ${code}`, (t) => {
    const manifest = 'aqk: 1\nentry: [AGENTS.md]\ngates:\n  check: "bash failed.sh"\n';
    const p = project(t, {
      "AGENTS.md": "# Fixture\n", ".aqk.yml": manifest,
      "failed.sh": `echo 'src/known.py:1: known issue'\nexit ${code}\n`,
    });
    const r = aqk(p, "ratchet", "check");
    assert.notEqual(r.code, 0, r.out);
    assert.equal(existsSync(join(p.dir, "ratchets/check.txt")), false);
    assert.equal(readFileSync(join(p.dir, ".aqk.yml"), "utf8"), manifest);
  });
}

test("shell и Node одинаково классифицируют все exit-коды поддержанных инструментов", async (t) => {
  const { classify, findingCodes } = await import("../../lib/execution.mjs");
  const p = project(t);
  const script = '. "$1"; for tool in sh ruff eslint vulture pylint; do code=0; while [ "$code" -lt 256 ]; do aqk_exit_verdict "$tool" "$code"; verdict=$?; printf "%s %s %s\\n" "$tool" "$code" "$verdict"; code=$((code+1)); done; done';
  const r = run(p, "sh", ["-c", script, "fixture", `${root}/kit/gates/_exit.sh`]);
  assert.equal(r.code, 0, r.out);
  const rows = r.out.trim().split("\n");
  assert.equal(rows.length, 5 * 256);
  for (const row of rows) {
    const [tool, code, verdict] = row.split(" ");
    const expected = classify({ status: Number(code), error: null, signal: null }, findingCodes(tool)).state;
    assert.equal(["clean", "finding", "infra_error"][Number(verdict)], expected, row);
  }
});

test("установленный храповик получает helper и сохраняет аварийный вердикт", (t) => {
  const p = project(t, {
    "AGENTS.md": "# Fixture\n",
    ".aqk.yml": 'aqk: 1\nentry: [AGENTS.md]\ngates:\n  lint: "bash lint.sh"\n',
    "lint.sh": "echo 'src/known.py:1: known issue'\nexit 1\n",
  });
  const setup = aqk(p, "ratchet", "lint");
  assert.equal(setup.code, 0, setup.out);
  const before = readFileSync(join(p.dir, "ratchets/lint.txt"), "utf8");
  const args = ["ratchets/_ratchet.sh", "ratchets/lint.txt", "bash", "lint.sh"];
  assert.equal(run(p, "bash", args).code, 0);
  writeFileSync(join(p.dir, "lint.sh"), "echo 'src/known.py:1: known issue'\nexit 2\n");
  const failed = run(p, "bash", args);
  assert.equal(failed.code, 2, failed.out);
  assert.equal(readFileSync(join(p.dir, "ratchets/lint.txt"), "utf8"), before);
});

for (const jobs of [1, 2]) {
  for (const reversed of [false, true]) {
    test(`агрегатор сохраняет finding и cannot независимо от порядка и jobs=${jobs}/${reversed}`, (t) => {
      const rows = ['  finding: "bash finding.sh"', '  broken: "bash broken.sh"'];
      if (reversed) rows.reverse();
      const p = project(t, {
        "AGENTS.md": "# Fixture\n",
        ".aqk.yml": `aqk: 1\nentry: [AGENTS.md]\ngates:\n${rows.join("\n")}\n`,
        "finding.sh": "echo 'src/value.py:1: known defect'\nexit 1\n",
        "broken.sh": "echo 'src/value.py:1: partial scan'\nexit 2\n",
      });
      const result = aqk(p, "doctor", "--run", "--jobs", String(jobs));
      assert.notEqual(result.code, 0, result.out);
      const report = readFileSync(join(p.dir, ".aqk/last-run.md"), "utf8");
      assert.match(report, /^✘ finding/m);
      assert.match(report, /^\? broken/m);
    });
  }
}
