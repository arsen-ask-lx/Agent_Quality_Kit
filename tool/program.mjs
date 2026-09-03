#!/usr/bin/env node
// aqk — разложить оснастку в проект и вести общий журнал шишек.
//
// ЗАЧЕМ ЭТО, А НЕ ПЛАГИН. Плагин Claude Code работает только в Claude Code. Правила, документация
// и гейты не зависят от того, какой нейросетью пишут код, — значит и способ установки не должен
// зависеть. `npx` есть везде, где есть Node.
//
// ЗАВИСИМОСТЕЙ НЕТ НАМЕРЕННО. Каждая чужая библиотека — лишний узел надёжности и лишняя дверь в
// цепочке поставок. Инструмент, который ставят одной командой в чужой проект, обязан быть
// проверяемым глазами за один присест.
//
//   npx github:arsen-ask-lx/Agent_Quality_Kit init     разложить комплект в текущий проект
//   npx github:arsen-ask-lx/Agent_Quality_Kit init --force   перезаписать уже существующие файлы
//   npx github:arsen-ask-lx/Agent_Quality_Kit note "..."     записать урок в общий журнал
//   npx github:arsen-ask-lx/Agent_Quality_Kit doctor   проверить, что разложено и чего не хватает

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { c, SELF } from "./lib/core.mjs";
import { cmdInit, cmdNote, cmdBlob } from "./commands/project.mjs";
import { cmdDoctor } from "./commands/doctor.mjs";
import { cmdAdd, cmdNew, cmdRatchet, cmdFind, cmdWhy } from "./commands/gates.mjs";

// Разбор аргументов выполняется только при запуске файла как программы. При импорте —
// а так его читают модульные проверки tool/selfcheck/units.mjs — CLI запускаться не должен.
// Сравниваем по реальному пути: npx ставит `aqk` симлинком, и без realpath запуск через него
// программой считаться перестал бы.
let IS_MAIN = false;
try {
  IS_MAIN = !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
} catch { IS_MAIN = false; }

if (IS_MAIN) {
  const [, , cmd, ...rest] = process.argv;
  switch (cmd) {
    case "init":
      await cmdInit(rest);
      break;
    case "doctor":
      await cmdDoctor();
      break;
    case "note":
      await cmdNote(rest);
      break;
    case "add":
      await cmdAdd(rest);
      break;
    case "find":
      await cmdFind(rest);
      break;
    case "why":
      await cmdWhy(rest);
      break;
    case "ratchet":
      await cmdRatchet(rest);
      break;
    case "new":
      await cmdNew(rest);
      break;
    case "blob":
      await cmdBlob();
      break;
    default:
      console.log(`
  ${c.bold("aqk")} — оснастка для разработки с агентами

    ${c.bold(`${SELF} init`)}            разложить правила и методички в текущий проект
    ${c.bold(`${SELF} init --force`)}    перезаписать уже существующие файлы
    ${c.bold(`${SELF} doctor`)}          проверить, что разложено и чего не хватает\n  ${c.bold(`${SELF} doctor --run`)}    ещё и запустить объявленные гейты\n  ${c.bold(`${SELF} add`)} <имя>       поставить гейт из каталога в проект\n  ${c.bold(`${SELF} find`)} "…"       есть ли уже такой гейт — сверка по намерению\n  ${c.bold(`${SELF} why`)} "…"        поймал ошибку — почему её не поймал сторож\n  ${c.bold(`${SELF} ratchet`)} <имя>   храповик: старые нарушения — долг, новые не пускать\n  ${c.bold(`${SELF} new`)} <имя>       заготовка своего гейта для каталога
    ${c.bold(`${SELF} note`)} "…"        записать урок в общий журнал шишек
    ${c.bold(`${SELF} blob`)}            собрать методички в один файл GOD_AI.md

  ${c.dim("Без установки:  npx github:arsen-ask-lx/Agent_Quality_Kit init")}
  `);
      process.exit(cmd ? 1 : 0);
  }
}
