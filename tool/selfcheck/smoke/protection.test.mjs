// Снимок объявленной защиты: проверка ТОЛЬКО СРАВНИВАЕТ, а пишет его отдельная явная операция.
// Написаны ДО правки.
//
// ОПЫТ, ИЗ КОТОРОГО ОНИ ВЗЯЛИСЬ (2026-09-09). Проверка при отсутствии реестра создавала его
// сама и выходила с нулём. В мелком клоне, где удаление реестра лежит ГЛУБЖЕ выкладки, свидетель
// (история git) слеп — и проверка записала УЖЕ ОСЛАБЛЕННЫЙ набор как новый эталон:
//
//   снят снимок объявленной защиты: 2 гейтов → ratchets/gates-declared.txt
//   код: 0                                   ← гейт «secrets» исчез и УЗАКОНЕН
//
// Храповик крутился назад. Отсюда правило: отсутствующий снимок — не зелёное, и проверка,
// выносящая вердикт, не имеет права менять то, о чём судит.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { project, run, aqk, gate } from "./_fixture.mjs";

const MAN = (gates) =>
  `aqk: 1\nentry: [AGENTS.md]\nratchets: ratchets\ngates:\n${gates.map((g) => `  ${g}: "true"\n`).join("")}`;
const REG = "# Снимок объявленной защиты. Набор может только РАСТИ.\n";

test("отсутствующий снимок — не зелёное, и проверка его не создаёт", (t) => {
  const p = project(t, { ".aqk.yml": MAN(["lint", "secrets"]), "AGENTS.md": "# свод\n" });
  const r = gate(p, "protection-not-removed");
  assert.notEqual(r.code, 0, `снимка нет, а проверка зелёная:\n${r.out}`);
  assert.equal(existsSync(join(p.dir, "ratchets", "gates-declared.txt")), false,
    "проверка создала файл, о котором судит");
});

test("мелкий клон не узаконивает ослабленный набор", (t) => {
  const p = project(t, {
    ".aqk.yml": MAN(["lint", "secrets", "tests"]),
    "AGENTS.md": "# свод\n",
    "ratchets/gates-declared.txt": `${REG}lint\nsecrets\ntests\n`,
  });
  run(p, "git", ["add", "-A"]);
  run(p, "git", ["commit", "-q", "-m", "первый", "-m", "Сделано: x", "-m", "Не уверен: y"]);
  // Обход: убрали гейт И удалили снимок.
  run(p, "bash", ["-c", `printf '%s' '${MAN(["lint", "tests"])}' > .aqk.yml && git rm -q ratchets/gates-declared.txt`]);
  run(p, "git", ["commit", "-qam", "обход", "-m", "Сделано: x", "-m", "Не уверен: y"]);
  // ...и ушли вперёд, чтобы удаление оказалось глубже выкладки конвейера.
  for (let i = 0; i < 5; i++) {
    run(p, "bash", ["-c", `echo ${i} > f${i}.txt`]);
    run(p, "git", ["add", "-A"]);
    run(p, "git", ["commit", "-qm", `работа ${i}`, "-m", "Сделано: x", "-m", "Не уверен: y"]);
  }
  run(p, "bash", ["-c", "git clone -q --depth 3 file://$PWD shallow 2>/dev/null"]);
  const r = gate(p, "protection-not-removed", "shallow");
  assert.notEqual(r.code, 0, `мелкий клон получил зелёное на ослабленном наборе:\n${r.out}`);
  const reg = join(p.dir, "shallow", "ratchets", "gates-declared.txt");
  assert.equal(existsSync(reg), false, "проверка записала ослабленный набор новым эталоном");
});

// Снимок, отставший от манифеста, — тоже расхождение: иначе гейт, добавленный и убранный до
// обновления снимка, уходит незамеченным. Храповик обязан требовать записи, а не догонять сам.
test("снимок, отставший от манифеста, — не зелёное и не дописывается молча", (t) => {
  const p = project(t, {
    ".aqk.yml": MAN(["lint", "secrets"]),
    "AGENTS.md": "# свод\n",
    "ratchets/gates-declared.txt": `${REG}lint\n`,
  });
  const r = gate(p, "protection-not-removed");
  assert.notEqual(r.code, 0, `снимок отстал, а проверка зелёная:\n${r.out}`);
  const body = readFileSync(join(p.dir, "ratchets", "gates-declared.txt"), "utf8");
  assert.doesNotMatch(body, /secrets/, "проверка дописала снимок сама");
});

test("совпадающий снимок — зелёное; снятый без причины — красное", (t) => {
  const ok = project(t, {
    ".aqk.yml": MAN(["lint", "secrets"]),
    "AGENTS.md": "# свод\n",
    "ratchets/gates-declared.txt": `${REG}lint\nsecrets\n`,
  });
  assert.equal(gate(ok, "protection-not-removed").code, 0, "совпадающий снимок покраснел");

  const gone = project(t, {
    ".aqk.yml": MAN(["lint"]),
    "AGENTS.md": "# свод\n",
    "ratchets/gates-declared.txt": `${REG}lint\nsecrets\n`,
  });
  assert.equal(gate(gone, "protection-not-removed").code, 1, "снятый без причины прошёл");

  const named = project(t, {
    ".aqk.yml": MAN(["lint"]),
    "AGENTS.md": "# свод\n",
    "ratchets/gates-declared.txt": `${REG}lint\nsecrets  # снят: закрыт гейтом lint\n`,
  });
  assert.equal(gate(named, "protection-not-removed").code, 0, "снятый с причиной покраснел");
});

// Писать снимок — дело явной операции, а не проверки. `add` и есть эта операция: он уже меняет
// манифест, и запись в снимок — часть того же действия.
test("aqk add записывает гейт в снимок", (t) => {
  const p = project(t, { "src/a.py": "x = 1\n" });
  aqk(p, "init");
  aqk(p, "add", "todo-without-task");
  const reg = join(p.dir, "ratchets", "gates-declared.txt");
  assert.equal(existsSync(reg), true, "add не создал снимок");
  assert.match(readFileSync(reg, "utf8"), /todo-without-task/, "add не записал гейт в снимок");
});
