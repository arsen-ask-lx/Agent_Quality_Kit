// Объявленную проверку нельзя выключить правкой конфигурации инструмента.
//
// ОТКУДА ВОПРОС. Пакет 3 цикла 1 (`research/2026-09-23-upstream-practices/ROADMAP.md`):
// у соседа `smixs/code-quality` настройки анализатора считаются частью поверхности атаки.
// Храповик `protection-not-removed` сторожит НАБОР гейтов в `.aqk.yml` — удалить строку нельзя.
// Конфигурацию инструмента, который гейт зовёт, не сторожил никто, а исключить в ней путь
// дешевле, чем удалить гейт, и в дифе выглядит настройкой, а не снятием защиты.
//
// ЗАМЕР 2026-09-26, чем оно было до правки (ruff 0.16.7, pylint 4.0.8, vulture 2.16):
//   ruff --select T20 .                 + ruff.toml extend-exclude = ["src"]      → код 0
//   ruff --select T20 .                 + ruff.toml per-file-ignores              → код 0
//   ruff --select BLE,TRY400,SIM105 .   + pyproject [tool.ruff] extend-exclude    → код 0
//   pylint --enable=R0801 .             + pylintrc ignore=src                     → код 0
//   vulture --min-confidence 60 .       + pyproject [tool.vulture] exclude        → код 0
// Нарушение всё это время оставалось в коде на месте. Пять зелёных на пяти настоящих дефектах.
//
// ПОЧЕМУ ИСПРАВЛЯЕТСЯ ИМЕННО ПУТЬ, А НЕ ВСЁ ПОДАВЛЕНИЕ. У AQK есть ОДНО место, где проект
// называет, чего не смотреть, — `.aqkignore`, и `aqk report` печатает его содержимое отдельной
// графой. Значит исключение пути в конфиге инструмента — второй источник той же правды, и он
// невидим. Подавление ПО ИМЕНИ (`# noqa: T201`, `[tool.vulture] ignore_names`) остаётся
// законным: `gate-not-weakened` намеренно краснеет только на БЕЗАДРЕСНОМ подавлении, а замены
// именам у `.aqkignore` нет — забрать имена значит получить ложные срабатывания на каркасных
// обратных вызовах и выключенный гейт вместо честного.
//
// ЧТО ЭТА ПРОВЕРКА НЕ ДОКАЗЫВАЕТ. Только эти версии этих трёх инструментов и только путь.
// Остальные ключи конфигурации (`target-version`, `select` в конфиге, whitelist vulture)
// не испытаны, и обещать про них нечего.
import test from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { project, run } from "./_fixture.mjs";
import { readCatalog, whichSync } from "../../lib/repo.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const NATIVE = String(join(ROOT, "kit", "gates", "_native.sh")).replace(/\\/g, "/");

const catalog = await readCatalog();
const recipe = (gate, lang) => {
  const rec = catalog.find((e) => e.slug === gate);
  assert.ok(rec, `в каталоге нет записи ${gate}`);
  const cmd = rec.recipes?.[lang];
  assert.ok(cmd, `у записи ${gate} нет рецепта под ${lang}`);
  return String(cmd);
};

// Рецепт зовётся ТЕМ ЖЕ путём, которым его зовёт установленный гейт: через `_native.sh`,
// с каталогом «.» и cwd в проекте. Иначе проверялась бы строка из файла, а не поведение:
// именно cwd решает, найдёт ли инструмент конфигурацию проекта.
const runRecipe = (p, cmd) =>
  run(p, "bash", [NATIVE, ".", ...cmd.replace("{dir}", ".").split(/\s+/)]);

const PRINT = { "src/a.py": 'def f():\n    print("debug")\n' };
const SWALLOW = { "src/a.py": "def f():\n    try:\n        g()\n    except Exception:\n        pass\n" };
const DUP_BODY = Array.from({ length: 9 }, (_, i) => `    x${i} = ${i}`).join("\n");
const DUP = { "src/a.py": `def a():\n${DUP_BODY}\n`, "src/b.py": `def b():\n${DUP_BODY}\n` };
// Маркер долга в образце склеивается из двух частей НАМЕРЕННО: написанный целиком, он
// становится настоящей находкой гейта `todo-without-task` в нашем же коде — поймано
// первым же полным прогоном. Прятать находку в красном каталоге `red/` тут нельзя:
// `_native.sh` такие пути фильтрует, и проверка стала бы зелёной по построению.
const DEAD = { "src/a.py": "def never_used():\n    return 1\n" };

