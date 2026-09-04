// tool/commands/badge.mjs — значок уровня для чужого README и команда, которая держит его правдой.
//
// ЗАЧЕМ. Значок в README — обычно заявление автора: нарисовал один раз, дальше он живёт своей
// жизнью и через месяц врёт. Здесь он выдаётся только после прогона объявленных гейтов, а
// `--check` роняет конвейер, когда README разошёлся с фактом. Иначе мы раздавали бы ровно ту
// самую картинку-обещание, против которой весь стандарт.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CWD, SELF, REPO_URL, c, exists, die } from "../lib/core.mjs";
import { readManifest, assessLevel } from "../lib/manifest.mjs";
import { runGates, declaredGates } from "./doctor.mjs";
import { L } from "../i18n/index.mjs";

// Один разбор на запись и на чтение: значок, который мы печатаем, обязан читаться нами же.
const BADGE_RE = /img\.shields\.io\/badge\/AQK-(\d)-/;

function badgeMarkdown(level) {
  const color = level >= 3 ? "2ea44f" : level >= 2 ? "blue" : "orange";
  return `[![AQK-${level}](https://img.shields.io/badge/AQK-${level}-${color})](${REPO_URL})`;
}

// Где искать значок: точка входа для агента и README на виду у человека. Список короткий
// намеренно — обход всего дерева нашёл бы значок в чужой копии и посчитал бы его нашим.
function placesToCheck(man) {
  const entry = Array.isArray(man?.entry) ? man.entry.map(String) : [];
  return [...new Set([...entry, "README.md", "README.ru.md"])];
}

async function cmdBadge(args = []) {
  const check = args.includes("--check");

  const man = await readManifest();
  if (!man) die(`\n  ${L.badge.noManifest(`${SELF} init`)}\n`);

  const { reached } = await assessLevel(man);
  if (reached < 0) die(`\n  ${L.badge.notReached(`${SELF} doctor`)}\n`);

  // Прогон, а не манифест. Значок при красном гейте — это и есть недоказанное утверждение.
  const gates = declaredGates(man);
  if (gates.length) {
    const run = runGates(man);
    if (run.failed) {
      const red = run.results.filter((r) => !r.ok).map((r) => r.name).join(", ");
      die(`\n  ${L.badge.redGates(run.failed, red)}\n`);
    }
  }

  const markdown = badgeMarkdown(reached);

  if (!check) {
    console.log(`\n${markdown}\n`);
    console.log(c.dim(`  ${L.badge.hint(gates.length)}`));
    console.log(c.dim(`  ${L.badge.keepTrue(`${SELF} badge --check`)}\n`));
    process.exit(0);
  }

  const places = placesToCheck(man);
  const found = [];
  for (const rel of places) {
    const p = join(CWD, rel);
    if (!(await exists(p))) continue;
    const m = BADGE_RE.exec(await readFile(p, "utf8"));
    if (m) found.push({ rel, level: Number(m[1]) });
  }

  if (!found.length) die(`\n  ${L.badge.checkMissing(places.join(", "))}\n     ${markdown}\n`);

  const wrong = found.filter((f) => f.level !== reached);
  if (wrong.length) {
    const where = wrong.map((f) => `${f.rel} (AQK-${f.level})`).join(", ");
    die(`\n  ${L.badge.checkMismatch(where, reached)}\n     ${markdown}\n`);
  }

  console.log(c.green(`\n  ${L.badge.checkOk(reached, found.map((f) => f.rel).join(", "))}\n`));
  process.exit(0);
}

export { cmdBadge, badgeMarkdown, BADGE_RE, placesToCheck };
