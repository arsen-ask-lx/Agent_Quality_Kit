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
import { mkdtemp, mkdir, copyFile, rm, readdir, writeFile, readFile, symlink } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, extname } from "node:path";
import { readManifest } from "../lib/manifest.mjs";
import { fixHotspots, probeSummary, probeVerdictPaired, countProbe } from "../lib/history.mjs";
import { detectFacts, readCatalog, triggerVerdict } from "../lib/repo.mjs";
import { CWD, GATES_SRC, TARGET_DIR, c, SELF, exists } from "../lib/core.mjs";
import { probeState, probeEvery, PROBE_EVERY } from "../lib/cadence.mjs";
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

// Мелкий клон истории не содержит. `fetch-depth: 2` в конвейере — обычная настройка, и на нём
// рейтинг починок пуст ВСЕГДА. Сказать там «коммитов-починок не найдено» значит выдать
// отсутствие данных за факт о репозитории: та же подмена, что «зелено, потому что не
// проверялось». Найдено собственным конвейером 2026-09-09.
function isShallow() {
  const r = spawnSync("git", ["rev-parse", "--is-shallow-repository"], { cwd: CWD, encoding: "utf8" });
  return r.status === 0 && String(r.stdout || "").trim() === "true";
}

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

// Сколько коммитов в репозитории сейчас. Единица каденции — коммиты, а не сутки: месяц без
// работы перепроверять незачем, а сто коммитов за день — надо.
function commitCount() {
  const r = spawnSync("git", ["rev-list", "--count", "HEAD"], { cwd: CWD, encoding: "utf8" });
  if (r.status !== 0) return null;
  const n = Number(String(r.stdout || "").trim());
  return Number.isFinite(n) ? n : null;
}

const MARK = () => join(CWD, TARGET_DIR, "last-probe.md");

// Отметка о прошлой пробе. Формат человеческий намеренно: файл читают глазами и агентом,
// а не только программой. Разбирается одна строка — та, что несёт число коммитов.
async function readMark() {
  try {
    const text = await readFile(MARK(), "utf8");
    const m = /^at:\s*(\d+)/m.exec(text);
    return m ? { at: Number(m[1]), text } : {};
  } catch { return null; }
}

async function writeMark(now, blind, lines) {
  await mkdir(join(CWD, TARGET_DIR), { recursive: true });
  const body = [
    "# Проба покрытия — что объявленные проверки НЕ видят",
    "",
    `at: ${now === null ? "?" : now}`,
    `blind: ${blind}`,
    "",
    ...lines,
    "",
    "Файл эфемерный: его переписывает каждая проба. В .gitignore его стоит держать самому.",
  ].join("\n");
  await writeFile(MARK(), body + "\n", "utf8");
}


// Отчего проба не состоялась. Раньше здесь было три состояния: гейты, чья команда не кончается
// каталогом, объявлялись непригодными — подставить образец было некуда. С песочницей подставлять
// в команду больше не нужно: образец кладётся в КОПИЮ ПРОЕКТА, а гейт запускается в ней как есть.
// Поэтому пригодна любая непустая команда, и состояний осталось два.
function gatesState(man) {
  const gates = man?.gates && typeof man.gates === "object" && !Array.isArray(man.gates) ? man.gates : {};
  const declared = Object.entries(gates)
    .map(([name, raw]) => [name, String(raw || "").trim()])
    .filter(([, cmd]) => cmd);
  if (!declared.length) return { state: "none", declared: 0, probeable: 0 };
  return { state: "ok", declared: declared.length, probeable: declared.length };
}

// Гейты, пригодные для пробы: все объявленные с непустой командой.
function probeableGates(man) {
  const gates = man?.gates && typeof man.gates === "object" && !Array.isArray(man.gates) ? man.gates : {};
  return Object.entries(gates)
    .map(([name, raw]) => [name, String(raw || "").trim()])
    .filter(([, cmd]) => cmd);
}

// Семьи расширений. Образец подбирается по ТОЧНОМУ расширению, и правило верное: питоновский
// образец в проекте на TypeScript не проверит ничего, а покажет «не прикрыто» — ложная тревога
// того же класса, что молчащий гейт, только наоборот.
//
// Но `.js` и `.mjs` — одно и то же содержимое, а не два языка. Прогон на самом комплекте
// 2026-09-10: два горячих файла из пяти — `.mjs`, и обоим ответили «нет образца под .mjs»;
// комплект целиком написан в этом расширении, то есть проба была слепа к собственному коду.
// Заводить второй набор файлов ради той же строчки — дублирование, которое разойдётся.
//
// Семьи узкие намеренно: `.jsx`/`.tsx` сюда не входят, у них своя разметка.
const EXT_FAMILIES = [[".js", ".mjs", ".cjs"], [".ts", ".mts", ".cts"]];

