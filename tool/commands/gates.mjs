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

// Ставит гейт из каталога в проект. Проверка КОПИРУЕТСЯ в репозиторий, а не остаётся
// ссылкой в пакет: при установке через npx пакет временный, и завтра команда в манифесте
// указывала бы в никуда — тот самый класс «гейт объявлен, но не запускается».

// Установка одной записи в проект: копия проверки, общий список исключений, строка в манифест.
// Отдельно от печати — той же работой пользуется `start`, ставящий сторожей дня 0 пачкой.
// Скопированная в третий раз, эта работа однажды разъехалась бы: копия гейта без _skip.sh
// читает окружение и выдаёт тысячу чужих нарушений.
async function installGate(slug, man, facts) {
  const src = join(GATES_SRC, slug);
  if (!(await exists(src))) die(`Нет такого гейта: ${slug}\nСписок применимых — ${SELF} doctor`);

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
  if (!cmd) die(`У записи ${slug} нет команды ни под ${[...facts.langs].join("/") || "этот стек"}, ни общей.`);

  const manPath = join(CWD, MANIFEST);
  const { text, why } = manifestWithGate(await readFile(manPath, "utf8"), slug, cmd);
  if (text) await writeFile(manPath, text, "utf8");
  return { rec, cmd, copied, declared: Boolean(text), why };
}

async function cmdAdd(args) {
  const slug = args.find((a) => !a.startsWith("-"));
  if (!slug) die(`Укажи имя гейта: ${SELF} add <имя>. Список — ${SELF} doctor`);

  const man = await readManifest();
  if (!man) die(`Нет .aqk.yml — сначала ${SELF} init`);
  const facts = await detectFacts(man);

  const src = join(GATES_SRC, slug);
  if (!(await exists(src))) die(`Нет такого гейта: ${slug}\nСписок применимых — ${SELF} doctor`);
  const probe = { slug, ...parseManifest(await readFile(join(src, "gate.yml"), "utf8")) };
  const verdict = triggerVerdict(probe, facts);
  if (!verdict.applies) {
    console.log(c.yellow(`\n  Этот гейт к репозиторию не применим: ${verdict.why}`));
    console.log(c.dim("  Ставлю всё равно — решение твоё, но сторожить ему нечего.\n"));
  }

  const { cmd, copied, declared, why } = await installGate(slug, man, facts);

  console.log(c.bold(`\naqk add ${slug}\n`));
  console.log(`  ${c.green("✔")}  ${PROJECT_GATES}/${slug}/  ${c.dim(`${copied.length} файлов: проверка и образцы`)}`);
  if (declared) {
    console.log(`  ${c.green("✔")}  .aqk.yml       ${c.dim(`гейт объявлен: ${cmd}`)}`);
  } else {
    console.log(`  ${c.yellow("!")}  .aqk.yml       ${c.dim(`не тронут (${why}). Впиши сам: ${slug}: "${cmd}"`)}`);
  }

  console.log(`
${c.bold("Дальше:")}

  1. Проверь, что он краснеет и молчит там, где должен:
     ${c.bold(`${cmd.replace(/ \.$/, ` ${PROJECT_GATES}/${slug}/red`)}`)}   ${c.dim("→ ожидается отказ")}
     ${c.bold(`${cmd.replace(/ \.$/, ` ${PROJECT_GATES}/${slug}/green`)}`)} ${c.dim("→ ожидается тишина")}
  2. Впиши команду в хук коммита и в конвейер. ${c.dim("Гейт, который никто не запускает, — не гейт.")}
  3. Прогон всех объявленных: ${c.bold(`${SELF} doctor --run`)}
`);
}

// Заготовка записи каталога. Поля намеренно оставлены незаполненными и в таком виде
// НЕ ПРОХОДЯТ проверку: пустая заготовка, принятая как запись, — это тот же мёртвый гейт.
// Сначала сверка по намерению: чаще всего нужного гейта не хватает не в каталоге, а в проекте.

