// tool/selfcheck/smoke/private-names.test.mjs — закрытые имена не попадают в публичный репозиторий.
//
// ЗАЧЕМ. Решение владельца: закрытый проект и всё, что к нему относится, живёт только у него; в
// публичный AQK — никогда. 2026-09-27 сверка нашла в текущих файлах 83 упоминания его имени,
// накопленных за месяц: руками такое не держится. Проверка сравнивает ОТПЕЧАТКИ слов (SHA-256) с
// отпечатками запрещённых имён: самого имени в репозитории нет, иначе проверка его и опубликовала бы.
// Для образцов и этих тестов в списке есть выдуманное имя-канарейка.
import test from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { project, run, tail } from "./_fixture.mjs";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "private-names.mjs");
const check = (p) => run(p, process.execPath, [SCRIPT, "."]);

test("имя-канарейка в любом написании краснит проверку и не печатается", (t) => {
  // Канарейка собирается из кусков во время прогона: написанная буквально, она краснила бы саму
  // проверку на этом же файле — а исключение для тестов было бы дырой для настоящего имени.
  const w = ["aqk", "canary", "private"];
  for (const spelling of [w.join("-"), w.map((x) => x[0].toUpperCase() + x.slice(1)).join("_"), `/home/u/projects/${w.join("_")}/x`, w.join("")]) {
    const p = project(t, { "notes.md": `# заметка\nсм. ${spelling}\n` });
    const r = check(p);
    assert.equal(r.code, 1, `«${spelling}» не пойман:\n${tail(r.out)}`);
    assert.match(r.out, /notes\.md:2/, "место не названо");
    assert.ok(!r.out.toLowerCase().includes(w[1]), "проверка сама печатает запрещённое имя");
  }
});

test("чистый репозиторий — код 0; пустой — «не смогли», а не «чисто»", (t) => {
  const clean = project(t, { "notes.md": "# заметка\nничего закрытого\n" });
  assert.equal(check(clean).code, 0);
  const empty = project(t, {});
  assert.equal(check(empty).code, 2);
});

// Красный образец обязан содержать запрещённое слово, и держать его в образце разрешено ТОЛЬКО
// канарейке — выдуманному имени. Вне образцов она краснит, как настоящее.
test("канарейка в образце гейта не краснит, вне образца — краснит", (t) => {
  const w = ["aqk", "canary", "private"].join("-");
  const sample = project(t, { "checks/gates/x/red/notes.md": `${w}\n` });
  assert.equal(check(sample).code, 0, "канарейка в образце обвинена");
  const outside = project(t, { "checks/notes.md": `${w}\n` });
  assert.equal(check(outside).code, 1);
});
