// tool/selfcheck/units-level.mjs — проверки уровня и доказательства гейтов.
//
// ОТДЕЛЬНЫМ ФАЙЛОМ, а не в units.mjs: тот перерос собственный предел в 500 строк, и поймал
// это наш же гейт `file-size-limit` на прогоне. Шов по смыслу: здесь всё про то, чем ступень
// отличается от заявления, — остальное осталось на месте.
//
//   node --test tool/selfcheck/units-level.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { commandFor } from "../lib/prove.mjs";
import { assessLevel } from "../lib/manifest.mjs";

// --- доказательство гейтов ------------------------------------------------------------
// ЗАЧЕМ. Ступень AQK-2 называлась «гейты доказаны» и проверяла существование двух папок.
// Проект с тремя гейтами `true` проходил порог AQK-3 — проверено прогоном на пустой папке.
test("обёртка храповика снимается перед подстановкой каталога", () => {
  // Иначе доказательство гоняет гейт вместе с реестром долга, и реестр перезаписывается
  // находками из ОБРАЗЦА. На живом проекте это стёрло бы долг целиком.
  const cmd = "bash ratchets/_ratchet.sh ratchets/x.txt bash gates/x/check.sh .";
  assert.equal(commandFor(cmd, "gates/x/red"), "bash gates/x/check.sh gates/x/red");
});

test("каталог подставляется вместо последнего слова команды", () => {
  assert.equal(commandFor("bash gates/x/check.sh .", "gates/x/green"), "bash gates/x/check.sh gates/x/green");
  assert.equal(commandFor("ruff check --select T20 .", "gates/x/red"), "ruff check --select T20 gates/x/red");
});

test("ступень выше первой не берётся без доказательства", async () => {
  const man = {
    aqk: "0.6.0", entry: [], rules: ".", samples: ".", ratchets: ".", lessons: ".",
    gates: { lint: "true" },
  };
  const withoutProof = await assessLevel(man, null);
  const withFailedProof = await assessLevel(man, { ok: false });
  const withProof = await assessLevel(man, { ok: true });
  // Без доказательства ступень не выполнена, но помечена «не проверяли» — это разные состояния.
  assert.equal(withoutProof.steps[2].ok, false);
  assert.equal(withoutProof.steps[2].needsProof, true);
  assert.equal(withFailedProof.steps[2].ok, false);
  assert.equal(withFailedProof.steps[2].needsProof, false);
  assert.equal(withProof.steps[2].ok, true);
});

test("обёртка родного инструмента едет вместе с каталогом образца", () => {
  // `_native.sh <каталог> <команда…>` прячет пути gates/*/red|green. Оставленный «.» спрятал бы
  // ровно то, что образец обязан показать, — красный прошёл бы зелёным.
  const cmd = "bash gates/_native.sh . ruff check --select T20 .";
  assert.equal(
    commandFor(cmd, "gates/x/red"),
    "bash gates/_native.sh gates/x/red ruff check --select T20 gates/x/red"
  );
});

test("обе обёртки снимаются вместе", () => {
  const cmd = "bash ratchets/_ratchet.sh ratchets/x.txt bash gates/_native.sh . ruff check .";
  assert.equal(
    commandFor(cmd, "gates/x/green"),
    "bash gates/_native.sh gates/x/green ruff check gates/x/green"
  );
});
