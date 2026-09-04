// tool/commands/gates.mjs — работа с гейтами: поставить из каталога, завести свой, накинуть
// храповик, свериться по намерению.

import { mkdir, copyFile, writeFile, readFile, readdir } from "node:fs/promises";
import { join, dirname, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  CWD, PKG_ROOT, GATES_SRC, PROJECT_GATES, RATCHET_DIR, RATCHET_LIB, MANIFEST, SELF, c, exists, die,
  copyDir,
} from "../lib/core.mjs";
import { parseManifest, readManifest, manifestWithGate } from "../lib/manifest.mjs";
import {
  detectFacts, readCatalog, pickRecipe, triggerVerdict, stems, overlap, matchCatalog,
} from "../lib/repo.mjs";
import { GATE_YML_TEMPLATE, CHECK_SH_TEMPLATE, README_TEMPLATE } from "../lib/templates.mjs";
import { L } from "../i18n/index.mjs";

// Ставит гейт из каталога в проект. Проверка КОПИРУЕТСЯ в репозиторий, а не остаётся
// ссылкой в пакет: при установке через npx пакет временный, и завтра команда в манифесте
// указывала бы в никуда — тот самый класс «гейт объявлен, но не запускается».

// Установка одной записи в проект: копия проверки, общий список исключений, строка в манифест.
// Отдельно от печати — той же работой пользуется `start`, ставящий сторожей дня 0 пачкой.
// Скопированная в третий раз, эта работа однажды разъехалась бы: копия гейта без _skip.sh
// читает окружение и выдаёт тысячу чужих нарушений.
async function installGate(slug, man, facts) {
  const src = join(GATES_SRC, slug);
  if (!(await exists(src))) die(L.add.noSuchGate(slug, `${SELF} doctor`));

  const rec = { slug, ...parseManifest(await readFile(join(src, "gate.yml"), "utf8")) };
  const dst = join(CWD, PROJECT_GATES, slug);
  await mkdir(dst, { recursive: true });
  const copied = await copyDir(src, dst, { force: false });

  // Общий список исключений едет вместе с проверкой: без него она читает окружение и
  // зависимости, и человек получает тысячу чужих нарушений вместо сотни своих.
  const skipSrc = join(GATES_SRC, "_skip.sh");
  if (await exists(skipSrc)) await copyFile(skipSrc, join(CWD, PROJECT_GATES, "_skip.sh"));

  // Команда под стек проекта, с путями внутри репозитория, а не внутри пакета.
  const cmd = String(pickRecipe(rec, facts) || "")
    .replace(/\{gate\}/g, `${PROJECT_GATES}/${slug}`)
    .replace(/\{dir\}/g, ".");
  if (!cmd) die(L.add.noRecipe(slug, [...facts.langs].join("/") || L.add.thisStack));

  const manPath = join(CWD, MANIFEST);
  const { text, why } = manifestWithGate(await readFile(manPath, "utf8"), slug, cmd);
  if (text) await writeFile(manPath, text, "utf8");
  return { rec, cmd, copied, declared: Boolean(text), why };
}

async function cmdAdd(args) {
  const slug = args.find((a) => !a.startsWith("-"));
  if (!slug) die(L.add.needName(`${SELF} add ${L.help.name}`, `${SELF} doctor`));

  const man = await readManifest();
  if (!man) die(L.add.noManifest(`${SELF} init`));
  const facts = await detectFacts(man);

  const src = join(GATES_SRC, slug);
  if (!(await exists(src))) die(L.add.noSuchGate(slug, `${SELF} doctor`));
  const probe = { slug, ...parseManifest(await readFile(join(src, "gate.yml"), "utf8")) };
  const verdict = triggerVerdict(probe, facts);
  if (!verdict.applies) {
    console.log(c.yellow(`\n  ${L.add.notApplicable(verdict.why)}`));
    console.log(c.dim(`  ${L.add.installAnyway}\n`));
  }

  const { cmd, copied, declared, why } = await installGate(slug, man, facts);

  console.log(c.bold(`\naqk add ${slug}\n`));
  console.log(`  ${c.green("✔")}  ${PROJECT_GATES}/${slug}/  ${c.dim(L.add.copied(copied.length))}`);
  if (declared) {
    console.log(`  ${c.green("✔")}  .aqk.yml       ${c.dim(L.add.declared(cmd))}`);
  } else {
    console.log(`  ${c.yellow("!")}  .aqk.yml       ${c.dim(L.add.notDeclared(why, slug, cmd))}`);
  }

  console.log(`
${c.bold(L.add.nextTitle)}

  1. ${L.add.next1}
     ${c.bold(`${cmd.replace(/ \.$/, ` ${PROJECT_GATES}/${slug}/red`)}`)}   ${c.dim(L.add.expectFail)}
     ${c.bold(`${cmd.replace(/ \.$/, ` ${PROJECT_GATES}/${slug}/green`)}`)} ${c.dim(L.add.expectSilence)}
  2. ${L.add.next2} ${c.dim(L.add.next2Why)}
  3. ${L.add.next3(c.bold(`${SELF} doctor --run`))}
`);
}

