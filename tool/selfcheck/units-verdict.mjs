// tool/selfcheck/units-verdict.mjs — вердикт пробы: «поймано» только ПО ДЕЛУ.
//
// ОТДЕЛЬНЫМ ФАЙЛОМ: units-probe.mjs у предела в 500 строк, и шов настоящий — там разбор
// истории и план пробы, здесь то, на чём держится главное обещание пробы.
//
// ЗАЧЕМ. Отзыв с живого проекта 2026-09-11 (Amplifie, TypeScript на Biome): класс «цвет из
// токена темы» проба отметила пойманным линтером, хотя Biome цвета не проверяет. Подсаженный
// кусок сломал форматирование — упал форматтер. Вердикт считал «покраснел» равным «поймал»:
// код возврата сравнивался, вывод выбрасывался. Итог — «every applicable class is caught by
// something», ложная уверенность ровно в сторону самоуспокоения. К себе комплект был мягче,
// чем к проекту: от чужого гейта мы требуем покраснеть НА БРАКЕ, а свой вердикт этого не
// проверял.
import test from "node:test";
import assert from "node:assert/strict";
import { namesPlant, probeVerdictPaired, catchVerdict } from "../lib/history.mjs";

test("назвал подсаженный файл: путь появился в выводе после подсадки", () => {
  assert.equal(namesPlant("", "src/ui/card.tsx:12:5 lint/style/noColorLiteral", "src/ui/card.tsx"), true);
  // Любая форма пути: относительная с ./, абсолютная из песочницы, с обратными слешами Windows.
  assert.equal(namesPlant("", "./src/ui/card.tsx:3 print found", "src/ui/card.tsx"), true);
  assert.equal(namesPlant("", "/tmp/aqk-probe-x/src/ui/card.tsx:3", "src/ui/card.tsx"), true);
  assert.equal(namesPlant("", "src\\ui\\card.tsx(3,1): error", "src/ui/card.tsx"), true);
});

test("не назвал: упал по своей причине — форматтер, чужой файл, общий итог", () => {
  assert.equal(namesPlant("", "Formatter would have printed the following content.\nFound 1 error.", "src/ui/card.tsx"), false);
  assert.equal(namesPlant("", "src/other.tsx:1 error", "src/ui/card.tsx"), false);
  // Файл упоминался и до подсадки столько же раз — нового ничего не сказано.
  assert.equal(namesPlant("src/ui/card.tsx:1 warn", "src/ui/card.tsx:1 warn", "src/ui/card.tsx"), false);
});

const pairs = (before, after) => ({
  before: before.map(([name, code]) => ({ name, code })),
  after: after.map(([name, code, named]) => ({ name, code, named })),
});

test("покраснел, но подсаженного файла не назвал — «неизвестно», а не «поймано»", () => {
  const { before, after } = pairs([["lint", 0], ["units", 0]], [["lint", 1, false], ["units", 0]]);
  const r = probeVerdictPaired(before, after);
  assert.equal(r.verdict, "unknown");
  assert.equal(r.unattributed, 1);
  assert.equal(r.caught, 0);
});

test("поймал по делу хоть один — «поймано»; безымянное падение соседа этого не отменяет", () => {
  const { before, after } = pairs([["fmt", 0], ["lint", 0]], [["fmt", 1, false], ["lint", 1, true]]);
  const r = probeVerdictPaired(before, after);
  assert.equal(r.verdict, "caught");
  assert.equal(r.caught, 1);
});

test("без сведений о выводе (старые вызовы) поведение прежнее", () => {
  const { before, after } = pairs([["lint", 0]], [["lint", 1, undefined]]);
  assert.equal(probeVerdictPaired(before, after).verdict, "caught");
});

// ИМЕНИ ФАЙЛА МАЛО. Biome, падая на форматировании, тоже называет файл: «src/card.tsx format».
// Отличить «упал на браке» от «упал на подсадке» можно только ПАРОЙ — ровно тем, чем мы проверяем
// чужие гейты: в то же место кладётся ЗЕЛЁНЫЙ образец той же записи. Краснеет и на нём — гейт
// падает от самой подсадки (форматирование, синтаксис), поимка не доказана.
test("пара: на красном назвал файл, на зелёном молчит — поймал", () => {
  const red = { code: 1, out: "src/card.tsx:3 lint/noColorLiteral" };
  const green = { code: 0, out: "" };
  assert.equal(catchVerdict("", red, green, "src/card.tsx"), "caught");
});

