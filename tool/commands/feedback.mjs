// tool/commands/feedback.mjs — `aqk feedback`: единственная плата за комплект — один ответ.
//
// ЗАЧЕМ. Замер 2026-09-14: 1342 скачивания в неделю в npm и ни одного пользователя — версии
// качаются равномерно, включая прожившую двадцать пять минут, то есть это зеркала и сканеры. На
// GitHub за две недели семь уникальных посетителей, две звезды, ноль чужих комментариев за всё
// время. Обратной связи нет не потому, что люди молчат: просить мы не умеем. Единственная
// просьба печаталась при `init` — ДО того, как комплект сделал хоть что-то полезное, — и звала
// поставить звезду, то есть просила у человека, которому ещё ничего не дали.
//
// ЧТО ЗДЕСЬ ДРУГОЕ. Просим, только когда есть что рассказать, и рассказ уже собран: версия,
// уровень, стек, что покраснело, чего комплект НЕ СМОГ проверить, какие классы брака не ловит
// никто. Человеку остаётся одна строка своими словами.
//
// ЧЕГО ЗДЕСЬ НЕТ И НЕ БУДЕТ. Ничего не отправляется само. Исходящий запрос у комплекта ровно
// один — про свежесть версии, он описан в README и SECURITY.md. Отчёт печатается и отдаётся
// человеку: он видит глазами всё, что отправляет. Ни путей, ни содержимого файлов, ни имени
// репозитория в отчёте нет — иначе первый же внимательный читатель назовёт это телеметрией,
// и будет прав.
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { PKG_ROOT, SELF, REPO_URL, c, stateDirs } from "../lib/core.mjs";
import { askAllowed, markAsked } from "../lib/ask.mjs";
import { join } from "node:path";
import { readManifest, assessLevel } from "../lib/manifest.mjs";
import { detectFacts } from "../lib/repo.mjs";
import { declaredGates, readRun } from "../lib/run.mjs";
import { probeStatus } from "./probe.mjs";
import { L } from "../i18n/index.mjs";

// О ЧЁМ ПРОСИТЬ — чистая функция от состояния. Порядок не по нашему удобству, а по ценности
// ответа для того, кто чинит комплект:
//   1. НЕ СМОГЛИ ПРОВЕРИТЬ — отказ самого прибора. Это жалоба, а жалоба даётся людям легче
//      похвалы, и она же показывает, где инструмент врёт. Дороже всего остального.
//   2. СЛЕПОЙ КЛАСС — проба подсадила брак, и его не поймал никто. Рассказ об этом проверяет
//      главное наше утверждение: что проба находит настоящие дыры, а не выдуманные.
//   3. КРАСНЫЙ ГЕЙТ — комплект поймал то, ради чего его ставят. Момент пользы, но самый частый,
//      поэтому последний.
// Ничего из перечисленного нет — просьбы нет вовсе. «Оставьте отзыв» без содержания это шум,
// а шум выключают вместе с хуком, в котором он приехал.
function feedbackAsk(state = {}) {
  const pick = (kind, list) => (list && list.length ? { reason: kind, names: [...list] } : null);
  return pick("cannot", state.cannot) || pick("blind", state.blind) || pick("red", state.red) || null;
}

// ОТЧЁТ. Каждая строка — либо факт, либо слово «неизвестно»: пустое место в письме читается как
// «всё хорошо» ровно так же, как пустой вывод проверки, и это тот же порок, только у нас самих.
//
// Слепые классы называются именем класса, без файла. Файл знает проба («blind-class: slug path»), и
// соблазн положить его сюда велик — он объясняет находку. Нельзя: путь внутри чужого
// репозитория рассказывает о чужом проекте больше, чем его владелец собирался рассказать.
function reportText(state = {}, T = L.feedback.report) {
  const u = T.unknown;
  const list = (xs) => (xs && xs.length ? xs.join(", ") : T.none);
  return [
    T.title,
    "",
    T.env(state.version || u, state.node || u, state.platform || u),
    T.level(state.level === null || state.level === undefined ? u : `AQK-${state.level}`),
    T.stack(state.langs && state.langs.length ? state.langs.join(", ") : u),
    T.gates(state.gates === undefined ? u : state.gates, list(state.red), list(state.cannot)),
    // `null` — проба не делалась: это НЕИЗВЕСТНО, а не «нет». Пустой список означал бы, что
    // проба прошла и ничего не нашла, — и автор письма прочитал бы чужое незнание как чистоту.
    T.blind(state.blind === null || state.blind === undefined
      ? u
      : list(state.blind.map((b) => (typeof b === "string" ? b : b.slug)))),
    "",
    T.say,
    "",
    // Слова человека — туда же, где приглашение их написать. Пусто — остаётся приглашение:
    // отправленное письмо без единой своей строки всё равно полезно, но сказать об этом надо.
    ...(state.note ? [state.note, ""] : []),
    T.mark(state.version || u),
  ];
}

