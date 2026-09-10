// tool/selfcheck/smoke/fail-closed.test.mjs — проверка, которая НЕ МОЖЕТ работать, обязана
// сказать это, а не позеленеть.
//
// ЗАЧЕМ. Весь стандарт написан против одного: тишина читается как «чисто». Три раза подряд
// он нарушен в нём самом — найдено 2026-09-10, когда проба впервые начала гонять гейты по
// КОПИИ проекта и увидела их так же, как видит пользователь:
//
//   1. Подмена общей библиотеки `kit/gates/_skip.sh` даёт код 0. Гейт печатает
//      «command not found» и объявляет проект чистым. Библиотеку подключает КАЖДАЯ запись
//      каталога, то есть одним испорченным файлом гасится весь набор защит.
//   2. Гейт, читающий историю, в каталоге без git возвращает 0 за ноль секунд. Он не прошёл —
//      он не смог посмотреть, и разницы в выводе нет никакой.
//
// Обе — отказ В ОТКРЫТУЮ сторону: чем сильнее сломано, тем зеленее ответ. Договор один и тот
// же, он уже записан в комплекте: 0 — проверено и чисто, 1 — находка, ВСЁ ОСТАЛЬНОЕ — «не
// смогли проверить». Именно так `prove` и `execution.mjs` разбирают исход, и гейты обязаны
// говорить на том же языке.
import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { project, run, aqk } from "./_fixture.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const posix = (p) => String(p).replace(/\\/g, "/");

// Ставит запись каталога В ПРОЕКТ вместе с общей библиотекой — так же, как это делает `aqk add`.
// Библиотеку кладём отдельно, чтобы проверка могла её испортить: в исходном каталоге её портить
// нельзя, там она общая на весь набор.
function installGate(p, name, { skipLib } = {}) {
  const dest = join(p.dir, "gates", name);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(join(ROOT, "kit", "gates", name), dest, { recursive: true });
  const lib = join(p.dir, "gates", "_skip.sh");
  if (skipLib === undefined) cpSync(join(ROOT, "kit", "gates", "_skip.sh"), lib);
  else writeFileSync(lib, skipLib, "utf8");
  return posix(join("gates", name, "check.sh"));
}

test("гейт с ИСПОРЧЕННОЙ общей библиотекой не смеет отвечать «чисто»", (t) => {
  const p = project(t, { "src/a.py": "x = 1\n" });
  const check = installGate(p, "complexity-limit", { skipLib: "мусор вместо библиотеки\n" });
  const r = run(p, "bash", [check, "."]);
  assert.notEqual(r.code, 0,
    `гейт вернул 0 при нерабочей библиотеке обхода. Вывод:\n${r.out}`);
});

test("та же запись с ЦЕЛОЙ библиотекой на том же проекте молчит — значит дело в поломке", (t) => {
  const p = project(t, { "src/a.py": "x = 1\n" });
  const check = installGate(p, "complexity-limit");
  const r = run(p, "bash", [check, "."]);
  assert.equal(r.code, 0, `гейт покраснел на исправном проекте. Вывод:\n${r.out}`);
});

// Второй отказ: истории нет — смотреть не на что. «Не смогли» и «чисто» обязаны различаться,
// иначе проект без git получает зелёный прогон по построению.
for (const name of ["commit-explains-itself", "test-not-adjusted"]) {
  test(`«${name}» без репозитория говорит «не смогли», а не «чисто»`, (t) => {
    const p = project(t, { "src/a.py": "x = 1\n" }, { git: false });
    const check = installGate(p, name);
    const r = run(p, "bash", [check, "."]);
    assert.notEqual(r.code, 0,
      `гейт вернул 0 там, где истории нет и посмотреть было не на что. Вывод:\n${r.out}`);
  });
}

// У `protection-not-removed` свидетель — тоже история, но выходит он раньше: на отсутствии
// манифеста. Поэтому проект здесь С манифестом и объявленными гейтами: сторожить есть что,
// а посмотреть нечем.
test("«protection-not-removed» без репозитория говорит «не смогли», а не «чисто»", (t) => {
  const p = project(t, {
    "src/a.py": "x = 1\n",
    ".aqk.yml": "aqk: 1\nentry:\n  - AGENTS.md\ngates:\n  lint: \"true\"\n",
    "AGENTS.md": "# проект\n",
  }, { git: false });
  const check = installGate(p, "protection-not-removed");
  const r = run(p, "bash", [check, "."]);
  assert.notEqual(r.code, 0,
    `гейт вернул 0 там, где снимок сторожить нечем. Вывод:\n${r.out}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Правило со сторожем-человеком обязано быть названо ЧЕЛОВЕКУ. Написано ДО кода 2026-09-10.
//
// ЗАЧЕМ. Отчёт живого проекта: «всё, что касается масштаба, помечено `aqk: человек`. AQK
// отработал честно: потребовал назвать сторожа, мы назвали — и сторож не проверил». Пометка
// `человек` — не сторож, а расписка в том, что сторожа нет: гейт `promise-has-gate` видит её
// и идёт дальше (`if (tag == "человек") next`).
//
// Числа уже считаются и уже печатаются — но только в блоке `context`, который читает АГЕНТ.
// Человеку, который и назначен сторожем, `doctor` про это не говорит ни слова. То есть
// единственный, кто обязан помнить о непроверяемом обещании, — единственный, кому о нём не
// сообщают. В нашем собственном своде так помечено 12 правил из 14.
test("doctor называет человеку, сколько правил не сторожит машина", (t) => {
  const p = project(t, {
    "AGENTS.md": [
      "# проект",
      "## Правила",
      "- **Секреты не в коде.** <!-- aqk: secrets-not-in-code -->",
      "- **План до кода.** <!-- aqk: человек -->",
      "- **Три попытки.** <!-- aqk: человек -->",
      "",
    ].join("\n"),
    ".aqk.yml": 'aqk: 1\nentry:\n  - AGENTS.md\ngates:\n  lint: "true"\n',
  });
  const r = aqk(p, "doctor");
  assert.match(r.out, /2/,
    `doctor не назвал число правил со сторожем-человеком. Вывод:\n${r.out}`);
  assert.ok(/человек/i.test(r.out),
    `doctor не сказал про сторожа-человека ни слова, хотя таких правил здесь два.\n${r.out}`);
});
