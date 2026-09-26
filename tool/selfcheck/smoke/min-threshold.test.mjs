// Порог `--min`, заданный мусором, — отказ до прогона, а не порог, который ничего не держит.
//
// ОТКУДА. Цикл 2 (`evalite`): у них `--threshold abc` даёт «Threshold NaN% (passed)» и код 0 при
// оценке 0 — проверено на evalite@0.19.0. Тот же вопрос к нашему `--min`, замер 2026-09-26:
//   --min -1   → «Threshold AQK--1 passed», код 0 — порог, который пропускает всё;
//   --min abc  → «AQK-NaN NOT passed» — отказ по случайности сравнения с NaN, текст бессмыслен;
//   --min 9, 1.5 → ступени, которой нет: не пройдёт никогда, и об этом ни слова.
// `--jobs` так уже устроен: целое от 1, иначе стоп до прогона.
import test from "node:test";
import assert from "node:assert/strict";
import { project, aqk } from "./_fixture.mjs";

for (const bad of ["-1", "abc", "1.5", "9", ""]) {
  test(`--min «${bad}» — отказ с названным значением, гейты не запускаются`, (t) => {
    const p = project(t, { "src/a.py": "x = 1\n", ".gitignore": "x\n" });
    aqk(p, "init");
    const r = aqk(p, "doctor", "--run", "--min", bad);
    assert.notEqual(r.code, 0, `порог «${bad}» принят:\n${r.out.slice(-500)}`);
    assert.match(r.out, /--min/, `не сказано, что не так с --min:\n${r.out.slice(-500)}`);
    assert.doesNotMatch(r.out, /AQK-NaN|AQK--1|passed|пройден/i, `порог «${bad}» дошёл до сравнения:\n${r.out.slice(-500)}`);
  });
}

test("--min 0 — законный порог, прогон идёт", (t) => {
  const p = project(t, { "src/a.py": "x = 1\n", ".gitignore": "x\n" });
  aqk(p, "init");
  const r = aqk(p, "doctor", "--run", "--min", "0");
  assert.match(r.out, /AQK-0/, r.out.slice(-500));
});
