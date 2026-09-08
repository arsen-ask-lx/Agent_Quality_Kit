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
import { parseManifest, manifestWithGate, unknownKeys, entryLifecycle, advisorySet, KNOWN_KEYS } from "../lib/manifest.mjs";
import { triggerVerdict, recipeFor, stems, overlap, EXT_LANG, whichSync } from "../lib/repo.mjs";
import { scopeOutput, splitAdvice } from "../lib/scope.mjs";
import { assessBaseline, ITEMS, BASELINE_TOTAL } from "../lib/baseline.mjs";
import { CATALOGS, pickLang, L } from "../i18n/index.mjs";
import { badgeMarkdown, BADGE_RE, placesToCheck } from "../commands/badge.mjs";
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

// --- значок уровня ------------------------------------------------------------
// ЗАЧЕМ. Значок печатает одна функция, а читает его обратно другое выражение — в том же
// файле, но независимо. Разойдись они, и `badge --check` перестал бы узнавать собственный
// значок: конвейер молча зеленел бы на любом README. Тишина, неотличимая от успеха.
test("значок читается тем же разбором, каким печатается", () => {
  for (const level of [0, 1, 2, 3]) {
    const found = BADGE_RE.exec(badgeMarkdown(level));
    assert.ok(found, `значок AQK-${level} не разобрался`);
    assert.equal(Number(found[1]), level);
  }
});

test("значок ищется в точке входа и в README, без повторов", () => {
  const places = placesToCheck({ entry: ["AGENTS.md", "README.md"] });
  assert.ok(places.includes("AGENTS.md"));
  assert.ok(places.includes("README.md"));
  assert.equal(places.filter((p) => p === "README.md").length, 1);
  assert.ok(placesToCheck({}).includes("README.md"), "без entry README всё равно проверяется");
});

// ЗАЧЕМ. Опечатка в имени поля молча означала «поля нет»: `gate:` вместо `gates:` давало
// вердикт «гейтов не объявлено», а не «в манифесте опечатка». Тишина неотличима от успеха —
// тот самый дефект, ради которого весь стандарт существует, только внутри нас самих.
test("опечатка в поле манифеста называется, а не молчит", () => {
  assert.deepEqual(unknownKeys(parseManifest("aqk: 1\ngate:\n  smoke: \"bash x.sh\"\n")), ["gate"]);
  assert.deepEqual(unknownKeys(parseManifest("aqk: 1\nrules: kit/rules\nlessons: incidents\n")), []);
  // Пустой и отсутствующий манифест — не повод ругаться на поля.
  assert.deepEqual(unknownKeys(null), []);
  assert.deepEqual(unknownKeys({}), []);
});

// ЗАЧЕМ. Разбор резал строку по «#» безусловно, в том числе внутри кавычек. Команда с решёткой
// — `--format "...,c#,..."`, `grep '#!'`, любой цвет `#fff` — молча обрезалась, и гейт запускал
// НЕ ТУ команду, которая объявлена. Объявленное и исполняемое разошлись бы беззвучно: ровно
// тот класс, ради которого стандарт существует. Найдено при правке рецепта duplicate-code.
test("решётка внутри кавычек не считается комментарием", () => {
  const m = parseManifest('gates:\n  dup: "npx jscpd --format \"java,c#,php\" ."\n');
  assert.equal(m.gates.dup, 'npx jscpd --format "java,c#,php" .');
  // Настоящий комментарий после команды по-прежнему срезается.
  const c = parseManifest('gates:\n  x: "bash a.sh"  # пояснение\n');
  assert.equal(c.gates.x, "bash a.sh");
  // И комментарий на отдельной строке.
  assert.deepEqual(Object.keys(parseManifest("# только комментарий\naqk: 1\n")), ["aqk"]);
});

// ЗАЧЕМ. Пункты baseline проверяются НАЛИЧИЕМ признака, и признак обязан быть семейством, а не
// одним именем: список, знающий только про npm, объявил бы половину мира несоответствующей.
// Проверяем именно нейтральность — что пункт засчитывается по маркеру любой экосистемы.
test("baseline: признак засчитывается по любой экосистеме", () => {
  const by = (files) => Object.fromEntries(assessBaseline({ files }).map((r) => [r.key, r]));
  for (const lock of ["package-lock.json", "poetry.lock", "go.sum", "Cargo.lock", "Gemfile.lock", "composer.lock", "mix.lock"]) {
    assert.equal(by([lock]).lockfile.ok, true, lock);
    assert.deepEqual(by([lock]).lockfile.by, { kind: "file", value: lock.toLowerCase() });
  }
  for (const lint of [".eslintrc.json", "ruff.toml", ".golangci.yml", "clippy.toml", ".rubocop.yml", "phpstan.neon", ".swiftlint.yml"]) {
    assert.equal(by([lint]).linter.ok, true, lint);
  }
  // Пустой репозиторий: ни одного признака, и ни одной ложной галочки.
  assert.equal(assessBaseline({}).every((r) => r.ok === false), true);
});

