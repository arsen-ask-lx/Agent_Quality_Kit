// Отчёт для человека появляется САМ после каждого прогона — и по команде.
//
// ОТКУДА. Решение владельца 2026-09-26: «главное, чтобы агент такие отчёты строил и человек их
// видел». Отчёт, который надо вспомнить собрать, не соберут: тот же класс, что проба, о которой
// надо помнить (`PROJECT.md` §8, «комплект делает работу сам»). Поэтому `doctor --run` пишет его
// каждый раз и печатает путь — сборка стоит миллисекунды, а устаревший отчёт хуже никакого.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { project, aqk } from "./_fixture.mjs";

const setup = (t) => {
  const p = project(t, { "src/a.py": "x = 1\n", ".gitignore": "x\n" });
  aqk(p, "init");
  const man = join(p.dir, ".aqk.yml");
  writeFileSync(man, readFileSync(man, "utf8").replace(/^gates:\s*$/m, 'gates:\n  quiet: "true"\n  loud: "false"'), "utf8");
  return p;
};

test("doctor --run пишет .aqk/report.html и называет путь", (t) => {
  const p = setup(t);
  const r = aqk(p, "doctor", "--run");
  const file = join(p.dir, ".aqk", "report.html");
  assert.ok(existsSync(file), `после прогона отчёта нет:\n${r.out.slice(-800)}`);
  const html = readFileSync(file, "utf8");
  assert.match(html, /loud/, "в отчёте нет упавшей проверки");
  assert.match(html, /quiet/, "в отчёте нет зелёной проверки");
  assert.match(r.out, /\.aqk[\\/]report\.html/, `путь к отчёту не напечатан:\n${r.out.slice(-800)}`);
});

test("aqk report --html собирает отчёт без прогона", (t) => {
  const p = setup(t);
  aqk(p, "doctor", "--run");
  const file = join(p.dir, ".aqk", "report.html");
  rmSync(file);
  const r = aqk(p, "report", "--html");
  assert.equal(r.code, 0, r.out);
  assert.ok(existsSync(file), `report --html не записал отчёт:\n${r.out}`);
  assert.match(readFileSync(file, "utf8"), /loud/);
});
