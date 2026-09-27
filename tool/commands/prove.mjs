// tool/commands/prove.mjs — `aqk prove`: доказать, что гейты проекта ловят брак.
//
// Отдельная команда, а не флаг: вопрос «работают ли мои проверки» задают сам по себе, и ответ
// на него нужен раньше, чем прогон по коду. Прогон говорит «сегодня чисто»; доказательство —
// «а если бы было грязно, я бы это увидел».
import { readManifest } from "../lib/manifest.mjs";
import { proveGates } from "../lib/prove.mjs";
import { c, SELF } from "../lib/core.mjs";
import { L } from "../i18n/index.mjs";

function line(r) {
  const P = L.prove;
  const pad = r.name.padEnd(22);
  if (r.state === "proven") return `  ${c.green("✔")}  ${pad} ${c.dim(P.okRed)}`;
  if (r.state === "unprovable") {
    const why =
      r.why === "no-samples" ? P.noSamples
      : r.why === "other-recipe" ? P.otherRecipe(r.forRecipe.lang)
      : r.why === "no-target" ? P.noTarget
      : r.why === "baseline-red" ? P.baselineRed
      : r.why === "planted-skipped" ? P.plantedSkipped(`${SELF} prove`)
      : r.why === "needs-program" ? P.needsProgram(r.missing.join(", "))
      : P.empty;
    // Сбой самой проверки — не «законно нечем доказать»: он отнимает ступень, и печатать его тусклой
    // тильдой с подписью «команда пустая», как было до 2026-09-27, значит соврать дважды.
    if (r.why === "infra") return `  ${c.yellow("?")}  ${pad} ${c.yellow(P.infra(r.reason || ""))}`;
    return `  ${c.dim("~")}  ${c.dim(pad)} ${c.dim(why)}`;
  }
  const why = r.why === "red-passed" ? P.redPassed : r.why === "green-failed" ? P.greenFailed : P.empty;
  return `  ${c.red("✘")}  ${pad} ${c.red(why)}`;
}

async function cmdProve() {
  const man = await readManifest();
  const P = L.prove;
  console.log(c.bold(`\n${P.title}\n`));

  // «Манифеста нет» и «гейтов не объявлено» — разные причины и разные починки. Остальные
  // команды это различают; здесь не различалось. Найдено код-ревью 2026-09-07.
  if (!man) {
    console.log(`  ${c.red(L.ratchet.noManifest(`${SELF} init`))}\n`);
    process.exit(1);
  }
  const gates = man?.gates && typeof man.gates === "object" && !Array.isArray(man.gates) ? man.gates : {};
  if (!Object.keys(gates).length) {
    console.log(`  ${P.noGates}\n`);
    process.exit(1);
  }
  if (!String(man?.samples || "").trim() && !String(man?.own_samples || "").trim()) {
    console.log(`  ${c.red(P.noSamplesDir)}\n`);
    process.exit(1);
  }

  const res = await proveGates(man, { planted: true });
  // Сначала сломанные: красное называется первым, иначе его не читают.
  // СЛОМАННЫЙ — С ПРИЧИНОЙ. «Покраснел на зелёном» без вывода гейта отправляет гадать: в
  // конвейере 2026-09-27 так краснел `dead-code` в образе и зеленел везде, где его можно было
  // рассмотреть. Хвост вывода того прогона, который и решил вердикт, — сразу под строкой.
  // Хвост — у каждого вердикта, который надо объяснять: сломан, не смогли, красная без подсадки.
  const tailOf = (r) => r.why === "green-failed" ? r.green
    : r.why === "red-passed" ? r.red
    : r.why === "baseline-red" ? r.red
    : r.why === "infra" ? (r.side === "green" ? r.green : r.red)
    : null;
  const printTail = (r) => {
    const tailLines = String(tailOf(r)?.out || "").trim().split("\n").slice(-6);
    if (tailLines.length && tailLines[0]) console.log(c.dim(tailLines.map((l) => `       │ ${l}`).join("\n")));
  };
  for (const r of res.results.filter((x) => x.state === "broken")) {
    console.log(line(r));
    printTail(r);
  }
  for (const r of res.results.filter((x) => x.state === "proven")) console.log(line(r));
  for (const r of res.results.filter((x) => x.state === "unprovable")) {
    console.log(line(r));
    if (r.why === "infra" || r.why === "baseline-red") printTail(r);
  }

  const parts = [c.green(P.proven(res.proven))];
  if (res.broken) parts.push(c.red(P.broken(res.broken)));
  if (res.unprovable) parts.push(c.dim(P.unprovable(res.unprovable)));
  console.log(`\n  ${parts.join("  ")}`);

  if (!res.ok && res.proven === 0 && res.broken === 0) {
    console.log(`\n  ${c.yellow(P.nothingProven)}`);
    console.log(`  ${c.dim(P.fix(`${SELF} add ${L.help.name}`))}`);
  }
  console.log("");
  process.exit(res.ok ? 0 : 1);
}

export { cmdProve };
