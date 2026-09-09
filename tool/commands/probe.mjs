// tool/commands/probe.mjs — `aqk probe`: чего объявленные проверки НЕ видят.
//
// ЗАЧЕМ ЭТО ОТДЕЛЬНАЯ КОМАНДА. `doctor` отвечает «держит машина 21». Двадцать один из чего?
// Знаменателя нет: 21 — это то, что мы успели написать в каталог, а не то, что важно в этом
// проекте. `prove` доказывает, что гейт ловит брак НА СВОЁМ образце. Ни один из них не
// отвечает на вопрос владельца: «что у меня не прикрыто вообще».
//
// Замер, с которого команда началась, — на самом комплекте, 2026-09-09. Взят настоящий файл
// проекта, в копию подсажены проглоченная ошибка и отладочная печать, прогнаны ВСЕ 21
// сканирующих гейта из манифеста. Покраснело: ноль. У проекта с AQK-3 есть брак, невидимый
// всем его проверкам, — и узнать об этом было нечем.
//
// КАК УСТРОЕНО. Два источника, и оба — факты, а не наш вкус:
//   1. история репозитория: где брак ВОЗВРАЩАЕТСЯ (коммиты-починки, `history.mjs`);
//   2. красные образцы каталога: каждый доказан прогоном, каждый — настоящий брак.
// Образец кладётся во временный каталог по пути горячего файла, и по нему прогоняются
// ОБЪЯВЛЕННЫЕ гейты проекта. Никто не покраснел — класс не прикрыт, и это доказано, а не
// выведено из списка.
//
// ЧЕГО КОМАНДА НЕ ДЕЛАЕТ. Не трогает рабочее дерево: проба живёт в каталоге mkdtemp и
// удаляется. Не меняет манифест. Не роняет прогон: код возврата всегда 0 — это осмотр, а
// не порог. Порог — у `doctor --run --min`.
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, copyFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, extname } from "node:path";
import { readManifest } from "../lib/manifest.mjs";
import { commandFor } from "../lib/prove.mjs";
import { fixHotspots, probeVerdict } from "../lib/history.mjs";
import { detectFacts, readCatalog, triggerVerdict } from "../lib/repo.mjs";
import { CWD, GATES_SRC, c, SELF, exists } from "../lib/core.mjs";
import { L } from "../i18n/index.mjs";

// Тот же набор расширений, что у привязки доказательства к дифу. Список один на программу:
// второй через месяц разошёлся бы с первым.
const CODE_EXT = new Set([
  "c", "cjs", "cpp", "cs", "css", "go", "h", "java", "js", "json", "jsx", "kt", "mjs", "mts",
  "php", "pl", "py", "rb", "rs", "scala", "sh", "sql", "swift", "ts", "tsx", "vue",
]);

const isCode = (p) =>
  CODE_EXT.has(extname(p).slice(1).toLowerCase()) &&
  !/(^|\/)gates\/[^/]+\/(red|green)(\/|$)/.test(p);

