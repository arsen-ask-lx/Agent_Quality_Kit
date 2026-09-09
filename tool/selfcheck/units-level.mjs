// tool/selfcheck/units-level.mjs — проверки уровня и доказательства гейтов.
//
// ОТДЕЛЬНЫМ ФАЙЛОМ, а не в units.mjs: тот перерос собственный предел в 500 строк, и поймал
// это наш же гейт `file-size-limit` на прогоне. Шов по смыслу: здесь всё, что программа
// вычитывает ИЗ МАНИФЕСТА и объявляет о проекте, — ступень, доказательство гейтов и раскладка
// (где правила, методички, точка входа). Общее у них одно и важное: ответ обязан приходить из
// манифеста, а не из умолчаний, совпадающих с нашими собственными значениями.
//
//   node --test tool/selfcheck/units-level.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { commandFor } from "../lib/prove.mjs";
import { assessLevel, layoutChecks, unknownKeys, KNOWN_KEYS, parseManifest, coversOf, coversUnproven, unparsedLines } from "../lib/manifest.mjs";
import { pickLang, langFromText } from "../i18n/index.mjs";

// --- доказательство гейтов ------------------------------------------------------------
// ЗАЧЕМ. Ступень AQK-2 называлась «гейты доказаны» и проверяла существование двух папок.
// Проект с тремя гейтами `true` проходил порог AQK-3 — проверено прогоном на пустой папке.
test("обёртка храповика снимается перед подстановкой каталога", () => {
  // Иначе доказательство гоняет гейт вместе с реестром долга, и реестр перезаписывается
  // находками из ОБРАЗЦА. На живом проекте это стёрло бы долг целиком.
  const cmd = "bash ratchets/_ratchet.sh ratchets/x.txt bash gates/x/check.sh .";
  assert.equal(commandFor(cmd, "gates/x/red"), "bash gates/x/check.sh gates/x/red");
});

test("каталог подставляется вместо последнего слова команды", () => {
  assert.equal(commandFor("bash gates/x/check.sh .", "gates/x/green"), "bash gates/x/check.sh gates/x/green");
  assert.equal(commandFor("ruff check --select T20 .", "gates/x/red"), "ruff check --select T20 gates/x/red");
});

test("ступень выше первой не берётся без доказательства", async () => {
  const man = {
    aqk: "0.6.0", entry: [], rules: ".", samples: ".", ratchets: ".", lessons: ".",
    gates: { lint: "true" },
  };
  const withoutProof = await assessLevel(man, null);
  const withFailedProof = await assessLevel(man, { ok: false });
  const withProof = await assessLevel(man, { ok: true });
  // Без доказательства ступень не выполнена, но помечена «не проверяли» — это разные состояния.
  assert.equal(withoutProof.steps[2].ok, false);
  assert.equal(withoutProof.steps[2].needsProof, true);
  assert.equal(withFailedProof.steps[2].ok, false);
  assert.equal(withFailedProof.steps[2].needsProof, false);
  assert.equal(withProof.steps[2].ok, true);
});

test("обёртка родного инструмента едет вместе с каталогом образца", () => {
  // `_native.sh <каталог> <команда…>` прячет пути gates/*/red|green. Оставленный «.» спрятал бы
  // ровно то, что образец обязан показать, — красный прошёл бы зелёным.
  const cmd = "bash gates/_native.sh . ruff check --select T20 .";
  assert.equal(
    commandFor(cmd, "gates/x/red"),
    "bash gates/_native.sh gates/x/red ruff check --select T20 gates/x/red"
  );
});

test("обе обёртки снимаются вместе", () => {
  const cmd = "bash ratchets/_ratchet.sh ratchets/x.txt bash gates/_native.sh . ruff check .";
  assert.equal(
    commandFor(cmd, "gates/x/green"),
    "bash gates/_native.sh gates/x/green ruff check gates/x/green"
  );
});

