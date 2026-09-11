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
import { triggerVerdict, recipeFor, EXT_LANG, whichSync, browserServerAdvice, MARKS, isApiSpec, claudeSeesRules } from "../lib/repo.mjs";
import { startWith } from "../lib/advice.mjs";
import { proposeGates } from "../lib/adopt.mjs";
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

// Признак «здесь есть договор с чужим кодом»: спецификация API. Считается обходом дерева, а не
// списком путей, — файл кладут где угодно (`openapi.yaml`, `docs/api/openapi.json`, `schema.yml`
// рядом с приложением), и фиксированный список промахнулся бы на большинстве проектов.
//
// ПОЧЕМУ ПРИЗНАК ОТДЕЛЬНЫЙ, а не часть has_deps. Запись про арбитра контракта не касается
// библиотеки, консольной программы и монолита без внешнего интерфейса — а таких большинство.
// Показанной не тому записи не верят, и каталог теряет доверие целиком, а не одной строкой.
test("спецификация API опознаётся по имени файла, а не по расположению", () => {
  assert.equal(isApiSpec("openapi.yaml"), true);
  assert.equal(isApiSpec("openapi.json"), true);
  assert.equal(isApiSpec("swagger.yml"), true);
  assert.equal(isApiSpec("asyncapi.yaml"), true);
  assert.equal(isApiSpec("openapi-v2.yaml"), true);
  // Имя без расширения спецификации — не она: договор лежит в разбираемом формате.
  assert.equal(isApiSpec("openapi.md"), false);
  // Соседи по алфавиту, которые не договор: обычные файлы проекта.
  assert.equal(isApiSpec("api.yaml"), false);
  assert.equal(isApiSpec("schema.sql"), false);
  assert.equal(isApiSpec("package.json"), false);
});