// Заготовка записи каталога. Поля намеренно оставлены незаполненными и в таком виде
// НЕ ПРОХОДЯТ проверку: пустая заготовка, принятая как запись, — это тот же мёртвый гейт.
// Сначала сверка по намерению: чаще всего нужного гейта не хватает не в каталоге, а в проекте.

async function cmdNew(args) {
  const slug = args.find((a) => !a.startsWith("-"));
  if (!slug) die(L.gnew.needName(`${SELF} new no-print-in-prod`));
  if (!/^[a-z][a-z0-9-]{2,}$/.test(slug)) {
    die(L.gnew.badName(slug));
  }

  // Сначала сверка: новая запись нужна реже, чем кажется. Порог берётся по совпадению с
  // намерением, а не с пояснением: пояснение у всех записей похоже.
  const words = slug.replace(/-/g, " ") + " " + args.filter((a) => !a.startsWith("-")).slice(1).join(" ");
  for (const { rec, hits, headScore } of await matchCatalog(words)) {
    if (hits >= 2 && headScore >= 0.5 && !args.includes("--force")) {
      console.log(c.yellow(`\n  ${L.gnew.looksExisting(c.bold(rec.slug))}`));
      console.log(`  ${rec.intent || ""}\n`);
      console.log(c.dim(`  ${L.gnew.recipeNotGate}`));
      console.log(c.dim(`  ${L.gnew.forceHint(`${SELF} new ${slug} --force`)}\n`));
      process.exit(1);
    }
  }

  // Где заводить заготовку. Проверка «существует ли каталог комплекта» была неверной: он
  // существует всегда — это каталог самого пакета. Из чужого проекта заготовка уезжала внутрь
  // пакета, а через npx пакет лежит во временной папке и исчезает вместе с ней: работа сделана,
  // результата нет. Признак один — работаем ли мы над самим комплектом.
  const inKit = resolve(CWD) === resolve(PKG_ROOT);
  const dst = inKit ? join(GATES_SRC, slug) : join(CWD, PROJECT_GATES, slug);
  if (await exists(dst)) die(L.gnew.exists(relative(CWD, dst)));

  await mkdir(join(dst, "red"), { recursive: true });
  await mkdir(join(dst, "green"), { recursive: true });
  await writeFile(join(dst, "gate.yml"), GATE_YML_TEMPLATE(slug), "utf8");
  await writeFile(join(dst, "check.sh"), CHECK_SH_TEMPLATE, "utf8");
  await writeFile(join(dst, "README.md"), README_TEMPLATE(slug), "utf8");
  await writeFile(join(dst, "red", ".keep"), "", "utf8");
  await writeFile(join(dst, "green", ".keep"), "", "utf8");

  // check.sh шаблона зовёт skip_grep/own_samples_filter из _skip.sh — тем же путём, каким его
  // зовут установленные записи каталога. В самом комплекте оригинал уже лежит на месте (../),
  // в чужом проекте его никто не клал, пока не было ни одной установленной записи через `add`.
  if (!inKit) {
    const skipSrc = join(GATES_SRC, "_skip.sh");
    if (await exists(skipSrc)) await copyFile(skipSrc, join(CWD, PROJECT_GATES, "_skip.sh"));
  }

  console.log(c.bold(`\naqk new ${slug}\n`));
  console.log(`  ${c.green("✔")}  ${relative(CWD, dst)}/  ${c.dim("gate.yml · check.sh · red/ · green/ · README.md")}`);
  console.log(`
${c.bold(L.gnew.nextTitle)}

  1. ${c.bold(L.gnew.n1)} ${L.gnew.n1Where}
     ${c.dim(L.gnew.n1Why)}
  2. ${c.bold(L.gnew.n2)} ${c.bold("red/")} ${L.gnew.n2Red}
     ${c.bold("green/")} ${L.gnew.n2Green}
     ${c.dim(L.gnew.n2Why)}
  3. ${c.bold(L.gnew.n3)} ${L.gnew.n3Where}
  4. ${c.bold(L.gnew.n4)} ${L.gnew.n4What}
  5. ${c.bold(L.gnew.n5)} bash tool/selfcheck/gates.sh
     ${c.dim(L.gnew.n5Why)}
`);
}

