// tool/selfcheck/units-learn.mjs — проверки разбора локальных логов сессий.
//
// ЗАЧЕМ ОТДЕЛЬНО. Файл модульных проверок разводится по смыслу третий раз (после units-level и
// units-evidence) — предел в 500 строк держит наш же гейт file-size-limit. Здесь всё про то,
// как из переписки достаются кандидаты в правила, и ничего больше.
//
//   node --test tool/selfcheck/units-learn.mjs

import test from "node:test";
import assert from "node:assert/strict";

// Каталог логов зовётся по рабочему пути, где всё, кроме букв и цифр, заменено на дефис.
// Проверено на живой машине: /home/ser/projects/aqk → -home-ser-projects-aqk,
// /home/ser/projects/audit_project → -home-ser-projects-audit-project.
test("logSlug: путь проекта превращается в имя каталога логов", async () => {
  const { logSlug } = await import("../commands/learn.mjs");
  assert.equal(logSlug("/home/ser/projects/aqk"), "-home-ser-projects-aqk");
  assert.equal(logSlug("/home/ser/projects/audit_project"), "-home-ser-projects-audit-project");
  assert.equal(logSlug("C:\\work\\my.app"), "c-work-my-app");
});

// Отбор наставлений. Меряно на 1619 уникальных напечатанных репликах: маркеры дают 79 штук,
// то есть 4%. Точность неполная и названа вслух — это список кандидатов, а не находок.
test("looksLikeRule: наставление отличается от обычной реплики", async () => {
  const { looksLikeRule } = await import("../commands/learn.mjs");
  assert.equal(looksLikeRule("файл не трогай AI_main_inst.md"), true);
  assert.equal(looksLikeRule("делай прогон с базой обязательно"), true);
  assert.equal(looksLikeRule("never commit secrets"), true);
  assert.equal(looksLikeRule("ок го дальше"), false);
  assert.equal(looksLikeRule("а что там по отчёту"), false);
});

// Длинная вставка наставлением не считается: в логе лежат и вставленный вывод команд, и куски
// файлов. Первый прогон без этого отсева выдал «agent quality kit» 44 раза — то есть пути и
// ссылки, а не правила.
test("looksLikeRule: длинная вставка и код не считаются правилом", async () => {
  const { looksLikeRule } = await import("../commands/learn.mjs");
  assert.equal(looksLikeRule("никогда " + "x".repeat(500)), false);
  assert.equal(looksLikeRule("нельзя\n```\ncode\n```"), false);
});

// Главное утверждение команды: сказано вслух и НЕ записано. Слово из наставления, которого нет
// в точке входа, — повод завести правило; совпавшее — повод не шуметь.
test("saidNotWritten: правило, уже стоящее в точке входа, не показывается", async () => {
  const { saidNotWritten } = await import("../commands/learn.mjs");
  const entry = "# правила\n- Секреты никогда не попадают в код.\n";
  assert.equal(saidNotWritten("никогда не коммить секреты в код", entry), false);
  assert.equal(saidNotWritten("делай прогон с базой обязательно", entry), true);
});

// Русский язык склоняет. «локальный костыль» в реплике и «до местного костыля» в своде — одно и
// то же правило, и по целому слову они не совпадают. Найдено живым прогоном: без сверки по
// основе первым же кандидатом вышло правило, внесённое в точку входа в тот же день.
test("saidNotWritten: склонение не делает записанное правило незаписанным", async () => {
  const { saidNotWritten } = await import("../commands/learn.mjs");
  const entry = "- Любое сомнение проверяется снаружи, чтобы не выдумать местного костыля.";
  assert.equal(saidNotWritten("любое сомнение проверяем всегда чтобы не сделать костыль", entry), false);
});

// Отбор по promptSource — то, ради чего команда вообще работает. В логе 25 353 записи `user`,
// из них человеком напечатано 1912; остальное результаты инструментов, служебные вставки и
// принятые подсказки. Первая версия отбирала по длине и языку и выдавала вставленные пути.
test("typedFrom: берётся только напечатанное человеком", async () => {
  const { typedFrom } = await import("../commands/learn.mjs");
  const lines = [
    JSON.stringify({ type: "user", promptSource: "typed", timestamp: "2026-09-08T10:00:00Z", message: { role: "user", content: "никогда так не делай" } }),
    JSON.stringify({ type: "user", promptSource: "system", message: { role: "user", content: "служебное" } }),
    JSON.stringify({ type: "user", message: { role: "user", content: [{ type: "tool_result", content: "вывод" }] } }),
    JSON.stringify({ type: "assistant", message: { role: "assistant", content: "ответ" } }),
    "не json вовсе",
    "",
  ].join("\n");
  const got = typedFrom(lines);
  assert.equal(got.length, 1);
  assert.equal(got[0].text, "никогда так не делай");
  assert.equal(got[0].when, "2026-09-08");
});

// Текст блоками, а не строкой: так приходит реплика с приложенным файлом. Берём текстовые
// блоки и только их — картинка и результат инструмента правилом быть не могут.
test("typedFrom: реплика блоками собирается из текстовых блоков", async () => {
  const { typedFrom } = await import("../commands/learn.mjs");
  const line = JSON.stringify({
    type: "user", promptSource: "typed", timestamp: "2026-09-08T11:00:00Z",
    message: { role: "user", content: [{ type: "image" }, { type: "text", text: "всегда так" }] },
  });
  assert.equal(typedFrom(line)[0].text, "всегда так");
});
