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
//   npx agent-quality-kit init     разложить комплект в текущий проект
//   npx agent-quality-kit init --force   перезаписать уже существующие файлы
//   npx agent-quality-kit note "..."     записать урок в общий журнал
//   npx agent-quality-kit doctor   проверить, что разложено и чего не хватает

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { c, SELF } from "./lib/core.mjs";
import { L } from "./i18n/index.mjs";
import { cmdInit, cmdNote, cmdBlob, cmdStart } from "./commands/project.mjs";
import { cmdDoctor } from "./commands/doctor.mjs";
import { cmdAdd, cmdNew, cmdRatchet, cmdFind, cmdWhy } from "./commands/gates.mjs";
import { cmdReport } from "./commands/report.mjs";

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
    case "start":
      await cmdStart(rest);
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
    case "report":
      await cmdReport();
      break;
    default: {
      // Ширина колонки считается, а не подбирается пробелами: строки в двух языках разной
      // длины, и вручную выровненная справка на втором языке разъезжается.
      const h = L.help;
      const rows = [
        [`${SELF} init`, h.init],
        [`${SELF} init --force`, h.initForce],
        [`${SELF} start`, h.start],
        [`${SELF} doctor`, h.doctor],
        [`${SELF} doctor --run`, h.doctorRun],
        [`${SELF} add ${h.name}`, h.add],
        [`${SELF} find "…"`, h.find],
        [`${SELF} why "…"`, h.why],
        [`${SELF} ratchet ${h.name}`, h.ratchet],
        [`${SELF} new ${h.name}`, h.new],
        [`${SELF} note "…"`, h.note],
        [`${SELF} blob`, h.blob],
        [`${SELF} report`, h.report],
      ];
      const width = Math.max(...rows.map(([cmdText]) => cmdText.length));
      const lines = rows.map(([cmdText, text]) => `  ${c.bold(cmdText.padEnd(width))}   ${text}`);
      console.log(`
  ${c.bold("aqk")} — ${h.tagline}

${lines.join("\n")}

  ${c.dim(h.noInstall)}
  ${c.dim(h.language)}
  `);
      process.exit(cmd ? 1 : 0);
    }
  }
}
