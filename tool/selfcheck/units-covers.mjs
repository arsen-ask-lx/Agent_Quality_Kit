// tool/selfcheck/units-covers.mjs — заявка «эту запись каталога держит наш линтер» и её сверка.
//
// ОТДЕЛЬНЫМ ФАЙЛОМ ВСЛЕД ЗА КОДОМ. Сверка вынесена в `tool/lib/covers.mjs` 2026-09-16, и её
// проверки жили в units-level.mjs, пока тот не дорос до 542 строк при пределе 500 — поймал наш же
// `file-size-limit`. Проверки лежат там же, где лежит проверяемое знание: правишь сверку —
// открываешь один файл проверок, а не ищешь их среди разбора манифеста и ступеней.
//
//   node --test tool/selfcheck/units-covers.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { parseManifest } from "../lib/manifest.mjs";
import { coversOf, coversUnproven, heldCovers } from "../lib/covers.mjs";

// --- covers: запись закрыта другим арбитром -----------------------------------
// Просьба первого чужого пользователя, 2026-09-08, названная им первой: «нельзя сказать, что
// эта запись у нас закрыта другим гейтом. complexity-limit, no-print-in-prod, swallowed-error
// держит biome — одним арбитром, точнее переносимого. doctor каждый прогон печатает
// „применимо, но не поставлено: 5“ — неправду».
//
// Неправда в НАШЕМ выводе — самая дорогая из возможных: весь стандарт стоит на том, что вывод
// не врёт. Поэтому поле есть, но оно не признание на слово: гейт, который «закрывает», обязан
// быть объявлен в gates:. Иначе covers: становится способом объявить защиту, которой нет, —
// то самое, против чего написан комплект.
test("вложенный список в квадратных скобках разбирается как список", () => {
  const man = parseManifest("covers:\n  lint: [no-print-in-prod, swallowed-error]\n");
  assert.deepEqual(man.covers.lint, ["no-print-in-prod", "swallowed-error"]);
});

test("covers отдаёт связь «запись → чем закрыта»", () => {
  const man = parseManifest("gates:\n  lint: \"biome ci .\"\ncovers:\n  lint: [no-print-in-prod, swallowed-error]\n");
  const { covered } = coversOf(man);
  assert.equal(covered.get("no-print-in-prod"), "lint");
  assert.equal(covered.get("swallowed-error"), "lint");
});

// Гейт, которого нет в gates:, не закрывает ничего. Промолчать здесь значит выдать
// несуществующего арбитра за существующего — ровно тот отказ, ради которого всё написано.
test("закрывать может только объявленный гейт", () => {
  const man = parseManifest("gates:\n  lint: \"biome ci .\"\ncovers:\n  biome: [complexity-limit]\n");
  const { covered, unknownGates } = coversOf(man);
  assert.equal(covered.size, 0, "необъявленный гейт не закрывает ничего");
  assert.deepEqual(unknownGates, ["biome"]);
});

test("пустой covers ничего не ломает", () => {
  const { covered, unknownGates } = coversOf(parseManifest("aqk: 1\n"));
  assert.equal(covered.size, 0);
  assert.deepEqual(unknownGates, []);
});

// --- заявка covers сверяется, а не принимается на слово -----------------------
// Поле `covers:` я завёл этим же утром и сам записал в коммит: «снимает запись с долга по
// СЛОВУ человека; проверить, что чужой гейт ловит то же самое, машина не может». К вечеру
// выяснилось, что это не теория. Запуск на настоящем `ruff.toml` из живого проекта: девятнадцать
// групп правил в `extend-select`, и `print()` не ловится — группы `T20` среди них нет.
// То есть заявка «no-print-in-prod держит наш lint» была бы ЛОЖНОЙ, а запись ушла бы из долга.
//
// Проверяется ровно то, что можно: у записи каталога в рецепте стоят коды правил
// (`ruff check --select T20`). Если ни команда закрывающего гейта, ни конфиг линтера этих кодов
// не называют — заявка не подтверждена. Это не «ложь», а «не подтверждено»: правило могло
// прийти из плагина или пресета, и объявлять такое ошибкой значит краснеть на нормальном укладе.
test("заявка подтверждена, когда коды правил есть в команде гейта", () => {
  const man = parseManifest('gates:\n  lint: "ruff check --select T20,BLE ."\ncovers:\n  lint: [no-print-in-prod]\n');
  const catalog = [{ slug: "no-print-in-prod", recipes: { python: "ruff check --select T20 {dir}" } }];
  assert.deepEqual(coversUnproven(man, catalog, ""), []);
});

