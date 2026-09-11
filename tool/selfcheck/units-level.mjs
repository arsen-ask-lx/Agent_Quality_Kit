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
import { commandFor, verdict } from "../lib/prove.mjs";
import { assessLevel, layoutChecks, unknownKeys, KNOWN_KEYS, parseManifest, coversOf, coversUnproven, unparsedLines } from "../lib/manifest.mjs";
import { pickLang, langFromText, langFromDocs } from "../i18n/index.mjs";
import { progress, selectGates } from "../lib/run.mjs";

// --- строка «идёт» во время прогона ---------------------------------------------------
// ЗАЧЕМ. Гейт идёт через spawnSync, и строка про него печаталась только по завершении: минута
// `smoke` — минута пустого экрана. Человек не отличает «работает» от «повисло» и пишет сам.
test("строка «идёт» пишется только в терминал и стирается без следа", () => {
  const out = [];
  const pipe = progress({ tty: false, write: (s) => out.push(s) });
  pipe.show("⋯ smoke [2/10]");
  pipe.clear();
  assert.deepEqual(out, [], "в пайп и в конвейер — ни байта: лог читается глазами и разбирается машиной");

  const term = [];
  const p = progress({ tty: true, write: (s) => term.push(s) });
  p.clear();
  assert.deepEqual(term, [], "стирать нечего — управляющих кодов нет");
  p.show("⋯ smoke [2/10]");
  assert.ok(term.join("").includes("smoke [2/10]"));
  assert.ok(!term.join("").includes("\n"), "без перевода строки: её перепишет итог гейта");
  p.clear();
  assert.equal(term.at(-1), "\r\x1b[K", "итог гейта ложится на чистую строку");
  p.clear();
  assert.equal(term.filter((s) => s === "\r\x1b[K").length, 1, "повторное стирание ничего не пишет");
});

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