test("baseline: гейт, факт и поле манифеста засчитываются наравне с файлом", () => {
  const one = (arg) => Object.fromEntries(assessBaseline(arg).map((r) => [r.key, r]));
  assert.equal(one({ gateKeys: ["secrets-not-in-code"] }).secretScan.ok, true);
  assert.equal(one({ facts: { has_ci: true } }).pipeline.ok, true);
  assert.equal(one({ manifest: { entry: ["AGENTS.md"] } }).machineReadable.ok, true);
  assert.equal(one({ manifest: { entry: [] } }).machineReadable.ok, false);
  assert.equal(one({ depsText: '"@sentry/node": "^7"' }).errorTracker.ok, true);
  assert.equal(one({ depsText: "sentry-sdk==2.0" }).errorTracker.ok, true);
});

// Число пунктов в методичке — не выдумка кода: если методичка вырастет, а число останется,
// отчёт начнёт врать о том, сколько осталось человеку.
test("baseline: заявленное число пунктов совпадает с методичкой", async () => {
  const { readFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const doc = await readFile(fileURLToPath(new URL("../../kit/docs/ai/project-baseline.md", import.meta.url)), "utf8");
  const nums = [...doc.matchAll(/^(\d+)\. \*\*/gm)].map((m) => Number(m[1]));
  assert.equal(Math.max(...nums), BASELINE_TOTAL);
  assert.equal(ITEMS.every((i) => i.n <= BASELINE_TOTAL), true);
});

// ЗАЧЕМ. Запись про внешний вид, показанная бэкенду или утилите командной строки, — это совет
// не по адресу; таким записям перестают верить, и вместе с ними всему каталогу. Признак
// интерфейса отличает проект со стилями от проекта на тех же языках без них.
test("триггер по интерфейсу отделяет фронтенд от бэкенда на том же языке", () => {
  const rec = { trigger: { has_ui: true } };
  const base = { langs: new Set(["typescript"]), files: 100, gateKeys: [] };
  assert.equal(triggerVerdict(rec, { ...base, has_ui: true }).applies, true);
  assert.equal(triggerVerdict(rec, { ...base, has_ui: false }).applies, false);
  // Причина сокрытия называется, а не молчит: иначе «не показано» неотличимо от «нечего показать».
  assert.equal(typeof triggerVerdict(rec, { ...base, has_ui: false }).why, "string");
});

// --- зрелость записи ---------------------------------------------------------
// ЗАЧЕМ. У всех трёх соседей поле зрелости есть, и у всех троих его ЗАПОЛНЯЕТ АВТОР: `lifecycle`
// у зондов Scorecard, `future`/`obsolete` у критериев значка OpenSSF. Поле, которое объявляет
// автор, означает доверие к автору, а не факт, — ровно то, против чего построен весь стандарт.
// Поэтому зрелость здесь ВЫЧИСЛЯЕТСЯ из доказательства, а объявить её нельзя.
test("зрелость записи считается по доказательству, а не по объявлению", () => {
  const proven = entryLifecycle({ proof: "incidents/README.md, 2026-08-27 «печать в проде»" });
  assert.equal(proven.state, "stable");
  assert.equal(proven.problem, null);

  const claimed = entryLifecycle({ proof: "это общепринятая хорошая практика" });
  assert.equal(claimed.state, "experimental");
  assert.equal(claimed.problem, null);
  // Причина обязательна: «запись условная» без объяснения неотличимо от придирки.
  assert.equal(typeof claimed.why, "string");
});

test("объявить себя зрелым нельзя — это самооценка", () => {
  for (const claim of ["stable", "experimental"]) {
    const r = entryLifecycle({ lifecycle: claim, proof: "incidents/README.md, 2026-01-01" });
    assert.notEqual(r.problem, null);
    // Вердикт всё равно считается сам: объявление не влияет ни на что, кроме отказа.
    assert.equal(r.state, "stable");
  }
  assert.notEqual(entryLifecycle({ lifecycle: "beta", proof: "incidents/x" }).problem, null);
});

// Единственное состояние, которое ОБЪЯВЛЯЕТСЯ: из фактов записи «её больше не ставят» не
// выводится никак. Цена объявления — обязательная замена: запись, выведенная в никуда,
// оставляет человека без ответа на вопрос «а что теперь».
test("выведенная запись обязана назвать замену", () => {
  const noReplacement = entryLifecycle({ lifecycle: "deprecated", proof: "incidents/x" });
  assert.equal(noReplacement.state, "deprecated");
  assert.notEqual(noReplacement.problem, null);

  const ok = entryLifecycle({ lifecycle: "deprecated", superseded_by: "no-print-in-prod", proof: "incidents/x" });
  assert.equal(ok.state, "deprecated");
  assert.equal(ok.supersededBy, "no-print-in-prod");
  assert.equal(ok.problem, null);
});


// --- сужение вывода до дифа --------------------------------------------------
// ЗАЧЕМ. Первый прогон на живом проекте даёт тысячи находок из кода, который писали годами.
// Человек видит стену красного и выключает инструмент целиком — это причина номер один, по
// которой такие проверки снимают. Три независимых проекта из нашего разбора умеют показывать
// только внесённое дифом (reviewdog, ratchets `--since`, четыре режима шума у react-doctor).
test("сужение по дифу: находка вне диапазона отбрасывается, внутри — остаётся", () => {
  const files = new Set(["src/new.py"]);
  const r = scopeOutput(["src/new.py:3: печать", "src/old.py:9: печать"], files);
  assert.deepEqual(r.kept, ["src/new.py:3: печать"]);
  assert.equal(r.findings, 1);
});

test("сужение по дифу: «./путь» и «путь» — один и тот же файл", () => {
  const r = scopeOutput(["./src/new.py:3: печать", "src\\new.py:4: печать"], new Set(["src/new.py"]));
  assert.equal(r.findings, 2);
});

// Тот же урок, что стоил починки в _native.sh: родные инструменты печатают путь ВНУТРИ
// escape-последовательности, и сравнение по границе пути его не видит. Тогда «вывод
// сократился с 5597 до 5505 строк» выглядело как работающая правка.
test("сужение по дифу: цвет снимается до сравнения путей", () => {
  const esc = String.fromCharCode(27);
  const line = esc + "[32m" + "src/new.py" + esc + "[0m" + ":3: печать";
  assert.equal(scopeOutput([line], new Set(["src/new.py"])).findings, 1);
});

test("сужение по дифу: строка без пути остаётся, но находкой не считается", () => {
  const r = scopeOutput(["Итого: 4 нарушения", "src/old.py:1: печать"], new Set(["src/new.py"]));
  assert.equal(r.findings, 0);
  assert.equal(r.kept.includes("Итого: 4 нарушения"), true);
});

// САМОЕ ВАЖНОЕ ЗДЕСЬ. Гейт, который печатает вердикт без путей (проверка коммита, проверка
// конфига конвейера), сузить дифом нельзя. Молча признать его успешным — это ровно та тишина,
// против которой построен весь стандарт, только теперь внутри нашего же флага.
test("сужение по дифу: гейт без путей в выводе не сужается и остаётся красным", () => {
  const r = scopeOutput(["коммит не несёт раздела «Сделано:»"], new Set(["src/new.py"]));
  assert.equal(r.scopable, false);
  assert.equal(scopeOutput(["src/old.py:1: печать"], new Set(["src/new.py"])).scopable, true);
});


// --- совет по починке не теряется в обрезке ----------------------------------
// ЗАЧЕМ. Все девятнадцать записей каталога печатают строку «почини: …» последней. `doctor --run`
// показывает три первые строки вывода и обрезает остальное — то есть ровно ту строку, ради
// которой человек и смотрит на красное, он не видит никогда. Находка без действия — это повод
// закрыть окно, а не починить.
test("совет по починке отделяется от находок и не обрезается", () => {
  const out = [
    "src/a.py:3: печать",
    "src/b.py:9: печать",
    "src/c.py:1: печать",
    "src/d.py:7: печать",
    "  почини: замени на вызов системы логов",
    "  тогда запись попадёт в общий журнал",
  ];
  const r = splitAdvice(out);
  assert.equal(r.findings.length, 4);
  assert.equal(r.advice.length, 2);
  // Продолжение совета едет вместе с ним: без второй строки первая обрывается на полуслове.
  assert.equal(r.advice[1].includes("общий журнал"), true);
});

test("совет по починке опознаётся на обоих языках", () => {
  assert.equal(splitAdvice(["a.py:1: x", "  fix: replace with a logger call"]).advice.length, 1);
  assert.equal(splitAdvice(["a.py:1: x", "  почини: замени на логгер"]).advice.length, 1);
});

// Вывод без совета — это не ошибка разбора, а признак записи, которая не говорит, что делать.
// Разбор обязан вернуть пустой совет, а не выдумать его из последней строки.
test("вывод без совета не превращается в совет", () => {
  const r = splitAdvice(["src/a.py:3: печать", "src/b.py:9: печать"]);
  assert.equal(r.advice.length, 0);
  assert.equal(r.findings.length, 2);
});


// Совет бывает не только в конце: `deps-are-pinned` печатает его внутри вспомогательной
// функции, вызываемой шесть раз, и находки идут ПОСЛЕ. Пока советом считалось «всё от первой
// метки до конца», сорок находок уезжали в жёлтый список без обрезки — ровно та стена красного,
// против которой написан этот модуль. Найдено ревью 2026-09-06.
test("совет, вставленный посреди вывода, не проглатывает находки", () => {
  const r = splitAdvice([
    "  почини: закрепи версии",
    "src/a.py:1: x",
    "src/b.py:2: x",
    "src/c.py:3: x",
    "  почини: и вот это тоже",
    "    вторая строка совета",
  ]);
  assert.equal(r.findings.length, 3);
  assert.equal(r.advice.length, 3);
});

// Продолжение совета не должно съедать находку, стоящую сразу за ним.
test("находка сразу после совета остаётся находкой", () => {
  const r = splitAdvice(["  почини: сделай так", "    пояснение", "src/z.py:9: x"]);
  assert.equal(r.findings.length, 1);
  assert.equal(r.findings[0].includes("src/z.py"), true);
});


// --- правило, введённое совещательным ----------------------------------------
// ЗАЧЕМ. Правило вводят в проект, где старый код ему не соответствует. Храповик отвечает на
// это одним способом: старое становится долгом. Второй способ — показывать, не роняя, пока
// команда договаривается. Сегодня его нет вовсе: находка либо роняет сборку, либо не существует.
//
// ПОЧЕМУ ОБЪЯВЛЕНИЕМ, А НЕ ФЛАГОМ ПРОГОНА. Флаг «не роняй ничего» — это `continue-on-error`,
// против которого написана наша же запись ci-actually-fails: он понижает всё разом, не виден
// в дифе и не назван в сводке. Список в манифесте виден, именуется и считается всегда.
test("совещательные гейты читаются из манифеста списком", () => {
  const man = parseManifest("aqk: 1\nadvisory:\n  - complexity-limit\n  - duplicate-code\n");
  const a = advisorySet(man);
  assert.equal(a.has("complexity-limit"), true);
  assert.equal(a.has("duplicate-code"), true);
  assert.equal(a.has("secrets-not-in-code"), false);
});

test("список в одну строку читается так же", () => {
  const a = advisorySet(parseManifest("advisory: [complexity-limit, duplicate-code]\n"));
  assert.equal(a.size, 2);
});

// Отсутствие блока — это ноль совещательных, а не «все совещательные».
test("без блока advisory совещательных нет", () => {
  assert.equal(advisorySet(parseManifest("aqk: 1\n")).size, 0);
  assert.equal(advisorySet(null).size, 0);
});

// Поле обязано быть известным манифесту: иначе опечатка «advisery:» молча означала бы
// «совещательных нет», и правило, которое человек считал введённым, роняло бы сборку.
test("advisory — известное поле манифеста", () => {
  assert.equal(KNOWN_KEYS.includes("advisory"), true);
  assert.deepEqual(unknownKeys({ aqk: 1, advisory: [] }), []);
});


// --- правила на языке проекта ------------------------------------------------
// ЗАЧЕМ. Русский текст правил в англоязычном проекте — это первое, что там откроет человек,
// и первое, чего он не прочитает. Русская версия остаётся источником истины, английская —
// переводом. Совпадение содержания машина не сторожит, а вот НАБОР ФАЙЛОВ обязана: добавили
// правило на одном языке и забыли про другой — половина мира получит комплект без него.
test("наборы файлов правил совпадают на обоих языках", async () => {
  const { readdir } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const at = (d) => fileURLToPath(new URL(`../../kit/${d}`, import.meta.url));
  const ru = (await readdir(at("rules"))).filter((f) => f.endsWith(".md")).sort();
  const en = (await readdir(at("rules-en"))).filter((f) => f.endsWith(".md")).sort();
  assert.deepEqual(en, ru);
  assert.equal(ru.length > 0, true);
});

