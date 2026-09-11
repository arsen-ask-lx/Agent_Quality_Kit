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
