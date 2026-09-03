// tool/selfcheck/units.mjs — проверки отдельных функций программы.
//
// ЗАЧЕМ ОТДЕЛЬНО ОТ smoke.sh. Прогон на чистой папке проверяет программу целиком и снаружи:
// он ловит «init не разложил файлы», но не ловит «условие триггера считается неверно» — такой
// дефект прячется за общим зелёным итогом. Оба дефекта, ради которых эти проверки написаны,
// именно так и жили: `.mjs` не считался JavaScript, а подсказка печаталась куском исходника.
//
// Зависимостей нет: `node:test` встроен начиная с Node 18.
//
//   node --test tool/selfcheck/units.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { parseManifest, manifestWithGate } from "../lib/manifest.mjs";
import { triggerVerdict, recipeFor, stems, overlap, EXT_LANG } from "../lib/repo.mjs";

const facts = (over = {}) => ({ langs: new Set(), files: 0, ...over });

// --- опознание языка по расширению -------------------------------------------
// Найдено на самом aqk: вся программа лежит в .mjs, и запись про отладочную печать
// пряталась с пояснением «нет языков: javascript» — в проекте, целиком на JavaScript.
test("расширение .mjs — это JavaScript", () => {
  assert.equal(EXT_LANG[".mjs"], "javascript");
  assert.equal(EXT_LANG[".cjs"], "javascript");
  assert.equal(EXT_LANG[".mts"], "typescript");
  assert.equal(EXT_LANG[".py"], "python");
});

// --- разбор манифеста ---------------------------------------------------------
test("список читается и строкой в скобках, и пунктами", () => {
  assert.deepEqual(parseManifest("entry: [AGENTS.md, CLAUDE.md]").entry, ["AGENTS.md", "CLAUDE.md"]);
  assert.deepEqual(parseManifest("entry:\n  - AGENTS.md\n  - CLAUDE.md").entry, ["AGENTS.md", "CLAUDE.md"]);
});

test("вложенный блок читается словарём, комментарий отбрасывается", () => {
  const m = parseManifest('gates:\n  smoke: "bash x.sh"  # пояснение\nrules: kit/rules\n');
  assert.deepEqual(m.gates, { smoke: "bash x.sh" });
  assert.equal(m.rules, "kit/rules");
});

// --- триггер ------------------------------------------------------------------
test("без триггера запись не показывается", () => {
  assert.equal(triggerVerdict({}, facts()).applies, false);
});

test("условия складываются по И: одно ложное скрывает запись", () => {
  const rec = { trigger: { langs: "python", files_gt: "10" } };
  assert.equal(triggerVerdict(rec, facts({ langs: new Set(["python"]), files: 50 })).applies, true);
  assert.equal(triggerVerdict(rec, facts({ langs: new Set(["python"]), files: 3 })).applies, false);
  assert.equal(triggerVerdict(rec, facts({ langs: new Set(["go"]), files: 50 })).applies, false);
});

test("причина, по которой запись скрыта, называется словами", () => {
  const v = triggerVerdict({ trigger: { langs: "python, typescript" } }, facts({ langs: new Set(["go"]) }));
  assert.match(v.why, /нет языков: python, typescript/);
});

test("неизвестное условие скрывает запись, а не пропускает её", () => {
  // Молча пропустить незнакомое условие значит показать запись всем подряд.
  const v = triggerVerdict({ trigger: { has_kubernetes: "true" } }, facts());
  assert.equal(v.applies, false);
  assert.match(v.why, /не умеет считать/);
});

// --- выбор рецепта ------------------------------------------------------------
test("без родного языка берётся переносимый рецепт, {dir} подставляется", () => {
  const cmd = recipeFor({ slug: "x", recipes: { any: "bash {gate}/check.sh {dir}" } }, facts());
  assert.match(cmd, /check\.sh \.$/);
});

test("рецепта нет — так и сказано, а не пустая строка", () => {
  assert.equal(recipeFor({ slug: "x", recipes: {} }, facts()), "рецепт не описан");
});

// --- дедупликация по намерению ------------------------------------------------
test("разные намерения не путаются служебными словами", () => {
  // Найдено на `aqk new dead-code-not-shipped`: слова not/in/code давали ложное совпадение
  // с записью secrets-not-in-code, и заготовка не создавалась.
  const q = stems("dead code not shipped");
  assert.ok(overlap(q, stems("ключи, пароли и приватные ключи не попадают в код")) < 0.5);
});

test("то же намерение другими словами совпадает", () => {
  const q = stems("отладочная печать не доезжает до продакшена");
  assert.ok(overlap(q, stems("отладочная печать не доезжает до прод-кода")) >= 0.5);
});

// --- дописывание гейта в манифест ---------------------------------------------
test("гейт дописывается в блок gates и не дублируется", () => {
  const src = "aqk: 1\ngates:\n  smoke: \"bash x.sh\"\n";
  const a = manifestWithGate(src, "no-print-in-prod", "bash y.sh");
  assert.match(a.text, /no-print-in-prod: "bash y\.sh"/);
  assert.equal(manifestWithGate(a.text, "no-print-in-prod", "bash y.sh").text, null);
});

test("без блока gates программа объясняет, чего не хватает", () => {
  const r = manifestWithGate("aqk: 1\n", "x", "bash y.sh");
  assert.equal(r.text, null);
  assert.match(r.why, /нет блока gates/);
});