// Каждый случай — тройка, а не одна атака: без атаки гейт обязан краснеть (иначе проверка
// доказывает лишь то, что инструмент не запустился), с атакой — тоже краснеть, а на чистом
// коде с тем же конфигом — молчать (иначе лечение оказалось бы ложным срабатыванием).
const CASES = [
  {
    tool: "ruff", gate: "no-print-in-prod", lang: "python", files: PRINT,
    clean: { "src/a.py": "def f():\n    return 1\n" },
    attacks: {
      "ruff.toml extend-exclude": { "ruff.toml": 'extend-exclude = ["src"]\n' },
      "ruff.toml per-file-ignores": { "ruff.toml": '[lint.per-file-ignores]\n"src/*.py" = ["T201"]\n' },
      "pyproject extend-exclude": { "pyproject.toml": '[tool.ruff]\nextend-exclude = ["src"]\n' },
    },
  },
  {
    tool: "ruff", gate: "swallowed-error", lang: "python", files: SWALLOW,
    clean: { "src/a.py": "def f():\n    try:\n        g()\n    except ValueError as e:\n        raise RuntimeError from e\n" },
    attacks: { "ruff.toml extend-exclude": { "ruff.toml": 'extend-exclude = ["src"]\n' } },
  },
  {
    tool: "ruff", gate: "todo-without-task", lang: "python", files: { "src/a.py": `# ${"TO" + "DO"}: починить\ndef f():\n    return 1\n` },
    clean: { "src/a.py": "def f():\n    return 1\n" },
    attacks: { "ruff.toml extend-exclude": { "ruff.toml": 'extend-exclude = ["src"]\n' } },
  },
  {
    tool: "pylint", gate: "duplicate-code", lang: "python", files: DUP,
    clean: { "src/a.py": "def a():\n    return 1\n" },
    attacks: {
      "pylintrc ignore": { pylintrc: "[MASTER]\nignore=src\n" },
      "pylintrc ignore-patterns": { pylintrc: "[MASTER]\nignore-patterns=^a.*\n" },
    },
  },
  {
    tool: "vulture", gate: "dead-code", lang: "python", files: DEAD,
    clean: { "src/a.py": "def used():\n    return 1\n\nused()\n" },
    attacks: { "pyproject exclude": { "pyproject.toml": '[tool.vulture]\nexclude = ["src/"]\n' } },
  },
];

for (const c of CASES) {
  const has = whichSync(c.tool);
  test(`${c.gate}: конфигурация ${c.tool} не отменяет находку`, { skip: has ? false : `нет ${c.tool}` }, (t) => {
    const cmd = recipe(c.gate, c.lang);

    // Контроль до всякой атаки. Без него зелёное на атаке нельзя отличить от инструмента,
    // который вообще ничего не нашёл бы.
    const base = runRecipe(project(t, c.files), cmd);
    assert.equal(base.code, 1, `без конфигурации гейт обязан краснеть, а дал ${base.code}:\n${base.out}`);

    for (const [name, cfg] of Object.entries(c.attacks)) {
      const bad = runRecipe(project(t, { ...c.files, ...cfg }), cmd);
      assert.equal(bad.code, 1, `${name} снял находку: код ${bad.code}, а нарушение в коде на месте\n${bad.out}`);

      const ok = runRecipe(project(t, { ...c.clean, ...cfg }), cmd);
      assert.equal(ok.code, 0, `${name} на ЧИСТОМ коде дал ${ok.code} — лечение стало ложным срабатыванием\n${ok.out}`);
    }
  });
}

// Поведенческие случаи выше покрывают четыре записи. Записей с этими инструментами больше, и
// новая появится без этого файла, поэтому договор проверяется ещё и по всему каталогу: рецепт,
// зовущий ruff, pylint или vulture, обязан нести флаг, отменяющий исключение пути из конфига.
// Это утверждение о СТРОКЕ, и оно слабее прогона — но оно ловит рецепт, добавленный завтра.
const ISOLATION = {
  ruff: [/(^|\s)--isolated(\s|$)/],
  pylint: [/--ignore=(\s|$)/, /--ignore-patterns=(\s|$)/],
  vulture: [/--exclude\s+\S/],
};

test("каждый рецепт ruff, pylint и vulture отменяет исключения из конфигурации", () => {
  const bad = [];
  for (const rec of catalog) {
    for (const [lang, cmd] of Object.entries(rec.recipes || {})) {
      const prog = String(cmd).trim().split(/\s+/)[0];
      const need = ISOLATION[prog];
      if (!need) continue;
      for (const re of need) {
        if (!re.test(String(cmd))) bad.push(`${rec.slug}/${lang}: нет ${re.source} в «${cmd}»`);
      }
    }
  }
  assert.deepEqual(bad, [], `рецепты, где исключение из конфига инструмента снимет находку:\n${bad.join("\n")}`);
});
