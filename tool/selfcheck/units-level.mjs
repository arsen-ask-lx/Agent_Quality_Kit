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
import { assessLevel, layoutChecks, unknownKeys, KNOWN_KEYS, parseManifest, unparsedLines, gateRequires } from "../lib/manifest.mjs";
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

// ЧЕМ ГЕЙТ РАБОТАЕТ — МОЖЕТ СКАЗАТЬ И САМ ПРОЕКТ, НЕ ТОЛЬКО ЗАПИСЬ КАТАЛОГА.
//
// Разбор чужой интеграции 2026-09-16: гейт объявлен как
// `docker run --rm … promtool test rules …`. `vitals` смотрит ПЕРВОЕ СЛОВО, находит `docker` и
// говорит «инструменты на месте». Поле `requires` для такого случая у нас уже есть — но
// читалось оно только из `<samples>/<гейт>/gate.yml`, то есть было доступно нашим записям и
// недоступно гейтам проекта. У проекта с чужими командами `samples` пуст по построению, и
// сказать «этому гейту нужен docker» было нечем.
//
// СНАРУЖИ СОГЛАШЕНИЯ НЕТ — проверено 2026-09-16. У pre-commit ровно эта просьба (issue #2042:
// трактовать `additional_dependencies` как список программ в $PATH и пропускать хук, если
// программы нет) закрыта нерешённой: `system`-хуки окружения не ставят. У lefthook такого поля
// нет вовсе. Поэтому мы не копируем чужую форму, а распространяем СВОЮ, уже существующую, —
// и это сказано вслух, а не выдано за общепринятое.
test("requires в манифесте проекта называет программу гейта", async () => {
  const man = parseManifest('gates:\n  rules: "docker run x"\nrequires:\n  rules: docker\n');
  assert.deepEqual(await gateRequires(man, "", "rules", () => false), ["docker"]);
  assert.equal(await gateRequires(man, "", "rules", () => true), null, "программа на месте — жаловаться не на что");
});

test("requires принимает и список, и перечисление через запятую", async () => {
  const list = parseManifest('gates:\n  g: "x"\nrequires:\n  g: [docker, jq]\n');
  assert.deepEqual(await gateRequires(list, "", "g", () => false), ["docker", "jq"]);
  const csv = parseManifest('gates:\n  g: "x"\nrequires:\n  g: docker, jq\n');
  assert.deepEqual(await gateRequires(csv, "", "g", () => false), ["docker", "jq"]);
});

// Гейт, про который в манифесте ничего не сказано, остаётся как был: молчание — не требование.
test("без requires поведение прежнее", async () => {
  const man = parseManifest('gates:\n  g: "x"\n');
  assert.equal(await gateRequires(man, "", "g", () => false), null);
  assert.equal(await gateRequires(null, "", "g", () => false), null);
});

// Иначе `doctor` напечатает «неизвестное поле» на том, что сам же и читает.
test("requires — известное поле манифеста", () => {
  assert.ok(KNOWN_KEYS.includes("requires"));
  assert.deepEqual(unknownKeys({ requires: { g: "docker" } }), []);
});
