// `aqk note` коммитит ТОЛЬКО свою запись и не пушит без спроса.
//
// ОТКУДА. Шишка 2026-09-21 из audit_project («`aqk note` закоммитил чужую работу и попытался её
// запушить»): при своём журнале (`lessons:`) команда делала `git add incidents/README.md` — путь
// журнала комплекта, которого в проекте нет, — потом `git commit` всего индекса и `git push`.
// Проверено той сессией на одноразовом репозитории: застейдженный посторонний файл уехал в коммит
// урока, сам урок остался неотслеженным. В общем репозитории нескольких сессий это чужая
// незаконченная работа в прод-ветке под видом урока.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { project, run, aqk } from "./_fixture.mjs";

const CLI = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "program.mjs");

function setup(t) {
  const p = project(t, { "src/a.py": "x = 1\n" });
  aqk(p, "init");
  const man = join(p.dir, ".aqk.yml");
  writeFileSync(man, readFileSync(man, "utf8").replace(/^lessons: .*$/m, "lessons: incidents"));
  mkdirSync(join(p.dir, "incidents"), { recursive: true });
  run(p, "git", ["add", "-A"]);
  run(p, "git", ["commit", "-qm", "base"]);
  // Настоящий удалённый репозиторий с upstream: иначе `git push` падает сам по себе, и проверка
  // «не пушит» зеленела бы по построению.
  run(p, "git", ["init", "-q", "--bare", "remote.git"]);
  run(p, "git", ["remote", "add", "origin", join(p.dir, "remote.git")]);
  run(p, "git", ["push", "-q", "-u", "origin", "HEAD"]);
  // Чужая работа соседней сессии: подготовлена к её коммиту, не к нашему.
  writeFileSync(join(p.dir, "other.txt"), "чужое\n");
  run(p, "git", ["add", "other.txt"]);
  return p;
}

const note = (p, ...flags) =>
  run(p, "sh", ["-c", `printf '**Вывод.** 🔧 завели проверку\\n' | "${process.execPath}" "${CLI}" note "шишка" ${flags.join(" ")}`]);
const remoteCommits = (p) => Number(run(p, "git", ["-C", "remote.git", "rev-list", "--all", "--count"]).out.trim());

test("note коммитит только журнал и оставляет чужой индекс нетронутым", (t) => {
  const p = setup(t);
  const r = note(p);
  const inCommit = run(p, "git", ["show", "--name-only", "--format=", "HEAD"]).out;
  assert.match(inCommit, /incidents\/README\.md/, `урок не попал в коммит:\n${inCommit}\n${r.out}`);
  assert.doesNotMatch(inCommit, /other\.txt/, `чужой файл уехал в коммит урока:\n${inCommit}`);
  const staged = run(p, "git", ["diff", "--cached", "--name-only"]).out;
  assert.match(staged, /other\.txt/, `чужой файл выпал из индекса:\n${staged}`);
});

test("note не пушит без --push и пушит с ним", (t) => {
  const p = setup(t);
  const before = remoteCommits(p);
  note(p);
  assert.equal(remoteCommits(p), before, "note запушил без спроса");
  note(p, "--push");
  assert.equal(remoteCommits(p), before + 2, "с --push запись не ушла на сервер");
});
