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
import { parseManifest } from "./manifest.mjs";

// Гейт можно доказать, если у него есть оба образца. Признак по образцам, а не по тексту
// команды: запись, делегирующая готовому инструменту (`npx knip --directory .`), каталог
// образцов в команде не упоминает, но образцы у неё есть — их кладёт `aqk add`.
async function samplesFor(samplesDir, name) {
  if (!samplesDir) return null;
  const red = join(CWD, samplesDir, name, "red");
  const green = join(CWD, samplesDir, name, "green");
  if (!(await exists(red)) || !(await exists(green))) return null;
  return { red: join(samplesDir, name, "red"), green: join(samplesDir, name, "green") };
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

function run(cmd, timeoutMs) {
  const r = spawnSync(cmd, { shell: true, encoding: "utf8", cwd: CWD, timeout: timeoutMs });
  const out = `${r.stdout || ""}${r.stderr || ""}`.trim();
  // Убитый по таймауту процесс возвращает null — это не «ноль», а «не знаем».
  const code = r.status === null ? 124 : r.status;
  return { code, out };
}

// Возвращает { proven, broken, unprovable, results } — числами и списком, чтобы вызывающий
// сам решал, что печатать и чем краснеть.
async function proveGates(man, { timeoutMs = 300000 } = {}) {
  const gates = man?.gates && typeof man.gates === "object" && !Array.isArray(man.gates) ? man.gates : {};
  const samplesDir = typeof man?.samples === "string" ? man.samples.trim() : "";
  const results = [];

  for (const [name, rawCmd] of Object.entries(gates)) {
    const cmd = String(rawCmd || "").trim();
    if (!cmd) {
      results.push({ name, state: "broken", why: "empty" });
      continue;
    }
    const s = await samplesFor(samplesDir, name);
    if (!s) {
      results.push({ name, state: "unprovable", why: "no-samples" });
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
    if (!targetIsLast(bare)) {
      results.push({ name, state: "unprovable", why: "no-target" });
      continue;
    }

    const red = run(commandFor(cmd, s.red), timeoutMs);
    const green = run(commandFor(cmd, s.green), timeoutMs);
    if (red.code === 0) {
      results.push({ name, state: "broken", why: "red-passed", red, green });
    } else if (green.code !== 0) {
      results.push({ name, state: "broken", why: "green-failed", red, green });
    } else {
      results.push({ name, state: "proven", red, green });
    }
  }

  const proven = results.filter((r) => r.state === "proven").length;
  const broken = results.filter((r) => r.state === "broken").length;
  const unprovable = results.filter((r) => r.state === "unprovable").length;
  // Доказательство состоялось, если ни один доказуемый гейт не сломан И хоть один доказан.
  // Второе условие обязательно: проект, у которого все гейты недоказуемы, ничего не доказал —
  // именно так выглядит подделка с тремя `true`.
  return { proven, broken, unprovable, ok: broken === 0 && proven > 0, results };
}

export { proveGates, commandFor };
