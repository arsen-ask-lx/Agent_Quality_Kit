// tool/lib/repo.mjs — осмотр репозитория и каталог обещаний: языки и признаки, условия
// триггера, выбор рецепта, сверка по намерению.

import { readdir, readFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { CWD, GATES_SRC, c, exists } from "./core.mjs";
import { parseManifest } from "./manifest.mjs";
import { L, LANG } from "../i18n/index.mjs";

// Каталог лежит в комплекте, а не в проекте: записи общие для всех, проект лишь
// решает, какие из них у него стоят. Показывать все подряд нельзя — это и есть
// разница между каталогом и списком: у каждой записи обязателен триггер, и до
// глаз человека доходит только применимое к его репозиторию.

// Расширения перечислены полностью, включая модульные варианты: .mjs пропускался, и на самом
// aqk — где вся программа лежит в .mjs — запись про отладочную печать пряталась с пояснением
// «нет языков: javascript». Гейт, спрятанный по неверно опознанному языку, молчит так же, как
// отсутствующий.
const EXT_LANG = {
  ".py": "python", ".js": "javascript", ".jsx": "javascript",
  ".mjs": "javascript", ".cjs": "javascript",
  ".ts": "typescript", ".tsx": "typescript", ".mts": "typescript", ".cts": "typescript",
  ".go": "go", ".rs": "rust", ".rb": "ruby", ".java": "java", ".php": "php",
  ".cs": "csharp", ".sh": "shell", ".kt": "kotlin", ".swift": "swift", ".scala": "scala",
};

const SKIP_DIRS = new Set([".git", "node_modules", ".venv", "venv", "dist", "build", "__pycache__", ".aqk"]);

// Факты о репозитории. Только то, что видно машине: спрашивать человека анкетой
// значит снова получить мнение вместо факта.
// Признаки репозитория — по файлам, а не по анкете. Ответы человека это мнение;
// файлы — факт. Каждый признак нужен какому-то триггеру: признак, который никто не
// спрашивает, — это лишний обход дерева.
const MARKS = [
  ["has_ci", [".github/workflows", ".gitlab-ci.yml", ".circleci", "Jenkinsfile", "azure-pipelines.yml"]],
  ["has_docker", ["Dockerfile", "compose.yml", "compose.yaml", "docker-compose.yml", "docker-compose.yaml"]],
  ["has_deps", ["package.json", "pyproject.toml", "requirements.txt", "go.mod", "Cargo.toml", "Gemfile", "pom.xml", "composer.json"]],
  ["has_env", [".env", ".env.example", ".env.sample"]],
];

async function detectFacts(man) {
  // Каталог образцов самого проекта: туда `add` копирует красные и зелёные примеры записей.
  // Считать их кодом проекта значит врать о репозитории — после установки сторожей пустой
  // проект «становился» проектом на Python, и ему показывались записи про мёртвый код.
  const samplesDir = man?.samples ? resolve(CWD, String(man.samples)) : null;
  const langs = new Set();
  let files = 0;
  let hasDb = false;
  let hasTests = false;

  async function walk(dir, depth) {
    if (depth > 4 || files > 4000) return;
    let items;
    try {
      items = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const it of items) {
      const full = join(dir, it.name);
      if (it.isDirectory()) {
        if (SKIP_DIRS.has(it.name)) continue;
        // Образцы каталога — код специально сломанный и специально исправный.
        // Считать его языками проекта значит врать о репозитории.
        if (full === GATES_SRC || (samplesDir && full === samplesDir)) continue;
        if (/^(tests?|spec|__tests__)$/i.test(it.name)) hasTests = true;
        if (/^migrations?$/i.test(it.name)) hasDb = true;
        await walk(full, depth + 1);
      } else {
        files++;
        if (/\.(test|spec)\.[a-z]+$/i.test(it.name) || /^test_.*\.py$/i.test(it.name) || /_test\.go$/i.test(it.name)) hasTests = true;
        if (it.name.endsWith(".sql")) hasDb = true;
        const dot = it.name.lastIndexOf(".");
        if (dot > 0) {
          const lang = EXT_LANG[it.name.slice(dot)];
          if (lang) langs.add(lang);
        }
      }
    }
  }
  await walk(CWD, 0);

  const gates = man?.gates && typeof man.gates === "object" && !Array.isArray(man.gates) ? man.gates : {};
  const facts = {
    langs,
    files,
    has_db: hasDb,
    has_tests: hasTests,
    has_gates: Object.values(gates).some((c) => String(c || "").trim()),
    gateKeys: Object.keys(gates),
  };
  for (const [name, paths] of MARKS) {
    facts[name] = false;
    for (const rel of paths) if (await exists(join(CWD, rel))) { facts[name] = true; break; }
  }
  return facts;
}

async function readCatalog() {
  if (!(await exists(GATES_SRC))) return [];
  const out = [];
  for (const name of (await readdir(GATES_SRC, { withFileTypes: true })).filter((d) => d.isDirectory())) {
    const yml = join(GATES_SRC, name.name, "gate.yml");
    if (!(await exists(yml))) continue;
    const rec = parseManifest(await readFile(yml, "utf8"));
    // Намерение показывается на языке вывода. Английское поле необязательно: запись, принесённая
    // без него, покажет русское намерение — это хуже перевода, но честнее пустой строки, и
    // не закрывает вклад тому, кто пишет на одном языке.
    const intent = (LANG === "en" ? rec.intent_en : rec.intent) || rec.intent || rec.intent_en || "";
    out.push({ slug: name.name, ...rec, intent });
  }
  return out.sort((a, b) => a.slug.localeCompare(b.slug));
}

// Применима ли запись к этому репозиторию — и если нет, то почему.
// Причина обязательна: «скрыто без объяснения» неотличимо от «потеряно».
// Все условия триггера должны выполниться разом. Раньше проверялось первое попавшееся —
// значит «есть база И нет конвейера» читалось как «есть база», и запись показывалась не тем.
//
// Причина отказа обязательна: скрытое без объяснения неотличимо от потерянного.
const CONDITIONS = {
  always: () => ({ ok: true }),

  langs: (val, f) => {
    const want = String(val).split(",").map((x) => x.trim()).filter(Boolean);
    return want.some((l) => f.langs.has(l))
      ? { ok: true }
      : { ok: false, why: L.trigger.noLangs(want.join(", ")) };
  },

  files_gt: (val, f) =>
    f.files > Number(val) ? { ok: true } : { ok: false, why: L.trigger.tooFewFiles(val) },

  files_lt: (val, f) =>
    f.files < Number(val) ? { ok: true } : { ok: false, why: L.trigger.tooManyFiles(val) },
};

const FLAG_WHY = L.trigger.flags;

function triggerVerdict(rec, facts) {
  const t = rec.trigger && typeof rec.trigger === "object" && !Array.isArray(rec.trigger) ? rec.trigger : {};
  const keys = Object.keys(t);
  if (!keys.length) return { applies: false, why: L.trigger.notSet };

  for (const key of keys) {
    const raw = String(t[key]).trim();

    if (CONDITIONS[key]) {
      // always: false — не «условие отсутствует», а «запись никогда не применима». Раньше
      // continue пропускал ключ молча, и `always: false` читалось как отсутствие ограничения.
      if (key === "always" && raw !== "true") return { applies: false, why: "always: false" };
      const r = CONDITIONS[key](raw, facts);
      if (!r.ok) return { applies: false, why: r.why };
      continue;
    }

    if (key in FLAG_WHY) {
      const want = raw === "true";
      if (Boolean(facts[key]) !== want) {
        return { applies: false, why: FLAG_WHY[key][want ? 0 : 1] };
      }
      continue;
    }

    return { applies: false, why: L.trigger.unknown(key) };
  }
  return { applies: true };
}

// Есть ли такая программа в PATH. Своим обходом, а не `command -v`: на Windows оболочка —
// cmd.exe, где такой команды нет вовсе, и проверка возвращала «не установлено» ДЛЯ ЛЮБОЙ
// программы. Следствие было тихим и потому худшим: родной рецепт (ruff, eslint, jscpd) там
// недостижим в принципе, гейт молча вставал на слабейший переносимый вариант, а `doctor --run`
// показывал зелёное. Нашлось только на чужом прогоне — журнал, 2026-09-04.
function whichSync(prog, env = process.env) {
  if (!prog) return null;
  // Путь, а не имя: команду вроде ./scripts/check.sh искать в PATH бессмысленно.
  if (prog.includes("/") || prog.includes("\\")) return existsSync(prog) ? prog : null;

  const sep = process.platform === "win32" ? ";" : ":";
  const dirs = String(env.PATH || env.Path || "").split(sep).filter(Boolean);
  // На Windows исполняемость задаёт расширение, а не флаг доступа: ruff — это ruff.exe.
  const exts = process.platform === "win32"
    ? String(env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)
    : [""];

  for (const dir of dirs) {
    for (const ext of exts) {
      const full = join(dir.replace(/^"|"$/g, ""), prog + ext);
      try {
        if (statSync(full).isFile()) return full;
      } catch { /* нет такого файла — идём дальше, это не ошибка */ }
    }
  }
  return null;
}

// Арбитр под стек этого проекта: сначала родной рецепт, иначе — переносимый `any`.
// Подсказка, которую нельзя скопировать и выполнить, бесполезна.
// Выбор рецепта под стек проекта. Одна логика на два места: и `doctor`, и `add` показывают
// команду, но подставляют в неё разные пути — один в каталог пакета, другой в каталог проекта.
// Пока это были две копии, правка доезжала до одной из них — нашёл собственный гейт дублей.
function pickRecipe(rec, facts) {
  const recipes = rec.recipes && typeof rec.recipes === "object" ? rec.recipes : {};

  // Родной рецепт лучше переносимого — но только если его есть чем выполнить. Поставить
  // команду с неустановленной программой значит завести гейт, который встаёт с «not found»:
  // отсутствие сигнала неотличимо от успеха.
  const runnable = (c0) => Boolean(whichSync(String(c0).trim().split(/\s+/)[0]));
  for (const lang of facts.langs) {
    if (!recipes[lang]) continue;
    if (runnable(recipes[lang])) return recipes[lang];
    console.log(c.dim(`  ${c.yellow("!")}  ${L.recipe.skipped(lang, String(recipes[lang]).split(/\s+/)[0])}`));
  }
  return recipes.any || null;
}

function recipeFor(rec, facts) {
  const cmd = pickRecipe(rec, facts);
  if (!cmd) return L.recipe.none;
  return String(cmd)
    .replace(/\{gate\}/g, join(GATES_SRC, rec.slug))
    .replace(/\{dir\}/g, ".");
}

const STOP = new Set([
  "и","в","на","не","что","с","по","для","как","из","от","до","за","при","или","а","но","же",
  "это","то","так","бы","бы","ли","у","о","об","под","над","без","есть","быть","был","была",
  "если","чтобы","только","уже","ещё","еще","мы","он","она","они","их","его","её","ее","все",
  "всё","код","кода","коде","проект","проекта","должен","должна","должно","надо","нужно",
  // Латинские связки из имён записей: no-print-IN-prod, secrets-NOT-IN-code. Без них
  // «dead-code-not-shipped» совпадает с «secrets-not-in-code» по служебным словам.
  "not","in","on","of","to","and","or","the","a","an","is","are","be","with","for","no","has",
]);

const stems = (text) =>
  new Set(
    String(text || "")
      .toLowerCase()
      .replace(/[^a-zа-яё0-9\s-]/gi, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOP.has(w))
      .map((w) => w.slice(0, 4))
  );

function overlap(query, target) {
  if (!query.size) return 0;
  let hit = 0;
  for (const q of query) if (target.has(q)) hit++;
  return hit / query.size;
}


// Сверка запроса с каталогом ПО НАМЕРЕНИЮ. Одна логика на три места: `find` показывает
// человеку, `new` не даёт завести дубль, `why` выясняет, был ли вообще такой сторож. Пока это
// были две копии с разными порогами, «нашлось» в одной команде означало «не нашлось» в другой.
//
// Заголовок README считается наравне с intent: это такое же формулирование намерения, написанное
// человеком. Остальной текст пояснения весит впятеро меньше — слова «гейт», «проверка»,
// «образец» есть в каждой записи, и по ним совпало бы что угодно с чем угодно.
async function matchCatalog(query) {
  const q = stems(query);
  const out = [];
  for (const rec of await readCatalog()) {
    const readme = join(GATES_SRC, rec.slug, "README.md");
    const text = (await exists(readme)) ? await readFile(readme, "utf8") : "";
    const title = (text.match(/^#\s+(.+)$/m) || [, ""])[1];
    const head = stems(`${rec.slug.replace(/-/g, " ")} ${rec.intent || ""} ${title}`);
    const body = stems(text.slice(0, 1200));

    // Одно совпавшее слово — совпадение обрезки, а не смысла: «обратимы» и «образец» дают
    // одно и то же начало. Считаем ещё и сколько слов совпало, и требуем минимум два.
    let hits = 0;
    for (const w of q) if (head.has(w)) hits++;
    // Правило «минимум два совпавших слова» защищает от совпадения обрезки. Для уверенного
    // вывода оно нужно; для подсказки «посмотри вот на эти» — нет: там человек решает сам,
    // и одно совпавшее слово лучше, чем «ничего не найдено» при существующей записи.
    const ok = hits >= 2 || q.size < 2;
    const raw = 0.8 * overlap(q, head) + 0.2 * overlap(q, body);
    out.push({ rec, hits, rawScore: raw, headScore: ok ? overlap(q, head) : 0, score: ok ? raw : 0 });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

// Наружу — то, что действительно импортируют другие файлы и модульные проверки. Экспорт,
// который никто не берёт, читается как часть договора и мешает менять внутренности.
export {
  whichSync,
  EXT_LANG, detectFacts, readCatalog, triggerVerdict, pickRecipe, recipeFor,
  stems, overlap, matchCatalog,
};
