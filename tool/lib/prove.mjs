// tool/lib/prove.mjs — доказательство гейтов проекта: краснеет ли гейт на своём красном
// образце и молчит ли на зелёном.
//
// ЗАЧЕМ ЭТО ВООБЩЕ СУЩЕСТВУЕТ. Уровень AQK до 2026-09-07 считался наличием файлов: есть папка
// правил, объявлен хоть один гейт, существуют папки образцов и храповиков, есть журнал. Проект
// с тремя гейтами `true` — командой, которая всегда отвечает «ок», — проходил порог AQK-3 и
// получал значок. Проверено прогоном на пустой папке; три «гейта», ноль защиты, высший уровень.
//
// Это ровно тот класс, против которого весь комплект: `pytest || true`, только на уровне всего
// стандарта. Наше же правило гласит: «если утверждение не проверяется машиной — его в стандарте
// нет». Уровень был самым громким нашим утверждением, и машина проверяла у него `exists()`.
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CWD, exists } from "./core.mjs";
import { parseManifest, gateRequires } from "./manifest.mjs";
import { whichSync } from "./repo.mjs";
import { classify, findingCodes, gateCommand, gateTimeout } from "./execution.mjs";
import { buildSandbox, plantTree } from "./sandbox.mjs";
import { rm } from "node:fs/promises";

// Гейт можно доказать, если у него есть оба образца. Признак по образцам, а не по тексту
// команды: запись, делегирующая готовому инструменту (`npx knip --directory .`), каталог
// образцов в команде не упоминает, но образцы у неё есть — их кладёт `aqk add`.
async function samplesIn(samplesDir, name) {
  if (!samplesDir) return null;
  const red = join(CWD, samplesDir, name, "red");
  const green = join(CWD, samplesDir, name, "green");
  if (!(await exists(red)) || !(await exists(green))) return null;
  return { red: join(samplesDir, name, "red"), green: join(samplesDir, name, "green") };
}

// Два места, и порядок важен. `samples:` — образцы записей каталога (их кладёт `aqk add`);
// `own_samples:` — образцы проверок, написанных самим проектом (`npm test`, `make check`). Держать
// их вместе нельзя: у самого AQK `samples:` — это каталог записей, и образец для `units` читался
// бы там как новая запись. Снаружи так же: у semgrep тест правила лежит рядом с правилом.
async function samplesFor(man, name) {
  const dir = (k) => (typeof man?.[k] === "string" ? man[k].trim() : "");
  return (await samplesIn(dir("samples"), name)) || (await samplesIn(dir("own_samples"), name));
}

// Команда записи всегда кончается каталогом проверки: рецепт пишется как `… {dir}`, и при
// установке `{dir}` превращается в «.». Чтобы прогнать гейт по образцу, подменяем ПОСЛЕДНЕЕ
// слово команды. Делается это только для гейтов, у которых образцы есть, — то есть для
// установленных из каталога, где форма команды наша и известна.
// Обёртки снимаются ПЕРЕД тем, как решать что-либо о команде. Их две, и обе меняют смысл
// первых слов:
//
//   `bash …/ratchet.sh <реестр> <команда…>` — мера постепенности. Без снятия доказательство
//   гоняет гейт ВМЕСТЕ с реестром долга, и реестр перезаписывается находками из ОБРАЗЦА:
//   на живом проекте это стёрло бы долг целиком. Поймано прогоном комплекта.
//
//   `bash gates/_native.sh <каталог> <команда…>` — фильтр образцов для родного инструмента.
//   Его первый аргумент обязан ехать вместе с каталогом проверки: фильтр прячет пути
//   `gates/*/red|green`, и оставленный «.» спрятал бы ровно то, что образец обязан показать, —
//   красный образец прошёл бы зелёным.
function unwrap(cmd) {
  let parts = String(cmd).trim().split(/\s+/);
  let nativeAt = -1;
  for (let guard = 0; guard < 4; guard++) {
    const r = parts.findIndex((p) => /ratchet\.sh$/.test(p));
    if (r !== -1 && parts.length > r + 2) { parts = parts.slice(r + 2); continue; }
    const n = parts.findIndex((p) => /_native\.sh$/.test(p));
    if (n !== -1 && parts.length > n + 2) { nativeAt = n; break; }
    break;
  }
  return { parts, nativeAt };
}

