// tool/selfcheck/smoke/_fixture.mjs — общая оснастка проверок, гоняющих сам инструмент.
//
// ЗАЧЕМ ОТДЕЛЬНЫЙ ФАЙЛ. В `smoke.sh` фикстура «временный проект под git» написана сорок раз
// подряд одними и теми же четырьмя строками. Это не похожие строки, а ОДНО знание в сорока
// местах: меняется устройство подопытного проекта — правится сорок мест, и они расходятся.
//
// ЧТО ЗДЕСЬ ЗАКРЫТО, кроме дублирования (всё — из разборов флейков и из нашего же опыта):
//   · СВОЙ каталог на проверку и уборка после неё — через `t.after`, а не «не забыть rm»;
//   · ТАЙМАУТ на каждый запуск: висящий подпроцесс иначе держит конвейер до его предела;
//   · ГЕРМЕТИЧНОСТЬ: HOME и TMPDIR в песочнице, сеть выключена. Прогон обязан давать один
//     ответ на любой машине и в любой день — иначе зелёное значит «сегодня совпало».
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const CLI = join(ROOT, "tool", "program.mjs");

// Предел на один запуск. Тридцать секунд — с запасом: самый долгий наш прогон в фикстуре
// (`start` со всеми записями) укладывается в единицы секунд. Предел нужен не ради скорости,
// а ради того, чтобы висящий процесс называл себя, а не съедал бюджет задания молча.
const TIMEOUT_MS = 30000;

function env(home) {
  return {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    TMPDIR: join(home, "tmp"),
    AQK_LANG: "ru",
    // Сеть в тестах — отдельный класс флейков, и у нас она включалась ТОЛЬКО вне конвейера:
    // локально проверки были сетевыми, в конвейере нет. Две разные среды по построению.
    AQK_UPDATE: "0",
  };
}

// Подопытный проект: свой каталог, свой git, свой дом. Файлы задаются картой «путь → текст»,
// потому что имя файла в такой проверке — часть утверждения, а не деталь.
function project(t, files = {}, { git = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "aqk-smoke-"));
  const home = join(dir, ".home");
  mkdirSync(join(home, "tmp"), { recursive: true });
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [rel, text] of Object.entries(files)) {
    const full = join(dir, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text, "utf8");
  }
  const p = { dir, home };
  if (git) {
    run(p, "git", ["init", "-q", "."]);
    run(p, "git", ["config", "user.email", "t@t"]);
    run(p, "git", ["config", "user.name", "t"]);
  }
  return p;
}

// Запуск чего угодно в каталоге проекта. Возвращается И код, И вывод: проверка, смотрящая
// только на код, не умеет объяснить провал, а смотрящая только на вывод — не умеет заметить,
// что команда не роняет прогон.
function run({ dir, home }, cmd, args = []) {
  const r = spawnSync(cmd, args, {
    cwd: dir, encoding: "utf8", timeout: TIMEOUT_MS, env: env(home),
  });
  return { code: r.status, out: `${r.stdout || ""}${r.stderr || ""}` };
}

const aqk = (p, ...args) => run(p, process.execPath, [CLI, ...args]);
const gate = (p, name) => run(p, "bash", [join(ROOT, "kit", "gates", name, "check.sh"), p.dir]);

// Наружу — только то, что зовут проверки. `run`, `ROOT` и `CLI` остаются внутри: экспорт,
// который никто не берёт, читается как часть договора и мешает менять внутренности. Поймал
// наш же dead-code через минуту после того, как файл был написан.
export { project, aqk, gate };
