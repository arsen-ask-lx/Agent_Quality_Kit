#!/usr/bin/env node
// aqk — разложить оснастку в проект и вести общий журнал шишек.
//
// ЗАЧЕМ ЭТО, А НЕ ПЛАГИН. Плагин Claude Code работает только в Claude Code. Правила, документация
// и гейты не зависят от того, какой нейросетью пишут код, — значит и способ установки не должен
// зависеть. `npx` есть везде, где есть Node.
//
// ЗАВИСИМОСТЕЙ НЕТ НАМЕРЕННО. Каждая чужая библиотека — лишний узел надёжности и лишняя дверь в
// цепочке поставок. Инструмент, который ставят одной командой в чужой проект, обязан быть
// проверяемым глазами за один присест.
//
//   npx github:arsen-ask-lx/Agent_Quality_Kit init     разложить комплект в текущий проект
//   npx github:arsen-ask-lx/Agent_Quality_Kit init --force   перезаписать уже существующие файлы
//   npx github:arsen-ask-lx/Agent_Quality_Kit note "..."     записать урок в общий журнал
//   npx github:arsen-ask-lx/Agent_Quality_Kit doctor   проверить, что разложено и чего не хватает

import { readdir, mkdir, copyFile, writeFile, access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, relative } from "node:path";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(HERE, "..");
const CWD = process.cwd();

const REFERENCES_SRC = join(PKG_ROOT, "references");
const GUIDES_SRC = join(PKG_ROOT, "guides");
const RULES_SRC = join(PKG_ROOT, "rules");
const TARGET_DIR = ".aqk";

const c = {
  bold: (s) => `[1m${s}[0m`,
  dim: (s) => `[2m${s}[0m`,
  green: (s) => `[32m${s}[0m`,
  yellow: (s) => `[33m${s}[0m`,
  red: (s) => `[31m${s}[0m`,
};

const exists = async (p) => access(p, constants.F_OK).then(() => true, () => false);

function die(msg) {
  console.error(c.red(msg));
  process.exit(1);
}

// --- шаблоны точек входа ----------------------------------------------------
// ОДИН источник правил, НЕСКОЛЬКО входов. Каждый инструмент читает свой файл, но оба ведут в
// .aqk/. Два расходящихся свода правил — худшее, что можно сделать: через месяц они врут
// по-разному, и никто не знает, какой настоящий.

const AGENTS_MD = `# AGENTS.md

> Точка входа для агента. Держи файл коротким: раздутый свод правил вытесняет саму задачу из
> контекста, и тогда игнорируются все правила разом. Всё длинное — по ссылкам ниже.

## Железные правила

- **План до кода.** Нетривиальная задача начинается с плана, который человек одобрил словами.
- **Красный тест до кода.** Сначала проверка, которая падает, потом реализация.
- **Максимум 3 попытки.** Не решил за три — стоп и человеку, а не четвёртый заход.
- **Секреты только в окружении.** Никогда в коде, логах и коммитах.
- **Только файлы из задачи.** Заодно ничего не чиним.
- **Готово = доказано.** Назови арбитра: тест, живой прогон, сверка с источником. «Выглядит
  рабочим» — не готово.
- **Ошибку не глотать.** Либо обработана и залогирована, либо проброшена.
- **Развилка — вопрос человеку.** Отступление от принятого решения не оформляется комментарием
  в коде.

## Где что лежит

- \`.aqk/rules/\` — стандарты: общие, тесты, безопасность
- \`.aqk/guides/\` — процедуры: как развернуть харнес, как записать урок
- \`.aqk/references/\` — методички: минимум проекта, харнес, процесс, исследования
- \`.aqk/references/project-baseline.md\` — **начни отсюда**, если проект новый

## Команды

<!-- Заполни под свой проект. Команда, которую нельзя скопировать и выполнить, — не команда. -->

- сборка: \`\`
- тесты: \`\`
- линтер: \`\`
- всё разом перед пушем: \`\`

## Чего в этом проекте нет

<!-- Пиши сюда честно. Ненаписанное «нет» агент додумает как «есть». -->
`;

const CLAUDE_MD = `# CLAUDE.md

Правила этого проекта живут в \`AGENTS.md\` — читай его.

Один свод правил, несколько точек входа: \`AGENTS.md\` для агентов, понимающих его,
\`CLAUDE.md\` — для Claude Code. Держать два расходящихся свода нельзя: через месяц они врут
по-разному, и непонятно, какой настоящий.

@AGENTS.md
`;