function extAlternatives(ext) {
  const fam = EXT_FAMILIES.find((f) => f.includes(ext));
  return fam ? [ext, ...fam.filter((e) => e !== ext)] : [ext];
}

// Показать САМ ОБРАЗЕЦ, а не пересказ. «Класс не прикрыт» остаётся словами, пока человек не
// увидел, что именно мы подсадили в его файл.
//
// Первая версия печатала одну «показательную» строку — и угадывала плохо: у мёртвого кода дефект
// во ВТОРОЙ функции, у отладочной печати во второй строке тела. Угадывать не надо: образцы
// каталога маленькие по норме, и четырёх строк хватает, чтобы стало видно. Комментарии
// выброшены: в наших образцах они объясняют замысел коллеге, а не показывают дефект.
function sampleLines(path, max = 4) {
  let text = "";
  try { text = readFileSync(path, "utf8"); } catch { return []; }
  return text.split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.trim() && !/^\s*(#|\/\/|\/\*|\*|--|<!--)/.test(l))
    .slice(0, max)
    .map((l) => l.slice(0, 88));
}

// Совет по НЕПОКРЫТОМУ классу: команда, которую можно вставить прямо сейчас.
//
// Проба находит настоящие дыры и печатала про них «close it: aqk add <имя>» — то есть «поставь
// нашу штуку». Человек, впервые увидевший комплект, закрывает окно. А готовая однострочная
// команда под его стек У НАС УЖЕ ЛЕЖИТ в `recipes` записи каталога; мы её не показывали.
//
// Замер руками на `requests` (самый скачиваемый python-пакет) 2026-09-10: в
// `src/requests/utils.py` — 75 коммитов-починок; дописана функция с `except Exception: pass`;
// их собственные `ruff` и `pytest` дали 0 и на чистой копии, и на подсаженной. Строка, которая
// поймала бы это, лежала в нашем каталоге всё это время.
//
// Переносимый рецепт (`any`) в совет НЕ идёт: он зовёт файл из комплекта, и человеку без
// комплекта вставить его некуда. Нет родного рецепта под стек — команды нет, и это честнее
// выдуманной.
function blindAdvice(entry, facts, hot = {}) {
  const recipes = entry?.recipes && typeof entry.recipes === "object" ? entry.recipes : {};
  // `langs` приходит МНОЖЕСТВОМ, а не массивом — `Array.isArray` тихо давал пустой список, и
  // совет не печатался вовсе. Поймано на живом `requests`: langs = Set(1) { python }.
  const langs = facts?.langs ? [...facts.langs] : [];
  let cmd = null;
  for (const lang of langs) {
    const r = recipes[lang];
    if (!r || /\{gate\}/.test(r)) continue;
    cmd = String(r).replace(/\{dir\}/g, ".").trim();
    break;
  }
  return { command: cmd, file: hot.file ?? null, fixes: hot.fixes ?? null, slug: entry?.slug ?? null };
}

// Красный образец записи, подходящий по расширению горячего файла. Расширение обязано
// совпадать: питоновский образец в проекте на TypeScript не проверит ничего, а покажет
// «не прикрыто» — ложная тревога того же класса, что молчащий гейт, только наоборот.
async function redSampleFor(entry, ext) {
  const dir = join(GATES_SRC, entry, "red");
  if (!(await exists(dir))) return null;
  let names = [];
  try { names = await readdir(dir); } catch { return null; }
  for (const want of extAlternatives(ext)) {
    const hit = names.find((n) => extname(n).toLowerCase() === want);
    if (hit) return join(dir, hit);
  }
  return null;
}

// Песочница: КОПИЯ ПРОЕКТА, в которую подсаживается образец. Раньше здесь был временный каталог
// с одним файлом, а путь к нему подставлялся в команду гейта — отчего пробовать можно было
// только команды, кончающиеся каталогом. Замер 2026-09-10 на семи чужих репозиториях: у шести
// команды такие (`xo`, `eslint lib/**/*.js`, `mocha --require…`, `pytest`), и проба не
// запускалась вовсе.
//
// Способ взят из мутационного тестирования, где та же задача решена двадцать лет назад: Stryker
// копирует проект во временный каталог, СИМЛИНКУЕТ `node_modules` и гоняет там родную команду.
// Копируются только ОТСЛЕЖИВАЕМЫЕ файлы (`git archive HEAD`) — рабочее дерево не трогается, а
// мусор сборки не тащится; тяжёлые каталоги зависимостей симлинкуются, иначе `npm test` в
// песочнице падал бы с «модуль не найден», и это читалось бы как сбой инструмента.
const DEP_DIRS = ["node_modules", ".venv", "venv", "vendor", "target", ".tox", ".bundle"];

async function buildSandbox() {
  // Копируется РАБОЧЕЕ ДЕРЕВО, а не HEAD. Первая версия брала `git archive HEAD`, и это было
  // неверно: комплект зовут из хука ДО коммита, и пользователь пробует то, что у него сейчас,
  // а не то, что уже записано. На свежем `init` + `add` без коммита проба вообще ничего не
  // видела — гейты в песочнице отсутствовали и «не запускались».
  //
  // Список — `git ls-files --cached --others --exclude-standard`: отслеживаемые плюс новые, но
  // БЕЗ игнорируемых. Игнорируемое — это сборка и зависимости; первое пробе не нужно, второе
  // приходит симлинком.
  //
  // Копирование средствами node, а не `tar`: у конвейера есть windows-задание, и полагаться на
  // ключи GNU tar там нельзя.
  const r = spawnSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    cwd: CWD, encoding: "utf8", timeout: 60000, maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) return null;
  const files = String(r.stdout || "").split("\0").filter(Boolean);
  if (!files.length) return null;

  const root = await mkdtemp(join(tmpdir(), "aqk-sandbox-"));
  const made = new Set();
  for (const rel of files) {
    const dest = join(root, rel);
    const dir = dirname(dest);
    if (!made.has(dir)) { await mkdir(dir, { recursive: true }); made.add(dir); }
    // Файл мог исчезнуть между списком и копией, а каталог — оказаться подмодулем.
    try { await copyFile(join(CWD, rel), dest); } catch { /* пропускаем, не роняя пробу */ }
  }
  for (const dep of DEP_DIRS) {
    const from = join(CWD, dep);
    if (await exists(from)) { try { await symlink(from, join(root, dep), "junction"); } catch { /* уже есть */ } }
  }
  return root;
}

