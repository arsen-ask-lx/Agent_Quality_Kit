// Проверки каденции пробы. Написаны ДО кода.
//
// ЗАЧЕМ ЭТО ВООБЩЕ. Владелец сформулировал точнее, чем было в замысле: «команду, о которой надо
// вспомнить, агент не вспомнит, а человек о ней не узнает». Это тот же класс, что файл, который
// можно не прочитать, — и решать его надо так же: не напоминанием, а тем, что оно случается
// само. Единица — коммиты, а не сутки: репозиторий, в котором месяц не работали, перепроверять
// незачем, а сто коммитов за день перепроверить надо.
import test from "node:test";
import assert from "node:assert/strict";
import { probeDue, probeState, probeEvery, PROBE_EVERY, blindLines, parseBlind, parseRan, autoProbeAllowed } from "../lib/cadence.mjs";

test("порог по умолчанию — сто коммитов, и он назван числом, а не спрятан", () => {
  assert.equal(PROBE_EVERY, 100);
});

test("проба нужна, когда с прошлой прошло не меньше порога", () => {
  assert.equal(probeDue({ at: 100 }, 199, 100), false);
  assert.equal(probeDue({ at: 100 }, 200, 100), true);
  assert.equal(probeDue({ at: 100 }, 350, 100), true);
});

// Пробы не было НИКОГДА — это не «свежая». Молчание здесь означало бы «всё прикрыто»,
// а прикрыто ли — неизвестно.
test("если пробы не было вовсе — она нужна", () => {
  assert.equal(probeDue(null, 1, 100), true);
  assert.equal(probeDue({}, 500, 100), true);
});

// История короче порога: проба всё равно нужна один раз, иначе новый репозиторий узнает,
// чего он не видит, только на сто первом коммите.
test("в молодом репозитории проба нужна сразу, а не после сотого коммита", () => {
  assert.equal(probeDue(null, 3, 100), true);
});

test("счётчик коммитов неизвестен — состояние неизвестно, а не «свежо»", () => {
  assert.equal(probeDue({ at: 10 }, null, 100), false);
});

// Состояние для человека и для агента: три исхода, и они не сливаются.
test("состояние пробы: не делалась, устарела, свежая", () => {
  assert.deepEqual(probeState(null, 40, 100), { state: "never", behind: null });
  assert.deepEqual(probeState({ at: 10 }, 40, 100), { state: "fresh", behind: 30 });
  assert.deepEqual(probeState({ at: 10 }, 210, 100), { state: "stale", behind: 200 });
  assert.deepEqual(probeState({ at: 10 }, null, 100), { state: "unknown", behind: null });
});

// Порог — свойство ПРОЕКТА, а не наше: сто коммитов на репозитории с десятком коммитов в час
// это трижды в день, а на редком проекте столько не наберётся никогда.
test("порог берётся из манифеста, умолчание остаётся при пустом поле", () => {
  assert.equal(probeEvery({ probe: "250" }), 250);
  assert.equal(probeEvery({ probe: 250 }), 250);
  assert.equal(probeEvery({}), PROBE_EVERY);
  assert.equal(probeEvery(null), PROBE_EVERY);
  assert.equal(probeEvery({ probe: "" }), PROBE_EVERY);
});

// Ноль — это «не делать», а не «делать всегда»: выключатель в манифесте нужен тому, кто не
// может передать переменную окружения, — например конвейеру чужой площадки.
test("ноль выключает пробу", () => {
  assert.equal(probeEvery({ probe: 0 }), 0);
  assert.equal(probeDue(null, 5, 0), true);
});

// Неразобранное значение обязано быть НАЗВАНО, а не подменено умолчанием: иначе в манифесте
// написано одно, а происходит другое — ровно та тихая неправда, против которой весь комплект.
test("непонятое значение порога — null, а не тихое умолчание", () => {
  assert.equal(probeEvery({ probe: "часто" }), null);
  assert.equal(probeEvery({ probe: -5 }), null);
});

