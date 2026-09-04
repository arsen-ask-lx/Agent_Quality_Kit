// tool/commands/project.mjs — что делают с проектом целиком: разложить комплект, записать
// урок в общий журнал, собрать методички одним файлом.

import { readdir, mkdir, writeFile, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join, dirname, relative } from "node:path";
import {
  CWD, PKG_ROOT, DOCS_SRC, RULES_SRC, TARGET_DIR, MANIFEST, SELF, REPO_URL, c, exists, die,
  copyDir, writeIfAbsent, FEEDBACK_MARK,
} from "../lib/core.mjs";
import { AGENTS_MD, CLAUDE_MD, MANIFEST_YML } from "../lib/templates.mjs";
import { readManifest } from "../lib/manifest.mjs";
import { detectFacts, readCatalog, triggerVerdict } from "../lib/repo.mjs";
import { installGate } from "./gates.mjs";
import { L } from "../i18n/index.mjs";

async function cmdInit(args) {
  const force = args.includes("--force");
  const created = [];
  const skipped = [];

  const track = (ok, path) => (ok ? created : skipped).push(relative(CWD, path));

  if (!(await exists(DOCS_SRC))) {
    die(L.init.noDocs(DOCS_SRC));
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
    console.log(c.green(`  ${L.init.created(created.length)}`));
    for (const f of created.slice(0, 8)) console.log(`    ${f}`);
    if (created.length > 8) console.log(c.dim(`    ${L.init.andMore(created.length - 8)}`));
  }
  if (skipped.length) {
    console.log(c.yellow(`\n  ${L.init.kept(skipped.length)}`));
    for (const f of skipped) console.log(`    ${f}`);
    console.log(c.dim(`  ${L.init.overwrite(`${SELF} init --force`)}`));
  }

  // Путь ищем, а не пишем: раскладка внутри .aqk — дело владельца комплекта, и жёстко
  // вписанный путь однажды отправит человека в несуществующий файл. Уже отправлял.
  let baseline = join(TARGET_DIR, "docs", "project-baseline.md");
  for (const f of created) if (f.endsWith("project-baseline.md")) baseline = f;

  console.log(`
${c.bold(L.init.nextTitle)}

  1. ${L.init.n1a} ${c.bold("AGENTS.md")} ${L.init.n1b}
     ${L.init.n1c}
  2. ${L.init.n2a} ${c.bold(baseline)} ${L.init.n2b}
     ${L.init.n2c}
  3. ${L.init.n3a} ${c.bold(".aqk.yml")} ${L.init.n3b}
     ${L.init.n3c(c.bold(`${SELF} doctor`))}
  4. ${L.init.n4a} ${c.bold(L.init.n4b)}${L.init.n4c}
     ${L.init.n4d}

${c.dim(L.init.burned(`${SELF} note "…"`))}
`);
  await maybeAskFeedback();
}

// Печатается один раз на машину, не на проект: второй init в другом репозитории на том же
// компьютере её не повторяет — отметка живёт в доме пользователя, вне любого git.
// Ничего не постится само: ссылки печатаются, дальше решает человек. Обратная связь важнее
// звезды, но без звезды меньше шансов, что кто-то вообще дойдёт до фидбека.
async function maybeAskFeedback() {
  if (await exists(FEEDBACK_MARK)) return;
  const url = REPO_URL;
  console.log(`
${c.bold(L.feedback.title)}
  ${L.feedback.star(url)}
  ${L.feedback.issue}
    ${url}/issues/new
${c.dim(`  ${L.feedback.once}`)}
`);
  await writeIfAbsent(FEEDBACK_MARK, "shown\n", { force: false });
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
  if (!title) die(L.note.needTitle(`${SELF} note "…"`));

  // Сначала журнал ЭТОГО проекта: `lessons:` в манифесте — это и есть ответ на вопрос «куда
  // складывать уроки», данный владельцем репозитория. Пока команда его игнорировала, она
  // требовала клон нашего репозитория и писала урок туда — то есть в чужой проект. Найдено
  // первым же чужим прогоном: человек завёл журнал руками, потому что команда не сработала.
  const man = await readManifest();
  const own = String(man?.lessons || "").trim();
  let home = null;
  let journal = null;
  if (own && !/^https?:/i.test(own)) {
    const dir = join(CWD, own);
    if (await exists(dir)) {
      home = CWD;
      journal = join(dir, "README.md");
      // Журнал объявлен, но файла нет — заводим, а не отказываем: пустой журнал это норма
      // первого дня, и отказ на нём отучает пользоваться командой.
      if (!(await exists(journal))) await writeFile(journal, `# ${L.note.journalTitle}\n`, "utf8");
    }
  }

  if (!home) {
    home = findJournal();
    if (!home) die(L.note.noJournal(REPO_URL));
    journal = join(home, "incidents", "README.md");
    if (!(await exists(journal))) die(L.note.journalMissing(journal));
  }

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
    die(L.note.emptyBody);
  }

  // ГЕЙТ. Урок без вывода — это история, а не урок: в следующий раз обожжёмся так же.
  // Проверяем ровно то же, что потом сверяет kit/gates/lesson-has-outcome: слово «вывод» в
  // тексте не значит вывод, если рядом нет одной из трёх настоящих отметок. Запись проходила бы
  // здесь и тут же краснела на doctor --run — разные требования в двух местах одного правила.
  if (!/[✅🔧📜👤]/.test(body)) {
    die(L.note.noOutcome);
  }

  const date = new Date().toISOString().slice(0, 10);
  const project = CWD.split("/").filter(Boolean).pop() || L.note.unknownProject;
  const entry = `\n## ${date} — ${title}\n\n**${L.note.projectField}:** ${project}\n\n${body.trim()}\n`;

  const prev = await readFile(journal, "utf8");
  await writeFile(journal, prev + entry, "utf8");

  const run = (...a) => spawnSync("git", ["-C", home, ...a], { stdio: "inherit" });
  run("add", "incidents/README.md");
  run("commit", "-q", "-m", `lesson(${project}): ${title}`);
  const pushed = run("push", "-q");
  console.log(
    pushed.status === 0
      ? c.green(L.note.pushed(title))
      : c.yellow(L.note.localOnly(`git -C ${home} push`))
  );
}

