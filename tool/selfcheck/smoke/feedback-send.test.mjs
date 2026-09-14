// tool/selfcheck/smoke/feedback-send.test.mjs — ОТПРАВКА ТОЛЬКО ПО ЯВНОМУ СЛОВУ.
//
// ЗАЧЕМ ЭТО ГЛАВНАЯ ПРОВЕРКА ФАЙЛА. Владелец 2026-09-14 спросил, нельзя ли отправлять отзыв
// «без согласия пользователя, чтобы агент мог быстро сообщить». Ответ — нет, и не из вежливости:
// в README и SECURITY.md написано, что исходящий запрос у комплекта ровно один, про версию.
// Инструмент, который втихую шлёт что-то из чужого репозитория, становится ровно тем, что мы
// критикуем, — а наша аудитория это те, кто проверяет инструменты на вранье.
//
// Поэтому согласие живёт В САМОМ ФЛАГЕ: `--send` не набирают случайно. И это утверждение обязана
// держать машина, а не наше обещание в документации, — иначе однажды рефакторинг отправит письмо
// из команды, которая всю жизнь только печатала.
//
// КАК ПРОВЕРЯЕТСЯ. `AQK_GH` подменяет программу `gh` на скрипт, который записывает сам факт
// вызова в файл. Запуск через `node`, а не через оболочку: то же решение, что у `AQK_BASH` в
// execution.mjs, и оно работает и на windows-задании конвейера.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { project, aqkEnv } from "./_fixture.mjs";

// Поддельный `gh`: пишет, с какими доводами его позвали, и отвечает так, чтобы отправка дошла
// до конца. Чего он НЕ делает — ничего наружу.
function fakeGh(p) {
  const log = join(p.dir, "gh-calls.txt");
  const script = join(p.dir, "fake-gh.mjs");
  writeFileSync(script, `
import { appendFileSync } from "node:fs";
const args = process.argv.slice(2);
appendFileSync(${JSON.stringify(log)}, args.join(" ") + "\\n");
if (args[0] === "auth") process.exit(0);
const all = args.join(" ");
if (all.includes("addDiscussionComment")) { console.log(JSON.stringify({ data: { addDiscussionComment: { comment: { url: "https://example.invalid/c/1" } } } })); process.exit(0); }
console.log(JSON.stringify({ data: { repository: { discussion: { id: "D_test" } } } }));
`, "utf8");
  return { log, env: { AQK_GH: `node ${script.replace(/\\\\/g, "/")}` } };
}

const posix = (s) => String(s).replace(/\\/g, "/");

// ГЛАВНОЕ УТВЕРЖДЕНИЕ ФАЙЛА.
test("без --send команда не зовёт gh ни разу", (t) => {
  const p = project(t, { "AGENTS.md": "# проект\n", ".aqk.yml": 'aqk: 1\nentry:\n  - AGENTS.md\ngates:\n  lint: "true"\n' });
  const g = fakeGh(p);
  const r = aqkEnv(p, g.env, "feedback");
  assert.ok(!existsSync(g.log),
    `команда без --send позвала gh — то есть отправила что-то наружу без слова человека. Вывод:\n${r.out}`);
  assert.match(r.out, /###/, `отчёт не напечатан вовсе. Вывод:\n${r.out}`);
});

test("и с чужими доводами рядом — тоже не зовёт", (t) => {
  const p = project(t, { "AGENTS.md": "# проект\n" });
  const g = fakeGh(p);
  aqkEnv(p, g.env, "feedback", "--verbose", "что-то своими словами");
  assert.ok(!existsSync(g.log), "слово без флага прочиталось как разрешение отправить");
});

test("с --send отправка происходит и адрес показан человеку", (t) => {
  const p = project(t, { "AGENTS.md": "# проект\n", ".aqk.yml": 'aqk: 1\nentry:\n  - AGENTS.md\ngates:\n  lint: "true"\n' });
  const g = fakeGh(p);
  const r = aqkEnv(p, g.env, "feedback", "--send");
  assert.ok(existsSync(g.log), `с --send gh не позвался вовсе. Вывод:\n${r.out}`);
  const calls = readFileSync(g.log, "utf8");
  assert.match(calls, /auth/, "вход не проверялся — отправили бы вслепую");
  assert.match(calls, /addDiscussionComment/, `комментарий не отправлялся. Вызовы:\n${calls}`);
  assert.match(r.out, /example\.invalid/, `человеку не показали, куда ушёл отзыв. Вывод:\n${r.out}`);
});

// Своя строка — самое ценное во всём письме, и она обязана доехать целиком.
test("слова человека попадают в отправленное", (t) => {
  const p = project(t, { "AGENTS.md": "# проект\n" });
  const g = fakeGh(p);
  aqkEnv(p, g.env, "feedback", "--send", "у меня не нашёл ни одного гейта");
  const calls = readFileSync(g.log, "utf8");
  assert.match(calls, /не нашёл ни одного гейта/, `строка человека потерялась. Вызовы:\n${calls}`);
});

// «Не смогли» и «отправлено» обязаны различаться: молчаливый отказ здесь означал бы, что человек
// считает отзыв ушедшим, а его нет. Тот же договор, что у гейтов.
test("без входа в gh команда говорит это вслух и не молчит", (t) => {
  const p = project(t, { "AGENTS.md": "# проект\n" });
  const script = join(p.dir, "no-auth.mjs");
  writeFileSync(script, 'process.exit(1);\n', "utf8");
  const r = aqkEnv(p, { AQK_GH: `node ${posix(script)}` }, "feedback", "--send");
  assert.doesNotMatch(r.out, /example\.invalid/, "сказали, что отправили, хотя не смогли");
  assert.match(r.out, /github\.com/, `не дали запасного пути — человек остался ни с чем. Вывод:\n${r.out}`);
});
