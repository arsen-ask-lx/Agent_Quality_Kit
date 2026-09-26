// tool/selfcheck/smoke/protection-command.test.mjs — снимок защиты помнит не только имя гейта, но
// и его команду. Написаны ДО правки.
//
// ЗАЧЕМ. Найдено 2026-09-26 сверкой с kirder24-code/ai-agent-manager (цикл A5): у их судьи правка
// правил в том же дифе, который эти правила судят, автоматического вердикта не получает. У нас —
// получала. В одном PR у гейта `secrets-not-in-code` команда заменена на "true" (имя то же), рядом
// в код лёг ключ, и `doctor --run --since main` сказал «Everything declared is green», код 0.
// `protection-not-removed` сторожил ИМЕНА, а подмена команды при том же имени — тот же
// `pytest || true`, только без `||`.
//
// ФОРМАТ. Команда пишется строкой `# run имя: команда`. Решётка в начале — ради копий гейта,
// уже стоящих у людей: старая проверка такие строки пропускает, а не читает как имя гейта.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { project, run, aqk, gate } from "./_fixture.mjs";
import { parseManifest } from "../../lib/manifest.mjs";

const HEAD = "aqk: 1\nentry: [AGENTS.md]\nratchets: ratchets\ngates:\n";
const REG = "# Снимок объявленной защиты. Набор может только РАСТИ.\n";

function setup(t, manifestGates, snapshot) {
  return project(t, {
    ".aqk.yml": HEAD + manifestGates,
    "AGENTS.md": "# свод\n",
    "ratchets/gates-declared.txt": REG + snapshot,
  });
}

test("подменённая команда при том же имени — красное, с «было» и «стало»", (t) => {
  const p = setup(t, `  secrets: "true"\n  lint: "ruff check ."\n`,
    `secrets\n# run secrets: bash gates/secrets/check.sh .\nlint\n# run lint: ruff check .\n`);
  const r = gate(p, "protection-not-removed");
  assert.equal(r.code, 1, `подмену команды не заметили:\n${r.out}`);
  assert.match(r.out, /secrets/);
  assert.match(r.out, /bash gates\/secrets\/check\.sh \./, `не названо, что было:\n${r.out}`);
  assert.match(r.out, /«true»/, `не названо, что стало:\n${r.out}`);
  assert.doesNotMatch(r.out, /lint.*был/, `совпавший гейт назван изменённым:\n${r.out}`);
});

test("совпадающие команды — зелёное без советов", (t) => {
  const p = setup(t, `  secrets: "bash gates/secrets/check.sh ."\n`,
    `secrets\n# run secrets: bash gates/secrets/check.sh .\n`);
  const r = gate(p, "protection-not-removed");
  assert.equal(r.code, 0, r.out);
  assert.doesNotMatch(r.out, /совет/, r.out);
});

test("снимок старого формата — не красное, но слепота названа вслух", (t) => {
  const p = setup(t, `  secrets: "true"\n`, `secrets\n`);
  const r = gate(p, "protection-not-removed");
  assert.equal(r.code, 0, `старый снимок уронил прогон при обновлении:\n${r.out}`);
  assert.match(r.out, /совет:[^\n]*команд/, `молчание про незаписанные команды читается как «проверено»:\n${r.out}`);
});

test("у одного гейта строку команды стёрли — красное", (t) => {
  const p = setup(t, `  secrets: "true"\n  lint: "ruff check ."\n`,
    `secrets\nlint\n# run lint: ruff check .\n`);
  const r = gate(p, "protection-not-removed");
  assert.equal(r.code, 1, `стёртая строка команды прошла:\n${r.out}`);
  assert.match(r.out, /secrets/, r.out);
});

test("снятый с причиной гейт: его строка команды ничего не требует", (t) => {
  const p = setup(t, `  lint: "ruff check ."\n`,
    `secrets  # снят: закрыт гейтом lint\n# run secrets: bash gates/secrets/check.sh .\nlint\n# run lint: ruff check .\n`);
  const r = gate(p, "protection-not-removed");
  assert.equal(r.code, 0, r.out);
});