test("заявка не подтверждена, когда кодов нет нигде", () => {
  const man = parseManifest('gates:\n  lint: "ruff check ."\ncovers:\n  lint: [no-print-in-prod]\n');
  const catalog = [{ slug: "no-print-in-prod", recipes: { python: "ruff check --select T20 {dir}" } }];
  assert.deepEqual(coversUnproven(man, catalog, ""), [{ entry: "no-print-in-prod", gate: "lint", codes: ["T20"], linter: "ruff", kind: "unproven" }]);
});

// Правило может стоять не в команде, а в конфиге линтера — это нормальный уклад, и краснеть
// на нём нельзя. Настоящий пример: extend-select в ruff.toml.
test("коды правил в конфиге линтера тоже подтверждают заявку", () => {
  const man = parseManifest('gates:\n  lint: "ruff check ."\ncovers:\n  lint: [no-print-in-prod]\n');
  const catalog = [{ slug: "no-print-in-prod", recipes: { python: "ruff check --select T20 {dir}" } }];
  assert.deepEqual(coversUnproven(man, catalog, 'extend-select = ["I", "T20", "B"]'), []);
});

// У записи без кодов правил в рецепте сверять нечего — молчим, а не выдумываем вердикт.
test("запись без кодов правил в рецепте не порождает придирки", () => {
  const man = parseManifest('gates:\n  lint: "true"\ncovers:\n  lint: [duplicate-code]\n');
  const catalog = [{ slug: "duplicate-code", recipes: { any: "bash {gate}/check.sh {dir}" } }];
  assert.deepEqual(coversUnproven(man, catalog, ""), []);
});

// --- заявка сверяется правилами ТОГО линтера, которым закрыт гейт --------------------
// Отзыв с живого проекта 2026-09-11 (TypeScript на Biome): заявка «lint держит no-print-in-prod»
// всегда была «не подтверждена» — комплект искал коды ruff (T20, C901, BLE), а у Biome это
// noConsole, noExcessiveCognitiveComplexity, noEmptyBlockStatements, и они стояли. Поле, которое
// должно снимать шум, само его производило и подталкивало ставить второй линтер.
const NP = { slug: "no-print-in-prod", biome_rules: "noConsole",
  recipes: { python: "ruff check --select T20 {dir}", javascript: `eslint --rule '{"no-console":"error"}' {dir}` } };
const TODO = { slug: "todo-without-task", biome_rules: "none", recipes: { python: "ruff check --select FIX,TD {dir}" } };

test("Biome: правило записи стоит в biome.json — заявка подтверждена", () => {
  const man = parseManifest('gates:\n  lint: "npx biome check ."\ncovers:\n  lint: [no-print-in-prod]\n');
  const biome = '{"linter":{"rules":{"suspicious":{"noConsole":"error"}}}}';
  assert.deepEqual(coversUnproven(man, [NP], { biome }), []);
  const miss = coversUnproven(man, [NP], { biome: '{"linter":{"enabled":true}}' });
  assert.equal(miss[0].kind, "unproven");
  assert.deepEqual(miss[0].codes, ["noConsole"], "человеку названо ПРАВИЛО BIOME, а не код ruff");
});

test("линтер гейта узнаётся и через npm-скрипт", () => {
  const man = parseManifest('gates:\n  lint: "npm run lint"\ncovers:\n  lint: [no-print-in-prod]\n');
  const scripts = { lint: "biome check ." };
  const r = coversUnproven(man, [NP], { biome: '"noConsole": "error"', scripts });
  assert.deepEqual(r, []);
});

