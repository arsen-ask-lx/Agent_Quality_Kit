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
// ЧЕГО ЗДЕСЬ НАМЕРЕННО НЕТ. Поиска повторов ПО СХОДСТВУ ТЕКСТА — приёма, на котором построен
// session-analyzer у agent-lint. Замер его не подтвердил: на 67 сессиях владелец не повторяет
// правило дословно, он говорит его один раз и каждый раз иначе. Те «повторы», что нашлись,
// оказались задвоением одной реплики в самом логе.
//
// ЧТО ЕСТЬ ВМЕСТО НЕГО (2026-09-11). Повтор, который помечает САМ человек: «я же говорил»,
// «опять», «снова». Не угадывание, что две реплики об одном, а слова «это уже было». На логах
// двух проектов — 7 и 1 такая реплика, настоящих норм среди них 6 и 1; отбор по маркерам
// наставления не ловил ни одной. Такой повтор, совпавший с правилом свода, — «записано, а
// поправлять всё равно приходится»: правилу нужен сторож, текстом оно не держится.
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
function isPaste(text) {
  const t = String(text || "").trim();
  if (!t || t.length > 400) return true;
  if (t.includes("```")) return true;
  if ((t.match(/\n/g) || []).length > 6) return true;
  if (/https?:\/\//.test(t)) return true;
  return (t.match(/\S+\/\S+/g) || []).length >= 3;
}

function looksLikeRule(text) {
  return !isPaste(text) && MARKERS.test(String(text));
}

// ПОВТОР — сигнал, который даёт сам человек: «я же говорил», «опять», «снова». Разбор AgentLint
// 2026-09-11 (research/competitors/agentlint-0xmariowu.md): их SS2 сопоставляет поправку с
// правилом свода по словам. Замер на логах владельца: из 45 поправок к записанным правилам
// относятся от силы две — такой приём дал бы шум. А реплик с пометкой повтора в том же проекте
// 14, настоящих норм среди них 5–6 («опять не хочу плодить файлы», «я же не просил, ты опять не
// так понял») — и отбор по маркерам наставления выше не ловил НИ ОДНОЙ: слов «всегда»/«никогда»
// в них нет. `\b` здесь не годится — в JavaScript он не видит границ кириллических слов.
// Две силы пометки. Сильная — «я же говорил», «сколько раз» — повтор при любой форме реплики.
// Слабая — «опять», «снова» — только в утверждении: второй прогон на тех же логах показал, что
// вопрос с ней — недоумение («че опять rust?», «опять в env добавить?»), а не норма. Реплика со
// значка статуса (⬜ ✅ ❌) — вставленная цитата ответа агента, а не слова человека.
const STRONG = new RegExp(
  "(^|[^а-яёa-z])(я же (говорил|говорю|просил|сказал|писал)|говорил же|сколько (раз|можно)|" +
  "в который раз|(ещё|еще) раз говорю|i (already )?told you)([^а-яёa-z]|$)",
  "i",
);
const WEAK = /(^|[^а-яёa-z])(опять(?! же)|снова|again)([^а-яёa-z]|$)/i;

function isRepeat(text) {
  const t = String(text || "").trim();
  if (isPaste(t) || /^[⬜✅❌☐☑]/u.test(t)) return false;
  return STRONG.test(t) || (WEAK.test(t) && !t.includes("?"));
}

// Правила свода: пункты списка с меткой сторожа `<!-- aqk: … -->` — так их размечает комплект.
// Свод без меток — пункты под заголовком про правила. Заголовок правила — жирное начало или
// часть до двоеточия: по нему и сверяем, хвост пояснения совпал бы с чем угодно.
function entryRules(entryText) {
  const items = [];
  let cur = null;
  let section = "";
  for (const line of String(entryText).split(/\r?\n/)) {
    const h = /^#{1,4}\s+(.+)$/.exec(line);
    if (h) { section = h[1]; cur = null; continue; }
    const b = /^[-*]\s+(.+)$/.exec(line);
    if (b) { cur = { text: b[1], section }; items.push(cur); continue; }
    if (cur && /^\s{2,}\S/.test(line)) cur.text += ` ${line.trim()}`;
    else cur = null;
  }
  const marked = items.filter((r) => /<!--\s*aqk:/.test(r.text));
  const pool = marked.length ? marked : items.filter((r) => /правил|rules|constraints|запрет/i.test(r.section));
  return pool.map((r) => {
    const body = r.text.replace(/<!--[\s\S]*?-->/g, "").trim();
    const title = (/^\*\*([^*]+)\*\*/.exec(body) || /^([^:]{3,60}):/.exec(body) || [, body.slice(0, 100)])[1].trim();
    return { title, arbiter: (/<!--\s*aqk:\s*(\S+?)\s*-->/.exec(r.text) || [])[1] || null };
  });
}

// Слова-пометки повтора и служебные слова по правилу не сверяются: иначе «опять» совпало бы с
// любым правилом, где оно встретилось.
const NOT_TOPIC = new Set(["опять", "снова", "говор", "проси", "сказа", "писал", "тольк", "всегд",
  "никог", "нужно", "можно", "котор", "когда", "чтобы", "этого", "again", "told", "always", "never"]);
const topic = (t) => new Set(keyWords(t).map(stem).filter((s) => !NOT_TOPIC.has(s)));

// Записано, а поправлять всё равно приходится: повтор, у которого с заголовком правила совпали
// две основы — или все, если заголовок короче трёх слов.
function repeatedRules(repeats, entryText) {
  const out = [];
  for (const r of entryRules(entryText)) {
    const t = topic(r.title);
    if (!t.size) continue;
    for (const m of repeats) {
      const common = [...topic(m.text)].filter((s) => t.has(s)).length;
      if (common >= 2 || (t.size <= 2 && common === t.size)) out.push({ rule: r.title, arbiter: r.arbiter, ...m });
    }
  }
  return out;
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
  const repeats = [];
  let typedTotal = 0;
  for (const f of files) {
    let raw = "";
    try { raw = await readFile(join(root, f), "utf8"); } catch { continue; }
    for (const m of typedFrom(raw)) {
      typedTotal++;
      const key = m.text.toLowerCase().slice(0, 200);
      if (seen.has(key)) continue;
      seen.add(key);
      if (isRepeat(m.text)) repeats.push(m);
      else if (looksLikeRule(m.text)) said.push(m);
    }
  }

  const entry = await readEntry(await readManifest());
  const byDate = (a, b) => String(b.when).localeCompare(String(a.when));
  const fresh = said.filter((m) => saidNotWritten(m.text, entry)).sort(byDate);
  const ruleHits = repeatedRules(repeats, entry).sort(byDate);
  const onRule = new Set(ruleHits.map((h) => h.text));
  const again = repeats.filter((m) => !onRule.has(m.text)).sort(byDate);

  console.log(`  ${c.dim(L.learn.counted(files.length, typedTotal, said.length, fresh.length, repeats.length))}\n`);
  if (!fresh.length && !repeats.length) {
    console.log(`  ${L.learn.nothing}\n`);
    return;
  }
  const show = (m) => console.log(`  ${c.dim(m.when)}  ${m.text.slice(0, 150)}`);
  // Первым — правило, которое ЗАПИСАНО, а человек всё равно поправляет: текстом оно не держится.
  if (ruleHits.length) {
    console.log(`  ${c.bold(L.learn.ruleTitle)}`);
    for (const h of ruleHits.slice(0, limit)) {
      console.log(`  ${c.yellow("!")}  ${h.rule}${h.arbiter ? c.dim(`  · aqk: ${h.arbiter}`) : ""}`);
      console.log(`     ${c.dim(h.when)}  ${h.text.slice(0, 140)}`);
    }
    console.log(c.dim(`     ${L.learn.ruleHow}\n`));
  }
  if (again.length) {
    console.log(`  ${c.bold(L.learn.repeatTitle)}`);
    again.slice(0, limit).forEach(show);
    if (again.length > limit) console.log(c.dim(`  ${L.learn.andMore(again.length - limit)}`));
    console.log("");
  }
  if (fresh.length) {
    if (repeats.length) console.log(`  ${c.bold(L.learn.restTitle)}`);
    fresh.slice(0, limit).forEach(show);
    if (fresh.length > limit) console.log(c.dim(`\n  ${L.learn.andMore(fresh.length - limit)}`));
  }
  console.log(`\n  ${c.yellow(L.learn.warn)}\n`);
}

export { cmdLearn, logSlug, looksLikeRule, saidNotWritten, typedFrom, isRepeat, repeatedRules };