// Ставит храповик поверх уже объявленного гейта: снимает список текущих нарушений в реестр
// и заворачивает команду в обёртку, которая пускает старое и не пускает новое.
//
// Без этого правило нельзя ввести в живой проект: гейт покраснеет на всём старом коде,
// его выключат, и правило не будет действовать вовсе.

async function cmdRatchet(args) {
  const slug = args.find((a) => !a.startsWith("-"));
  if (!slug) die(L.ratchet.needName(`${SELF} ratchet ${L.help.name}`));

  const manPath = join(CWD, MANIFEST);
  if (!(await exists(manPath))) die(L.ratchet.noManifest(`${SELF} init`));
  let text = await readFile(manPath, "utf8");

  const line = text.split("\n").find((l) => new RegExp(`^\\s+${slug}:`).test(l));
  if (!line) die(L.ratchet.notDeclared(slug, `${SELF} add ${slug}`));

  const cmd = line.replace(/^\s*[^:]+:\s*/, "").replace(/^"|"$/g, "");
  const inKit = resolve(CWD) === resolve(PKG_ROOT);
  const lib = inKit ? "kit/ratchet/ratchet.sh" : RATCHET_LIB;

  // «Обёртка объявлена» и «долг снят» — разные состояния. Если реестра на диске нет, гейт
  // краснеет на всём подряд, а команда отказывалась помочь словами «храповик уже стоит».
  // Тогда снимаем снимок заново по внутренней команде, а строку манифеста не трогаем.
  const reg = join(CWD, RATCHET_DIR, `${slug}.txt`);
  const wrapped0 = cmd.includes("ratchet.sh");
  if (wrapped0 && (await exists(reg))) die(L.ratchet.already(slug));
  const prefix = `bash ${lib} ${RATCHET_DIR}/${slug}.txt `;
  const inner = wrapped0 && cmd.startsWith(prefix) ? cmd.slice(prefix.length) : cmd;

  // Обёртка копируется в репозиторий: ссылка на пакет завтра указывала бы в никуда. Исключение —
  // сам комплект: здесь оригинал уже лежит рядом, и копия завтра разошлась бы с ним. Ровно то
  // правило, по которому здесь не копируются и гейты.
  if (!inKit) {
    await mkdir(dirname(join(CWD, lib)), { recursive: true });
    await copyFile(join(PKG_ROOT, "kit", "ratchet", "ratchet.sh"), join(CWD, lib));
  }

  // Снимок текущих нарушений — это и есть долг. Ключ без номера строки: правка соседней
  // строки не должна читаться как новое нарушение.
  const r = spawnSync(inner, { shell: true, cwd: CWD, encoding: "utf8", timeout: 300000 });
  if (r.status === 127 || (r.error && r.error.code === "ENOENT")) {
    die(L.ratchet.notRunnable(slug, inner));
  }
  const keys = [...new Set(
    `${r.stdout || ""}${r.stderr || ""}`
      .split("\n")
      .filter((l) => l && !/^\s/.test(l) && l.includes(":"))
      .map((l) => l.replace(/:\d+:/, ":"))
  )].sort();

  await mkdir(join(CWD, RATCHET_DIR), { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  await writeFile(
    reg,
    L.ratchet.registryHead(slug, stamp) + keys.join("\n") + (keys.length ? "\n" : ""),
    "utf8"
  );

  if (!wrapped0) {
    text = text.replace(line, `  ${slug}: "${prefix}${cmd}"`);
    text = text.replace(/^ratchets:\s*""\s*$/m, `ratchets: ${RATCHET_DIR}`);
    await writeFile(manPath, text, "utf8");
  }

  console.log(c.bold(`\naqk ratchet ${slug}\n`));
  console.log(`  ${c.green("✔")}  ${RATCHET_DIR}/${slug}.txt  ${c.dim(L.ratchet.recorded(keys.length))}`);
  if (!inKit) console.log(`  ${c.green("✔")}  ${lib}  ${c.dim(L.ratchet.libCopied)}`);
  console.log(`  ${c.green("✔")}  .aqk.yml  ${c.dim(L.ratchet.wrapped)}`);
  console.log(`
${c.bold(L.ratchet.changesTitle)}

  ${L.ratchet.changes1(c.bold(L.ratchet.fromToday))}
  ${L.ratchet.changes2}

  ${c.dim(L.ratchet.test1)}
  ${c.dim(L.ratchet.test2)}

  ${L.ratchet.run(c.bold(`${SELF} doctor --run`))}
`);
}

// «Есть ли у вас уже такое?» — вопрос, без которого обмен знанием превращается в свалку.
// Сверка идёт ПО НАМЕРЕНИЮ, а не по тексту команды: «печать не доезжает до прода» — одно
// намерение, а ruff, eslint и свой поиск — три исполнителя. Принёс рецепт под новый язык —
// это строка в существующей записи, а не новая запись.
//
// Сравниваем огрублённо: русский язык склоняется, и «печать / печати / печатью» обязаны
// совпасть. Берём начало слова — грубо, зато без словарей и без единой зависимости.

async function cmdFind(args) {
  const query = args.filter((a) => !a.startsWith("-")).join(" ").trim();
  if (!query) die(L.find.needQuery(`${SELF} ${L.find.example}`));

  const q = stems(query);
  const scored = (await matchCatalog(query)).map((m) => [m.score, m.rec]);

  // шишки в журнале: записана, но гейта из неё может не быть
  const journal = [];
  const jPath = join(PKG_ROOT, "incidents", "README.md");
  if (await exists(jPath)) {
    const text = await readFile(jPath, "utf8");
    for (const m of text.matchAll(/^## (20\d\d-\d\d-\d\d)\s+—\s+(.+)$/gm)) {
      const score = overlap(q, stems(m[2]));
      if (score >= 0.34) journal.push([score, m[1], m[2].trim()]);
    }
    journal.sort((a, b) => b[0] - a[0]);
  }

  console.log(c.bold(`\naqk find «${query}»\n`));

  const same = scored.filter(([sc]) => sc >= 0.6);
  const near = scored.filter(([sc]) => sc >= 0.3 && sc < 0.6);

  if (same.length) {
    console.log(c.green(`  ${L.find.exists}\n`));
    for (const [sc, rec] of same.slice(0, 3)) {
      console.log(`  ${c.bold(rec.slug)}  ${c.dim(L.find.match(Math.round(sc * 100)))}`);
      console.log(`      ${rec.intent || ""}`);
      const langs = Object.keys(rec.recipes || {}).filter((k) => k !== "any");
      console.log(c.dim(`      ${L.find.recipes(langs.length ? langs.join(", ") + ", " : "")}`));
    }
    console.log(c.dim(`\n  ${L.find.existsWhy1}`));
    console.log(c.dim(`  ${L.find.existsWhy2}\n`));
  } else if (near.length) {
    console.log(c.yellow(`  ${L.find.near}\n`));
    for (const [sc, rec] of near.slice(0, 4)) {
      console.log(`  ${c.bold(rec.slug)}  ${c.dim(`${Math.round(sc * 100)}%`)}  ${rec.intent || ""}`);
    }
    console.log(c.dim(`\n  ${L.find.nearWhy}\n`));
  } else {
    console.log(c.yellow(`  ${L.find.none}\n`));
  }

  if (journal.length) {
    console.log(c.bold(`  ${L.find.journal}\n`));
    for (const [, date, title] of journal.slice(0, 3)) console.log(`  ${c.dim(date)}  ${title}`);
    console.log(c.dim(`\n  ${L.find.journalWhy}\n`));
  }

  if (!same.length) {
    console.log(`${c.bold(L.find.howTitle)}

  1. ${c.bold(L.find.how1)} ${L.find.how1What}
     ${c.dim(L.find.how1Why)}
  2. ${c.bold(L.find.how2)} kit/gates/${L.help.name}/ ${L.find.how2What}
     ${c.dim(L.find.how2Why)}
  3. ${c.bold(L.find.how3)} bash tool/selfcheck/gates.sh
     ${c.dim(L.find.how3Why)}
  4. ${c.bold(L.find.how4)} ${L.find.how4What}
`);
  }
}


// --- why: почему это не поймали ----------------------------------------------
// Сценарий «поймал ошибку». Ответ ровно один из трёх, и выбирает его не человек по памяти,
// а прогон: сторожа не было · сторож есть, но не сработал · сторож есть и ловит, значит его
// обошли. Разница между вторым и третьим решает, что чинить: саму проверку или её место в
// конвейере. Без прогона эти два случая неразличимы, и чинят обычно не тот.

// Гоняет ли конвейер именно этот гейт. Прогон всего разом (`doctor --run`) считается: тогда
// добавление гейта в манифест само добавляет его в конвейер.
async function runsInCi(slug, cmd) {
  const files = [];
  const walk = async (d) => {
    if (!(await exists(d))) return;
    for (const it of await readdir(d, { withFileTypes: true })) {
      const full = join(d, it.name);
      if (it.isDirectory()) await walk(full);
      else files.push(full);
    }
  };
  await walk(join(CWD, ".github", "workflows"));
  for (const f of [".gitlab-ci.yml", "Jenkinsfile", "azure-pipelines.yml"]) {
    if (await exists(join(CWD, f))) files.push(join(CWD, f));
  }
  if (!files.length) return { ci: false, runs: false };

  const script = (cmd.match(/[\w./-]+\.(?:sh|mjs|js|py)/) || [])[0];
  for (const f of files) {
    const text = await readFile(f, "utf8");
    if (/doctor\s+--run|--run\s+.*doctor/.test(text)) return { ci: true, runs: true, how: L.why.ciAtOnce };
    if (text.includes(slug) || (script && text.includes(script))) return { ci: true, runs: true, how: L.why.ciOwnStep };
  }
  return { ci: true, runs: false };
}

async function cmdWhy(args) {
  const query = args.filter((a) => !a.startsWith("-")).join(" ").trim();
  if (!query) die(L.why.needQuery(`${SELF} ${L.why.example}`));

  const man = await readManifest();
  const gates = man?.gates && typeof man.gates === "object" && !Array.isArray(man.gates) ? man.gates : {};
  const matches = await matchCatalog(query);

  // Имя записи, названное прямо, отменяет любую догадку. Слова — удобство, имя — точность.
  const byName = matches.find((m) => m.rec.slug === query.trim());
  const best = byName || matches[0];

  console.log(c.bold(`\naqk why «${query}»\n`));

  // Сверка огрублённая: «вырос» и «вырастает» — разные корни, их не сведёт никакой стеммер.
  // Поэтому при неуверенном совпадении команда НЕ выбирает за человека: неверно названный
  // случай отправляет чинить не то, а это дороже, чем лишний вопрос.
  const near = matches.filter((x) => x.rawScore >= 0.18).sort((a, b) => b.rawScore - a.rawScore);
  if (!byName && (!best || best.score < 0.5) && near.length) {
    console.log(c.yellow(`  ${L.why.unsure}\n`));
    for (const m of near.slice(0, 3)) {
      console.log(`  ${c.bold(m.rec.slug)}  ${c.dim(`${Math.round(m.rawScore * 100)}%`)}  ${m.rec.intent || ""}`);
    }
    console.log(c.dim(`\n  ${L.why.unsureByName(`${SELF} why ${L.help.name}`)}`));
    console.log(c.dim(`  ${L.why.unsureNone(`${SELF} new ${L.help.name}`)}\n`));
    return;
  }

  const decide = () => {
    console.log(`${c.bold(L.why.decideTitle)} ${L.why.decideQ}`);
    console.log(c.dim(`  ${L.why.decideWhy}`));
    console.log(c.dim(`  ${L.why.decideNote(`${SELF} note "…"`)}\n`));
  };

  // --- 1. сторожа не было ----------------------------------------------------
  if (!best || best.score < 0.25) {
    console.log(c.yellow(`  ${L.why.noGuard}`) + c.dim(`  ${L.why.noGuardWhy}\n`));
    console.log(`  ${c.bold(L.why.fix)} ${L.why.noGuardFix(c.bold(`${SELF} new ${L.help.name}`))}`);
    console.log(c.dim(`  ${L.why.noGuardHint}\n`));
    decide();
    return;
  }

  const slug = best.rec.slug;
  console.log(`  ${L.why.closest(c.bold(slug), Math.round(best.score * 100))}`);
  console.log(`  ${c.dim(best.rec.intent || "")}\n`);

  // --- 2. запись есть, но в проекте не объявлена -----------------------------
  const cmd = gates[slug];
  if (!cmd || !String(cmd).trim()) {
    console.log(c.yellow(`  ${L.why.notInstalled}\n`));
    console.log(`  ${c.bold(L.why.fix)} ${c.bold(`${SELF} add ${slug}`)}`);
    console.log(c.dim(`  ${L.why.notInstalledHint1}`));
    console.log(c.dim(`  ${L.why.notInstalledHint2(`${SELF} ratchet ${slug}`)}\n`));
    decide();
    return;
  }

  // --- 3. объявлен: спрашиваем у него самого ---------------------------------
  console.log(c.dim(`  ${L.why.declaredAs(cmd)}`));
  const r = spawnSync(String(cmd), { shell: true, cwd: CWD, encoding: "utf8", timeout: 300000 });
  const ci = await runsInCi(slug, String(cmd));

  if (r.status === 127 || (r.error && r.error.code === "ENOENT")) {
    console.log(c.yellow(`\n  ${L.why.notRunning}`) + c.dim(`  ${L.why.notRunningWhy}\n`));
    console.log(`  ${c.bold(L.why.fix)} ${L.why.notRunningFix}`);
    console.log(c.dim(`  ${L.why.notRunningHint}\n`));
    decide();
    return;
  }

  if (r.status !== 0) {
    console.log(c.yellow(`\n  ${L.why.bypassed}\n`));
    if (!ci.ci) {
      console.log(`  ${c.bold(L.why.fix)} ${L.why.noCiFix}`);
      console.log(c.dim(`  ${L.why.noCiHint}\n`));
    } else if (!ci.runs) {
      console.log(`  ${c.bold(L.why.fix)} ${L.why.notInCiFix}`);
      console.log(c.dim(`  ${L.why.notInCiHint(`${SELF} doctor --run`)}\n`));
    } else {
      console.log(`  ${c.bold(L.why.fix)} ${L.why.inCiFix(ci.how)}`);
      console.log(c.dim(`  ${L.why.inCiHint1}`));
      console.log(c.dim(`  ${L.why.inCiHint2}\n`));
    }
    decide();
    return;
  }

  console.log(c.yellow(`\n  ${L.why.blind}\n`));
  console.log(`  ${c.bold(L.why.fix)} ${L.why.blindFix(c.bold(`${slug}/red/`))}`);
  console.log(c.dim(`  ${L.why.blindHint1}`));
  console.log(c.dim(`  ${L.why.blindHint2}\n`));
  console.log(c.dim(`  ${L.why.blindCheck}\n`));
  decide();
}

export { cmdAdd, cmdNew, cmdRatchet, cmdFind, cmdWhy, installGate };
