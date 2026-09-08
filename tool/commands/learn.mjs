// tool/commands/learn.mjs — кандидаты в правила из локальных логов сессий.
//
// ЗАЧЕМ. Тезис комплекта: обещание обязано стать командой. Но сначала обещание обязано быть
// ЗАПИСАНО, а половина того, что человек требует от агента, живёт только в переписке. Здесь
// комплект смотрит туда, где эти требования лежат, и показывает те, которых нет в точке входа.
//
// ЧТО ИЗМЕРЕНО ДО КОДА (2026-09-08, 67 сессий на машине владельца):
//   · 25 353 записи `user` — из них человеком напечатано 1912. Остальное результаты
//     инструментов. Отличает их поле `promptSource: "typed"`, и оно точнее любой эвристики:
//     первая версия отбирала по длине и языку и выдавала «agent quality kit» 44 раза — то есть
//     вставленные пути, а не правила;
//   · из 1619 уникальных напечатанных реплик маркеры наставления дают 79, это 4%. Среди них
//     настоящие правила («файл не трогай», «делай прогон с базой обязательно», «никаких
//     обходных временных путей») и разговорная шелуха примерно поровну.
//
// ЧЕГО ЗДЕСЬ НАМЕРЕННО НЕТ. Поиска ПОВТОРОВ — приёма, на котором построен session-analyzer у
// agent-lint. Замер его не подтвердил: на 67 сессиях владелец не повторяет правило дословно, он
// говорит его один раз и каждый раз иначе. Те «повторы», что нашлись, оказались задвоением
// одной реплики в самом логе.
//
// ПРИВАТНОСТЬ. Команда читает переписку. Поэтому: только логи ТЕКУЩЕГО проекта (или явно
// названного), только в терминал, ни строки на диск, код возврата всегда 0. Отчёт, который
// можно закоммитить, из переписки не собирается — это решение, а не недоделка.

import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { CWD, c, exists } from "../lib/core.mjs";
import { readManifest } from "../lib/manifest.mjs";
import { L } from "../i18n/index.mjs";