// Отзыв второго пользователя, 2026-09-08: на Windows `prove` объявил два ИСПРАВНЫХ гейта
// сломанными. Путь к образцу собирался `path.join`, то есть `gates\x\red`, и уезжал в строку
// команды — а её исполняет `sh`, который обратный слэш съедает как экранирование: остаётся
// `gatesxred`. Каталога нет → `find` молчит → код 0 → «промолчал на КРАСНОМ образце».
// Проверка идёт здесь, а не в самом сборщике пути: `commandFor` — единственная дверь, через
// которую каталог попадает в оболочку, и закрывать её надо там, кто бы путь ни собрал.
test("каталог образца уходит в оболочку с прямыми слэшами", () => {
  assert.equal(
    commandFor("bash gates/x/check.sh .", "gates\\x\\red"),
    "bash gates/x/check.sh gates/x/red",
  );
});

// Тот же путь едет ВТОРЫМ адресом — первым аргументом фильтра образцов. Пропустить его значит
// починить половину: фильтр не узнает образец и спрячет ровно то, что образец обязан показать.
test("обёртка родного инструмента тоже получает прямые слэши", () => {
  assert.equal(
    commandFor("bash gates/_native.sh . npx knip --directory .", "gates\\x\\red"),
    "bash gates/_native.sh gates/x/red npx knip --directory gates/x/red",
  );
});

// --- где у проекта лежат правила и методички ----------------------------------
// Отзыв второго пользователя, 2026-09-08: `doctor` рисовал два красных креста за сделанное.
// У проекта `rules: .temper/rules`, правила на месте, гейт entry-links-exist их видит, уровень
// AQK-1 считается ПО МАНИФЕСТУ — а список в шапке проверял литеральные `.aqk/rules` и
// `.aqk/docs` и советовал сделать сделанное. Уровень и вывод расходились в разные стороны:
// хуже неверного вывода только вывод, который расходится с собственным вердиктом.
test("каталог правил берётся из манифеста, а не из умолчания", () => {
  const paths = layoutChecks({ rules: ".temper/rules" }, false).map(([p]) => p);
  assert.ok(paths.includes(".temper/rules"), "путь из манифеста обязан попасть в список");
  assert.ok(!paths.includes(".aqk/rules"), "умолчание обязано уступить манифесту");
});

// Поля `docs:` не было вовсе: перенести методички было НЕКУДА, и проект, разложивший их иначе,
// получал крест без единого способа его снять. Умолчание остаётся для тех, кто поля не завёл.
test("каталог методичек тоже берётся из манифеста", () => {
  const paths = layoutChecks({ docs: ".temper/docs" }, false).map(([p]) => p);
  assert.ok(paths.includes(".temper/docs"));
  assert.ok(!paths.includes(".aqk/docs"));
});

test("без манифеста остаются умолчания", () => {
  const paths = layoutChecks(null, false).map(([p]) => p);
  assert.ok(paths.includes(".aqk/rules") && paths.includes(".aqk/docs"));
});

// В самом комплекте лежат оригиналы, а не разложенная копия: копия завтра разошлась бы с ними.
test("внутри комплекта проверяются его собственные каталоги", () => {
  const paths = layoutChecks({ rules: "kit/rules" }, true).map(([p]) => p);
  assert.ok(paths.includes("kit/rules") && paths.includes("kit/docs"));
});

// Поле, которое программа читает, обязано быть в списке известных: иначе манифест с ним
// получает предупреждение «неизвестное поле» за то, что работает.
test("docs — известное поле манифеста", () => {
  assert.ok(KNOWN_KEYS.includes("docs"));
  assert.deepEqual(unknownKeys({ docs: ".aqk/docs" }), []);
});

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

test("covers — известное поле манифеста", () => {
  assert.ok(KNOWN_KEYS.includes("covers"));
  assert.deepEqual(unknownKeys({ covers: {} }), []);
});

