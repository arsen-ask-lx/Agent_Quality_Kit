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
import { constants, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, relative } from "node:path";
import { spawnSync } from "node:child_process";

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(HERE, "..");   // корень комплекта: tool/ лежит в нём
const CWD = process.cwd();

const DOCS_SRC = join(PKG_ROOT, "kit", "docs");
const RULES_SRC = join(PKG_ROOT, "kit", "rules");
const TARGET_DIR = ".aqk";

const c = {
  bold: (s) => `[1m${s}[0m`,
  dim: (s) => `[2m${s}[0m`,
  green: (s) => `[32m${s}[0m`,
  yellow: (s) => `[33m${s}[0m`,
  red: (s) => `[31m${s}[0m`,
};

const exists = async (p) => access(p, constants.F_OK).then(() => true, () => false);

// Как звать программу — зависит от того, как её запустили. Через npx команды `aqk` в системе
// нет: подсказка «aqk doctor» отправляет человека в «команда не найдена» на первом же шаге.
// Печатаем то, что можно скопировать и выполнить прямо сейчас.
const REPO = "github:arsen-ask-lx/Agent_Quality_Kit";

function selfCmd() {
  const p = process.argv[1] || "";
  if (/[\\/]_npx[\\/]/.test(p)) return `npx ${REPO}`;
  if (/[\\/]node_modules[\\/]\.bin[\\/]/.test(p) || /[\\/]aqk$/.test(p)) return "aqk";
  const rel = relative(CWD, p);
  return `node ${rel && !rel.startsWith("..") ? rel : p}`;
}

const SELF = selfCmd();

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

## Оснастка AQK — это твои команды, а не человека

В репозитории стоит комплект AQK. Его смысл: **обещание проекта превращается в команду с кодом
возврата**, и дальше его держит машина, а не чья-то внимательность. «Не оставляем отладочную
печать» — текст, который можно проигнорировать; команда, возвращающая не ноль, — нельзя.

Запускать их — твоя работа. Человек смотрит на список дыр и решает, какие закрывать.

| Команда | Что делает | Когда звать |
|---|---|---|
| \`aqk doctor\` | смотрит репозиторий и печатает три списка: что уже держит машина, чего не хватает, что этому проекту не нужно и почему | начало работы над качеством; «что тут вообще есть» |
| \`aqk doctor --run\` | **запускает** объявленные проверки и показывает, кто нашёл брак | перед сдачей; после правок; всегда, когда нужен факт, а не обещание |
| \`aqk add <имя>\` | ставит проверку из каталога: копирует её и образцы в проект, объявляет в манифесте | человек согласился закрыть дыру из списка \`doctor\` |
| \`aqk ratchet <имя>\` | старые нарушения записывает долгом, новые перестаёт пускать | проверка краснеет на старом коде, и чинить его сейчас никто не будет |
| \`aqk find "…"\` | ищет по смыслу, есть ли уже такая проверка | прежде чем изобретать свою |
| \`aqk note "…"\` | пишет урок в общий журнал | процесс или прибор подвели: проверка соврала, правило обошли |

Если команды \`aqk\` нет в системе — комплект ставили разово, без установки. Тогда вместо
\`aqk\` пиши \`npx github:arsen-ask-lx/Agent_Quality_Kit\`. Любая команда сама печатает тот
вызов, который сработает у тебя.

**Три вещи, которые надо понимать, а не запоминать:**

1. **«Объявлен» и «работает» — разные утверждения.** \`doctor\` без \`--run\` честно говорит, что
   проверки не запускал. Не выдавай объявленное за работающее.
2. **Проверка без двух образцов ничего не доказывает.** Красный — код, на котором она обязана
   сработать; зелёный — правильный, на котором обязана молчать. Зелёный важнее: без него однажды
   она покраснеет на верном коде, и её выключат вместе с остальными.
3. **Правило вводится храповиком, а не большой чисткой.** Чистка откладывается навсегда, потому
   что она большая. Храповик даёт действующее правило со дня установки.

**Повторился дефект того же класса — это не повод быть внимательнее, а повод завести проверку.**
Дисциплина не масштабируется, механика — да.

## Где что лежит

- \`.aqk/rules/\` — стандарты: общие, тесты, безопасность
- \`.aqk/docs/\` — методички: минимум проекта, харнес, процесс, исследования
- \`.aqk/docs/project-baseline.md\` — **начни отсюда**, если проект новый

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

  if (!(await exists(DOCS_SRC))) {
    die(`Не найден корпус методичек: ${DOCS_SRC}\nПохоже, пакет установлен не полностью.`);
  }

  const refs = await copyDir(DOCS_SRC, join(CWD, TARGET_DIR, "docs"), { force });
  for (const f of refs) created.push(relative(CWD, f));

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
    console.log(c.dim(`  перезаписать: ${SELF} init --force`));
  }

  // Путь ищем, а не пишем: раскладка внутри .aqk — дело владельца комплекта, и жёстко
  // вписанный путь однажды отправит человека в несуществующий файл. Уже отправлял.
  let baseline = join(TARGET_DIR, "docs", "project-baseline.md");
  for (const f of created) if (f.endsWith("project-baseline.md")) baseline = f;

  console.log(`
${c.bold("Что дальше — по порядку:")}

  1. Открой ${c.bold("AGENTS.md")} и заполни раздел «Команды». Команда, которую нельзя
     скопировать и выполнить, — не команда, а пожелание.
  2. Прочитай ${c.bold(baseline)} — это обязательный минимум
     проекта без привязки к языку. Пройди сверху вниз и отметь, чего нет.
  3. Заполни ${c.bold(".aqk.yml")} — гейты, образцы, журнал. Уровень соответствия AQK
     считается по нему: ${c.bold(`${SELF} doctor`)}.
  4. Поднимайся по ступеням ${c.bold("по одной")}. Гейт стережёт существующий артефакт:
     проверка на код, которого ещё нет, — мёртвое правило.

${c.dim(`Обжёгся на чём-то — запиши: ${SELF} note "что случилось"`)}
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

// --- каталог обещаний -------------------------------------------------------
// Каталог лежит в комплекте, а не в проекте: записи общие для всех, проект лишь
// решает, какие из них у него стоят. Показывать все подряд нельзя — это и есть
// разница между каталогом и списком: у каждой записи обязателен триггер, и до
// глаз человека доходит только применимое к его репозиторию.

