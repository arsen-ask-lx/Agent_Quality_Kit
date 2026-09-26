// tool/lib/red-age.mjs — сколько гейт уже красный. Новое и давнее — разные сообщения.
//
// ЗАЧЕМ. Отзыв с проекта владельца 2026-09-26: девять красных гейтов висели с 13.09, и три свежие
// ошибки чуть не ушли незамеченными среди них. Сам AQK там же поймал ослепшего сторожа и ссылку на
// удалённый файл — и это тоже никто не увидел. Список «красные: …» без возраста делает давний долг
// и только что сломанное одинаковыми, и глаз перестаёт читать весь список.
//
// КАК СЧИТАЕТСЯ. История прогонов (`.aqk/history.jsonl`) от новых к старым: пока гейт не зелёный
// (провал или «не смогли»), серия растёт; первый зелёный её обрывает. Запись, где гейта нет
// (урезанный прогон, `--only`), серию не рвёт и не удлиняет: о гейте в ней не сказано ничего.
// Если гейт не встречается в истории вовсе или его последний итог зелёный — возраст неизвестен
// (`null`), и это не «новый»: выдать незнание за свежесть было бы тем же враньём, что и тишина.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CWD, TARGET_DIR, exists } from "./core.mjs";

// История прогонов. Битая строка не роняет читателя: одна недописанная запись (прогон убит на
// середине) не повод потерять всю историю. Пропущенное не выдумывается — строки просто нет.
async function readHistory(dir = CWD) {
  const file = join(dir, TARGET_DIR, "history.jsonl");
  if (!(await exists(file))) return [];
  return (await readFile(file, "utf8")).split("\n").filter(Boolean).flatMap((l) => {
    try { return [JSON.parse(l)]; } catch { return []; }
  });
}

// Время — местное: в истории оно по Гринвичу (так сравнимо между машинами), а человек читает
// по своим часам. «13:47» там, где у него было 18:47, выглядит как чужой прогон.
const p2 = (n) => String(n).padStart(2, "0");
const local = (at) => {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return { day: "", full: "" };
  const day = `${p2(d.getDate())}.${p2(d.getMonth() + 1)}`;
  return { day, full: `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}` };
};

function redAges(history, names) {
  const list = Array.isArray(history) ? history.filter((h) => h && h.gates) : [];
  const out = {};
  for (const name of names) {
    let runs = 0;
    let since = null;
    for (let i = list.length - 1; i >= 0; i--) {
      const state = list[i].gates[name];
      if (state === undefined) continue;
      if (state === "ok") break;
      runs++;
      since = list[i].at;
    }
    out[name] = runs ? { runs, since } : null;
  }
  return out;
}

// Красные делятся на новые (серия из одного прогона) и давние; незнакомые истории — в новые не
// записываются, а отдаются отдельно, чтобы вызывающий сказал «возраст неизвестен».
function splitByAge(history, names) {
  const ages = redAges(history, names);
  const fresh = [], old = [], unknown = [];
  for (const n of names) {
    const a = ages[n];
    if (!a) unknown.push(n);
    else if (a.runs === 1) fresh.push(n);
    else old.push({ name: n, runs: a.runs, day: local(a.since).day });
  }
  return { fresh, old, unknown };
}

export { redAges, splitByAge, readHistory, local };
