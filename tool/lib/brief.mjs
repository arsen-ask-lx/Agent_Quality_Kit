import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { CWD, PKG_ROOT, TARGET_DIR, SELF, c } from "./core.mjs";
import { L } from "../i18n/index.mjs";
import { canDrawArt } from "./banner.mjs";
// tool/lib/brief.mjs — короткая строка присутствия для прогона в хуке.
//
// ЗАЧЕМ ЭТО СУЩЕСТВУЕТ. Хук pre-commit молчит на успехе: вывод показывается только при провале
// — это его умолчание, проверено по документации 2026-09-08. То есть комплект, который всё
// держит, для человека НЕОТЛИЧИМ от невставленного: он поставил, поработал неделю и не увидел
// ни строки. «Скачал и че дальше» — дословная жалоба владельца.
//
// Это ровно тот порок, против которого написан весь комплект, только у нас самих: тишина
// неотличима от успеха. Поэтому строка печатается ВСЕГДА, в том числе — и особенно — когда
// всё хорошо. Одна строка: присутствие видно, читать нечего.
//
// СОВЕТ ОТДЕЛЬНО И РЕДКО. Вторая строка называет ОДНУ непоставленную запись и способ отказаться.
// Не список: список читается как «у вас всё плохо» и не помогает выбрать. Не каждый коммит:
// то, что видишь тридцатый раз, перестаёт читаться — и пролистывается вместе с настоящими
// находками, стоящими рядом.

// Сутки. Не «раз в прогон» и не «раз в неделю»: за сутки человек успевает забыть, но не успевает
// устать. Число здесь спорное — важно, что ограничитель есть и он машинный.
const ADVICE_EVERY_MS = 24 * 60 * 60 * 1000;

// ЗНАЧОК ПРИСУТСТВИЯ — здесь, а не в каталогах строк. Символ один на оба языка, и держать его
// в двух местах значит однажды получить разные значки в ru и en: то же правило, по которому у
// нас один свод правил на две точки входа. Выбран владельцем из пятидесяти семи вариантов.
// В терминале без UTF-8 он превратится в мусор — там правило то же, что у заставки, и оно
// одно на двоих: разойдись эти два условия, и значок рисовался бы там, где картинка уже нет.
const MARK = "❖";

function briefLine(state, L, env = process.env) {
  const t = L.brief;
  const mark = canDrawArt(env) ? `${MARK} ` : "";
  const parts = [t.held(state.held), t.todo(state.todo)];
  if (state.level >= 0) parts.push(`AQK-${state.level}`);
  else parts.push(t.levelUnknown);
  const head = `${mark}${t.name}  ${parts.join(" · ")}`;
  if (!state.red || !state.red.length) return head;
  return `${head}\n${t.red(state.red.join(", "))}`;
}

// «Не знаем, когда показывали» и «показывали давно» — одно и то же решение: показать.
// Испорченная отметка попадает сюда же намеренно: молчать из-за нечитаемого файла состояния
// значит потерять совет навсегда и не сказать почему.
function adviceDue(lastIso, now = Date.now()) {
  if (!lastIso) return true;
  const t = Date.parse(String(lastIso));
  if (!Number.isFinite(t)) return true;
  return now - t >= ADVICE_EVERY_MS;
}

// Первая из непоставленных, а не «самая важная»: важность мы не считаем, а порядок каталога
// осмыслен — записи в нём лежат от общего к частному. Выдавать порядок за приоритет нельзя.
function pickAdvice(todo = []) {
  return todo.length ? todo[0] : null;
}

