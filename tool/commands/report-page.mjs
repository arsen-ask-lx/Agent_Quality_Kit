// Запись HTML-отчёта для человека: `.aqk/report.html`.
//
// Зовут двое: `doctor --run` — каждый раз, и `report --html` — по просьбе. Отчёт, который надо
// вспомнить собрать, не соберут (решение владельца 2026-09-26). Данные — из `gatherState`, той же
// функции, что кормит блок для агента, и из истории прогонов; раскладка — `lib/report-html.mjs`.
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { CWD, TARGET_DIR, SELF, c, exists } from "../lib/core.mjs";
import { renderReport, renderSummary } from "../lib/report-html.mjs";
import { gatherState, portableSelf } from "./context.mjs";
import { L, LANG } from "../i18n/index.mjs";
import { readCatalog } from "../lib/repo.mjs";

async function readHistory() {
  const file = join(CWD, TARGET_DIR, "history.jsonl");
  if (!(await exists(file))) return [];
  // Битая строка не роняет отчёт: одна недописанная запись (прогон убит на середине) не повод
  // потерять всю историю. Пропущенное не выдумывается — строки просто нет.
  return (await readFile(file, "utf8")).split("\n").filter(Boolean).flatMap((l) => {
    try { return [JSON.parse(l)]; } catch { return []; }
  });
}

// Запись не роняет вызывающего: отчёт — побочный продукт прогона, и в каталоге, где `.aqk/` не
// создать, прогон обязан отдать свой вердикт. Но молчать нельзя — сказано, что не записан.
// Слова для чек-листов — намерения записей каталога на языке вывода: человек читает «ошибка не
// глушится молча», а не `swallowed-error`. Своих проверок проекта в каталоге нет — остаётся имя.
async function intents() {
  try {
    return Object.fromEntries((await readCatalog()).map((e) => [e.slug, (LANG === "en" && e.intent_en) || e.intent || ""]).filter(([, t]) => t));
  } catch { return {}; }
}

async function writeHtmlReport() {
  const rel = join(TARGET_DIR, "report.html");
  try {
    const state = await gatherState();
    const html = renderReport(state, await readHistory(), { T: L.html, C: L.context, self: portableSelf(SELF), name: basename(CWD), intents: await intents() });
    await mkdir(join(CWD, TARGET_DIR), { recursive: true });
    await writeFile(join(CWD, rel), html, "utf8");
    console.log(c.dim(`  ${L.html.written(rel)}`));
    return rel;
  } catch (e) {
    console.log(c.yellow(`  ${L.report.notWritten(rel, e?.code || String(e?.message || e))}`));
    return null;
  }
}

// СВОДКА ЗАДАНИЯ GITHUB. В конвейере `.aqk/report.html` никто не откроет, а сводка видна на
// странице прогона и прав не требует. Файл сводки — общий для всех шагов задания, поэтому
// ДОПИСЫВАЕМ, а не переписываем: иначе затёрли бы чужие шаги. Переменной нет — ничего не пишем.
async function writeStepSummary(env = process.env) {
  const file = env.GITHUB_STEP_SUMMARY;
  if (!file) return false;
  try {
    const md = renderSummary(await gatherState(), await readHistory(), { T: L.html, C: L.context, self: portableSelf(SELF), name: basename(CWD), intents: await intents() });
    await appendFile(file, md, "utf8");
    return true;
  } catch (e) {
    console.log(c.yellow(`  ${L.report.notWritten("GITHUB_STEP_SUMMARY", e?.code || String(e?.message || e))}`));
    return false;
  }
}

export { writeHtmlReport, writeStepSummary };
