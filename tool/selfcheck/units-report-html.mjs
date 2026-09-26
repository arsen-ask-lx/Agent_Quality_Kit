// HTML-отчёт для человека: чистая функция «состояние + история → страница».
//
// ОТКУДА. Решение владельца 2026-09-26 (`PROJECT.md` §9а): человек не видит, стало ли лучше, и
// не может направлять агента. Макет одобрен тем же днём. Проверяется перебором случаев, а не
// прогоном: на нашем репозитории не бывает ни прогона без истории, ни гейта с `<` в имени.
//
// ЧТО ПРОВЕРЯЕТСЯ И ПОЧЕМУ ИМЕННО ЭТО.
//   - «не смогли проверить» не сливается с находкой: иначе человек пошлёт агента чинить код там,
//     где сломан инструмент;
//   - «было → стало» считается по ПОЛНЫМ прогонам: урезанный (`--only`) дал бы «стало лучше»,
//     означающее «меньше проверяли»;
//   - страница без внешних адресов: отчёт открывают без интернета и в закрытом контуре;
//   - имена экранируются: имя гейта и путь файла приходят из чужого манифеста.
import test from "node:test";
import assert from "node:assert/strict";
import { renderReport } from "../lib/report-html.mjs";
import { ru } from "../i18n/ru.mjs";

const entry = (gates, extra = {}) => ({
  at: "2026-09-26T10:00:00.000Z", version: "0.17.0", head: "2dc31a83a2df", level: 2,
  partial: false, skipped: [], gates, secs: Object.fromEntries(Object.keys(gates).map((g) => [g, 1.5])), ...extra,
});
const base = { entry: "AGENTS.md", rules: { total: 15, machine: 2, human: 13 }, probe: { state: "never" }, next: { steps: [], rest: 0 } };
const page = (history, state = {}) => renderReport({ ...base, ...state }, history, { T: ru.html, C: ru.context, self: "aqk", name: "demo" });
const text = (html) => html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

test("прогона не было — так и сказано, а не пустая страница", () => {
  const t = text(page([]));
  assert.match(t, /Прогона ещё не было/);
  assert.match(t, /не с чем сравнить/);
});

test("находка и «не смогли проверить» — разные числа", () => {
  const t = text(page([entry({ a: "ok", b: "fail", c: "cannot" })]));
  assert.match(t, /Красных проверок: 1/);
  assert.match(t, /Не смогли проверить: 1/);
  assert.match(t, /1 из 3/);
});

test("было → стало: сломавшаяся и починенная проверка названы по имени", () => {
  const t = text(page([entry({ a: "ok", b: "fail" }), entry({ a: "fail", b: "ok" })]));
  assert.match(t, /сломались\s*:?\s*a\b/);
  assert.match(t, /починены\s*:?\s*b\b/);
});

test("урезанный прогон не участвует в сравнении", () => {
  const h = [entry({ a: "fail", b: "fail" }), entry({ a: "ok" }, { partial: true, skipped: ["b"] })];
  const t = text(page(h));
  assert.match(t, /не с чем сравнить/, `урезанный прогон сравнён с полным:\n${t}`);
});

test("слепые классы пробы названы по имени и файлу", () => {
  const t = text(page([entry({ a: "ok" })], { probe: { state: "stale", behind: 87, blind: 1, classes: [{ slug: "swallowed-error", file: "src/x.py" }] } }));
  assert.match(t, /swallowed-error/);
  assert.match(t, /src\/x\.py/);
  assert.match(t, /отстала на 87 коммитов/);
});

test("шаги агенту — теми же словами, что в блоке состояния", () => {
  const next = { steps: [{ kind: "start", slug: "no-print-in-prod", intent: "печать", command: "eslint ." }], rest: 2 };
  const t = text(page([entry({ a: "ok" })], { next }));
  // Сравнение без пробелов: тег <code> на странице заменяет обратные кавычки блока, а граница тега
  // даёт лишний пробел — это разметка, а не расхождение слов.
  const squash = (s) => s.replace(/[`\s]/g, "");
  assert.ok(squash(t).includes(squash(ru.context.nextStep.start(next.steps[0]))), `шаг не совпал с блоком:\n${t}`);
  assert.match(t, /И ещё 2/);
});

test("имя из чужого манифеста экранируется", () => {
  const html = page([entry({ "<img src=x onerror=alert(1)>": "fail" })]);
  assert.doesNotMatch(html, /<img src=x/);
});

test("страница не тянет ничего из сети", () => {
  const html = page([entry({ a: "ok" }), entry({ a: "fail" })]);
  assert.doesNotMatch(html, /(src|href)\s*=\s*["']?(https?:)?\/\//i);
  assert.doesNotMatch(html, /@import|url\(\s*["']?https?:/i);
});
