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
import { join } from "node:path";
import { project, run, aqk } from "./_fixture.mjs";

// Записи с родным рецептом на ruff. Проект наполняется python-кодом, чтобы `aqk add` выбрал
// именно его: смысл проверки — в РОДНОМ рецепте, переносимый эту дыру никогда не имел.
const RUFF_ENTRIES = ["todo-without-task", "no-print-in-prod", "swallowed-error", "complexity-limit"];

const have = (cmd) => run({ dir: process.cwd(), home: process.cwd() }, cmd, ["--version"]).code === 0;

function declaredCommand(p, name) {
  const man = readFileSync(join(p.dir, ".aqk.yml"), "utf8");
  const m = man.match(new RegExp(`^\\s*${name}:\\s*"([^"]+)"`, "m"));
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
