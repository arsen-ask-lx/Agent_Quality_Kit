// Просроченный срок долга красит гейт КОДОМ ВОЗВРАТА, а не только строкой в выводе.
//
// ОТКУДА. Цикл 1 (`research/2026-09-23-upstream-practices/CYCLE-01.md`), строка «Показ bypass и
// долга»: сверить, что просрочка слышна. Проверка в `smoke.sh` называлась «храповик краснеет», а
// смотрела только, есть ли в выводе `doctor` слово «срок»: храповик, напечатавший «срок вышел» и
// вернувший 0, её проходил. Это класс «проверка обязана уметь сказать "нет"» (`kit/rules/general.md`)
// в нашем же наборе. Доказано подменой 2026-09-26: `exit 1` → `exit 0` в ветке срока — эта проверка
// красная, строка в `smoke.sh` осталась бы зелёной.
//
// Контроль в каждом случае — срок в будущем на том же долге: без него зелёное «прошло» нельзя
// отличить от храповика, который краснеет всегда.
import test from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { project, run } from "./_fixture.mjs";

const RATCHET = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "kit", "ratchet", "ratchet.sh")
  .replace(/\\/g, "/");

// Гейт находит ОДНО старое нарушение, записанное в долг: новых нет, красить может только срок.
const OLD = "echo 'src/old.py:3: старое нарушение'; exit 1";
const reg = (deadline) => `# Реестр долга: g\n# aqk-deadline: ${deadline}\nsrc/old.py: старое нарушение\n`;
const ratchet = (p) => run(p, "bash", [RATCHET, "reg.txt", "sh", "-c", OLD]);

test("срок в прошлом: гейт красный при одном лишь старом долге", (t) => {
  const r = ratchet(project(t, { "reg.txt": reg("2020-01-01") }));
  assert.equal(r.code, 1, `просроченный долг прошёл с кодом ${r.code}:\n${r.out}`);
  assert.match(r.out, /срок долга вышел: 2020-01-01/, `не сказано, что именно просрочено:\n${r.out}`);
});

test("срок в будущем на том же долге: гейт зелёный", (t) => {
  const r = ratchet(project(t, { "reg.txt": reg("2999-01-01") }));
  assert.equal(r.code, 0, `непросроченный долг покрашен:\n${r.out}`);
  assert.doesNotMatch(r.out, /срок долга вышел/, r.out);
});
