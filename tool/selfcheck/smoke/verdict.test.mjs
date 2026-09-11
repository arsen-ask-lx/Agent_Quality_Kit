// Прогон обязан называть свой вердикт СЛОВАМИ, а не только кодом возврата.
//
// НАЙДЕНО АУДИТОМ ФИЧ 2026-09-09. `doctor --run` выходил с единицей и в конце не говорил ни
// слова о причине: она оставалась в шапке, а внизу человек видел список зелёных гейтов и шёл
// искать несуществующую поломку. С `--min` вердикт печатался всегда, без него — никогда.
// Обратная сторона нашего же принципа: молчание неотличимо не только от успеха, но и от отказа.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { project, aqk } from "./_fixture.mjs";

test("прогон называет свой вердикт словами в обоих исходах", (t) => {
  const p = project(t, { "src/a.py": "def s():\n    return 1\n" });
  aqk(p, "init");
  // Гейт объявляется ПРЯМО, а не через `add`, и это не лень. `add` выбирает рецепт по тому,
  // что установлено на машине: где есть ruff, у `todo-without-task` берётся родной
  // `ruff check --select FIX,TD`, где нет — переносимый. Значит один и тот же проект получает
  // РАЗНУЮ объявленную команду на разных машинах, и проверка про ВЕРДИКТ начинала зависеть от
  // чужого инструмента. Поймано конвейером: локально зелено, на раннере красно.
  // Здесь проверяется строка вердикта, а не поведение записи каталога, — гейту довольно быть
  // заведомо тихим.
  const man = join(p.dir, ".aqk.yml");
  writeFileSync(man, readFileSync(man, "utf8").replace(/^gates:\s*$/m, 'gates:\n  тихий: "true"'), "utf8");

  // .gitignore нет — прогон красный, и обязан сказать, из-за чего именно. Удаляется ЯВНО:
  // `init` с 2026-09-11 сам создаёт .gitignore под служебные файлы, и прежняя посылка теста
  // («после init его нет») перестала быть правдой.
  rmSync(join(p.dir, ".gitignore"), { force: true });
  const red = aqk(p, "doctor", "--run");
  // Сообщение утверждения обязано нести ВЕСЬ хвост: проверка, которая говорит только «не
  // совпало», отправляет читателя гадать — ровно то, за что мы ругаем чужие проверки.
  const redTail = red.out.trimEnd().split("\n").slice(-6).join("\n");
  assert.notEqual(red.code, 0, `прогон без .gitignore прошёл зелёным:\n${redTail}`);
  assert.match(redTail, /красн/, `вердикт не назван в конце вывода (код ${red.code}):\n${redTail}`);

  // Причина устранена — и «ничего не сказал» обязано отличаться от «всё проверено».
  writeFileSync(join(p.dir, ".gitignore"), "x\n", "utf8");
  const green = aqk(p, "doctor", "--run");
  const greenTail = green.out.trimEnd().split("\n").slice(-6).join("\n");
  assert.equal(green.code, 0, `прогон остался красным:\n${greenTail}`);
  assert.match(greenTail, /зелён/, `успех не назван словами:\n${greenTail}`);
});

// --skip ГРУППОЙ: гейт, которому нужен стенд, в быстром прогоне не идёт — и это СКАЗАНО, а не
// скрыто. Отзыв с живого проекта 2026-09-11 (гейт цены без стенда валил прогон).
test("--skip группой: прогон зелёный, пропущенный назван в выводе и в отчёте", (t) => {
  const p = project(t, { "src/a.py": "x = 1\n" });
  aqk(p, "init");
  const man = join(p.dir, ".aqk.yml");
  writeFileSync(man, readFileSync(man, "utf8").replace(/^gates:\s*$/m, 'gates:\n  тихий: "true"\n  cost: "false"') +
    "groups:\n  stack: [cost]\n", "utf8");
  const r = aqk(p, "doctor", "--run", "--skip", "stack");
  assert.equal(r.code, 0, `прогон без стенда покраснел:\n${r.out.slice(-600)}`);
  assert.match(r.out, /cost/, "пропущенный гейт не назван");
  const report = readFileSync(join(p.dir, ".aqk", "last-run.md"), "utf8");
  assert.match(report, /^~ cost/m, `в отчёте для агента пропущенный не отмечен:\n${report}`);
  // Опечатка в имени группы — отказ с названной причиной, а не прогон всего подряд.
  const typo = aqk(p, "doctor", "--run", "--skip", "stak");
  assert.notEqual(typo.code, 0);
  assert.match(typo.out, /stak/);
});

// --jobs N: независимые гейты параллельно. Отзыв с живого проекта 2026-09-11: 34 гейта идут
// друг за другом больше минуты, «а быструю проверку, которую долго ждать, перестают запускать».
// Параллельность — по флагу: гейты, пишущие в одни файлы (общий dist/), иначе плавали бы.
test("--jobs 3: три секундных гейта идут одновременно, порядок и вердикт прежние", (t) => {
  const p = project(t, { "src/a.py": "x = 1\n", ".gitignore": "x\n" });
  aqk(p, "init");
  const man = join(p.dir, ".aqk.yml");
  writeFileSync(man, readFileSync(man, "utf8").replace(/^gates:\s*$/m,
    'gates:\n  a: "sleep 1"\n  b: "sleep 1; exit 1"\n  c: "sleep 1"'), "utf8");
  const t0 = Date.now();
  const r = aqk(p, "doctor", "--run", "--jobs", "3");
  const secs = (Date.now() - t0) / 1000;
  assert.notEqual(r.code, 0, "упавший гейт b не уронил прогон");
  const order = [...r.out.matchAll(/^\s+\S+\s+([abc])\s/gm)].map((m) => m[1]);
  assert.deepEqual(order, ["a", "b", "c"], `порядок вывода не по объявлению: ${order}`);
  // Три секунды последовательно; параллельно — одна плюс запуск node. Запас на медленную машину.
  assert.ok(secs < 2.8, `прогон шёл ${secs.toFixed(1)} с — параллельности нет`);
});

test("--jobs без числа или с нулём — отказ с причиной, а не тихий последовательный прогон", (t) => {
  const p = project(t, { "src/a.py": "x = 1\n" });
  aqk(p, "init");
  const r = aqk(p, "doctor", "--run", "--jobs", "0");
  assert.notEqual(r.code, 0);
  assert.match(r.out, /--jobs/);
});
