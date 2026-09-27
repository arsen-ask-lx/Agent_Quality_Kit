// tool/selfcheck/units-tools.mjs — приёмка сведений об инструментах (`kit/tools/*.json`).
//
// Правило про инструмент принимается так же, как запись каталога: оно обязано покраснеть на
// каждом своём красном примере и промолчать на каждом зелёном, и нести дословную цитату с
// адресом. Без этого сведения стали бы нашим пересказом чужой документации — ровно тем
// «универсальным проверяльщиком», который устаревает и даёт ложное чувство соответствия.
//
//   node --test tool/selfcheck/units-tools.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { loadTools, ruleFires, effectiveCommand, detectTool } from "../lib/tools.mjs";

const tools = await loadTools();

test("сведения об инструментах есть и разбираются", () => {
  assert.ok(tools.length >= 2, `найдено ${tools.length}`);
});

for (const t of tools) {
  test(`${t.tool}: у сведений есть всё, что нужно человеку и агенту`, () => {
    for (const k of ["tool", "detect", "catches", "catches_en", "docs", "install", "exit", "exit_en"]) {
      assert.ok(String(t[k] || "").trim(), `нет поля ${k}`);
    }
    assert.match(t.docs, /^https:\/\//, "документация — адресом");
    // Узнаётся по имени, а если по подкоманде (`k6 run`, `st run`) — по примеру команды.
    assert.ok(new RegExp(t.detect).test(t.detect_example || t.tool), "инструмент не опознаётся по собственной команде");
  });

  for (const r of t.off || []) {
    test(`${t.tool}/${r.id}: краснеет на красных примерах, молчит на зелёных`, () => {
      for (const k of ["source", "why", "why_en", "fix", "fix_en"]) {
        assert.ok(String(r[k] || "").trim(), `нет поля ${k}`);
      }
      // Доказательство правила — либо дословная цитата из документации, либо наш ЗАМЕР с версией
      // и датой, когда документация молчит (mutmut: про выживших мутантов в ней ни слова, а код
      // выхода 0 виден только запуском). Третьего нет: пересказ не принимается.
      assert.ok(String(r.quote || "").trim() || /\d{4}-\d{2}-\d{2}/.test(String(r.measured || "")),
        "нет ни цитаты, ни замера с датой");
      assert.match(r.source, /^https:\/\//);
      assert.ok(r.red?.length && r.green?.length, "нужен хотя бы один красный и один зелёный пример");
      const norm = (x) => (typeof x === "string" ? { command: x, config: null } : x);
      for (const ex of r.red.map(norm)) {
        assert.equal(ruleFires(r, ex.command, ex.config ? [ex.config] : []), true, `промолчало на красном: ${JSON.stringify(ex)}`);
      }
      for (const ex of r.green.map(norm)) {
        assert.equal(ruleFires(r, ex.command, ex.config ? [ex.config] : []), false, `сработало на зелёном: ${JSON.stringify(ex)}`);
      }
    });
  }
}

test("обёртка npm run раскрывается до скрипта — там живут флаги", () => {
  const cmd = effectiveCommand("npm run lint", { lint: "eslint . --max-warnings 0" });
  assert.match(cmd, /eslint \. --max-warnings 0/);
  assert.equal(detectTool(tools, cmd)?.tool, "eslint");
  assert.equal(effectiveCommand("pnpm lint", { lint: "ruff check ." }).includes("ruff"), true);
  assert.equal(effectiveCommand("make lint", {}), "make lint", "make не раскрывается — угадывать нельзя");
});

test("правило про конфиг без конфига не срабатывает: «нечего читать» не значит «заглушён»", () => {
  const eslint = tools.find((t) => t.tool === "eslint");
  const warn = eslint.off.find((r) => r.id === "warnings-never-fail");
  assert.equal(ruleFires(warn, "eslint .", []), false);
});

// СОВЕТ «ЧТО ПОСТАВИТЬ». Поле `for` читается советом, и его ключи обязаны быть признаками,
// которые `doctor` вычисляет. До 2026-09-27 у axe стояло `has_frontend`, у k6 — `has_server`:
// таких признаков нет, и совет по ним молча не сработал бы никогда.
test("for: каждый признак инструмента вычисляется doctor — или совет отключён с причиной", async () => {
  const { ADVICE_FACTS } = await import("../lib/tools.mjs");
  for (const t of tools) {
    if (t.no_advice) { assert.ok(String(t.no_advice).trim().length > 20, `${t.tool}: no_advice без причины`); continue; }
    for (const k of Object.keys(t.for || {})) {
      if (k === "langs") continue;
      assert.ok(ADVICE_FACTS.includes(k), `${t.tool}: признака ${k} doctor не вычисляет`);
    }
  }
});

const fx = (o = {}) => ({ has_tests: false, has_ui: false, has_api_spec: false, has_ci: false, has_gh_actions: false, ...o, langs: new Set(o.langs || []), mainLangs: o.mainLangs || o.langs || [] });

test("toolAdvice: есть описание API — советуется schemathesis, с признаком-причиной", async () => {
  const { toolAdvice } = await import("../lib/tools.mjs");
  const adv = toolAdvice(tools, fx({ has_api_spec: true }), new Set());
  const st = adv.find((a) => a.tool.tool === "schemathesis");
  assert.ok(st, "schemathesis не посоветован");
  assert.deepEqual(st.because, ["has_api_spec"]);
});

test("toolAdvice: инструмент уже стоит в проверке — не советуется", async () => {
  const { toolAdvice } = await import("../lib/tools.mjs");
  const adv = toolAdvice(tools, fx({ has_api_spec: true }), new Set(["schemathesis"]));
  assert.equal(adv.find((a) => a.tool.tool === "schemathesis"), undefined);
});

test("toolAdvice: один линтер на язык — eslint стоит, biome не советуется", async () => {
  const { toolAdvice } = await import("../lib/tools.mjs");
  const adv = toolAdvice(tools, fx({ langs: ["typescript"] }), new Set(["eslint"]), 10);
  assert.equal(adv.find((a) => a.tool.tool === "biome"), undefined);
  assert.equal(adv.find((a) => a.tool.tool === "eslint"), undefined);
});

test("toolAdvice: не больше лимита, сначала совет по признаку проекта, потом по одному языку", async () => {
  const { toolAdvice } = await import("../lib/tools.mjs");
  const adv = toolAdvice(tools, fx({ langs: ["typescript", "shell"], has_tests: true, has_ui: true, has_api_spec: true }), new Set());
  assert.equal(adv.length, 3);
  assert.ok(adv[0].because.some((b) => b !== "langs"), "первым стоит совет по одному языку");
});

test("toolAdvice: язык, который в проекте лишь встречается, не повод для совета", async () => {
  const { toolAdvice } = await import("../lib/tools.mjs");
  const adv = toolAdvice(tools, fx({ langs: ["typescript", "python"], mainLangs: ["typescript"], has_tests: true }), new Set(), 10);
  assert.equal(adv.find((a) => a.tool.tool === "mutmut"), undefined, "mutmut посоветован за побочный Python");
  assert.ok(adv.find((a) => a.tool.tool === "stryker"), "stryker не посоветован основному TypeScript");
});

test("toolAdvice: инструмент с no_advice не советуется никогда", async () => {
  const { toolAdvice } = await import("../lib/tools.mjs");
  const all = { langs: new Set(["javascript", "typescript", "python", "shell", "go"]), mainLangs: ["javascript", "typescript", "python", "shell", "go"] };
  for (const k of ["has_tests", "has_ui", "has_api_spec", "has_ci", "has_gh_actions", "has_db", "has_docker", "has_deps"]) all[k] = true;
  const adv = toolAdvice(tools, all, new Set(), 100);
  for (const a of adv) assert.ok(!a.tool.no_advice, `${a.tool.tool} посоветован при no_advice`);
});