// УВЕДОМЛЕНИЕ ОБ ОБНОВЛЕНИИ — и почему НЕ автообновление.
//
// Выпуски идут часто, а у половины способов установки версия закреплена и сама не двигается:
// `rev:` у pre-commit, тег у GitHub Action. Человек ставит комплект, получает версию с уже
// исправленной ошибкой и не узнаёт об этом никогда. У `npx` без версии проблемы нет — он берёт
// свежее при каждом запуске.
//
// АВТООБНОВЛЕНИЯ НЕТ, И ЭТО РЕШЕНИЕ, А НЕ НЕДОДЕЛКА. В тот же день выпущена запись каталога,
// краснеющая на `@latest`: «версия не закреплена — завтра приедет другая». Инструмент, который
// молча подменяет себя, стоя на воротах коммита, делал бы ровно то, что мы запрещаем другим.
// Первый же внешний читатель это заметит, и будет прав.
//
// СРАВНЕНИЕ ПО ЧИСЛАМ. Строкой «0.10.0» меньше «0.9.0», и уведомление пропало бы ровно на
// десятом выпуске — тихо и надолго. Такие поломки не замечают месяцами.
function cmpVer(a, b) {
  const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

// Совет зависит от способа установки: у pre-commit это `autoupdate`, а не npm. Совет мимо
// способа человек не выполнит — и перестанет читать следующие.
function updateNotice(current, latest, env = process.env, L) {
  if (!current || !latest || cmpVer(latest, current) <= 0) return null;
  const how = env.PRE_COMMIT ? L.brief.updateHookHow : L.brief.updateHow;
  return `${L.brief.update(latest, current, how)}\n${L.brief.updateOff("AQK_UPDATE=0")}`;
}

// В конвейере не спрашиваем вовсе: там версия закреплена сознательно, читать уведомление
// некому, а лишний исходящий запрос из инструмента, который иначе не делает ни одного, —
// плохой размен. Отказ человека уважается тем же способом.
function updateWanted(env = process.env) {
  if (String(env.AQK_UPDATE || "") === "0") return false;
  if (env.CI || env.GITHUB_ACTIONS || env.GITLAB_CI) return false;
  return true;
}

// КРАТКИЙ РЕЖИМ для хука. Вывод целиком БУФЕРИЗУЕТСЯ, а печатается одна строка присутствия —
// и, при провале, весь буфер, чтобы человеку было что чинить. Перехват console.log выглядит
// грубо, и это осознанный размен: альтернатива — протащить флаг через четыреста строк печати,
// где каждая строка стала бы условной. Перехват локален, снимается в том же вызове и объяснён
// здесь; условие в каждой строке объяснить было бы негде.
function beginBrief() {
  const lines = [];
  const real = console.log;
  console.log = (...a) => lines.push(a.join(" "));
  return { lines, restore: () => { console.log = real; } };
}

// Печать краткого итога. Совет — не чаще раза в сутки и с явным способом отказаться: то, что
// видишь тридцатый раз, перестаёт читаться и пролистывается вместе с настоящими находками рядом.
// Отметка времени лежит в .aqk/, который в .gitignore: это состояние машины, а не проекта.
async function finishBrief(buf, state, todoRecs, ok) {
  if (!buf) return;
  buf.restore();
  console.log(briefLine(state, L));

  // Уведомление об обновлении — ДО разбора вердикта: оно от него не зависит. Сначала было
  // после, и у любого проекта, где чего-то не хватает, версия не спрашивалась никогда —
  // то есть у всех, кому комплект и нужен. Поймано первым же живым запуском.
  await maybeUpdateNotice();

  // При провале печатаем ВЕСЬ буфер: человеку нужно чинить, а одной строкой не починишь.
  if (!ok) { console.log(buf.lines.join("\n")); return; }

  if (process.env.AQK_ADVICE === "0" || !state.todo) return;
  const stampFile = join(CWD, TARGET_DIR, "advice-shown");
  let last = null;
  try { last = (await readFile(stampFile, "utf8")).trim(); } catch { /* не показывали ещё */ }
  if (!adviceDue(last)) return;
  const advice = pickAdvice(todoRecs);
  if (!advice) return;
  console.log(c.dim(L.brief.advise(advice.slug, advice.intent || "")));
  console.log(c.dim(L.brief.adviseOff(`${SELF} why ${advice.slug}`, "AQK_ADVICE=0")));
  try {
    await mkdir(join(CWD, TARGET_DIR), { recursive: true });
    await writeFile(stampFile, new Date().toISOString(), "utf8");
  } catch { /* не смогли записать отметку — совет повторится, это не беда */ }
}

// Спрашивает реестр npm о своей версии. РАЗ В СУТКИ, НЕ В КОНВЕЙЕРЕ, С ТАЙМАУТОМ, И МОЛЧА
// ПРИ ЛЮБОЙ ОШИБКЕ. До этой строки комплект не делал ни одного исходящего запроса — так
// написано в README и SECURITY.md, и там же теперь написано про этот. Сделать тихо то, за что
// мы ругаем других, нельзя: весь смысл в том, что заявленное совпадает с происходящим.
//
// Код возврата не меняется никогда: уведомление, роняющее коммит, выключат в тот же день —
// и вместе с ним всё остальное, что печатает эта строка.
async function maybeUpdateNotice() {
  if (!updateWanted()) return;
  const stamp = join(CWD, TARGET_DIR, "update-checked");
  let last = null;
  try { last = (await readFile(stamp, "utf8")).trim(); } catch { /* ещё не спрашивали */ }
  if (!adviceDue(last)) return;

  let current = "";
  try { current = JSON.parse(await readFile(join(PKG_ROOT, "package.json"), "utf8")).version || ""; } catch { return; }

  // ОТМЕТКА СТАВИТСЯ ДО ЗАПРОСА, а не после удачного ответа. Сперва было наоборот, и замер
  // показал цену: человек без сети платил бы ожиданием на КАЖДОМ коммите, а не раз в сутки.
  // Из двух ошибок выбрана дешёвая: пропущенное за день уведомление против ежедневного стопора.
  try {
    await mkdir(join(CWD, TARGET_DIR), { recursive: true });
    await writeFile(stamp, new Date().toISOString(), "utf8");
  } catch { /* не смогли записать — спросим ещё раз, это не беда */ }

  let latest = "";
  try {
    // Три секунды, а не полторы. Замерено 2026-09-08: тёплый запрос к реестру — 533 мс,
    // а первый, с разрешением имени и рукопожатием, в полторы секунды не уложился. Слишком
    // тугой срок означал бы, что уведомление не приходит никогда и никто не знает почему.
    const r = await fetch("https://registry.npmjs.org/agent-quality-kit/latest", {
      signal: AbortSignal.timeout(3000),
      headers: { accept: "application/vnd.npm.install-v1+json" },
    });
    if (!r.ok) return;
    latest = String((await r.json()).version || "");
  } catch {
    // Сети нет, реестр молчит, таймаут — всё это НЕ повод сказать хоть слово. Инструмент,
    // который жалуется на отсутствие интернета посреди коммита, выключают.
    return;
  }

  const notice = updateNotice(current, latest, process.env, L);
  if (notice) console.log(c.dim(notice));
}

// Наружу — только то, что зовут снаружи. `cmpVer` и `ADVICE_EVERY_MS` внутренние: экспорт,
// который никто не импортирует, читается как часть договора и мешает менять внутренности.
export { briefLine, adviceDue, pickAdvice, updateNotice, updateWanted, beginBrief, finishBrief };