// Отзыв с живого проекта 2026-09-11: свод правил и методички на русском, машина на Windows без
// LANG — и весь вывод английский, пока руками не впишешь `lang:`. Язык текста, который проект
// сам о себе написал, — свойство проекта; поэтому он выше локали и ниже манифеста.
test("язык свода проекта сильнее локали и слабее манифеста", () => {
  const ruDoc = "# Правила\n\nПеред коммитом запусти `npm run check` и `make gates`. Схемы живут в " +
    "`packages/contract`, их проверяет сервер.\n\n```sh\nnpm run typecheck && npm run lint\n```\n" +
    "Любое изменение договора проходит через ревью и фиксируется в журнале решений.\n";
  const enDoc = "# Rules\n\nBefore committing run `npm run check`. Schemas live in packages/contract " +
    "and the server validates them. Every contract change goes through review and is logged.\n";
  assert.equal(langFromDocs(ruDoc.repeat(2)), "ru", "русский свод с кодом внутри не узнан");
  assert.equal(langFromDocs(enDoc.repeat(2)), "en");
  assert.equal(langFromDocs("# X\n\n`npm test`\n"), "", "по трём словам язык не решается");
  assert.equal(pickLang({ LANG: "en_US.UTF-8" }, null, "ru"), "ru");
  assert.equal(pickLang({}, null, "ru"), "ru", "Windows без LANG: свод решает");
  assert.equal(pickLang({ LANG: "ru_RU.UTF-8" }, null, "en"), "en");
  assert.equal(pickLang({}, { lang: "en" }, "ru"), "en", "манифест сильнее свода");
  assert.equal(pickLang({ AQK_LANG: "en" }, null, "ru"), "en", "переменная сильнее свода");
  assert.equal(pickLang({ LANG: "ru_RU.UTF-8" }, null, ""), "ru", "свод молчит — решает локаль");
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

test("линтер не распознан — «не умею проверить», а не обвинение", () => {
  const man = parseManifest('gates:\n  lint: "make lint"\ncovers:\n  lint: [no-print-in-prod]\n');
  const r = coversUnproven(man, [NP], {});
  assert.equal(r[0].kind, "unknown");
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

// --- ВЕРДИКТ ДОКАЗАТЕЛЬСТВА: один доказанный гейт не покрывает недоказанный -------------
// ЗАЧЕМ. Прежнее правило было `broken === 0 && proven > 0`. Оно позволяло ОДНОМУ доказанному
// гейту компенсировать сколько угодно недоказанных: проект с пятью объявленными проверками,
// из которых четыре не смогли отработать, получал AQK-2 за счёт пятой. Ступень называется
// «гейты доказаны», а доказан был один.
//
// Различие тонкое и обязательное: «нечем доказывать» бывает ЗАКОННЫМ (нет образцов, нет
// программы на этой машине, стоит рецепт под другой язык) — такое ступень не отнимает.
// А «запускали и не смогло отработать» — это сбой, и он ступень отнимает: иначе таймаут
// арбитра снова становится способом получить зелёное.
test("сбой арбитра отнимает ступень, законная недоказуемость — нет", () => {
  assert.equal(verdict([{ state: "proven" }]).ok, true);
  assert.equal(verdict([]).ok, false, "доказывать нечего — не доказано");
  assert.equal(verdict([{ state: "unprovable", why: "no-samples" }]).ok, false,
    "ни один гейт не доказан");

  // Законная недоказуемость рядом с доказанным гейтом ступень не отнимает.
  assert.equal(verdict([
    { state: "proven" },
    { state: "unprovable", why: "needs-program" },
  ]).ok, true);

  // А вот сбой арбитра — отнимает, сколько бы соседей ни было доказано.
  assert.equal(verdict([
    { state: "proven" },
    { state: "unprovable", why: "infra", reason: "timeout" },
  ]).ok, false, "таймаут арбитра компенсирован соседним гейтом");

  assert.equal(verdict([{ state: "proven" }, { state: "broken" }]).ok, false);
});

// --- группы гейтов и --only / --skip ----------------------------------------------------
// ЗАЧЕМ. Отзыв с живого проекта 2026-09-11: гейт цены меряет план на засеянной базе. Объявишь
// его — он валит прогон без стенда; уберёшь — promise-has-gate справедливо ругается. Пришлось
// выкручиваться через advisory. Прогон бывал только «всё или ничего».
test("выбор гейтов: --skip группой и именем, --only сужает, пропущенные названы", () => {
  const man = parseManifest('gates:\n  lint: "x"\n  unit: "x"\n  cost: "x"\n  e2e: "x"\ngroups:\n  stack: [cost, e2e]\n');
  const names = Object.entries(man.gates);
  const s = selectGates(names, man, { skip: ["stack"] });
  assert.deepEqual(s.run.map(([n]) => n), ["lint", "unit"]);
  assert.deepEqual(s.skipped, ["cost", "e2e"]);
  const o = selectGates(names, man, { only: ["lint", "cost"] });
  assert.deepEqual(o.run.map(([n]) => n), ["lint", "cost"]);
  assert.deepEqual(o.skipped, ["unit", "e2e"]);
});

test("выбор гейтов: неизвестное имя — ошибка, а не тихое «пропустили ничего»", () => {
  const man = parseManifest('gates:\n  lint: "x"\ngroups:\n  stack: [lint]\n');
  const s = selectGates(Object.entries(man.gates), man, { skip: ["stak"] });
  assert.deepEqual(s.unknown, ["stak"]);
  // Группа, в которой назван необъявленный гейт, — тоже названа: иначе группа молча пустеет.
  const man2 = parseManifest('gates:\n  lint: "x"\ngroups:\n  stack: [cots]\n');
  assert.deepEqual(selectGates(Object.entries(man2.gates), man2, { skip: ["stack"] }).unknown, ["cots"]);
});

test("выбор гейтов: без флагов гоняется всё, как раньше", () => {
  const man = parseManifest('gates:\n  a: "x"\n  b: "x"\n');
  const s = selectGates(Object.entries(man.gates), man, {});
  assert.equal(s.run.length, 2);
  assert.deepEqual(s.skipped, []);
});
