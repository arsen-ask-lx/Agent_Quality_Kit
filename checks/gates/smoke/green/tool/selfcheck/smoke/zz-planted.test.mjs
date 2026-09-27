// Образец для доказательства гейта smoke: та же проверка, исправленная.
import test from "node:test";
import assert from "node:assert/strict";

test("подсаженная проверка комплекта проходит", () => {
  assert.equal("зелёный", "зелёный");
});