// Подсадка образца на место горячего файла и возврат как было. Файл СНАЧАЛА удаляется:
// в песочнице он может быть жёсткой ссылкой, и запись поверх задела бы оригинал.
async function plant(root, relPath, sample) {
  const dest = join(root, relPath);
  await mkdir(dirname(dest), { recursive: true });
  let backup = null;
  try { backup = await readFile(dest); } catch { /* файла может не быть */ }
  await rm(dest, { force: true });
  await copyFile(sample, dest);
  return async () => {
    await rm(dest, { force: true });
    if (backup !== null) await writeFile(dest, backup);
  };
}

// Гейт запускается В ПЕСОЧНИЦЕ и командой КАК ЕСТЬ — ничего в неё не подставляется. Именно это
// и делает пробу независимой от формы команды.
//
// `stopOnRed` — ранний выход: как только гейт покраснел, вердикт «поймано» уже получен, и гонять
// остальные незачем. На сухом прогоне выхода нет: там нужны ВСЕ длительности и все коды.
function runGates(gates, sandbox, { stopOnRed = false } = {}) {
  const out = [];
  for (const [name, cmd] of gates) {
    const t0 = Date.now();
    const r = spawnSync(cmd, { shell: true, cwd: sandbox, encoding: "utf8", timeout: 120000 });
    const code = r.status === null ? 2 : r.status;
    out.push({ name, code, ms: Date.now() - t0 });
    if (stopOnRed && code === 1) break;
  }
  return out;
}

// Каким гейтом пробовать и в каком порядке.
//
// Цена пробы = (файлы × записи) × сумма длительностей гейтов. На самом комплекте после перехода
// на песочницу это стало больше десяти минут и упёрлось в таймаут: среди тридцати гейтов есть
// `smoke` на 58 секунд, и он гонялся заново на каждую подсадку. Команда, идущая четверть часа,
// не запускается никем.
//
// Длительности берутся из сухого прогона, который и так обязателен. Порядок — от быстрых к
// медленным, чтобы ранний выход срабатывал раньше. Слишком медленные исключаются, но НЕ молча:
// их имена обязаны попасть в вывод, иначе «никто не ловит» будет означать «никто из тех, кого
// мы решили спросить».
const SLOW_MS = 20000;

