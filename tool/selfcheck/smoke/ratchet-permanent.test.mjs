// Храповик не судит по отсутствию то, что появляется не каждый прогон.
//
// ОТКУДА. audit_project, 2026-09-22 (входящие `research/inbox/2026-09-22-…`, И-8 и Г-4): запись
// долга N+1 в чужой библиотеке токенов зажигал один тест — гонка двух потоков. На спокойной
// машине находка есть, под нагрузкой нет, и храповик требовал «вычеркни: починено». Наш
// `kit/ratchet/ratchet.sh` устроен так же и хуже: он вычёркивает сам, в тот же прогон. Находка,
// которая не выпала один раз, пропадает из реестра, а в следующий раз возвращается НОВОЙ —
// красный конвейер без единой правки кода.
//
// УСТРОЙСТВО. Строка `~ <ключ>` — постоянная запись: пропускается, как весь долг, но по
// отсутствию не вычёркивается. Причина обязательна — `# постоянная: …` строкой выше; без неё метка
// стала бы способом навсегда заморозить любой долг молча.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { project, run } from "./_fixture.mjs";

const RATCHET = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "kit", "ratchet", "ratchet.sh")
  .replace(/\\/g, "/");

const HEAD = "# Реестр долга: n-plus-one\n";
const ratchet = (p, cmd) => run(p, "bash", [RATCHET, "reg.txt", "sh", "-c", cmd]);

test("постоянная запись переживает прогон, где она не выпала", (t) => {
  const p = project(t, {
    "reg.txt": HEAD +
      "# постоянная: гонка двух потоков в чужой библиотеке — выпадает не каждый прогон\n" +
      "~ vendor/tokens.py: N+1 при обновлении токена\n" +
      "src/old.py: N+1 в списке\n",
  });
  // Прогон, в котором находка не выпала: обычная запись вычеркивается, постоянная — нет.
  const quiet = ratchet(p, "exit 0");
  assert.equal(quiet.code, 0, quiet.out);
  const reg = readFileSync(join(p.dir, "reg.txt"), "utf8");
  assert.match(reg, /^~ vendor\/tokens\.py: N\+1 при обновлении токена$/m, `постоянная запись вычеркнута:\n${reg}`);
  assert.doesNotMatch(reg, /src\/old\.py/, `обычная исправленная запись не вычеркнута:\n${reg}`);
  // Прогон, в котором она выпала снова: это старый долг, а не новое нарушение.
  const loud = ratchet(p, "echo 'vendor/tokens.py:12: N+1 при обновлении токена'; exit 1");
  assert.equal(loud.code, 0, `вернувшаяся постоянная находка покрашена как новая:\n${loud.out}`);
});

test("постоянная запись без причины — отказ, а не молчаливая заморозка", (t) => {
  const p = project(t, { "reg.txt": HEAD + "~ vendor/tokens.py: N+1 при обновлении токена\n" });
  const r = ratchet(p, "exit 0");
  assert.equal(r.code, 2, `метка без причины принята:\n${r.out}`);
  assert.match(r.out, /причин/, `не сказано, чего не хватает:\n${r.out}`);
});

test("новое нарушение по-прежнему красное рядом с постоянной записью", (t) => {
  const p = project(t, {
    "reg.txt": HEAD + "# постоянная: гонка\n~ vendor/tokens.py: N+1 при обновлении токена\n",
  });
  const r = ratchet(p, "echo 'src/new.py:3: N+1 в карточке'; exit 1");
  assert.equal(r.code, 1, `новое нарушение пропущено:\n${r.out}`);
});
