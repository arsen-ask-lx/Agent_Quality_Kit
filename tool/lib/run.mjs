// tool/lib/run.mjs — ПРОГОН объявленных гейтов, отдельно от команды, которая его показывает.
//
// ЗАЧЕМ ОТДЕЛЬНЫЙ ФАЙЛ. Прогон жил внутри `doctor.mjs`, и `report.mjs` с `badge.mjs` лезли за
// ним ИЗ КОМАНДЫ В КОМАНДУ. Это не деталь: команда — это то, что человек набирает, а прогон —
// то, что делает машина; у них разные причины меняться, и импорт команды из команды прятал
// этот шов.
//
// Вскрылось 2026-09-10 нашим же гейтом: `doctor.mjs` дорос до 508 строк при пределе 500 —
// файл был полон, и любая следующая правка ложилась туда просто потому, что «так ближе по
// контексту». Ровно то, о чём предупреждает совет самого гейта.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { scopeOutput, splitAdvice, changedFiles } from "./scope.mjs";
import { CWD, c, die } from "./core.mjs";
import { advisorySet } from "./manifest.mjs";
import { L } from "../i18n/index.mjs";
import { gateCommand } from "./execution.mjs";
import { annotations } from "./annotate.mjs";


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

// Ссылка, относительно которой сужается вывод: `--since main`, `--since HEAD~5`.
// Без значения флаг бессмыслен — молча взять умолчание нельзя: «сужено не тем» неотличимо
// от «не сужено».
function sinceRef(argv = process.argv) {
  const i = argv.indexOf("--since");
  if (i === -1) return null;
  const v = argv[i + 1];
  return v && !v.startsWith("-") ? v : null;
}

// СТРОКА «ИДЁТ». Гейт идёт через spawnSync, и строка про него печаталась только по завершении:
// минута `smoke` — минута пустого экрана, «работает» неотличимо от «повисло», и человек пишет
// сам, не дождавшись. Просьба владельца 2026-09-10: «я запустил и должен видеть, как идёт».
//
// Только в терминал. В пайп и в конвейер — ни байта: лог там читают глазами и разбирают
// машиной, и строка, переписанная возвратом каретки, в файле превращается в мусор.
// Секунды не тикают: для этого нужен асинхронный запуск и убийство группы процессов на
// таймауте, а у нас windows в конвейере. Имя и номер гейта отвечают на вопрос и без них.
function progress({ tty = process.stdout.isTTY, write = (s) => process.stdout.write(s) } = {}) {
  let shown = false;
  return {
    show(text) {
      if (!tty) return;
      if (shown) write("\r\x1b[K");
      write(text);
      shown = true;
    },
    clear() {
      if (!tty || !shown) return;
      write("\r\x1b[K");
      shown = false;
    },
  };
}

// ГРУППЫ И --only / --skip. Отзыв с живого проекта 2026-09-11: гейт цены меряет план на
// засеянной базе — объявишь, и он валит прогон без стенда; уберёшь, и promise-has-gate справедливо
// ругается. Прогон бывал только «всё или ничего». `groups:` в манифесте называет смысл
// («этим нужен стенд»), флаги выбирают. Неизвестное имя — ошибка: опечатка `--skip stak` не
// должна тихо превращаться в «пропустили ничего». Пропущенные называются, а не исчезают.
function listArg(argv, flag) {
  const out = [];
  argv.forEach((a, i) => { if (a === flag && argv[i + 1] && !argv[i + 1].startsWith("--")) out.push(...argv[i + 1].split(",")); });
  return out.map((x) => x.trim()).filter(Boolean);
}

function selectGates(gates, man, { only = [], skip = [] } = {}) {
  const groups = man?.groups && typeof man.groups === "object" && !Array.isArray(man.groups) ? man.groups : {};
  const declared = new Set(gates.map(([n]) => n));
  const unknown = [];
  const expand = (list) => {
    const out = new Set();
    for (const name of list) {
      const g = groups[name];
      const members = Array.isArray(g) ? g : typeof g === "string" && g ? [g] : null;
      if (members) for (const m of members) (declared.has(m) ? out.add(m) : unknown.push(m));
      else if (declared.has(name)) out.add(name);
      else unknown.push(name);
    }
    return out;
  };
  const onlySet = only.length ? expand(only) : null;
  const skipSet = expand(skip);
  const run = gates.filter(([n]) => (!onlySet || onlySet.has(n)) && !skipSet.has(n));
  const kept = new Set(run.map(([n]) => n));
  return { run, skipped: gates.map(([n]) => n).filter((n) => !kept.has(n)), unknown: [...new Set(unknown)] };
}

