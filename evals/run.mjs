// Прогон размеченного корпуса: держит ли гейт то, что мы про него утверждаем.
//
// ЗАЧЕМ ОТДЕЛЬНО ОТ ОБРАЗЦОВ. У каждого гейта есть свои red/green — их писал тот же, кто писал
// гейт, и они зелёные по построению. Замер 2026-09-14/15 по семидесяти чужим репозиториям нашёл
// ПЯТЬ ложных срабатываний, которых наши образцы не видели ни разу. Каждое из них теперь лежит
// здесь случаем с ожиданием «зелёное» и источником — репозиторием, где мы опозорились.
//
// ЧТО СЧИТАЕТСЯ. Не «проценты качества», а две честные величины:
//   · СОВПАЛО/НЕ СОВПАЛО по каждому случаю — это сторож от возврата беды;
//   · ТОЧНОСТЬ по гейту — доля случаев, где мы обещаем красное и получаем красное. Полноту
//     (сколько бед мы вообще не видим) отсюда узнать нельзя, и делать вид, что можно, нечестно:
//     корпус знает только то, что мы уже заметили.
//
// СЛУЧАЙ ВХОДИТ СЮДА ТОЛЬКО С ИСТОЧНИКОМ. `source` — настоящий чужой репозиторий и чем оно
// проверено (код HTTP, ответ реестра, ссылка на коммит). Случай, придуманный за столом, меряет
// наш вкус, а корпус заводился ровно чтобы перестать мерить себя.
import { readdirSync, readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CASES = join(ROOT, "evals", "cases");
const VERDICT = { 0: "зелёное", 1: "красное", 2: "не смогли" };

function runCase(c) {
  const dir = mkdtempSync(join(tmpdir(), "aqk-eval-"));
  try {
    for (const [path, body] of Object.entries(c.files)) {
      const full = join(dir, path);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, body);
    }
    const check = join(ROOT, "kit", "gates", c.gate, "check.sh");
    const r = spawnSync("sh", [check, dir], { encoding: "utf8", timeout: 60000 });
    // Отказ обвязки — не вердикт. Тот же договор, что в самом комплекте.
    const code = r.error ? -1 : r.status;
    return { code, out: (r.stdout || "") + (r.stderr || "") };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const files = readdirSync(CASES).filter((f) => f.endsWith(".json")).sort();

// СПИСОК ВМЕСТО ПРОГОНА. Владелец 2026-09-15 попросил полный перечень наших ошибок. Он печатается
// ИЗ САМИХ СЛУЧАЕВ, а не пишется отдельным документом: перечень, набранный руками, к третьей
// правке разойдётся с корпусом — это тот же класс, что «свод велит команду, которой нет».
if (process.argv.includes("--list")) {
  const all = files.map((f) => ({ f, c: JSON.parse(readFileSync(join(CASES, f), "utf8")) }));
  for (const want of ["green", "red"]) {
    const part = all.filter((x) => x.c.expect === want);
    console.log(want === "green"
      ? `\nНАШИ ЛОЖНЫЕ СРАБАТЫВАНИЯ — ${part.length}. Каждое стало бы письмом с неправдой:`
      : `\nНАСТОЯЩИЕ НАХОДКИ — ${part.length}. На них гейт обязан краснеть:`);
    for (const { f, c } of part) {
      console.log(`\n  ${f.replace(/\.json$/, "")}  [${c.gate}]`);
      console.log(`    ${c.why}`);
      console.log(`    откуда: ${c.source?.repo} · ${c.source?.checked}`);
    }
  }
  process.exit(0);
}
if (!files.length) {
  console.log("корпус пуст — это не «всё хорошо», а «нечего проверять»");
  process.exit(2);
}

const byGate = new Map();
const skipped = [];
let bad = 0;
for (const f of files) {
  const c = JSON.parse(readFileSync(join(CASES, f), "utf8"));
  const want = { green: 0, red: 1, cannot: 2 }[c.expect];
  if (want === undefined) { console.log(`✘ ${f}: неизвестное ожидание «${c.expect}»`); bad++; continue; }
  // Инструмент, которому гейт делегирован, может отсутствовать на этой машине. Молча зачесть
  // такой случай нельзя: это «не проверено», а не «прошло». Считаем отдельно и говорим вслух.
  if (c.requires && spawnSync("sh", ["-c", `command -v ${c.requires}`], { encoding: "utf8" }).status !== 0) {
    skipped.push(`${f} — нет «${c.requires}», случай НЕ ПРОВЕРЕН`);
    continue;
  }
  const got = runCase(c);
  const ok = got.code === want;
  if (!byGate.has(c.gate)) byGate.set(c.gate, { red: 0, redOk: 0, green: 0, greenOk: 0 });
  const g = byGate.get(c.gate);
  if (c.expect === "red") { g.red++; if (ok) g.redOk++; }
  if (c.expect === "green") { g.green++; if (ok) g.greenOk++; }
  if (!ok) {
    bad++;
    console.log(`✘ ${f}  [${c.gate}] ждали ${VERDICT[want]}, получили ${VERDICT[got.code] ?? "код " + got.code}`);
    console.log(`   откуда: ${c.source?.repo || "—"} · ${c.source?.checked || "источник не назван"}`);
    console.log(got.out.split("\n").slice(0, 3).map((l) => "   " + l).join("\n"));
  }
}

if (skipped.length) {
  console.log("\nНЕ ПРОВЕРЕНО — на этой машине нет инструмента:");
  for (const s of skipped) console.log("  ? " + s);
}
console.log(`\nслучаев: ${files.length} · не совпало: ${bad} · не проверено: ${skipped.length}\n`);
console.log("гейт                     обещали красное   обещали зелёное");
for (const [gate, g] of [...byGate].sort()) {
  console.log(`${gate.padEnd(24)} ${String(g.redOk + "/" + g.red).padEnd(17)} ${g.greenOk}/${g.green}`);
}
process.exit(bad ? 1 : 0);
