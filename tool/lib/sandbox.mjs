// tool/lib/sandbox.mjs — копия проекта, в которую подсаживают брак, не трогая рабочее дерево.
//
// ОДНО МЕСТО НА ДВЕ КОМАНДЫ. Жила внутри `probe`; 2026-09-27 понадобилась `prove`, чтобы
// доказывать команды, которые не кончаются каталогом (`npm run lint`, `make check`). Вторая
// копия этих сорока строк разошлась бы с первой на первой же починке.
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, copyFile, rm, writeFile, readFile, symlink, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, relative } from "node:path";
import { CWD, exists } from "./core.mjs";

// Песочница: КОПИЯ ПРОЕКТА, в которую подсаживается образец. Раньше здесь был временный каталог
// с одним файлом, а путь к нему подставлялся в команду гейта — отчего пробовать можно было
// только команды, кончающиеся каталогом. Замер 2026-09-10 на семи чужих репозиториях: у шести
// команды такие (`xo`, `eslint lib/**/*.js`, `mocha --require…`, `pytest`), и проба не
// запускалась вовсе.
//
// Способ взят из мутационного тестирования, где та же задача решена двадцать лет назад: Stryker
// копирует проект во временный каталог, СИМЛИНКУЕТ `node_modules` и гоняет там родную команду.
// Копируются отслеживаемые и неигнорируемые файлы (`git ls-files --cached --others
// --exclude-standard`) — файлы проекта не меняются (итог пишется в .aqk/last-probe.md), а
// мусор сборки не тащится; тяжёлые каталоги зависимостей симлинкуются, иначе `npm test` в
// песочнице падал бы с «модуль не найден», и это читалось бы как сбой инструмента.
const DEP_DIRS = ["node_modules", ".venv", "venv", "vendor", "target", ".tox", ".bundle"];

async function buildSandbox() {
  // Копируется РАБОЧЕЕ ДЕРЕВО, а не HEAD. Первая версия брала `git archive HEAD`, и это было
  // неверно: комплект зовут из хука ДО коммита, и пользователь пробует то, что у него сейчас,
  // а не то, что уже записано. На свежем `init` + `add` без коммита проба вообще ничего не
  // видела — гейты в песочнице отсутствовали и «не запускались».
  //
  // Список — `git ls-files --cached --others --exclude-standard`: отслеживаемые плюс новые, но
  // БЕЗ игнорируемых. Игнорируемое — это сборка и зависимости; первое пробе не нужно, второе
  // приходит симлинком.
  //
  // Копирование средствами node, а не `tar`: у конвейера есть windows-задание, и полагаться на
  // ключи GNU tar там нельзя.
  const r = spawnSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    cwd: CWD, encoding: "utf8", timeout: 60000, maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) return null;
  const files = String(r.stdout || "").split("\0").filter(Boolean);
  if (!files.length) return null;

  const root = await mkdtemp(join(tmpdir(), "aqk-sandbox-"));
  const made = new Set();
  for (const rel of files) {
    const dest = join(root, rel);
    const dir = dirname(dest);
    if (!made.has(dir)) { await mkdir(dir, { recursive: true }); made.add(dir); }
    // Файл мог исчезнуть между списком и копией, а каталог — оказаться подмодулем.
    try { await copyFile(join(CWD, rel), dest); } catch { /* пропускаем, не роняя пробу */ }
  }
  for (const dep of DEP_DIRS) {
    const from = join(CWD, dep);
    if (await exists(from)) { try { await symlink(from, join(root, dep), "junction"); } catch { /* уже есть */ } }
  }
  return root;
}

// Подсадка образца на место горячего файла и возврат как было. Файл СНАЧАЛА удаляется:
// в песочнице он может быть жёсткой ссылкой, и запись поверх задела бы оригинал.
async function plant(root, relPath, sample) {
  const dest = join(root, relPath);
  await mkdir(dirname(dest), { recursive: true });
  let backup = null;
  try { backup = await readFile(dest); } catch { /* файла может не быть */ }
  await rm(dest, { force: true });
  await copyFile(sample, dest);
  return async () => {
    await rm(dest, { force: true });
    if (backup !== null) await writeFile(dest, backup);
  };
}

// Подсадить ДЕРЕВО: каждый файл каталога `src` кладётся в копию по своему относительному
// пути. Образец проверки, которую нельзя направить на каталог, — это не один файл, а кусок
// проекта: `src/bad.ts`, а то и конфиг рядом. Возврат снимает всё, в обратном порядке.
async function plantTree(root, src) {
  const files = [];
  const walk = async (d) => {
    for (const e of await readdir(d, { withFileTypes: true })) {
      const full = join(d, e.name);
      if (e.isDirectory()) await walk(full);
      else files.push(full);
    }
  };
  await walk(src);
  const undo = [];
  for (const f of files) undo.push(await plant(root, relative(src, f), f));
  return async () => { for (const u of undo.reverse()) await u(); };
}

export { buildSandbox, plant, plantTree };
