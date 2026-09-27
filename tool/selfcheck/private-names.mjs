// tool/selfcheck/private-names.mjs — закрытые имена не попадают в публичный репозиторий.
//
// ЗАЧЕМ. Решение владельца: его закрытый проект и всё, что к нему относится, живёт только у него —
// в публичный AQK не попадает никогда. 2026-09-27 сверка нашла в ТЕКУЩИХ файлах 83 упоминания его
// имени, накопленных за месяц: пути, источники методичек, «найдено в …», снимок его проверок и число
// его уязвимостей. Правило держалось на памяти агента, то есть не держалось.
//
// КАК, НЕ ПУБЛИКУЯ САМО ИМЯ. В репозитории лежат только отпечатки SHA-256 запрещённых имён
// (tool/selfcheck/private-names.txt). Каждое слово файла приводится к одному виду — строчные, `_` →
// `-` — и сверяется отпечатком вместе со всеми своими кусками: `/home/u/projects/имя/x` пойман по
// куску пути, а слитное написание — отдельным отпечатком без разделителей. В выводе — файл и строка,
// самого слова нет: проверка, печатающая запрещённое, публиковала бы его в журнал конвейера.
//
// Код: 0 — чисто, 1 — найдено, 2 — не смогли (не git, ни одного файла, нет списка отпечатков).
//
//   node tool/selfcheck/private-names.mjs .
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = process.argv[2] || ".";
const LIST = join(dirname(fileURLToPath(import.meta.url)), "private-names.txt");

// Отпечаток с пометкой `canary` — выдуманное имя для образцов и тестов. Только ему разрешено жить в
// образцах гейтов: красный образец обязан содержать запрещённое слово. Настоящим именам — нигде.
let hashes;
let canaries;
try {
  const rows = readFileSync(LIST, "utf8").split("\n").map((l) => l.trim());
  hashes = new Set(rows.map((l) => /^(?:canary\s+)?([0-9a-f]{64})$/.exec(l)?.[1]).filter(Boolean));
  canaries = new Set(rows.map((l) => /^canary\s+([0-9a-f]{64})$/.exec(l)?.[1]).filter(Boolean));
} catch {
  console.log("не смогли проверить: нет списка отпечатков tool/selfcheck/private-names.txt");
  process.exit(2);
}
if (!hashes.size) {
  console.log("не смогли проверить: список отпечатков пуст — сверять не с чем");
  process.exit(2);
}

const ls = spawnSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: dir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
if (ls.status !== 0) {
  console.log("не смогли проверить: не git-репозиторий — какие файлы публичны, не узнать");
  process.exit(2);
}
const files = String(ls.stdout || "").split("\0").filter(Boolean);
if (!files.length) {
  console.log("не смогли проверить: в репозитории ни одного файла — пусто не значит чисто");
  process.exit(2);
}

const sha = (s) => createHash("sha256").update(s).digest("hex");
// Слово и все его непрерывные куски по разделителям: и дефисное, и слитное написание.
function hits(word, inSample) {
  const parts = word.toLowerCase().replace(/_/g, "-").split("-").filter(Boolean);
  const bad = (h) => hashes.has(h) && !(inSample && canaries.has(h));
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j <= Math.min(parts.length, i + 6); j++) {
      const span = parts.slice(i, j);
      if (bad(sha(span.join("-"))) || bad(sha(span.join("")))) return true;
    }
  }
  return false;
}
const SAMPLE = /(^|\/)gates\/[^/]+\/(red|green)(\/|$)/;

const found = [];
for (const f of files) {
  let text;
  try { text = readFileSync(join(dir, f)); } catch { continue; }
  if (text.includes(0)) continue; // двоичный файл
  const lines = text.toString("utf8").split("\n");
  const inSample = SAMPLE.test(f);
  lines.forEach((line, i) => {
    for (const m of line.matchAll(/[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*/g)) {
      if (hits(m[0], inSample)) { found.push(`${f}:${i + 1}`); break; }
    }
  });
}

if (found.length) {
  for (const place of found) console.log(`${place}: закрытое имя в публичном репозитории`);
  console.log("  почини: убери имя (и то, что по нему узнаётся) — закрытое живёт только у владельца. Само слово здесь не печатается намеренно");
  process.exit(1);
}
process.exit(0);
