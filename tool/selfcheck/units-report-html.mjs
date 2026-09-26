// HTML-отчёт для человека: чистая функция «состояние + история → страница».
//
// ОТКУДА. Решение владельца 2026-09-26 (`PROJECT.md` §9а): человек не видит, стало ли лучше, и
// не может направлять агента. Формат страницы — тот же, что владелец задал для итогов агента:
// сверху «этот шаг», дальше «сделано», «долг», «впереди», у каждого пояснение и чек-лист. Слова
// чек-листов — намерения записей каталога, а не технические имена. Проверяется перебором случаев:
// на нашем репозитории не бывает ни прогона без истории, ни гейта с `<` в имени.
//
// ЧТО ПРОВЕРЯЕТСЯ И ПОЧЕМУ ИМЕННО ЭТО.
//   - порядок разделов: владелец читает сверху «что изменилось сейчас», а не сводку дня;
//   - «не смогли проверить» не сливается с находкой: иначе агента пошлют чинить исправный код;
//   - «было → стало» считается по ПОЛНЫМ прогонам и только по проверкам, что есть в обоих;
//   - долг называется, а его отсутствие сказано словами — молчание прочиталось бы как «чисто»;
//   - сетка «проверки × прогоны» — по клетке на каждую пару, чтобы было видно, что и когда упало;
//   - страница без внешних адресов и с экранированием: имена приходят из чужого манифеста.
import test from "node:test";
import assert from "node:assert/strict";
import { renderReport, renderSummary } from "../lib/report-html.mjs";
import { ru } from "../i18n/ru.mjs";

