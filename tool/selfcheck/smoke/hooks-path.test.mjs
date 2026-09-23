// Git определяет действительный путь хука: .git может быть файлом, hooksPath — переопределён.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { join, dirname } from "node:path";
import { preCommitHook } from "../../lib/core.mjs";
import { project, run } from "./_fixture.mjs";
function hook(path, body = "#!/bin/sh\nexec aqk doctor --run\n") {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body);
  chmodSync(path, 0o755);
}
for (const absolute of [false, true]) {
  test(`хук обнаруживается при ${absolute ? "абсолютном" : "относительном"} hooksPath с пробелами`, async (t) => {
    const p = project(t);
    const dir = "custom hooks";
    hook(join(p.dir, dir, "pre-commit"));
    assert.equal(run(p, "git", ["config", "core.hooksPath", absolute ? join(p.dir, dir) : dir]).code, 0);
    assert.equal(await preCommitHook(p.dir), true);
  });
}
test("старый .git/hooks не засчитывается, когда Git переключён на пустой каталог", async (t) => {
  const p = project(t);
  hook(join(p.dir, ".git/hooks/pre-commit"));
  assert.equal(run(p, "git", ["config", "core.hooksPath", "disabled-hooks"]).code, 0);
  assert.equal(await preCommitHook(p.dir), false);
});
test("worktree видит общий действующий хук", async (t) => {
  const p = project(t, { "value.txt": "fixture" });
  assert.equal(run(p, "git", ["add", "value.txt"]).code, 0);
  assert.equal(run(p, "git", ["commit", "-qm", "fixture"]).code, 0);
  const worktree = join(p.dir, "linked worktree");
  const result = run(p, "git", ["worktree", "add", "--detach", worktree]);
  assert.equal(result.code, 0, result.out);
  hook(join(p.dir, ".git/hooks/pre-commit"));
  assert.equal(await preCommitHook(worktree), true);
});
test("обычный репозиторий и чужой хук сохраняют прежние состояния", async (t) => {
  const p = project(t);
  assert.equal(await preCommitHook(p.dir), false);
  hook(join(p.dir, ".git/hooks/pre-commit"), "#!/bin/sh\nexit 0\n");
  assert.equal(await preCommitHook(p.dir), "other");
  hook(join(p.dir, ".git/hooks/pre-commit"));
  assert.equal(await preCommitHook(p.dir), true);
});
