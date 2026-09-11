// tool/commands/doctor.mjs — что разложено, какая ступень, какие гейты применимы и работают.

import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { CWD, PKG_ROOT, TARGET_DIR, MANIFEST, SELF, c, exists, die, RUNTIME_FILES } from "../lib/core.mjs";
import { cmdProbe, probeStatus } from "./probe.mjs";
import { readManifest, assessLevel, unknownKeys, KNOWN_KEYS, layoutChecks, unparsedLines } from "../lib/manifest.mjs";
import { proveGates } from "../lib/prove.mjs";
import { detectFacts } from "../lib/repo.mjs";
import { reportBaseline, reportCatalog } from "./doctor-catalog.mjs";
import { L } from "../i18n/index.mjs";
import { countArbiters } from "./context.mjs";
import { beginBrief, finishBrief } from "../lib/brief.mjs";
import { declaredGates, sinceRef, runGates, progress, listArg } from "../lib/run.mjs";
import { autoProbeAllowed, levelLimits } from "../lib/cadence.mjs";

// Короткий отчёт «что из этого реально брали» — не для человека, а для агента в следующей
// сессии и для самого владельца: список объявленных гейтов молчит о том, сколько из них
// действительно стоят и работают именно СЕЙЧАС. Перезаписывается каждым прогоном, не копится:
// история — дело git-лога коммитов с этим отчётом, если владелец решит его коммитить.
async function writeRunReport({ version, reached, results, skipped = [] }) {
  const stamp = new Date().toISOString().replace("T", " ").slice(0, 16);
  const ok = results.filter((r) => r.ok).length;
  const lines = [
    `# ${L.report.title} — ${stamp}`,
    version ? `${L.report.version}: ${version}` : null,
    `${L.report.level}: AQK-${reached < 0 ? L.doctor.levelNone : reached}`,
    "",
    ...results.map((r) => `${r.ok ? "✔" : "✘"} ${r.name} — ${r.secs}s${r.ok ? "" : ` (${r.note || L.doctor.exitCode(r.code)})`}`),
    // Пропущенные по --skip/--only — строкой «~»: блок для агента читает их как «не запускались»,
    // а не как зелёные. Молчание о них прочиталось бы как «проверено».
    ...skipped.map((n) => `~ ${n} — ${L.report.skippedBySelect}`),
    "",
    L.report.summary(ok, results.length),
  ].filter((l) => l !== null);

  const dst = join(CWD, TARGET_DIR, "last-run.md");
  await mkdir(join(CWD, TARGET_DIR), { recursive: true });
  await writeFile(dst, lines.join("\n") + "\n", "utf8");
}

// ПРОБА ЗАПУСКАЕТСЯ САМА, раз в сто коммитов, — кроме конвейера (там это минуты сюрпризом в
// быстрой проверке, отзыв с живого проекта 2026-09-11). Не влияет на код возврата никогда: это
// осмотр, а не порог. Отдельной функцией: внутри прогона эта лесенка дала вложенность 6, и наш же
// complexity-limit её поймал.
async function autoProbe(brief) {
  let st;
  try { st = await probeStatus(); } catch { return; /* пробы нет — прогон про гейты, а не про неё */ }
  if (st.badEvery !== undefined) { console.log(c.yellow(`\n  ${L.probe.badEvery(st.badEvery)}`)); return; }
  if (st.state !== "never" && st.state !== "stale") return;
  if (!autoProbeAllowed({ brief })) { console.log(c.dim(`\n  ${L.probe.autoNotInCi(`${SELF} probe`)}`)); return; }
  // Сообщение обязано быть верным в обоих случаях: первая версия печатала «прошло сто коммитов»
  // и там, где пробы не было ВОВСЕ — число бралось из порога, а не из факта.
  console.log(c.dim(`\n  ${st.state === "never" ? L.probe.autoFirst : L.probe.auto(st.behind)}`));
  try { await cmdProbe([], { auto: true }); } catch { /* проба не состоялась — прогон это не роняет */ }
}

