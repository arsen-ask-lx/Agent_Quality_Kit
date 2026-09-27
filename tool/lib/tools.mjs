// tool/lib/tools.mjs — сведения о сторонних инструментах: как каждый из них незаметно глушат.
//
// ЗАЧЕМ. `adopt` доказывает гейт подсадкой: краснеет ли на плохом, молчит ли на хорошем. Этого
// мало в двух случаях. Образцов ещё нет — а сказать агенту, ЧТО именно не так с командой, уже
// можно. И беззубость бывает частичной: образец попал в правило уровня `error`, а половина правил
// стоит на `warn` и не роняет ничего никогда (eslint без `--max-warnings`). Подсадка скажет
// «доказан», и будет права про одно правило из десяти.
//
// ПОЧЕМУ ПО ИНСТРУМЕНТУ, А НЕ ОБЩИМ ПРАВИЛОМ. Проект `tikal/quality-gates` отказался от
// «универсального проверяльщика настроек» (issue 54): такой устаревает и даёт ложное чувство
// соответствия. Поэтому каждое правило здесь — про один инструмент, с ДОСЛОВНОЙ цитатой из его
// официальной документации и адресом, с красными и зелёными примерами, которые прогоняет
// `units-tools.mjs`. Правило, которое не краснеет на своём красном примере, не принимается.
//
// Сведения лежат в `kit/tools/<инструмент>.json` — JSON, а не YAML: у программы нет зависимостей,
// и разбор вложенных списков нашим маленьким разборщиком манифеста был бы вторым форматом.
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { PKG_ROOT, CWD, exists } from "./core.mjs";

const TOOLS_DIR = join(PKG_ROOT, "kit", "tools");

async function loadTools(dir = TOOLS_DIR) {
  if (!(await exists(dir))) return [];
  const out = [];
  for (const f of (await readdir(dir)).filter((n) => n.endsWith(".json")).sort()) {
    out.push(JSON.parse(await readFile(join(dir, f), "utf8")));
  }
  return out;
}

// Команда гейта часто — обёртка: `npm run lint`, `pnpm lint`, `yarn lint`, `npm test`. Инструмент
// и его флаги живут в `package.json`. Раскрывается ОДИН уровень: цепочки скриптов бывают, но
// угадывать глубже — значит выдумывать, что запустится.
function effectiveCommand(cmd, scripts = {}) {
  const m = /^\s*(?:npm\s+(?:run(?:-script)?\s+)?|pnpm\s+(?:run\s+)?|yarn\s+(?:run\s+)?|bun\s+run\s+)([\w:.-]+)/.exec(cmd);
  const name = m ? m[1] : null;
  if (name && typeof scripts[name] === "string") return `${cmd} → ${scripts[name]}`;
  return cmd;
}

function detectTool(tools, command) {
  return tools.find((t) => new RegExp(t.detect).test(command)) || null;
}

// Одно правило: все условия складываются по И. Условие о конфиге выполняется, если ХОТЯ БЫ в
// одном из названных файлов есть совпадение. Конфиг подаётся текстами — чтение диска отдельно,
// чтобы примеры правил проверялись без файлов.
function ruleFires(rule, command, configTexts = []) {
  if (rule.command_has && !new RegExp(rule.command_has).test(command)) return false;
  if (rule.command_lacks && new RegExp(rule.command_lacks).test(command)) return false;
  if (rule.config_has && !configTexts.some((t) => new RegExp(rule.config_has).test(t))) return false;
  if (rule.config_lacks && configTexts.length && configTexts.every((t) => new RegExp(rule.config_lacks).test(t))) return false;
  // Правило про конфиг без единого конфига не срабатывает: нечего читать — не значит «заглушён».
  // Исключение — `config_optional`: там, где нужная настройка ВЫКЛЮЧЕНА ПО УМОЛЧАНИЮ и её можно
  // включить либо флагом, либо в конфиге. Нет конфига — значит нет и настройки, и это факт, а
  // не догадка (jscpd: пустой обход без `--fail-on-empty` выходит с нулём).
  if (rule.config_has && !configTexts.length) return false;
  if (rule.config_lacks && !configTexts.length && !rule.config_optional) return false;
  return true;
}

async function readConfigs(files = [], cwd = CWD) {
  const out = [];
  for (const f of files) {
    try { out.push(await readFile(join(cwd, f), "utf8")); } catch { /* нет файла */ }
  }
  return out;
}

async function packageScripts(cwd = CWD) {
  try { return JSON.parse(await readFile(join(cwd, "package.json"), "utf8")).scripts || {}; } catch { return {}; }
}

// Что с этим гейтом не так по сведениям об его инструменте. `null` — инструмент не опознан:
// сведений нет, и это НЕ «заглушек не найдено».
async function toolFindings(cmd, { tools, cwd = CWD } = {}) {
  const list = tools || (await loadTools());
  const command = effectiveCommand(cmd, await packageScripts(cwd));
  const tool = detectTool(list, command);
  if (!tool) return null;
  const found = [];
  for (const rule of tool.off || []) {
    // `config_from_command` — настройки лежат в файле, который назван в САМОЙ команде: у k6
    // пороги живут в скрипте теста (`k6 run load.js`). Первая скобка выражения — путь.
    const named = rule.config_from_command ? (new RegExp(rule.config_from_command).exec(command) || [])[1] : null;
    const configs = await readConfigs([...(rule.config_files || []), ...(named ? [named] : [])], cwd);
    if (ruleFires(rule, command, configs)) found.push(rule);
  }
  return { tool, command, found };
}

export { loadTools, effectiveCommand, detectTool, ruleFires, toolFindings };
