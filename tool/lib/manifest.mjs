// tool/lib/manifest.mjs — чтение .aqk.yml и вычисление ступени соответствия.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CWD, MANIFEST, PROJECT_GATES, exists } from "./core.mjs";
import { L } from "../i18n/index.mjs";

// СТАНДАРТ. Уровень — не самооценка и не галочка в README, а вычисляемое утверждение:
// каждая ступень проверяется файлами на диске. Утверждение, которое нельзя проверить
// машиной, в стандарт не входит — иначе значок в README означает только доверие к автору.

// Разбор ограниченного подмножества YAML: ключ, вложенный на один уровень ключ, список.
// НАМЕРЕННО без библиотеки: манифест обязан быть настолько простым, чтобы его разбирал
// кусок кода, который читается за минуту. Сложный манифест никто не заполнит.
// Срезает комментарий по правилу YAML: решётка начинает комментарий только с начала строки
// или после пробела. Безусловное `replace(/#.*$/)` молча обрезало команду
// `npx jscpd --format "java,c#,php"` на «c» — гейт запускал не то, что объявлено, и об этом
// никто не узнавал. Объявленное и исполняемое обязаны совпадать: на этом стоит весь стандарт.
//
// Пары кавычек не отслеживаем намеренно: в рецептах кавычки соседние, а не вложенные
// (`"bash x.sh --format "a,b" ."`), и подсчёт пар решил бы, что «c#» стоит снаружи.
function stripComment(raw) {
  const i = raw.search(/(^|\s)#/);
  if (i < 0) return raw;
  return raw[i] === "#" ? raw.slice(0, i) : raw.slice(0, i + 1);
}

// Список в одну строку: `[AGENTS.md, docs/START.md]`. Вынесен отдельно, потому что нужен на
// двух уровнях, а два одинаковых куска разбора расходятся ровно так же, как два свода правил.
function inlineList(v) {
  const s = String(v).trim();
  if (!s.startsWith("[") || !s.endsWith("]")) return null;
  return s.slice(1, -1).split(",").map((x) => x.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
}

function parseManifest(text) {
  const out = {};
  let section = null;
  for (const raw of text.split("\n")) {
    const line = stripComment(raw).replace(/\s+$/, "");
    if (!line.trim()) continue;
    const indented = /^\s/.test(line);
    const listItem = line.trim().startsWith("- ");

    if (listItem && section) {
      // Ключ вида `entry:` без значения уже создал пустой объект — под список его надо
      // заменить массивом, иначе push падает и весь манифест читается как отсутствующий.
      if (!Array.isArray(out[section])) out[section] = [];
      out[section].push(line.trim().slice(2).trim().replace(/^["']|["']$/g, ""));
      continue;
    }
    const m = line.trim().match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    const [, key, value] = m;
    const clean = value.trim().replace(/^["']|["']$/g, "");

    if (indented && section) {
      if (typeof out[section] !== "object" || Array.isArray(out[section])) out[section] = {};
      // Список в одну строку разбирается и на вложенном уровне: `covers:` ниже `  lint: [a, b]`.
      // Раньше вложенное значение всегда оставалось строкой, и `[a, b]` превращалось в текст
      // «[a, b]» — молча, как это умеет только разбор без схемы. Наверху такой список уже
      // разбирался; расхождение между уровнями и есть источник тихой неправды.
      out[section][key] = inlineList(clean) || clean;
      continue;
    }
    section = key;
    // Список в одну строку: entry: [AGENTS.md, docs/START.md]. Люди пишут именно так —
    // и раньше манифест молча читался как пустой, а проект получал вердикт «нет AQK-0».
    // Неверный вердикт хуже отсутствия вердикта: ему верят.
    const list = inlineList(clean);
    if (list) { out[key] = list; continue; }
    out[key] = clean === "" ? {} : clean;
  }
  return out;
}

// СТРОКА, КОТОРУЮ РАЗБОР НЕ ПОНЯЛ, НЕ ИСЧЕЗАЕТ МОЛЧА.
//
// Найдено 2026-09-09 случайно: подсаживали падающий гейт с именем «плохой», чтобы посмотреть на
// вывод, — и прогон вышел с НУЛЁМ. Гейт не упал: его не существовало. Имена разбираются только
// латиницей, а строка, не подошедшая под это, выбрасывалась без единого слова.
//
// Это наш класс в чистом виде: человек объявил проверку, видит её в файле, а её нет. Хуже
// опечатки в имени поля — ту мы называем с 2026-09-06, а эту не называли вовсе.
//
// ЧИНИТСЯ ГОЛОСОМ, А НЕ АЛФАВИТОМ. Расширить набор букв — залатать один случай; строк, которые
// разбор не понимает, бывает больше (табуляция вместо пробелов, двоеточие в значении без
// кавычек). Называется любая: разбор ограниченного подмножества YAML честен ровно до тех пор,
// пока говорит, чего не взял.
function unparsedLines(text) {
  const out = [];
  let n = 0;
  for (const raw of String(text).split("\n")) {
    n += 1;
    const line = stripComment(raw).replace(/\s+$/, "");
    if (!line.trim()) continue;
    if (line.trim().startsWith("- ")) continue;
    if (/^\s*[A-Za-z0-9_-]+:\s*(.*)$/.test(line)) continue;
    out.push({ line: n, text: raw.trim() });
  }
  return out;
}

// Поля, которые манифест знает. Список здесь, а не в схеме-файле: зависимостей у программы
// нет, а схема на восемь ключей, которую надо валидировать библиотекой, стоит дороже, чем
// защищает.
//
// ЗАЧЕМ ЭТО ВООБЩЕ. Разбор принимает любое имя поля. Опечатка `gate:` вместо `gates:` молча
// означала «гейтов не объявлено»: вердикт выдавался неверный, а причина не называлась. Это
// ровно тот класс, против которого построен стандарт — тишина неотличима от успеха, — только
// внутри самой программы.
// Список обязан совпадать с тем, что программа РЕАЛЬНО читает (`man?.<поле>` в tool/):
// лишнее имя здесь молча узаконивает поле, которое ни на что не влияет, — та же тишина,
// только с другой стороны. Сверено обходом: aqk, entry, rules, gates, samples, ratchets, lessons.
const KNOWN_KEYS = ["aqk", "entry", "rules", "docs", "lang", "gates", "covers", "requires", "samples", "ratchets", "lessons", "advisory", "probe", "groups"];

// ГДЕ У ПРОЕКТА ЛЕЖИТ РАЗЛОЖЕННЫЙ КОМПЛЕКТ. Список для шапки `doctor`. До 2026-09-08 он был
// литеральным: `.aqk/rules`, `.aqk/docs`, `AGENTS.md` — независимо от того, что написано в
// манифесте. Второй пользователь прислал разбор: у него `rules: .temper/rules`, правила на
// месте, гейт entry-links-exist их видит, СТУПЕНЬ считается по манифесту и берётся — а шапка
// рисует два креста и советует сделать сделанное. Вывод расходился с собственным вердиктом
// программы; это хуже, чем просто неверный вывод, потому что оба напечатаны рядом.
// Поля `docs:` не существовало вовсе: методички было некуда перенести, и крест за них снять
// было нельзя ничем. Умолчания остаются для тех, кто полей не завёл, — это большинство.
function layoutChecks(man, inKit) {
  const field = (name, dflt) => {
    const v = man && typeof man === "object" && !Array.isArray(man) ? man[name] : null;
    return typeof v === "string" && v.trim() ? v.trim() : dflt;
  };
  // Точка входа — тоже поле манифеста, и по той же причине: проект на `CLAUDE.md` получал крест
  // за `AGENTS.md`, которого у него намеренно нет. Класс дефекта один, чинится он один раз.
  const entries = (Array.isArray(man?.entry) ? man.entry : [])
    .filter((e) => typeof e === "string" && e.trim())
    .map((e) => e.trim());
  // Третий элемент — обязателен ли пункт. Методички и стандарты `init` кладёт как пособие: проект
  // вправе держать их где-то ещё или не держать вовсе, и их отсутствие — совет, а не приговор
  // прогону (отзыв с живого проекта 2026-09-11: прогон краснел только из-за `.aqk/docs`). Точка
  // входа, .gitignore и .git — обязательны: на них стоит своя проверка вердикта.
  return [
    [field("docs", inKit ? "kit/docs" : ".aqk/docs"), inKit ? L.doctor.docsKit : L.doctor.docs, false],
    [field("rules", inKit ? "kit/rules" : ".aqk/rules"), inKit ? L.doctor.rulesKit : L.doctor.rules, false],
    ...(entries.length ? entries : ["AGENTS.md"]).map((e) => [e, L.doctor.agents, true]),
    [".gitignore", L.doctor.gitignore, true],
    [".git", L.doctor.git, true],
  ];
}

function unknownKeys(man) {
  if (!man || typeof man !== "object" || Array.isArray(man)) return [];
  return Object.keys(man).filter((k) => !KNOWN_KEYS.includes(k));
}

// ЗРЕЛОСТЬ ЗАПИСИ. Каталог без зрелости — это список, в котором нельзя отличить проверенное от
// свежего; при шестнадцати записях это держится на памяти, при чужих записях — уже нет.
//
// ПОЧЕМУ ВЫЧИСЛЯЕТСЯ, А НЕ ОБЪЯВЛЯЕТСЯ. Поле зрелости есть у всех троих соседей — `lifecycle`
// у зондов Scorecard, `future`/`obsolete` у критериев значка OpenSSF — и у всех троих его
// заполняет автор. Значение, которое написал автор, означает доверие к автору, а не факт: это
// ровно тот способ, которым «зелёный» перестаёт что-либо значить. Здесь зрелость считается по
// доказательству записи, и объявить её нельзя — попытка отклоняется приёмкой каталога.
//
// Исключение одно: `deprecated`. «Запись больше не ставят» из её собственных файлов не выводится
// никак — это решение, а не факт. Цена решения — обязательная замена: запись, выведенная в
// никуда, оставляет человека без ответа на вопрос «а что теперь».
const LIFECYCLE_COMPUTED = ["stable", "experimental"];

function entryLifecycle(rec) {
  const declared = typeof rec?.lifecycle === "string" ? rec.lifecycle.trim() : "";
  const supersededBy = typeof rec?.superseded_by === "string" ? rec.superseded_by.trim() : "";
  // Тот же признак, которым каталог отделяет условную запись с первого дня: доказательство
  // ссылается на журнал шишек — значит, запись родилась из настоящей поломки, а не из
  // «это хорошая практика». Признак один на всю программу: разъехавшись, он дал бы приёмке
  // и отчёту разные ответы про одну и ту же запись.
  const proven = /incidents\//.test(String(rec?.proof || ""));
  const state = declared === "deprecated" ? "deprecated" : proven ? "stable" : "experimental";
  const why = L.lifecycle[state];

  let problem = null;
  if (declared === "deprecated" && !supersededBy) problem = L.lifecycle.noReplacement;
  else if (LIFECYCLE_COMPUTED.includes(declared)) problem = L.lifecycle.notDeclarable(declared);
  else if (declared && declared !== "deprecated") problem = L.lifecycle.unknown(declared);

  return { state, why, supersededBy: supersededBy || null, problem };
}

// Программа, без которой запись каталога не работает вовсе: поле `requires` в её `gate.yml`.
// Возвращает список НЕДОСТАЮЩИХ программ или null.
//
// ЗАЧЕМ ОБЩИМ. Переносимый рецепт бывает обёрткой вокруг готового инструмента: первое слово
// команды тогда `bash`, и по нему не видно, чего не хватает. Этот вопрос задают трое —
// приёмка каталога, доказательство гейтов и осмотр обвязки, — и каждый отвечал на него
// по-своему или не отвечал вовсе. 2026-09-09: `prove` объявлял такой гейт сломанным, а
// `vitals` печатал «все инструменты на месте» ровно там, где прогон краснел.
// `has` передаётся вызывающим, а не берётся отсюда: manifest.mjs не должен знать про осмотр
// репозитория — импорт в обратную сторону завёл бы цикл. Заодно функция проверяема модульно.
// ДВА ИСТОЧНИКА, А НЕ ОДИН. Поле читалось только из `<samples>/<гейт>/gate.yml`, то есть было
// доступно НАШИМ записям и недоступно гейтам проекта. Разбор чужой интеграции 2026-09-16: гейт
// объявлен как `docker run --rm … promtool test rules …`, `vitals` смотрит первое слово, видит
// `docker` и говорит «инструменты на месте». У проекта с чужими командами `samples` пуст по
// построению, и сказать «этому гейту нужен docker» было нечем.
//
// СНАРУЖИ СОГЛАШЕНИЯ НЕТ — проверено 2026-09-16, и это сказано вслух, а не выдано за
// общепринятое. У pre-commit ровно эта просьба закрыта нерешённой (issue #2042: трактовать
// `additional_dependencies` как список программ в $PATH и пропускать хук, если программы нет;
// ответ — `system`-хуки окружения не ставят). У lefthook такого ключа нет вовсе. Поэтому мы не
// копируем чужую форму, а распространяем свою: то же имя поля и та же форма «имя гейта →
// значение», что у `covers:` и `groups:`. Новых понятий в манифесте не появляется.
//
// ГРАНИЦА НАЗЫВАЕТСЯ ВСЛУХ: «программа есть в PATH» и «программа сможет отработать» — разные
// утверждения. `docker` в PATH при мёртвом демоне по-прежнему считается найденным; это не
// ложь vitals, а предел того, что видно без запуска. Запускать чужой инструмент ради осмотра
// мы не будем: осмотр обязан быть дешёвым и без побочных действий.
function requiredBy(man, name) {
  const r = man?.requires && typeof man.requires === "object" && !Array.isArray(man.requires) ? man.requires : null;
  const v = r ? r[name] : null;
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  return typeof v === "string" ? v.split(",").map((x) => x.trim()).filter(Boolean) : [];
}

async function gateRequires(man, samplesDir, name, has) {
  const names = [...requiredBy(man, name)];
  if (samplesDir) {
    const yml = join(CWD, samplesDir, name, "gate.yml");
    if (await exists(yml)) {
      try {
        const rec = parseManifest(await readFile(yml, "utf8"));
        const raw = typeof rec?.requires === "string" ? rec.requires.trim() : "";
        for (const x of raw.split(",").map((s) => s.trim()).filter(Boolean)) names.push(x);
      } catch { /* нечитаемая запись — не повод обвинять гейт */ }
    }
  }
  if (!names.length) return null;
  const missing = [...new Set(names)].filter((x) => !has(x));
  return missing.length ? missing : null;
}

// ПОЧЕМУ СПИСКОМ В МАНИФЕСТЕ, А НЕ ФЛАГОМ ПРОГОНА. Флаг «не роняй ничего» — это тот самый
// `continue-on-error`, против которого написана наша запись ci-actually-fails: он понижает всё
// разом, не виден в дифе и не назван в сводке. Список виден в манифесте, называется поимённо и
// печатается КАЖДЫЙ прогон: совещательный гейт, о котором забыли, — это выключенная проверка,
// и молчать о нём нельзя.
// СОВЕЩАТЕЛЬНЫЕ ГЕЙТЫ. Правило вводят в проект, где старый код ему не соответствует. Храповик
// отвечает на это одним способом: старое становится долгом, новое блокируется. Второй способ —
// показывать, не роняя, пока команда договаривается о правиле. Без него у человека остаётся
// выбор из двух крайностей: включить и сломать сборку либо не включать вовсе.
//
function advisorySet(man) {
  const v = man?.advisory;
  if (Array.isArray(v)) return new Set(v.map((x) => String(x).trim()).filter(Boolean));
  return new Set();
}

async function readManifest() {
  const p = join(CWD, MANIFEST);
  if (!(await exists(p))) return null;
  try {
    return parseManifest(await readFile(p, "utf8"));
  } catch {
    return null;
  }
}

// Каждая ступень: что требуется, как проверяется, и что это даёт человеку.
// `proof` — результат `proveGates`: { ok } либо null, если доказательства не было. Ступень
// AQK-2 требует его прямо: до 2026-09-07 она проверяла, что папки образцов и храповиков
// СУЩЕСТВУЮТ, и проект с тремя гейтами `true` проходил порог AQK-3 с зелёным значком.
// Проверено прогоном на пустой папке. Наличие папки — не защита; уровень обязан означать факт.
async function assessLevel(man, proof = null) {
  const has = async (rel) => Boolean(rel) && (await exists(join(CWD, String(rel))));
  const isUrl = (v) => typeof v === "string" && /^https?:\/\//.test(v);

  const entries = Array.isArray(man?.entry) ? man.entry : [];
  const entriesExist = entries.length > 0 && (await Promise.all(entries.map(has))).every(Boolean);

  const gates = man?.gates && typeof man.gates === "object" && !Array.isArray(man.gates) ? man.gates : {};
  const filledGates = Object.entries(gates).filter(([, cmd]) => String(cmd || "").trim());

  // Условие ступени — здесь, её описание — в каталоге строк: текст переводится, условие нет.
  // Разложить их по разным файлам стоило того, чтобы перевод не мог случайно поменять смысл
  // проверки; порядок ступеней связывает их по индексу и сверяется модульной проверкой.
  const conditions = [
    Boolean(man?.aqk) && entriesExist,
    (await has(man?.rules)) && filledGates.length > 0,
    (await has(man?.samples)) && (await has(man?.ratchets)) && proof?.ok === true,
    isUrl(man?.lessons) || (await has(man?.lessons)),
  ];
  // Ступени, которым нужно доказательство, помечаются отдельно: «не выполнено» и «не проверяли»
  // — разные состояния, и печатать их одинаково значит врать ровно тем способом, против
  // которого весь комплект.
  const NEEDS_PROOF = 2;
  const steps = conditions.map((ok, level) => ({
    level,
    ok,
    // Ровно вторая: третья ступень проверяет журнал, и посылать за доказательством там
    // значит указать не на ту недостачу. Найдено код-ревью 2026-09-07.
    needsProof: level === NEEDS_PROOF && proof === null,
    ...L.levels[level],
  }));

  let reached = -1;
  for (const s of steps) {
    if (!s.ok) break;
    reached = s.level;
  }
  return { reached, steps };
}

// Вписать гейт в манифест, не тронув комментарии: правим текст, а не пересобираем YAML.
function manifestWithGate(text, slug, cmd) {
  const lines = text.split("\n");
  const entry = `  ${slug}: "${cmd}"`;

  const gi = lines.findIndex((l) => /^gates:\s*$/.test(l));
  if (gi === -1) return { text: null, why: L.manifest.noGatesBlock };
  if (lines.some((l) => new RegExp(`^\\s+${slug}:`).test(l))) return { text: null, why: L.manifest.alreadyDeclared };

  let last = gi;
  for (let i = gi + 1; i < lines.length; i++) {
    if (/^\s+\S/.test(lines[i])) last = i;
    else if (lines[i].trim() === "" || lines[i].startsWith("#")) continue;
    else break;
  }
  lines.splice(last + 1, 0, entry);

  let out = lines.join("\n");
  // Образцы теперь есть — ступень AQK-2 требует, чтобы поле на них указывало.
  out = out.replace(/^samples:\s*""\s*$/m, `samples: ${PROJECT_GATES}`);
  return { text: out, why: null };
}

export {
  parseManifest, readManifest, assessLevel, manifestWithGate, unknownKeys, KNOWN_KEYS,
  entryLifecycle, advisorySet, gateRequires, layoutChecks, unparsedLines,
};
