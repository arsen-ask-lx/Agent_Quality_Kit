// Образец для доказательства гейта units: та же проверка, исправленная.
import test from "node:test";
import assert from "node:assert/strict";

test("подсаженная проверка проходит", () => {
  assert.equal(1 + 1, 2);
});
