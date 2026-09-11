// tool/commands/vitals.mjs — «всё ли у самого комплекта подключено».
//
// ЗАЧЕМ ОТДЕЛЬНАЯ КОМАНДА. `doctor` смотрит на РЕПОЗИТОРИЙ, `prove` — на гейты, `context` —
// на состояние. На саму обвязку не смотрит никто: стоят ли инструменты, которых требуют
// объявленные гейты; прописан ли хук в `.git/hooks` НА САМОМ ДЕЛЕ, а не только в конфиге;
// получает ли агент состояние. Сегодня это выясняется красным гейтом посреди коммита — в
// худший момент из возможных, когда человек занят другим и просто выключит проверку.
//
// ЧЕТЫРЕ СОСТОЯНИЯ, А НЕ ДВА, И КАЖДОЕ ЗАРАБОТАНО.
//   ✔  подключено;
//   ✘  СЛОМАНО — объявленный гейт не состоится: нет инструмента, потеряна строка манифеста;
//   ·  не подключено, и это выбор — хука pre-commit нет, потому что гоняют в конвейере;
//   ~  посмотреть не смогли.
//
// Первая версия ставила `✘` хуку, которого нет. На нашем же репозитории вышло два креста за
// сознательное решение: pre-commit локально мы не ставим, проверки идут в CI. Команда, которая
// кричит «сломано» про выбор, — ровно та, которую выключают в первый день, и вместе с ней
// перестают читать настоящие отказы. Кода возврата касается только `✘`.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CWD, MANIFEST, SELF, c, exists } from "../lib/core.mjs";
import { readManifest, unparsedLines, gateRequires } from "../lib/manifest.mjs";
import { whichSync } from "../lib/repo.mjs";
import { gitBash } from "../lib/execution.mjs";
import { updateWanted } from "../lib/brief.mjs";
import { L } from "../i18n/index.mjs";

// Чистая функция: на входе факты, на выходе строки. Отделена от чтения диска намеренно —
// «неизвестно» проверяется перебором случаев, а не прогоном, потому что случай «не смогли
// посмотреть» на исправной машине не воспроизвести.
function vitalsRows(f) {
  const t = L.vitals;
  const missing = (f.tools || []).filter((x) => !x.found);
  const rows = [
    {
      key: "tools",
      ok: (f.tools || []).length === 0 ? null : missing.length === 0,
      detail: missing.length
        ? t.toolsMissing(missing.map((x) => `${x.prog} (${x.gate})`).join(", "))
        : t.toolsOk((f.tools || []).length),
    },
    {
      key: "manifest",
      ok: f.unparsed > 0 ? false : true,
      detail: f.unparsed > 0 ? t.manifestBad(f.unparsed) : t.manifestOk,
    },
    {
      key: "preCommit",
      ok: f.preCommit === null ? null : f.preCommit ? true : "no",
      detail: f.preCommit === null ? t.unknownHook : f.preCommit ? t.preCommitOk : t.preCommitNo,
    },
    {
      key: "sessionHook",
      ok: f.sessionHook === null ? null : f.sessionHook ? true : "no",
      detail: f.sessionHook === null ? t.unknownHook : f.sessionHook ? t.sessionOk : t.sessionNo(`${SELF} context --install`),
    },
  ];
  // Устаревшая версия — не отказ: человек мог закрепить её сознательно, и ронять за это нельзя.
  //
  // СОСТОЯНИЙ ТРИ, А НЕ ДВА. Реестр может ответить ошибкой — не упасть, а вернуть не-200; тогда
  // `latest` пустой, и прежняя ветка печатала «свежая». Посмотреть не смогли, а сказали «всё
  // хорошо»: тот самый грех, против которого написан весь комплект, у него самого. Найдено
  // аудитом фич 2026-09-09.
  if (f.version) {
    const latest = String(f.version.latest || "");
    rows.push({
      key: "version",
      ok: null,
      detail: !latest
        ? t.versionUnknown(f.version.current)
        : latest !== f.version.current
          ? t.versionOld(latest, f.version.current)
          : t.versionOk(f.version.current),
    });
  }
  return rows;
}

function vitalsVerdict(rows) {
  return rows.some((r) => r.ok === false) ? 1 : 0;
}