// КАК ЭТО ЗВУЧИТ — один текст на два места: `context` кладёт его агенту, `doctor` печатает
// человеку. Собери строку в каждом месте отдельно — и через месяц они разойдутся, как разошлись
// бы `context` и `prompt` без общего `readAdvice`.
//
// АГЕНТУ — ОТДЕЛЬНАЯ ОГОВОРКА, и она не вежливость. Строка ложится в контекст ЧУЖОГО агента, а
// он исполняет написанное: без «скажи один раз и не настаивай» это реклама в чужом окне, и хук,
// которым она приехала, снесут в первый же день вместе со всей затеей. Человеку вместо неё —
// как выключить: у всего, что случается само, обязан быть выключатель.
function askLine(ask, self = "aqk", { agent = false } = {}, T = L.feedback.ask) {
  if (!ask || !ask.reason) return null;
  const say = T[ask.reason];
  if (!say) return null;
  // Перенос, а не пробел: команда обязана оставаться ПОСЛЕДНЕЙ в своей строке — иначе
  // следующее слово приклеится к ней при копировании, и человек выполнит не то.
  return `${say(ask.names.join(", "), `${self} feedback`)}\n${agent ? T.agent : T.once}`;
}

// Выключатель — тот же, что у совета (AQK_ADVICE=0), пробы (AQK_PROBE=0) и проверки версии
// (AQK_UPDATE=0). Молчаливой просьбы, которую нельзя отменить, у нас не будет.
function feedbackWanted(env = process.env) {
  return String(env.AQK_FEEDBACK || "") !== "0";
}

