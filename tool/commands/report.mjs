// tool/commands/report.mjs — обязательная форма отчёта после работы с комплектом.
//
// ЗАЧЕМ ОТДЕЛЬНАЯ КОМАНДА, А НЕ ПРАВИЛО В ТЕКСТЕ. Первый чужой прогон дал отчёт, в котором
// «12 гейтов зелёные» стояло рядом с тем фактом, что все 12 встали на слабейший рецепт, а
// половина методичек, на которые указал сам `init`, не была прочитана. Агент не соврал — он
// пересказал по памяти то, что счёл главным. Пересказ по памяти всегда выбирает удобное.
//
// Поэтому отчёт СОБИРАЕТСЯ ПРОГОНОМ. Всё, что в нём написано, — результат запуска здесь и
// сейчас: какой рецепт реально выбран, что зелёное, что красное, что применимо и не стоит,
// какие документы комплект велел прочитать и лежат ли они на диске.
//
// Чего команда НЕ умеет и не делает вид, что умеет: проверить, что документ прочитали.
// Она печатает список — дальше отвечает человек или агент. Разница между «не прочитал» и
// «прочитал и решил не применять» машине не видна, и притворяться иначе было бы враньём.

import { mkdir, writeFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { CWD, TARGET_DIR, SELF, c, exists } from "../lib/core.mjs";
import { readManifest, assessLevel } from "../lib/manifest.mjs";
import { detectFacts, readCatalog, triggerVerdict, whichSync } from "../lib/repo.mjs";
import { runGates, declaredGates } from "./doctor.mjs";
import { L } from "../i18n/index.mjs";

// Каким рецептом стоит гейт: родным инструментом или переносимой проверкой. Именно это
// различие потерялось в первом чужом отчёте, и именно оно решает, что гейт на самом деле ловит.
function recipeKind(cmd, rec) {
  const recipes = rec?.recipes && typeof rec.recipes === "object" ? rec.recipes : {};
  const norm = (x) => String(x || "").replace(/\{gate\}|\{dir\}/g, "").replace(/\s+/g, " ").trim();
  const c0 = norm(cmd);
  for (const [lang, r] of Object.entries(recipes)) {
    if (lang === "any") continue;
    const prog = String(r).trim().split(/\s+/)[0];
    if (c0.includes(norm(r)) || c0.startsWith(prog)) return { native: true, how: lang, prog };
  }
  // Родной рецепт есть в записи, но стоит переносимый — назвать это вслух: разница измерима.
  const alt = Object.entries(recipes).filter(([k]) => k !== "any");
  return { native: false, alternatives: alt.map(([lang, r]) => [lang, String(r).trim().split(/\s+/)[0]]) };
}

// Документы, на которые комплект указывает сам. Список не выдуман здесь: это те же файлы,
// которые `init` кладёт в проект и на которые ссылается его же вывод.
const REQUIRED_DOCS = [
  ["project-baseline.md", "baseline"],
  ["ready-made-rules.md", "readyMade"],
  ["general.md", "rulesGeneral"],
  ["testing.md", "rulesTesting"],
  ["security.md", "rulesSecurity"],
];

// Путь ИЩЕМ, а не пишем. Жёстко вписанный `.aqk/docs/project-baseline.md` уже соврал в первой
// же версии этой команды: файл лежит в подпапке `ai/`, и отчёт сообщил «не разложен» о том,
// что разложено. Раскладка внутри .aqk — дело владельца комплекта, а не наше знание.
async function findDoc(name) {
  const root = join(CWD, TARGET_DIR);
  if (!(await exists(root))) return null;
  const walk = async (dir) => {
    let entries = [];
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return null; }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(dir, e.name);
      if (e.isDirectory()) { const hit = await walk(full); if (hit) return hit; }
      else if (e.name === name) return relative(CWD, full);
    }
    return null;
  };
  return walk(root);
}

