// В GitHub Actions прогон пишет сводку задания сам — без нашего действия и без прав.
//
// ОТКУДА. Отчёт для человека (решение владельца 2026-09-26) лежит в `.aqk/report.html`, а в
// конвейере файл никто не откроет. Сводка задания (`GITHUB_STEP_SUMMARY`) видна на странице
// прогона и прав не требует. Пишет её программа, а не `action.yml`: логика в действии разошлась бы
// с программой — это сказано в его шапке.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { project, aqk, aqkEnv } from "./_fixture.mjs";

const setup = (t) => {
  const p = project(t, { "src/a.py": "x = 1\n", ".gitignore": "x\n" });
  aqk(p, "init");
  const man = join(p.dir, ".aqk.yml");
  writeFileSync(man, readFileSync(man, "utf8").replace(/^gates:\s*$/m, 'gates:\n  quiet: "true"\n  loud: "false"'), "utf8");
  return p;
};

test("есть GITHUB_STEP_SUMMARY — прогон дописывает туда сводку", (t) => {
  const p = setup(t);
  const file = join(p.dir, "summary.md");
  writeFileSync(file, "# до нас\n", "utf8");
  aqkEnv(p, { GITHUB_STEP_SUMMARY: file }, "doctor", "--run");
  const s = readFileSync(file, "utf8");
  assert.match(s, /^# до нас/, "чужая часть сводки затёрта — дописывать, а не переписывать");
  assert.match(s, /`loud`/, `упавшая проверка не названа:\n${s}`);
});

test("переменной нет — никаких файлов сводки", (t) => {
  const p = setup(t);
  aqkEnv(p, { GITHUB_STEP_SUMMARY: "" }, "doctor", "--run");
  assert.ok(!existsSync(join(p.dir, "summary.md")));
});
