// СВОЙСТВА классификации исхода — на случайных входах, а не на выбранных руками.
//
// ЗАЧЕМ ОТДЕЛЬНО ОТ units-execution.mjs. Там проверяются НАЗВАННЫЕ случаи: vulture 3, pylint 32,
// таймаут, сигнал. Каждый из них написан человеком, который уже знает, где искать. Пилот
// 2026-09-26 (пункт 3 остатка цикла 1) спрашивает другое: держатся ли утверждения на входах,
// которых никто не выбирал, — в том числе на сочетаниях, про которые мы не думали.
//
// ПОЧЕМУ БЕЗ БИБЛИОТЕКИ. Железное правило: зависимостей нет. Для этой функции и не нужно:
// вход — четыре поля с маленькими областями значений, и генератор на двадцать строк даёт
// покрытие, за которым не нужен fast-check. Взамен пришлось написать самому три вещи, которые
// библиотека даёт даром, и без них свойство — не свойство:
//   · ВОСПРОИЗВОДИМОСТЬ: свой ГПСЧ с зерном, зерно печатается в сообщении отказа;
//   · НЕЗАВИСИМЫЙ ожидаемый ответ: он выводится из ПОЛЕЙ входа, а не повторяет код classify —
//     иначе проверка утверждает лишь то, что функция равна себе;
//   · УМЕНЬШЕНИЕ контрпримера: найденный вход сокращается, пока свойство продолжает падать,
//     чтобы в сообщении стоял минимальный случай, а не случайный.
import test from "node:test";
import assert from "node:assert/strict";
import { classify, findingCodes } from "../lib/execution.mjs";

// ГПСЧ с зерном — mulberry32. Взят потому, что он в четыре строки и его период с запасом
// перекрывает наши сотни прогонов; криптостойкость здесь ни при чём.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TOOLS = ["ruff", "eslint", "vulture", "pylint", "bash", "sh", "несуществующий"];
// Коды выбираются не «от 0 до 255 равномерно»: интересны границы адаптеров (0, 1, 2, 3, 31, 32)
// и то, что рядом с ними. Равномерный шум тратил бы прогоны на середину, где ничего не решается.
const CODES = [0, 1, 2, 3, 4, 8, 16, 24, 31, 32, 33, 64, 124, 127, 255, -1, 1000];
const SIGNALS = [null, "SIGTERM", "SIGKILL", "SIGINT", "SIGSEGV"];
const ERRORS = [null, { code: "ETIMEDOUT" }, { code: "ENOENT" }, { code: "EACCES" }, {}];

function gen(r) {
  const pick = (xs) => xs[Math.floor(r() * xs.length)];
  // status намеренно бывает и null, и undefined, и отсутствующим полем: это три разных входа,
  // и до 2026-09-09 два из них классифицировались иначе, чем третий.
  const statusKind = pick(["code", "null", "undefined", "missing"]);
  const inp = { tool: pick(TOOLS), signal: pick(SIGNALS), error: pick(ERRORS) };
  if (statusKind === "code") inp.status = pick(CODES);
  else if (statusKind === "null") inp.status = null;
  else if (statusKind === "undefined") inp.status = undefined;
  return inp;
}

const toArg = (inp) => {
  const r = { signal: inp.signal, error: inp.error };
  if ("status" in inp) r.status = inp.status;
  return r;
};

// НЕЗАВИСИМЫЙ ожидаемый ответ: порядок решений описан здесь словами предметной области —
// «сбой процесса важнее кода, ноль важнее адаптера» — и выведен из шапки execution.mjs, а не
// списан с её тела. Если однажды тело и это описание разойдутся, падение скажет, какое из двух
// решение, а какое опечатка.
function expected(inp) {
  const isFinding = findingCodes(inp.tool);
  if (inp.error?.code === "ETIMEDOUT") return { state: "infra_error", reason: "timeout", code: null };
  if (inp.error) return { state: "infra_error", reason: "spawn_error", code: null };
  const missing = !("status" in inp) || inp.status === null || inp.status === undefined;
  if (missing) {
    const reason = !inp.signal || inp.signal === "SIGTERM" ? "timeout" : "signal";
    return { state: "infra_error", reason, code: null };
  }
  if (inp.status === 0) return { state: "clean", reason: null, code: 0 };
  if (isFinding(inp.status)) return { state: "finding", reason: null, code: inp.status };
  return { state: "infra_error", reason: "unexpected_exit", code: inp.status };
}

const holds = (inp) => {
  try {
    return JSON.stringify(classify(toArg(inp), findingCodes(inp.tool))) === JSON.stringify(expected(inp));
  } catch {
    return false;
  }
};

// Уменьшение: по одному полю приводим вход к самому скромному значению и смотрим, падает ли он
// всё ещё. Библиотечное shrinking умнее, но задача та же — чтобы в сообщении стоял случай,
// который можно прочитать глазами.
function shrink(bad) {
  let best = bad;
  for (const [key, simplest] of [["error", null], ["signal", null], ["tool", "несуществующий"], ["status", 1]]) {
    if (!(key in best)) continue;
    const cand = { ...best, [key]: simplest };
    if (!holds(cand)) best = cand;
  }
  return best;
}

// ЗЕРНО ЗАПИСАНО В КОДЕ, а не взято из часов. Проверка, которая на одной машине падает, а на
// другой нет, для нас худший вид проверки: она делает зелёное свойством дня, а не кода.
// Второе зерно — не «на всякий случай»: первое выбрано первым, и полагаться на его удачу нельзя.
for (const seed of [20260926, 7]) {
  test(`исход запуска: свойства держатся на 5000 случайных входах (зерно ${seed})`, () => {
    const r = rng(seed);
    for (let i = 0; i < 5000; i++) {
      const inp = gen(r);
      if (!holds(inp)) {
        const min = shrink(inp);
        assert.fail(`зерно ${seed}, попытка ${i}: вход ${JSON.stringify(min)}\n` +
          `  получено: ${JSON.stringify(classify(toArg(min), findingCodes(min.tool)))}\n` +
          `  ожидалось: ${JSON.stringify(expected(min))}`);
      }
    }
  });
}

test("исход запуска: три состояния и ничего кроме них", () => {
  const r = rng(1);
  const seen = new Set();
  for (let i = 0; i < 5000; i++) {
    const inp = gen(r);
    const v = classify(toArg(inp), findingCodes(inp.tool));
    seen.add(v.state);
    // Договор: у сбоя всегда названа причина, у остальных её нет. «Не смогли проверить» без
    // причины неотличимо от «не смогли» с причиной только в выводе — а чинят по причине.
    if (v.state === "infra_error") assert.ok(v.reason, `сбой без причины на ${JSON.stringify(inp)}`);
    else assert.equal(v.reason, null, `у ${v.state} появилась причина: ${JSON.stringify(inp)}`);
  }
  assert.deepEqual([...seen].sort(), ["clean", "finding", "infra_error"],
    "какое-то из трёх состояний не встретилось вовсе — генератор не покрывает свою же область");
});

test("исход запуска: одинаковый вход даёт одинаковый ответ", () => {
  const r = rng(42);
  for (let i = 0; i < 1000; i++) {
    const inp = gen(r);
    const a = classify(toArg(inp), findingCodes(inp.tool));
    const b = classify(toArg(inp), findingCodes(inp.tool));
    assert.deepEqual(a, b, `ответ зависит не только от входа: ${JSON.stringify(inp)}`);
  }
});