async function cmdReport() {
  const man = await readManifest();
  if (!man) {
    console.log(c.red(`\n  ${L.report2.noManifest(`${SELF} init`)}\n`));
    process.exit(1);
  }

  const { reached } = await assessLevel(man);
  const facts = await detectFacts(man);
  const catalog = await readCatalog();
  const bySlug = Object.fromEntries(catalog.map((r) => [r.slug, r]));
  const declared = declaredGates(man);

  // Прогон, а не чтение манифеста: «объявлен» и «работает» — разные утверждения, и весь
  // смысл этой команды в том, чтобы в отчёт попало второе.
  const run = declared.length ? runGates(man) : { results: [], failed: 0 };

  const held = [], broken = [], todo = [], skip = [];
  for (const res of run.results) {
    const rec = bySlug[res.name];
    const kind = recipeKind(res.cmd, rec);
    (res.ok ? held : broken).push({ ...res, kind, rec });
  }
  for (const rec of catalog) {
    if (declared.some(([n]) => n === rec.slug)) continue;
    const v = triggerVerdict(rec, facts);
    if (!v.applies) { skip.push([rec, v.why]); continue; }
    // Запись применима, но её родного инструмента нет — это другая причина, чем «не поставили».
    const recipes = rec.recipes && typeof rec.recipes === "object" ? rec.recipes : {};
    const needs = recipes.any ? null : Object.values(recipes).map((r) => String(r).trim().split(/\s+/)[0]).find((prog) => !whichSync(prog));
    todo.push([rec, needs]);
  }

  const lines = [];
  const say = (s = "") => { lines.push(s); };

  say(`# ${L.report2.title} — ${new Date().toISOString().slice(0, 16).replace("T", " ")}`);
  say("");
  say(`${L.report2.level}: AQK-${reached < 0 ? L.doctor.levelNone : reached}`);
  say("");

  say(`## ${L.report2.holdsTitle}`);
  say("");
  if (!held.length && !broken.length) say(`- ${L.report2.nothingRuns}`);
  for (const g of held) {
    const how = g.kind.native ? L.report2.native(g.kind.prog) : L.report2.portable;
    say(`- ✅ ${g.name} — ${how}, ${g.secs}s`);
  }
  for (const g of broken) {
    const how = g.kind.native ? L.report2.native(g.kind.prog) : L.report2.portable;
    say(`- ❌ ${g.name} — ${how}, ${g.note || L.doctor.exitCode(g.code)}`);
  }
  // Гейт стоит на переносимом, хотя родной инструмент есть в системе: слабее, чем возможно.
  const weaker = [...held, ...broken].filter(
    (g) => !g.kind.native && (g.kind.alternatives || []).some(([, prog]) => whichSync(prog))
  );
  if (weaker.length) {
    say("");
    say(`### ${L.report2.weakerTitle}`);
    say("");
    for (const g of weaker) {
      const have = (g.kind.alternatives || []).filter(([, prog]) => whichSync(prog)).map(([, prog]) => prog);
      say(`- ⚠️ ${g.name} — ${L.report2.weaker(have.join(", "))}`);
    }
  }

  say("");
  say(`## ${L.report2.missingTitle}`);
  say("");
  if (!todo.length) say(`- ${L.report2.nothingMissing}`);
  for (const [rec, needs] of todo) {
    say(`- ❌ ${rec.slug} — ${needs ? L.report2.needsTool(needs) : L.report2.notInstalled}`);
  }
  if (skip.length) {
    say("");
    say(`### ${L.report2.hiddenTitle}`);
    say("");
    for (const [rec, why] of skip) say(`- ⬜ ${rec.slug} — ${why}`);
  }

  say("");
  say(`## ${L.report2.readTitle}`);
  say("");
  for (const [name, key] of REQUIRED_DOCS) {
    const found = await findDoc(name);
    say(`- ${found ? "📖" : "⬜"} ${found || name} — ${L.report2.docs[key]}`);
  }
  say("");
  say(`> ${L.report2.readWarn}`);

  say("");
  say(`## ${L.report2.whyTitle}`);
  say("");
  for (const [rec] of todo.slice(0, 6)) say(`- **${rec.slug}** — ${rec.intent || ""}`);
  if (!todo.length) say(`- ${L.report2.whyNothing}`);

  const text = lines.join("\n") + "\n";
  const dst = join(CWD, TARGET_DIR, "report.md");
  await mkdir(join(CWD, TARGET_DIR), { recursive: true });
  await writeFile(dst, text, "utf8");

  console.log("\n" + text);
  console.log(c.dim(`  ${L.report2.saved(join(TARGET_DIR, "report.md"))}\n`));

  // Код возврата — для конвейера и для агента: отчёт с красным гейтом не должен читаться
  // как «всё в порядке» только потому, что команда выполнилась.
  process.exit(broken.length ? 1 : 0);
}

export { cmdReport };
