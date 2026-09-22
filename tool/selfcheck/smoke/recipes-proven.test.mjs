// Приёмка каталога называет рецепты, которые образцами не доказаны.
//
// ЗАЧЕМ. Образцы записи пишутся под ОДИН рецепт (`any`, а без него — `samples_for`), и приёмка
// гоняет только его. У `dead-code` рецептов пять, доказан один; у `swallowed-error` — четыре и
// один. При этом все записи числились `stable`, и недоказанная строка `go: errcheck -blank`
// выглядела так же, как доказанная. Свод: «если утверждение не проверяется машиной — его в
// стандарте нет». Прежде чем доказывать рецепты под другие языки, приёмка обязана их хотя бы
// назвать — прибор раньше улучшений. Найдено 2026-09-22 при попытке добавить Go-рецепты.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

test("приёмка называет рецепты без доказательства образцами", () => {
  const r = spawnSync("bash", [join(ROOT, "tool", "selfcheck", "gates.sh")], {
    cwd: ROOT, encoding: "utf8", timeout: 240000, env: { ...process.env, AQK_LANG: "ru" },
  });
  const out = `${r.stdout}${r.stderr}`.replace(/\x1b\[[0-9;]*m/g, "");
  assert.match(out, /рецептов без доказательства образцами: \d+/, `строки нет:\n${out.slice(-800)}`);
  assert.match(out, /dead-code: [^\n]*\bgo\b/, `dead-code с Go не назван:\n${out.slice(-800)}`);
  assert.doesNotMatch(out, /test-has-assertion:/, "запись с одним переносимым рецептом названа напрасно");
});