// Каталог логов зовётся по рабочему пути, где всё, кроме букв и цифр, заменено на дефис.
// Правило снято с живой машины, а не угадано: /home/ser/projects/audit_project лежит в
// -home-ser-projects-audit-project, то есть подчёркивание тоже становится дефисом.
function logSlug(cwd) {
  return String(cwd).toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

// Маркеры наставления на двух языках. Список короткий намеренно: каждый лишний маркер добавляет
// шума больше, чем находок, а разбирать этот список человеку.
const MARKERS = new RegExp(
  "(всегда|никогда|не надо|не нужно|обязательно|запомни|больше не|каждый раз|нельзя|" +
  "только после|перед тем|сначала|не забывай|не трогай|как договорились|" +
  "always|never|don'?t|do not|make sure|remember to|must not)",
  "i",
);

// Признаки вставки, а не реплики: длина, код в тройных кавычках, много переносов, пути, ссылки.
// Каждый добавлен по итогу прогона, а не на всякий случай.
function looksLikeRule(text) {
  const t = String(text || "").trim();
  if (!t || t.length > 400) return false;
  if (t.includes("```")) return false;
  if ((t.match(/\n/g) || []).length > 6) return false;
  if (/https?:\/\//.test(t)) return false;
  if ((t.match(/\S+\/\S+/g) || []).length >= 3) return false;
  return MARKERS.test(t);
}

// Слова, по которым сверяем сказанное с записанным. Короткие отброшены: на них совпадёт что
// угодно, и любое правило показалось бы уже записанным — то есть команда молчала бы всегда.
function keyWords(text) {
  return [...new Set(String(text).toLowerCase().match(/[а-яёa-z]{4,}/g) || [])];
}

// Сверяем по ОСНОВЕ, а не по слову целиком. Русский язык склоняет: в реплике «локальный
// костыль», в своде «до местного костыля» — по целому слову это промах, и правило, записанное
// час назад, показалось бы незаписанным. Проверено на живом логе: без основы первым же пунктом
// вышло правило, внесённое в AGENTS.md в тот же день.
function stem(w) {
  return w.length > 5 ? w.slice(0, 5) : w;
}

// Сказано вслух и НЕ записано. Порог половинный: правило, у которого хотя бы половина значимых
// слов уже стоит в точке входа, считаем записанным — иначе команда повторяла бы владельцу его
// же свод. Порог назван здесь, а не спрятан: он произвольный, и это видно.
function saidNotWritten(text, entryText) {
  const words = keyWords(text);
  if (!words.length) return false;
  const hay = String(entryText || "").toLowerCase();
  const hit = words.filter((w) => hay.includes(stem(w))).length;
  return hit / words.length < 0.5;
}

// Напечатанные человеком реплики одной сессии. Всё прочее — результаты инструментов, служебные
// вставки и подсказки — отбрасывается по полю promptSource.
function typedFrom(jsonl) {
  const out = [];
  for (const line of jsonl.split("\n")) {
    if (!line.trim()) continue;
    let d;
    try { d = JSON.parse(line); } catch { continue; }
    if (d?.type !== "user" || d?.promptSource !== "typed") continue;
    const cont = d?.message?.content;
    const text = typeof cont === "string"
      ? cont
      : Array.isArray(cont)
        ? cont.filter((b) => b?.type === "text").map((b) => b.text || "").join(" ")
        : "";
    const t = String(text).replace(/\s+/g, " ").trim();
    if (t) out.push({ text: t, when: String(d.timestamp || "").slice(0, 10) });
  }
  return out;
}

async function readEntry(man) {
  const names = Array.isArray(man?.entry) && man.entry.length ? man.entry : ["AGENTS.md", "CLAUDE.md"];
  let all = "";
  for (const n of names) {
    try { all += `\n${await readFile(join(CWD, String(n)), "utf8")}`; } catch { /* нет файла — не беда */ }
  }
  return all;
}

async function cmdLearn(argv = process.argv) {
  const limitAt = argv.indexOf("--limit");
  const limit = limitAt !== -1 && /^\d+$/.test(argv[limitAt + 1] || "") ? Number(argv[limitAt + 1]) : 20;
  const root = join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"), "projects", logSlug(CWD));

  console.log(c.bold(`\n  ${L.learn.title}\n`));
  if (!(await exists(root))) {
    console.log(`  ${L.learn.noLogs(root)}\n`);
    return;
  }

  let files = [];
  try { files = (await readdir(root)).filter((f) => f.endsWith(".jsonl")); } catch { files = []; }
  const seen = new Set();
  const said = [];
  let typedTotal = 0;
  for (const f of files) {
    let raw = "";
    try { raw = await readFile(join(root, f), "utf8"); } catch { continue; }
    for (const m of typedFrom(raw)) {
      typedTotal++;
      const key = m.text.toLowerCase().slice(0, 200);
      if (seen.has(key)) continue;
      seen.add(key);
      if (looksLikeRule(m.text)) said.push(m);
    }
  }

  const entry = await readEntry(await readManifest());
  const fresh = said.filter((m) => saidNotWritten(m.text, entry));
  fresh.sort((a, b) => String(b.when).localeCompare(String(a.when)));

  console.log(`  ${c.dim(L.learn.counted(files.length, typedTotal, said.length, fresh.length))}\n`);
  if (!fresh.length) {
    console.log(`  ${L.learn.nothing}\n`);
    return;
  }
  for (const m of fresh.slice(0, limit)) {
    console.log(`  ${c.dim(m.when)}  ${m.text.slice(0, 150)}`);
  }
  if (fresh.length > limit) console.log(c.dim(`\n  ${L.learn.andMore(fresh.length - limit)}`));
  console.log(`\n  ${c.yellow(L.learn.warn)}\n`);
}

export { cmdLearn, logSlug, looksLikeRule, saidNotWritten, typedFrom };