const GATES_SRC = join(PKG_ROOT, "kit", "gates");

// Расширения перечислены полностью, включая модульные варианты: .mjs пропускался, и на самом
// aqk — где вся программа лежит в .mjs — запись про отладочную печать пряталась с пояснением
// «нет языков: javascript». Гейт, спрятанный по неверно опознанному языку, молчит так же, как
// отсутствующий.
const EXT_LANG = {
  ".py": "python", ".js": "javascript", ".jsx": "javascript",
  ".mjs": "javascript", ".cjs": "javascript",
  ".ts": "typescript", ".tsx": "typescript", ".mts": "typescript", ".cts": "typescript",
  ".go": "go", ".rs": "rust", ".rb": "ruby", ".java": "java", ".php": "php",
  ".cs": "csharp", ".sh": "shell", ".kt": "kotlin", ".swift": "swift", ".scala": "scala",
};

const SKIP_DIRS = new Set([".git", "node_modules", ".venv", "venv", "dist", "build", "__pycache__", ".aqk"]);

// Факты о репозитории. Только то, что видно машине: спрашивать человека анкетой
// значит снова получить мнение вместо факта.
// Признаки репозитория — по файлам, а не по анкете. Ответы человека это мнение;
// файлы — факт. Каждый признак нужен какому-то триггеру: признак, который никто не
// спрашивает, — это лишний обход дерева.
const MARKS = [
  ["has_ci", [".github/workflows", ".gitlab-ci.yml", ".circleci", "Jenkinsfile", "azure-pipelines.yml"]],
  ["has_docker", ["Dockerfile", "compose.yml", "compose.yaml", "docker-compose.yml", "docker-compose.yaml"]],
  ["has_deps", ["package.json", "pyproject.toml", "requirements.txt", "go.mod", "Cargo.toml", "Gemfile", "pom.xml", "composer.json"]],
  ["has_env", [".env", ".env.example", ".env.sample"]],
];

async function detectFacts(man) {
  const langs = new Set();
  let files = 0;
  let hasDb = false;
  let hasTests = false;

  async function walk(dir, depth) {
    if (depth > 4 || files > 4000) return;
    let items;
    try {
      items = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const it of items) {
      const full = join(dir, it.name);
      if (it.isDirectory()) {
        if (SKIP_DIRS.has(it.name)) continue;
        // Образцы каталога — код специально сломанный и специально исправный.
        // Считать его языками проекта значит врать о репозитории.
        if (full === GATES_SRC) continue;
        if (/^(tests?|spec|__tests__)$/i.test(it.name)) hasTests = true;
        if (/^migrations?$/i.test(it.name)) hasDb = true;
        await walk(full, depth + 1);
      } else {
        files++;
        if (/\.(test|spec)\.[a-z]+$/i.test(it.name) || /^test_.*\.py$/i.test(it.name)) hasTests = true;
        if (it.name.endsWith(".sql")) hasDb = true;
        const dot = it.name.lastIndexOf(".");
        if (dot > 0) {
          const lang = EXT_LANG[it.name.slice(dot)];
          if (lang) langs.add(lang);
        }
      }
    }
  }
  await walk(CWD, 0);

  const gates = man?.gates && typeof man.gates === "object" && !Array.isArray(man.gates) ? man.gates : {};
  const facts = {
    langs,
    files,
    has_db: hasDb,
    has_tests: hasTests,
    has_gates: Object.values(gates).some((c) => String(c || "").trim()),
    gateKeys: Object.keys(gates),
  };
  for (const [name, paths] of MARKS) {
    facts[name] = false;
    for (const rel of paths) if (await exists(join(CWD, rel))) { facts[name] = true; break; }
  }
  return facts;
}

async function readCatalog() {
  if (!(await exists(GATES_SRC))) return [];
  const out = [];
  for (const name of (await readdir(GATES_SRC, { withFileTypes: true })).filter((d) => d.isDirectory())) {
    const yml = join(GATES_SRC, name.name, "gate.yml");
    if (!(await exists(yml))) continue;
    const rec = parseManifest(await readFile(yml, "utf8"));
    out.push({ slug: name.name, ...rec });
  }
  return out.sort((a, b) => a.slug.localeCompare(b.slug));
}

// Применима ли запись к этому репозиторию — и если нет, то почему.
// Причина обязательна: «скрыто без объяснения» неотличимо от «потеряно».
// Все условия триггера должны выполниться разом. Раньше проверялось первое попавшееся —
// значит «есть база И нет конвейера» читалось как «есть база», и запись показывалась не тем.
//
// Причина отказа обязательна: скрытое без объяснения неотличимо от потерянного.
const CONDITIONS = {
  always: () => ({ ok: true }),

  langs: (val, f) => {
    const want = String(val).split(",").map((x) => x.trim()).filter(Boolean);
    return want.some((l) => f.langs.has(l))
      ? { ok: true }
      : { ok: false, why: `нет языков: ${want.join(", ")}` };
  },

  files_gt: (val, f) =>
    f.files > Number(val) ? { ok: true } : { ok: false, why: `меньше ${val} файлов — рано` },

  files_lt: (val, f) =>
    f.files < Number(val) ? { ok: true } : { ok: false, why: `больше ${val} файлов` },
};

const FLAG_WHY = {
  has_gates: ["в манифесте не объявлено ни одного гейта", "гейты уже объявлены"],
  has_ci: ["в репозитории нет конвейера", "конвейер уже есть"],
  has_db: ["не видно базы данных: ни миграций, ни sql", "база данных есть"],
  has_docker: ["нет Dockerfile или compose", "docker уже есть"],
  has_deps: ["не видно файла зависимостей", "зависимости объявлены"],
  has_tests: ["не видно тестов", "тесты есть"],
  has_env: ["нет файла окружения", "файл окружения есть"],
};

function triggerVerdict(rec, facts) {
  const t = rec.trigger && typeof rec.trigger === "object" && !Array.isArray(rec.trigger) ? rec.trigger : {};
  const keys = Object.keys(t);
  if (!keys.length) return { applies: false, why: "триггер не задан" };

  for (const key of keys) {
    const raw = String(t[key]).trim();

    if (CONDITIONS[key]) {
      if (key === "always" && raw !== "true") continue;
      const r = CONDITIONS[key](raw, facts);
      if (!r.ok) return { applies: false, why: r.why };
      continue;
    }

    if (key in FLAG_WHY) {
      const want = raw === "true";
      if (Boolean(facts[key]) !== want) {
        return { applies: false, why: FLAG_WHY[key][want ? 0 : 1] };
      }
      continue;
    }

    return { applies: false, why: `условие «${key}» программа не умеет считать` };
  }
  return { applies: true };
}

