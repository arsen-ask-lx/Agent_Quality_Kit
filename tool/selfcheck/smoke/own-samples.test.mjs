// tool/selfcheck/smoke/own-samples.test.mjs — запись каталога не смеет выдавать СВОИ ЖЕ красные
// образцы за находки пользователя.
//
// ЗАЧЕМ. `aqk add` кладёт в чужой проект гейт ВМЕСТЕ с образцами: без них `prove` ничего не
// докажет. Образцы существуют, чтобы быть неправильными. Значит любой сканирующий гейт обязан их
// не замечать — иначе человек ставит защиту и получает вечно красный конвейер на файлах, которые
// положили МЫ. Обход для этого есть давно (`own_samples_filter`), и переносимые рецепты им
// пользуются.
//
// ЧТО СЛОМАЛОСЬ. Обход построчный: он вырезает строки, содержащие путь образца. `ruff` перешёл на
// многострочные блоки — путь уехал в отдельную строку («--> путь:строка:колонка»), а сообщение и
// кусок исходника остались, и вырезать их фильтру нечем. Найдено 2026-09-10 на фикстуре пробы:
// переносимый рецепт на том же проекте молчит, родной краснеет.
//
// ПОЧЕМУ ПРОВЕРКА, А НЕ ТОЛЬКО ПРАВКА. Правка чинит `ruff` сегодня. Формат вывода меняет любой
// инструмент и не предупреждает — без этой проверки та же дыра вернётся молча и с другим именем.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { project, run, aqk } from "./_fixture.mjs";

// Записи с РОДНЫМ рецептом. Дыра была не в ruff: она в том, что общий обход построчный, а вывод
// инструмента — нет. Значит проверять надо не один инструмент, а каждый, который каталог зовёт.
//
// Таблица, а не список из четырёх имён: рецепт добавляют в каталог, и покрытие обязано
// появляться вместе с ним, а не через месяц. Каждая строка — чем наполнить проект, чтобы
// `aqk add` выбрал ИМЕННО этот рецепт, и какой командой её видно.
//
// Инструмента нет на машине — проверка ПРОПУСКАЕТСЯ вслух, а не зеленеет: «нечем проверить
// здесь» и «проверено» разные факты, и весь комплект написан про эту разницу.
const NATIVE = [
  { entry: "todo-without-task", tool: "ruff", files: { "src/app.py": "def add(a, b):\n    return a + b\n" } },
  { entry: "no-print-in-prod", tool: "ruff", files: { "src/app.py": "def add(a, b):\n    return a + b\n" } },
  { entry: "swallowed-error", tool: "ruff", files: { "src/app.py": "def add(a, b):\n    return a + b\n" } },
  { entry: "complexity-limit", tool: "ruff", files: { "src/app.py": "def add(a, b):\n    return a + b\n" } },
  { entry: "dead-code", tool: "vulture", files: { "src/app.py": "def add(a, b):\n    return a + b\n\n\nprint(add(1, 2))\n" } },
  { entry: "duplicate-code", tool: "pylint", files: { "src/app.py": "def add(a, b):\n    return a + b\n" } },
  // javascript/typescript: eslint зовут четыре записи. Проект наполняется .js, чтобы `add`
  // выбрал именно родной рецепт, а не переносимый.
  { entry: "todo-without-task", tool: "eslint", files: { "src/app.js": "export const add = (a, b) => a + b;\n" } },
  { entry: "no-print-in-prod", tool: "eslint", files: { "src/app.js": "export const add = (a, b) => a + b;\n" } },
  { entry: "swallowed-error", tool: "eslint", files: { "src/app.js": "export const add = (a, b) => a + b;\n" } },
  { entry: "complexity-limit", tool: "eslint", files: { "src/app.js": "export const add = (a, b) => a + b;\n" } },
];

const RUFF_ENTRIES = NATIVE.filter((n) => n.tool === "ruff").map((n) => n.entry);

// Наличие инструмента спрашивается в НАСТОЯЩЕЙ среде, а не в песочнице проекта. Песочница
// подменяет HOME, а инструменты, поставленные `pip --user` (vulture, pylint), — это python-
// скрипты, которые ищут свои модули в $HOME/.local/lib. С чужим HOME импорт падает, и
// установленный инструмент объявлялся отсутствующим: проверка молча пропускалась вместо того,
// чтобы что-то проверить. Та же шишка записана в шапке `smoke.sh` про PYTHONUSERBASE.
const have = (cmd) => spawnSync(cmd, ["--version"], { encoding: "utf8", timeout: 30000 }).status === 0;

