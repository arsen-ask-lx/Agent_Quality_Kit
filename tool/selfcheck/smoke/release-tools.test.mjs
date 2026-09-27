// Выпуск публикует только то, что прошло полный конвейер, — и конвейер ставит всё, что нужно
// ОБЪЯВЛЕННЫМ гейтам.
//
// ИСТОРИЯ. До 2026-09-27 выпуск сам гонял `doctor --run --min 1` и потому обязан был ставить
// программы всех объявленных гейтов. 2026-09-10 он их не поставил (`checkwash` для
// `test-not-adjusted`), и выпуск 0.10.1 упал между меткой и публикацией.
//
// 2026-09-27 выпуск перестал повторять прогон: тот же коммит уже прошёл конвейер `ci.yml`, и
// прошёл полнее — со строгим режимом, Windows и образом. Выпуск теперь требует, чтобы конвейер
// на ЭТОМ коммите был зелёным. Требование «ставь инструменты объявленных гейтов» переехало туда,
// где гейты гоняются, — в задание `check` конвейера. Здесь оба правила сторожатся машиной.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
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

// ЧИТАЮТСЯ ТОЛЬКО СТРОКИ УСТАНОВКИ, а не файл целиком. Первая редакция искала имя по всему
// тексту — и нашла `checkwash` В КОММЕНТАРИИ, объявив сторожа зелёным ровно тогда, когда
// выпуск падал.
function installedIn(file) {
  return readFileSync(join(ROOT, ".github", "workflows", file), "utf8")
    .split("\n")
    .filter((l) => /^\s*(pipx install|npm i -g|uv tool install)\s/.test(l))
    .join("\n");
}
// Строки команд без комментариев: слово в комментарии — не шаг.
const steps = (file) => readFileSync(join(ROOT, ".github", "workflows", file), "utf8")
  .split("\n").filter((l) => !/^\s*#/.test(l)).join("\n");

test("конвейер ставит программы всех объявленных записей", () => {
  const installed = installedIn("ci.yml");
  const missing = declaredGates()
    .map((g) => requiredProgram(g))
    .filter(Boolean)
    .filter((prog) => !installed.includes(prog));
  assert.deepEqual(missing, [],
    `ci.yml не ставит: ${missing.join(", ")} — гейт выйдет с кодом 2 «нет инструмента»`);
});

test("выпуск публикует только коммит, на котором конвейер зелёный", () => {
  const wf = steps("publish.yml");
  const gate = wf.search(/actions\/workflows\/ci\.yml\/runs\?head_sha=/);
  const publish = wf.search(/npm publish/);
  assert.ok(gate >= 0, "publish.yml не сверяется с конвейером на этом коммите — выйдет непроверенное");
  assert.ok(publish > gate, "публикация стоит раньше сверки с конвейером");
  assert.match(wf, /conclusion/, "сверка не смотрит на итог прогона — «был прогон» не значит «зелёный»");
});

test("выпуск либо не гоняет гейты сам, либо ставит их программы", () => {
  const wf = steps("publish.yml");
  if (!/doctor\s+--run/.test(wf)) return;
  const installed = installedIn("publish.yml");
  const missing = declaredGates().map(requiredProgram).filter(Boolean).filter((p) => !installed.includes(p));
  assert.deepEqual(missing, [], `publish.yml гоняет гейты и не ставит: ${missing.join(", ")}`);
});
