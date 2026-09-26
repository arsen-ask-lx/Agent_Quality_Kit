// tool/selfcheck/smoke/nothing-to-check.test.mjs — «не нашёл ни одного файла» не выдаётся за «чисто».
//
// ЗАЧЕМ. Замер 2026-09-26: из 13 сканирующих гейтов на проекте без их файлов 10 молчали с кодом 0 —
// ровно так же, как на проверенном и чистом проекте. В жизни это не только пустая папка: `.aqkignore`,
// скрывший весь код, делал `todo-without-task` немым на проекте, где маркер долга был. Урок взят из
// разбора open-code-review: их проверка ссылок падает, если нашла подозрительно мало, — «a check that
// finds nothing must fail rather than report success». Решение владельца 2026-09-26: не краснеть
// (проект без таких файлов краснел бы всегда), а оставаться зелёным со строкой «пусто: …», которую
// прогон показывает под галочкой.
//
// Две записи намеренно НЕ говорят «пусто»: `env-secrets-not-committed` и `personal-config-not-shared`
// сторожат ОТСУТСТВИЕ файлов — для них «таких файлов нет» и есть чистый ответ.
import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { project, run, aqk, gate } from "./_fixture.mjs";

const EMPTY_SAYS = [
  "todo-without-task", "file-size-limit", "gate-not-weakened", "complexity-limit", "duplicate-code",
  "color-from-token", "mcp-server-resolves",
  "api-contract-has-arbiter", "entry-commands-exist", "test-has-assertion",
];
const ABSENCE_IS_CLEAN = ["env-secrets-not-committed", "personal-config-not-shared"];
// `secrets-not-in-code` читает ЛЮБОЙ файл, и README для него — прочитанный файл: пусто у него бывает
// только когда файлов нет вовсе. Проверяется на проекте с кодом ниже — там он обязан молчать о пустоте.
const EMPTY_RE = /^\s*пусто:/m;

test("на проекте без своих файлов каждый сканирующий гейт говорит «пусто», а не молчит", (t) => {
  const p = project(t, { "README.md": "# x\n" });
  for (const name of EMPTY_SAYS) {
    const r = gate(p, name);
    assert.equal(r.code, 0, `${name}: код ${r.code}\n${r.out}`);
    assert.match(r.out, EMPTY_RE, `${name} промолчал — «не смотрел» неотличимо от «чисто»:\n${r.out}`);
  }
  for (const name of ABSENCE_IS_CLEAN) {
    const r = gate(p, name);
    assert.equal(r.code, 0, `${name}: код ${r.code}\n${r.out}`);
    assert.doesNotMatch(r.out, EMPTY_RE, `${name}: отсутствие файлов для него и есть «чисто»`);
  }
});

test(".aqkignore, скрывший весь код, называется, а не выдаётся за чистоту", (t) => {
  // Маркер собран из частей, иначе этот файл сам станет находкой todo-without-task в нашем репозитории.
  const p = project(t, { "src/app.py": `x = 1\n# ${"TO" + "DO"} fix later\n`, ".aqkignore": "src/\n" });
  const r = gate(p, "todo-without-task");
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, EMPTY_RE, r.out);
  assert.match(r.out, /\.aqkignore/, `причина пустоты не названа:\n${r.out}`);
});

test("на проекте с кодом «пусто» не печатается", (t) => {
  const p = project(t, { "src/app.py": "def add(a, b):\n    return a + b\n" });
  for (const name of ["todo-without-task", "file-size-limit", "gate-not-weakened", "complexity-limit",
    "duplicate-code", "secrets-not-in-code"]) {
    const r = gate(p, name);
    assert.equal(r.code, 0, `${name}: ${r.out}`);
    assert.doesNotMatch(r.out, EMPTY_RE, `${name} сказал «пусто» на проекте с кодом:\n${r.out}`);
  }
});

test("doctor --run показывает «пусто» под галочкой зелёного гейта", (t) => {
  const root = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..", "..");
  const check = join(root, "kit", "gates", "todo-without-task", "check.sh").replace(/\\/g, "/");
  const p = project(t, { "README.md": "# x\n", ".aqk.yml": `gates:\n  todo: bash ${check} .\n` });
  run(p, "git", ["add", "."]);
  run(p, "git", ["commit", "-qm", "x"]);
  const r = aqk(p, "doctor", "--run");
  assert.match(r.out, /пусто:/, `строка «пусто» не дошла до человека:\n${r.out}`);
});

// Вторая половина того же класса. Каталоги, которые не читаются, были записаны дважды: около сорока
// имён у гейтов (`_skip.sh`) и восемь у определения языков (`repo.mjs`). Проект, где весь Python
// лежал в `vendor/`, считался проектом на Python: doctor советовал десять записей, которые, будучи
// поставлены, не прочитали бы ни одного файла. Одно правило в двух местах — урок разбора
// open-code-review (IDEA исправили, VS Code забыли). Теперь список один.
test("код в пропускаемых каталогах не делает проект проектом на этом языке", (t) => {
  const p = project(t, {
    "README.md": "# app\n",
    "vendor/lib/util.py": "def f():\n    return 1\n",
    "coverage/report.js": "var x = 1;\n",
  });
  const r = aqk(p, "doctor");
  const langs = (r.out.match(/(языки|languages):[^\n]*/) || [""])[0];
  assert.doesNotMatch(langs, /python|javascript/, `языки взяты из vendor/ и coverage/:\n${langs}`);
});

// Тот же класс уровнем выше. Прогон, в котором не объявлено ни одного гейта, печатал «Всё объявленное
// зелёное» и выходил с 0: формально верно (объявлено ничего), по сути — зелёная галочка над пустотой.
// Замечено при разборе cloudflare/security-audit-skill: их проверка реестра покрытия отвечает «PASS: 0
// coverage units valid» на пустой реестр. Код остаётся 0 (решение владельца для «пусто»), но вердикт
// обязан сказать, что прогонять было нечего.
test("doctor --run без единого гейта не говорит «всё зелёное»", (t) => {
  const p = project(t, { "README.md": "# x\n" });
  aqk(p, "init");
  const man = join(p.dir, ".aqk.yml");
  const text = readFileSync(man, "utf8").replace(/^gates:\n(?:[ \t]+.*\n?)*/m, "gates:\n");
  writeFileSync(man, text);
  run(p, "git", ["add", "-A"]);
  run(p, "git", ["commit", "-qm", "x"]);
  const r = aqk(p, "doctor", "--run");
  assert.doesNotMatch(r.out, /Всё объявленное зелёное/, `зелёный вердикт над пустым списком гейтов:\n${r.out}`);
  assert.match(r.out, /пусто:[^\n]*гейт/i, `не сказано, что прогонять было нечего:\n${r.out}`);
});