// ОДНА ПРОСЬБА НА ПРОЕКТ — и решение, и ограничитель, и отметка здесь. `doctor` и `context`
// только печатают: разведи это по двум командам, и они разойдутся в условиях, а человек получит
// просьбу дважды. Кто первым дошёл, тот и спросил.
//
// Ничего не роняет: просьба об одолжении не имеет права стоить человеку прогона.
async function maybeAsk(state, self, { agent = false } = {}) {
  if (!feedbackWanted()) return null;
  try {
    const dirs = stateDirs();
    if (!(await askAllowed("value", dirs))) return null;
    const line = askLine(feedbackAsk(state), self, { agent });
    if (line) await markAsked("value", dirs);
    return line;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ОТПРАВКА — ТОЛЬКО ПО ЯВНОМУ СЛОВУ, И СЛОВО ЭТО `--send`.
//
// Владелец 2026-09-14 спросил, нельзя ли отправлять отзыв «без согласия пользователя, чтобы
// агент мог быстро сообщить». Нельзя, и не из вежливости: в README и SECURITY.md написано, что
// исходящий запрос у комплекта ровно один — про версию. Инструмент, который втихую шлёт что-то
// из ЧУЖОГО репозитория, становится ровно тем, что мы критикуем, а наша аудитория — это те, кто
// проверяет инструменты на вранье. Одного внимательного читателя хватит.
//
// Поэтому согласие живёт в самом флаге: `--send` не набирают случайно, а агенту в умениях
// сказано показать текст человеку и спросить. Утверждение «без флага не уходит ничего» держит
// машина — smoke/feedback-send.test.mjs, — а не наше обещание в документации.
//
// ОТ ЧЬЕГО ИМЕНИ. От самого человека, его же `gh`. Своего сервера у нас нет и не будет: он
// означал бы приём чужих данных, а значит и ответственность за них.
const DISCUSSION = 90;

function sendWanted(argv = process.argv) {
  return argv.includes("--send");
}

// Своя строка человека — самое ценное во всём письме. Берём всё, что не флаг.
function userNote(argv = process.argv) {
  const i = argv.indexOf("feedback");
  return (i === -1 ? [] : argv.slice(i + 1)).filter((a) => !a.startsWith("-")).join(" ").trim();
}

// Чем звать gh. Подменяется `AQK_GH` — тот же приём, что у `AQK_BASH` в execution.mjs: у всего,
// что мы решаем сами, обязан быть способ решить иначе. Через него же проверки подставляют
// поддельный gh и убеждаются, что без флага его не зовут вовсе.
function ghArgs(env = process.env) {
  return String(env.AQK_GH || "gh").split(/\s+/).filter(Boolean);
}

// Запуск БЕЗ оболочки: в теле отзыва переносы строк, кавычки и обратные апострофы, и оболочка
// разобрала бы их как свои. Доводы уходят массивом — разбирать нечего.
function gh(args, timeout = 30000) {
  const [bin, ...pre] = ghArgs();
  return spawnSync(bin, [...pre, ...args], { encoding: "utf8", timeout });
}

const Q_ID = `query($o:String!,$n:String!){repository(owner:$o,name:$n){discussion(number:${DISCUSSION}){id}}}`;
const Q_ADD = "mutation($id:ID!,$body:String!){addDiscussionComment(input:{discussionId:$id,body:$body}){comment{url}}}";

// Три исхода, как везде: отправлено · не смогли и сказали почему · входа нет. Молчаливый отказ
// означал бы, что человек считает отзыв ушедшим, а его нет.
function postComment(body, repo) {
  if (gh(["auth", "status"], 15000).status !== 0) return { ok: false, reason: "no-auth" };
  const [owner, name] = repo;
  const one = gh(["api", "graphql", "-f", `query=${Q_ID}`, "-f", `o=${owner}`, "-f", `n=${name}`]);
  let id = "";
  try { id = JSON.parse(one.stdout || "{}").data.repository.discussion.id; } catch { /* разберём ниже */ }
  if (!id) return { ok: false, reason: "no-thread" };
  const two = gh(["api", "graphql", "-f", `query=${Q_ADD}`, "-f", `id=${id}`, "-f", `body=${body}`]);
  let url = "";
  try { url = JSON.parse(two.stdout || "{}").data.addDiscussionComment.comment.url; } catch { /* разберём ниже */ }
  return url ? { ok: true, url } : { ok: false, reason: "failed" };
}

// Предзаполненная ссылка. Параметры `title` и `body` — документация GitHub («Creating an issue
// from a URL query», сверено 2026-09-14). Кодируется ВСЁ: в теле переносы строк, решётки и
// пробелы, и незакодированная ссылка обрывается на первом же из них — а всё после решётки
// браузер считает якорем и не передаёт вовсе.
function issueUrl(repo, title, body) {
  const q = `title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
  return `${String(repo).replace(/\/+$/, "")}/issues/new?${q}`;
}

async function cmdFeedback() {
  const T = L.feedback;
  const man = await readManifest();
  let version = "";
  try { version = JSON.parse(await readFile(join(PKG_ROOT, "package.json"), "utf8")).version || ""; } catch { /* версия просто не покажется */ }

  const run = await readRun();
  let facts = null;
  try { facts = await detectFacts(man); } catch { /* стек не определили — скажем «неизвестно» */ }
  let level = null;
  if (man?.aqk) { try { level = (await assessLevel(man, null)).reached; } catch { /* уровень не посчитали */ } }
  // Классы известны только когда проба ДЕЙСТВИТЕЛЬНО проходила. «Никогда», «выключена» и «не
  // знаем» — это null, то есть «неизвестно»: см. договор в reportText.
  let blind = null;
  try {
    const st = await probeStatus();
    if (st.state === "fresh" || st.state === "stale") blind = st.classes || [];
  } catch { /* пробы не было — так и скажем */ }

  const lines = reportText({
    version, node: process.version, platform: process.platform, level,
    langs: facts?.langs ? [...facts.langs] : [],
    gates: declaredGates(man).length,
    red: run?.red || [], cannot: run?.cannot || [], blind, note: userNote(),
  });
  const body = lines.join("\n");
  console.log(`\n${body}\n`);

  // ОТПРАВКА — ТОЛЬКО ПО ФЛАГУ. Без него ниже печатается ссылка, и это весь путь наружу.
  if (sendWanted()) {
    console.log(c.dim(`  ${T.sending}`));
    const repo = REPO_URL.replace(/^https?:\/\/github\.com\//, "").split("/");
    const r = postComment(body, repo);
    if (r.ok) { console.log(c.green(`  ${T.sent(r.url)}\n`)); return; }
    console.log(c.yellow(`  ${T.sendFailed[r.reason] || T.sendFailed.failed}\n`));
  }

  console.log(c.bold(`  ${T.how}`));
  console.log(`  ${issueUrl(REPO_URL, T.issueTitle, body)}\n`);
  console.log(c.dim(`  ${T.nothingSent}`));
  console.log(c.dim(`  ${T.sendHow(`${SELF} feedback --send`)}`));
  console.log(c.dim(`  ${T.orPaste(`${SELF} feedback`)}\n`));
  // Код возврата всегда 0: команда, которая просит об одолжении и роняет при этом конвейер, —
  // последнее, что человек стерпит.
}

export { cmdFeedback, feedbackAsk, reportText, issueUrl, askLine, feedbackWanted, maybeAsk, sendWanted, userNote };
