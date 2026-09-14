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
import { project, run, aqk, aqkEnv } from "./_fixture.mjs";

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

// ─────────────────────────────────────────────────────────────────────────────
// СБОЙ САМОЙ ПРОВЕРКИ НЕ СУЖАЕТСЯ ДИФОМ. Написано ДО кода 2026-09-14.
//
// ЗАЧЕМ. Внешний разбор (аудит Runcap, 2026-09-13) искал у нас тот же класс отказа, что нашёл
// у соседа, и нашёл: `--since` фильтрует вывод ПО ПУТЯМ, и гейт, который НЕ СМОГ отработать,
// печатался зелёным, если названный им путь в диф не попал. То есть
//
//   проверка сломалась → прогон говорит «чисто»
//
// — ровно та тишина, против которой построен весь стандарт, только внутри нашего же флага.
// Договор уже записан в `execution.mjs` и уже соблюдается в `prove`: 0 чисто, 1 находка (у
// vulture 3, у pylint битовой маской), ВСЁ ОСТАЛЬНОЕ — «не смогли». Сужать дифом можно только
// НАХОДКУ: у сбоя нет места в коде, которое он называет, — есть только сам сбой.
// Цвет снимается: в терминале между знаком и именем гейта стоит управляющая
// последовательность, и проверка, написанная «по глазам», не совпала бы ни разу.
const plain = (s) => String(s).replace(/\u001b\[[0-9;]*m/g, "");

function scopeProject(t, { code, path }) {
  const p = project(t, {
    "AGENTS.md": "# проект\n",
    ".aqk.yml": 'aqk: 1\nentry:\n  - AGENTS.md\ngates:\n  broken: "bash broken.sh"\n',
    // Команда — ФАЙЛОМ, а не строкой `echo …; exit 2`: на Windows строку исполняет cmd.exe,
    // где `;` не разделитель, и гейт выходит нулём. Поймано конвейером 2026-09-11.
    "broken.sh": `echo "${path}: infrastructure failure"\nexit ${code}\n`,
  });
  run(p, "git", ["add", "-A"]);
  run(p, "git", ["commit", "-qm", "база"]);
  // Изменение ПОСЛЕ коммита: ровно один файл в дифе, и путь из вывода гейта в него не входит.
  mkdirSync(join(p.dir, "src"), { recursive: true });
  writeFileSync(join(p.dir, "src", "a.mjs"), "export const a = 1;\n", "utf8");
  return p;
}

test("гейт, выпавший с непонятным кодом, остаётся красным и при --since", (t) => {
  const p = scopeProject(t, { code: 2, path: "outside/old.mjs:1" });
  const r = aqk(p, "doctor", "--run", "--since", "HEAD");
  assert.match(plain(r.out), /✘\s+broken/,
    "гейт вышел с кодом 2 — «не смогли проверить» — и показан зелёным, потому что названный " +
    `им путь не попал в диф. Вывод:\n${r.out}`);
});

test("контроль: НАХОДКА вне дифа по-прежнему сужается", (t) => {
  const p = scopeProject(t, { code: 1, path: "outside/old.mjs:1" });
  const r = aqk(p, "doctor", "--run", "--since", "HEAD");
  assert.match(plain(r.out), /✔\s+broken/,
    `находка вне дифа обязана сужаться — иначе --since не делает ничего. Вывод:\n${r.out}`);
});

test("контроль: находка ВНУТРИ дифа остаётся красной", (t) => {
  const p = scopeProject(t, { code: 1, path: "src/a.mjs:1" });
  const r = aqk(p, "doctor", "--run", "--since", "HEAD");
  assert.match(plain(r.out), /✘\s+broken/, `находка в изменённом файле пропала. Вывод:\n${r.out}`);
});

test("контроль: нулевой код остаётся «чисто»", (t) => {
  const p = scopeProject(t, { code: 0, path: "outside/old.mjs:1" });
  const r = aqk(p, "doctor", "--run", "--since", "HEAD", "--verbose");
  assert.match(plain(r.out), /✔\s+broken/, `нулевой код перестал означать «чисто». Вывод:\n${r.out}`);
});

test("параллельный прогон говорит о сбое то же самое, что одиночный", (t) => {
  const p = scopeProject(t, { code: 2, path: "outside/old.mjs:1" });
  const one = plain(aqk(p, "doctor", "--run", "--since", "HEAD").out);
  const many = plain(aqk(p, "doctor", "--run", "--since", "HEAD", "--jobs", "2").out);
  const line = (out) => (out.split("\n").find((l) => /broken/.test(l) && /[✘✔!]/.test(l)) || "").trim();
  assert.match(line(many), /✘/, `при --jobs сбой не покраснел. Вывод:\n${many}`);
  assert.equal(line(many).replace(/\d+\.\ds/, ""), line(one).replace(/\d+\.\ds/, ""),
    `одно и то же событие названо по-разному в одиночном и параллельном прогоне:\n${line(one)}\n${line(many)}`);
});

// Совещательный — это «показать, но не останавливать». Причина остановки тут ни при чём: сбой
// такой проверки обязан быть НАЗВАН и обязан не ронять прогон. Раньше на таймауте ронял.
test("сбой СОВЕЩАТЕЛЬНОГО гейта назван, но прогон не уронен", (t) => {
  const p = scopeProject(t, { code: 2, path: "outside/old.mjs:1" });
  writeFileSync(join(p.dir, ".aqk.yml"),
    'aqk: 1\nentry:\n  - AGENTS.md\ngates:\n  broken: "bash broken.sh"\nadvisory:\n  - broken\n', "utf8");
  const r = aqk(p, "doctor", "--run", "--since", "HEAD");
  const out = plain(r.out);
  assert.match(out, /!\s+broken/, `совещательный сбой не назван вовсе. Вывод:\n${out}`);
  assert.match(out, /не смогли проверить/, `сбой назван находкой, а не «не смогли». Вывод:\n${out}`);
  assert.doesNotMatch(out, /красных гейтов/,
    `совещательный уронил прогон — список advisory перестал что-либо значить. Вывод:\n${out}`);
});

// Пометка в pull request у сбоя — ОБЩАЯ, без file=: путь из вывода упавшего гейта назвал не
// виноватого, а того, до кого гейт успел дойти.
test("в GitHub Actions сбой помечается гейтом, а не строкой чужого файла", (t) => {
  const p = scopeProject(t, { code: 2, path: "outside/old.mjs:1" });
  const r = aqkEnv(p, { GITHUB_ACTIONS: "true" }, "doctor", "--run", "--since", "HEAD");
  const ann = plain(r.out).split("\n").filter((l) => l.startsWith("::error"));
  assert.equal(ann.length, 1, `пометок про сбой не одна:\n${ann.join("\n")}`);
  assert.doesNotMatch(ann[0], /file=/, `пометка повешена на файл, которого сбой не касается: ${ann[0]}`);
  assert.match(ann[0], /title=aqk%3A broken/, `пометка не называет гейт: ${ann[0]}`);
});
