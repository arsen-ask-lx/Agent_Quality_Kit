// tool/lib/advice.mjs — ЧТО СОВЕТОВАТЬ ПРОЕКТУ: какие записи каталога его касаются, с каких
// начать и какой командой закрыть класс брака прямо сейчас, без комплекта.
//
// ОТДЕЛЬНЫМ ФАЙЛОМ, а не в repo.mjs: там осмотр репозитория (факты, триггеры, рецепты), здесь —
// решение, что из этого сказать человеку и агенту. Одно знание на `doctor`, `probe` и блок для
// агента: жило в двух файлах и росло в обоих; шов вскрыл наш же file-size-limit — repo.mjs
// дорос до 494 строк при пределе 500.
import { triggerVerdict } from "./repo.mjs";

// Корзины каталога для ЭТОГО проекта: держит · к установке · закрыто другим арбитром ·
// неприменимо. Одна раскладка на `doctor` и на блок для агента: жила внутри `doctor`, и блоку
// пришлось бы завести вторую — а два счёта одного и того же расходятся первыми.
function catalogBuckets(catalog, facts, covered = new Map()) {
  const held = [], todo = [], skip = [], byOther = [];
  for (const rec of catalog) {
    const v = triggerVerdict(rec, facts);
    if (!v.applies) skip.push([rec, v.why]);
    else if (facts.gateKeys.includes(rec.slug)) held.push(rec);
    else if (covered.has(rec.slug)) byOther.push([rec, covered.get(rec.slug)]);
    else todo.push(rec);
  }
  return { held, todo, skip, byOther };
}

