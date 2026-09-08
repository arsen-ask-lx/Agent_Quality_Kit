// tool/selfcheck/units-brief.mjs — короткая строка присутствия и её ограничитель.
//
// ЗАЧЕМ ЭТО ВООБЩЕ. Владелец: «скачал и че дальше, не понятно, работает он вообще или нет».
// Хук pre-commit молчит на успехе — это его умолчание, проверено по документации: вывод
// показывается только при провале. То есть комплект, который всё держит, для человека
// неотличим от невставленного. Это ровно наш собственный порок: тишина неотличима от успеха.
//
//   node --test tool/selfcheck/units-brief.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { briefLine, adviceDue, pickAdvice } from "../lib/brief.mjs";
import { CATALOGS } from "../i18n/index.mjs";

const T = CATALOGS.ru;

// Строка присутствия печатается ВСЕГДА, в том числе когда всё хорошо: именно тогда она и нужна.
test("строка присутствия несёт числа и уровень", () => {
  const s = briefLine({ held: 12, todo: 3, level: 2, red: [] }, T);
  assert.match(s, /12/);
  assert.match(s, /3/);
  assert.match(s, /AQK-2/);
});

// Красное называется первым и поимённо: человек должен видеть, что чинить, не листая вывод.
test("упавшие гейты названы в самой строке", () => {
  const s = briefLine({ held: 12, todo: 0, level: 1, red: ["file-size-limit", "duplicate-code"] }, T);
  assert.match(s, /file-size-limit/);
  assert.match(s, /duplicate-code/);
});

// Уровень может быть не вычислен — и тогда так и говорим, а не подставляем ноль.
test("невычисленный уровень не выдумывается", () => {
  const s = briefLine({ held: 0, todo: 5, level: -1, red: [] }, T);
  assert.doesNotMatch(s, /AQK--1|AQK-0/);
});

// --- ограничитель совета -----------------------------------------------------
// Совет на КАЖДОМ коммите превращается в шум, а шум пролистывают вместе с настоящими
// находками. Раз в сутки — это заметно и не мешает.
test("совет не повторяется чаще раза в сутки", () => {
  const now = Date.parse("2026-09-08T20:00:00Z");
  assert.equal(adviceDue(null, now), true, "первый раз показывается");
  assert.equal(adviceDue("2026-09-08T19:00:00Z", now), false, "час назад — рано");
  assert.equal(adviceDue("2026-09-07T19:00:00Z", now), true, "сутки прошли");
});

test("испорченная отметка времени не мешает показать совет", () => {
  assert.equal(adviceDue("не дата", Date.parse("2026-09-08T20:00:00Z")), true);
});

// --- выбор совета ------------------------------------------------------------
// Один совет за раз, а не список: список читается как «у вас всё плохо» и не помогает выбрать.
test("советуется одна запись, самая первая из непоставленных", () => {
  const a = pickAdvice([{ slug: "secrets-not-in-code" }, { slug: "file-size-limit" }]);
  assert.equal(a.slug, "secrets-not-in-code");
});

test("советовать нечего — совета нет, а не пустая строка", () => {
  assert.equal(pickAdvice([]), null);
});