async function cmdNew(args) {
  const slug = args.find((a) => !a.startsWith("-"));
  if (!slug) die(`Укажи имя: ${SELF} new no-print-in-prod`);
  if (!/^[a-z][a-z0-9-]{2,}$/.test(slug)) {
    die(`Имя «${slug}» не годится: латиница через дефис, например secrets-not-in-code.\nИмя читают в чужих проектах — оно часть словаря.`);
  }

  // Сначала сверка: новая запись нужна реже, чем кажется. Порог берётся по совпадению с
  // намерением, а не с пояснением: пояснение у всех записей похоже.
  const words = slug.replace(/-/g, " ") + " " + args.filter((a) => !a.startsWith("-")).slice(1).join(" ");
  for (const { rec, hits, headScore } of await matchCatalog(words)) {
    if (hits >= 2 && headScore >= 0.5 && !args.includes("--force")) {
      console.log(c.yellow(`\n  Похоже, такое уже есть: ${c.bold(rec.slug)}`));
      console.log(`  ${rec.intent || ""}\n`);
      console.log(c.dim("  Рецепт под другой стек — это строка в recipes существующей записи."));
      console.log(c.dim(`  Всё равно завести новую: ${SELF} new ${slug} --force\n`));
      process.exit(1);
    }
  }

  // Где заводить заготовку. Проверка «существует ли каталог комплекта» была неверной: он
  // существует всегда — это каталог самого пакета. Из чужого проекта заготовка уезжала внутрь
  // пакета, а через npx пакет лежит во временной папке и исчезает вместе с ней: работа сделана,
  // результата нет. Признак один — работаем ли мы над самим комплектом.
  const inKit = resolve(CWD) === resolve(PKG_ROOT);
  const dst = inKit ? join(GATES_SRC, slug) : join(CWD, PROJECT_GATES, slug);
  if (await exists(dst)) die(`${relative(CWD, dst)} уже существует.`);

  await mkdir(join(dst, "red"), { recursive: true });
  await mkdir(join(dst, "green"), { recursive: true });
  await writeFile(join(dst, "gate.yml"), GATE_YML_TEMPLATE(slug), "utf8");
  await writeFile(join(dst, "check.sh"), CHECK_SH_TEMPLATE, "utf8");
  await writeFile(join(dst, "README.md"), README_TEMPLATE(slug), "utf8");
  await writeFile(join(dst, "red", ".keep"), "", "utf8");
  await writeFile(join(dst, "green", ".keep"), "", "utf8");

  console.log(c.bold(`\naqk new ${slug}\n`));
  console.log(`  ${c.green("✔")}  ${relative(CWD, dst)}/  ${c.dim("gate.yml · check.sh · red/ · green/ · README.md")}`);
  console.log(`
${c.bold("Дальше — по порядку:")}

  1. ${c.bold("Проверь, нет ли готового правила")} в ruff, eslint, semgrep.
     ${c.dim("Готовое точнее, подробнее и его поддерживают без тебя. Своя проверка — запасная.")}
  2. ${c.bold("Положи образцы.")} В ${c.bold("red/")} — код, на котором проверка обязана сработать.
     В ${c.bold("green/")} — тот же код, но правильный.
     ${c.dim("Зелёный важнее: он ловит проверку, которая краснеет на исправном коде.")}
  3. ${c.bold("Напиши проверку")} в check.sh. В тексте отказа — что именно сделать.
  4. ${c.bold("Заполни gate.yml:")} намерение, триггер, доказательство отказом.
  5. ${c.bold("Прогони:")} bash tool/selfcheck/gates.sh
     ${c.dim("Арбитр обязан покраснеть на red/ и промолчать на green/. Не прошло — не запись.")}
`);
}

// Ставит храповик поверх уже объявленного гейта: снимает список текущих нарушений в реестр
// и заворачивает команду в обёртку, которая пускает старое и не пускает новое.
//
// Без этого правило нельзя ввести в живой проект: гейт покраснеет на всём старом коде,
// его выключат, и правило не будет действовать вовсе.

