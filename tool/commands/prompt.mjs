// tool/commands/prompt.mjs — `aqk prompt`: одно задание для агента — «почини вот это, это и это».
//
// ЗАЧЕМ. Между диагнозом и действием не было моста. `doctor` пишет человеку, `context` говорит
// агенту «как дела», а задание «сделай вот это» человек пересказывал сам — и пересказ терял
// команды. Идея — из разбора agentlint (research/competitors/agentlint.md, «Задание для агента»):
// правила поведения сверху, исправления по весу, в конце — как проверить.
//
// ЧЕГО У НИХ НЕ БЕРЁМ. У них «проверь» — это «балл вырос». У нас у КАЖДОГО пункта свой арбитр:
// команда, которая сейчас красная и должна стать зелёной. Иначе агент доложит «сделал» про
// пункт, который ничем не доказан, — тот самый отказ, против которого весь комплект.
//
// НИЧЕГО НЕ ЗАПУСКАЕТ. Читает то же, что `context`: манифест, `.aqk/last-run.md`, отметку пробы,
// каталог. Задание пишется за секунду, а прогон — работа агента, и она в задании первой строкой,
// если прогона нет или он устарел: иначе пустое задание прочиталось бы как «всё чисто».
import { readManifest } from "../lib/manifest.mjs";
import { claudeShimFor } from "../lib/repo.mjs";
import { CWD, SELF } from "../lib/core.mjs";
import { readRun, readAdvice, portableSelf } from "./context.mjs";
import { probeStatus } from "./probe.mjs";
import { L } from "../i18n/index.mjs";

// Больше пяти пунктов за раз агент не удержит — как и человек; остальное называется числом.
const MAX_ITEMS = 5;

// Чистая функция: состояние → строки задания. Порядок — по тому, насколько пункт ФАКТ о проекте
// и насколько без него невыполнимы остальные: манифест → прогон → красное → гейт стоит, но
// пропустил брак из пробы → брак, для которого гейта нет → проверки, которые у проекта уже есть
// → свод, невидимый Claude Code → «начните с этих трёх» из каталога. Класс из пробы в последнем
// списке не повторяется.
function taskText(st, T = L.prompt) {
  const self = st.self || "aqk";
  const it = [];
  if (!st.manifest) it.push(T.item.init(self));
  if (!st.run) it.push(T.item.runNone(self));
  else if (st.run.stale) it.push(T.item.runStale(self, st.run.when));
  for (const name of st.run?.red || []) it.push(T.item.red(name, self));
  for (const m of st.missed || []) it.push(T.item.missed(m, self));
  for (const b of st.blind || []) it.push(T.item.blind(b, self));
  if ((st.adopt || []).length) it.push(T.item.adopt(st.adopt, self));
  if (st.shim) it.push(T.item.shim[st.shim](self));
  const seen = new Set((st.blind || []).map((b) => b.slug));
  for (const s of st.start || []) if (!seen.has(s.slug)) it.push(T.item.start(s, self));

  const out = [T.title, "", T.intro, "", T.rulesTitle, ...T.rules.map((r) => `- ${r}`), "", T.tasksTitle];
  if (!it.length) out.push(T.empty);
  it.slice(0, MAX_ITEMS).forEach((line, i) => out.push(`${i + 1}. ${line}`));
  if (it.length > MAX_ITEMS) out.push(T.more(it.length - MAX_ITEMS, self));
  out.push("", T.verifyTitle, ...T.verify(self).map((r) => `- ${r}`));
  return out;
}

async function cmdPrompt() {
  const man = await readManifest();
  let probe = null;
  try { probe = await probeStatus(); } catch { /* пробы нет — пунктов из неё не будет */ }
  let advice = { adopt: [], blind: [], start: [], missed: [] };
  try { advice = await readAdvice(man, probe); } catch { /* не посчитали — выдумывать пункты нельзя */ }
  // Команда уходит в чужой контекст и, возможно, в чужие руки: абсолютный путь к нашей
  // программе там не сработает — тот же довод, что у хука `context --install`.
  console.log(taskText({
    self: portableSelf(SELF),
    manifest: Boolean(man),
    run: await readRun(),
    shim: await claudeShimFor(CWD),
    ...advice,
  }).join("\n"));
}

export { cmdPrompt, taskText };
