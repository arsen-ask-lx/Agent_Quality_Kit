// Первый запуск: главное — вверху, а не после двадцати крестов.
//
// НАЙДЕНО РАЗБОРОМ СОСЕДА 2026-09-11 (research/competitors/agentlint.md). На requests `doctor`
// печатал 36 строк крестов — у каждой из 18 записей своя строка «поставить: aqk add …», — и
// только со строки 84 из 102 шли «у вас уже есть» и «начните с этих трёх». Человек читает
// сверху и закрывает раньше, чем доходит до того, ради чего вывод написан. agentlint в том же
// месте печатает пять главных исправлений первыми.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { project, aqk, run } from "./_fixture.mjs";

// Цвет снимается до разбора: заголовок жирный, значки цветные, и регулярка по сырому выводу
// не узнаёт ни то, ни другое.
const plain = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");

// Проект, где применимо больше трёх записей: иначе блока «начните с трёх» нет вовсе.
const FILES = {
  "package.json": JSON.stringify({ name: "x", scripts: { test: "node --test", lint: "eslint ." } }),
  "src/app.js": "export function f(a) {\n  return a + 1;\n}\n",
  "src/util.py": "def g(x):\n    return x * 2\n",
  "tests/app.test.js": "import test from 'node:test';\ntest('x', () => {});\n",
};

test("первый запуск: «начните с трёх» стоит выше списка остальных записей", (t) => {
  const p = project(t, FILES);
  const out = plain(aqk(p, "doctor").out);
  const lines = out.split("\n");
  const start = lines.findIndex((l) => /Начните с этих трёх/.test(l));
  assert.ok(start > -1, `блока «начните с трёх» нет:\n${out}`);
  // Кресты каталога — строки «✘  <slug>» ниже заголовка «Гейты»; кресты раскладки (.aqk/docs,
  // AGENTS.md) стоят выше него и к делу не относятся.
  const heading = lines.findIndex((l) => /^\s*Гейты\s*$/.test(l));
  const firstCross = lines.findIndex((l, i) => i > heading && /^\s*✘\s+[a-z][a-z-]+\s/.test(l));
  assert.ok(firstCross > -1, `список записей пропал:\n${out}`);
  assert.ok(start < firstCross, `«начните с трёх» на строке ${start + 1}, а первый крест — на ${firstCross + 1}`);
});

test("первый запуск: «поставить: aqk add» не повторяется у каждой записи, записи не теряются", (t) => {
  const p = project(t, FILES);
  const out = plain(aqk(p, "doctor").out);
  const hints = out.split("\n").filter((l) => /поставить:/.test(l));
  // Одна общая подсказка и те, что стоят у находок пробы, — но не по строке на каждую запись.
  assert.ok(hints.length <= 3, `подсказок «поставить» ${hints.length} — по одной на запись:\n${hints.join("\n")}`);
  const crosses = out.split("\n").filter((l) => /^\s*✘\s+[a-z][a-z-]+\s/.test(l));
  assert.ok(crosses.length >= 4, `записей к установке ${crosses.length} — список сократили вместо того, чтобы сжать:\n${out}`);
});

// СЛУЖЕБНЫЕ ФАЙЛЫ НЕ ПОПАДАЮТ В GIT. Отзыв с живого проекта 2026-09-11: `.aqk/last-run.md`
// однажды закоммитили, и с тех пор каждый `make check` оставляет изменённый файл. А проба
// печатала «рабочее дерево не трогается», записывая `.aqk/last-probe.md`. В коде лежал
// комментарий «.aqk/ в .gitignore» — только `init` его туда не клал. Целиком `.aqk/`
// игнорировать нельзя: методички и правила в нём — содержимое проекта, их коммитят.
test("init кладёт служебные файлы .aqk в .gitignore, повторный init строк не дублирует", (t) => {
  const p = project(t, { "src/a.py": "x = 1\n", ".gitignore": "node_modules/\n" });
  aqk(p, "init");
  aqk(p, "init");
  const gi = readFileSync(join(p.dir, ".gitignore"), "utf8");
  for (const f of ["last-run.md", "last-probe.md", "advice-shown", "update-checked"]) {
    const n = gi.split("\n").filter((l) => l.trim() === `.aqk/${f}`).length;
    assert.equal(n, 1, `.aqk/${f} в .gitignore ${n} раз(а):\n${gi}`);
  }
  assert.match(gi, /^node_modules\/$/m, "чужие строки .gitignore не тронуты");
  // И методички при этом не спрятаны: их коммитят.
  assert.equal(run(p, "git", ["check-ignore", "-q", ".aqk/docs"]).code, 1, ".aqk/docs оказался в игноре");
});

test("doctor называет служебный файл, который отслеживает git, — с командой, как вынуть", (t) => {
  const p = project(t, { "src/a.py": "x = 1\n", ".aqk/last-run.md": "# старый отчёт\n" });
  run(p, "git", ["add", "-A"]);
  run(p, "git", ["commit", "-qm", "init"]);
  const out = plain(aqk(p, "doctor").out);
  assert.match(out, /\.aqk\/last-run\.md/, `служебный файл в git не назван:\n${out}`);
  assert.match(out, /git rm --cached \.aqk\/last-run\.md/, "нет готовой команды");
});
