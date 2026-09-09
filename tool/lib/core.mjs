// tool/lib/core.mjs — пути, вывод и выход. То, что нужно всем остальным файлам.
//
// ЗАЧЕМ ОТДЕЛЬНО. Программа перестала помещаться в один файл: 1357 строк при собственном
// пределе в 500. Разделена по назначению, а не пополам — так требует наше же правило про
// размер файла. Зависимостей по-прежнему нет ни одной: только встроенные модули Node.

import { LANG } from "../i18n/index.mjs";
import { access, readdir, mkdir, copyFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve, sep } from "node:path";
import { homedir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
// Два уровня вверх: файл лежит в tool/lib/. Ошибка здесь тихая — программа стала бы искать
// комплект внутри tool/ и сообщала бы «методичек нет» на исправной установке.
const PKG_ROOT = resolve(HERE, "..", "..");
const CWD = process.cwd();

const DOCS_SRC = join(PKG_ROOT, "kit", "docs");
// Правила переносятся в проект НА ЯЗЫКЕ ВЫВОДА. Русский текст в англоязычном проекте — не
// мелочь: это первое, что там откроет человек, и первое, чего он не прочитает. Русская версия
// остаётся источником истины, английская — переводом; расходиться им нельзя, и совпадение
// НАБОРА ФАЙЛОВ сторожит модульная проверка. Совпадение содержания машина не сторожит — это
// названо в AGENTS.md, а не спрятано.
const RULES_SRC = join(PKG_ROOT, "kit", LANG === "en" ? "rules-en" : "rules");
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
// Имя в реестре, а не адрес репозитория: короче, скачивается 230 КБ вместо клона всего
// репозитория и не заставляет человека ждать три минуты в тишине на первой же команде.
const REPO = "agent-quality-kit";
// Адрес репозитория отдельно от имени пакета. Когда имя стало коротким, ссылка «поставь
// звезду» собиралась из него и вела на github.com/agent-quality-kit — несуществующую
// страницу. Два разных адреса, собранные из одной строки, однажды разъезжаются.
const REPO_URL = "https://github.com/arsen-ask-lx/Agent_Quality_Kit";

function selfCmd() {
  const p = process.argv[1] || "";
  if (/[\\/]_npx[\\/]/.test(p)) return `npx ${REPO}`;
  if (/[\\/]node_modules[\\/]\.bin[\\/]/.test(p) || /[\\/]aqk$/.test(p)) return "aqk";
  const rel = relative(CWD, p);
  return `node ${rel && !rel.startsWith("..") ? rel : p}`;
}

const SELF = selfCmd();

// КАРТА КОМАНД — ОДИН список на справку в терминале и на карту, уходящую в контекст агента.
// Два списка рядом через месяц врут по-разному, и непонятно, какой настоящий: это записано
// у нас в CLAUDE.md про своды правил и верно здесь буквально так же. Модульная проверка
// сторожит, что список не отстал от диспетчера в program.mjs.
function commandRows(L) {
  const h = L.help;
  return [
    { name: "init", args: "", text: h.init },
    { name: "init", args: "--force", text: h.initForce },
    { name: "start", args: "", text: h.start },
    { name: "doctor", args: "", text: h.doctor },
    { name: "doctor", args: "--run", text: h.doctorRun },
    { name: "doctor", args: "--run --since main", text: h.doctorSince },
    { name: "prove", args: "", text: h.prove },
    { name: "add", args: h.name, text: h.add },
    { name: "find", args: '"…"', text: h.find },
    { name: "why", args: '"…"', text: h.why },
    { name: "ratchet", args: h.name, text: h.ratchet },
    { name: "new", args: h.name, text: h.new },
    { name: "note", args: '"…"', text: h.note },
    { name: "blob", args: "", text: h.blob },
    { name: "report", args: "", text: h.report },
    { name: "learn", args: "", text: h.learn },
    { name: "context", args: "", text: h.context },
    { name: "context", args: "--full --install", text: h.contextInstall },
    { name: "badge", args: "", text: h.badge },
    { name: "version", args: "", text: h.version },
  ];
}

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

// Путь, попадающий в ДОКУМЕНТ, всегда пишется через «/». `relative()` отдаёт разделитель
// платформы, и на Windows склейка методичек и отчёт получались с «kit\\docs» вместо «kit/docs»:
// артефакт, который человек читает и пересылает, оказывался разным на разных системах. Найдено
// заданием конвейера на windows-latest — шестьдесят шесть проверок на Linux этого не видели.
function docPath(from, to) {
  return relative(from, to).split(sep).join("/");
}

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
  PKG_ROOT, CWD, DOCS_SRC, RULES_SRC, TARGET_DIR, docPath,
  MANIFEST, GATES_SRC, PROJECT_GATES, RATCHET_DIR, RATCHET_LIB,
  SELF, REPO_URL, c, exists, die, FEEDBACK_MARK, commandRows,
};
