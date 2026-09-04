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
import { CATALOGS, pickLang, L } from "../i18n/index.mjs";

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
  // Сверяем с каталогом, а не с буквами: текст переводится, а выбор причины — нет.
  assert.equal(v.why, L.trigger.noLangs("python, typescript"));
});

test("always: false значит «никогда не применимо», а не «условие пропущено»", () => {
  const v = triggerVerdict({ trigger: { always: "false" } }, facts());
  assert.equal(v.applies, false);
});

test("неизвестное условие скрывает запись, а не пропускает её", () => {
  // Молча пропустить незнакомое условие значит показать запись всем подряд.
  const v = triggerVerdict({ trigger: { has_kubernetes: "true" } }, facts());
  assert.equal(v.applies, false);
  assert.equal(v.why, L.trigger.unknown("has_kubernetes"));
});

// --- выбор рецепта ------------------------------------------------------------
test("без родного языка берётся переносимый рецепт, {dir} подставляется", () => {
  const cmd = recipeFor({ slug: "x", recipes: { any: "bash {gate}/check.sh {dir}" } }, facts());
  assert.match(cmd, /check\.sh \.$/);
});

test("рецепта нет — так и сказано, а не пустая строка", () => {
  assert.equal(recipeFor({ slug: "x", recipes: {} }, facts()), L.recipe.none);
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
  assert.equal(r.why, L.manifest.noGatesBlock);
});

// --- каталоги строк не расходятся ---------------------------------------------
// ЗАЧЕМ. «Поддерживаем два языка» — утверждение, которое обязана держать машина, а не память
// того, кто правил вывод в последний раз. Забытый ключ в одном каталоге даёт `undefined` в
// выводе — не отказ, а тихую порчу текста ровно у того, кто пришёл на втором языке.
// В массивы заходим тоже: ступени уровней и многострочные пояснения лежат массивами, и без
// этого проверка сравнивала бы их как один непрозрачный «object» — то есть не сравнивала.
// Заодно сверяется длина: пояснение из трёх строк на одном языке и из двух на другом — тоже
// расхождение.
function keyPaths(obj, prefix = "") {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") out.push(...keyPaths(v, path));
    else out.push(`${path}:${typeof v}`);
  }
  return out.sort();
}

test("оба каталога строк несут одни и те же ключи одного типа", () => {
  const a = keyPaths(CATALOGS.ru);
  const b = keyPaths(CATALOGS.en);
  const onlyRu = a.filter((k) => !b.includes(k));
  const onlyEn = b.filter((k) => !a.includes(k));
  assert.deepEqual(onlyRu, [], `есть только в ru: ${onlyRu.join(", ")}`);
  assert.deepEqual(onlyEn, [], `есть только в en: ${onlyEn.join(", ")}`);
  assert.ok(a.length > 0);
});

test("ни одна строка вывода не осталась пустой", () => {
  for (const [lang, cat] of Object.entries(CATALOGS)) {
    for (const path of keyPaths(cat)) {
      const [key, kind] = path.split(":");
      if (kind !== "string") continue;
      const value = key.split(".").reduce((o, k) => o[k], cat);
      assert.ok(value.trim().length > 0, `пустая строка ${lang}.${key}`);
    }
  }
});

test("язык берётся из AQK_LANG, потом из локали, иначе английский", () => {
  assert.equal(pickLang({ AQK_LANG: "ru" }), "ru");
  assert.equal(pickLang({ AQK_LANG: "en_US.UTF-8", LANG: "ru_RU.UTF-8" }), "en");
  assert.equal(pickLang({ LANG: "ru_RU.UTF-8" }), "ru");
  assert.equal(pickLang({ LC_ALL: "ru_RU.UTF-8", LANG: "en_US.UTF-8" }), "ru");
  assert.equal(pickLang({ LANG: "de_DE.UTF-8" }), "en");
  assert.equal(pickLang({}), "en");
});
