// tool/commands/context.mjs — состояние репозитория одним коротким блоком, для КОНТЕКСТА агента.
//
// ЗАЧЕМ ЭТА КОМАНДА ВООБЩЕ. Первый чужой отзыв, 2026-09-08, раздел «где я сам применил неверно»:
// «ставил записи, не читая их gate.yml», «не знал, как устроен prove», «не пользовался половиной
// команд». Файлы лежали. Агент до них не дошёл. Файл — приглашение прочитать, и агент вправе им
// не воспользоваться; хук `SessionStart` кладёт текст в контекст ДО первого действия, и отказаться
// от него нельзя. Это и есть вся разница.
//
// ПОЧЕМУ НЕ ВЕСЬ СВОД. Соблазн влить в контекст всё правила целиком. Замерено чужими руками и
// не нами: вход, растущий в длину, роняет качество у ВСЕХ проверенных передовых моделей — модель
// с окном 200K заметно деградирует уже на 50K, а ближние токены выигрывают у дальних. То есть
// «влить всё вперёд» даёт обратный результат: правило в контексте есть и не выполняется — ровно
// тот отказ, против которого весь комплект. Наш замер: этот блок ≈147 токенов, AGENTS.md ≈3348.
//
// ПОЭТОМУ ЗДЕСЬ СОСТОЯНИЕ, А НЕ ПРАВИЛА. Свод статичен и лежит в файле — агент его прочитает по
// ссылке. А вот чего из файла не узнать никогда: какой сейчас уровень, что красное ПРЯМО СЕЙЧАС,
// сколько правил не держит никто, что лежит в храповике. Это меняется каждый день, и записать
// это в AGENTS.md значит завести второй список, который через месяц врёт.
//
// ТИШИНА НЕ ОЗНАЧАЕТ «ЧИСТО». Читатель здесь машина: человек, увидев пустое место, переспросит,
// а агент примет его за утверждение. Поэтому каждое незнание называется словом: прогона не было —
// так и написано, прогон устарел — тоже, инструмента нет — тоже.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { CWD, TARGET_DIR, SELF, c, exists } from "../lib/core.mjs";
import { readManifest, assessLevel } from "../lib/manifest.mjs";
import { L } from "../i18n/index.mjs";

// Больше пяти имён подряд агент всё равно не удержит, а блок ради них раздувается. Остаток
// называется числом: «и ещё 15» — это факт, а молчание про них было бы враньём.
const MAX_RED = 5;
const MAX_RATCHETS = 3;

// Чистая функция: на входе состояние, на выходе строки. Отделена от чтения диска намеренно —
// это единственное место комплекта, чей текст читает машина, и проверять его надо не прогоном,
// а перебором случаев, включая те, которых на нашем репозитории не бывает.
function contextBlock(state, T = L.context) {
  const out = [T.title, ""];

  out.push(state.level
    ? T.level(state.level.reached, state.level.top, state.level.missing)
    : T.levelUnknown);

  if (state.rules && state.rules.total) {
    const { total, machine, human } = state.rules;
    out.push(T.rules(total, machine, human) + (human > 0 ? ` ${T.rulesNobody}` : ""));
  }

  if (!state.run) {
    out.push(T.runNone);
  } else {
    const red = state.run.red || [];
    const shown = red.slice(0, MAX_RED);
    const names = red.length > MAX_RED
      ? `${shown.join(", ")} — ${T.andMore(red.length - MAX_RED)}`
      : shown.join(", ");
    out.push(red.length ? T.runRed(state.run.when, names) : T.runClean(state.run.when));
    if (state.run.stale) out.push(T.runStale(state.run.when));
    if (state.run.skipped) out.push(T.skipped(state.run.skipped));
  }

  const rat = (state.ratchets || []).slice(0, MAX_RATCHETS);
  if (rat.length) out.push(T.ratchets(rat.map((r) => `${r.name} (${r.count})`).join(", ")));

  // Ссылка на свод даётся, только если файл ЕСТЬ. Назвать агенту несуществующий файл хуже,
  // чем промолчать: он пойдёт его читать и получит пустоту вместо правил. Замерено на шести
  // чужих проектах: на flask блок писал «Свод правил: AGENTS.md», которого там нет.
  if (state.entryExists !== false) out.push("", T.where(state.entry || "AGENTS.md"));
  return out;
}

