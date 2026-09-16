// tool/lib/covers.mjs — ЗАЯВКА «ЭТУ ЗАПИСЬ КАТАЛОГА ДЕРЖИТ НАШ ЛИНТЕР» И ЕЁ СВЕРКА.
//
// ОТДЕЛЬНЫМ ФАЙЛОМ, А НЕ В manifest.mjs. Там разбор `.aqk.yml` и ступени; здесь — чтение
// конфигов ЧУЖИХ линтеров (ruff, eslint, Biome) и суждение о том, включено ли в них правило.
// Причины меняться разные: новое поле манифеста и новый линтер приходят в разные дни. Шов
// вскрыл наш же `file-size-limit` 2026-09-16: manifest.mjs стоял на 447 строках при пределе 500,
// а починка сверки выключенных правил требовала ещё полсотни.

// ЗАПИСЬ ЗАКРЫТА ДРУГИМ АРБИТРОМ. `covers: { lint: [no-print-in-prod, swallowed-error] }`
// читается как «гейт lint держит эти записи каталога». Просьба первого чужого пользователя,
// названная им первой: без этого `doctor` каждый прогон печатал «применимо, но не поставлено»
// про то, что у него закрыто biome. Неправда в собственном выводе дороже всех остальных: весь
// стандарт стоит на том, что вывод не врёт.
//
// НО ЭТО НЕ ПРИЗНАНИЕ НА СЛОВО. Закрывать может только гейт, ОБЪЯВЛЕННЫЙ в `gates:` непустой
// командой. Иначе поле превращается в способ объявить защиту, которой нет, — ровно тот отказ,
// против которого написан комплект. Необъявленные называются поимённо, а не отбрасываются молча.
function coversOf(man) {
  const covered = new Map();
  const unknownGates = [];
  const raw = man?.covers;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { covered, unknownGates };

  const gates = man?.gates && typeof man.gates === "object" && !Array.isArray(man.gates) ? man.gates : {};
  const declared = new Set(Object.entries(gates).filter(([, cmd]) => String(cmd || "").trim()).map(([k]) => k));

  for (const [gate, value] of Object.entries(raw)) {
    const entries = Array.isArray(value)
      ? value
      : String(value || "").split(",").map((x) => x.trim()).filter(Boolean);
    if (!declared.has(gate)) { if (entries.length) unknownGates.push(gate); continue; }
    for (const e of entries) if (!covered.has(e)) covered.set(e, gate);
  }
  return { covered, unknownGates };
}

// ЗАЯВКА `covers` СВЕРЯЕТСЯ, А НЕ ПРИНИМАЕТСЯ НА СЛОВО — насколько это вообще возможно.
//
// Поле `covers` заведено 2026-09-08 утром, и тогда же в коммите было записано честное: «снимает
// запись с долга по СЛОВУ человека; проверить, что чужой гейт ловит то же самое, машина не
// может». К вечеру выяснилось, что это не теория. Запуск на настоящем `ruff.toml` из живого
// проекта: девятнадцать групп правил в `extend-select`, а `print()` не ловится — группы `T20`
// среди них нет. Заявка «no-print-in-prod держит наш lint» была бы ложной, а запись ушла бы из
// долга. То есть поле, снимающее неправду из вывода, само стало бы способом её произвести.
//
// ЧТО СВЕРЯЕТСЯ. У записи каталога в рецепте стоят коды правил: `ruff check --select T20 {dir}`.
// Если ни команда закрывающего гейта, ни конфиг линтера этих кодов не называют — заявка не
// подтверждена. Записи без кодов в рецепте (переносимые проверки) не сверяются вовсе: там
// сверять нечего, и выдумывать вердикт нельзя.
//
// ПОЧЕМУ «НЕ ПОДТВЕРЖДЕНО», А НЕ «ЛОЖЬ». Правило могло прийти из плагина, пресета или общего
// конфига этажом выше. Объявлять такое ошибкой значит краснеть на нормальном укладе — а такой
// вывод перестают читать целиком, вместе с настоящими находками.
const RULE_CODES = /--select[= ]([A-Za-z0-9,]+)/;

// КАКИМ ЛИНТЕРОМ ЗАКРЫТ ГЕЙТ. Отзыв с живого проекта 2026-09-11 (TypeScript на Biome): заявка
// «lint держит no-print-in-prod» всегда была «не подтверждена» — сверка искала коды ruff в
// конфиге Biome, где их не бывает никогда. Поле, снимающее шум, само его производило.
// Порядок: команда гейта; npm-скрипт, который она зовёт; единственный конфиг линтера в проекте.
function linterOf(cmd, scripts = {}, present = []) {
  let c = String(cmd || "");
  const m = /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?([\w:-]+)/.exec(c);
  if (m && typeof scripts[m[1]] === "string") c += ` ${scripts[m[1]]}`;
  if (/\bbiome\b/.test(c)) return "biome";
  if (/\beslint\b/.test(c)) return "eslint";
  if (/\bruff\b/.test(c)) return "ruff";
  return present.length === 1 ? present[0] : null;
}