// Один файл со всем текстом комплекта — чтобы разом отдать его в чат.
// СОБИРАЕТСЯ, А НЕ ХРАНИТСЯ. Копия, которую правят руками, через неделю расходится
// с оригиналом, и никто не знает, какая из двух настоящая.

async function cmdBlob() {
  const dir = join(PKG_ROOT, "kit", "docs");
  if (!(await exists(dir))) die(L.blob.noDocs(dir));

  const stamp = new Date().toISOString().slice(0, 10);
  let out = L.blob.header(stamp);

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
    out += `\n\n${"=".repeat(78)}\n<!-- ${L.blob.source(relative(PKG_ROOT, full))} -->\n${"=".repeat(78)}\n\n`;
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
    `\n  ${c.green("✔")}  ${L.blob.done(found.length, Math.round(Buffer.byteLength(out) / 1024))}\n`
  );
  console.log(c.dim(`  ${L.blob.rebuilt}\n`));
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
    if (!man) die(L.start.initFailed(`${SELF} init`));
  }

  const facts = await detectFacts(man);
  console.log(c.bold("\naqk start\n"));

  if (facts.files > 30 && !force) {
    console.log(c.yellow(`  ${L.start.tooManyFiles(facts.files)}\n`));
    console.log(`  ${L.start.useDoctor(c.bold(`${SELF} doctor`))}`);
    console.log(c.dim(`  ${L.start.threeLists}\n`));
    console.log(c.dim(`  ${L.start.anyway(`${SELF} start --force`)}`));
    console.log(c.dim(`  ${L.start.expectRed}`));
    console.log(c.dim(`  ${L.start.expectRedFix(`${SELF} ratchet ${L.help.name}`)}\n`));
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
    console.log(c.green(`  ${L.start.installed(put.length)}\n`));
    for (const [slug, , intent] of put) console.log(`  ${c.green("✔")}  ${slug.padEnd(22)} ${c.dim(intent)}`);
    console.log(c.dim(`\n  ${L.start.noDebt1}`));
    console.log(c.dim(`  ${L.start.noDebt2}\n`));
  } else {
    console.log(c.dim(`  ${L.start.allDeclared}\n`));
  }
  if (skipped.length) {
    console.log(c.dim(`  ${L.start.notYet}`));
    for (const [slug, why] of skipped.slice(0, 6)) console.log(c.dim(`    ${slug.padEnd(22)} ${why}`));
    console.log(c.dim(`  ${L.start.notYetWhy}\n`));
  }

  // --- порядок работы --------------------------------------------------------
  console.log(`${c.bold(L.start.orderTitle)}

  1. ${c.bold(L.start.o1)} ${L.start.o1What}
     ${c.dim(L.start.o1Why)}
  2. ${c.bold(L.start.o2)} ${L.start.o2What}
     ${c.dim(L.start.o2Why)}
  3. ${c.bold(L.start.o3)} ${L.start.o3What}
     ${c.dim(L.start.o3Why)}
  4. ${c.bold(L.start.o4)} ${L.start.o4What}

  ${c.dim(L.start.softNote1)}
  ${c.dim(L.start.softNote2)}
  ${c.dim(L.start.softNote3)}

${c.bold(L.start.next)}  ${c.bold(`${SELF} doctor --run`)}  ${c.dim(L.start.nextWhy)}
`);
  await maybeAskFeedback();
}

export { cmdInit, cmdNote, cmdBlob, cmdStart };