async function cmdRatchet(args) {
  const slug = args.find((a) => !a.startsWith("-"));
  if (!slug) die(`Укажи гейт: ${SELF} ratchet <имя>. Он должен быть уже объявлен в .aqk.yml`);

  const manPath = join(CWD, MANIFEST);
  if (!(await exists(manPath))) die(`Нет .aqk.yml — сначала ${SELF} init`);
  let text = await readFile(manPath, "utf8");

  const line = text.split("\n").find((l) => new RegExp(`^\\s+${slug}:`).test(l));
  if (!line) die(`Гейт «${slug}» не объявлен в .aqk.yml. Сначала: ${SELF} add ${slug}`);

  const cmd = line.replace(/^\s*[^:]+:\s*/, "").replace(/^"|"$/g, "");
  const inKit = resolve(CWD) === resolve(PKG_ROOT);
  const lib = inKit ? "kit/ratchet/ratchet.sh" : RATCHET_LIB;

  // «Обёртка объявлена» и «долг снят» — разные состояния. Если реестра на диске нет, гейт
  // краснеет на всём подряд, а команда отказывалась помочь словами «храповик уже стоит».
  // Тогда снимаем снимок заново по внутренней команде, а строку манифеста не трогаем.
  const reg = join(CWD, RATCHET_DIR, `${slug}.txt`);
  const wrapped0 = cmd.includes("ratchet.sh");
  if (wrapped0 && (await exists(reg))) die(`На гейте «${slug}» храповик уже стоит.`);
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
    die(
      `Гейт «${slug}» не запускается: ${inner}\n` +
        `Снимать долг с несуществующего сторожа нельзя — в реестр попадут его же сообщения\n` +
        `об ошибке, и он станет разрешением. Сначала почини команду.`
    );
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
    `# Реестр долга: ${slug}\n` +
      `# Снят ${stamp}. Список разрешается ТОЛЬКО укорачивать.\n` +
      `# Новое нарушение красит гейт; исправленное вычёркивается автоматически.\n` +
      keys.join("\n") + (keys.length ? "\n" : ""),
    "utf8"
  );

  if (!wrapped0) {
    text = text.replace(line, `  ${slug}: "${prefix}${cmd}"`);
    text = text.replace(/^ratchets:\s*""\s*$/m, `ratchets: ${RATCHET_DIR}`);
    await writeFile(manPath, text, "utf8");
  }

  console.log(c.bold(`\naqk ratchet ${slug}\n`));
  console.log(`  ${c.green("✔")}  ${RATCHET_DIR}/${slug}.txt  ${c.dim(`${keys.length} нарушений записано долгом`)}`);
  if (!inKit) console.log(`  ${c.green("✔")}  ${lib}  ${c.dim("обёртка скопирована в проект")}`);
  console.log(`  ${c.green("✔")}  .aqk.yml  ${c.dim("команда завёрнута в храповик")}`);
  console.log(`
${c.bold("Что это меняет:")}

  Правило действует ${c.bold("со дня установки")}. Старый код трогать не надо, но новое
  нарушение того же класса гейт не пропустит.

  ${c.dim("Проверка, что это храповик, а не советчик: «может ли новый код добавить нарушение")}
  ${c.dim("и пройти?» Может — значит гейта нет.")}

  Прогнать: ${c.bold(`${SELF} doctor --run`)}
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
  if (!query) die(`Опиши намерение словами: ${SELF} find "отладочная печать не доезжает до прода"`);

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
    console.log(c.green("  Такое уже есть — новую запись заводить не надо:\n"));
    for (const [sc, rec] of same.slice(0, 3)) {
      console.log(`  ${c.bold(rec.slug)}  ${c.dim(`совпадение ${Math.round(sc * 100)}%`)}`);
      console.log(`      ${rec.intent || ""}`);
      const langs = Object.keys(rec.recipes || {}).filter((k) => k !== "any");
      console.log(c.dim(`      рецепты: ${langs.length ? langs.join(", ") + ", " : ""}общий`));
    }
    console.log(c.dim("\n  Если у тебя рецепт под другой стек — это строка в recipes существующей"));
    console.log(c.dim("  записи, а не новый гейт. Намерение одно, исполнителей может быть много.\n"));
  } else if (near.length) {
    console.log(c.yellow("  Точного совпадения нет, но рядом лежит:\n"));
    for (const [sc, rec] of near.slice(0, 4)) {
      console.log(`  ${c.bold(rec.slug)}  ${c.dim(`${Math.round(sc * 100)}%`)}  ${rec.intent || ""}`);
    }
    console.log(c.dim("\n  Прочитай их README. Если намерение то же — дополняй, а не заводи новое.\n"));
  } else {
    console.log(c.yellow("  Такого намерения в каталоге нет.\n"));
  }

  if (journal.length) {
    console.log(c.bold("  В журнале есть шишка на эту тему:\n"));
    for (const [, date, title] of journal.slice(0, 3)) console.log(`  ${c.dim(date)}  ${title}`);
    console.log(c.dim("\n  Шишка записана — значит доказательство для новой записи уже есть.\n"));
  }

  if (!same.length) {
    console.log(`${c.bold("Как добавить свой гейт:")}

  1. ${c.bold("Назови отказ.")} Какой конкретный брак он поймал в живом проекте, чего это стоило.
     ${c.dim("«Это хорошая практика» не принимается: так каталог набирает сотни пунктов и умирает.")}
  2. ${c.bold("Заведи папку")} kit/gates/<имя>/ — gate.yml, red/, green/, README.md.
     ${c.dim("Норма записи со всеми полями — kit/gates/README.md")}
  3. ${c.bold("Проверь машиной:")} bash tool/selfcheck/gates.sh
     ${c.dim("Арбитр обязан покраснеть на red/ и промолчать на green/. Не прошло — не запись.")}
  4. ${c.bold("Пришли изменением")} в репозиторий комплекта.
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
    if (/doctor\s+--run|--run\s+.*doctor/.test(text)) return { ci: true, runs: true, how: "разом: doctor --run" };
    if (text.includes(slug) || (script && text.includes(script))) return { ci: true, runs: true, how: "отдельным шагом" };
  }
  return { ci: true, runs: false };
}

