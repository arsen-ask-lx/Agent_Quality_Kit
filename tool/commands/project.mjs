// tool/commands/project.mjs — что делают с проектом целиком: разложить комплект, записать
// урок в общий журнал, собрать методички одним файлом.

import { readdir, mkdir, writeFile, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join, dirname, relative } from "node:path";
import {
  CWD, PKG_ROOT, DOCS_SRC, RULES_SRC, TARGET_DIR, MANIFEST, SELF, c, exists, die,
  copyDir, writeIfAbsent,
} from "../lib/core.mjs";
import { AGENTS_MD, CLAUDE_MD, MANIFEST_YML } from "../lib/templates.mjs";
import { readManifest } from "../lib/manifest.mjs";
import { detectFacts, readCatalog, triggerVerdict } from "../lib/repo.mjs";
import { installGate } from "./gates.mjs";

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


// --- start: порядок «с нуля» ---------------------------------------------------
// Сценарий «кода ещё нет». Главное здесь машинное, а не словесное: сторожей ставят ДО первой
// строки кода. Поставленный потом, сторож красит весь старый код разом — и его выключают.
// На пустом проекте долга нет вовсе, храповик не нужен ни одному гейту.
//
// Порядок работы — задача, ограничения, сайзинг, архитектура — программа НЕ проверяет и не
// делает вид, что проверяет: это текст в методичках, который агент может проигнорировать.
// Сказать об этом вслух дешевле, чем изобразить проверку.

async function cmdStart(args) {
  const force = args.includes("--force");
  let man = await readManifest();
  if (!man) {
    await cmdInit(args.filter((a) => a !== "--force"));
    man = await readManifest();
    if (!man) die(`Не получилось разложить комплект. Начни с ${SELF} init`);
  }

  const facts = await detectFacts(man);
  console.log(c.bold("\naqk start\n"));

  if (facts.files > 30 && !force) {
    console.log(c.yellow(`  В репозитории уже ${facts.files} файлов кода — это другой сценарий.\n`));
    console.log(`  ${c.bold(`${SELF} doctor`)} осмотрит, что есть, и разделит записи на три списка:`);
    console.log(c.dim("  держит машина · применимо и не поставлено · не применимо и почему.\n"));
    console.log(c.dim(`  Всё равно поставить сторожей дня 0: ${SELF} start --force`));
    console.log(c.dim("  Готовься к красному: сторож, поставленный на живой код, краснеет на нём весь."));
    console.log(c.dim(`  Это лечится храповиком — ${SELF} ratchet <имя>, — а не отключением.\n`));
    return;
  }

  // --- сторожа дня 0 ---------------------------------------------------------
  const declared = new Set(Object.keys(
    man.gates && typeof man.gates === "object" && !Array.isArray(man.gates) ? man.gates : {}
  ));
  const put = [];
  let skipped = [];
  const catalog = await readCatalog();

  // Проходим по каталогу, пока он не перестанет расти. Установка меняет признаки репозитория:
  // первый же поставленный гейт делает применимыми записи с условием has_gates. Один проход
  // объявлял их неприменимыми «гейтов не объявлено» — ровно в тот момент, когда они появились.
  let facts0 = facts;
  for (let pass = 0; pass < 3; pass++) {
    skipped = [];
    let added = 0;
    for (const rec of catalog) {
      if (declared.has(rec.slug)) continue;
      const v = triggerVerdict(rec, facts0);
      if (!v.applies) { skipped.push([rec.slug, v.why]); continue; }
      const { cmd } = await installGate(rec.slug, man, facts0);
      put.push([rec.slug, cmd, rec.intent || ""]);
      declared.add(rec.slug);
      added++;
      man = await readManifest();
    }
    if (!added) break;
    facts0 = await detectFacts(man);
  }

  if (put.length) {
    console.log(c.green(`  Поставлено сторожей дня 0: ${put.length}\n`));
    for (const [slug, , intent] of put) console.log(`  ${c.green("✔")}  ${slug.padEnd(22)} ${c.dim(intent)}`);
    console.log(c.dim("\n  Долга нет: на пустом проекте им нечего пропускать. Тот же сторож, поставленный"));
    console.log(c.dim("  через полгода, покраснел бы на всём старом коде — и его бы выключили.\n"));
  } else {
    console.log(c.dim("  Все применимые записи уже объявлены.\n"));
  }
  if (skipped.length) {
    console.log(c.dim("  Не применимо пока:"));
    for (const [slug, why] of skipped.slice(0, 6)) console.log(c.dim(`    ${slug.padEnd(22)} ${why}`));
    console.log(c.dim("  Появится признак — запись покажется сама.\n"));
  }

  // --- порядок работы --------------------------------------------------------
  console.log(`${c.bold("Порядок, в котором это делают:")}

  1. ${c.bold("Задача словами.")} Что и кому, без единого технического слова.
     ${c.dim("Пока задача не описана словами, любая архитектура защищает неизвестно что.")}
  2. ${c.bold("Ограничения.")} Сроки, деньги, нагрузка, чем нельзя пользоваться.
     ${c.dim("Ограничения выбирают решение куда чаще, чем вкус: без них выбирают вкусом.")}
  3. ${c.bold("Сайзинг.")} Сколько данных, запросов, людей — числами, хотя бы порядком.
     ${c.dim("Число отделяет «нужна очередь» от «хватит таблицы». Без него спорят словами.")}
  4. ${c.bold("Архитектура.")} И только теперь — из первых трёх, а не до них.

  ${c.dim("Этот порядок программа не проверяет: он в .aqk/docs/, и агент может его")}
  ${c.dim("проигнорировать. Машина держит другое — сторожей выше. Разница между")}
  ${c.dim("мягким и жёстким тут ровно такая: текст просят, команду выполняют.")}

${c.bold("Дальше:")}  ${c.bold(`${SELF} doctor --run`)}  ${c.dim("— прогнать всё, что объявлено")}
`);
}

export { cmdInit, cmdNote, cmdBlob, cmdStart };
