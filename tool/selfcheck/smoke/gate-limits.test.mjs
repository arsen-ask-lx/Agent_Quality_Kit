// Предел гейта, заданный мусором, — «проверка не состоялась», а не тихое «чисто».
//
// ОТКУДА. Цикл 2 (`research/2026-09-23-upstream-practices/CYCLE-02.md`): у `evalite` шкала оценки
// 0–1 только описана в типах, и оценщик, вернувший 5, проходит порог 80 % как «500 %». Тот же
// вопрос к нашим пределам дал худшее: не завышенное число, а тишину.
//
// ЗАМЕР 2026-09-26, каждый гейт на СВОЁМ красном образце:
//   complexity-limit  AQK_MAX_DEPTH=abc          → код 0, ноль строк вывода
//   duplicate-code    AQK_DUP_LINES=abc  или -3  → код 0, ноль строк вывода
// `awk` превращает нечисловое в ноль без единого слова, и опечатка в переменной окружения
// выключает гейт на заведомом браке. `file-size-limit` переменной не читает — предел в коде.
//
// ПОЧЕМУ КОД 2, А НЕ ПРЕДЕЛ ПО УМОЛЧАНИЮ. Подставить умолчание молча — значит проверить не то,
// что человек велел; он узнает об этом никогда. Так же устроены директивы храповика
// (`aqk-goal`, `aqk-deadline` в `kit/ratchet/ratchet.sh`): опечатка обязана быть слышной.
import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const GATES = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "kit", "gates");
const gate = (name, env) => {
  const r = spawnSync("bash", [join(GATES, name, "check.sh"), join(GATES, name, "red")], {
    encoding: "utf8", env: { ...process.env, ...env },
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};

const CASES = [
  { name: "complexity-limit", env: "AQK_MAX_DEPTH" },
  { name: "duplicate-code", env: "AQK_DUP_LINES" },
];

for (const { name, env } of CASES) {
  test(`${name}: предел по умолчанию краснеет на красном образце`, () => {
    const r = gate(name, { [env]: "" });
    assert.equal(r.code, 1, `контроль: без предела гейт обязан найти брак, а дал ${r.code}\n${r.out}`);
  });

  for (const bad of ["abc", "-3", "0", "5x"]) {
    test(`${name}: ${env}=${bad} — проверка не состоялась, а не чисто`, () => {
      const r = gate(name, { [env]: bad });
      assert.equal(r.code, 2, `${env}=${bad} дал код ${r.code} на заведомом браке\n${r.out}`);
      assert.match(r.out, new RegExp(env), `не названо, какая переменная испорчена:\n${r.out}`);
    });
  }
}
