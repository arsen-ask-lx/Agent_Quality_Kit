// Конвейер выпуска обязан ставить всё, что нужно ОБЪЯВЛЕННЫМ гейтам.
//
// ЗАЧЕМ. Шаг выпуска гоняет `doctor --run --min 1`. Гейт, чьей программы нет, выходит с кодом
// 2 «не найден инструмент» — и выпуск встаёт на ровном месте, уже после метки. Так и вышло
// 2026-09-10: объявили `test-not-adjusted`, его арбитр `checkwash` в publish.yml не ставился,
// и выпуск 0.10.1 упал между меткой и публикацией.
//
// В самом publish.yml написано: «этот файл однажды уже разошёлся с ci.yml». Разошёлся второй
// раз — значит нужен сторож, а не третья правка руками. Список выводится из МАНИФЕСТА: какие
// программы объявленные записи называют полем `requires`, те и обязаны ставиться.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

// Имена объявленных гейтов — из .aqk.yml, а не из каталога: ставить нужно то, что гоняется.
function declaredGates() {
  const man = readFileSync(join(ROOT, ".aqk.yml"), "utf8").split("\n");
  const out = [];
  let inGates = false;
  for (const line of man) {
    if (/^gates:/.test(line)) { inGates = true; continue; }
    if (/^[A-Za-z]/.test(line)) inGates = false;
    const m = inGates && /^\s+([A-Za-z0-9_-]+):\s*\S/.exec(line);
    if (m) out.push(m[1]);
  }
  return out;
}

function requiredProgram(slug) {
  const yml = join(ROOT, "kit", "gates", slug, "gate.yml");
  if (!existsSync(yml)) return null;
  const m = /^requires:\s*(\S+)/m.exec(readFileSync(yml, "utf8"));
  return m ? m[1] : null;
}

test("конвейер выпуска ставит программы всех объявленных записей", () => {
  // ЧИТАЮТСЯ ТОЛЬКО СТРОКИ УСТАНОВКИ, а не файл целиком. Первая редакция искала имя по всему
  // тексту — и нашла `checkwash` В КОММЕНТАРИИ, объявив сторожа зелёным ровно тогда, когда
  // выпуск падал. Тот же грех, что ловим весь день, в проверке, написанной против него.
  const wf = readFileSync(join(ROOT, ".github", "workflows", "publish.yml"), "utf8");
  const installed = wf
    .split("\n")
    .filter((l) => /^\s*(pipx install|npm i -g|uv tool install)\s/.test(l))
    .join("\n");
  const missing = declaredGates()
    .map((g) => requiredProgram(g))
    .filter(Boolean)
    .filter((prog) => !installed.includes(prog));
  assert.deepEqual(missing, [],
    `publish.yml не ставит: ${missing.join(", ")} — выпуск встанет после метки`);
});
