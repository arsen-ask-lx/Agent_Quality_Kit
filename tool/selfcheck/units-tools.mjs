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
    assert.ok(new RegExp(t.detect).test(t.tool), "инструмент не опознаётся по собственному имени");
  });

  for (const r of t.off || []) {
    test(`${t.tool}/${r.id}: краснеет на красных примерах, молчит на зелёных`, () => {
      for (const k of ["quote", "source", "why", "why_en", "fix", "fix_en"]) {
        assert.ok(String(r[k] || "").trim(), `нет поля ${k}`);
      }
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