const GATE_TIMEOUT = 300000;

// Один гейт в этом потоке — прежний путь, без `--jobs`.
function spawnGate(cmd) {
  return spawnSync(gateCommand(cmd), { shell: true, cwd: CWD, encoding: "utf8", timeout: GATE_TIMEOUT });
}

// ПАРАЛЛЕЛЬНО — ПО ФЛАГУ. Отзыв с живого проекта 2026-09-11: 34 независимых гейта шли друг за
// другом больше минуты. Но у чужих проектов гейты бывают зависимыми — два `npm run build` в одну
// папку `dist/` при одновременном запуске дадут плавающие падения, а плавающее красное хуже
// медленного. Поэтому без флага всё как было, по одному. Результаты — массив обещаний в порядке
// объявления: вывод печатается по порядку, какой бы гейт ни кончился первым.
function startPool(cmds, jobs) {
  const url = new URL("./gate-worker.mjs", import.meta.url);
  const results = cmds.map(() => { let res; const pr = new Promise((r) => { res = r; }); pr.res = res; return pr; });
  let next = 0;
  const feed = (w) => {
    if (next >= cmds.length) { w.terminate(); return; }
    const id = next++;
    const onErr = (e) => { results[id].res({ status: null, stdout: "", stderr: String(e?.message || e), error: { code: "WORKER" } }); };
    w.once("error", onErr);
    w.once("message", (m) => { w.off("error", onErr); results[id].res(m); feed(w); });
    w.postMessage({ id, cmd: cmds[id], cwd: CWD, timeout: GATE_TIMEOUT });
  };
  for (let i = 0; i < Math.min(jobs, cmds.length); i++) feed(new Worker(url));
  return results;
}

