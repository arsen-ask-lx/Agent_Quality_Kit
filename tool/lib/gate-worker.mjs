// tool/lib/gate-worker.mjs — рабочий поток параллельного прогона (`doctor --run --jobs N`).
//
// ПОЧЕМУ ПОТОК, А НЕ АСИНХРОННЫЙ ЗАПУСК. Прогон стоит на `spawnSync` с таймаутом: его поведение
// на зависшем гейте замерено и описано (execution.mjs). Асинхронный `spawn` потребовал бы своего
// убийства дерева процессов на таймауте — на Windows это отдельная история. Поток выполняет ТОТ ЖЕ
// `spawnSync` с тем же таймаутом, и семантика прогона не меняется ни в чём, кроме одновременности.
// Зависимостей это не добавляет: worker_threads встроены в Node.
import { parentPort } from "node:worker_threads";
import { spawnSync } from "node:child_process";
import { gateCommand } from "./execution.mjs";

parentPort.on("message", ({ id, cmd, cwd, timeout }) => {
  const r = spawnSync(gateCommand(cmd), { shell: true, cwd, encoding: "utf8", timeout });
  parentPort.postMessage({
    id, status: r.status, stdout: r.stdout || "", stderr: r.stderr || "",
    error: r.error ? { code: r.error.code || String(r.error.message || r.error) } : null,
  });
});