// История берётся одним вызовом: тема коммита и его файлы. Слияния исключены — в них файлы
// второй ветки, а починку делали не в них.
function gitLog(limit) {
  const r = spawnSync(
    "git",
    ["log", "--no-merges", `--max-count=${limit}`, "--format=%s", "--name-only"],
    { cwd: CWD, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  return r.status === 0 ? r.stdout || "" : null;
}

// Гейты, которым можно подставить каталог. Команда записи каталога кончается каталогом
// проверки; написанная руками — чем угодно, и подставлять там некуда. Ровно то же правило,
// по которому `prove` объявляет запись недоказуемой, а не сломанной.
function scanningGates(man) {
  const gates = man?.gates && typeof man.gates === "object" && !Array.isArray(man.gates) ? man.gates : {};
  return Object.entries(gates)
    .map(([name, raw]) => [name, String(raw || "").trim()])
    .filter(([, cmd]) => cmd && /(\.|\.\/)$/.test(cmd));
}

// Красный образец записи, подходящий по расширению горячего файла. Расширение обязано
// совпадать: питоновский образец в проекте на TypeScript не проверит ничего, а покажет
// «не прикрыто» — ложная тревога того же класса, что молчащий гейт, только наоборот.
async function redSampleFor(entry, ext) {
  const dir = join(GATES_SRC, entry, "red");
  if (!(await exists(dir))) return null;
  let names = [];
  try { names = await readdir(dir); } catch { return null; }
  const hit = names.find((n) => extname(n).toLowerCase() === ext);
  return hit ? join(dir, hit) : null;
}

// Проба: временный каталог, в нём образец по пути горячего файла. Путь сохраняется целиком —
// правила, привязанные к путям (`.aqkignore`, исключения гейтов), обязаны действовать так же,
// как в настоящем репозитории. Без этого проба отвечала бы про несуществующее место.
async function buildProbe(relPath, sample) {
  const root = await mkdtemp(join(tmpdir(), "aqk-probe-"));
  const dest = join(root, relPath);
  await mkdir(dirname(dest), { recursive: true });
  await copyFile(sample, dest);
  // Переносится ТОЛЬКО .aqkignore: правила, привязанные к путям, обязаны действовать так же,
  // как в настоящем репозитории. Манифест НЕ переносится намеренно — иначе записи, читающие
  // `.aqk.yml` (`gates-are-runnable`, `gate-has-samples`, `protection-not-removed`), краснеют
  // на том, что в пробе нет объявленных ими файлов, и проба объявляет класс прикрытым, хотя
  // на подсаженный брак не отреагировал никто. Ошибка в сторону «прикрыто» — это тишина,
  // а тишина здесь и есть предмет спора. Поймано первым же прогоном на своём репозитории.
  if (await exists(join(CWD, ".aqkignore"))) {
    await copyFile(join(CWD, ".aqkignore"), join(root, ".aqkignore"));
  }
  return root;
}

function runGates(gates, dir) {
  const out = [];
  for (const [name, cmd] of gates) {
    const r = spawnSync(commandFor(cmd, dir), { shell: true, cwd: CWD, encoding: "utf8", timeout: 120000 });
    out.push({ name, code: r.status === null ? 2 : r.status });
  }
  return out;
}

async function cmdProbe(args) {
  const P = L.probe;
  const topArg = Number(args[args.indexOf("--top") + 1]);
  const TOP = args.includes("--top") && Number.isFinite(topArg) && topArg > 0 ? topArg : 5;

  console.log(c.bold(`\n${P.title}\n`));

  const man = await readManifest();
  const gates = scanningGates(man);
  if (!gates.length) { console.log(c.yellow(`  ${P.noGates(`${SELF} add <имя>`)}\n`)); return; }

  const raw = gitLog(2000);
  if (raw === null) { console.log(c.yellow(`  ${P.noGit}\n`)); return; }
  const hot = fixHotspots(raw, { isCode }).slice(0, TOP);
  if (!hot.length) { console.log(c.yellow(`  ${P.noFixes}\n`)); return; }

  // Записи каталога, применимые к ЭТОМУ репозиторию. Показывать пробы записей, которые
  // проекту не подходят, значит советовать закрыть дыру, которой нет.
  const facts = await detectFacts();
  const catalog = await readCatalog();
  const entries = catalog.filter((e) => triggerVerdict(e, facts).applies);

  console.log(c.dim(`  ${P.method(hot.length, entries.length)}\n`));

  let blind = 0;
  for (const { path: rel, fixes } of hot) {
    console.log(`  ${c.bold(rel)}  ${c.dim(P.fixes(fixes))}`);
    const ext = extname(rel).toLowerCase();
    let probed = 0;

    for (const e of entries) {
      const sample = await redSampleFor(e.slug, ext);
      if (!sample) continue;
      probed++;
      const dir = await buildProbe(rel, sample);
      let results;
      try { results = runGates(gates, dir); } finally { await rm(dir, { recursive: true, force: true }); }
      const verdict = probeVerdict(results);
      const caught = results.filter((r) => r.code === 1).map((r) => r.name);
      if (verdict === "caught") {
        console.log(`    ${c.green("✔")}  ${e.intent.padEnd(48)} ${c.dim(P.caught(caught.join(", ")))}`);
      } else if (verdict === "blind") {
        blind++;
        console.log(`    ${c.red("✘")}  ${e.intent.padEnd(48)} ${c.red(P.blind)}`);
        console.log(c.dim(`         ${P.install(`${SELF} add ${e.slug}`)}`));
      } else {
        console.log(`    ${c.dim("~")}  ${c.dim(e.intent.padEnd(48))} ${c.dim(P.unknown)}`);
      }
    }
    if (!probed) console.log(c.dim(`    ${P.noSampleFor(ext || "—")}`));
  }

  console.log(blind ? c.yellow(`\n  ${P.summaryBlind(blind)}\n`) : c.green(`\n  ${P.summaryClean}\n`));
}

export { cmdProbe, scanningGates, isCode };