// Правила записи на языке ЭТОГО линтера. ruff — коды из `--select` рецептов; eslint — имена из
// `--rule '{…}'`; Biome рецептов не имеет, у записи для него поле `biome_rules` (сверено по схеме
// конфигурации Biome 2.5.12). `none` — у линтера такого правила нет вовсе. `null` — не знаем.
function rulesFor(rec, linter) {
  const recipes = Object.values(rec?.recipes && typeof rec.recipes === "object" ? rec.recipes : {}).map(String);
  if (linter === "ruff") {
    const codes = new Set();
    for (const cmd of recipes) { const m = RULE_CODES.exec(cmd); if (m) for (const x of m[1].split(",")) if (x.trim()) codes.add(x.trim()); }
    return codes.size ? [...codes] : null;
  }
  if (linter === "eslint") {
    const names = new Set();
    for (const cmd of recipes) for (const m of cmd.matchAll(/"([@a-z0-9/_-]+)"\s*:\s*\[?\s*"(?:error|warn)"/g)) names.add(m[1]);
    return names.size ? [...names] : null;
  }
  if (linter === "biome") {
    const v = typeof rec?.biome_rules === "string" ? rec.biome_rules.trim() : "";
    if (!v) return null;
    // Поле хранит `группа/правило` — так его ждёт `biome lint --only`; в biome.json правило
    // лежит внутри объекта группы, поэтому ищется по имени без группы.
    return v === "none" ? [] : v.split(",").map((x) => x.trim().split("/").pop()).filter(Boolean);
  }
  return null;
}

// ВКЛЮЧЕНО ИЛИ ТОЛЬКО УПОМЯНУТО В ВЫКЛЮЧЕНИИ. До 2026-09-16 код правила искался подстрокой во
// всём тексте конфига, и `ignore = ["C901"]` подтверждал заявку ровно так же, как
// `select = ["C901"]`. Замер по десяти чужим репозиториям с линтерами: из четырёх закрытий,
// которые сверка засчитала, правдой оказалось одно. У fastapi `C901` стоит в `ignore` — правило
// сложности выключено, а `covers: lint: [complexity-limit]` сверка молча подтверждала.
//
// ОПОЗНАЁТСЯ КОНСТРУКЦИЯ, А НЕ СМЫСЛ. ruff: код внутри массива `ignore`/`extend-ignore`. eslint
// и Biome: значение `off` или `0`. Этого достаточно, чтобы не подтверждать выключенное, и этого
// мало, чтобы понять правило целиком — и мы не притворяемся:
//   · ОПЦИИ ПРАВИЛА не читаются. У vite `'no-empty': ['warn', { allowEmptyCatch: true }]` — пустой
//     catch разрешён, а swallowed-error ровно про него; сверка это пропустит. Разбирать опции —
//     понимать текст, а запись, понимающая текст, хрупка по построению (SPEC.md §6);
//   · `per-file-ignores` у ruff НЕ выключение: это исключение для части файлов при включённом
//     правиле. У pydantic `T20` включён, а для `release/*.py` снят — заявка честная;
//   · плоский конфиг eslint законно выключает правило в одном блоке и включает в другом. Хоть
//     одно включение — подтверждено: обвинять нормальный уклад значит учить не читать вывод.
//
// Почему ruff-коду в `ignore` верим как выключению: документация ruff — узкий селектор побеждает
// широкий (`ALL < category < linter group < linter prefix < rule`), и код целиком — самый узкий.
const RUFF_OFF = /^\s*(?:extend-)?ignore\s*=\s*\[([\s\S]*?)\]/gm;
const LEVEL = /["'](off|warn|error|info)["']|\b([012])\b/;

function ruleState(linter, rule, gateCmd, text) {
  if (linter === "ruff") {
    const off = new Set();
    for (const m of text.matchAll(RUFF_OFF)) for (const t of m[1].matchAll(/["']([A-Za-z0-9]+)["']/g)) off.add(t[1]);
    if (`${gateCmd}\n${text.replace(RUFF_OFF, "")}`.includes(rule)) return "enabled";
    return off.has(rule) ? "disabled" : "absent";
  }
  // eslint и Biome: имя правила в кавычках или без, затем значение — строкой, числом, первым
  // элементом массива или полем `level` объекта (так Biome пишет правило с опциями).
  const esc = rule.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  const re = new RegExp(`["']?${esc}["']?\\s*:\\s*(?:\\[\\s*|\\{[^}]*?["']level["']\\s*:\\s*)?(["'](?:off|warn|error|info)["']|[012])`, "g");
  let on = false, offHit = false;
  for (const m of `${gateCmd}\n${text}`.matchAll(re)) {
    const v = LEVEL.exec(m[1]);
    const level = v ? (v[1] || v[2]) : "";
    if (level === "off" || level === "0") offHit = true; else on = true;
  }
  if (on) return "enabled";
  if (offHit) return "disabled";
  // Упомянуто, но значение не разобрано (правило через переменную, пресет) — прежнее поведение:
  // не обвиняем то, чего не поняли.
  return text.includes(rule) || gateCmd.includes(rule) ? "enabled" : "absent";
}

// Заявка подтверждена, если ХОТЬ ОДНО правило записи включено; выключена — если ни одно не
// включено, а хоть одно стоит в выключении; иначе не подтверждена.
function claimState(linter, rules, gateCmd, text) {
  const disabled = [];
  for (const r of rules) {
    const st = ruleState(linter, r, gateCmd, text);
    if (st === "enabled") return { state: "enabled" };
    if (st === "disabled") disabled.push(r);
  }
  return disabled.length ? { state: "disabled", codes: disabled } : { state: "absent" };
}

// `configs` — тексты конфигов по линтерам: { ruff, eslint, biome, scripts }. Строка (прежний вид
// вызова) — один общий текст для всех. Исходы: unproven (линтер известен, его правил нет ни в
// команде, ни в конфиге) · impossible (у линтера такого правила нет) · unknown (линтер не
// распознан или правил записи для него мы не знаем — «не умею проверить», не обвинение).
function coversUnproven(man, catalog = [], configs = "") {
  const { covered } = coversOf(man);
  if (!covered.size) return [];
  const gates = man?.gates && typeof man.gates === "object" && !Array.isArray(man.gates) ? man.gates : {};
  const cfg = typeof configs === "string" ? { ruff: configs, eslint: configs, biome: configs } : (configs || {});
  const present = ["ruff", "eslint", "biome"].filter((k) => cfg[k] && String(cfg[k]).trim() && typeof configs !== "string");
  const out = [];

  for (const [entry, gate] of covered) {
    const rec = catalog.find((r) => r.slug === entry);
    // Запись, которая не выражается правилами НИ ОДНОГО линтера (переносимые проверки), не
    // сверяется вовсе: сверять нечего, и выдумывать вердикт нельзя.
    if (!["ruff", "eslint", "biome"].some((k) => rulesFor(rec, k) !== null)) continue;
    const linter = linterOf(gates[gate], cfg.scripts || {}, present);
    const rules = linter ? rulesFor(rec, linter) : null;
    if (rules === null) { out.push({ entry, gate, codes: [], linter, kind: "unknown" }); continue; }
    if (!rules.length) { out.push({ entry, gate, codes: [], linter, kind: "impossible" }); continue; }
    const st = claimState(linter, rules, String(gates[gate] || ""), String(cfg[linter] || ""));
    if (st.state === "disabled") out.push({ entry, gate, codes: st.codes, linter, kind: "disabled" });
    else if (st.state === "absent") out.push({ entry, gate, codes: rules, linter, kind: "unproven" });
  }
  return out;
}

// ЧТО ЗАКРЫТО НА ДЕЛЕ. Заявка из `covers:` минус однозначно неверные: правило выключено,
// правила у линтера нет вовсе. Одна функция на `doctor` и на блок для агента — иначе счёт
// одного разошёлся бы со счётом другого, а вывод `doctor` противоречил сам себе: итог снимал
// запись с долга, а строкой ниже та же запись называлась неверно закрытой.
// «Не подтверждено» остаётся закрытым: правило могло прийти из пресета, и это не обвинение.
function heldCovers(man, catalog = [], configs = {}) {
  const held = new Map(coversOf(man).covered);
  for (const u of coversUnproven(man, catalog, configs)) {
    if (u.kind === "disabled" || u.kind === "impossible") held.delete(u.entry);
  }
  return held;
}

// ГДЕ ЛЕЖАТ КОНФИГИ ЛИНТЕРОВ — одно знание. Жило внутри печати `doctor`, и блок для агента его
// не видел вовсе: `context` считал корзины по голой заявке. Чтение с диска — отдельно от
// суждения: суждение проверяется перебором случаев, чтение — прогоном.
//
// По линтерам, а не одной склейкой: заявка сверяется правилами того линтера, которым закрыт
// гейт (отзыв с живого проекта 2026-09-11 — коды ruff искались в biome.json). `pyproject.toml`
// берётся только разделом ruff: он есть почти у каждого python-проекта и без ruff.
async function readLinterConfigs(cwd) {
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const readAll = async (names) => {
    let t = "";
    for (const f of names) { try { t += await readFile(join(cwd, f), "utf8") + "\n"; } catch { /* нет файла */ } }
    return t;
  };
  let scripts = {}, pkgText = "";
  try { pkgText = await readFile(join(cwd, "package.json"), "utf8"); scripts = JSON.parse(pkgText)?.scripts || {}; } catch { /* нет или не JSON */ }
  return {
    ruff: (await readAll(["ruff.toml", ".ruff.toml"])) +
      ((await readAll(["pyproject.toml"])).match(/^\[tool\.ruff[\s\S]*/m)?.[0] || ""),
    eslint: (await readAll([".eslintrc", ".eslintrc.json", ".eslintrc.js", ".eslintrc.cjs", ".eslintrc.yml", "eslint.config.js", "eslint.config.mjs", "eslint.config.cjs", "eslint.config.ts"])) +
      (/"eslintConfig"/.test(pkgText) ? pkgText : ""),
    biome: await readAll(["biome.json", "biome.jsonc"]),
    scripts,
  };
}

export { coversOf, coversUnproven, heldCovers, readLinterConfigs };