function declaredCommand(p, name) {
  const man = readFileSync(join(p.dir, ".aqk.yml"), "utf8");
  // Жадно и до КОНЦА СТРОКИ: команда рецепта сама содержит кавычки (`eslint --rule '{"x":1}'`),
  // и нежадный разбор обрывал её на первой внутренней — тест падал на своей же выборке, а
  // винил рецепт.
  const m = man.match(new RegExp(`^\\s*${name}:\\s*"(.*)"\\s*$`, "m"));
  return m ? m[1] : null;
}

for (const name of RUFF_ENTRIES) {
  test(`«${name}»: родной рецепт не краснеет на СВОИХ образцах`, (t) => {
    if (!have("ruff")) return t.skip("ruff не установлен — проверить нечем");
    // Чистый python-файл: находок у пользователя нет по построению, и всё красное может прийти
    // только из образцов, которые положил `add`.
    const p = project(t, { "src/app.py": "def add(a, b):\n    return a + b\n" });
    const init = aqk(p, "init");
    assert.equal(init.code, 0, init.out);
    const add = aqk(p, "add", name);
    assert.equal(add.code, 0, add.out);

    const cmd = declaredCommand(p, name);
    assert.ok(cmd, `в манифесте нет команды для «${name}»`);
    if (!/ruff/.test(cmd)) return t.skip(`выбран не ruff, а «${cmd}» — эта проверка про родной рецепт`);

    const r = run(p, "bash", ["-c", cmd]);
    assert.equal(r.code, 0,
      `гейт покраснел на проекте без единой находки пользователя — значит выдал наши образцы ` +
      `за его код.\nкоманда: ${cmd}\nвывод:\n${r.out}`);
  });
}

// КОНТРОЛЬНАЯ. Заглушить чужой вывод легко — и так же легко заглушить его весь. Проверка выше
// одна означала бы «гейт молчит», а не «гейт молчит О НАШИХ ОБРАЗЦАХ»: инструмент, лишённый
// голоса, проходит её идеально. Поэтому тот же проект, но с НАСТОЯЩЕЙ находкой пользователя.
// Маркер долга собирается ИЗ КУСКОВ намеренно. Написанный целиком, он живёт в исходнике
// комплекта — и наш собственный `todo-without-task` считает его нашим долгом. Поймано этим же
// гейтом через минуту после того, как файл был написан.
const MARKER = ["TO", "DO"].join("");
for (const [name, file, code] of [
  ["todo-without-task", "src/debt.py", `def f():\n    # ${MARKER}: переписать\n    return 1\n`],
  ["no-print-in-prod", "src/loud.py", "def f():\n    print('привет')\n    return 1\n"],
]) {
  test(`«${name}»: на находке ПОЛЬЗОВАТЕЛЯ тот же рецепт краснеет`, (t) => {
    if (!have("ruff")) return t.skip("ruff не установлен — проверить нечем");
    const p = project(t, { "src/app.py": "def add(a, b):\n    return a + b\n", [file]: code });
    assert.equal(aqk(p, "init").code, 0);
    assert.equal(aqk(p, "add", name).code, 0);
    const cmd = declaredCommand(p, name);
    if (!/ruff/.test(cmd)) return t.skip(`выбран не ruff, а «${cmd}»`);
    const r = run(p, "bash", ["-c", cmd]);
    assert.notEqual(r.code, 0,
      `гейт промолчал о настоящей находке — значит его заглушили целиком.\nкоманда: ${cmd}\nвывод:\n${r.out}`);
    assert.ok(r.out.includes(file.split("/").pop()),
      `гейт покраснел, но не назвал файл ${file}. Вывод:\n${r.out}`);
  });
}

// Общая проверка по ТАБЛИЦЕ: любой родной рецепт, чей инструмент здесь есть, обязан молчать на
// проекте, где единственные «нарушения» — образцы, которые положил `add`.
for (const { entry, tool, files } of NATIVE) {
  test(`«${entry}» (${tool}): родной рецепт молчит о наших образцах`, (t) => {
    if (!have(tool)) return t.skip(`${tool} не установлен — проверить нечем, и это НЕ «проверено»`);
    const p = project(t, files);
    assert.equal(aqk(p, "init").code, 0);
    const add = aqk(p, "add", entry);
    if (add.code !== 0) return t.skip(`запись не ставится здесь: ${add.out.trim().split("\n")[0]}`);
    const cmd = declaredCommand(p, entry);
    assert.ok(cmd, `в манифесте нет команды для «${entry}»`);
    if (!cmd.includes(tool)) return t.skip(`выбран не ${tool}, а «${cmd}» — эта проверка про родной рецепт`);
    const r = run(p, "bash", ["-c", cmd]);
    assert.equal(r.code, 0,
      `гейт покраснел на проекте без единой находки пользователя — значит выдал наши образцы ` +
      `за его код.\nкоманда: ${cmd}\nвывод:\n${r.out}`);
  });
}