// С ЧЕГО НАЧАТЬ: три записи вместо двадцати равнозначных крестов.
//
// Двадцать одинаковых требований — это ноль требований: закрывают первое попавшееся или не
// закрывают ничего. Порядок НЕ по нашему вкусу; два признака, оба — факты, которые у нас уже
// есть:
//   · запись родилась из настоящего отказа (`lifecycle: stable` — `proof` ссылается на журнал
//     шишек), то есть она про боль, которая СЛУЧАЛАСЬ, а не про «хорошую практику»;
//   · её можно закрыть одной готовой командой — цена входа минутная.
// Сначала то, что и больно, и дёшево.
//
// При равенстве признаков — по имени: одинаковый ввод обязан давать одинаковый ответ, иначе
// человек видит разный совет на двух прогонах подряд и перестаёт верить обоим.
function startWith(entries, facts, n = 3) {
  const langs = facts?.langs ? [...facts.langs] : [];
  const cheap = (e) => {
    const r = e?.recipes && typeof e.recipes === "object" ? e.recipes : {};
    return [...langs, "native"].some((k) => r[k] && !/\{gate\}/.test(r[k])) ? 1 : 0;
  };
  // Зрелость НЕ поле записи, а вычисляемый признак: `proof` ссылается на журнал шишек. Тот же
  // признак, которым каталог отделяет условную запись с первого дня (`entryLifecycle`).
  // Заводить второй счёт нельзя: разъехавшись, они дали бы разные ответы про одну запись.
  const hurt = (e) => (/incidents\//.test(String(e?.proof || "")) ? 1 : 0);
  return [...entries]
    .sort((a, b) =>
      (hurt(b) + cheap(b)) - (hurt(a) + cheap(a)) ||
      cheap(b) - cheap(a) ||
      String(a.slug).localeCompare(String(b.slug)))
    .slice(0, n);
}

// Адрес Biome сверен по реестру github 2026-09-11.
const BIOME_URL = "https://github.com/biomejs/biome";

// Совет по НЕПОКРЫТОМУ классу: команда, которую можно вставить прямо сейчас.
//
// Проба находит настоящие дыры и печатала про них «close it: aqk add <имя>» — то есть «поставь
// нашу штуку». Человек, впервые увидевший комплект, закрывает окно. А готовая однострочная
// команда под его стек У НАС УЖЕ ЛЕЖИТ в `recipes` записи каталога; мы её не показывали.
//
// Замер руками на `requests` (самый скачиваемый python-пакет) 2026-09-10: в
// `src/requests/utils.py` — 75 коммитов-починок; дописана функция с `except Exception: pass`;
// их собственные `ruff` и `pytest` дали 0 и на чистой копии, и на подсаженной. Строка, которая
// поймала бы это, лежала в нашем каталоге всё это время.
//
// Переносимый рецепт (`any`) в совет НЕ идёт: он зовёт файл из комплекта, и человеку без
// комплекта вставить его некуда. Нет родного рецепта под стек — команды нет, и это честнее
// выдуманной.
function blindAdvice(entry, facts, hot = {}) {
  const recipes = entry?.recipes && typeof entry.recipes === "object" ? entry.recipes : {};
  // `langs` приходит МНОЖЕСТВОМ, а не массивом — `Array.isArray` тихо давал пустой список, и
  // совет не печатался вовсе. Поймано на живом `requests`: langs = Set(1) { python }.
  const langs = facts?.langs ? [...facts.langs] : [];
  // Тот же порядок, что у `pickRecipe`: свой язык → безъязыковой родной → ничего. Переносимый
  // (`any`) сюда не идёт никогда: он зовёт файл из комплекта, и человеку без комплекта вставить
  // его некуда.
  // Проект на Biome — совет на языке Biome, а не eslint (отзыв с живого проекта 2026-09-11:
  // «начни с трёх» советовал завести eslint проекту на Biome). Одно правило разово через `--only`;
  // `--error-on-warnings` обязателен — правило вне рекомендованных Biome ставит на
  // «предупреждение», и без флага команда выходила с нулём, напечатав находку (Biome 2.5.12).
  const br = typeof entry?.biome_rules === "string" ? entry.biome_rules.trim() : "";
  if (facts?.has_biome && br && br !== "none" && langs.some((l) => l === "javascript" || l === "typescript")) {
    const only = br.split(",").map((x) => x.trim()).filter(Boolean).map((r) => `--only=${r}`).join(" ");
    return { command: `npx @biomejs/biome lint --error-on-warnings ${only} .`, tool: BIOME_URL,
      file: hot.file ?? null, fixes: hot.fixes ?? null, slug: entry?.slug ?? null };
  }
  let cmd = null;
  for (const key of [...langs, "native"]) {
    const r = recipes[key];
    if (!r || /\{gate\}/.test(r)) continue;
    cmd = String(r).replace(/\{dir\}/g, ".")
      // Вычистить то, что относится к НАМ, а не к его проекту. Исключение наших красных
      // образцов нужно УСТАНОВЛЕННОМУ гейту — рядом с ним лежат образцы. Человеку, который
      // команду только копирует, этих каталогов не существует, и флаги про них подрывают
      // доверие: инструмент говорит про чужое хозяйство вместо его кода.
      .replace(/\s--ignore-pattern\s+'[^']*gates\/[^']*'/g, "")
      .replace(/\s--ignore-paths=?\s*'[^']*gates\/[^']*'/g, "")
      .replace(/\s+/g, " ")
      .trim();
    break;
  }
  // Адрес — того инструмента, которым команда начинается: поле `tool` общее на все языки, и
  // python-проекту показывалась ссылка на eslint. Первые три слова, а не одно: `npx knip`,
  // `python -m vulture`. Не совпало — весь список: лишняя ссылка лучше, чем ни одной.
  const urls = entry?.tool ? String(entry.tool).split(/\s+·\s+/) : [];
  const head = cmd ? cmd.split(" ").slice(0, 3) : [];
  const own = urls.find((u) => head.includes(u.replace(/\/+$/, "").split("/").pop()));
  const tool = own ?? (entry?.tool ? String(entry.tool) : null);
  return { command: cmd, tool, file: hot.file ?? null, fixes: hot.fixes ?? null, slug: entry?.slug ?? null };
}

export { catalogBuckets, startWith, blindAdvice };