test("eslint: правило берётся из рецепта записи и ищется в конфиге eslint", () => {
  const man = parseManifest('gates:\n  lint: "eslint ."\ncovers:\n  lint: [no-print-in-prod]\n');
  assert.deepEqual(coversUnproven(man, [NP], { eslint: "rules: { 'no-console': 'error' }" }), []);
  assert.equal(coversUnproven(man, [NP], { eslint: "rules: {}" })[0].kind, "unproven");
});

test("у линтера нет такого правила вовсе — заявка заведомо неверна, а не «не подтверждена»", () => {
  const man = parseManifest('gates:\n  lint: "biome check ."\ncovers:\n  lint: [todo-without-task]\n');
  const r = coversUnproven(man, [TODO], { biome: "{}" });
  assert.equal(r[0].kind, "impossible");
});

// --- ПРАВИЛО, УПОМЯНУТОЕ ТОЛЬКО В СЕКЦИИ ВЫКЛЮЧЕНИЯ, ЗАЯВКУ НЕ ПОДТВЕРЖДАЕТ -------------
//
// Замер 2026-09-16 по десяти чужим репозиториям с линтерами. Сверка засчитала четыре закрытия,
// и правдой оказалось одно:
//   fastapi   complexity-limit   C901 стоит в `ignore = [...]` — правило ВЫКЛЮЧЕНО;
//   vite      swallowed-error    `'no-empty': ['warn', { allowEmptyCatch: true }]`;
//   vite      no-print-in-prod   `'no-console'` включено в одном блоке и выключено в другом;
//   pydantic  no-print-in-prod   `T20` в `select` — единственное настоящее.
// Код правила искался ПОДСТРОКОЙ во всём тексте, и `ignore = ["C901"]` содержит `C901` ровно
// так же, как `select = ["C901"]`. Молчание сверки означает «подтверждено» — то есть человек
// пишет `covers: lint: [complexity-limit]`, а AQK соглашается с тем, что правило держит
// сложность, хотя оно явно выключено. Поле, снимающее неправду из вывода, её производило.
//
// ЧИНИТСЯ ТО, ЧТО ОПОЗНАЁТСЯ КОНСТРУКЦИЕЙ: код внутри массива `ignore`/`extend-ignore` у ruff;
// значение `off` или `0` у eslint и Biome. Опции правила (`allowEmptyCatch: true`) — это уже
// понимание смысла, и сюда не входят; граница названа в коде.
const CX = { slug: "complexity-limit", biome_rules: "complexity/noExcessiveCognitiveComplexity",
  recipes: { python: "ruff check --select C901,PLR0912,PLR0915 {dir}",
    typescript: `eslint --rule '{"complexity":["error",10],"max-depth":["error",4]}' {dir}` } };

test("ruff: код только в ignore — заявка НЕ подтверждена, а названа выключенной", () => {
  const man = parseManifest('gates:\n  lint: "ruff check ."\ncovers:\n  lint: [complexity-limit]\n');
  // Дословно уклад fastapi: широкий select и узкое исключение.
  const ruff = 'select = [\n    "E",\n    "C",\n]\nignore = [\n    "E501",\n    "C901",  # too complex\n]\n';
  const r = coversUnproven(man, [CX], { ruff });
  assert.equal(r.length, 1, "правило выключено, а сверка промолчала — то есть подтвердила");
  assert.equal(r[0].kind, "disabled");
  assert.deepEqual(r[0].codes, ["C901"], "названо, какой именно код стоит в выключении");
});

test("ruff: код в select — подтверждено, как и было", () => {
  const man = parseManifest('gates:\n  lint: "ruff check ."\ncovers:\n  lint: [no-print-in-prod]\n');
  const ruff = "select = [\n    'E',\n    'T20',    # flake8-print\n]\nignore = ['D105', 'E501']\n";
  assert.deepEqual(coversUnproven(man, [NP], { ruff }), []);
});

