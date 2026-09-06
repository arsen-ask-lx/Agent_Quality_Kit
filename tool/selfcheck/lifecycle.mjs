// tool/selfcheck/lifecycle.mjs — зрелость записей каталога, одной таблицей.
//
// ЗАЧЕМ ОТДЕЛЬНЫМ ФАЙЛОМ, А НЕ КУСКОМ gates.sh. Правило зрелости живёт в `entryLifecycle`
// (tool/lib/manifest.mjs) и оттуда же читается программой. Повторить его на sh значило бы
// завести второй источник истины: через месяц приёмка и отчёт расходятся, и про одну и ту же
// запись машина говорит разное. Здесь — только печать; решение принимает та же функция.
//
//   node tool/selfcheck/lifecycle.mjs        → slug|состояние|замена|проблема
//
// Код возврата — число записей с проблемой объявления.

import { readCatalog } from "../lib/repo.mjs";
import { entryLifecycle } from "../lib/manifest.mjs";
import { L } from "../i18n/index.mjs";

const catalog = await readCatalog();
const slugs = new Set(catalog.map((r) => r.slug));
let bad = 0;

for (const rec of catalog) {
  const { state, supersededBy, problem } = entryLifecycle(rec);
  // Замена, которой нет в каталоге, — это ответ «а что теперь», ведущий в никуда. Проверяется
  // здесь, а не в чистой функции: та не знает про остальные записи и не должна знать.
  const why = problem || (supersededBy && !slugs.has(supersededBy) ? L.lifecycle.unknownReplacement(supersededBy) : "");
  if (why) bad++;
  console.log(`${rec.slug}|${state}|${supersededBy || ""}|${why}`);
}

process.exit(bad);
