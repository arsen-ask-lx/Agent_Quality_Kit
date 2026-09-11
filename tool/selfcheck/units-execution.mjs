// tool/selfcheck/units-execution.mjs — исход ЗАПУСКА процесса, отдельно от смысла находки.
// Написаны ДО реализации.
//
// ЗАЧЕМ. `prove.mjs` считал находкой ЛЮБОЙ ненулевой код на красном образце. Опыт 2026-09-09:
// проверка, которая ВИСНЕТ на красном образце и молчит на зелёном, получала вердикт
// `proven: 1, ok: true` — то есть зависший гейт объявлялся ловящим брак. Это `pytest || true`
// в функции, которая считает наш главный уровень.
//
// ПОЧЕМУ НЕЛЬЗЯ ОДНИМ ПРАВИЛОМ «1 — находка, 2+ — сбой». Замер по настоящим инструментам:
//   ruff     чисто 0 · находка 1 (и синтаксическая ошибка тоже 1) · неверный флаг 2
//            · НЕСУЩЕСТВУЮЩИЙ ПУТЬ → 0 и «All checks passed!»
//   eslint   чисто 0 · находка 1 · настройка или внутренняя ошибка 2
//   vulture  чисто 0 · НАХОДКА 3 · плохой ввод 1 · ошибка CLI 2
//   pylint   чисто 0 · находка битовой маской (2 ошибка, 4 предупреждение, 8, 16)
//            · ОШИБКА ВЫЗОВА 32
// Общее правило переврало бы vulture и pylint в обе стороны. Значит знание о кодах живёт
// рядом с инструментом — нормализующим адаптером, а протокол остаётся простым.
import test from "node:test";
import assert from "node:assert/strict";
import { classify, findingCodes, gitBash, launchable, gateCommand } from "../lib/execution.mjs";

// Вход — то, что отдаёт spawnSync: { status, signal, error }.
const R = (over = {}) => ({ status: 0, signal: null, error: undefined, ...over });

test("ноль — чисто, объявленный код находки — находка", () => {
  assert.equal(classify(R({ status: 0 })).state, "clean");
  assert.equal(classify(R({ status: 1 })).state, "finding");
});

// Убитый по таймауту процесс отдаёт status null. Прежний код превращал его в 124 и считал
// находкой — а сам же комментарий рядом называл это «не знаем».
test("таймаут — не находка, а сбой инструмента", () => {
  const r = classify(R({ status: null, signal: "SIGTERM" }));
  assert.equal(r.state, "infra_error");
  assert.equal(r.reason, "timeout");
});

test("убийство сигналом — сбой инструмента", () => {
  const r = classify(R({ status: null, signal: "SIGKILL" }));
  assert.equal(r.state, "infra_error");
  assert.match(r.reason, /timeout|signal/);
});

// Процесс не запустился вовсе: нет программы, нет прав, нет каталога.
// Node при истечении срока ставит И signal, И error с кодом ETIMEDOUT. Если смотреть на
// error первым и не различать его код, таймаут называется «ошибкой запуска»: состояние верное,
// причина ложная. Поймано первым же контрпримером после правки — вердикт стал верным, а
// объяснение врало.
test("таймаут не выдаётся за ошибку запуска: у Node при сроке стоит и signal, и error", () => {
  const timedOut = { status: null, signal: "SIGTERM",
    error: Object.assign(new Error("spawnSync /bin/sh ETIMEDOUT"), { code: "ETIMEDOUT" }) };
  assert.equal(classify(timedOut).reason, "timeout");
  const notFound = { status: null, signal: null,
    error: Object.assign(new Error("spawnSync ENOENT"), { code: "ENOENT" }) };
  assert.equal(classify(notFound).reason, "spawn_error");
});

test("ошибка запуска — сбой инструмента, а не находка", () => {
  const r = classify(R({ status: null, signal: null, error: new Error("spawn ENOENT") }));
  assert.equal(r.state, "infra_error");
  assert.equal(r.reason, "spawn_error");
});

test("неожиданный код — сбой инструмента, а не находка", () => {
  const r = classify(R({ status: 2 }));
  assert.equal(r.state, "infra_error");
  assert.equal(r.reason, "unexpected_exit");
  assert.equal(r.code, 2);
});

// Знание о кодах живёт рядом с инструментом. Числа — из замера, а не из памяти.
test("адаптеры знают свои коды: vulture 3 — находка, pylint 32 — ошибка вызова", () => {
  assert.equal(classify(R({ status: 3 }), findingCodes("vulture")).state, "finding");
  assert.equal(classify(R({ status: 1 }), findingCodes("vulture")).state, "infra_error");

  assert.equal(classify(R({ status: 2 }), findingCodes("pylint")).state, "finding");
  assert.equal(classify(R({ status: 24 }), findingCodes("pylint")).state, "finding");
  assert.equal(classify(R({ status: 32 }), findingCodes("pylint")).state, "infra_error");

  // Незнакомая программа — умолчание: 0 чисто, 1 находка, остальное сбой. Это ЧЕСТНЕЕ, чем
  // догадка: неизвестный код становится «не знаем», а не «поймал».
  assert.equal(classify(R({ status: 1 }), findingCodes("неизвестный-инструмент")).state, "finding");
  assert.equal(classify(R({ status: 3 }), findingCodes("неизвестный-инструмент")).state, "infra_error");
});

