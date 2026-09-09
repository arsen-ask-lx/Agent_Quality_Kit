// tool/selfcheck/units-vitals.mjs — «всё ли у самого комплекта подключено».
//
// ЗАЧЕМ ЭТА КОМАНДА. `doctor` смотрит на РЕПОЗИТОРИЙ, `prove` — на гейты, `context` — на
// состояние. На саму обвязку не смотрит никто: стоят ли инструменты, которых требуют
// объявленные гейты; прописан ли хук в `.git/hooks` на самом деле; получает ли агент состояние.
// Сегодня это выясняется красным гейтом посреди коммита — в худший момент из возможных.
//
//   node --test tool/selfcheck/units-vitals.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { vitalsRows, vitalsVerdict } from "../commands/vitals.mjs";

const ok = { tools: [], unparsed: 0, preCommit: true, sessionHook: true, version: null };

// ТРИ СОСТОЯНИЯ, А НЕ ДВА. «Не подключено» и «не знаем» — разные ответы, и сливать их значит
// врать ровно тем способом, против которого написан весь комплект.
test("неизвестное не выдаётся за исправное", () => {
  const rows = vitalsRows({ ...ok, preCommit: null });
  const hook = rows.find((r) => r.key === "preCommit");
  assert.equal(hook.ok, null, "не смогли посмотреть — значит неизвестно, а не «нет»");
  // И «нет» — тоже отдельное состояние, не равное ни «да», ни «неизвестно».
  assert.equal(vitalsRows({ ...ok, preCommit: false }).find((r) => r.key === "preCommit").ok, "no");
});

test("отсутствующий инструмент объявленного гейта — отказ, а не мелочь", () => {
  const rows = vitalsRows({ ...ok, tools: [{ gate: "lint", prog: "ruff", found: false }] });
  const t = rows.find((r) => r.key === "tools");
  assert.equal(t.ok, false);
  assert.match(t.detail, /ruff/);
  assert.match(t.detail, /lint/, "названо, КАКОЙ гейт останется без арбитра");
});

test("все инструменты на месте — строка зелёная", () => {
  const rows = vitalsRows({ ...ok, tools: [{ gate: "lint", prog: "ruff", found: true }] });
  assert.equal(rows.find((r) => r.key === "tools").ok, true);
});

test("непонятые строки манифеста попадают в вердикт", () => {
  const rows = vitalsRows({ ...ok, unparsed: 2 });
  assert.equal(rows.find((r) => r.key === "manifest").ok, false);
});

// Код возврата: красное — отказ, неизвестное — не отказ. Иначе команда краснела бы у всех,
// у кого просто нет `.claude/`, и её выключили бы в первый день.
test("вердикт краснеет от отказов, но не от незнания и не от выбора", () => {
  assert.equal(vitalsVerdict(vitalsRows(ok)), 0);
  assert.equal(vitalsVerdict(vitalsRows({ ...ok, preCommit: null, sessionHook: null })), 0);
  // Хука нет — это решение человека (гоняет в конвейере), а не поломка. Команда, которая
  // кричит «сломано» про выбор, перестаёт читаться вместе с настоящими отказами.
  assert.equal(vitalsVerdict(vitalsRows({ ...ok, preCommit: false, sessionHook: false })), 0);
  assert.equal(vitalsVerdict(vitalsRows({ ...ok, unparsed: 1 })), 1);
  assert.equal(vitalsVerdict(vitalsRows({ ...ok, tools: [{ gate: "g", prog: "x", found: false }] })), 1);
});

// НАЙДЕНО АУДИТОМ ФИЧ 2026-09-09. Реестр ответил ошибкой (не упал запрос, а вернул не-200) —
// `latest` остаётся пустым, и строка печатала «0.9.0, свежая». То есть посмотреть не смогли, а
// сказали «всё хорошо»: ровно тот грех, против которого написан весь комплект, у него самого.
// Три состояния, а не два: свежая · старая · посмотреть не смогли.
test("не дозвонились до реестра — так и говорим, а не «свежая»", () => {
  const unknown = vitalsRows({ ...ok, version: { current: "0.9.0", latest: "" } });
  const u = unknown.find((r) => r.key === "version");
  assert.equal(u.ok, null);
  assert.match(u.detail, /0\.9\.0/);
  // Утверждение по СМЫСЛУ, а не по слову: «свежая ли, неизвестно» тоже содержит корень «свеж».
  // Первая версия этого теста ловила именно слово и краснела на честном тексте.
  assert.match(u.detail, /неизвестн|unknown/i, `незнание не названо: ${u.detail}`);

  const fresh = vitalsRows({ ...ok, version: { current: "0.9.0", latest: "0.9.0" } });
  const fd = fresh.find((r) => r.key === "version").detail;
  assert.doesNotMatch(fd, /неизвестн|unknown/i);
  assert.notEqual(fd, u.detail, "«свежая» и «не знаем» неразличимы по выводу");
});

// Устаревшая версия — не отказ: человек мог закрепить её сознательно.
test("старая версия сообщается, но не роняет", () => {
  const rows = vitalsRows({ ...ok, version: { current: "0.8.0", latest: "0.9.0" } });
  const v = rows.find((r) => r.key === "version");
  assert.equal(v.ok, null);
  assert.match(v.detail, /0\.9\.0/);
  assert.equal(vitalsVerdict(rows), 0);
});
