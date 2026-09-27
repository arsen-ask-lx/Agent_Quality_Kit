// tool/selfcheck/units-rules.mjs — у каждого правила комплекта назван сторож.
//
// ЗАЧЕМ. `kit/rules` уезжает каждому пользователю в `.aqk/rules`. Правило без пометки — текст,
// который агент выполняет, пока помнит; пометка, ведущая в несуществующую запись, — хуже:
// обещает защиту, которой нет. Обе беды ловятся здесь, до выпуска.
//
//   node --test tool/selfcheck/units-rules.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ruleSections, rulesOf, isHuman } from "../lib/rules.mjs";

const KIT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "kit");

test("ruleSections: помеченный заголовок — одно правило, иначе каждый пункт", () => {
  const md = [
    "# Заголовок файла",
    "## Абзац <!-- aqk: человек -->",
    "Текст правила.",
    "## Список",
    "- **Раз.** <!-- aqk: no-print-in-prod -->",
    "- **Два.**",
    "```",
    "- не пункт, пример в коде",
    "```",
  ].join("\n");
  assert.equal(ruleSections(md).length, 2);
  const rules = rulesOf(md);
  assert.deepEqual(rules.map((r) => r.mark), ["человек", "no-print-in-prod", null]);
  assert.equal(rules[2].line, 6);
});

test("isHuman: русская и английская пометка человека", () => {
  assert.equal(isHuman("человек"), true);
  assert.equal(isHuman("Human"), true);
  assert.equal(isHuman("no-print-in-prod"), false);
});

for (const dir of ["rules", "rules-en"]) {
  for (const f of readdirSync(join(KIT, dir)).filter((n) => n.endsWith(".md"))) {
    test(`kit/${dir}/${f}: у каждого правила пометка, и она ведёт в каталог или к человеку`, () => {
      const rules = rulesOf(readFileSync(join(KIT, dir, f), "utf8"));
      assert.ok(rules.length > 0, "в файле правил не нашлось ни одного правила");
      const bad = rules
        .filter((r) => !r.mark || (!isHuman(r.mark) && !existsSync(join(KIT, "gates", r.mark, "gate.yml"))))
        .map((r) => `${f}:${r.line} ${r.mark ? `«${r.mark}» — нет такой записи каталога` : "без пометки"}: ${r.text.slice(0, 60)}`);
      assert.deepEqual(bad, []);
    });
  }
}

test("kit/rules и kit/rules-en размечены одинаково", () => {
  for (const f of readdirSync(join(KIT, "rules")).filter((n) => n.endsWith(".md"))) {
    const ru = rulesOf(readFileSync(join(KIT, "rules", f), "utf8")).map((r) => (isHuman(r.mark) ? "human" : r.mark));
    const en = rulesOf(readFileSync(join(KIT, "rules-en", f), "utf8")).map((r) => (isHuman(r.mark) ? "human" : r.mark));
    assert.deepEqual(en, ru, `${f}: переводы разошлись по составу правил или по сторожам`);
  }
});

test("rulesStatus: считает сторожей и называет записи, которых нет в манифесте", async () => {
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { rulesStatus } = await import("../lib/rules.mjs");
  const dir = mkdtempSync(join(tmpdir(), "aqk-rules-"));
  writeFileSync(join(dir, "a.md"), [
    "## Раз",
    "- печать  <!-- aqk: no-print-in-prod -->",
    "- размер  <!-- aqk: file-size-limit -->",
    "- ещё размер  <!-- aqk: file-size-limit -->",
    "## Два  <!-- aqk: человек -->",
    "## Три",
    "- без пометки",
  ].join("\n"));
  const st = await rulesStatus(dir, new Set(["no-print-in-prod"]));
  assert.deepEqual(st, { total: 5, machine: 3, human: 1, unmarked: 1, missing: [{ gate: "file-size-limit", rules: 2 }] });
  assert.equal(await rulesStatus(join(dir, "нет-такой"), new Set()), null);
});