const entry = (gates, extra = {}) => ({
  at: "2026-09-26T10:00:00.000Z", version: "0.17.0", head: "2dc31a83a2df", level: 2,
  partial: false, skipped: [], gates, secs: Object.fromEntries(Object.keys(gates).map((g) => [g, 1.5])), ...extra,
});
const base = { entry: "AGENTS.md", rules: { total: 15, machine: 2, human: 13 }, probe: { state: "never" }, next: { steps: [], rest: 0 }, ratchets: [] };
const opts = { T: ru.html, C: ru.context, self: "aqk", name: "demo", intents: { "swallowed-error": "ошибка не глушится молча" } };
const page = (history, state = {}) => renderReport({ ...base, ...state }, history, opts);
const md = (history, state = {}) => renderSummary({ ...base, ...state }, history, opts);
const text = (html) => html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const squash = (s) => s.replace(/[`\s]/g, "");

test("разделы идут в порядке владельца: этот шаг, сделано, долг, впереди", () => {
  const t = text(page([entry({ a: "ok" })]));
  const at = ["Этот шаг", "Сделано", "Долг", "Впереди"].map((h) => t.indexOf(h));
  assert.ok(at.every((i) => i >= 0), `нет раздела:\n${t}`);
  assert.deepEqual([...at].sort((x, y) => x - y), at, `порядок нарушен: ${at}`);
});

test("прогона не было — так и сказано, а не пустая страница", () => {
  const t = text(page([]));
  assert.match(t, /Прогона ещё не было/);
  assert.match(t, /aqk doctor --run/);
});

test("сделано — словами намерения из каталога, а не именем проверки", () => {
  const t = text(page([entry({ "swallowed-error": "ok", custom: "ok" })]));
  assert.match(t, /✅\s*ошибка не глушится молча/);
  assert.match(t, /✅\s*custom/, "проверка без описания в каталоге пропала");
});

test("находка и «не смогли проверить» — разные строки долга", () => {
  const t = text(page([entry({ a: "ok", b: "fail", c: "cannot" })]));
  assert.match(t, /⚠️\s*b\b[^⚠]*находка/);
  assert.match(t, /⚠️\s*c\b[^⚠]*не смогли проверить/);
  assert.match(t, /1 из 3/);
});

test("долга нет — сказано словами", () => {
  const t = text(page([entry({ a: "ok" })], { rules: { total: 2, machine: 2, human: 0 }, probe: { state: "fresh", blind: 0 } }));
  assert.match(t, /Долга нет/);
});

test("долг называет храповики, правила человека и устаревшую пробу", () => {
  const t = text(page([entry({ a: "ok" })], {
    ratchets: [{ name: "gates-declared", count: 3 }],
    probe: { state: "stale", behind: 87, blind: 0 },
  }));
  assert.match(t, /gates-declared[^⚠]*3/);
  assert.match(t, /13 из 15/);
  assert.match(t, /87/);
});

test("этот шаг: сломавшаяся и починенная проверка названы, пропавшая — тоже, без «лучше»", () => {
  const t = text(page([entry({ a: "ok", b: "fail", z: "fail" }), entry({ a: "fail", b: "ok" })]));
  assert.match(t, /сломались\s*:?\s*a\b/);
  assert.match(t, /починены\s*:?\s*b\b/);
  assert.match(t, /пропали из прогона\s*:?\s*z\b/);
  assert.doesNotMatch(t, /красных стало меньше/);
});

test("урезанный прогон не участвует в сравнении", () => {
  const t = text(page([entry({ a: "fail", b: "fail" }), entry({ a: "ok" }, { partial: true, skipped: ["b"] })]));
  assert.match(t, /не с чем сравнить/, `урезанный прогон сравнён с полным:\n${t}`);
});

test("впереди — те же слова, что в блоке состояния агента", () => {
  const next = { steps: [{ kind: "start", slug: "no-print-in-prod", intent: "печать", command: "eslint ." }], rest: 2 };
  const t = text(page([entry({ a: "ok" })], { next }));
  assert.ok(squash(t).includes(squash(ru.context.nextStep.start(next.steps[0]))), `шаг не совпал с блоком:\n${t}`);
  assert.match(t, /И ещё 2/);
});

test("слепые классы пробы названы по имени и файлу", () => {
  const t = text(page([entry({ a: "ok" })], { probe: { state: "stale", behind: 87, blind: 1, classes: [{ slug: "swallowed-error", file: "src/x.py" }] } }));
  assert.match(t, /swallowed-error/);
  assert.match(t, /src\/x\.py/);
});

test("сетка: по клетке на каждую пару «проверка × прогон»", () => {
  const html = page([entry({ a: "ok", b: "ok" }), entry({ a: "fail", b: "ok" }), entry({ a: "ok", b: "cannot" })]);
  assert.equal((html.match(/data-cell="/g) || []).length, 6, "клеток не 2 × 3");
  assert.match(html, /data-cell="fail"/);
  assert.match(html, /data-cell="cannot"/);
});

test("имя из чужого манифеста экранируется", () => {
  assert.doesNotMatch(page([entry({ "<img src=x onerror=alert(1)>": "fail" })]), /<img src=x/);
});

test("страница не тянет ничего из сети", () => {
  const html = page([entry({ a: "ok" }), entry({ a: "fail" })]);
  assert.doesNotMatch(html, /(src|href)\s*=\s*["']?(https?:)?\/\//i);
  assert.doesNotMatch(html, /@import|url\(\s*["']?https?:/i);
});

// СВОДКА ДЛЯ GITHUB — тот же формат Markdown-ом: HTML там не показывается (docs.github.com).
test("сводка: те же разделы в том же порядке", () => {
  const s = md([entry({ a: "ok", b: "fail", c: "cannot" })]);
  const at = ["Этот шаг", "Сделано", "Долг", "Впереди"].map((h) => s.indexOf(`### ${h}`));
  assert.ok(at.every((i) => i >= 0), s);
  assert.deepEqual([...at].sort((x, y) => x - y), at);
  assert.match(s, /`b`/);
  assert.match(s, /`c`/);
});

test("сводка: имя из чужого манифеста не становится разметкой", () => {
  const s = md([entry({ "x|y<script>": "fail" })]);
  assert.doesNotMatch(s, /<script>/);
  assert.doesNotMatch(s, /x\|y/);
});
