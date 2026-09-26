// Запись HTML-отчёта для человека: `.aqk/report.html`.
//
// Зовут двое: `doctor --run` — каждый раз, и `report --html` — по просьбе. Отчёт, который надо
// вспомнить собрать, не соберут (решение владельца 2026-09-26). Данные — из `gatherState`, той же
// функции, что кормит блок для агента, и из истории прогонов; раскладка — `lib/report-html.mjs`.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { CWD, TARGET_DIR, SELF, c, exists } from "../lib/core.mjs";
import { renderReport } from "../lib/report-html.mjs";
import { gatherState, portableSelf } from "./context.mjs";
import { L } from "../i18n/index.mjs";

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
async function writeHtmlReport() {
  const rel = join(TARGET_DIR, "report.html");
  try {
    const state = await gatherState();
    const html = renderReport(state, await readHistory(), { T: L.html, C: L.context, self: portableSelf(SELF), name: basename(CWD) });
    await mkdir(join(CWD, TARGET_DIR), { recursive: true });
    await writeFile(join(CWD, rel), html, "utf8");
    console.log(c.dim(`  ${L.html.written(rel)}`));
    return rel;
  } catch (e) {
    console.log(c.yellow(`  ${L.report.notWritten(rel, e?.code || String(e?.message || e))}`));
    return null;
  }
}

export { writeHtmlReport, readHistory };
