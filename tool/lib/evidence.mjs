// tool/lib/evidence.mjs — привязка доказательства к дифу.
//
// ЗАЧЕМ. «Готово = доказано» — центральное правило свода, и оно единственное из четырнадцати,
// за которым не следила машина: в `AGENTS.md` его сторожем честно записан человек. Цена этого
// измерена 2026-09-08 прогоном чужого инструмента по восьми нашим коммитам: `publish.yml`
// менялся и не был назван ни одной командой проверки — и именно он оказался сломан. Коммит при
// этом говорил «прогон: units 51, smoke 81». Утверждение было правдой и не относилось к делу.
//
// Механизм взят у [donecheck](https://github.com/AtharvaMaik/donecheck) (MIT, ноль
// зависимостей). Своего разбора команд не пишем — берём идею, а не код: donecheck САМ запускает
// команды проверки, а `doctor --run` их уже запустил, и обёртка означала бы двойной прогон
// всего набора гейтов. Здесь данные уже есть.
//
// ОДНО ОТЛИЧИЕ, И ОНО НАМЕРЕННОЕ. donecheck считает файл покрытым и по голому имени. В нашем
// каталоге имя `check.sh` носят два десятка разных файлов: мягкое сравнение объявило бы
// покрытым каждый из них, стоит любому гейту напечатать это слово. Ошибка в сторону «покрыто»
// — это тишина, а тишина здесь и есть предмет спора. Сравниваем строго, по полному пути.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { changedFiles, pathsIn, normPath } from "./scope.mjs";

// Расширения, для которых «никто не проверил» — утверждение о деле. Документ не проверяется
// прогоном по своей природе, и требовать этого значило бы красить каждую правку README.
const CODE_EXT = new Set([
  "c", "cjs", "cpp", "cs", "css", "go", "h", "java", "js", "json", "jsx", "kt", "mjs", "mts",
  "php", "pl", "py", "rb", "rs", "scala", "sh", "sql", "swift", "toml", "ts", "tsx", "vue",
  "yaml", "yml",
]);

// Образцы гейтов исключены по той же причине, по какой их исключает каждая сканирующая
// проверка каталога: они существуют, чтобы быть неправильными, и командой проверки покрыты
// быть не могут. Без этого замер дал восемь ложных находок из шестнадцати.
function isSample(p) {
  return /(^|\/)gates\/[^/]+\/(red|green)(\/|$)/.test(p);
}

function ext(p) {
  const m = /\.([A-Za-z0-9]+)$/.exec(p);
  return m ? m[1].toLowerCase() : "";
}

// Файлы кода, которые внёс диф. null — если ссылка не разобрана: «сравнили не с тем» обязано
// отличаться от «изменений нет».
function changedCode(ref, cwd) {
  const all = changedFiles(ref, cwd);
  if (all === null) return null;
  return [...all].map(normPath).filter((p) => CODE_EXT.has(ext(p)) && !isSample(p)).sort();
}

// Куда гейт был НАПРАВЛЕН: цели из его команды. Проверка, обошедшая каталог и не нашедшая
// ничего, файла не назовёт — и «просмотрен и чист» стало бы неотличимо от «никто не смотрел».
// Различить это по выводу нельзя, а по команде можно: она говорит, куда гейт направляли.
function targetsOf(cmd, isDir) {
  const out = [];
  for (const tok of String(cmd || "").split(/\s+/)) {
    if (tok.startsWith("-")) continue;
    const t = normPath(tok);
    if (tok === "." || tok === "./") { out.push(""); continue; }
    if (t && !t.includes("*") && isDir(t)) out.push(t.replace(/\/$/, ""));
  }
  return out;
}

// Три состояния, а не два, и это главное в этой функции.
//
//   named   — гейт напечатал путь файла: он его точно видел и что-то о нём сказал;
//   silent  — гейт был направлен в каталог с этим файлом, но ничего не напечатал. Просмотрен и
//             чист либо не просмотрен вовсе — по выводу это неразличимо, и выдавать одно за
//             другое нельзя ни в ту, ни в другую сторону;
//   none    — ни одна команда даже не была направлена туда, где файл лежит.
//
// Двух состояний хватило ровно до первого прогона: `tool/commands/doctor.mjs` попал в «никем
// не проверен», хотя его обходят пять проверок — они просто промолчали, потому что нашли
// чисто. Замеряно 2026-09-08.
function coverage(files, results, isDir = () => false) {
  const seen = results.map((r) => ({
    name: r.name,
    paths: pathsIn(`${r.cmd || ""}\n${r.out || ""}`),
    targets: targetsOf(r.cmd, isDir),
  }));
  const covered = new Map();
  const silent = new Map();
  const uncovered = [];
  for (const raw of files) {
    const f = normPath(raw);
    const by = seen.filter((n) => n.paths.has(f)).map((n) => n.name);
    if (by.length) { covered.set(raw, by); continue; }
    const aimed = seen
      .filter((n) => n.targets.some((t) => t === "" || f === t || f.startsWith(`${t}/`)))
      .map((n) => n.name);
    if (aimed.length) silent.set(raw, aimed);
    else uncovered.push(raw);
  }
  return { covered, silent, uncovered };
}

// Отпечаток того, о чём отчитывается расписка: базовый коммит, набор команд, содержимое файлов.
// Изменилось что угодно из этого — расписка устарела, и «прогнал, потом поправил ещё три файла»
// перестаёт быть неотличимым от «прогнал».
//
// files — пары [путь, содержимое]. Содержимое передаётся, а не читается здесь: вызывающий уже
// держит файлы в руках, а функция без ввода-вывода проверяется модульно.
function evidenceHash(base, commands, files) {
  const h = createHash("sha256");
  h.update(`base:${base || ""}\0`);
  for (const c of commands) h.update(`cmd:${c?.cmd ?? c}\0`);
  for (const [p, body] of [...files].sort((a, b) => String(a[0]).localeCompare(String(b[0])))) {
    h.update(`path:${normPath(p)}\0`);
    h.update(body === null || body === undefined ? "<missing>" : String(body));
    h.update("\0");
  }
  return h.digest("hex");
}

// Читает содержимое для отпечатка. Отсутствующий файл — тоже факт: удаление меняет расписку.
function readForHash(files, cwd) {
  return files.map((p) => {
    try { return [p, readFileSync(join(cwd, p), "utf8")]; } catch { return [p, null]; }
  });
}

export { changedCode, coverage, evidenceHash, readForHash, CODE_EXT };
