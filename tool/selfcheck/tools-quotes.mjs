// tool/selfcheck/tools-quotes.mjs — цитаты в сведениях об инструментах сверяются с первоисточником.
//
// Свод велит: «цитата сверяется с первоисточником перед публикацией». Проверено 2026-09-27 на
// деле: пересказ документации, полученный через промежуточную модель, выглядел как цитата и ею не
// был. Эта проверка скачивает исходник документации (`source_raw`) и ищет цитату ДОСЛОВНО —
// после снятия разметки Markdown, которой на сайте не видно.
//
// Нужна сеть, поэтому в общий прогон не входит: там сеть выключена намеренно. Запускать при
// добавлении или правке `kit/tools/*.json` и перед выпуском:
//   node tool/selfcheck/tools-quotes.mjs
import { loadTools } from "../lib/tools.mjs";

const plain = (s) => String(s)
  .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
  .replace(/[`*_]/g, "")
  .replace(/\s+/g, " ")
  .trim();

const cache = new Map();
let bad = 0;
let checked = 0;
for (const t of await loadTools()) {
  for (const r of t.off || []) {
    // Правило на замере, а не на цитате: сверять в документации нечего — она об этом молчит.
    // Печатается отдельно, чтобы «сверено» не значило больше, чем сделано.
    if (!r.quote && r.measured) { console.log(`~ ${t.tool}/${r.id}: замер, не цитата — ${r.measured}`); continue; }
    if (!r.source_raw) { console.log(`✘ ${t.tool}/${r.id}: нет source_raw — сверить не с чем`); bad++; continue; }
    if (!cache.has(r.source_raw)) {
      const res = await fetch(r.source_raw, { signal: AbortSignal.timeout(15000) });
      cache.set(r.source_raw, res.ok ? plain(await res.text()) : null);
    }
    const text = cache.get(r.source_raw);
    checked++;
    if (text === null) { console.log(`? ${t.tool}/${r.id}: источник не скачался — ${r.source_raw}`); bad++; continue; }
    if (!text.includes(plain(r.quote))) { console.log(`✘ ${t.tool}/${r.id}: цитаты нет в источнике дословно — ${r.source_raw}`); bad++; continue; }
    console.log(`✔ ${t.tool}/${r.id}`);
  }
}
console.log(`\nсверено ${checked}, расхождений ${bad}`);
process.exit(bad ? 1 : 0);
