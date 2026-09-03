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

export { cmdInit, cmdNote, cmdBlob };