test("наши собственные обёртки: 2 — «нет инструмента», а не находка", () => {
  assert.equal(classify(R({ status: 2 }), findingCodes("bash")).state, "infra_error");
});

// --- какой bash запускать на Windows ---------------------------------------------------
// ЗАЧЕМ. На Windows 10/11 в System32 лежит bash.exe — заглушка WSL, и в PATH она стоит раньше
// Git Bash (установщик Git по умолчанию кладёт в PATH только Git\cmd). Команда гейта
// `bash kit/gates/x/check.sh .` уезжала в Linux-подсистему: другие программы, другой git,
// другие пути — и прогон краснел «не из-за кода». Отчёт с живого проекта 2026-09-11: «гейты
// под Windows берут bash из WSL. Через Git Bash все проходят». Известная ловушка, на неё
// наступали Claude Code (issue #23556) и Archon (#1326); общий приём — брать bash рядом с git.
const winFs = (files) => (p) => files.includes(p);
test("Windows: bash берётся рядом с git.exe, а не из PATH", () => {
  const git = "C:\\Program Files\\Git\\cmd\\git.exe";
  const bash = "C:\\Program Files\\Git\\bin\\bash.exe";
  const got = gitBash({ platform: "win32", env: {}, which: () => git, exists: winFs([bash]) });
  assert.equal(got, bash);
});

test("Windows: git из mingw64 и запасной путь в Program Files тоже находятся", () => {
  const bash = "C:\\Program Files\\Git\\bin\\bash.exe";
  const deep = gitBash({ platform: "win32", env: {},
    which: () => "C:\\Program Files\\Git\\mingw64\\bin\\git.exe", exists: winFs([bash]) });
  assert.equal(deep, bash);
  const pf = gitBash({ platform: "win32", env: { ProgramFiles: "C:\\Program Files" },
    which: () => null, exists: winFs([bash]) });
  assert.equal(pf, bash);
});

test("Windows: явный AQK_BASH главнее поиска; не нашли — null, а не заглушка WSL", () => {
  assert.equal(gitBash({ platform: "win32", env: { AQK_BASH: "D:\\x\\bash.exe" }, which: () => null, exists: () => false }),
    "D:\\x\\bash.exe");
  assert.equal(gitBash({ platform: "win32", env: {}, which: () => null, exists: () => false }), null);
});

test("не Windows — bash из PATH как был, команда не трогается", () => {
  assert.equal(gitBash({ platform: "linux", env: {}, which: () => "/usr/bin/git", exists: () => true }), null);
  assert.equal(launchable("bash x.sh .", null), "bash x.sh .");
});

test("подменяется только первое слово bash, в кавычках — путь с пробелом", () => {
  const b = "C:\\Program Files\\Git\\bin\\bash.exe";
  assert.equal(launchable("bash kit/gates/x/check.sh .", b), `"${b}" kit/gates/x/check.sh .`);
  // Внутренний bash обёртки храповика запускает уже Git Bash — у него свой PATH, трогать незачем.
  assert.equal(launchable("bash r/_ratchet.sh r/x.txt bash g/check.sh .", b), `"${b}" r/_ratchet.sh r/x.txt bash g/check.sh .`);
  assert.equal(launchable("bashate lint.sh", b), "bashate lint.sh");
  assert.equal(launchable("npm test", b), "npm test");
});

// Сторож одной точки: команда гейта, запущенная оболочкой В ОБХОД gateCommand, на Windows снова
// уедет в WSL. Пять мест запуска починены разом; шестое, добавленное через месяц, забудет.
test("каждый запуск команды через оболочку идёт через gateCommand", async () => {
  const { readdir, readFile } = await import("node:fs/promises");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const bad = [];
  for (const dir of ["lib", "commands"]) {
    for (const f of (await readdir(join(root, dir))).filter((n) => n.endsWith(".mjs"))) {
      const text = await readFile(join(root, dir, f), "utf8");
      for (const m of text.matchAll(/spawnSync\(([^,]+),\s*\{[^}]*shell:\s*true/g)) {
        if (!m[1].trim().startsWith("gateCommand(")) bad.push(`${dir}/${f}: spawnSync(${m[1].trim()}, …)`);
      }
    }
  }
  assert.deepEqual(bad, [], "запуск в обход gateCommand");
});

// Живьём, на настоящем Windows: модульные проверки выше подставляют пути, а не запускают. Без
// этой строки «windows: pass» в конвейере ничего не говорил о подмене — задание не гоняло ни
// этот файл, ни гейты через комплект. Кавычки в команде двойные: cmd.exe одинарные не снимает.
test("Windows: команда гейта со словом bash отвечает из Git Bash", { skip: process.platform !== "win32" && "только на Windows" }, async () => {
  const { spawnSync } = await import("node:child_process");
  const bash = gitBash();
  assert.ok(bash, "Git Bash не найден рядом с git.exe");
  assert.doesNotMatch(bash, /\\(system32|windowsapps)\\/i, "найдена заглушка WSL, а не Git Bash");
  const r = spawnSync(gateCommand('bash -c "uname -s"'), { shell: true, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /MINGW|MSYS/, `ответил не Git Bash: ${r.stdout}`);
});
