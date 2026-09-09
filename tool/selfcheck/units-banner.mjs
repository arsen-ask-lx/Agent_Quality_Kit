// tool/selfcheck/units-banner.mjs — заставка: первая и почти единственная встреча с человеком.
//
// ЗАЧЕМ ПРОВЕРЯТЬ КАРТИНКУ. Не ради красоты. Заставка шириной больше окна разъезжается в кашу
// и портит именно то впечатление, ради которого её и добавили. А в терминале без UTF-8 графика
// Брайлем превращается в вопросительные знаки — и человек решает, что инструмент сломан.
//
//   node --test tool/selfcheck/units-banner.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { banner, BANNER_WIDTH } from "../lib/banner.mjs";

test("заставка влезает в узкое окно", () => {
  const w = Math.max(...banner().split("\n").map((l) => [...l].length));
  assert.ok(w <= 40, `ширина ${w}, а бывают окна и в 40 колонок`);
  assert.equal(w, BANNER_WIDTH, "объявленная ширина обязана совпадать с настоящей");
});

// Версии в заставке НЕТ намеренно — решение владельца: выпуски частые, и номер в картинке
// устаревает быстрее всего остального. За версией есть `--version`, она печатается отдельно.
test("версии в заставке нет", () => {
  assert.doesNotMatch(banner(), /\d+\.\d+\.\d+/);
});

// Терминал без UTF-8 превратит Брайль в мусор. Тогда честнее короткая строка, чем каша,
// по которой человек решит, что инструмент сломан.
test("без UTF-8 вместо графики короткая строка", () => {
  const plain = banner({ LANG: "C" });
  assert.doesNotMatch(plain, /[⣿█]/);
  assert.match(plain, /aqk/i);
});

test("отказ от графики уважается переменной", () => {
  assert.doesNotMatch(banner({ LANG: "ru_RU.UTF-8", AQK_NO_ART: "1" }), /[⣿█]/);
});

// Кошка центрируется по ВИДИМОЙ части, а не по началу строки: пустой Брайль `⠀` занимает место
// и ничего не рисует. При равных отступах рисунок выглядел сдвинутым вправо на целый знак —
// поймано глазом владельца, а не прогоном, и потому закреплено здесь.
test("кошка стоит по центру надписи", () => {
  const lines = banner().split("\n");
  const visible = (l, blanks) => {
    const a = [...l];
    let lo = -1, hi = -1;
    a.forEach((ch, i) => { if (!blanks.has(ch)) { if (lo < 0) lo = i; hi = i; } });
    return lo < 0 ? null : (lo + hi) / 2;
  };
  const catMid = Math.max(...lines.slice(0, 6).map((l) => visible(l, new Set([" ", "⠀"]))));
  const artMid = Math.max(...lines.slice(7, 13).map((l) => visible(l, new Set([" "]))));
  assert.ok(Math.abs(catMid - artMid) <= 1, `центры разошлись: кошка ${catMid}, буквы ${artMid}`);
});

// Подпись центрируется по видимому центру букв, а не по краю строки. Отступ, подобранный на
// глаз, держится до первой правки рисунка — посчитанный переживёт её.
test("подпись стоит по центру надписи", () => {
  const lines = banner().split("\n");
  const mid = (l, blanks) => {
    const a = [...l];
    let lo = -1, hi = -1;
    a.forEach((ch, i) => { if (!blanks.has(ch)) { if (lo < 0) lo = i; hi = i; } });
    return lo < 0 ? null : (lo + hi) / 2;
  };
  const letters = Math.max(...lines.slice(7, 13).map((l) => mid(l, new Set([" "]))));
  const tag = mid(lines[lines.length - 1], new Set([" "]));
  assert.ok(Math.abs(letters - tag) <= 1, `подпись не по центру: буквы ${letters}, подпись ${tag}`);
});