// --- отметка несёт ИМЕНА непойманных классов ------------------------------------------
// ЗАЧЕМ. Отметка хранила одно число — `blind: 1`. Агент в `context` видел «один класс», человек
// в `doctor` не видел ничего, и чтобы узнать КАКОЙ, надо было снова запускать пробу — ту самую
// команду, о которой никто не вспоминает. Находка, которую не показали, не предостерегает.
test("отметка пробы: по строке на слепой класс, в самом горячем файле, где он слеп", () => {
  const recs = [
    { entry: "swallowed-error", file: "src/a.py", verdict: "blind" },
    { entry: "swallowed-error", file: "src/b.py", verdict: "blind" },
    { entry: "no-print-in-prod", file: "src/a.py", verdict: "caught" },
    { entry: "dead-code", file: "src/b.py", verdict: "unknown" },
  ];
  const lines = blindLines(recs);
  // То же правило, что у countProbe: класс, слепой хоть где-то, — непокрыт; «не смогли» — не слеп.
  assert.deepEqual(lines, ["blind-class: swallowed-error src/a.py"]);
  const text = ["at: 5", "blind: 1", "", ...lines, "- src/a.py (fixes: 3)"].join("\n");
  assert.deepEqual(parseBlind(text), [{ slug: "swallowed-error", file: "src/a.py" }]);
});

test("отметка старого формата и пустая — пустой список, а не падение", () => {
  assert.deepEqual(parseBlind("at: 5\nblind: 1\n"), []);
  assert.deepEqual(parseBlind(""), []);
  assert.deepEqual(parseBlind(null), []);
});

// «Объявлен сейчас» не значит «поставлен после пробы»: проба и гоняет объявленные гейты.
// Первая версия так и решила — и на самом комплекте написала «поставлено после пробы» про
// gate-not-weakened, который стоял ДО неё и в kit/gates/_skip.sh брак пропустил. Самое ценное
// сообщение («объявлен, но здесь не ловит») подменилось утешительным. Поймано живым прогоном.
test("отметка помнит, какие гейты проба ПРОГОНЯЛА", () => {
  const text = "at: 5\nblind: 1\nran: smoke gate-not-weakened units\n\nblind-class: x a.sh\n";
  assert.deepEqual([...parseRan(text)].sort(), ["gate-not-weakened", "smoke", "units"]);
  // Старая отметка этой строки не несёт: «не знаем», а не «ничего не было объявлено».
  assert.equal(parseRan("at: 5\nblind: 1\n"), null);
  assert.deepEqual([...parseRan("ran:\n")], []);
});

// Проба, встроенная в `doctor --run`, в конвейере — это +2–3 минуты в случайном прогоне раз в
// сто коммитов. Отзыв с живого проекта 2026-09-11: «пусть probe будет отдельной командой или
// задачей, а не сюрпризом внутри быстрой проверки». В конвейере она сама не запускается; у
// человека — по-прежнему сама: там её и надо не забыть.
test("проба сама не запускается в конвейере, в коротком режиме и при AQK_PROBE=0", () => {
  assert.equal(autoProbeAllowed({ brief: false, env: {} }), true);
  assert.equal(autoProbeAllowed({ brief: false, env: { CI: "true" } }), false);
  assert.equal(autoProbeAllowed({ brief: false, env: { GITHUB_ACTIONS: "true" } }), false);
  assert.equal(autoProbeAllowed({ brief: true, env: {} }), false);
  assert.equal(autoProbeAllowed({ brief: false, env: { AQK_PROBE: "0" } }), false);
  // Явное AQK_PROBE=1 включает и в конвейере: у всего, что решено за человека, есть способ решить иначе.
  assert.equal(autoProbeAllowed({ brief: false, env: { CI: "true", AQK_PROBE: "1" } }), true);
});
