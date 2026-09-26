// Повторный прогон гейта не берёт вердикт из кэша анализатора.
//
// ОТКУДА ВОПРОС. Цикл 1 (`research/2026-09-23-upstream-practices/CYCLE-01.md`), строка
// «Удалять старые отчёты анализаторов»: у соседа `smixs/code-quality` устаревший результат
// инструмента считается отдельным классом отказа. Файлов отчёта наши рецепты не читают — вывод
// берётся из прогона. Но ruff держит свой кэш `.ruff_cache` в проекте и по нему решает, какой
// файл смотреть заново.
//
// ЗАМЕР 2026-09-26, ruff 0.16.7. Ключ кэша — время изменения файла и права доступа, ни размера,
// ни содержимого (`crates/ruff/src/cache.rs:32-36` на теге 0.16.7). Чистый файл → прогон → в
// файл вписан `print` (другой размер), время изменения вернули прежним → повторный прогон: код 0.
// С `--no-cache` тот же файл: код 1. Время возвращают `cp -p`, `tar`, `unzip`, `rsync -a`,
// `touch -r` — то есть обычное восстановление файла из копии.
//
// ЧТО ЭТА ПРОВЕРКА НЕ ДОКАЗЫВАЕТ. Только ruff этой версии. У pylint и vulture кэша результатов
// нет, eslint кэширует только с `--cache`, которого в каталоге нет, — это утверждение о рецептах,
// и его держит проверка по всему каталогу ниже.
import test from "node:test";
import assert from "node:assert/strict";
import { utimesSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { project, run } from "./_fixture.mjs";
import { readCatalog, whichSync } from "../../lib/repo.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const NATIVE = String(join(ROOT, "kit", "gates", "_native.sh")).replace(/\\/g, "/");
const catalog = await readCatalog();

const runRecipe = (p, cmd) =>
  run(p, "bash", [NATIVE, ".", ...cmd.replace("{dir}", ".").split(/\s+/)]);

test("no-print-in-prod: кэш ruff не отдаёт вчерашнее «чисто»", { skip: whichSync("ruff") ? false : "нет ruff" }, (t) => {
  const cmd = String(catalog.find((e) => e.slug === "no-print-in-prod").recipes.python);
  const p = project(t, { "src/a.py": "x = 1\nyy = 22\n" });
  const file = join(p.dir, "src", "a.py");
  const then = new Date("2026-09-01T10:00:00Z");
  utimesSync(file, then, then);

  const clean = runRecipe(p, cmd);
  assert.equal(clean.code, 0, `чистый файл обязан пройти, а дал ${clean.code}:\n${clean.out}`);

  writeFileSync(file, "print(1)\n");
  utimesSync(file, then, then);
  const again = runRecipe(p, cmd);
  assert.equal(again.code, 1, `печать в коде, а повторный прогон дал ${again.code} — вердикт взят из кэша\n${again.out}`);
});

// Рецепт, который зовёт ruff без `--no-cache`, появится завтра без этого файла. Утверждение о
// строке слабее прогона, но ловит новый рецепт; поведение держит проверка выше.
test("каждый рецепт ruff идёт без кэша, и ни один рецепт не включает кэш сам", () => {
  const bad = [];
  for (const rec of catalog) {
    for (const [lang, cmd] of Object.entries(rec.recipes || {})) {
      const s = String(cmd);
      if (s.trim().split(/\s+/)[0] === "ruff" && !/(^|\s)--no-cache(\s|$)/.test(s)) bad.push(`${rec.slug}/${lang}: ruff без --no-cache`);
      if (/(^|\s)--cache(\s|=|$)/.test(s)) bad.push(`${rec.slug}/${lang}: --cache в «${s}»`);
    }
  }
  assert.deepEqual(bad, [], `рецепты, которые могут отдать вердикт из кэша:\n${bad.join("\n")}`);
});