// Куда подставлять каталог образца. Рецепт каталога всегда кончается `{dir}`, и при установке
// это превращается в «.». Если последнее слово не похоже на каталог проверки, подставлять
// некуда: команда написана руками, и угадывать значит объявить исправный гейт сломанным.
// Найдено код-ревью 2026-09-07 на примере `eslint . --max-warnings 0`.
function targetIsLast(parts) {
  const last = parts[parts.length - 1];
  return last === "." || last === "./";
}

// Путь уходит в СТРОКУ КОМАНДЫ, а её исполняет `sh` — не Node. Для `sh` обратный слэш это
// экранирование, а не разделитель: `gates\\x\\red` превращается в `gatesxred`, каталога с таким
// именем нет, обход молчит, гейт выходит с нулём — и доказательство объявляет ИСПРАВНЫЙ гейт
// сломанным. Найдено вторым пользователем 2026-09-08 на Windows: `path.join` там даёт `\\`,
// и падали ровно те записи, что обходят дерево через `find`; на `grep -r` выживали, потому что
// Windows разбирает слэши сам. Худший из возможных отказов: комплект против «зелёного, потому
// что ничего не проверялось» сам выдал зелёное за красное и отобрал у проекта ступень.
// Нормализация стоит ЗДЕСЬ, а не у сборщика пути: это единственная дверь из мира путей Node
// в мир оболочки, и закрывать её надо один раз, кто бы путь ни собрал.
const forShell = (p) => String(p).replace(/\\/g, "/");

function commandFor(cmd, dirRaw) {
  const dir = forShell(dirRaw);
  const { parts, nativeAt } = unwrap(cmd);
  const out = parts.slice();
  out[out.length - 1] = dir;
  // Фильтр образцов узнаёт, что ему дали именно образец, по своему первому аргументу.
  if (nativeAt !== -1) out[nativeAt + 1] = dir;
  return out.join(" ");
}

// Каким рецептом написаны образцы. Читается из `gate.yml`, который `aqk add` кладёт в проект
// рядом с проверкой; если файла нет — молчим, значит запись не из каталога.
async function samplesForRecipe(samplesDir, name) {
  const yml = join(CWD, samplesDir, name, "gate.yml");
  if (!(await exists(yml))) return null;
  try {
    const rec = parseManifest(await readFile(yml, "utf8"));
    const lang = typeof rec?.samples_for === "string" ? rec.samples_for.trim() : "";
    if (!lang) return null;
    const recipe = String(rec?.recipes?.[lang] || "").trim();
    if (!recipe) return null;
    return { lang, prog: recipe.split(/\s+/)[0] };
  } catch {
    return null;
  }
}

// Запуск возвращает РАЗОБРАННЫЙ исход, а не сырой код. Прежде здесь стояло
// `code = r.status === null ? 124 : r.status`, и комментарий рядом честно называл 124
// «не знаем» — а вызывающий тут же считал его находкой. Опыт 2026-09-09: проверка, виснущая
// на красном образце, получала вердикт «доказана».
function run(cmd, timeoutMs, prog, cwd = CWD) {
  const r = spawnSync(gateCommand(cmd), { shell: true, encoding: "utf8", cwd, timeout: timeoutMs });
  const out = `${r.stdout || ""}${r.stderr || ""}`.trim();
  return { ...classify(r, findingCodes(prog)), out };
}

