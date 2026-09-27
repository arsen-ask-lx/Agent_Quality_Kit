// tool/commands/adopt.mjs — `aqk adopt <гейт>`: договор установки инструмента.
//
// ЗАЧЕМ. «Поставил» и «работает» — разные утверждения, и между ними лежит ровно то, против чего
// написан весь комплект. Владелец 2026-09-27: «человек если ставил, то не факт, что у него всё
// заработало — мы ещё должны настроить инструмент, сделать красные тесты и проверить его». В тот же
// день замер: Stryker по умолчанию не роняет сборку никогда (`thresholds.break: null`), и у 96 из
// 149 настоящих файлов его настроек на GitHub порога нет. Инструмент стоит, отчёт рисуется,
// защиты ноль.
//
// ДОГОВОР ОДИН НА ЛЮБОЙ ИНСТРУМЕНТ. Машина не обязана знать программу, чтобы проверить главное:
// гейт объявлен, у него есть красный и зелёный образцы, на красном он краснеет, на зелёном молчит
// (`prove` — подстановкой каталога или подсадкой в копию проекта), и конвейер его гоняет.
// Покраснеть на подсаженном браке — лучшее доказательство «настроен так, что умеет провалиться»,
// какое вообще бывает: правило про настройку можно обойти, подсадку — нет.
//
// ЧЕГО МАШИНА НЕ ПРОВЕРЯЕТ, то и не засчитывается: «прочитал официальную документацию» — шаг для
// агента, напечатанный отдельно и без галочки. Засчитать его значило бы поверить на слово.
//
// Код возврата: 0 — все проверяемые шаги пройдены; 1 — нет.
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { readManifest } from "../lib/manifest.mjs";
import { proveGates } from "../lib/prove.mjs";
import { CWD, SELF, c, exists } from "../lib/core.mjs";
import { L } from "../i18n/index.mjs";
import { portableSelf } from "./context.mjs";

// Тексты конвейера — те же места, что смотрит запись `gates-run-in-ci`, и то же правило: либо
// `doctor --run` (гонит всё объявленное), либо команда гейта названа в конфиге. Правило живёт в
// двух местах — там оболочкой, здесь в Node, — поэтому здесь оно повторено дословно, без
// «улучшений»: разойдясь, две копии дали бы два разных ответа на один вопрос.
async function ciTexts() {
  const out = [];
  const add = async (p) => { try { out.push(await readFile(p, "utf8")); } catch { /* нет файла */ } };
  const walk = async (d) => {
    if (!(await exists(d))) return;
    for (const e of await readdir(d, { withFileTypes: true })) {
      if (e.isDirectory()) await walk(join(d, e.name));
      else await add(join(d, e.name));
    }
  };
  await walk(join(CWD, ".github", "workflows"));
  await walk(join(CWD, ".circleci"));
  await add(join(CWD, ".gitlab-ci.yml"));
  await add(join(CWD, "Jenkinsfile"));
  return out;
}

function ciRuns(texts, cmd) {
  if (!texts.length) return "none";
  const all = texts.join("\n");
  if (/doctor\s+--run|--run\s+.*doctor/.test(all)) return "all";
  const key = cmd.split(/\s+/).find((w) => w.includes("/")) || cmd;
  return all.includes(key) ? "named" : "missing";
}

async function cmdAdopt(args = []) {
  const T = L.adopt;
  const name = args.find((a) => !a.startsWith("-"));
  if (!name) {
    console.log(`\n  ${T.usage(`${SELF} adopt`)}\n`);
    process.exit(1);
  }
  const man = await readManifest();
  const gates = man?.gates && typeof man.gates === "object" && !Array.isArray(man.gates) ? man.gates : {};
  const cmd = String(gates[name] || "").trim();

  console.log(c.bold(`\n  ${T.title(name)}\n`));
  const rows = [];
  const step = (ok, text, fix = "") => rows.push({ ok, text, fix });

  // 1. Объявлен. Без этого остальное не с чем сверять — дальше не идём.
  if (!cmd) {
    step(false, T.notDeclared, T.declareFix(name));
    print(rows);
    process.exit(1);
  }
  step(true, T.declared(cmd));

  // 2. Образцы. Путь называется целиком: агент кладёт файлы туда, куда сказано, а не угадывает.
  const samplesDir = typeof man?.samples === "string" ? man.samples.trim() : "";
  const red = samplesDir ? join(samplesDir, name, "red") : "";
  const green = samplesDir ? join(samplesDir, name, "green") : "";
  const haveSamples = Boolean(samplesDir) && (await exists(join(CWD, red))) && (await exists(join(CWD, green)));
  step(haveSamples, haveSamples ? T.samples(red, green) : T.noSamples,
    haveSamples ? "" : samplesDir ? T.samplesFix(red.replace(/\\/g, "/"), green.replace(/\\/g, "/")) : T.samplesDirFix);

  // 3. Доказан. Самый дорогой шаг и самый важный: только он отличает настоящую проверку от
  // `exit 0`. Без образцов доказывать нечем — это не «доказан», а тот же провал шага 2.
  if (haveSamples) {
    const { results } = await proveGates(man, { only: name });
    const r = results[0] || {};
    const P = L.prove;
    const why = r.state === "proven" ? P.okRed
      : r.why === "red-passed" ? P.redPassed
      : r.why === "green-failed" ? P.greenFailed
      : r.why === "baseline-red" ? P.baselineRed
      : r.why === "needs-program" ? P.needsProgram((r.missing || []).join(", "))
      : r.why === "other-recipe" ? P.otherRecipe(r.forRecipe?.lang)
      : r.why === "no-target" ? P.noTarget
      : r.why === "infra" ? T.infra(r.reason || "")
      : P.empty;
    step(r.state === "proven", T.proven(why), r.state === "proven" ? "" : T.provenFix(`${SELF} prove`));
  } else {
    step(false, T.provenNeedsSamples);
  }

  // 4. Конвейер. Гейт, который гоняет только человек, работает до первого «забыл».
  const ci = ciRuns(await ciTexts(), cmd);
  step(ci === "all" || ci === "named",
    ci === "all" ? T.ciAll : ci === "named" ? T.ciNamed : ci === "none" ? T.ciNone : T.ciMissing,
    ci === "all" || ci === "named" ? "" : T.ciFix(`${portableSelf()} doctor --run`));

  print(rows);
  // 5. Документация — шаг для агента, без галочки: его не проверить машиной.
  console.log(`  ${c.yellow("→")}  ${T.docs}`);
  const ok = rows.every((r) => r.ok);
  console.log(ok ? c.green(`\n  ${T.done}\n`) : c.red(`\n  ${T.notDone(rows.filter((r) => !r.ok).length)}\n`));
  process.exit(ok ? 0 : 1);
}

function print(rows) {
  for (const r of rows) {
    console.log(`  ${r.ok ? c.green("✔") : c.red("✘")}  ${r.text}`);
    if (r.fix) console.log(c.dim(`     ${r.fix}`));
  }
}

export { cmdAdopt, ciRuns };