async function cmdDoctor() {
  const brief = process.argv.includes("--brief");
  const buf = brief ? beginBrief() : null;
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
  const man = await readManifest();
  // Что именно проверять — решает манифест: где у ЭТОГО проекта правила, методички и точка
  // входа. Литеральный список стоял здесь до 2026-09-08 и печатал кресты за сделанное.
  const checks = layoutChecks(man, inKit);

  let missing = 0;
  for (const [path, what, required] of checks) {
    const ok = await exists(join(CWD, path));
    if (!ok && required) missing++;
    const mark = ok ? c.green("✔") : required ? c.red("✘") : c.dim("○");
    console.log(`  ${mark}  ${path.padEnd(22)} ${c.dim(what)}${!ok && !required ? c.dim(` · ${L.doctor.layoutAdvice}`) : ""}`);
  }

  // СЛУЖЕБНЫЙ ФАЙЛ, КОТОРЫЙ ВИДИТ GIT. Отзыв с живого проекта 2026-09-11: `.aqk/last-run.md`
  // однажды закоммитили, и каждый прогон оставлял изменённый файл. `init` теперь кладёт их в
  // .gitignore сам; здесь — для тех, кто поставил раньше. Спрашиваем git, а не диск.
  const git = (...a) => spawnSync("git", a, { cwd: CWD, encoding: "utf8" });
  if (git("rev-parse", "--git-dir").status === 0) {
    const tracked = new Set(String(git("ls-files", "--", TARGET_DIR).stdout || "").split("\n"));
    for (const f of RUNTIME_FILES.map((n) => `${TARGET_DIR}/${n}`)) {
      if (tracked.has(f)) {
        console.log(`\n  ${c.yellow("!")}  ${L.doctor.runtimeTracked(f, `git rm --cached ${f} && echo ${f} >> .gitignore`)}`);
      } else if (await exists(join(CWD, f)) && git("check-ignore", "-q", f).status !== 0) {
        console.log(c.dim(`\n  ${L.doctor.runtimeNotIgnored(f, `echo ${f} >> .gitignore`)}`));
      }
    }
  }

  // Команды в точке входа заполнены или остались пустыми заготовками? Файл берётся тот же,
  // что проверен выше, — иначе проект на `CLAUDE.md` этой проверки не получал вовсе.
  const entryFile = (Array.isArray(man?.entry) ? man.entry : []).find((e) => typeof e === "string" && e.trim())?.trim() || "AGENTS.md";
  const agents = join(CWD, entryFile);
  if (await exists(agents)) {
    const text = await readFile(agents, "utf8");

    // Сколько обещаний НЕ сторожит машина. Считалось и печаталось это давно — но только в
    // блоке `context`, который читает АГЕНТ. Человеку, который и назначен сторожем, `doctor`
    // не говорил ни слова: единственный, кто обязан помнить о непроверяемом обещании, был
    // единственным, кому о нём не сообщали.
    //
    // Найдено не нами: отчёт живого проекта 2026-09-10 — «всё, что касается масштаба, помечено
    // aqk: человек. AQK отработал честно: потребовал назвать сторожа, мы назвали — и сторож не
    // проверил». В нашем собственном своде так помечены 12 правил из 14.
    const arb = countArbiters(text, ["человек", "human", "nobody"]);
    if (arb.total && arb.human) {
      console.log(`\n  ${c.yellow("!")}  ${L.doctor.rulesByHuman(arb.total, arb.machine, arb.human)}`);
      console.log(c.dim(`     ${L.doctor.rulesByHumanWhy}`));
    }

    const emptyCommands = (text.match(/^- [^:]+: ``$/gm) || []).length;
    if (emptyCommands) {
      console.log(
        `\n  ${c.yellow("!")}  ${L.doctor.emptyCommands(emptyCommands)} ` +
          c.dim(L.doctor.emptyCommandsWhy)
      );
    }
  }

  // Опечатка в имени поля означала «поля нет»: вердикт выдавался неверный, а причина молчала.
  // Называем поле и говорим, какие бывают — иначе человек ищет ошибку в проекте, а она в файле.
  // Строка, которую разбор не понял, называется ПЕРВОЙ и жёлтым: человек видит проверку в
  // файле, а её не существует. До 2026-09-09 такая строка исчезала без слова — найдено
  // случайно, гейтом с кириллическим именем, который «прошёл», не запустившись.
  try {
    const bad = unparsedLines(await readFile(join(CWD, MANIFEST), "utf8"));
    for (const b of bad) console.log(c.yellow(`\n  ${L.doctor.manifestUnparsed(b.line, b.text)}`));
    if (bad.length) console.log(c.dim(`  ${L.doctor.manifestUnparsedWhy}`));
  } catch { /* манифеста нет — про строки в нём говорить нечего */ }

  const unknown = unknownKeys(man);
  if (unknown.length) {
    console.log(c.yellow(`\n  ${L.doctor.manifestUnknown(unknown)}`));
    console.log(c.dim(`  ${L.doctor.manifestKnown(KNOWN_KEYS)}\n`));
  }

  // Доказательство считается только при прогоне: узнать, ловит ли гейт брак, нельзя иначе как
  // запустив его по образцу. Без прогона ступени со второй помечаются «не доказано» — это
  // честнее, чем показывать их выполненными по наличию папок.
  // Доказательство — секунды тишины до первой строки уровня; строка «идёт» их называет.
  const bar = progress();
  if (process.argv.includes("--run")) bar.show(c.dim(`  ⋯  ${L.doctor.proving}`));
  const proof = process.argv.includes("--run") ? await proveGates(man) : null;
  bar.clear();
  const { reached, steps } = await assessLevel(man, proof);

  console.log(c.bold(`\n  ${L.doctor.levelHeading}\n`));
  for (const s of steps) {
    const mark = s.ok ? c.green("✔") : reached + 1 === s.level ? c.yellow("→") : c.dim("·");
    const note = !s.ok && s.needsProof ? c.dim(`  · ${L.doctor.levelUnproven(`${SELF} prove`)}`) : "";
    console.log(`  ${mark}  AQK-${s.level}  ${s.title}${note}`);
  }
  if (proof && proof.broken) {
    console.log(c.red(`\n  ${L.doctor.gatesDoNotCatch(proof.broken, `${SELF} prove`)}`));
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
  // Состояние пробы — из файла отметки, миллисекунды. Нет его — блок про пробу просто молчит.
  let probe = null;
  try { probe = await probeStatus(); } catch { /* пробы нет — и ладно */ }
  // Чего уровень НЕ доказывает — сразу под ним, пока глаз на нём (см. levelLimits).
  if (reached >= 1) {
    const lim = levelLimits(probe);
    console.log(c.dim(`  ${L.doctor.limitsTitle}`));
    console.log(`    ${L.doctor.limitsProbe[lim.kind](lim, `${SELF} probe`)}`);
    console.log(`    ${L.doctor.limitsCi}\n`);
  }

  const facts = await detectFacts(man);
  if (process.argv.includes("--baseline")) {
    // `--baseline` — осмотр, а не прогон: он выходит с нулём всегда. Совмещённый с `--run` или
    // `--min` он давал конвейер, который НЕ МОЖЕТ покраснеть: порог назван, гейты не запущены,
    // код нулевой. Человек, собравший такую строку, считает, что порог держится. Отказываемся
    // вслух — молчаливое зелёное здесь дороже сломанной команды. Найдено ревью 2026-09-08.
    const clash = ["--run", "--min"].filter((f) => process.argv.includes(f));
    if (clash.length) die(L.doctor.baselineClash(clash.join(", ")));
    await reportBaseline(man, facts);
    process.exit(0);
  }
  const cat = (await reportCatalog(man, facts, probe)) || { held: 0, todo: 0, todoRecs: [] };

  // «Объявлен» ≠ «работает». Без --run говорим это вслух, а не молчим.
  const wantRun = process.argv.includes("--run");
  const gates = declaredGates(man);
  let gateFailed = 0;
  let failedNames = [];
  let skippedNames = [];
  if (wantRun) {
    // --jobs N: сколько гейтов одновременно. Без флага — по одному, как было: чужие гейты бывают
    // зависимыми (общий dist/), и плавающее красное хуже медленного. Не число — отказ, а не тихий
    // последовательный прогон под видом параллельного.
    const ji = process.argv.indexOf("--jobs");
    const jobs = ji > -1 ? Number(process.argv[ji + 1]) : 1;
    if (!Number.isInteger(jobs) || jobs < 1) die(L.doctor.jobsBad(process.argv[ji + 1] ?? ""));
    const run = await runGates(man, { since: sinceRef(), only: listArg(process.argv, "--only"), skip: listArg(process.argv, "--skip"), jobs });
    gateFailed = run.failed;
    failedNames = run.results.filter((r) => !r.ok).map((r) => r.name);
    skippedNames = run.skipped || [];
    await writeRunReport({ version, reached, results: run.results, skipped: run.skipped });

    // ПРОБА ЗАПУСКАЕТСЯ САМА. Владелец сформулировал так: «команду, о которой надо вспомнить,
    // агент не вспомнит, а человек о ней не узнает». Это тот же класс, что файл, который можно
    // не прочитать, — и весь комплект написан против него. `probe` отвечает на важнейший
    // вопрос («что здесь не прикрыто ничем») и, оставаясь ручной, не задаётся никем.
    //
    // Поэтому не напоминание, а действие: раз в сто коммитов прогон делает пробу сам. Единица
    // — коммиты, а не сутки: месяц без работы перепроверять незачем, сто коммитов за день —
    // надо. В кратком режиме не запускается: там хук на воротах коммита, и лишние секунды там
    // стоят дороже. Не влияет на код возврата НИКОГДА — это осмотр, а не порог.
    // Выключается AQK_PROBE=0 — у всего, что случается само, обязан быть выключатель.
    if (!brief && process.env.AQK_PROBE !== "0") await autoProbe(brief);
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
    const levelOk = reached >= min;
    const pass = levelOk && gateFailed === 0;
    // Две разные развилки, и сообщение обязано их различать. «Порог не пройден: сейчас AQK-1»
    // при пороге AQK-1 противоречит само себе и отправляет чинить манифест, когда падал гейт.
    const now = reached < 0 ? L.doctor.levelNone : reached;
    let line;
    if (pass) line = c.green(`  ${L.doctor.thresholdPass(min)}\n`);
    else if (!levelOk) line = c.red(`  ${L.doctor.thresholdFail(min, now)}\n`);
    else line = c.red(`  ${L.doctor.thresholdGateFail(min, now, failedNames)}\n`);
    console.log(line);
    await finishBrief(buf, { held: cat.held, todo: cat.todo, level: reached, red: failedNames ? String(failedNames).split(", ").filter(Boolean) : [] }, cat.todoRecs, pass);
    process.exit(pass ? 0 : 1);
  }
  const ok = !(missing || reached < 0 || gateFailed);
  // ВЕРДИКТ НАЗЫВАЕТСЯ СЛОВАМИ, а не только кодом возврата. С `--min` он печатался всегда, без
  // него — никогда: прогон выходил с единицей, а внизу человек видел список зелёных гейтов и
  // шёл искать причину. Обратная сторона нашего же принципа: молчание неотличимо не только от
  // успеха, но и от отказа. Найдено аудитом фич 2026-09-09.
  //
  // Печатается и на зелёном тоже: «ничего не сказал» и «всё проверено» обязаны различаться.
  if (wantRun) {
    if (ok) {
      console.log(c.green(`  ${L.doctor.runVerdictOk}\n`));
      if (skippedNames.length) console.log(c.yellow(`  ${L.doctor.selectSkipped(skippedNames.join(", "))}\n`));
    } else {
      const why = [];
      if (missing) why.push(L.doctor.whyMissing);
      if (reached < 0) why.push(L.doctor.whyLevel);
      if (gateFailed) why.push(L.doctor.whyGates(gateFailed, failedNames.join(", ")));
      console.log(c.red(`  ${L.doctor.runVerdictFail(why.join(", "))}\n`));
    }
  }
  await finishBrief(buf, { held: cat.held, todo: cat.todo, level: reached, red: [] }, cat.todoRecs, ok);
  process.exit(ok ? 0 : 1);
}

// Наружу — только команда. Остальное здесь же и используется: экспорт, который никто не
// импортирует, читается как «это часть договора» и мешает менять внутренности.
export { cmdDoctor };