// Возвращает { proven, broken, unprovable, results } — числами и списком, чтобы вызывающий
// сам решал, что печатать и чем краснеть.
// `only` — доказать один гейт: `adopt` спрашивает про конкретную проверку, и гонять ради неё
// все остальные значило бы платить минутами за ответ на другой вопрос.
// `planted` — доказывать ли подсадкой в копию проекта команды, которые не кончаются каталогом.
// Это втрое дороже самого гейта (чистая копия, красный, зелёный) плюс копирование проекта: замер
// 2026-09-27 на самом AQK — 3 с → 22 с из-за двух таких гейтов. Поэтому по умолчанию НЕТ: уровень,
// значок, отчёт и `doctor --run` зовут это на каждом прогоне. Включают явно `aqk prove` и
// `aqk adopt` — там вопрос именно «умеет ли краснеть», и за ответ платят сознательно.
async function proveGates(man, { timeoutMs = gateTimeout().ms, only = null, planted = false } = {}) {
  const all = man?.gates && typeof man.gates === "object" && !Array.isArray(man.gates) ? man.gates : {};
  const gates = only ? Object.fromEntries(Object.entries(all).filter(([n]) => n === only)) : all;
  const samplesDir = typeof man?.samples === "string" ? man.samples.trim() : "";
  const results = [];
  // Песочница одна на весь вызов и строится только тогда, когда понадобилась: копировать
  // проект ради гейтов, которые доказываются подстановкой каталога, незачем.
  let sandbox;
  const getSandbox = async () => (sandbox === undefined ? (sandbox = await buildSandbox()) : sandbox);
  try {
  for (const [name, rawCmd] of Object.entries(gates)) {
    const cmd = String(rawCmd || "").trim();
    if (!cmd) {
      results.push({ name, state: "broken", why: "empty" });
      continue;
    }
    const s = await samplesFor(man, name);
    if (!s) {
      results.push({ name, state: "unprovable", why: "no-samples" });
      continue;
    }

    // Программы, без которой запись не работает, может не быть на машине — тогда доказывать
    // нечем, а не «гейт сломан». Проверяется ДО запуска: без неё обёртка краснеет на обоих
    // образцах, и вердикт вышел бы «краснеет на исправном коде».
    const missing = await gateRequires(man, samplesDir, name, whichSync);
    if (missing) {
      results.push({ name, state: "unprovable", why: "needs-program", missing });
      continue;
    }

    // Образцы бывают написаны под КОНКРЕТНЫЙ рецепт: запись без переносимой проверки называет
    // его полем `samples_for`. Если в проекте стоит рецепт под другой язык, гонять по этим
    // образцам нечего — они на чужом языке. Найдено первым же прогоном на своём репозитории:
    // `dead-code` стоит у нас рецептом под JS (`knip`), а образцы у него питоновские, и
    // «доказательство» объявляло исправный гейт сломанным.
    // Сравниваем с командой БЕЗ обёрток: установленная запись выглядит как
    // `bash gates/_native.sh . ruff check …`, и проверка по сырой строке объявляла бы
    // «стоит другой рецепт» у каждой обёрнутой записи. Найдено код-ревью 2026-09-07:
    // проект, поставивший `no-print-in-prod` с `ruff`, терял AQK-2 целиком.
    const { parts: bare, nativeAt } = unwrap(cmd);
    const effective = nativeAt === -1 ? bare : bare.slice(nativeAt + 2);
    const forRecipe = await samplesForRecipe(samplesDir, name);
    if (forRecipe && effective[0] !== forRecipe.prog) {
      results.push({ name, state: "unprovable", why: "other-recipe", forRecipe });
      continue;
    }
    // Программа, чьи коды разбираем: первое слово команды БЕЗ обёрток. У обёрнутой записи
    // это ruff/vulture, а не bash, — иначе адаптер брался бы для оболочки.
    const prog = effective[0];
    let red, green;
    if (targetIsLast(bare)) {
      red = run(commandFor(cmd, s.red), timeoutMs, prog);
      green = run(commandFor(cmd, s.green), timeoutMs, prog);
    } else {
      // КОМАНДА НЕ КОНЧАЕТСЯ КАТАЛОГОМ — `npm run lint`, `make check`. Подставлять некуда,
      // поэтому образец подсаживается в КОПИЮ проекта по своим путям, а команда идёт как есть.
      // Команда, красная без подсадки, ничего не доказывает — это называется отдельно, а не
      // засчитывается ни доказанной, ни сломанной (см. ниже, когда гоняется чистая копия).
      if (!planted) {
        results.push({ name, state: "unprovable", why: "planted-skipped" });
        continue;
      }
      const box = await getSandbox();
      if (!box) {
        results.push({ name, state: "unprovable", why: "no-target" });
        continue;
      }
      // Чистая копия гоняется ТОЛЬКО когда зелёный образец покраснел. Пока зелёный чист, копия
      // без подсадки ничего не добавляет: красный отличается от зелёного ровно подсаженным, и
      // разница вердиктов — это и есть доказательство. А вот красный зелёный образец надо
      // объяснить: «ругается на исправный код» или «красная ещё до подсадки» — разные починки.
      // Так прогонов два, а не три: для `smoke` (минута на прогон) это минута на каждое
      // доказательство.
      let undo = await plantTree(box, join(CWD, s.green));
      green = run(cmd, timeoutMs, prog, box);
      await undo();
      if (green.state === "finding") {
        const base = run(cmd, timeoutMs, prog, box);
        if (base.state !== "clean") {
          results.push({ name, state: "unprovable", why: base.state === "infra_error" ? "infra" : "baseline-red", side: "base", reason: base.reason, red: base });
          continue;
        }
      }
      undo = await plantTree(box, join(CWD, s.red));
      red = run(cmd, timeoutMs, prog, box);
      await undo();
    }

    // СБОЙ АРБИТРА — НЕ ВЕРДИКТ О ЗАПИСИ, ни в ту сторону, ни в другую. Раньше сбой на красном
    // читался как «поймал», а сбой на зелёном — как «ругается на исправный код»: инструмент
    // ломался, а обвиняли запись каталога. Оба случая теперь «доказать не смогли», и причина
    // названа.
    if (red.state === "infra_error" || green.state === "infra_error") {
      const side = red.state === "infra_error" ? "red" : "green";
      const bad = side === "red" ? red : green;
      results.push({ name, state: "unprovable", why: "infra", side, reason: bad.reason, red, green });
    } else if (red.state === "clean") {
      results.push({ name, state: "broken", why: "red-passed", red, green });
    } else if (green.state === "finding") {
      results.push({ name, state: "broken", why: "green-failed", red, green });
    } else {
      results.push({ name, state: "proven", red, green });
    }
  }
  } finally {
    if (sandbox) await rm(sandbox, { recursive: true, force: true });
  }

  return { ...verdict(results), results };
}

