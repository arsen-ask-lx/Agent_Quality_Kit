// Прогон, который не может состояться, обязан сказать это, а не показать пятнадцать крестов.
//
// НАЙДЕНО ЧУЖИМ РАЗБОРОМ 2026-09-16. `smoke.sh`, запущенный внутри песочницы Codex, дал 15
// падений из 123. Настоящая причина: дочерним процессам Node запрещалось запускать git и npm —
// `spawnSync` возвращал EPERM. Проверки об этом не знали и печатали обычные кресты. Человек
// час разбирал несуществующие дефекты, а строка «дефекты AQK 0.15.0» уехала в чужой отчёт.
//
// ИРОНИЯ, РАДИ КОТОРОЙ ЭТОТ ФАЙЛ И НАПИСАН. `tool/lib/execution.mjs` различает три исхода —
// clean · finding · infra_error — именно затем, чтобы сбой инструмента не выдавался за приговор
// коду. Своей собственной оснастке мы это правило не применили.
//
// ЧАСТИЧНЫЙ ПРОГОН НИЧЕГО НЕ ДОКАЗЫВАЕТ: 108 зелёных из 123 при недоступном git — не «почти
// всё хорошо», а «мерить было нечем». Поэтому предполёт отказывает целиком и выходит кодом 3 —
// тем же, которым pytest отделяет INTERNAL_ERROR от провала теста (их код 1).
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SMOKE = join(ROOT, "tool", "selfcheck", "smoke.sh");

const WIN = process.platform === "win32";

// Заглушка вместо настоящей программы: выходит кодом 126 — «найдено, но запустить нельзя».
// Ровно то, чем для нас выглядел запрет песочницы.
//
// ДВА ФАЙЛА, А НЕ ОДИН. Поймано windows-заданием конвейера: скрипт без расширения там не
// перехватывает ничего — CreateProcess ищет `.exe`/`.cmd` по PATHEXT, а Git Bash понимает
// shebang. Значит нужны обе заглушки сразу, иначе проверка молча меряет настоящий git и
// краснеет на исправной машине — то есть сама становится тем ложным красным, против которого
// написан предполёт.
function stubDir(t, name) {
  const dir = mkdtempSync(join(tmpdir(), "aqk-stub-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, name), "#!/bin/sh\nexit 126\n", "utf8");
  chmodSync(join(dir, name), 0o755);
  if (WIN) writeFileSync(join(dir, `${name}.cmd`), "@echo off\r\nexit /b 126\r\n", "utf8");
  return dir;
}

const runPreflight = (extraPath) => spawnSync("bash", [SMOKE, "--preflight-only"], {
  encoding: "utf8", timeout: 60000,
  env: { ...process.env, PATH: extraPath ? `${extraPath}:${process.env.PATH}` : process.env.PATH, AQK_LANG: "ru" },
});

test("предполёт: исправная машина проходит и ничего не ломает", () => {
  const r = runPreflight(null);
  assert.equal(r.status, 0, `предполёт отказал на исправной машине:\n${r.stdout}${r.stderr}`);
});

test("предполёт: недоступный git — это «не смогли проверить», а не падения проверок", (t) => {
  const r = runPreflight(stubDir(t, "git"));
  assert.equal(r.status, 3,
    `код ${r.status}: запрет среды неотличим от провала проверок. Нужен 3 — тот же, которым pytest отделяет внутреннюю ошибку от провала теста`);
  const out = `${r.stdout || ""}${r.stderr || ""}`;
  assert.match(out, /git/i, "не сказано, ЧТО именно недоступно");
  assert.doesNotMatch(out, /✘/, `предполёт напечатал крест — значит выдал сбой среды за находку:\n${out}`);
});

// Тот самый случай из отчёта: сам шелл git видит, а подпроцессы Node — нет. Проверять только
// первое значило бы пройти предполёт и упасть пятнадцатью крестами следом.
test("предполёт: git виден шеллу, но не подпроцессу Node — тоже отказ", (t) => {
  const dir = stubDir(t, "git");
  // `shell` — тот же, что в самом предполёте: на Windows без оболочки Node не видит ни `.cmd`
  // заглушки, ни настоящего `npm`. Проверка обязана звать так же, как зовёт код, иначе она
  // проверяет не его. Ровно на этом конвейер и поймал первую версию.
  const probe = `const r=require("node:child_process").spawnSync("git",["--version"],{shell:${WIN}}); process.exit(r.status===0?0:3)`;
  const r = spawnSync("bash", ["-c", `PATH="${dir}:$PATH" node -e '${probe}'`],
    { encoding: "utf8", timeout: 30000 });
  assert.equal(r.status, 3, "оснастка проверки неверна: заглушка не перехватывает git у Node");
});
