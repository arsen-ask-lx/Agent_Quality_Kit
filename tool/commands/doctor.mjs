// tool/commands/doctor.mjs — что разложено, какая ступень, какие гейты применимы и работают.

import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { CWD, PKG_ROOT, TARGET_DIR, SELF, c, exists } from "../lib/core.mjs";
import { readManifest, assessLevel } from "../lib/manifest.mjs";
import { detectFacts, readCatalog, triggerVerdict, recipeFor } from "../lib/repo.mjs";
import { L } from "../i18n/index.mjs";

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

  console.log(c.bold(`\n  ${L.doctor.gatesHeading}\n`));
  const marks = ["has_ci", "has_db", "has_docker", "has_tests", "has_deps"]
    .filter((k) => facts[k])
    .map((k) => k.replace("has_", ""));
  console.log(
    c.dim(`  ${L.doctor.langs}: ${[...facts.langs].join(", ") || L.doctor.langsUnknown} · ${L.doctor.files}: ${facts.files}` +
      (marks.length ? ` · ${L.doctor.hasThings}: ${marks.join(", ")}` : "") + "\n")
  );

  for (const rec of held) console.log(`  ${c.green("✔")}  ${rec.slug.padEnd(22)} ${c.dim(rec.intent || "")}`);
  for (const rec of todo) {
    console.log(`  ${c.yellow("✘")}  ${rec.slug.padEnd(22)} ${rec.intent || ""}`);
    console.log(c.dim(`      ${L.doctor.install(`${SELF} add ${rec.slug}`)}`));
  }
  if (skip.length) {
    console.log(c.dim(`\n  ${L.doctor.notApplicable(skip.length)}`));
    for (const [rec, why] of skip) console.log(c.dim(`  ·  ${rec.slug.padEnd(22)} ${why}`));
  }
  console.log(
    `\n  ${c.bold(L.doctor.total)} ${L.doctor.totalHeld(held.length)}, ${L.doctor.totalTodo(c.yellow(todo.length))}, ` +
      c.dim(L.doctor.totalSkip(skip.length)) + "\n"
  );
}

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
  if (!gates.length) return { failed: 0, ran: 0, results: [] };

  console.log(c.bold(`\n  ${L.doctor.runHeading}\n`));
  let failed = 0;
  const results = [];

  for (const [name, cmd] of gates) {
    const t0 = Date.now();
    const r = spawnSync(cmd, { shell: true, cwd: CWD, encoding: "utf8", timeout: 300000 });
    const secs = (Math.max(0, Date.now() - t0) / 1000).toFixed(1);

    if (r.error && r.error.code === "ETIMEDOUT") {
      console.log(`  ${c.red("✘")}  ${name.padEnd(14)} ${c.red(L.doctor.timeout)}`);
      failed++;
      results.push({ name, cmd, ok: false, secs, note: L.doctor.timeout });
      continue;
    }
    const code = r.status;
    if (code === 0) {
      console.log(`  ${c.green("✔")}  ${name.padEnd(14)} ${c.dim(`${secs}s · ${cmd}`)}`);
      results.push({ name, cmd, ok: true, secs });
    } else {
      failed++;
      const out = `${r.stdout || ""}${r.stderr || ""}`.trim().split("\n").filter(Boolean);
      console.log(`  ${c.red("✘")}  ${name.padEnd(14)} ${c.red(L.doctor.exitCode(code))} ${c.dim(`· ${secs}s · ${cmd}`)}`);
      for (const line of out.slice(0, 3)) console.log(c.dim(`        ${line.slice(0, 100)}`));
      if (out.length > 3) console.log(c.dim(`        ${L.doctor.moreLines(out.length - 3)}`));
      results.push({ name, cmd, ok: false, secs, code });
    }
  }
  return { failed, ran: gates.length, results };
}

// Короткий отчёт «что из этого реально брали» — не для человека, а для агента в следующей
// сессии и для самого владельца: список объявленных гейтов молчит о том, сколько из них
// действительно стоят и работают именно СЕЙЧАС. Перезаписывается каждым прогоном, не копится:
// история — дело git-лога коммитов с этим отчётом, если владелец решит его коммитить.
async function writeRunReport({ version, reached, results }) {
  const stamp = new Date().toISOString().replace("T", " ").slice(0, 16);
  const ok = results.filter((r) => r.ok).length;
  const lines = [
    `# ${L.report.title} — ${stamp}`,
    version ? `${L.report.version}: ${version}` : null,
    `${L.report.level}: AQK-${reached < 0 ? L.doctor.levelNone : reached}`,
    "",
    ...results.map((r) => `${r.ok ? "✔" : "✘"} ${r.name} — ${r.secs}s${r.ok ? "" : ` (${r.note || L.doctor.exitCode(r.code)})`}`),
    "",
    L.report.summary(ok, results.length),
  ].filter((l) => l !== null);

  const dst = join(CWD, TARGET_DIR, "last-run.md");
  await mkdir(join(CWD, TARGET_DIR), { recursive: true });
  await writeFile(dst, lines.join("\n") + "\n", "utf8");
}

