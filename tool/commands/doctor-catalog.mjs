// tool/commands/doctor-catalog.mjs — что каталог говорит об ЭТОМ репозитории: какие записи
// держит машина, что у проекта уже есть, что пропустила проба, с чего начать, что неприменимо.
//
// Вынесено из doctor.mjs, когда тот дорос до 496 строк при пределе 500 (наш же
// `file-size-limit`). Шов настоящий: прогон гейтов и уровень — про то, что ОБЪЯВЛЕНО и как оно
// отработало; здесь — про каталог против фактов репозитория, и меняется это в другие дни.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CWD, SELF, c } from "../lib/core.mjs";
import { coversOf, coversUnproven } from "../lib/manifest.mjs";
import { readCatalog, browserServerAdvice } from "../lib/repo.mjs";
import { startWith, catalogBuckets, blindAdvice } from "../lib/advice.mjs";
import { proposeGates, readAdoptFiles } from "../lib/adopt.mjs";
import { assessBaseline, DEP_FILES, BASELINE_TOTAL } from "../lib/baseline.mjs";
import { declaredGates } from "../lib/run.mjs";
import { L } from "../i18n/index.mjs";

// Обязательный минимум проекта — прогоном, а не по памяти. До сих пор это было единственное
// место, где комплект просил верить на слово, что человек прочитал методичку и сверился.
async function reportBaseline(man, facts) {
  const { readdir, readFile } = await import("node:fs/promises");
  let files = [];
  try {
    files = (await readdir(CWD, { withFileTypes: true })).map((d) => d.name);
  } catch { /* пустой список честнее выдуманного: ни один пункт не подтвердится */ }

  // Файлы зависимостей читаются целиком и склеиваются: трекер ошибок объявляют по-разному в
  // каждой экосистеме, а искать его надо одинаково.
  let depsText = "";
  for (const f of DEP_FILES) {
    if (!files.some((n) => n.toLowerCase() === f)) continue;
    try { depsText += (await readFile(join(CWD, f), "utf8")).toLowerCase() + "\n"; } catch { /* нечитаемый файл — просто не признак */ }
  }

  const rows = assessBaseline({ files, gateKeys: facts.gateKeys, facts, manifest: man || {}, depsText });
  const okCount = rows.filter((r) => r.ok).length;

  console.log(c.bold(`\n  ${L.baseline.heading}\n`));
  console.log(c.dim(`  ${L.baseline.intro(rows.length, BASELINE_TOTAL)}`));
  console.log(c.dim(`  ${L.baseline.caveat}\n`));
  for (const r of rows) {
    const mark = r.ok ? c.green("✔") : c.yellow("✘");
    const title = L.baseline.titles[r.key] || r.key;
    console.log(`  ${mark}  ${String(r.n).padStart(2)}. ${title}`);
    console.log(c.dim(`        ${r.ok ? L.baseline.by(r.by) : L.baseline.none}`));
  }
  console.log(
    "\n  " + (okCount === rows.length ? c.green(`${okCount}/${rows.length}`) : c.yellow(`${okCount}/${rows.length}`)) +
      c.dim(`  ·  ${L.baseline.eyes(BASELINE_TOTAL - rows.length, "kit/docs/ai/project-baseline.md")}\n`)
  );
}

