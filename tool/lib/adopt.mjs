// tool/lib/adopt.mjs — проверки, которые у проекта УЖЕ ЕСТЬ. Читаются из его собственных
// файлов, а не выдумываются.
//
// ЗАЧЕМ. Комплект, поставленный в `express` — проект с eslint, mocha и конвейером, — показывал
// двадцать крестов подряд и «держит машина 0». С точки зрения владельца это неправда: его
// проверки держат, просто мы считали только СВОИ записи. Мы видели, что конвейер ЕСТЬ
// (`has_ci`), но не читали, что в нём, и человек должен был переписать в манифест руками то,
// что мы могли прочитать сами. Отсюда и «не понимает, что у него хорошо»: хорошее уже есть, а
// мы о нём молчим.
//
// ОТДЕЛЬНЫМ ФАЙЛОМ, а не в repo.mjs: там осмотр репозитория ради НАШЕГО каталога, здесь —
// чтение ЧУЖИХ конфигов, и у каждого источника свой формат, который меняется по своим
// причинам. Шов вскрыл наш же `file-size-limit`: с python-источниками repo.mjs перевалил бы
// за 500 строк.
//
// ПРЕДЛАГАЕМ, А НЕ ОБЪЯВЛЯЕМ. Гейт, вписанный в чужой манифест без спроса, — это наше решение
// в чужом файле; и человек обязан видеть ИСТОЧНИК, иначе предложение неотличимо от догадки.
//
// Сборка и запуск проверками не считаются: `build` собирает, `start` запускает, судит — ни тот
// ни другой. Берём только то, что отвечает «прошло или нет».
const CHECK_NAMES = new Set(["test", "tests", "lint", "typecheck", "type-check", "types", "check"]);

// Окружения tox, которые судят, а не гоняют тесты под матрицей версий. Голый `tox` не
// предлагаем: он проходит все интерпретаторы из envlist, и у человека без пяти питонов это
// красный прогон на пустом месте. Имена сняты с живых tox-файлов (rich, click, flask).
const TOX_CHECKS = new Set(["lint", "style", "typing", "types", "type", "mypy", "check", "typecheck"]);

// Источники в порядке доверия: при совпадении имени берётся первый. Замер 2026-09-11 на
// восьми python-проектах: package.json нет ни у кого, Makefile у трёх, `.pre-commit-config.yaml`
// у семи, tox у пяти, scripts/ у httpx. Шаги конвейера НЕ читаются: там `${{ matrix.x }}`,
// `PYTHONPATH=…` и обёртки `uv run --locked --group …` — строка, которая работает только в
// том конвейере, предложенная как локальный гейт, покраснела бы у человека в первую же минуту.
function proposeGates(files = {}) {
  const out = [];
  const seen = new Set();
  const push = (name, cmd, source) => {
    const key = name === "tests" ? "test" : name.replace(/^type-?check$|^types$/, "typecheck");
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ name: key, cmd, source });
  };

  const pkg = files["package.json"];
  if (pkg) {
    let scripts = null;
    try { scripts = JSON.parse(pkg)?.scripts; } catch { scripts = null; }
    if (scripts && typeof scripts === "object") {
      for (const name of Object.keys(scripts)) {
        if (!CHECK_NAMES.has(name)) continue;
        // `npm test` — каноничное написание для теста, остальное через `run`.
        push(name, name === "test" || name === "tests" ? "npm test" : `npm run ${name}`, "package.json");
      }
    }
  }

  const mk = files.Makefile;
  if (typeof mk === "string") {
    for (const m of mk.matchAll(/^([A-Za-z][\w-]*):/gm)) {
      if (CHECK_NAMES.has(m[1])) push(m[1], `make ${m[1]}`, "Makefile");
    }
  }

  // pre-commit — одна команда на всё, что в нём стоит. Хуки называются поимённо: «у вас есть
  // .pre-commit-config.yaml» ничего не говорит, «у вас есть ruff-check и check-yaml» — говорит.
  const pc = files[".pre-commit-config.yaml"];
  if (typeof pc === "string") {
    const ids = [...pc.matchAll(/^\s*-\s*id:\s*["']?([\w.-]+)/gm)].map((m) => m[1]);
    if (ids.length) {
      const shown = ids.slice(0, 4).join(", ") + (ids.length > 4 ? ` +${ids.length - 4}` : "");
      push("pre-commit", "pre-commit run --all-files", `.pre-commit-config.yaml: ${shown}`);
    }
  }

  // tox живёт в двух местах и двух синтаксисах: `[testenv:lint]` в tox.ini (и внутри
  // legacy_tox_ini в pyproject), `[tool.tox.env.lint]` в pyproject.toml нового образца.
  for (const src of ["tox.ini", "pyproject.toml"]) {
    const t = files[src];
    if (typeof t !== "string") continue;
    for (const m of t.matchAll(/^\s*\[(?:testenv:|tool\.tox\.env\.)([\w-]+)\]/gm)) {
      if (TOX_CHECKS.has(m[1])) push(m[1], `tox -e ${m[1]}`, src);
    }
  }

  // Каталог scripts/ с исполняемыми test, check, lint — соглашение encode (httpx, starlette):
  // конвейер зовёт ровно их. Содержимое не читаем, важно только, что файл есть.
  for (const name of ["test", "check", "lint"]) {
    if (`scripts/${name}` in files) push(name, `scripts/${name}`, "scripts/");
  }

  return out;
}

// Какие файлы читать — знает тот, кто их разбирает. Список в команде разошёлся бы с разбором
// в первый же день, когда появится новый источник.
const ADOPT_FILES = ["package.json", "Makefile", ".pre-commit-config.yaml", "tox.ini", "pyproject.toml"];
const ADOPT_SCRIPTS = ["scripts/test", "scripts/check", "scripts/lint"];

// Чтение с диска — отдельно от разбора: разбор проверяется перебором случаев, чтение — прогоном.
async function readAdoptFiles(cwd) {
  const { readFile, access } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const files = {};
  for (const n of ADOPT_FILES) {
    try { files[n] = await readFile(join(cwd, n), "utf8"); } catch { /* нет — и ладно */ }
  }
  for (const n of ADOPT_SCRIPTS) {
    try { await access(join(cwd, n)); files[n] = ""; } catch { /* нет — и ладно */ }
  }
  return files;
}

export { proposeGates, readAdoptFiles };
