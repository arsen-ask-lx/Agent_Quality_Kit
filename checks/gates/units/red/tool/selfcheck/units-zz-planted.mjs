// Образец для доказательства гейта units: модульная проверка, которая падает.
import test from "node:test";
import assert from "node:assert/strict";

test("подсаженная проверка падает", () => {
  assert.equal(1 + 1, 3);
});