// per-file-ignores — исключение для отдельных файлов, а не выключение правила. У pydantic
// `"release/*.py" = ["T201"]` при включённом `T20`: заявка честная, обвинять нельзя.
test("ruff: per-file-ignores не выключает правило целиком", () => {
  const man = parseManifest('gates:\n  lint: "ruff check ."\ncovers:\n  lint: [no-print-in-prod]\n');
  const ruff = "select = ['T20']\n[tool.ruff.lint.per-file-ignores]\n\"release/*.py\" = [\"T20\"]\n";
  assert.deepEqual(coversUnproven(man, [NP], { ruff }), []);
});

test("eslint: правило только со значением off — выключено", () => {
  const man = parseManifest('gates:\n  lint: "eslint ."\ncovers:\n  lint: [no-print-in-prod]\n');
  const r = coversUnproven(man, [NP], { eslint: "rules: { 'no-console': 'off' }" });
  assert.equal(r[0]?.kind, "disabled", "no-console: off прочитано как подтверждение");
});

// Плоский конфиг законно выключает правило для части файлов — скриптов, тестов. Уклад vite:
// `'no-console': ['error']` в одном блоке и `'off'` в другом. Обвинять здесь значит краснеть на
// нормальном укладе.
test("eslint: включено в одном блоке и выключено в другом — подтверждено", () => {
  const man = parseManifest('gates:\n  lint: "eslint ."\ncovers:\n  lint: [no-print-in-prod]\n');
  const eslint = "{ rules: { 'no-console': ['error'] } },\n{ files: ['scripts/**'], rules: { 'no-console': 'off' } }";
  assert.deepEqual(coversUnproven(man, [NP], { eslint }), []);
});

test("Biome: правило со значением off — выключено", () => {
  const man = parseManifest('gates:\n  lint: "biome check ."\ncovers:\n  lint: [no-print-in-prod]\n');
  const r = coversUnproven(man, [NP], { biome: '{"linter":{"rules":{"suspicious":{"noConsole":"off"}}}}' });
  assert.equal(r[0]?.kind, "disabled");
});

// СЧЁТ И ВЕРДИКТ НЕ ПРОТИВОРЕЧАТ ДРУГ ДРУГУ. Выключенное правило печаталось «заявка неверна»,
// а запись при этом оставалась в корзине «закрыто другим арбитром» — одной строкой выше итог
// снимал её с долга, строкой ниже вывод называл это неправдой. Два утверждения о одной записи
// рядом, и человек верит тому, что короче, — то есть счёту.
//
// Вычитаются ТОЛЬКО однозначные случаи: правило выключено; правила у линтера нет вовсе.
// «Не подтверждено» остаётся закрытым, как и было договорено: правило могло прийти из пресета
// или плагина, и снимать запись с «закрыто» по такому поводу значит краснеть на нормальном укладе.
test("выключенное и невозможное не держат запись, неподтверждённое — держит", () => {
  const man = parseManifest(
    'gates:\n  lint: "ruff check ."\n  bio: "biome check ."\n' +
    'covers:\n  lint: [complexity-limit, no-print-in-prod]\n  bio: [todo-without-task]\n');
  const configs = { ruff: 'ignore = ["C901"]\n', biome: "{}" };
  const held = heldCovers(man, [CX, NP, TODO], configs);
  assert.equal(held.has("complexity-limit"), false, "выключенное правило всё ещё считается закрывающим");
  assert.equal(held.has("todo-without-task"), false, "правило, которого у линтера нет, всё ещё закрывает запись");
  assert.equal(held.get("no-print-in-prod"), "lint", "неподтверждённое сняли с «закрыто» — это обвинение нормального уклада");
});

test("линтер не распознан — «не умею проверить», а не обвинение", () => {
  const man = parseManifest('gates:\n  lint: "make lint"\ncovers:\n  lint: [no-print-in-prod]\n');
  const r = coversUnproven(man, [NP], {});
  assert.equal(r[0].kind, "unknown");
});