function planProbeGates(before, { slowMs = SLOW_MS } = {}) {
  const usable = before.filter((r) => r.code === 0).sort((a, b) => (a.ms || 0) - (b.ms || 0));
  return {
    use: usable.filter((r) => (r.ms || 0) <= slowMs),
    tooSlow: usable.filter((r) => (r.ms || 0) > slowMs),
  };
}

// `auto` — проба запущена САМА, по каденции, из `doctor --run`. Тогда она короче и говорит
// вслух, почему случилась: команда, возникшая без спроса, обязана объяснить себя, иначе её
// читают как сбой.
async function cmdProbe(args, { auto = false } = {}) {
  const P = L.probe;
  const topArg = Number(args[args.indexOf("--top") + 1]);
  const TOP = args.includes("--top") && Number.isFinite(topArg) && topArg > 0 ? topArg : (auto ? 3 : 5);

  console.log(c.bold(`\n${P.title}\n`));

  const man = await readManifest();
  const gates = probeableGates(man);
  const gs = gatesState(man);
  if (gs.state === "none") { console.log(c.yellow(`  ${P.noGates(`${SELF} add <имя>`)}\n`)); return; }

  const raw = gitLog(2000);
  if (raw === null) { console.log(c.yellow(`  ${P.noGit}\n`)); return; }
  const hot = fixHotspots(raw, { isCode }).slice(0, TOP);
  if (!hot.length) { console.log(c.yellow(`  ${isShallow() ? P.shallow : P.noFixes}\n`)); return; }

  // Записи каталога, применимые к ЭТОМУ репозиторию. Показывать пробы записей, которые
  // проекту не подходят, значит советовать закрыть дыру, которой нет.
  const facts = await detectFacts();
  const catalog = await readCatalog();
  const entries = catalog.filter((e) => triggerVerdict(e, facts).applies);

  // ПЕСОЧНИЦА строится ОДИН раз на прогон, а не на каждую пробу: копия отслеживаемых файлов
  // стоит доли секунды, но умножать её на файлы × записи незачем — между пробами меняется
  // ровно один файл.
  const sandbox = await buildSandbox();
  if (!sandbox) { console.log(c.yellow(`  ${P.noSandbox}\n`)); return; }

  try {
  // СУХОЙ ПРОГОН по чистой песочнице. Без него «покраснел от подсадки» неотличимо от «был
  // красным и до неё»: у чужого проекта гейты краснеют на своём накопленном долге, и
  // засчитывать эту красноту за поимку значит выдавать чужой долг за свою заслугу.
  // В мутационном тестировании этот прогон обязателен по той же причине.
  const before = runGates(gates, sandbox);
  const plan = planProbeGates(before);
  if (!plan.use.length) {
    const red = before.filter((r) => r.code === 1).map((r) => r.name);
    const broke = before.filter((r) => r.code !== 0 && r.code !== 1).map((r) => r.name);
    if (plan.tooSlow.length) console.log(c.yellow(`  ${P.allSlow(plan.tooSlow.map((g) => g.name))}\n`));
    else console.log(c.yellow(`  ${P.noBaseline(red, broke)}\n`));
    return;
  }
  // Пробуем только запланированными, в порядке плана.
  const byName = new Map(gates);
  const probeGates = plan.use.map((g) => [g.name, byName.get(g.name)]);
  const baseline = plan.use.map((g) => ({ name: g.name, code: g.code }));

  console.log(c.dim(`  ${P.method(hot.length, entries.length, plan.use.length)}\n`));
  if (plan.tooSlow.length) {
    console.log(c.dim(`  ${P.tooSlow(plan.tooSlow.map((g) => `${g.name} (${Math.round(g.ms / 1000)}s)`))}\n`));
  }

  // Записи проб: по ним считаются КЛАССЫ, а не события. Счётчики на месте были
  // событиями и втрое завышали итог — см. countProbe.
  const records = [];
  let unprobedN = 0;
  for (const { path: rel, fixes } of hot) {
    console.log(`  ${c.bold(rel)}  ${c.dim(P.fixes(fixes))}`);
    const ext = extname(rel).toLowerCase();
    let probed = 0;

    for (const e of entries) {
      const sample = await redSampleFor(e.slug, ext);
      if (!sample) continue;
      probed++;
      const restore = await plant(sandbox, rel, sample);
      let after;
      try { after = runGates(probeGates, sandbox, { stopOnRed: true }); } finally { await restore(); }
      // Ранний выход обрывает список: гейты, до которых не дошли, считаются такими же, как на
      // сухом прогоне. Иначе их отсутствие прочиталось бы как сбой запуска.
      const seen = new Set(after.map((a) => a.name));
      const full = after.concat(baseline.filter((b) => !seen.has(b.name)));
      const r = probeVerdictPaired(baseline, full);
      const verdict = r.verdict;
      const caught = full.filter((a) => a.code === 1 && baseline.find((b) => b.name === a.name)?.code === 0)
        .map((a) => a.name);
      records.push({ entry: e.slug, file: rel, verdict });
      if (verdict === "caught") {
        console.log(`    ${c.green("✔")}  ${e.intent.padEnd(48)} ${c.dim(P.caught(caught.join(", ")))}`);
      } else if (verdict === "blind") {
        console.log(`    ${c.red("✘")}  ${e.intent.padEnd(48)} ${c.red(P.blind)}`);
        // Объяснить, а не назвать. Три строки, каждая отвечает на свой вопрос человека:
        // «почему именно здесь», «что вы вообще подсадили» и «что мне сделать ПРЯМО СЕЙЧАС».
        // Последняя обязана работать БЕЗ комплекта: польза до установки — единственный
        // способ заслужить установку.
        const adv = blindAdvice(e, facts, { file: rel, fixes });
        console.log(c.dim(`         ${P.blindWhere(rel, fixes)}`));
        const lines = sampleLines(sample);
        if (lines.length) {
          console.log(c.dim(`         ${P.blindWhat}`));
          for (const l of lines) console.log(c.dim(`           ${l}`));
        }
        if (adv.command) console.log(`         ${c.yellow(P.blindFix(adv.command))}`);
        console.log(c.dim(`         ${P.install(`${SELF} add ${e.slug}`)}`));
      } else {
        console.log(`    ${c.dim("~")}  ${c.dim(e.intent.padEnd(48))} ${c.dim(P.unknown)}`);
      }
    }
    if (!probed) { unprobedN++; console.log(c.dim(`    ${P.noSampleFor(ext || "—")}`)); }
  }

  const n = countProbe(records);
  const blind = n.blindClasses;
  const state = probeSummary({
    caught: n.caughtClasses, blind, unknown: n.unknownClasses, unprobed: unprobedN,
  });
  const say = {
    blind: () => c.yellow(P.summaryBlind(blind, n.probes)),
    partial: () => c.yellow(P.summaryPartial(n.caughtClasses, n.unknownClasses, unprobedN)),
    clean: () => c.green(P.summaryClean),
    "nothing-ran": () => c.yellow(P.summaryNothingRan(n.unknownClasses)),
    "nothing-probed": () => c.yellow(P.summaryNothingProbed(unprobedN)),
  };
  console.log(`\n  ${say[state]()}\n`);

  // Отметка нужна не для отчёта, а для КАДЕНЦИИ: по ней следующий прогон поймёт, что пора.
  // Без неё команда снова становится тем, о чём надо вспомнить.
  await writeMark(commitCount(), blind, hot.map(({ path: p2, fixes }) => `- ${p2} (${P.fixes(fixes)})`));
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
}

// Состояние пробы для тех, кто только ПОКАЗЫВАЕТ его: прогон и блок для агента.
//
// Порог берётся из манифеста (`probe: 250`), умолчание — PROBE_EVERY. Непонятое значение не
// подменяется умолчанием молча: в манифесте было бы написано одно, а происходило бы другое.
// Возвращается пометка `badEvery`, и вызывающий говорит о ней вслух.
async function probeStatus() {
  const man = await readManifest();
  const every = probeEvery(man);
  if (every === null) return { state: "unknown", behind: null, badEvery: String(man?.probe) };
  if (every === 0) return { state: "off", behind: null };
  return probeState(await readMark(), commitCount(), every);
}

export { cmdProbe, probeStatus, probeableGates, gatesState, extAlternatives, planProbeGates, blindAdvice, isCode };