// ДОГОВОР С РАЗБОРОМ ПРОГРАММЫ. Команду из манифеста читают двое: `parseManifest` (JS) — она и
// исполняется — и эта проверка (sh). Если они прочтут строку по-разному, проверка будет сравнивать
// не то, что запускается. Поэтому эталон строки команды здесь берётся из разбора программы.
test("проверка читает команду так же, как программа, которая её запускает", (t) => {
  const lines = [
    `  a: "npx jscpd --format "java,c#,php" ."`,
    `  b: bash x.sh .   # комментарий после пробела`,
    `  c: 'sh -c "exit 0"'`,
    `  d: node tool/program.mjs doctor --run#1`,
    "  e:\t\"node --test tool/selfcheck/units*.mjs\"  ",
  ];
  const parsed = parseManifest(HEAD + lines.join("\n") + "\n").gates;
  const names = Object.keys(parsed);
  assert.equal(names.length, lines.length, `разбор программы потерял строки: ${JSON.stringify(parsed)}`);
  const snap = names.map((n) => `${n}\n# run ${n}: ${parsed[n]}\n`).join("");
  const p = setup(t, lines.join("\n") + "\n", snap);
  const r = gate(p, "protection-not-removed");
  assert.equal(r.code, 0, `проверка прочла команду иначе, чем программа:\n${r.out}`);
  // Контроль: без него зелёное выше доказывало бы только то, что команды не сравниваются вовсе.
  // Каждая строка по очереди портится на один хвостовой символ — и каждая обязана покраснеть.
  for (const n of names) {
    writeFileSync(join(p.dir, "ratchets", "gates-declared.txt"),
      REG + snap.replace(`# run ${n}: ${parsed[n]}\n`, `# run ${n}: ${parsed[n]}x\n`));
    const bad = gate(p, "protection-not-removed");
    assert.equal(bad.code, 1, `испорченная команда гейта «${n}» прошла:\n${bad.out}`);
  }
});

test("`add` записывает команды всех объявленных гейтов и не переписывает записанную", (t) => {
  const p = project(t, { "app.py": "x = 1\n", "AGENTS.md": "# свод\n" });
  aqk(p, "init");
  aqk(p, "add", "secrets-not-in-code");
  const reg = join(p.dir, "ratchets", "gates-declared.txt");
  const man = parseManifest(readFileSync(join(p.dir, ".aqk.yml"), "utf8")).gates;
  let snap = readFileSync(reg, "utf8");
  assert.ok(snap.includes(`# run secrets-not-in-code: ${man["secrets-not-in-code"]}\n`), `команда не записана:\n${snap}`);

  // Записанную команду `add` не узаконивает заново: иначе подмену «лечил» бы любой следующий add.
  writeFileSync(reg, snap.replace(/^# run secrets-not-in-code: .*$/m, "# run secrets-not-in-code: было-до"));
  aqk(p, "add", "protection-not-removed");
  snap = readFileSync(reg, "utf8");
  assert.match(snap, /^# run secrets-not-in-code: было-до$/m, `add переписал записанную команду:\n${snap}`);
  assert.match(snap, /^# run protection-not-removed: /m, `новый гейт без команды:\n${snap}`);
});

// Сквозной сценарий из разбора A5 — ровно тот, что прошёл зелёным.
test("подмена команды гейта в том же PR роняет doctor --run", (t) => {
  const p = project(t, { "app.py": "x = 1\n", "AGENTS.md": "# свод\n" });
  aqk(p, "init");
  aqk(p, "add", "secrets-not-in-code");
  aqk(p, "add", "protection-not-removed");
  run(p, "git", ["add", "-A"]);
  run(p, "git", ["commit", "-qm", "база", "-m", "Сделано: x", "-m", "Не уверен: y"]);
  const man = join(p.dir, ".aqk.yml");
  writeFileSync(man, readFileSync(man, "utf8").replace(/^  secrets-not-in-code: .*$/m, `  secrets-not-in-code: "true"`));
  const r = aqk(p, "doctor", "--run");
  assert.notEqual(r.code, 0, `подмену команды в том же PR пропустили:\n${r.out}`);
  assert.match(r.out, /protection-not-removed/, r.out);
});