test("пара: краснеет и на зелёном, называя тот же файл, — падает от подсадки, не поймал", () => {
  const red = { code: 1, out: "src/card.tsx format ━━━ Formatter would have printed" };
  const green = { code: 1, out: "src/card.tsx format ━━━ Formatter would have printed" };
  assert.equal(catchVerdict("", red, green, "src/card.tsx"), "planting");
});

test("пара: файла не назвал — «безымянно»; зелёного образца под расширение нет — судим по имени", () => {
  assert.equal(catchVerdict("", { code: 1, out: "Found 1 error." }, { code: 0, out: "" }, "src/a.py"), "nameless");
  assert.equal(catchVerdict("", { code: 1, out: "src/a.py:1 T201" }, null, "src/a.py"), "caught");
});

// СЧЁТЧИК ПРОВАЛОВ — НЕ КОД ВЫХОДА. `exit "$FAIL"` при двух провалах даёт 2, а договор гейтов
// читает 2 как «не смогли проверить», а не как находку; при 256 провалах — 0, то есть «чисто»:
// код выхода берётся по модулю 256. Найдено 2026-09-27 доказательством `smoke` подсадкой: две
// упавшие проверки превратились в «сбой самой проверки». Правило одно на все наши скрипты:
// переменная, которую увеличивают на единицу, не уходит в `exit` как есть.
test("ни один скрипт комплекта не выходит со счётчиком провалов", async () => {
  const { readdirSync, readFileSync, existsSync } = await import("node:fs");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const files = [
    ...readdirSync(join(root, "tool", "selfcheck")).filter((f) => f.endsWith(".sh")).map((f) => join(root, "tool", "selfcheck", f)),
    ...readdirSync(join(root, "kit", "gates")).map((g) => join(root, "kit", "gates", g, "check.sh")).filter((f) => existsSync(f)),
  ];
  const bad = [];
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    const counters = [...text.matchAll(/\b([A-Z_]+)=\$\(\(\s*\1\s*\+\s*1\s*\)\)/g)].map((m) => m[1]);
    for (const v of new Set(counters)) {
      if (new RegExp(`^\\s*exit\\s+"?\\$\\{?${v}\\}?"?\\s*$`, "m").test(text)) bad.push(`${f.slice(root.length + 1)}: exit $${v}`);
    }
  }
  assert.deepEqual(bad, [], `счётчик уходит в код выхода: ${bad.join("; ")}`);
});

// ТРУБА В `grep -q` ПОД `pipefail` ПЛАВАЕТ. `grep -q` выходит, найдя совпадение, `printf` получает
// SIGPIPE, и под `pipefail` весь конвейер — провал: найденное читается как ненайденное. Зависит от
// размера текста и загрузки машины. Найдено 2026-09-27: `smoke` краснел на исправном коде только
// тогда, когда его запускал `prove` рядом с другой работой. Лечится функцией `has`, подающей
// текст строкой. Правило одно на все наши скрипты с `pipefail`.
test("под pipefail нет конвейера printf/echo | grep -q", async () => {
  const { readdirSync, readFileSync, existsSync } = await import("node:fs");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const dirs = [["tool", "selfcheck"], ["kit", "ratchet"], ["kit", "gates"]];
  const files = [];
  for (const d of dirs) {
    const base = join(root, ...d);
    for (const f of readdirSync(base)) {
      const p = join(base, f);
      if (f.endsWith(".sh")) files.push(p);
      else if (existsSync(join(p, "check.sh"))) files.push(join(p, "check.sh"));
    }
  }
  const bad = [];
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    if (!/^\s*set\s+-[a-z]*o\s+pipefail/m.test(text)) continue;
    text.split("\n").forEach((line, i) => {
      if (/^\s*#/.test(line)) return;
      if (/(printf|echo)\b[^|]*\|\s*grep\s+(-[a-zA-Z]*q|--quiet)/.test(line)) bad.push(`${f.slice(root.length + 1)}:${i + 1}`);
    });
  }
  assert.deepEqual(bad, [], `труба в grep -q под pipefail: ${bad.join(", ")}`);
});
