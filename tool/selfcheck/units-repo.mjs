// tool/selfcheck/units-repo.mjs — осмотр репозитория: язык по расширению, триггеры записей,
// выбор рецепта, поиск программы в PATH, совет про браузер у агента.
//
// ОТДЕЛЬНЫМ ФАЙЛОМ, а не в units.mjs: тот снова перерос собственный предел в 500 строк, и поймал
// это наш же file-size-limit. Шов по смыслу: здесь всё, что программа УЗНАЁТ О ЧУЖОМ РЕПОЗИТОРИИ
// и что из этого следует, — а в units.mjs осталось то, что она делает со своими данными.
//
//   node --test tool/selfcheck/units-repo.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { triggerVerdict, recipeFor, EXT_LANG, whichSync, browserServerAdvice, MARKS } from "../lib/repo.mjs";
import { CATALOGS, L } from "../i18n/index.mjs";
import { dirname } from "node:path";

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


// --- поиск программы в PATH ---------------------------------------------------
// ЗАЧЕМ. Раньше наличие программы проверялось через `command -v` в оболочке. На Windows
// оболочка — cmd.exe, где такой команды нет, и ответ был «не установлено» ДЛЯ ЛЮБОЙ
// программы: родной рецепт становился недостижим, гейт молча вставал на слабейший
// переносимый вариант, а прогон показывал зелёное. Нашлось на чужом прогоне, не у нас.
test("программа в PATH находится, несуществующая — нет", () => {
  assert.ok(whichSync("node"), "node обязан находиться: им же запущена эта проверка");
  assert.equal(whichSync("нет-такой-программы-12345"), null);
  assert.equal(whichSync(""), null);
});

test("поиск не зависит от оболочки — работает с пустым окружением", () => {
  // Тот самый случай: оболочки нет или она другая. Ответ обязан быть «не нашли»,
  // а не исключение и не ложное «нашли».
  assert.equal(whichSync("node", { PATH: "" }), null);
  const dir = dirname(process.execPath);
  assert.ok(whichSync(process.platform === "win32" ? "node" : "node", { PATH: dir }));
});

test("команда путём, а не именем, ищется на диске, а не в PATH", () => {
  assert.ok(whichSync(process.execPath));
  assert.equal(whichSync("./нет-такого-файла.sh"), null);
});


// --- совет про браузерный MCP-сервер ------------------------------------------
// Решение владельца 2026-09-08: инструмент, дающий агенту браузер, надо РЕКОМЕНДОВАТЬ.
// Возражение про нейтральность к вендору здесь не работает: MCP — межвендорный протокол,
// и сервер одинаково нужен Cursor, Codex и Claude Code.
//
// Но совет показывается не всем. Проекту без интерфейса браузер не нужен, а совет, показанный
// не тому, стоит доверия всем остальным советам — та же норма, что у записей каталога.
test("совет про браузер даётся проекту с интерфейсом, у которого сервера нет", () => {
  assert.ok(browserServerAdvice({ has_ui: true }, ""));
});

test("проекту без интерфейса совет не даётся", () => {
  assert.equal(browserServerAdvice({ has_ui: false }, ""), null);
});

// Уже поставил — молчим. Совет, повторяемый тому, кто его выполнил, читается как шум,
// и следующий совет он пролистает вместе с этим.
test("сервер уже объявлен — совета нет", () => {
  const cfg = '{"mcpServers":{"browser":{"command":"npx","args":["-y","chrome-devtools-mcp@1.9.0"]}}}';
  assert.equal(browserServerAdvice({ has_ui: true }, cfg), null);
  const pw = '{"mcpServers":{"b":{"command":"npx","args":["@playwright/mcp@0.0.80"]}}}';
  assert.equal(browserServerAdvice({ has_ui: true }, pw), null);
});

// Признак репозитория без объяснения — это запись каталога, ВЫКЛЮЧЕННАЯ НАВСЕГДА. Триггер
// с неизвестным ключом даёт «условие программа не умеет считать», и запись не показывается
// никому и никогда. Поймано на себе 2026-09-08: завёл has_mcp в списке признаков, объяснение
// не завёл, и новая запись стала неприменимой в любом репозитории. Видно это было только в
// выводе doctor на чужой папке — ни один прогон не краснел.
test("у каждого признака репозитория есть объяснение на обоих языках", () => {
  const names = MARKS.map(([n]) => n);
  for (const lang of ["ru", "en"]) {
    const flags = CATALOGS[lang].trigger.flags;
    const missing = names.filter((n) => !flags[n]);
    assert.deepEqual(missing, [], `${lang}: нет объяснения для ${missing.join(", ")}`);
    // Обратной проверки нет намеренно, и это не лень. Часть признаков считается не по наличию
    // файла, а обходом содержимого (has_db, has_tests, has_ui), и в этом списке их нет.
    // Риск несимметричен: объяснение без признака — мёртвая строка, признак без объяснения —
    // запись каталога, выключенная навсегда и молча. Сторожим ту сторону, которая ломает.
  }
});