async function cmdDoctor() {
  // Версия в шапке — единственное, что привязывает баг-репорт к коммиту, если ставили не из
  // релиза: без неё "у меня не работает" ничем не отличается от любой другой версии за год.
  let version = "";
  try {
    const pkg = JSON.parse(await readFile(join(PKG_ROOT, "package.json"), "utf8"));
    version = pkg.version || "";
  } catch { /* пакет без package.json — версия просто не покажется */ }
  console.log(c.bold(`\naqk doctor${version ? ` v${version}` : ""}\n`));

  // В самом комплекте разложенной копии `.aqk/` нет и быть не должно: здесь лежат оригиналы,
  // а копия завтра разошлась бы с ними. Без этого различия `doctor` краснел на собственном
  // репозитории и требовал разложить комплект в комплект.
  const inKit = resolve(CWD) === resolve(PKG_ROOT);
  const checks = [
    inKit ? ["kit/docs", L.doctor.docsKit] : [".aqk/docs", L.doctor.docs],
    inKit ? ["kit/rules", L.doctor.rulesKit] : [".aqk/rules", L.doctor.rules],
    ["AGENTS.md", L.doctor.agents],
    [".gitignore", L.doctor.gitignore],
    [".git", L.doctor.git],
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
        `\n  ${c.yellow("!")}  ${L.doctor.emptyCommands(emptyCommands)} ` +
          c.dim(L.doctor.emptyCommandsWhy)
      );
    }
  }

  const man = await readManifest();
  const { reached, steps } = await assessLevel(man);

  console.log(c.bold(`\n  ${L.doctor.levelHeading}\n`));
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
    console.log(c.yellow(`\n  ${L.doctor.levelNotSet}\n`));
    console.log(L.doctor.levelNotSetWhy.map((line) => c.dim(`  ${line}`)).join("\n") + "\n");
  } else {
    console.log(
      reached < 0
        ? c.yellow(`\n  ${L.doctor.levelManifestNoZero}\n`)
        : c.green(`\n  ${L.doctor.level(reached)}\n`)
    );
  }

  if (next) {
    console.log(`  ${c.bold(L.doctor.toReach(next.level))} ${next.need}`);
    console.log(c.dim(`  ${L.doctor.gives(next.gives)}\n`));
  } else {
    console.log(c.green(`  ${L.doctor.allDone}\n`));
  }

  const facts = await detectFacts(man);
  await reportCatalog(man, facts);

  // «Объявлен» ≠ «работает». Без --run говорим это вслух, а не молчим.
  const wantRun = process.argv.includes("--run");
  const gates = declaredGates(man);
  let gateFailed = 0;
  if (wantRun) {
    const run = runGates(man);
    gateFailed = run.failed;
    await writeRunReport({ version, reached, results: run.results });
  } else if (gates.length) {
    console.log(
      c.yellow(`  ${L.doctor.declaredNotRun(gates.length)}`) +
        c.dim(L.doctor.declaredNotRunWhy(`${SELF} doctor --run`) + "\n")
    );
  }

  // Код возврата — для конвейера. Порог задаётся так: aqk doctor --min 1
  const minIdx = process.argv.indexOf("--min");
  const min = minIdx > -1 ? Number(process.argv[minIdx + 1]) : null;
  if (min !== null) {
    const pass = reached >= min && gateFailed === 0;
    console.log(
      pass
        ? c.green(`  ${L.doctor.thresholdPass(min)}\n`)
        : c.red(`  ${L.doctor.thresholdFail(min, reached < 0 ? L.doctor.levelNone : reached)}\n`)
    );
    process.exit(pass ? 0 : 1);
  }
  process.exit(missing || reached < 0 || gateFailed ? 1 : 0);
}

// Наружу — только команда. Остальное здесь же и используется: экспорт, который никто не
// импортирует, читается как «это часть договора» и мешает менять внутренности.
export { cmdDoctor };