// Манифест — единственный машиночитаемый файл стандарта. Всё остальное человекочитаемо.
// Пустые значения оставлены НАМЕРЕННО: заполненная заглушка врала бы про уровень.
const MANIFEST_YML = `# .aqk.yml — манифест Agent Quality Kit
# Что это: машиночитаемое описание того, как в этом репозитории живут агенты.
# Уровень соответствия считает \`aqk doctor\`. Пустое поле = ступень не пройдена,
# и это честно: заполнять заглушками бессмысленно, проверяются файлы, а не слова.

aqk: 1

# AQK-0 — что агент читает первым.
entry:
  - AGENTS.md

# AQK-1 — где стандарты и какие проверки обязательны.
rules: .aqk/rules
gates:
  lint: ""
  test: ""
  types: ""

# AQK-2 — чем доказано, что гейты работают, и где реестры долга.
# samples: каталог с красными и зелёными образцами (гейт обязан краснеть на первом
# и молчать на втором). ratchets: списки известных нарушений, которые могут только
# укорачиваться.
samples: ""
ratchets: ""

# AQK-3 — где копятся уроки. Путь или адрес.
lessons: ""
`;


// --- init -------------------------------------------------------------------

async function copyDir(src, dst, { force }) {
  await mkdir(dst, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  const written = [];
  for (const e of entries) {
    const from = join(src, e.name);
    const to = join(dst, e.name);
    if (e.isDirectory()) {
      written.push(...(await copyDir(from, to, { force })));
      continue;
    }
    if (!force && (await exists(to))) continue;
    await copyFile(from, to);
    written.push(to);
  }
  return written;
}

async function writeIfAbsent(path, content, { force }) {
  if (!force && (await exists(path))) return false;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
  return true;
}

async function cmdInit(args) {
  const force = args.includes("--force");
  const created = [];
  const skipped = [];

  const track = (ok, path) => (ok ? created : skipped).push(relative(CWD, path));

  if (!(await exists(REFERENCES_SRC))) {
    die(`Не найден корпус документации: ${REFERENCES_SRC}\nПохоже, пакет установлен не полностью.`);
  }

  const refs = await copyDir(REFERENCES_SRC, join(CWD, TARGET_DIR, "references"), { force });
  for (const f of refs) created.push(relative(CWD, f));

  const guides = await copyDir(GUIDES_SRC, join(CWD, TARGET_DIR, "guides"), { force });
  for (const f of guides) created.push(relative(CWD, f));

  const rules = await copyDir(RULES_SRC, join(CWD, TARGET_DIR, "rules"), { force });
  for (const f of rules) created.push(relative(CWD, f));


  const manifest = join(CWD, MANIFEST);
  track(await writeIfAbsent(manifest, MANIFEST_YML, { force }), manifest);

  const agents = join(CWD, "AGENTS.md");
  track(await writeIfAbsent(agents, AGENTS_MD, { force }), agents);

  const claude = join(CWD, "CLAUDE.md");
  track(await writeIfAbsent(claude, CLAUDE_MD, { force }), claude);

  console.log(c.bold("\naqk init\n"));
  if (created.length) {
    console.log(c.green(`  создано (${created.length}):`));
    for (const f of created.slice(0, 8)) console.log(`    ${f}`);
    if (created.length > 8) console.log(c.dim(`    … и ещё ${created.length - 8}`));
  }
  if (skipped.length) {
    console.log(c.yellow(`\n  уже были на месте, не тронуты (${skipped.length}):`));
    for (const f of skipped) console.log(`    ${f}`);
    console.log(c.dim("  перезаписать: aqk init --force"));
  }

  console.log(`
${c.bold("Что дальше — по порядку:")}

  1. Открой ${c.bold("AGENTS.md")} и заполни раздел «Команды». Команда, которую нельзя
     скопировать и выполнить, — не команда, а пожелание.
  2. Прочитай ${c.bold(".aqk/references/project-baseline.md")} — это обязательный минимум
     проекта без привязки к языку. Пройди сверху вниз и отметь, чего нет.
  3. Заполни ${c.bold(".aqk.yml")} — гейты, образцы, журнал. Уровень соответствия AQK
     считается по нему: ${c.bold("aqk doctor")}.
  4. Поднимайся по ступеням ${c.bold("по одной")}. Гейт стережёт существующий артефакт:
     проверка на код, которого ещё нет, — мёртвое правило.

${c.dim('Обжёгся на чём-то — запиши: aqk note "что случилось"')}
`);
}

// --- манифест и уровни соответствия AQK -------------------------------------
// СТАНДАРТ. Уровень — не самооценка и не галочка в README, а вычисляемое утверждение:
// каждая ступень проверяется файлами на диске. Утверждение, которое нельзя проверить
// машиной, в стандарт не входит — иначе значок в README означает только доверие к автору.

const MANIFEST = ".aqk.yml";

// Разбор ограниченного подмножества YAML: ключ, вложенный на один уровень ключ, список.
// НАМЕРЕННО без библиотеки: манифест обязан быть настолько простым, чтобы его разбирал
// кусок кода, который читается за минуту. Сложный манифест никто не заполнит.
function parseManifest(text) {
  const out = {};
  let section = null;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/#.*$/, "").replace(/\s+$/, "");
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
    out[key] = clean === "" ? {} : clean;
  }
  return out;
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
async function assessLevel(man) {
  const has = async (rel) => Boolean(rel) && (await exists(join(CWD, String(rel))));
  const isUrl = (v) => typeof v === "string" && /^https?:\/\//.test(v);

  const entries = Array.isArray(man?.entry) ? man.entry : [];
  const entriesExist = entries.length > 0 && (await Promise.all(entries.map(has))).every(Boolean);

  const gates = man?.gates && typeof man.gates === "object" && !Array.isArray(man.gates) ? man.gates : {};
  const filledGates = Object.entries(gates).filter(([, cmd]) => String(cmd || "").trim());

  const steps = [
    {
      level: 0,
      title: "манифест и точка входа",
      ok: Boolean(man?.aqk) && entriesExist,
      need: "создай .aqk.yml и укажи в entry файл, который агент читает первым (AGENTS.md)",
      gives: "любой инструмент понимает, что читать в этом репозитории",
    },
    {
      level: 1,
      title: "правила и работающие гейты",
      ok: (await has(man?.rules)) && filledGates.length > 0,
      need: "укажи rules (каталог стандартов) и заполни хотя бы один гейт в gates реальной командой",
      gives: "проверки объявлены командами, а не описаны словами",
    },
    {
      level: 2,
      title: "гейты доказаны, долг под храповиком",
      ok: (await has(man?.samples)) && (await has(man?.ratchets)),
      need: "заведи samples (красные и зелёные образцы гейтов) и ratchets (реестры долга)",
      gives: "гейт доказал, что ловит брак и молчит на исправном коде",
    },
    {
      level: 3,
      title: "уроки возвращаются в работу",
      ok: isUrl(man?.lessons) || (await has(man?.lessons)),
      need: "укажи lessons — путь или адрес журнала, где каждый инцидент даёт вывод",
      gives: "проект учится: одна и та же шишка не набивается дважды",
    },
  ];

  let reached = -1;
  for (const s of steps) {
    if (!s.ok) break;
    reached = s.level;
  }
  return { reached, steps };
}

// --- doctor -----------------------------------------------------------------

async function cmdDoctor() {
  console.log(c.bold("\naqk doctor\n"));

  const checks = [
    [".aqk/references", "корпус методичек"],
    [".aqk/rules", "стандарты"],
    [".aqk/guides", "процедуры"],
    ["AGENTS.md", "точка входа для агентов"],
    [".gitignore", "гигиена репозитория"],
    [".git", "проект под контролем версий"],
  ];

  let missing = 0;
  for (const [path, what] of checks) {
    const ok = await exists(join(CWD, path));
    if (!ok) missing++;
    console.log(`  ${ok ? c.green("✔") : c.red("✘")}  ${path.padEnd(22)} ${c.dim(what)}`);
  }

  // Команды в AGENTS.md заполнены или остались пустыми заготовками?
  const agents = join(CWD, "AGENTS.md");
  if (await exists(agents)) {
    const text = await readFile(agents, "utf8");
    const emptyCommands = (text.match(/^- [^:]+: ``$/gm) || []).length;
    if (emptyCommands) {
      console.log(
        `\n  ${c.yellow("!")}  В AGENTS.md ${emptyCommands} незаполненных команд. ` +
          c.dim("Агент не может выполнить пустую строку.")
      );
    }
  }

  const man = await readManifest();
  const { reached, steps } = await assessLevel(man);

  console.log(c.bold("\n  Уровень соответствия AQK\n"));
  for (const s of steps) {
    const mark = s.ok ? c.green("✔") : reached + 1 === s.level ? c.yellow("→") : c.dim("·");
    console.log(`  ${mark}  AQK-${s.level}  ${s.title}`);
  }

  const next = steps.find((s) => !s.ok);
  console.log(
    reached < 0
      ? c.yellow(`\n  Уровень: не достигнут даже AQK-0.\n`)
      : c.green(`\n  Уровень: AQK-${reached}.\n`)
  );

  if (next) {
    console.log(`  ${c.bold(`Чтобы достичь AQK-${next.level}:`)} ${next.need}`);
    console.log(c.dim(`  Что это даст: ${next.gives}\n`));
  } else {
    console.log(c.green("  Все ступени пройдены.\n"));
  }

  // Код возврата — для конвейера. Порог задаётся так: aqk doctor --min 1
  const minIdx = process.argv.indexOf("--min");
  const min = minIdx > -1 ? Number(process.argv[minIdx + 1]) : null;
  if (min !== null) {
    const pass = reached >= min;
    console.log(
      pass
        ? c.green(`  Порог AQK-${min} пройден.\n`)
        : c.red(`  Порог AQK-${min} НЕ пройден: сейчас AQK-${reached < 0 ? "нет" : reached}.\n`)
    );
    process.exit(pass ? 0 : 1);
  }
  process.exit(missing || reached < 0 ? 1 : 0);
}

// --- note -------------------------------------------------------------------

function findJournal() {
  const fromEnv = process.env.AQK_HOME;
  const candidates = [
    fromEnv,
    join(process.env.HOME || "", "projects", "aqk"),
    join(process.env.HOME || "", "aqk"),
  ].filter(Boolean);
  for (const p of candidates) {
    const r = spawnSync("git", ["-C", p, "rev-parse", "--git-dir"], { stdio: "ignore" });
    if (r.status === 0) return p;
  }
  return null;
}

async function cmdNote(args) {
  const title = args.find((a) => !a.startsWith("--"));
  if (!title) die('Нужен заголовок: aqk note "что произошло"');

  const home = findJournal();
  if (!home) {
    die(`Клон журнала не найден.
Сделай один раз:
  git clone https://github.com/arsen-ask-lx/Agent_Quality_Kit.git ~/projects/aqk
или укажи путь: export AQK_HOME=/путь/к/aqk`);
  }

  const journal = join(home, "lessons", "README.md");
  if (!(await exists(journal))) die(`Журнал не найден: ${journal}`);

  let body = "";
  if (!process.stdin.isTTY) {
    body = await new Promise((res) => {
      let buf = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (d) => (buf += d));
      process.stdin.on("end", () => res(buf));
    });
  }

  if (!body.trim()) {
    die(`Тело записи пустое. Передай его на стандартный ввод, например:

  aqk note "заголовок" <<'EOF'
  **Класс:** гейт молчал
  **Что случилось.** ...
  **Чем это стоило.** ...
  **Вывод.** 🔧 ...
  EOF`);
  }

  // ГЕЙТ. Урок без вывода — это история, а не урок: в следующий раз обожжёмся так же.
  if (!/Вывод/i.test(body)) {
    die("В записи нет раздела «Вывод». Урок без вывода — это история, а не урок.");
  }

  const date = new Date().toISOString().slice(0, 10);
  const project = CWD.split("/").filter(Boolean).pop() || "неизвестно";
  const entry = `\n## ${date} — ${title}\n\n**Проект:** ${project}\n\n${body.trim()}\n`;

  const prev = await readFile(journal, "utf8");
  await writeFile(journal, prev + entry, "utf8");

  const run = (...a) => spawnSync("git", ["-C", home, ...a], { stdio: "inherit" });
  run("add", "lessons/README.md");
  run("commit", "-q", "-m", `lesson(${project}): ${title}`);
  const pushed = run("push", "-q");
  console.log(
    pushed.status === 0
      ? c.green(`Записано и отправлено: ${title}`)
      : c.yellow(`Записано локально, push не прошёл. Отправить: git -C ${home} push`)
  );
}

// --- разбор аргументов ------------------------------------------------------

const [, , cmd, ...rest] = process.argv;
switch (cmd) {
  case "init":
    await cmdInit(rest);
    break;
  case "doctor":
    await cmdDoctor();
    break;
  case "note":
    await cmdNote(rest);
    break;
  default:
    console.log(`
${c.bold("aqk")} — оснастка для разработки с агентами

  ${c.bold("aqk init")}            разложить правила и методички в текущий проект
  ${c.bold("aqk init --force")}    перезаписать уже существующие файлы
  ${c.bold("aqk doctor")}          проверить, что разложено и чего не хватает
  ${c.bold("aqk note")} "…"        записать урок в общий журнал шишек

${c.dim("Без установки:  npx github:arsen-ask-lx/Agent_Quality_Kit init")}
`);
    process.exit(cmd ? 1 : 0);
}
