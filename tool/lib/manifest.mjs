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
      out[section][key] = clean;
      continue;
    }
    section = key;
    // Список в одну строку: entry: [AGENTS.md, docs/START.md]. Люди пишут именно так —
    // и раньше манифест молча читался как пустой, а проект получал вердикт «нет AQK-0».
    // Неверный вердикт хуже отсутствия вердикта: ему верят.
    if (clean.startsWith("[") && clean.endsWith("]")) {
      out[key] = clean
        .slice(1, -1)
        .split(",")
        .map((v) => v.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
      continue;
    }
    out[key] = clean === "" ? {} : clean;
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
const KNOWN_KEYS = ["aqk", "entry", "rules", "docs", "gates", "samples", "ratchets", "lessons", "advisory"];

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
  return [
    [field("docs", inKit ? "kit/docs" : ".aqk/docs"), inKit ? L.doctor.docsKit : L.doctor.docs],
    [field("rules", inKit ? "kit/rules" : ".aqk/rules"), inKit ? L.doctor.rulesKit : L.doctor.rules],
    ...(entries.length ? entries : ["AGENTS.md"]).map((e) => [e, L.doctor.agents]),
    [".gitignore", L.doctor.gitignore],
    [".git", L.doctor.git],
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

// СОВЕЩАТЕЛЬНЫЕ ГЕЙТЫ. Правило вводят в проект, где старый код ему не соответствует. Храповик
// отвечает на это одним способом: старое становится долгом, новое блокируется. Второй способ —
// показывать, не роняя, пока команда договаривается о правиле. Без него у человека остаётся
// выбор из двух крайностей: включить и сломать сборку либо не включать вовсе.
//
// ПОЧЕМУ СПИСКОМ В МАНИФЕСТЕ, А НЕ ФЛАГОМ ПРОГОНА. Флаг «не роняй ничего» — это тот самый
// `continue-on-error`, против которого написана наша запись ci-actually-fails: он понижает всё
// разом, не виден в дифе и не назван в сводке. Список виден в манифесте, называется поимённо и
// печатается КАЖДЫЙ прогон: совещательный гейт, о котором забыли, — это выключенная проверка,
// и молчать о нём нельзя.
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
  entryLifecycle, advisorySet, layoutChecks,
};