async function runGates(man, opts = {}) {
  const all = declaredGates(man);
  if (!all.length) return { failed: 0, ran: 0, results: [], skipped: [] };
  const sel = selectGates(all, man, opts);
  if (sel.unknown.length) die(L.doctor.selectUnknown(sel.unknown.join(", "), Object.keys(man?.groups || {}).join(", ")));
  const gates = sel.run;
  const advisory = advisorySet(man);
  const bar = progress();

  // Сужение по дифу — договор с человеком, и он должен видеть, ЧТО именно сужено. Пустой диф
  // называется вслух: иначе «все гейты зелёные» означало бы «сравнили не с тем» и читалось бы
  // как успех. Это тот же класс, что и весь стандарт, только внутри нашего флага.
  const scoped = opts.since ? changedFiles(opts.since, CWD) : null;
  if (opts.since && scoped === null) die(L.doctor.sinceBadRef(opts.since));
  if (scoped) console.log(c.dim(`\n  ${L.doctor.sinceHeading(opts.since, scoped.size)}`));

  console.log(c.bold(`\n  ${L.doctor.runHeading}\n`));
  if (sel.skipped.length) console.log(c.yellow(`  ${L.doctor.selectSkipped(sel.skipped.join(", "))}\n`));
  let failed = 0;
  const results = [];
  const quietOk = [];

  const jobs = Math.max(1, Number(opts.jobs) || 1);
  const pooled = jobs > 1 ? startPool(gates.map(([, cmd]) => cmd), jobs) : null;
  const tStart = Date.now();
  for (const [i, [name, cmd]] of gates.entries()) {
    bar.show(`  ${c.dim("⋯")}  ${name.padEnd(14)} ${c.dim(L.doctor.running(i + 1, gates.length))}`);
    const t0 = pooled ? tStart : Date.now();
    const r = pooled ? await pooled[i] : spawnGate(cmd);
    bar.clear();
    // При --jobs время гейта от начала прогона: точнее не узнать без часов в потоке, и честнее
    // так и считать, чем приписать гейту чужое ожидание в очереди.
    const secs = (Math.max(0, Date.now() - t0) / 1000).toFixed(1);
    // Вывод гейта запоминается целиком (с потолком, чтобы болтливый инструмент не съел память):
    // по нему считается покрытие дифа — какой файл вообще был назван хоть одной проверкой.
    // Без этого «готово = доказано» остаётся правилом, за которым следит только человек.
    const outAll = `${r.stdout || ""}${r.stderr || ""}`.slice(0, 200000);

    if (r.error && r.error.code === "ETIMEDOUT") {
      console.log(`  ${c.red("✘")}  ${name.padEnd(14)} ${c.red(L.doctor.timeout)}`);
      failed++;
      results.push({ name, cmd, ok: false, secs, note: L.doctor.timeout, out: outAll });
      continue;
    }
    const code = r.status;
    if (code === 0) {
      // Совещательный называется и когда он зелёный. Иначе гейт, который уронить прогон НЕ
      // МОЖЕТ, по выводу неотличим от того, который может, — и список `advisory:` в манифесте
      // виден только в тот день, когда он покраснел. Измерено 2026-09-09: зелёный
      // совещательный печатался обычной галочкой, а README обещал, что список назван каждый
      // прогон. Тот же класс, что молчащий гейт, только про сам прибор.
      const quiet = advisory.has(name) ? ` ${c.yellow(L.doctor.advisoryQuiet)}` : "";
      // Зелёный гейт иногда всё-таки говорит человеку что-то важное: храповик, дошедший до цели,
      // просит убрать обёртку. Вывод успешного гейта не показывался вовсе, и это сообщение
      // уходило в никуда — тот же класс, что обрезанный совет у красного, только тише.
      // Показываем ровно строки с меткой совета: остальной вывод успешной проверки — шум.
      const okAdvice = splitAdvice(`${r.stdout || ""}${r.stderr || ""}`.trim().split("\n").filter(Boolean)).advice;
      // Без `--verbose` зелёный гейт своей строки не получает — если ему нечего сказать. Совещательный
      // и гейт с советом печатаются всегда: первый обязан быть назван каждый прогон (см. выше),
      // второй несёт строку, ради которой человек и смотрит.
      if (opts.verbose || quiet || okAdvice.length) console.log(`  ${c.green("✔")}  ${name.padEnd(14)}${quiet} ${c.dim(`${secs}s · ${cmd}`)}`);
      else quietOk.push(name);
      for (const line of okAdvice.slice(0, 6)) console.log(c.yellow(`        ${line.trim().slice(0, 110)}`));
      results.push({ name, cmd, ok: true, secs, advisory: advisory.has(name), out: outAll });
    } else {
      const raw = `${r.stdout || ""}${r.stderr || ""}`.trim().split("\n").filter(Boolean);
      // Совет отделяется ДО сужения. Иначе он сам попадает под фильтр по путям: сообщение
      // храповика про вышедший срок называет путь к реестру, реестра в дифе нет, и гейт,
      // обязанный краснеть по сроку, печатался зелёным с пометкой «находки вне дифа».
      // Ровно то, что стандарт запрещает: срок без последствия. Найдено ревью 2026-09-06.
      const parted = splitAdvice(raw);
      let out = parted.findings;
      const alwaysAdvice = parted.advice;

      // Сужение до дифа. Три исхода, и все три называются вслух.
      if (scoped) {
        const s = scopeOutput(out, scoped);
        // Гейт, у которого находок нет вовсе, а есть только совет, сузить нечем: его вердикт
        // не про файлы. Признать такой успешным — вернуть ту же тишину другим путём.
        if (!s.scopable || out.length === 0) {
          // Гейт печатает вердикт без путей — сузить нечем. Признать его успешным значило бы
          // выдать провал за тишину; остаётся красным, и причина названа.
          // Совещательный не роняет прогон НИКОГДА — в том числе здесь. Раньше failed++ стоял
          // безусловно, и гейт, объявленный совещательным, валил сборку с `--since` только
          // потому, что в его выводе нет путей. Измерено 2026-09-09.
          const nsAdv = advisory.has(name);
          const nsMark = nsAdv ? c.yellow("!") : c.red("✘");
          const nsVerdict = nsAdv ? c.yellow(L.doctor.advisoryMark) : c.red(L.doctor.exitCode(code));
          console.log(`  ${nsMark}  ${name.padEnd(14)} ${nsVerdict} ${c.dim(`· ${L.doctor.notScopable}`)}`);
          if (!nsAdv) failed++;
          results.push({ name, cmd, ok: false, secs, code, advisory: nsAdv, note: L.doctor.notScopable, out: outAll });
          continue;
        }
        if (s.findings === 0) {
          // Долг есть, но не в том, что внёс диф. Зелёный — но с числом спрятанного: молчаливое
          // «всё хорошо» здесь было бы неправдой.
          const sQuiet = advisory.has(name) ? ` ${c.yellow(L.doctor.advisoryQuiet)}` : "";
          console.log(`  ${c.green("✔")}  ${name.padEnd(14)}${sQuiet} ${c.dim(`${secs}s · ${L.doctor.outsideDiff(out.length)}`)}`);
          results.push({ name, cmd, ok: true, secs, advisory: advisory.has(name), scopedAway: out.length, out: outAll });
          continue;
        }
        out = s.kept;
      }

      failed++;
      // Находки обрезаются, совет — никогда. Все записи каталога печатают «почини: …» последней
      // строкой, и при обрезке до трёх строк человек не видел именно её: находка без действия
      // закрывает окно, а не дефект.
      // Совещательный гейт показывает находки и не роняет прогон. Знак другой, чтобы «показано»
      // и «провалено» не читались одинаково; в сводке ниже он назван поимённо.
      const isAdvisory = advisory.has(name);
      if (isAdvisory) failed--;
      const mark = isAdvisory ? c.yellow("!") : c.red("✘");
      const verdict = isAdvisory ? c.yellow(L.doctor.advisoryMark) : c.red(L.doctor.exitCode(code));
      console.log(`  ${mark}  ${name.padEnd(14)} ${verdict} ${c.dim(`· ${secs}s · ${cmd}`)}`);
      // ГОЛОВА И ХВОСТ, А НЕ ТОЛЬКО ГОЛОВА. Гейт, который сам является прогоном (наш `smoke`),
      // печатает сотни строк, и вердикт у него в конце — при обрезке до первых трёх человек
      // видел «программа разбирается» и ни слова о том, что упало. Час поисков в конвейере
      // 2026-09-09 стоил ровно этого. Голова нужна тоже: у сканирующих записей находки идут
      // с первой строки.
      const HEAD = 3, TAIL = 2;
      for (const line of out.slice(0, HEAD)) console.log(c.dim(`        ${line.slice(0, 100)}`));
      if (out.length > HEAD + TAIL) {
        console.log(c.dim(`        ${L.doctor.moreLines(out.length - HEAD - TAIL)}`));
        for (const line of out.slice(-TAIL)) console.log(c.dim(`        ${line.slice(0, 100)}`));
      } else {
        for (const line of out.slice(HEAD)) console.log(c.dim(`        ${line.slice(0, 100)}`));
      }
      // Совет тоже не бесконечен: гейт, зовущий помощник шесть раз, печатает его шесть раз.
      for (const line of alwaysAdvice.slice(0, 6)) console.log(c.yellow(`        ${line.trim().slice(0, 110)}`));
      // `shown` — то, что прогон ПОКАЗАЛ: после сужения по дифу и с советом. Пометки в pull request
      // берутся отсюда, а не из сырого вывода: иначе при --since они вешались бы на файлы вне
      // дифа — поймано конвейером на первом же прогоне (smoke: «--since сузил не то»).
      results.push({ name, cmd, ok: false, secs, code, advisory: isAdvisory, out: outAll, shown: [...out, ...alwaysAdvice].join("\n") });
    }
  }
  // Совещательные, которые покраснели, называются вслух ВСЕГДА. Молчание о них — ровно та
  // тишина, против которой построен стандарт: проверка выключена, а выглядит как её отсутствие.
  if (quietOk.length) console.log(`  ${c.green("✔")}  ${L.doctor.passedQuiet(quietOk.length)}`);
  const advisoryFailed = results.filter((x) => x.advisory && !x.ok).map((x) => x.name);
  if (advisoryFailed.length) console.log(`\n  ${c.yellow(L.doctor.advisorySummary(advisoryFailed))}`);
  // В GitHub Actions — те же находки пометками у строк файла в pull request. Вердикт не меняется.
  if (process.env.GITHUB_ACTIONS === "true") {
    const ann = annotations(results, { exists: (f) => existsSync(join(CWD, f)) });
    for (const line of ann.lines) console.log(line);
    if (ann.dropped) console.log(c.dim(`  ${L.doctor.annotDropped(ann.lines.length, ann.dropped)}`));
  }
  return { failed, ran: gates.length, results, advisoryFailed, skipped: sel.skipped };
}

export { declaredGates, sinceRef, runGates, progress, selectGates, listArg };