async function cmdWhy(args) {
  const query = args.filter((a) => !a.startsWith("-")).join(" ").trim();
  if (!query) die(`Опиши, что пропустили: ${SELF} why "файл вырос до девяти тысяч строк"`);

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
    console.log(c.yellow("  Уверенного совпадения нет. Похоже на эти записи:\n"));
    for (const m of near.slice(0, 3)) {
      console.log(`  ${c.bold(m.rec.slug)}  ${c.dim(`${Math.round(m.rawScore * 100)}%`)}  ${m.rec.intent || ""}`);
    }
    console.log(c.dim(`\n  Назови запись именем: ${SELF} why <имя>`));
    console.log(c.dim(`  Ни одна не подходит — значит сторожа не было: ${SELF} new <имя>\n`));
    return;
  }

  const decide = () => {
    console.log(`${c.bold("Дальше решаешь ты:")} это твоя частность или общий случай?`);
    console.log(c.dim("  Общий — идёт в каталог и достаётся всем. Частный — остаётся у тебя."));
    console.log(c.dim(`  Урок в общий журнал в любом случае: ${SELF} note "что случилось"\n`));
  };

  // --- 1. сторожа не было ----------------------------------------------------
  if (!best || best.score < 0.25) {
    console.log(c.yellow("  Сторожа не было.") + c.dim("  В каталоге нет записи с таким намерением.\n"));
    console.log(`  ${c.bold("Почини так:")} заведи запись — ${c.bold(`${SELF} new <имя>`)}`);
    console.log(c.dim("  Красный образец бери прямо из этой поломки: она уже случилась, выдумывать нечего.\n"));
    decide();
    return;
  }

  const slug = best.rec.slug;
  console.log(`  Ближайшая запись каталога: ${c.bold(slug)}  ${c.dim(`совпадение ${Math.round(best.score * 100)}%`)}`);
  console.log(`  ${c.dim(best.rec.intent || "")}\n`);

  // --- 2. запись есть, но в проекте не объявлена -----------------------------
  const cmd = gates[slug];
  if (!cmd || !String(cmd).trim()) {
    console.log(c.yellow("  Сторож есть в каталоге, но в этом проекте не поставлен.\n"));
    console.log(`  ${c.bold("Почини так:")} ${c.bold(`${SELF} add ${slug}`)}`);
    console.log(c.dim("  Он покраснеет на старом коде — это нормально: старое закрывается храповиком,"));
    console.log(c.dim(`  новое ловится со дня установки. ${SELF} ratchet ${slug}\n`));
    decide();
    return;
  }

  // --- 3. объявлен: спрашиваем у него самого ---------------------------------
  console.log(c.dim(`  Объявлен: ${cmd}`));
  const r = spawnSync(String(cmd), { shell: true, cwd: CWD, encoding: "utf8", timeout: 300000 });
  const ci = await runsInCi(slug, String(cmd));

  if (r.status === 127 || (r.error && r.error.code === "ENOENT")) {
    console.log(c.yellow("\n  Сторож объявлен, но не запускается.") + c.dim("  Худший случай: тишина читается как успех.\n"));
    console.log(`  ${c.bold("Почини так:")} путь или программа из команды не существуют — проверь их.`);
    console.log(c.dim("  Отсутствие сигнала неотличимо от успеха, поэтому это не «мелочь в конфиге».\n"));
    decide();
    return;
  }

  if (r.status !== 0) {
    console.log(c.yellow("\n  Сторож есть и эту поломку ловит — значит его обошли.\n"));
    if (!ci.ci) {
      console.log(`  ${c.bold("Почини так:")} конвейера нет. Проверка, которую гоняет только человек,`);
      console.log(c.dim("  работает ровно до первого «забыл».\n"));
    } else if (!ci.runs) {
      console.log(`  ${c.bold("Почини так:")} конвейер есть, но этот гейт в нём не запускается.`);
      console.log(c.dim(`  Дешевле всего одним шагом: ${SELF} doctor --run — он гоняет всё объявленное.\n`));
    } else {
      console.log(`  ${c.bold("Почини так:")} конвейер его гоняет (${ci.how}) — значит красный прогон`);
      console.log(c.dim("  кто-то пропустил или обошёл. Перенеси правило из текста в механику:"));
      console.log(c.dim("  блокирующий шаг, а не необязательный; запрет слияния при красном.\n"));
    }
    decide();
    return;
  }

  console.log(c.yellow("\n  Сторож есть, стоит и запускается — но этой поломки не видит.\n"));
  console.log(`  ${c.bold("Почини так:")} положи в ${c.bold(`${slug}/red/`)} кусок кода из этой поломки`);
  console.log(c.dim("  и доведи проверку до красного на нём. Порядок обратный привычному: сначала"));
  console.log(c.dim("  образец, потом правка — иначе непонятно, что именно починено.\n"));
  console.log(c.dim(`  Проверить после правки: bash tool/selfcheck/gates.sh\n`));
  decide();
}

export { cmdAdd, cmdNew, cmdRatchet, cmdFind, cmdWhy, installGate };
