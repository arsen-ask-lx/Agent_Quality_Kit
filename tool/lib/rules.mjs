// tool/lib/rules.mjs — чем держится каждое правило из `.aqk/rules`.
//
// ЗАЧЕМ. Правило текстом агент выполняет, пока помнит: замер 2026-05 (arXiv 2605.10039, 1650
// сессий Claude Code) — с каждой новой функцией шанс соблюсти правило падает примерно на 5,6 %,
// а файлы правил в целом долю решённых задач не поднимают (arXiv 2602.11988, 2607.27250).
// Поэтому у каждого правила комплекта названо, что его держит: запись каталога или человек.
// Пользователь видит, какие его правила защищены, а какие висят на доброй воле.
//
// РАЗМЕТКА — та же, что в точке входа (`promise-has-gate`): `<!-- aqk: имя-записи -->` или
// `<!-- aqk: человек -->`. Раздел `##` помечается целиком в заголовке, если правило в нём одно и
// изложено абзацем; иначе помечается каждый пункт списка. Пометка — на первой строке пункта.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const HUMAN = ["человек", "human"];
const MARK = /<!--\s*aqk:\s*(\S+?)\s*-->/;

// Разделы `##` файла правил: заголовок, его пометка и пункты верхнего уровня с пометками.
export function ruleSections(text) {
  const out = [];
  let cur = null;
  let code = false;
  String(text).replace(/\r/g, "").split("\n").forEach((line, i) => {
    if (/^\s*```/.test(line)) { code = !code; return; }
    if (code) return;
    if (/^##\s/.test(line)) {
      cur = { heading: line.replace(/^##\s+/, "").replace(MARK, "").trim(), line: i + 1, mark: (MARK.exec(line) || [])[1] || null, items: [] };
      out.push(cur);
      return;
    }
    if (cur && /^[-*]\s/.test(line)) cur.items.push({ text: line.replace(/^[-*]\s+/, "").replace(MARK, "").trim(), line: i + 1, mark: (MARK.exec(line) || [])[1] || null });
  });
  return out;
}

// Правила файла: помеченный заголовок — одно правило, иначе каждый пункт — правило.
// Неразмеченное возвращается с `mark: null` — это и есть находка.
export function rulesOf(text) {
  return ruleSections(text).flatMap((s) =>
    s.mark || !s.items.length ? [{ text: s.heading, line: s.line, mark: s.mark }] : s.items);
}

export const isHuman = (mark) => HUMAN.includes(String(mark).toLowerCase());

// Сводка по папке правил проекта: сколько правил держит проверка, сколько человек, и какие
// записи каталога, названные сторожами, в манифесте не объявлены. Сверка по имени записи: гейт,
// поставленный `aqk add`, носит её имя. Папки нет или правил в ней нет — `null`, а не нули:
// «правил ноль» и «правила не нашли» — разные ответы.
export async function rulesStatus(dir, declared) {
  let names;
  try { names = (await readdir(dir)).filter((n) => n.endsWith(".md")).sort(); } catch { return null; }
  const rules = [];
  for (const n of names) rules.push(...rulesOf(await readFile(join(dir, n), "utf8")));
  if (!rules.length) return null;
  const marked = rules.filter((r) => r.mark);
  const human = marked.filter((r) => isHuman(r.mark)).length;
  const missing = new Map();
  for (const r of marked) if (!isHuman(r.mark) && !declared.has(r.mark)) missing.set(r.mark, (missing.get(r.mark) || 0) + 1);
  return {
    total: rules.length,
    machine: marked.length - human,
    human,
    unmarked: rules.length - marked.length,
    missing: [...missing].map(([gate, n]) => ({ gate, rules: n })),
  };
}
