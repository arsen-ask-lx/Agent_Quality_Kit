// tool/selfcheck/units-execution.mjs — исход ЗАПУСКА процесса, отдельно от смысла находки.
// Написаны ДО реализации.
//
// ЗАЧЕМ. `prove.mjs` считал находкой ЛЮБОЙ ненулевой код на красном образце. Опыт 2026-09-09:
// проверка, которая ВИСНЕТ на красном образце и молчит на зелёном, получала вердикт
// `proven: 1, ok: true` — то есть зависший гейт объявлялся ловящим брак. Это `pytest || true`
// в функции, которая считает наш главный уровень.
//
// ПОЧЕМУ НЕЛЬЗЯ ОДНИМ ПРАВИЛОМ «1 — находка, 2+ — сбой». Замер по настоящим инструментам:
//   ruff     чисто 0 · находка 1 (и синтаксическая ошибка тоже 1) · неверный флаг 2
//            · НЕСУЩЕСТВУЮЩИЙ ПУТЬ → 0 и «All checks passed!»
//   eslint   чисто 0 · находка 1 · настройка или внутренняя ошибка 2
//   vulture  чисто 0 · НАХОДКА 3 · плохой ввод 1 · ошибка CLI 2
//   pylint   чисто 0 · находка битовой маской (2 ошибка, 4 предупреждение, 8, 16)
//            · ОШИБКА ВЫЗОВА 32
// Общее правило переврало бы vulture и pylint в обе стороны. Значит знание о кодах живёт
// рядом с инструментом — нормализующим адаптером, а протокол остаётся простым.
import test from "node:test";
import assert from "node:assert/strict";
import { classify, findingCodes } from "../lib/execution.mjs";

// Вход — то, что отдаёт spawnSync: { status, signal, error }.
const R = (over = {}) => ({ status: 0, signal: null, error: undefined, ...over });

test("ноль — чисто, объявленный код находки — находка", () => {
  assert.equal(classify(R({ status: 0 })).state, "clean");
  assert.equal(classify(R({ status: 1 })).state, "finding");
});

// Убитый по таймауту процесс отдаёт status null. Прежний код превращал его в 124 и считал
// находкой — а сам же комментарий рядом называл это «не знаем».
test("таймаут — не находка, а сбой инструмента", () => {
  const r = classify(R({ status: null, signal: "SIGTERM" }));
  assert.equal(r.state, "infra_error");
  assert.equal(r.reason, "timeout");
});

test("убийство сигналом — сбой инструмента", () => {
  const r = classify(R({ status: null, signal: "SIGKILL" }));
  assert.equal(r.state, "infra_error");
  assert.match(r.reason, /timeout|signal/);
});

// Процесс не запустился вовсе: нет программы, нет прав, нет каталога.
// Node при истечении срока ставит И signal, И error с кодом ETIMEDOUT. Если смотреть на
// error первым и не различать его код, таймаут называется «ошибкой запуска»: состояние верное,
// причина ложная. Поймано первым же контрпримером после правки — вердикт стал верным, а
// объяснение врало.
test("таймаут не выдаётся за ошибку запуска: у Node при сроке стоит и signal, и error", () => {
  const timedOut = { status: null, signal: "SIGTERM",
    error: Object.assign(new Error("spawnSync /bin/sh ETIMEDOUT"), { code: "ETIMEDOUT" }) };
  assert.equal(classify(timedOut).reason, "timeout");
  const notFound = { status: null, signal: null,
    error: Object.assign(new Error("spawnSync ENOENT"), { code: "ENOENT" }) };
  assert.equal(classify(notFound).reason, "spawn_error");
});

test("ошибка запуска — сбой инструмента, а не находка", () => {
  const r = classify(R({ status: null, signal: null, error: new Error("spawn ENOENT") }));
  assert.equal(r.state, "infra_error");
  assert.equal(r.reason, "spawn_error");
});

test("неожиданный код — сбой инструмента, а не находка", () => {
  const r = classify(R({ status: 2 }));
  assert.equal(r.state, "infra_error");
  assert.equal(r.reason, "unexpected_exit");
  assert.equal(r.code, 2);
});

// Знание о кодах живёт рядом с инструментом. Числа — из замера, а не из памяти.
test("адаптеры знают свои коды: vulture 3 — находка, pylint 32 — ошибка вызова", () => {
  assert.equal(classify(R({ status: 3 }), findingCodes("vulture")).state, "finding");
  assert.equal(classify(R({ status: 1 }), findingCodes("vulture")).state, "infra_error");

  assert.equal(classify(R({ status: 2 }), findingCodes("pylint")).state, "finding");
  assert.equal(classify(R({ status: 24 }), findingCodes("pylint")).state, "finding");
  assert.equal(classify(R({ status: 32 }), findingCodes("pylint")).state, "infra_error");

  // Незнакомая программа — умолчание: 0 чисто, 1 находка, остальное сбой. Это ЧЕСТНЕЕ, чем
  // догадка: неизвестный код становится «не знаем», а не «поймал».
  assert.equal(classify(R({ status: 1 }), findingCodes("неизвестный-инструмент")).state, "finding");
  assert.equal(classify(R({ status: 3 }), findingCodes("неизвестный-инструмент")).state, "infra_error");
});

test("наши собственные обёртки: 2 — «нет инструмента», а не находка", () => {
  assert.equal(classify(R({ status: 2 }), findingCodes("bash")).state, "infra_error");
});