// ВЕРДИКТ ОТДЕЛЁН ОТ ПРОГОНА — чтобы правило можно было проверить без запуска процессов.
//
// Прежнее правило было `broken === 0 && proven > 0`, и оно позволяло ОДНОМУ доказанному гейту
// компенсировать сколько угодно недоказанных: проект с пятью объявленными проверками, из
// которых четыре не смогли отработать, получал AQK-2 за счёт пятой.
//
// Различие тонкое и обязательное. «Нечем доказывать» бывает ЗАКОННЫМ: нет образцов, нет
// программы на этой машине, стоит рецепт под другой язык — ступень за это не отнимают, иначе
// уровень стал бы зависеть от того, что установлено. А «запускали и не смогло отработать» —
// сбой, и он ступень отнимает: иначе таймаут арбитра снова становится способом получить зелёное.
function verdict(results) {
  const proven = results.filter((r) => r.state === "proven").length;
  const broken = results.filter((r) => r.state === "broken").length;
  const unprovable = results.filter((r) => r.state === "unprovable").length;
  const infra = results.filter((r) => r.state === "unprovable" && r.why === "infra").length;
  return { proven, broken, unprovable, infra, ok: broken === 0 && infra === 0 && proven > 0 };
}

export { proveGates, commandFor, verdict, samplesFor };
