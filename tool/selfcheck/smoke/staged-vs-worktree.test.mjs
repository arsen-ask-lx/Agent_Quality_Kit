// Прогон описывает рабочую копию. Если в коммит уйдёт другое — это надо сказать.
//
// ЗАМЕР 2026-09-26 (опыт пакета 3 цикла 1, пункт «partial staging»). Живой опыт на чистом проекте:
//   1. в индекс добавлен файл с `print("debug")`;
//   2. в рабочей копии печать убрана — то есть починено ПОСЛЕ `git add`;
//   3. `aqk doctor --run --min 1` → exit 0, гейт `no-print-in-prod` зелёный;
//   4. `git diff --cached` показывает, что в коммит уходит именно `print("debug")`.
// Прогон не соврал про то, что смотрел: он смотрел рабочую копию. Соврал вывод — он выдал это
// за вердикт о коммите, а наш же блок состояния прямо советует «перед коммитом aqk doctor --run».
//
// ЧТО СПАСАЕТ И ЧТО НЕТ. Фреймворк pre-commit стэшит неиндексированное перед запуском хуков
// (проверено живым коммитом: `Stashing unstaged files`, хук увидел индекс, коммит заблокирован).
// То есть у проекта С фреймворком защита есть и своей заводить не надо — ровно поэтому мы не
// добавляем запрет на частичную индексацию. Но `doctor --run` руками и простой хук в
// `.git/hooks/pre-commit` стэша не делают, и там вердикт про рабочую копию читается как вердикт
// про коммит.
//
// ПОЧЕМУ НАЗЫВАЕМ, А НЕ РОНЯЕМ. Частичная индексация — обычная работа: `git add -p` ровно за этим
// и существует. Гейт, который её запрещает, спорит с инструментом, а не с дефектом. Роняем тут
// только одно — уверенность в том, чего не проверяли.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { project, run, aqk } from "./_fixture.mjs";

const plain = (s) => String(s).replace(/\x1b\[[0-9;]*m/g, "");

// Гейт объявляется прямо и заведомо тихий: опыт про ИНДЕКС, а не про выбор рецепта под то,
// что установлено на машине. Тот же довод дословно записан в `verdict.test.mjs`.
function withGate(p) {
  aqk(p, "init");
  const man = join(p.dir, ".aqk.yml");
  writeFileSync(man, readFileSync(man, "utf8").replace(/^gates:\s*$/m, 'gates:\n  тихий: "true"'), "utf8");
  run(p, "git", ["add", "-A"]);
  run(p, "git", ["commit", "-qm", "base"]);
}

test("расхождение индекса и рабочей копии названо в прогоне", (t) => {
  const p = project(t, { "src/a.py": "def f():\n    return 1\n" });
  withGate(p);

  // Порядок важен: сначала в индекс уходит одно содержимое, потом рабочая копия становится другой.
  writeFileSync(join(p.dir, "src/a.py"), 'def f():\n    print("debug")\n', "utf8");
  run(p, "git", ["add", "src/a.py"]);
  writeFileSync(join(p.dir, "src/a.py"), "def f():\n    return 1\n", "utf8");

  const r = aqk(p, "doctor", "--run", "--min", "1");
  const out = plain(r.out);
  assert.match(out, /src\/a\.py/, `прогон не назвал файл, по которому индекс и копия расходятся:\n${out}`);
  assert.match(out, /индекс/i, `нет слова про индекс — расхождение не названо:\n${out}`);
});

test("без расхождения лишней строки нет", (t) => {
  const p = project(t, { "src/a.py": "def f():\n    return 1\n" });
  withGate(p);
  // Неиндексированная правка — НЕ тот случай. Она в коммит не уйдёт, и прогон про неё строже
  // коммита, а не мягче: пугать тут нечем.
  writeFileSync(join(p.dir, "src/a.py"), "def f():\n    return 2\n", "utf8");

  const out = plain(aqk(p, "doctor", "--run", "--min", "1").out);
  assert.doesNotMatch(out, /индекс/i, `лишняя строка там, где индекс и копия совпадают:\n${out}`);
});