// Объяснение обязано быть на обоих языках. Признак без объяснения выключает запись НАВСЕГДА и
// молча — тот же класс, что поймал has_mcp ниже, поэтому сторожится отдельной строкой: в MARKS
// этого признака нет, он считается обходом, и общая проверка его не увидит.
test("у признака спецификации API есть объяснение на обоих языках", () => {
  for (const lang of ["ru", "en"]) {
    assert.ok(CATALOGS[lang].trigger.flags.has_api_spec, `${lang}: нет объяснения has_api_spec`);
  }
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

// ─────────────────────────────────────────────────────────────────────────────
// Чужие проверки, которые у проекта УЖЕ есть. Написано ДО кода 2026-09-10.
//
// ЗАЧЕМ. Поставил комплект в `express` — проект с eslint, mocha и конвейером — и первое, что он
// увидел: двадцать крестов подряд и «держит машина 0». Это неправда с его точки зрения: его
// проверки держат, просто мы считаем только СВОИ записи.
//
// Мы видим, что конвейер ЕСТЬ (`has_ci`), но не читаем, что в нём. Человек должен вручную
// переписать в манифест то, что мы могли прочитать сами. Отсюда и «не понимает, что хорошо»:
// хорошее у него уже есть, а мы о нём молчим.
//
// Предлагаем, а не объявляем: гейт, вписанный без спроса, — это чужое решение в чужом файле.
test("чужие проверки: из package.json берутся test, lint и проверка типов", () => {
  const pkg = JSON.stringify({ scripts: {
    test: "mocha", lint: "eslint .", typecheck: "tsc --noEmit",
    build: "rollup -c", start: "node server.js", prepare: "husky",
  } });
  const got = proposeGates({ "package.json": pkg });
  assert.deepEqual(got.map((g) => g.name).sort(), ["lint", "test", "typecheck"]);
  assert.equal(got.find((g) => g.name === "test").cmd, "npm test");
  assert.equal(got.find((g) => g.name === "lint").cmd, "npm run lint");
});

// `npm test` и `npm run test` — разные написания одного; берём каноничное. А `build` и `start`
// проверками не являются: они собирают и запускают, а не судят.
test("чужие проверки: сборка и запуск проверками не считаются", () => {
  const pkg = JSON.stringify({ scripts: { build: "tsc", start: "node .", dev: "vite" } });
  assert.deepEqual(proposeGates({ "package.json": pkg }), []);
});

// Makefile — вторая по частоте точка входа, и в python-проектах чаще первая.
test("чужие проверки: цели Makefile тоже видны", () => {
  const mk = "install:\n\tpip install -e .\n\ntest:\n\tpytest -q\n\nlint:\n\truff check .\n";
  const got = proposeGates({ Makefile: mk });
  assert.deepEqual(got.map((g) => g.name).sort(), ["lint", "test"]);
  assert.equal(got.find((g) => g.name === "test").cmd, "make test");
});

test("чужие проверки: нечего предложить — пустой список, а не выдумка", () => {
  assert.deepEqual(proposeGates({}), []);
  assert.deepEqual(proposeGates({ "package.json": "{ не json" }), []);
});

// Источник называется: человек обязан видеть, ОТКУДА мы это взяли, иначе предложение
// неотличимо от нашей догадки.
test("чужие проверки: у каждого предложения назван источник", () => {
  const got = proposeGates({ "package.json": JSON.stringify({ scripts: { test: "jest" } }) });
  assert.equal(got[0].source, "package.json");
});

// Python-проекты. Замер 2026-09-11 на восьми живых (requests, click, flask, httpx, black,
// fastapi, pydantic, rich): package.json нет ни у кого, Makefile у трёх — и пятеро из восьми
// слышали «у вас ничего нет». А `.pre-commit-config.yaml` лежит у семи, tox — у пяти (у click и
// flask в pyproject.toml), у httpx — исполняемые scripts/test и scripts/check.
// Куски ниже сняты с этих репозиториев, а не придуманы.
test("чужие проверки: pre-commit предлагается целиком, хуки названы поимённо", () => {
  const cfg = "repos:\n  - repo: https://github.com/pre-commit/pre-commit-hooks\n    hooks:\n" +
    "      - id: check-yaml\n      - id: end-of-file-fixer\n" +
    "  - repo: https://github.com/astral-sh/ruff-pre-commit\n    hooks:\n    - id: ruff-check\n";
  const got = proposeGates({ ".pre-commit-config.yaml": cfg });
  assert.equal(got.length, 1);
  assert.equal(got[0].cmd, "pre-commit run --all-files");
  assert.match(got[0].source, /ruff-check/, "человек видит, ЧТО там стоит, а не только файл");
});

test("чужие проверки: из tox берутся окружения-проверки, а не матрица версий", () => {
  const ini = "[tox]\nenvlist = py{310,311}-{default}\n\n[testenv]\ncommands = pytest\n\n" +
    "[testenv:lint]\ncommands = ruff check .\n\n[testenv:docs]\ncommands = sphinx-build\n\n[testenv:{,ci-}pypy3]\n";
  assert.deepEqual(proposeGates({ "tox.ini": ini }).map((g) => g.cmd), ["tox -e lint"]);
  // click и flask держат tox в pyproject.toml, новым синтаксисом.
  const py = "[tool.tox]\nenv_list = [\"py3\"]\n\n[tool.tox.env.style]\ncommands = []\n\n" +
    "[tool.tox.env.typing]\ncommands = []\n\n[tool.tox.env.docs]\ncommands = []\n";
  const got = proposeGates({ "pyproject.toml": py });
  assert.deepEqual(got.map((g) => g.cmd).sort(), ["tox -e style", "tox -e typing"]);
  assert.equal(got[0].source, "pyproject.toml");
});

test("чужие проверки: исполняемые scripts/test и scripts/check — как у httpx", () => {
  const got = proposeGates({ "scripts/test": "", "scripts/check": "", "scripts/publish": "" });
  assert.deepEqual(got.map((g) => g.cmd).sort(), ["scripts/check", "scripts/test"]);
});

// ─────────────────────────────────────────────────────────────────────────────
// С чего начать: три записи вместо двадцати равнозначных крестов. Написано ДО кода.
//
// ЗАЧЕМ. После установки человек видит двадцать крестов одинаковой формы и не знает, за что
// взяться. Двадцать одинаковых требований — это ноль требований: закрывают первое попавшееся
// или не закрывают ничего.
//
// Порядок НЕ ПО НАШЕМУ ВКУСУ. Два признака, оба — факты, которые у нас уже есть:
//   · запись родилась из настоящего отказа (`proof` ссылается на журнал шишек — тот же
//     признак, которым каталог отделяет условную запись) — она про боль, которая случалась, а не про «хорошую практику»;
//   · её можно закрыть ОДНОЙ ГОТОВОЙ КОМАНДОЙ — значит цена входа минутная.
// Сначала то, что и больно, и дёшево.
test("с чего начать: сперва рождённые из отказа и закрываемые одной командой", () => {
  const list = [
    { slug: "praktika", proof: "хорошая практика", recipes: { any: "bash {gate}/c.sh {dir}" } },
    { slug: "bol-i-deshevo", proof: "incidents/README.md, 2026-09-01", recipes: { native: "gitleaks dir {dir}" } },
    { slug: "bol-no-dorogo", proof: "incidents/README.md, 2026-08-02", recipes: { any: "bash {gate}/c.sh {dir}" } },
    { slug: "deshevo", proof: "методичка", recipes: { python: "ruff check {dir}" } },
  ];
  assert.deepEqual(startWith(list, { langs: new Set(["python"]) }, 3).map((e) => e.slug),
    ["bol-i-deshevo", "deshevo", "bol-no-dorogo"]);
});

test("с чего начать: список короче трёх не ломается", () => {
  assert.deepEqual(startWith([], { langs: new Set() }, 3), []);
  const one = [{ slug: "a", proof: "incidents/README.md", recipes: {} }];
  assert.deepEqual(startWith(one, { langs: new Set() }, 3).map((e) => e.slug), ["a"]);
});

// Порядок обязан быть УСТОЙЧИВЫМ: одинаковый ввод — одинаковый ответ, иначе человек видит
// разный совет на двух прогонах подряд и перестаёт верить обоим.
test("с чего начать: при равенстве признаков порядок стабилен", () => {
  const list = [
    { slug: "b", proof: "incidents/README.md", recipes: {} },
    { slug: "a", proof: "incidents/README.md", recipes: {} },
  ];
  assert.deepEqual(startWith(list, { langs: new Set() }, 2).map((e) => e.slug), ["a", "b"]);
});

// Совет под линтер ПРОЕКТА, а не под язык. Отзыв с живого проекта 2026-09-11: «начни с этих
// трёх» советовал завести eslint проекту на Biome — комплект читал package.json и Makefile, но не
// biome.json. Команда для Biome — одно правило разово (`--only`), и `--error-on-warnings`
// обязателен: правило вне рекомендованных Biome ставит на «предупреждение», и без флага команда
// выходила с нулём, напечатав находку. Проверено на Biome 2.5.12.
test("совет проекту на Biome: команда Biome, а не eslint", async () => {
  const { blindAdvice } = await import("../lib/advice.mjs");
  const entry = {
    slug: "no-print-in-prod", biome_rules: "suspicious/noConsole",
    tool: "https://github.com/eslint/eslint",
    recipes: { javascript: `eslint --no-config-lookup --rule '{"no-console":"error"}' {dir}` },
  };
  const biome = blindAdvice(entry, { langs: new Set(["typescript"]), has_biome: true });
  assert.equal(biome.command, "npx @biomejs/biome lint --error-on-warnings --only=suspicious/noConsole .");
  assert.equal(biome.tool, "https://github.com/biomejs/biome");
  // Без biome.json — прежний совет под язык.
  const plain = blindAdvice(entry, { langs: new Set(["javascript"]), has_biome: false });
  assert.match(plain.command, /^eslint /);
  // У Biome правила нет вовсе (`none`) — прежний совет, а не выдуманная команда Biome.
  const none = blindAdvice({ ...entry, biome_rules: "none" }, { langs: new Set(["javascript"]), has_biome: true });
  assert.match(none.command, /^eslint /);
});

// --- свод виден Claude Code --------------------------------------------------------
// Документация Claude Code (code.claude.com/docs/en/memory, раздел AGENTS.md, сверено
// 2026-09-11): «Claude Code reads CLAUDE.md, not AGENTS.md». Рекомендовано: CLAUDE.md с
// @AGENTS.md либо символическая ссылка. Проект, где Claude Code настроен, а свод лежит только
// в AGENTS.md, пишет правила агенту, который их не читает.
test("свод в AGENTS.md виден Claude Code только через CLAUDE.md с @AGENTS.md", () => {
  const base = { agents: true, claude: null, claudeLink: false, dotClaude: false };
  assert.equal(claudeSeesRules(base), null, "Claude Code не настроен — молчим: Codex и Cursor читают AGENTS.md сами");
  assert.equal(claudeSeesRules({ ...base, dotClaude: true }), "missing");
  assert.equal(claudeSeesRules({ ...base, claude: "# Rules\n\nSee AGENTS.md for everything.\n" }), "noImport",
    "упоминание словами — не подключение: файл Claude Code в контекст не загрузит");
  assert.equal(claudeSeesRules({ ...base, claude: "# CLAUDE.md\n\n@AGENTS.md\n" }), null);
  assert.equal(claudeSeesRules({ ...base, claude: "@../AGENTS.md\n" }), null, "из .claude/CLAUDE.md свод подключают на уровень выше");
  assert.equal(claudeSeesRules({ ...base, claude: "Правила — в `@AGENTS.md`.\n" }), "noImport",
    "в обратных кавычках @ не подключает — так в документации");
  assert.equal(claudeSeesRules({ ...base, claude: "x", claudeLink: true }), null, "ссылка на AGENTS.md — тот же файл");
  assert.equal(claudeSeesRules({ ...base, agents: false, dotClaude: true }), null, "AGENTS.md нет — подключать нечего");
});