// --- язык вывода: настройка ПРОЕКТА, а не машины ------------------------------
// Просьба первого чужого пользователя: «язык берётся из LC_ALL/LANG, а на Windows их просто
// нет: русский проект получает английский вывод. AQK_LANG=ru чинит, но у следующего человека
// будет своё. Место этому в .aqk.yml». Он прав: язык репозитория — свойство репозитория,
// а локаль — свойство машины, на которой его сегодня открыли.
//
// Порядок намеренный: переменная окружения ВЫШЕ манифеста. Человек, набравший AQK_LANG=en
// руками, хочет английский именно сейчас — и спорить с ним манифестом значит отнять последнее
// средство. Манифест выше локали: он про проект, локаль про машину.
test("манифест задаёт язык, когда переменной окружения нет", () => {
  assert.equal(pickLang({ LANG: "en_US.UTF-8" }, { lang: "ru" }), "ru");
});

test("переменная окружения сильнее манифеста", () => {
  assert.equal(pickLang({ AQK_LANG: "en" }, { lang: "ru" }), "en");
});

test("без манифеста всё как раньше — локаль, потом английский", () => {
  assert.equal(pickLang({ LANG: "ru_RU.UTF-8" }, null), "ru");
  assert.equal(pickLang({}, null), "en");
});

test("мусор в поле lang не молчит, а просто не действует", () => {
  assert.equal(pickLang({}, { lang: "клингонский" }), "en");
});

// Сокращённый разбор языка в i18n/index.mjs существует потому, что каталог строк нужен раньше,
// чем кто-либо успеет прочитать манифест целиком. Два разбора одного файла — то же, что два
// свода правил: через месяц они расходятся, и непонятно, какой настоящий. Сверяем ответы.
test("сокращённый разбор языка не расходится с настоящим", () => {
  for (const text of [
    'aqk: 1\nlang: ru\ngates:\n  lint: "true"\n',
    "aqk: 1\nlang: 'en'\n",
    'aqk: 1\nlang: "ru"   # комментарий\n',
    "aqk: 1\ngates:\n  lang: ru\n",     // вложенный ключ — не язык проекта
    "aqk: 1\n",
  ]) {
    assert.equal(langFromText(text), String(parseManifest(text).lang || ""), text);
  }
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
  assert.deepEqual(coversUnproven(man, catalog, ""), [{ entry: "no-print-in-prod", gate: "lint", codes: ["T20"] }]);
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

// --- строка манифеста, которую разбор не понял, не исчезает молча ---------------
// Найдено 2026-09-09 случайно: подсаживал падающий гейт с именем «плохой», чтобы посмотреть
// на строку присутствия, — и прогон вышел с НУЛЁМ. Гейт не упал: его вообще не было. Разбор
// принимает имена только латиницей, а строку, которая под это не подошла, ВЫБРАСЫВАЛ без слова.
//
// Это наш класс в чистом виде: человек объявил проверку, видит её в файле, а она не
// существует. Хуже опечатки в имени поля — ту мы называем с 2026-09-06, а эту не называли.
// Чинится не расширением алфавита, а голосом: любая непонятая строка обязана быть названа.
test("непонятая строка манифеста называется с номером", () => {
  const bad = unparsedLines('aqk: 1\ngates:\n  ok: "true"\n  плохой: "false"\n');
  assert.equal(bad.length, 1);
  assert.equal(bad[0].line, 4);
  assert.match(bad[0].text, /плохой/);
});

test("правильный манифест не порождает жалоб", () => {
  assert.deepEqual(unparsedLines('aqk: 1\nentry:\n  - AGENTS.md\ngates:\n  ok: "true"\n'), []);
});

// Комментарии и пустые строки — не находка: они и не должны разбираться.
test("комментарии и пустые строки не считаются потерянными", () => {
  assert.deepEqual(unparsedLines("# заметка\n\naqk: 1\n   # ещё\n"), []);
});