// Первое слово команды — та программа, без которой гейт не состоится. Обёртки снимаются:
// `bash x.sh` требует bash, а не x.sh; `npx --yes knip@6` требует npx.
function progOf(cmd) {
  const parts = String(cmd || "").trim().split(/\s+/);
  return parts[0] || "";
}

async function cmdVitals() {
  const man = await readManifest();
  const gates = man?.gates && typeof man.gates === "object" && !Array.isArray(man.gates) ? man.gates : {};

  const seen = new Map();
  for (const [gate, cmd] of Object.entries(gates)) {
    const prog = progOf(cmd);
    if (!prog || seen.has(prog)) continue;
    // На Windows слово `bash` в PATH — часто заглушка WSL, и «найден» было бы неправдой: гейт
    // запустится через Git Bash (gateCommand) или не запустится вовсе. Спрашиваем того же, кого
    // спросит прогон, — иначе vitals и doctor --run снова разойдутся.
    const found = prog === "bash" && process.platform === "win32" ? Boolean(gitBash()) : Boolean(whichSync(prog));
    seen.set(prog, { gate, prog, found });
  }

  // Первого слова мало. Запись каталога бывает обёрткой: команда начинается с `bash`, который
  // есть всегда, а работать без `slopcheck` или `zizmor` она не может — и `doctor --run`
  // краснеет там, где `vitals` печатал «все инструменты на месте». Ровно тот разрыв, ради
  // закрытия которого эта команда и заведена. Программа названа в `requires:` записи.
  // Найдено 2026-09-09 сверкой вывода двух команд на одном репозитории.
  const samplesDir = typeof man?.samples === "string" ? man.samples.trim() : "";
  for (const gate of Object.keys(gates)) {
    const missing = await gateRequires(samplesDir, gate, whichSync);
    for (const prog of missing || []) {
      if (seen.has(prog)) continue;
      seen.set(prog, { gate, prog, found: false });
    }
  }

  let unparsed = 0;
  try { unparsed = unparsedLines(await readFile(join(CWD, MANIFEST), "utf8")).length; } catch { /* манифеста нет */ }

  // Хук pre-commit проверяется в `.git/hooks`, а НЕ в `.pre-commit-config.yaml`. Запись в
  // конфиге — это намерение; сработает только то, что лежит в самом гите. Ровно та разница,
  // ради которой весь комплект: объявлено и работает — разные утверждения.
  let preCommit = null;
  const hook = join(CWD, ".git", "hooks", "pre-commit");
  if (await exists(join(CWD, ".git"))) {
    preCommit = false;
    if (await exists(hook)) {
      try { preCommit = /pre-commit|aqk/i.test(await readFile(hook, "utf8")); } catch { preCommit = null; }
    }
  }

  let sessionHook = null;
  const settings = join(CWD, ".claude", "settings.json");
  if (await exists(join(CWD, ".claude"))) {
    sessionHook = false;
    if (await exists(settings)) {
      try {
        const s = JSON.parse(await readFile(settings, "utf8"));
        sessionHook = JSON.stringify(s?.hooks?.SessionStart || []).includes("context");
      } catch { sessionHook = null; }
    }
  }

  let version = null;
  if (updateWanted()) {
    try {
      const { PKG_ROOT } = await import("../lib/core.mjs");
      const current = JSON.parse(await readFile(join(PKG_ROOT, "package.json"), "utf8")).version || "";
      const r = await fetch("https://registry.npmjs.org/agent-quality-kit/latest", {
        signal: AbortSignal.timeout(3000),
        headers: { accept: "application/vnd.npm.install-v1+json" },
      });
      version = { current, latest: r.ok ? String((await r.json()).version || "") : "" };
    } catch { /* сети нет — строку про версию просто не покажем */ }
  }

  const rows = vitalsRows({ tools: [...seen.values()], unparsed, preCommit, sessionHook, version });
  console.log(c.bold(`\n  ${L.vitals.title}\n`));
  for (const r of rows) {
    const mark = r.ok === true ? c.green("✔")
      : r.ok === false ? c.red("✘")
      : r.ok === "no" ? c.yellow("·")
      : c.dim("~");
    console.log(`  ${mark}  ${L.vitals.names[r.key].padEnd(22)} ${r.ok === false ? r.detail : c.dim(r.detail)}`);
  }
  console.log("");
  process.exit(vitalsVerdict(rows));
}

export { cmdVitals, vitalsRows, vitalsVerdict };
