// tool/lib/core.mjs — пути, вывод и выход. То, что нужно всем остальным файлам.
//
// ЗАЧЕМ ОТДЕЛЬНО. Программа перестала помещаться в один файл: 1357 строк при собственном
// пределе в 500. Разделена по назначению, а не пополам — так требует наше же правило про
// размер файла. Зависимостей по-прежнему нет ни одной: только встроенные модули Node.

import { access, readdir, mkdir, copyFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, relative } from "node:path";
import { homedir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
// Два уровня вверх: файл лежит в tool/lib/. Ошибка здесь тихая — программа стала бы искать
// комплект внутри tool/ и сообщала бы «методичек нет» на исправной установке.
const PKG_ROOT = resolve(HERE, "..", "..");
const CWD = process.cwd();

const DOCS_SRC = join(PKG_ROOT, "kit", "docs");
const RULES_SRC = join(PKG_ROOT, "kit", "rules");
const TARGET_DIR = ".aqk";

const c = {
  bold: (s) => `[1m${s}[0m`,
  dim: (s) => `[2m${s}[0m`,
  green: (s) => `[32m${s}[0m`,
  yellow: (s) => `[33m${s}[0m`,
  red: (s) => `[31m${s}[0m`,
};

const exists = async (p) => access(p, constants.F_OK).then(() => true, () => false);

// Как звать программу — зависит от того, как её запустили. Через npx команды `aqk` в системе
// нет: подсказка «aqk doctor» отправляет человека в «команда не найдена» на первом же шаге.
// Печатаем то, что можно скопировать и выполнить прямо сейчас.
const REPO = "github:arsen-ask-lx/Agent_Quality_Kit";

function selfCmd() {
  const p = process.argv[1] || "";
  if (/[\\/]_npx[\\/]/.test(p)) return `npx ${REPO}`;
  if (/[\\/]node_modules[\\/]\.bin[\\/]/.test(p) || /[\\/]aqk$/.test(p)) return "aqk";
  const rel = relative(CWD, p);
  return `node ${rel && !rel.startsWith("..") ? rel : p}`;
}

const SELF = selfCmd();

function die(msg) {
  console.error(c.red(msg));
  process.exit(1);
}

// Имя манифеста и каталоги, которые программа знает по именам. Собраны здесь, а не разбросаны
// по файлам команд: путь, записанный в двух местах, однажды разъедется.
const MANIFEST = ".aqk.yml";
const GATES_SRC = join(PKG_ROOT, "kit", "gates");
const PROJECT_GATES = "gates";
const RATCHET_DIR = "ratchets";
// Обёртка лежит рядом с реестрами, которые она читает, а не среди гейтов: храповик — это
// обёртка плюс реестр, и разносить их по разным каталогам значит прятать половину механизма.
const RATCHET_LIB = `${RATCHET_DIR}/_ratchet.sh`;

// Отметка «просьбу про звезду уже показали» — вне репозитория, в доме пользователя. Внутри
// .aqk/ она либо закоммитится в чужой проект как наш мусор, либо пропадёт при init --force:
// то и другое врёт о том, видел человек просьбу или нет.
const FEEDBACK_MARK = join(homedir(), ".config", "aqk", "feedback-shown");

async function copyDir(src, dst, { force }) {
  await mkdir(dst, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  const written = [];
  for (const e of entries) {
    const from = join(src, e.name);
    const to = join(dst, e.name);
    if (e.isDirectory()) {
      written.push(...(await copyDir(from, to, { force })));
      continue;
    }
    if (!force && (await exists(to))) continue;
    await copyFile(from, to);
    written.push(to);
  }
  return written;
}

async function writeIfAbsent(path, content, { force }) {
  if (!force && (await exists(path))) return false;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
  return true;
}

export {
  copyDir, writeIfAbsent,
  PKG_ROOT, CWD, DOCS_SRC, RULES_SRC, TARGET_DIR,
  MANIFEST, GATES_SRC, PROJECT_GATES, RATCHET_DIR, RATCHET_LIB,
  SELF, REPO, c, exists, die, FEEDBACK_MARK,
};