async function reportCatalog(man, facts, probe = null) {
  const catalog = await readCatalog();
  if (!catalog.length) return;

  // Четвёртая корзина, а не третья: «закрыто другим арбитром» — это НЕ «не поставлено».
  // Пока их считали вместе, вывод каждый прогон называл долгом то, что уже держит biome или
  // ruff. Просьба первого чужого пользователя; она же — наша собственная норма про вывод.
  const { covered, unknownGates } = coversOf(man);
  const { held, todo, skip, byOther } = catalogBuckets(catalog, facts, covered);

  console.log(c.bold(`\n  ${L.doctor.gatesHeading}\n`));
  const marks = ["has_ci", "has_db", "has_docker", "has_tests", "has_deps"]
    .filter((k) => facts[k])
    .map((k) => k.replace("has_", ""));
  console.log(
    c.dim(`  ${L.doctor.langs}: ${[...facts.langs].join(", ") || L.doctor.langsUnknown} · ${L.doctor.files}: ${facts.files}` +
      (marks.length ? ` · ${L.doctor.hasThings}: ${marks.join(", ")}` : "") + "\n")
  );

  for (const rec of held) console.log(`  ${c.green("✔")}  ${rec.slug.padEnd(22)} ${c.dim(rec.intent || "")}`);
  // ЧТО У ВАС УЖЕ ЕСТЬ — до итога и до списка крестов. Комплект, поставленный в проект с
  // eslint, mocha и конвейером, показывал двадцать крестов и «держит машина 0»: мы считали
  // только СВОИ записи, а чужие проверки не читали вовсе. С точки зрения владельца это
  // неправда, и первое, что он видел, было обвинением. Предлагаем, а не вписываем: гейт в
  // чужом манифесте без спроса — наше решение в чужом файле.
  if (!declaredGates(man).length) {
    const found = proposeGates(await readAdoptFiles(CWD));
    if (found.length) {
      console.log(`\n  ${c.bold(L.doctor.haveAlready(found.length))}`);
      for (const g of found) {
        console.log(`  ${c.green("✔")}  ${g.name.padEnd(12)} ${c.dim(`${g.cmd}   ← ${g.source}`)}`);
      }
      console.log(c.dim(`     ${L.doctor.haveAlreadyHow(found.map((g) => `${g.name}: "${g.cmd}"`).join("  "))}`));
    }
  }

  // ЧТО ВАШИ ПРОВЕРКИ ПРОПУСТИЛИ. Проба знала имена непойманных классов и писала в отметку одно
  // число; человек в `doctor` не видел ничего. Это самое конкретное, что мы знаем о проекте, —
  // не «хорошая практика», а брак, подсаженный в ЕГО файл и ЕГО проверками не замеченный, —
  // поэтому стоит выше списка «с чего начать». Читается из файла: ничего не запускает.
  const blindOnes = (probe?.classes || []).map((b) => [b, catalog.find((r) => r.slug === b.slug)]).filter(([, r]) => r);
  if (blindOnes.length) {
    console.log(`\n  ${c.yellow("⚠")}  ${c.bold(L.doctor.blindHeading(probe.behind))}`);
    for (const [b, rec] of blindOnes) {
      // Три случая, и сливать их нельзя. Гейт стоял и проба его ГОНЯЛА — «стоит, но здесь не
      // ловит», самое ценное. Гейт объявлен, но проба его не гоняла (поставлен позже или
      // медленный) — «поймает ли, покажет следующая», а не «пойман». Гейта нет — совет.
      const ranIt = probe.ran?.has(rec.slug);
      const now = facts.gateKeys.includes(rec.slug);
      console.log(`  ${now && !ranIt ? c.dim("~") : c.red("✘")}  ${rec.slug.padEnd(22)} ${c.dim(`${rec.intent || ""}  ← ${b.file}`)}`);
      if (ranIt) { console.log(c.dim(`     ${L.doctor.blindRan(rec.slug)}`)); continue; }
      if (now) { console.log(c.dim(`     ${L.doctor.blindInstalled}`)); continue; }
      const adv = blindAdvice(rec, facts, {});
      if (adv.command) console.log(c.dim(`     ${L.doctor.startCmd(adv.command)}`));
      else console.log(c.dim(`     ${L.doctor.install(`${SELF} add ${rec.slug}`)}`));
    }
    console.log(c.dim(`     ${L.doctor.blindMore(`${SELF} probe`)}`));
  } else if (probe?.state === "never" && declaredGates(man).length) {
    console.log(c.dim(`\n  ${L.doctor.probeNever(`${SELF} probe`)}`));
  }

  // С ЧЕГО НАЧАТЬ. Двадцать одинаковых крестов — это ноль требований: закрывают первое
  // попавшееся или не закрывают ничего. Порядок не по нашему вкусу: сперва то, что родилось из
  // настоящего отказа И закрывается одной готовой командой.
  const first = todo.length > 3 ? startWith(todo, facts, 3) : [];
  if (first.length) {
    console.log(`\n  ${c.bold(L.doctor.startWith)}`);
    for (const rec of first) {
      const adv = blindAdvice(rec, facts, {});
      console.log(`  ${c.yellow("→")}  ${rec.slug.padEnd(22)} ${c.dim(rec.intent || "")}`);
      if (adv.command) console.log(c.dim(`     ${L.doctor.startCmd(adv.command)}`));
      if (adv.tool) console.log(c.dim(`     ${L.doctor.startTool(adv.tool)}`));
    }
    // Одна проверка руками — это разовый героизм. Сказать про хук здесь, а не в конце: человек
    // читает первые строки и закрывает, а именно сейчас у него в руках список того, что стоит
    // повесить перед пушем.
    console.log(c.dim(`\n     ${L.doctor.startHook}`));
  }

  // ОСТАЛЬНОЕ — ПОСЛЕ ГЛАВНОГО И СЖАТО. Список шёл первым, по две строки на запись (вторая —
  // «поставить: aqk add …»), и на requests главное начиналось со строки 84 из 102: человек
  // читает сверху и закрывает раньше. Разбор соседа 2026-09-11 (research/competitors/agentlint.md):
  // там первыми идут пять главных исправлений. Записи не теряются — теряется повтор подсказки.
  const rest = todo.filter((r) => !first.includes(r));
  if (rest.length) {
    if (first.length) console.log(`\n  ${c.bold(L.doctor.todoRest(rest.length))}`);
    else console.log("");
    // ○, а не ✘: запись не установлена — это не падение. Крест в зелёном прогоне глаз читает
    // как провал, и через неделю человек перестаёт смотреть на красное вообще (отзыв с живого
    // проекта 2026-09-11). ✘ остаётся за тем, что упало или пропустило брак.
    for (const rec of rest) console.log(`  ${c.dim("○")}  ${rec.slug.padEnd(22)} ${rec.intent || ""}`);
    console.log(c.dim(`     ${L.doctor.todoRestHow(SELF)}`));
  }

  // Второстепенное — в конце: что закрыто чужим арбитром, что неприменимо, советы без вердикта.
  if (byOther.length) {
    console.log(c.dim(`\n  ${L.doctor.coveredBy(byOther.length)}`));
    for (const [rec, gate] of byOther) console.log(c.dim(`  ~  ${rec.slug.padEnd(22)} ${L.doctor.coveredByGate(gate)}`));
  }
  // Гейт, которого нет в gates:, не закрывает ничего — и молчать об этом нельзя: человек
  // считает запись закрытой, а её не держит никто. Называется поимённо, жёлтым.
  if (unknownGates.length) {
    console.log(c.yellow(`\n  ${L.doctor.coversUnknown(unknownGates.join(", "))}`));
  }
  // Заявка «эту запись держит наш линтер» сверяется с кодами правил из рецепта записи.
  // Замерено на живом ruff.toml: девятнадцать групп правил, а print() не ловится — и заявка
  // сняла бы запись с долга, не закрыв её ничем.
  // Конфиги — ПО ЛИНТЕРАМ, а не одной склейкой: заявка сверяется правилами того линтера,
  // которым закрыт гейт (отзыв с живого проекта 2026-09-11 — коды ruff искались в biome.json).
  const readAll = async (names) => {
    let t = "";
    for (const f of names) { try { t += await readFile(join(CWD, f), "utf8") + "\n"; } catch { /* нет файла */ } }
    return t;
  };
  let scripts = {}, pkgText = "";
  try { pkgText = await readFile(join(CWD, "package.json"), "utf8"); scripts = JSON.parse(pkgText)?.scripts || {}; } catch { /* нет или не JSON */ }
  const configs = {
    // ruff.toml и .ruff.toml — конфиг ruff целиком, слово «ruff» в них писать незачем (поймал наш же
    // smoke: `extend-select = [..., "T20"]` выбрасывался). pyproject.toml — только если в нём есть
    // раздел ruff: он есть почти у каждого python-проекта и без ruff.
    ruff: (await readAll(["ruff.toml", ".ruff.toml"])) +
      ((await readAll(["pyproject.toml"])).match(/^\[tool\.ruff[\s\S]*/m)?.[0] || ""),
    eslint: (await readAll([".eslintrc", ".eslintrc.json", ".eslintrc.js", ".eslintrc.cjs", ".eslintrc.yml", "eslint.config.js", "eslint.config.mjs", "eslint.config.cjs", "eslint.config.ts"])) +
      (/"eslintConfig"/.test(pkgText) ? pkgText : ""),
    biome: await readAll(["biome.json", "biome.jsonc"]),
    scripts,
  };
  for (const u of coversUnproven(man, catalog, configs)) {
    if (u.kind === "unproven") {
      console.log(c.yellow(`\n  ${L.doctor.coversUnproven(u.entry, u.gate, u.codes.join(", "))}`));
      console.log(c.dim(`  ${L.doctor.coversUnprovenHow(`${SELF} add ${u.entry}`)}`));
    } else if (u.kind === "impossible") {
      console.log(c.yellow(`\n  ${L.doctor.coversImpossible(u.entry, u.gate, u.linter)}`));
      console.log(c.dim(`  ${L.doctor.coversUnprovenHow(`${SELF} add ${u.entry}`)}`));
    } else {
      console.log(c.dim(`\n  ${L.doctor.coversCantCheck(u.entry, u.gate)}`));
    }
  }
  // Не вердикт, а совет: отсутствие браузерного сервера — незанятая возможность, а не дефект.
  // Поэтому строка тусклая и без значка, и её нет у проекта без интерфейса.
  let mcpText = "";
  for (const f of [".mcp.json", ".cursor/mcp.json", ".vscode/mcp.json", ".claude/mcp.json"]) {
    try { mcpText += await readFile(join(CWD, f), "utf8"); } catch { /* нет файла — нечего читать */ }
  }
  const browser = browserServerAdvice(facts, mcpText);
  if (browser) {
    console.log(c.dim(`\n  ${L.doctor.noBrowserServer}`));
    console.log(c.dim(`  ${L.doctor.noBrowserServerHow(browser.servers.join("  ·  "))}`));
  }
  if (skip.length) {
    console.log(c.dim(`\n  ${L.doctor.notApplicable(skip.length)}`));
    for (const [rec, why] of skip) console.log(c.dim(`  ·  ${rec.slug.padEnd(22)} ${why}`));
  }
  console.log(
    `\n  ${c.bold(L.doctor.total)} ${L.doctor.totalHeld(held.length)}, ${L.doctor.totalTodo(c.yellow(todo.length))}, ` +
      (byOther.length ? `${L.doctor.totalCovered(byOther.length)}, ` : "") +
      c.dim(L.doctor.totalSkip(skip.length)) + "\n"
  );
  // Числа отдаются наружу, а не пересчитываются второй раз: два счёта одного и того же
  // расходятся ровно так же, как два списка команд.
  return { held: held.length, todo: todo.length, todoRecs: todo };
}

export { reportBaseline, reportCatalog };
