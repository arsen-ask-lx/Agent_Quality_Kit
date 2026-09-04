// tool/commands/doctor.mjs — что разложено, какая ступень, какие гейты применимы и работают.

import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { CWD, PKG_ROOT, SELF, c, exists } from "../lib/core.mjs";
import { readManifest, assessLevel } from "../lib/manifest.mjs";
import { detectFacts, readCatalog, triggerVerdict, recipeFor } from "../lib/repo.mjs";

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

// Наружу — только команда. Остальное здесь же и используется: экспорт, который никто не
// импортирует, читается как «это часть договора» и мешает менять внутренности.
export { cmdDoctor };