// Разбор отчёта прошлого прогона. Формат кладёт сам `doctor` в .aqk/last-run.md; читаем его,
// а не запускаем гейты заново: хук обязан укладываться в секунду-две, а прогон у нас идёт минуту.
function parseLastRun(text) {
  if (!text) return null;
  const when = (text.match(/^# aqk doctor --run — (.+)$/m) || [])[1] || "";
  const red = [];
  for (const m of text.matchAll(/^✘ ([^\s—]+)/gm)) red.push(m[1]);
  const skipped = (text.match(/^~ /gm) || []).length;
  return { when: when.trim(), red, skipped, stale: false };
}

// Правила и их арбитры: отметка `<!-- aqk: имя -->` рядом с правилом. `человек` — честное
// признание, что машина этого не держит; так его и считаем, отдельно от машинных.
function countArbiters(text, humanWords) {
  // Имя арбитра — это имя гейта, а в нём дефисы: `deps-are-pinned`. Класс исключения `[^\s>-]`
  // обрывал такое имя и не считал его вовсе. Найдено первым же живым запуском: на нашем своде
  // блок показал 13 правил вместо 14 и одного машинного арбитра вместо двух.
  const marks = [...String(text).matchAll(/<!--\s*aqk:\s*(\S+?)\s*-->/g)].map((m) => m[1]);
  const human = marks.filter((w) => humanWords.includes(w.toLowerCase())).length;
  return { total: marks.length, machine: marks.length - human, human };
}

// Прогон старше последнего коммита описывает не тот код, что лежит перед агентом. Молча выдать
// его за свежий — соврать: именно так «зелёный месяц назад» превращается в «зелёный сейчас».
function runIsStale(when) {
  if (!when) return false;
  const r = spawnSync("git", ["log", "-1", "--format=%cI"], { cwd: CWD, encoding: "utf8" });
  if (r.status !== 0 || !r.stdout) return false;
  const commit = Date.parse(r.stdout.trim());
  const run = Date.parse(when.replace(" ", "T"));
  return Number.isFinite(commit) && Number.isFinite(run) && run < commit;
}


// УСТАНОВКА ХУКА — отдельной командой, а не частью `init`, и это решение, а не лень. Комплект
// нейтрален к вендору: правила и гейты не зависят от того, какой нейросетью пишут код. Хук
// `SessionStart` — принадлежность одного Claude Code, и класть его всем подряд значило бы
// объявить нейтральность и нарушить её в первой же команде.
//
// БЕЗ MATCHER НАМЕРЕННО. Справочник на сайте перечисляет у SessionStart значения matcher
// (startup, resume, clear, compact), а таблица событий, ВШИТАЯ в установленную версию 2.1.263,
// показывает в колонке matcher прочерк. Одно из двух неверно, и выяснить это гаданием нельзя.
// Хук без matcher верен при любом из двух чтений: где matcher поддержан — сработает на всех
// источниках, где не поддержан — на всех тоже. Проверено чтением бинаря, не памятью.
const HOOK_FILE = [".claude", "settings.json"];

// Команда, которая пойдёт В ОБЩИЙ файл настроек, а значит и в чужие руки через git. `SELF`
// печатается для человека здесь и сейчас и на машине разработчика равен АБСОЛЮТНОМУ пути —
// у соседа по команде такого пути нет, и хук у него молча не сработает. Абсолютный путь
// заменяется на переносимый вызов из реестра; `aqk` и `npx …` переносимы сами и остаются.
function portableSelf(self = SELF) {
  return /^node\s+[/\\]|^node\s+[A-Za-z]:/.test(self) ? "npx agent-quality-kit" : self;
}

function hookEntry(cmd) {
  return { hooks: [{ type: "command", command: cmd }] };
}

// Уже стоит? Тогда ничего не трогаем. Второй такой же хук значит блок в контексте дважды —
// вдвое больше токенов и ровно ноль пользы.
function hasOurHook(settings, cmd) {
  const list = settings?.hooks?.SessionStart;
  if (!Array.isArray(list)) return false;
  return list.some((g) => (g?.hooks || []).some((h) => String(h?.command || "").includes(cmd)));
}

function withHook(settings, cmd) {
  const next = { ...(settings || {}) };
  const hooks = { ...(next.hooks || {}) };
  hooks.SessionStart = [...(Array.isArray(hooks.SessionStart) ? hooks.SessionStart : []), hookEntry(cmd)];
  next.hooks = hooks;
  return next;
}

async function installHook() {
  const T = L.context;
  const path = join(CWD, ...HOOK_FILE);
  const cmd = `${portableSelf()} context`;

  let settings = {};
  let existed = false;
  if (await exists(path)) {
    existed = true;
    try {
      settings = JSON.parse(await readFile(path, "utf8"));
    } catch {
      // Чужой файл с испорченным JSON перезаписывать нельзя: там могут быть чьи-то права
      // доступа, и молча стереть их дороже, чем не поставить хук.
      console.log(c.red(`  ${T.hookBadJson(path)}`));
      return;
    }
  }

  if (hasOurHook(settings, cmd)) {
    console.log(c.dim(`  ${T.hookAlready(path)}`));
    return;
  }

  await mkdir(join(CWD, HOOK_FILE[0]), { recursive: true });
  await writeFile(path, JSON.stringify(withHook(settings, cmd), null, 2) + "\n", "utf8");
  console.log(c.green(`  ${existed ? T.hookAdded(path) : T.hookCreated(path)}`));
  console.log(c.dim(`    ${JSON.stringify({ SessionStart: [hookEntry(cmd)] })}`));
  console.log(c.dim(`  ${T.hookWhat}`));
}

async function cmdContext(args = []) {
  if (args.includes("--install")) return installHook();

  const man = await readManifest();
  const entry = (Array.isArray(man?.entry) ? man.entry : []).find((e) => typeof e === "string" && e.trim())?.trim()
    || "AGENTS.md";

  let level = null;
  if (man?.aqk) {
    const { reached, steps } = await assessLevel(man, null);
    const next = steps.find((s) => !s.ok);
    // `assessLevel` без прогона помечает вторую ступень `needsProof`: файлы на месте, а гейты
    // не доказаны. Сказать здесь «заведи samples и ratchets» значит послать чинить сделанное —
    // ровно та жалоба, с которой пришёл первый чужой отзыв, только в другом месте программы.
    const missing = !next ? ""
      : next.needsProof ? L.doctor.levelUnproven(`${SELF} prove`)
      : next.need || next.title || "";
    level = { reached, top: steps.length - 1, missing };
  }

  let rules = null;
  if (await exists(join(CWD, entry))) {
    rules = countArbiters(await readFile(join(CWD, entry), "utf8"), ["человек", "human", "nobody"]);
  }

  let run = null;
  const lastRun = join(CWD, TARGET_DIR, "last-run.md");
  if (await exists(lastRun)) {
    run = parseLastRun(await readFile(lastRun, "utf8"));
    if (run) run.stale = runIsStale(run.when);
  }

  const ratchets = [];
  const dir = typeof man?.ratchets === "string" ? man.ratchets.trim() : "";
  if (dir && (await exists(join(CWD, dir)))) {
    const { readdir } = await import("node:fs/promises");
    for (const f of (await readdir(join(CWD, dir))).filter((n) => n.endsWith(".txt")).sort()) {
      const body = await readFile(join(CWD, dir, f), "utf8");
      const count = body.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#")).length;
      ratchets.push({ name: f.replace(/\.txt$/, ""), count });
    }
  }

  console.log(contextBlock({ entry, entryExists: rules !== null, level, rules, run, ratchets }).join("\n"));
}

export { cmdContext, contextBlock, parseLastRun, countArbiters, withHook, hasOurHook, portableSelf };
