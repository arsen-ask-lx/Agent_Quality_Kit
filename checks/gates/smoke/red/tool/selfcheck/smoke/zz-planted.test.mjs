// Образец для доказательства гейта smoke: проверка, которая падает.
import test from "node:test";
import assert from "node:assert/strict";

test("подсаженная проверка комплекта падает", () => {
  assert.equal("красный", "зелёный");
});