// Арбитр под стек этого проекта: сначала родной рецепт, иначе — переносимый `any`.
// Подсказка, которую нельзя скопировать и выполнить, бесполезна.
// Выбор рецепта под стек проекта. Одна логика на два места: и `doctor`, и `add` показывают
// команду, но подставляют в неё разные пути — один в каталог пакета, другой в каталог проекта.
// Пока это были две копии, правка доезжала до одной из них — нашёл собственный гейт дублей.
function pickRecipe(rec, facts) {
  const recipes = rec.recipes && typeof rec.recipes === "object" ? rec.recipes : {};

  // Родной рецепт лучше переносимого — но только если его есть чем выполнить. Поставить
  // команду с неустановленной программой значит завести гейт, который встаёт с «not found»:
  // отсутствие сигнала неотличимо от успеха.
  const runnable = (c0) => {
    const prog = String(c0).trim().split(/\s+/)[0];
    return spawnSync(`command -v ${prog}`, { shell: true, stdio: "ignore" }).status === 0;
  };
  for (const lang of facts.langs) {
    if (!recipes[lang]) continue;
    if (runnable(recipes[lang])) return recipes[lang];
    console.log(c.dim(`  ${c.yellow("!")}  рецепт под ${lang} пропущен: «${String(recipes[lang]).split(/\s+/)[0]}» не установлен`));
  }
  return recipes.any || null;
}

function recipeFor(rec, facts) {
  const cmd = pickRecipe(rec, facts);
  if (!cmd) return "рецепт не описан";
  return String(cmd)
    .replace(/\{gate\}/g, join(GATES_SRC, rec.slug))
    .replace(/\{dir\}/g, ".");
}

async function reportCatalog(man, facts) {
  const catalog = await readCatalog();
  if (!catalog.length) return;

  const held = [], todo = [], skip = [];
  for (const rec of catalog) {
    const v = triggerVerdict(rec, facts);
    if (!v.applies) skip.push([rec, v.why]);
    else if (facts.gateKeys.includes(rec.slug)) held.push(rec);
    else todo.push(rec);
  }

  console.log(c.bold(`\n  Гейты\n`));
  const marks = ["has_ci", "has_db", "has_docker", "has_tests", "has_deps"]
    .filter((k) => facts[k])
    .map((k) => k.replace("has_", ""));
  console.log(
    c.dim(`  языки: ${[...facts.langs].join(", ") || "не определены"} · файлов: ${facts.files}` +
      (marks.length ? ` · есть: ${marks.join(", ")}` : "") + "\n")
  );

  for (const rec of held) console.log(`  ${c.green("✔")}  ${rec.slug.padEnd(22)} ${c.dim(rec.intent || "")}`);
  for (const rec of todo) {
    console.log(`  ${c.yellow("✘")}  ${rec.slug.padEnd(22)} ${rec.intent || ""}`);
    console.log(c.dim(`      поставить: ${SELF} add ${rec.slug}`));
  }
  if (skip.length) {
    console.log(c.dim(`\n  Не применимо к этому репозиторию (${skip.length}):`));
    for (const [rec, why] of skip) console.log(c.dim(`  ·  ${rec.slug.padEnd(22)} ${why}`));
  }
  console.log(
    `\n  ${c.bold("Итого:")} держит машина ${held.length}, применимо но не поставлено ${c.yellow(todo.length)}, ` +
      c.dim(`скрыто ${skip.length}`) + "\n"
  );
}

// --- прогон объявленных гейтов ----------------------------------------------
// «Гейт объявлен» и «гейт работает» — разные утверждения. Первое читается из манифеста,
// второе узнаётся только запуском. Пока doctor верил манифесту на слово, уровень означал
// добросовестность автора, а не факт — ровно то, от чего мы защищаемся.
//
// Запуск чужих команд — по явной просьбе (--run), а не втихую: гейт бывает долгим и с
// побочными действиями. Без флага doctor честно говорит, что не проверял.

function declaredGates(man) {
  const g = man?.gates && typeof man.gates === "object" && !Array.isArray(man.gates) ? man.gates : {};
  return Object.entries(g)
    .map(([name, cmd]) => [name, String(cmd || "").trim()])
    .filter(([, cmd]) => cmd);
}

function runGates(man) {
  const gates = declaredGates(man);
  if (!gates.length) return { failed: 0, ran: 0 };

  console.log(c.bold("\n  Прогон объявленных гейтов\n"));
  let failed = 0;

  for (const [name, cmd] of gates) {
    const t0 = Date.now();
    const r = spawnSync(cmd, { shell: true, cwd: CWD, encoding: "utf8", timeout: 300000 });
    const secs = (Math.max(0, Date.now() - t0) / 1000).toFixed(1);

    if (r.error && r.error.code === "ETIMEDOUT") {
      console.log(`  ${c.red("✘")}  ${name.padEnd(14)} ${c.red("не уложился в 5 минут")}`);
      failed++;
      continue;
    }
    const code = r.status;
    if (code === 0) {
      console.log(`  ${c.green("✔")}  ${name.padEnd(14)} ${c.dim(`${secs}s · ${cmd}`)}`);
    } else {
      failed++;
      const out = `${r.stdout || ""}${r.stderr || ""}`.trim().split("\n").filter(Boolean);
      console.log(`  ${c.red("✘")}  ${name.padEnd(14)} ${c.red(`код ${code}`)} ${c.dim(`· ${secs}s · ${cmd}`)}`);
      for (const line of out.slice(0, 3)) console.log(c.dim(`        ${line.slice(0, 100)}`));
      if (out.length > 3) console.log(c.dim(`        … и ещё ${out.length - 3} строк`));
    }
  }
  return { failed, ran: gates.length };
}

// --- doctor -----------------------------------------------------------------

async function cmdDoctor() {
  console.log(c.bold("\naqk doctor\n"));

  // В самом комплекте разложенной копии `.aqk/` нет и быть не должно: здесь лежат оригиналы,
  // а копия завтра разошлась бы с ними. Без этого различия `doctor` краснел на собственном
  // репозитории и требовал разложить комплект в комплект.
  const inKit = resolve(CWD) === resolve(PKG_ROOT);
  const checks = [
    inKit ? ["kit/docs", "методички — здесь оригиналы, а не копия"] : [".aqk/docs", "методички"],
    inKit ? ["kit/rules", "стандарты — здесь оригиналы, а не копия"] : [".aqk/rules", "стандарты"],
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
  // «Уровень не достигнут» на зрелом проекте читается как приговор проекту, а он им не
  // является: уровень мерит машиночитаемость практики, а не саму практику. Проект с сотней
  // работающих проверок и без манифеста стоит на нуле — и это сообщение обязано это объяснить,
  // иначе человек услышит «у тебя плохо» и закроет.
  if (reached < 0 && !man) {
    console.log(c.yellow("\n  Уровень: стандарт в этом репозитории не заведён.\n"));
    console.log(
      c.dim("  Это не оценка проекта. Уровень мерит не зрелость практики, а то, можно ли\n") +
      c.dim("  прочитать её машиной. Проверки могут стоять и работать — но пока они не\n") +
      c.dim("  объявлены в .aqk.yml, ни агент, ни конвейер, ни новый человек о них не знают.\n")
    );
  } else {
    console.log(
      reached < 0
        ? c.yellow(`\n  Уровень: манифест есть, но AQK-0 не пройден.\n`)
        : c.green(`\n  Уровень: AQK-${reached}.\n`)
    );
  }

  if (next) {
    console.log(`  ${c.bold(`Чтобы достичь AQK-${next.level}:`)} ${next.need}`);
    console.log(c.dim(`  Что это даст: ${next.gives}\n`));
  } else {
    console.log(c.green("  Все ступени пройдены.\n"));
  }

  const facts = await detectFacts(man);
  await reportCatalog(man, facts);

  // «Объявлен» ≠ «работает». Без --run говорим это вслух, а не молчим.
  const wantRun = process.argv.includes("--run");
  const gates = declaredGates(man);
  let gateFailed = 0;
  if (wantRun) {
    gateFailed = runGates(man).failed;
  } else if (gates.length) {
    console.log(
      c.yellow(`  ${gates.length} гейтов объявлено, но не запускалось.`) +
        c.dim(` «Объявлен» и «работает» — разные утверждения: ${SELF} doctor --run\n`)
    );
  }

  // Код возврата — для конвейера. Порог задаётся так: aqk doctor --min 1
  const minIdx = process.argv.indexOf("--min");
  const min = minIdx > -1 ? Number(process.argv[minIdx + 1]) : null;
  if (min !== null) {
    const pass = reached >= min && gateFailed === 0;
    console.log(
      pass
        ? c.green(`  Порог AQK-${min} пройден.\n`)
        : c.red(`  Порог AQK-${min} НЕ пройден: сейчас AQK-${reached < 0 ? "нет" : reached}.\n`)
    );
    process.exit(pass ? 0 : 1);
  }
  process.exit(missing || reached < 0 || gateFailed ? 1 : 0);
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
  if (!title) die(`Нужен заголовок: ${SELF} note "что произошло"`);

  const home = findJournal();
  if (!home) {
    die(`Клон журнала не найден.
Сделай один раз:
  git clone https://github.com/arsen-ask-lx/Agent_Quality_Kit.git ~/projects/aqk
или укажи путь: export AQK_HOME=/путь/к/aqk`);
  }

  const journal = join(home, "incidents", "README.md");
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
  run("add", "incidents/README.md");
  run("commit", "-q", "-m", `lesson(${project}): ${title}`);
  const pushed = run("push", "-q");
  console.log(
    pushed.status === 0
      ? c.green(`Записано и отправлено: ${title}`)
      : c.yellow(`Записано локально, push не прошёл. Отправить: git -C ${home} push`)
  );
}

// --- add ---------------------------------------------------------------------
// Ставит гейт из каталога в проект. Проверка КОПИРУЕТСЯ в репозиторий, а не остаётся
// ссылкой в пакет: при установке через npx пакет временный, и завтра команда в манифесте
// указывала бы в никуда — тот самый класс «гейт объявлен, но не запускается».

const PROJECT_GATES = "gates";

// Вписать гейт в манифест, не тронув комментарии: правим текст, а не пересобираем YAML.
function manifestWithGate(text, slug, cmd) {
  const lines = text.split("\n");
  const entry = `  ${slug}: "${cmd}"`;

  const gi = lines.findIndex((l) => /^gates:\s*$/.test(l));
  if (gi === -1) return { text: null, why: "в .aqk.yml нет блока gates:" };
  if (lines.some((l) => new RegExp(`^\\s+${slug}:`).test(l))) return { text: null, why: "уже объявлен" };

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

async function cmdAdd(args) {
  const slug = args.find((a) => !a.startsWith("-"));
  if (!slug) die(`Укажи имя гейта: ${SELF} add <имя>. Список — ${SELF} doctor`);

  const src = join(GATES_SRC, slug);
  if (!(await exists(src))) die(`Нет такого гейта: ${slug}\nСписок применимых — ${SELF} doctor`);

  const man = await readManifest();
  if (!man) die(`Нет .aqk.yml — сначала ${SELF} init`);

  const rec = { slug, ...parseManifest(await readFile(join(src, "gate.yml"), "utf8")) };
  const facts = await detectFacts(man);
  const verdict = triggerVerdict(rec, facts);
  if (!verdict.applies) {
    console.log(c.yellow(`\n  Этот гейт к репозиторию не применим: ${verdict.why}`));
    console.log(c.dim("  Ставлю всё равно — решение твоё, но сторожить ему нечего.\n"));
  }

  const dst = join(CWD, PROJECT_GATES, slug);
  await mkdir(dst, { recursive: true });
  const copied = await copyDir(src, dst, { force: false });

  // Общий список исключений едет вместе с проверкой: без него она читает окружение и
  // зависимости, и человек получает тысячу чужих нарушений вместо сотни своих.
  const skipSrc = join(GATES_SRC, "_skip.sh");
  if (await exists(skipSrc)) await copyFile(skipSrc, join(CWD, PROJECT_GATES, "_skip.sh"));

  // Команда под стек проекта, с путями внутри репозитория, а не внутри пакета.
  const cmd = String(pickRecipe(rec, facts) || "")
    .replace(/\{gate\}/g, `${PROJECT_GATES}/${slug}`)
    .replace(/\{dir\}/g, ".");
  if (!cmd) die(`У записи ${slug} нет команды ни под ${[...facts.langs].join("/") || "этот стек"}, ни общей.`);

  const manPath = join(CWD, MANIFEST);
  const { text, why } = manifestWithGate(await readFile(manPath, "utf8"), slug, cmd);

  console.log(c.bold(`\naqk add ${slug}\n`));
  console.log(`  ${c.green("✔")}  ${PROJECT_GATES}/${slug}/  ${c.dim(`${copied.length} файлов: проверка и образцы`)}`);
  if (text) {
    await writeFile(manPath, text, "utf8");
    console.log(`  ${c.green("✔")}  .aqk.yml       ${c.dim(`гейт объявлен: ${cmd}`)}`);
  } else {
    console.log(`  ${c.yellow("!")}  .aqk.yml       ${c.dim(`не тронут (${why}). Впиши сам: ${slug}: "${cmd}"`)}`);
  }

  console.log(`
${c.bold("Дальше:")}

  1. Проверь, что он краснеет и молчит там, где должен:
     ${c.bold(`${cmd.replace(/ \.$/, ` ${PROJECT_GATES}/${slug}/red`)}`)}   ${c.dim("→ ожидается отказ")}
     ${c.bold(`${cmd.replace(/ \.$/, ` ${PROJECT_GATES}/${slug}/green`)}`)} ${c.dim("→ ожидается тишина")}
  2. Впиши команду в хук коммита и в конвейер. ${c.dim("Гейт, который никто не запускает, — не гейт.")}
  3. Прогон всех объявленных: ${c.bold(`${SELF} doctor --run`)}
`);
}

// --- new ---------------------------------------------------------------------
// Заготовка записи каталога. Поля намеренно оставлены незаполненными и в таком виде
// НЕ ПРОХОДЯТ проверку: пустая заготовка, принятая как запись, — это тот же мёртвый гейт.
// Сначала сверка по намерению: чаще всего нужного гейта не хватает не в каталоге, а в проекте.

const GATE_YML_TEMPLATE = (slug) => `# Запись каталога AQK. Норма и все поля — kit/gates/README.md
# Пока строки ниже не заполнены, проверка отклонит эту запись — так и задумано.

# Одной фразой: какой класс брака ловит. По этому полю идёт сверка «есть ли уже такое».
intent: ЗАПОЛНИ — какой класс брака ловит

# Когда запись показывается человеку. Условие обязано быть запросом к репозиторию,
# который умеет вычислить программа: always | langs: python, go | has_gates: true
trigger:
  always: true

# Команда-арбитр под каждый стек. {gate} — папка записи, {dir} — что проверяем.
# any — переносимая команда без сторонних программ.
recipes:
  any: bash {gate}/check.sh {dir}

# Реальный отказ, который эта проверка поймала. «Хорошая практика» не принимается:
# ссылайся на запись журнала — incidents/README.md
proof: ЗАПОЛНИ — какой отказ поймала и чего он стоил
`;

const CHECK_SH_TEMPLATE = `#!/usr/bin/env sh
# Проверка. Возвращает 0 — чисто, не 0 — брак. В тексте отказа должно быть НАПИСАНО,
# что сделать: он попадает прямо в контекст агента, и с инструкцией он чинит сам.
DIR="\${1:-.}"

# Служебные каталоги и красные образцы не проверяем — см. kit/gates/README.md
SKIP="--exclude-dir=.aqk --exclude-dir=.git --exclude-dir=node_modules"
EXCL=""
case "$(basename "$DIR")" in red) ;; *) EXCL="--exclude-dir=red" ;; esac

HITS=$(grep -rnE $SKIP $EXCL 'ЗАПОЛНИ_ШАБЛОН_ПОИСКА' "$DIR" 2>/dev/null)
if [ -n "$HITS" ]; then
  echo "$HITS"
  echo "  почини: ЗАПОЛНИ — что именно сделать"
  exit 1
fi
exit 0
`;

const README_TEMPLATE = (slug) => `# ЗАПОЛНИ — заголовок одной строкой

**Намерение.** Что и почему не должно попадать в код.

**Какой отказ это поймало.** Что сломалось, в каком проекте, чего это стоило. Без этого
запись не принимается: «это хорошая практика» набирает сотни пунктов, среди которых нельзя
выбрать.

**Почему машина, а не внимательность.** В какой момент человек это пропускает.

**Готовый аналог.** Есть ли такая проверка в ruff, eslint, semgrep? Если есть — рецепт под этот
язык обязан брать её, а своя проверка остаётся запасной. Если нет — написать, что именно
проверено: «не искал» и «нет» — разные утверждения.

**Чего НЕ ловит.** Честно назвать границу. Гейт, о пределах которого умалчивают, опаснее
отсутствующего: на него понадеются.

**Образцы.** \`red/\` — что здесь нарушено. \`green/\` — то же самое, но правильно.
`;

async function cmdNew(args) {
  const slug = args.find((a) => !a.startsWith("-"));
  if (!slug) die(`Укажи имя: ${SELF} new no-print-in-prod`);
  if (!/^[a-z][a-z0-9-]{2,}$/.test(slug)) {
    die(`Имя «${slug}» не годится: латиница через дефис, например secrets-not-in-code.\nИмя читают в чужих проектах — оно часть словаря.`);
  }

  // Сначала сверка: новая запись нужна реже, чем кажется.
  const q = stems(slug.replace(/-/g, " ") + " " + args.filter((a) => !a.startsWith("-")).slice(1).join(" "));
  for (const rec of await readCatalog()) {
    const head = stems(`${rec.slug.replace(/-/g, " ")} ${rec.intent || ""}`);
    let hits = 0;
    for (const w of q) if (head.has(w)) hits++;
    if (hits >= 2 && overlap(q, head) >= 0.5 && !args.includes("--force")) {
      console.log(c.yellow(`\n  Похоже, такое уже есть: ${c.bold(rec.slug)}`));
      console.log(`  ${rec.intent || ""}\n`);
      console.log(c.dim("  Рецепт под другой стек — это строка в recipes существующей записи."));
      console.log(c.dim(`  Всё равно завести новую: ${SELF} new ${slug} --force\n`));
      process.exit(1);
    }
  }

  // Где заводить заготовку. Проверка «существует ли каталог комплекта» была неверной: он
  // существует всегда — это каталог самого пакета. Из чужого проекта заготовка уезжала внутрь
  // пакета, а через npx пакет лежит во временной папке и исчезает вместе с ней: работа сделана,
  // результата нет. Признак один — работаем ли мы над самим комплектом.
  const inKit = resolve(CWD) === resolve(PKG_ROOT);
  const dst = inKit ? join(GATES_SRC, slug) : join(CWD, PROJECT_GATES, slug);
  if (await exists(dst)) die(`${relative(CWD, dst)} уже существует.`);

  await mkdir(join(dst, "red"), { recursive: true });
  await mkdir(join(dst, "green"), { recursive: true });
  await writeFile(join(dst, "gate.yml"), GATE_YML_TEMPLATE(slug), "utf8");
  await writeFile(join(dst, "check.sh"), CHECK_SH_TEMPLATE, "utf8");
  await writeFile(join(dst, "README.md"), README_TEMPLATE(slug), "utf8");
  await writeFile(join(dst, "red", ".keep"), "", "utf8");
  await writeFile(join(dst, "green", ".keep"), "", "utf8");

  console.log(c.bold(`\naqk new ${slug}\n`));
  console.log(`  ${c.green("✔")}  ${relative(CWD, dst)}/  ${c.dim("gate.yml · check.sh · red/ · green/ · README.md")}`);
  console.log(`
${c.bold("Дальше — по порядку:")}

  1. ${c.bold("Проверь, нет ли готового правила")} в ruff, eslint, semgrep.
     ${c.dim("Готовое точнее, подробнее и его поддерживают без тебя. Своя проверка — запасная.")}
  2. ${c.bold("Положи образцы.")} В ${c.bold("red/")} — код, на котором проверка обязана сработать.
     В ${c.bold("green/")} — тот же код, но правильный.
     ${c.dim("Зелёный важнее: он ловит проверку, которая краснеет на исправном коде.")}
  3. ${c.bold("Напиши проверку")} в check.sh. В тексте отказа — что именно сделать.
  4. ${c.bold("Заполни gate.yml:")} намерение, триггер, доказательство отказом.
  5. ${c.bold("Прогони:")} bash tool/selfcheck/gates.sh
     ${c.dim("Арбитр обязан покраснеть на red/ и промолчать на green/. Не прошло — не запись.")}
`);
}

// --- ratchet -----------------------------------------------------------------
// Ставит храповик поверх уже объявленного гейта: снимает список текущих нарушений в реестр
// и заворачивает команду в обёртку, которая пускает старое и не пускает новое.
//
// Без этого правило нельзя ввести в живой проект: гейт покраснеет на всём старом коде,
// его выключат, и правило не будет действовать вовсе.

const RATCHET_DIR = "ratchets";
// Обёртка лежит рядом с реестрами, которые она читает, а не среди гейтов: храповик — это
// обёртка плюс реестр, и разносить их по разным каталогам значит прятать половину механизма.
const RATCHET_LIB = `${RATCHET_DIR}/_ratchet.sh`;

async function cmdRatchet(args) {
  const slug = args.find((a) => !a.startsWith("-"));
  if (!slug) die(`Укажи гейт: ${SELF} ratchet <имя>. Он должен быть уже объявлен в .aqk.yml`);

  const manPath = join(CWD, MANIFEST);
  if (!(await exists(manPath))) die(`Нет .aqk.yml — сначала ${SELF} init`);
  let text = await readFile(manPath, "utf8");

  const line = text.split("\n").find((l) => new RegExp(`^\\s+${slug}:`).test(l));
  if (!line) die(`Гейт «${slug}» не объявлен в .aqk.yml. Сначала: ${SELF} add ${slug}`);

  const cmd = line.replace(/^\s*[^:]+:\s*/, "").replace(/^"|"$/g, "");
  const inKit = resolve(CWD) === resolve(PKG_ROOT);
  const lib = inKit ? "kit/ratchet/ratchet.sh" : RATCHET_LIB;

  // «Обёртка объявлена» и «долг снят» — разные состояния. Если реестра на диске нет, гейт
  // краснеет на всём подряд, а команда отказывалась помочь словами «храповик уже стоит».
  // Тогда снимаем снимок заново по внутренней команде, а строку манифеста не трогаем.
  const reg = join(CWD, RATCHET_DIR, `${slug}.txt`);
  const wrapped0 = cmd.includes("ratchet.sh");
  if (wrapped0 && (await exists(reg))) die(`На гейте «${slug}» храповик уже стоит.`);
  const prefix = `bash ${lib} ${RATCHET_DIR}/${slug}.txt `;
  const inner = wrapped0 && cmd.startsWith(prefix) ? cmd.slice(prefix.length) : cmd;

  // Обёртка копируется в репозиторий: ссылка на пакет завтра указывала бы в никуда. Исключение —
  // сам комплект: здесь оригинал уже лежит рядом, и копия завтра разошлась бы с ним. Ровно то
  // правило, по которому здесь не копируются и гейты.
  if (!inKit) {
    await mkdir(dirname(join(CWD, lib)), { recursive: true });
    await copyFile(join(PKG_ROOT, "kit", "ratchet", "ratchet.sh"), join(CWD, lib));
  }

  // Снимок текущих нарушений — это и есть долг. Ключ без номера строки: правка соседней
  // строки не должна читаться как новое нарушение.
  const r = spawnSync(inner, { shell: true, cwd: CWD, encoding: "utf8", timeout: 300000 });
  if (r.status === 127 || (r.error && r.error.code === "ENOENT")) {
    die(
      `Гейт «${slug}» не запускается: ${inner}\n` +
        `Снимать долг с несуществующего сторожа нельзя — в реестр попадут его же сообщения\n` +
        `об ошибке, и он станет разрешением. Сначала почини команду.`
    );
  }
  const keys = [...new Set(
    `${r.stdout || ""}${r.stderr || ""}`
      .split("\n")
      .filter((l) => l && !/^\s/.test(l) && l.includes(":"))
      .map((l) => l.replace(/:\d+:/, ":"))
  )].sort();

  await mkdir(join(CWD, RATCHET_DIR), { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  await writeFile(
    reg,
    `# Реестр долга: ${slug}\n` +
      `# Снят ${stamp}. Список разрешается ТОЛЬКО укорачивать.\n` +
      `# Новое нарушение красит гейт; исправленное вычёркивается автоматически.\n` +
      keys.join("\n") + (keys.length ? "\n" : ""),
    "utf8"
  );

  if (!wrapped0) {
    text = text.replace(line, `  ${slug}: "${prefix}${cmd}"`);
    text = text.replace(/^ratchets:\s*""\s*$/m, `ratchets: ${RATCHET_DIR}`);
    await writeFile(manPath, text, "utf8");
  }

  console.log(c.bold(`\naqk ratchet ${slug}\n`));
  console.log(`  ${c.green("✔")}  ${RATCHET_DIR}/${slug}.txt  ${c.dim(`${keys.length} нарушений записано долгом`)}`);
  if (!inKit) console.log(`  ${c.green("✔")}  ${lib}  ${c.dim("обёртка скопирована в проект")}`);
  console.log(`  ${c.green("✔")}  .aqk.yml  ${c.dim("команда завёрнута в храповик")}`);
  console.log(`
${c.bold("Что это меняет:")}

  Правило действует ${c.bold("со дня установки")}. Старый код трогать не надо, но новое
  нарушение того же класса гейт не пропустит.

  ${c.dim("Проверка, что это храповик, а не советчик: «может ли новый код добавить нарушение")}
  ${c.dim("и пройти?» Может — значит гейта нет.")}

  Прогнать: ${c.bold(`${SELF} doctor --run`)}
`);
}

// --- find --------------------------------------------------------------------
// «Есть ли у вас уже такое?» — вопрос, без которого обмен знанием превращается в свалку.
// Сверка идёт ПО НАМЕРЕНИЮ, а не по тексту команды: «печать не доезжает до прода» — одно
// намерение, а ruff, eslint и свой поиск — три исполнителя. Принёс рецепт под новый язык —
// это строка в существующей записи, а не новая запись.
//
// Сравниваем огрублённо: русский язык склоняется, и «печать / печати / печатью» обязаны
// совпасть. Берём начало слова — грубо, зато без словарей и без единой зависимости.

const STOP = new Set([
  "и","в","на","не","что","с","по","для","как","из","от","до","за","при","или","а","но","же",
  "это","то","так","бы","бы","ли","у","о","об","под","над","без","есть","быть","был","была",
  "если","чтобы","только","уже","ещё","еще","мы","он","она","они","их","его","её","ее","все",
  "всё","код","кода","коде","проект","проекта","должен","должна","должно","надо","нужно",
  // Латинские связки из имён записей: no-print-IN-prod, secrets-NOT-IN-code. Без них
  // «dead-code-not-shipped» совпадает с «secrets-not-in-code» по служебным словам.
  "not","in","on","of","to","and","or","the","a","an","is","are","be","with","for","no","has",
]);

const stems = (text) =>
  new Set(
    String(text || "")
      .toLowerCase()
      .replace(/[^a-zа-яё0-9\s-]/gi, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOP.has(w))
      .map((w) => w.slice(0, 4))
  );

function overlap(query, target) {
  if (!query.size) return 0;
  let hit = 0;
  for (const q of query) if (target.has(q)) hit++;
  return hit / query.size;
}

async function cmdFind(args) {
  const query = args.filter((a) => !a.startsWith("-")).join(" ").trim();
  if (!query) die(`Опиши намерение словами: ${SELF} find "отладочная печать не доезжает до прода"`);

  const q = stems(query);
  const catalog = await readCatalog();

  // Решает НАМЕРЕНИЕ, а не пояснение. В README каждой записи есть слова «гейт», «красный»,
  // «образец» — по ним любой запрос совпадёт со всем каталогом. Поэтому README только
  // подсказывает, а вес несёт intent.
  const scored = [];
  for (const rec of catalog) {
    const readme = join(GATES_SRC, rec.slug, "README.md");
    const text = (await exists(readme)) ? await readFile(readme, "utf8") : "";
    const title = (text.match(/^#\s+(.+)$/m) || [, ""])[1];

    // Заголовок — такое же формулирование намерения, как intent, и написан человеком.
    // Остальной текст пояснения в счёт совпадений не идёт: слова «гейт», «проверка»,
    // «образец» есть в каждой записи, по ним совпадёт что угодно с чем угодно.
    const head = stems(`${rec.slug.replace(/-/g, " ")} ${rec.intent || ""} ${title}`);
    const body = stems(text.slice(0, 1200));
    // Одно совпавшее слово — это совпадение обрезки, а не смысла: «обратимы» и «образец»
    // дают одно и то же начало. Считаем ещё и сколько слов совпало, и требуем минимум два.
    let hits = 0;
    for (const w of q) if (head.has(w)) hits++;
    const score = 0.8 * overlap(q, head) + 0.2 * overlap(q, body);
    scored.push([hits >= 2 || q.size < 2 ? score : 0, rec]);
  }
  scored.sort((a, b) => b[0] - a[0]);

  // шишки в журнале: записана, но гейта из неё может не быть
  const journal = [];
  const jPath = join(PKG_ROOT, "incidents", "README.md");
  if (await exists(jPath)) {
    const text = await readFile(jPath, "utf8");
    for (const m of text.matchAll(/^## (20\d\d-\d\d-\d\d)\s+—\s+(.+)$/gm)) {
      const score = overlap(q, stems(m[2]));
      if (score >= 0.34) journal.push([score, m[1], m[2].trim()]);
    }
    journal.sort((a, b) => b[0] - a[0]);
  }

  console.log(c.bold(`\naqk find «${query}»\n`));

  const same = scored.filter(([sc]) => sc >= 0.6);
  const near = scored.filter(([sc]) => sc >= 0.3 && sc < 0.6);

  if (same.length) {
    console.log(c.green("  Такое уже есть — новую запись заводить не надо:\n"));
    for (const [sc, rec] of same.slice(0, 3)) {
      console.log(`  ${c.bold(rec.slug)}  ${c.dim(`совпадение ${Math.round(sc * 100)}%`)}`);
      console.log(`      ${rec.intent || ""}`);
      const langs = Object.keys(rec.recipes || {}).filter((k) => k !== "any");
      console.log(c.dim(`      рецепты: ${langs.length ? langs.join(", ") + ", " : ""}общий`));
    }
    console.log(c.dim("\n  Если у тебя рецепт под другой стек — это строка в recipes существующей"));
    console.log(c.dim("  записи, а не новый гейт. Намерение одно, исполнителей может быть много.\n"));
  } else if (near.length) {
    console.log(c.yellow("  Точного совпадения нет, но рядом лежит:\n"));
    for (const [sc, rec] of near.slice(0, 4)) {
      console.log(`  ${c.bold(rec.slug)}  ${c.dim(`${Math.round(sc * 100)}%`)}  ${rec.intent || ""}`);
    }
    console.log(c.dim("\n  Прочитай их README. Если намерение то же — дополняй, а не заводи новое.\n"));
  } else {
    console.log(c.yellow("  Такого намерения в каталоге нет.\n"));
  }

  if (journal.length) {
    console.log(c.bold("  В журнале есть шишка на эту тему:\n"));
    for (const [, date, title] of journal.slice(0, 3)) console.log(`  ${c.dim(date)}  ${title}`);
    console.log(c.dim("\n  Шишка записана — значит доказательство для новой записи уже есть.\n"));
  }

  if (!same.length) {
    console.log(`${c.bold("Как добавить свой гейт:")}

  1. ${c.bold("Назови отказ.")} Какой конкретный брак он поймал в живом проекте, чего это стоило.
     ${c.dim("«Это хорошая практика» не принимается: так каталог набирает сотни пунктов и умирает.")}
  2. ${c.bold("Заведи папку")} kit/gates/<имя>/ — gate.yml, red/, green/, README.md.
     ${c.dim("Норма записи со всеми полями — kit/gates/README.md")}
  3. ${c.bold("Проверь машиной:")} bash tool/selfcheck/gates.sh
     ${c.dim("Арбитр обязан покраснеть на red/ и промолчать на green/. Не прошло — не запись.")}
  4. ${c.bold("Пришли изменением")} в репозиторий комплекта.
`);
  }
}

// --- blob ---------------------------------------------------------------------
// Один файл со всем текстом комплекта — чтобы разом отдать его в чат.
// СОБИРАЕТСЯ, А НЕ ХРАНИТСЯ. Копия, которую правят руками, через неделю расходится
// с оригиналом, и никто не знает, какая из двух настоящая.

async function cmdBlob() {
  const dir = join(PKG_ROOT, "kit", "docs");
  if (!(await exists(dir))) die(`Не найдены методички: ${dir}`);

  const stamp = new Date().toISOString().slice(0, 10);
  let out =
    `<!-- СОБРАНО КОМАНДОЙ aqk blob ${stamp} из kit/docs. Не править руками:\n` +
    `     правки затрёт следующая сборка. Источник — отдельные файлы. -->\n\n` +
    `# AQK — методички одним файлом\n`;

  // Методички могут лежать в подпапках — обходим дерево, порядок стабильный.
  const found = [];
  const walk = async (d) => {
    for (const it of (await readdir(d, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(d, it.name);
      if (it.isDirectory()) await walk(full);
      else if (it.name.endsWith(".md")) found.push(full);
    }
  };
  await walk(dir);

  for (const full of found) {
    out += `\n\n${"=".repeat(78)}\n<!-- источник: ${relative(PKG_ROOT, full)} -->\n${"=".repeat(78)}\n\n`;
    // Ссылки на соседние файлы в склейке ведут в никуда: соседей рядом больше нет,
    // все они внутри этого же текста. Оставляем подпись, снимаем разметку.
    const body = (await readFile(full, "utf8")).replace(
      /\[([^\]]+)\]\((?!https?:)[^)]+\.md(?:#[^)]*)?\)/g,
      "$1"
    );
    out += body;
  }

  const dst = join(CWD, "GOD_AI.md");
  await writeFile(dst, out, "utf8");
  console.log(
    `\n  ${c.green("✔")}  GOD_AI.md — ${found.length} файлов, ` +
      `${Math.round(Buffer.byteLength(out) / 1024)} КБ\n`
  );
  console.log(c.dim("  Собирается заново каждой командой. Править надо оригиналы в kit/docs.\n"));
}

// --- разбор аргументов ------------------------------------------------------

// Разбор аргументов выполняется только при запуске файла как программы. При импорте —
// а так его читают модульные проверки tool/selfcheck/units.mjs — CLI запускаться не должен.
// Сравниваем по реальному пути: npx ставит `aqk` симлинком, и без realpath запуск через него
// программой считаться перестал бы.
let IS_MAIN = false;
try {
  IS_MAIN = !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
} catch { IS_MAIN = false; }

// Наружу — только чистые функции: разбор манифеста, вычисление триггера, дедупликация.
// Они считают, а не печатают и не пишут на диск, поэтому проверяются по отдельности.
export { parseManifest, triggerVerdict, recipeFor, manifestWithGate, stems, overlap, EXT_LANG };


if (IS_MAIN) {
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
    case "add":
      await cmdAdd(rest);
      break;
    case "find":
      await cmdFind(rest);
      break;
    case "ratchet":
      await cmdRatchet(rest);
      break;
    case "new":
      await cmdNew(rest);
      break;
    case "blob":
      await cmdBlob();
      break;
    default:
      console.log(`
  ${c.bold("aqk")} — оснастка для разработки с агентами

    ${c.bold(`${SELF} init`)}            разложить правила и методички в текущий проект
    ${c.bold(`${SELF} init --force`)}    перезаписать уже существующие файлы
    ${c.bold(`${SELF} doctor`)}          проверить, что разложено и чего не хватает\n  ${c.bold(`${SELF} doctor --run`)}    ещё и запустить объявленные гейты\n  ${c.bold(`${SELF} add`)} <имя>       поставить гейт из каталога в проект\n  ${c.bold(`${SELF} find`)} "…"       есть ли уже такой гейт — сверка по намерению\n  ${c.bold(`${SELF} ratchet`)} <имя>   храповик: старые нарушения — долг, новые не пускать\n  ${c.bold(`${SELF} new`)} <имя>       заготовка своего гейта для каталога
    ${c.bold(`${SELF} note`)} "…"        записать урок в общий журнал шишек
    ${c.bold(`${SELF} blob`)}            собрать методички в один файл GOD_AI.md

  ${c.dim("Без установки:  npx github:arsen-ask-lx/Agent_Quality_Kit init")}
  `);
      process.exit(cmd ? 1 : 0);
  }
}
