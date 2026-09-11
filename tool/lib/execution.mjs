// tool/lib/execution.mjs — ИСХОД ЗАПУСКА процесса, отдельно от смысла находки.
//
// ЗАЧЕМ. Прежде `prove.mjs` считал находкой ЛЮБОЙ ненулевой код на красном образце. Опыт
// 2026-09-09: проверка, которая ВИСНЕТ на красном образце и молчит на зелёном, получала вердикт
// `proven: 1, ok: true` — зависший гейт объявлялся ловящим брак. Это `pytest || true` в функции,
// считающей наш главный уровень. Тот же класс поймал перемежающийся отказ прогона: под
// нагрузкой арбитр записи не успевал, и приёмка печатала «гейт ругается на исправный код» —
// сбой инструмента выдавался за приговор записи каталога.
//
// ТРИ ИСХОДА, А НЕ ДВА: clean · finding · infra_error. Четвёртое состояние — `unavailable`,
// «инструмента нет» — сюда НЕ входит намеренно: это результат осмотра окружения ДО запуска.
// Если процесс уже запускался и не смог отработать — это сбой инструмента, а не его отсутствие.
//
// ПОЧЕМУ У КАЖДОГО ИНСТРУМЕНТА СВОЙ АДАПТЕР, А НЕ ОДНО ПРАВИЛО. Замер по настоящим
// инструментам 2026-09-09 (числа сняты запуском, кроме pylint и eslint — их документацией):
//
//   ruff     чисто 0 · находка 1 (синтаксическая ошибка тоже 1) · неверный флаг 2
//            · НЕСУЩЕСТВУЮЩИЙ ПУТЬ → 0 и «All checks passed!»
//   eslint   чисто 0 · находка 1 · настройка либо внутренняя ошибка 2
//   vulture  чисто 0 · НАХОДКА 3 · плохой ввод 1 · ошибка CLI 2
//   pylint   чисто 0 · находка битовой маской (2 ошибка, 4 предупреждение, 8, 16)
//            · ОШИБКА ВЫЗОВА 32
//
// Общее правило «1 — находка, 2+ — сбой» переврало бы vulture (его находка это 3, а 1 и 2 —
// ошибки) и pylint (его ошибка вызова 32 больше любой находки) — причём в ОБЕ стороны.
// Поэтому знание о кодах живёт рядом с инструментом, а протокол остаётся простым.

// Умолчание для незнакомой программы: ноль — чисто, единица — находка, остальное — сбой.
// Это честнее догадки: неизвестный код становится «не знаем», а не «поймал».
import { existsSync } from "node:fs";
import { win32 } from "node:path";
import { whichSync } from "./repo.mjs";

const DEFAULT = (code) => code === 1;

const ADAPTERS = {
  ruff: DEFAULT,
  eslint: DEFAULT,
  // Наши собственные обёртки: 0 чисто, 1 находка, 2 «нет делегированного инструмента».
  bash: DEFAULT,
  sh: DEFAULT,
  vulture: (code) => code === 3,
  // Битовая маска: любое ненулевое БЕЗ бита 32 — находка; бит 32 — ошибка вызова.
  pylint: (code) => code > 0 && (code & 32) === 0,
};

function findingCodes(prog) {
  const key = String(prog || "").split("/").pop();
  return ADAPTERS[key] || DEFAULT;
}

// Вход — то, что отдаёт spawnSync: { status, signal, error }. Выход — исход и, у сбоя, причина.
function classify(r, isFinding = DEFAULT) {
  // ПОРЯДОК ВАЖЕН, И ОН НЕОЧЕВИДЕН. При истечении срока Node ставит И `signal: SIGTERM`,
  // И `error` с кодом ETIMEDOUT: если смотреть на error первым и не различать его код, таймаут
  // назовётся «ошибкой запуска». Состояние вышло бы верным, а объяснение ложным — а объяснение
  // здесь и есть смысл работы. Замерено прямо на spawnSync 2026-09-09.
  if (r?.error?.code === "ETIMEDOUT") return { state: "infra_error", reason: "timeout", code: null };
  if (r?.error) return { state: "infra_error", reason: "spawn_error", code: null };
  if (r?.status === null || r?.status === undefined) {
    // Срок мог сработать и без error: процесс убит SIGTERM. Иной сигнал — не наш срок.
    const reason = !r?.signal || r.signal === "SIGTERM" ? "timeout" : "signal";
    return { state: "infra_error", reason, code: null };
  }
  const code = r.status;
  if (code === 0) return { state: "clean", reason: null, code };
  if (isFinding(code)) return { state: "finding", reason: null, code };
  return { state: "infra_error", reason: "unexpected_exit", code };
}

// КАКОЙ BASH ЗАПУСКАТЬ НА WINDOWS. В System32 лежит bash.exe — заглушка WSL, и в PATH она стоит
// раньше Git Bash: установщик Git по умолчанию кладёт туда только Git\cmd. Команда гейта
// `bash kit/gates/x/check.sh .` уезжала в Linux-подсистему — другие программы, другой git,
// другие пути — и прогон краснел «не из-за кода». Отчёт с живого проекта 2026-09-11: «гейты
// под Windows берут bash из WSL. Через Git Bash все проходят».
//
// Приём не выдуман: на ту же ловушку наступали Claude Code (anthropics/claude-code#23556) и
// Archon (coleam00/Archon#1326), и общий ответ — не верить слову `bash` из PATH, а брать его
// рядом с git. Git комплекту нужен всё равно. Явный путь — AQK_BASH: у всего, что мы решаем
// сами, обязан быть способ решить иначе.
//
// Не нашли — null, и команда остаётся как есть. Подставлять заглушку WSL «за неимением» нельзя:
// это ровно то, от чего мы уходим; `vitals` назовёт bash ненайденным.
function gitBash({ platform = process.platform, env = process.env, which = whichSync, exists = existsSync } = {}) {
  if (platform !== "win32") return null;
  if (env.AQK_BASH) return env.AQK_BASH;
  const cands = [];
  const git = which("git", env);
  if (git) {
    // Git\cmd\git.exe и Git\mingw64\bin\git.exe — корень на два и на три уровня выше.
    for (const root of [win32.dirname(win32.dirname(git)), win32.dirname(win32.dirname(win32.dirname(git)))]) {
      cands.push(win32.join(root, "bin", "bash.exe"), win32.join(root, "usr", "bin", "bash.exe"));
    }
  }
  for (const base of [env.ProgramFiles, env["ProgramFiles(x86)"], env.LOCALAPPDATA && win32.join(env.LOCALAPPDATA, "Programs")]) {
    if (base) cands.push(win32.join(base, "Git", "bin", "bash.exe"));
  }
  return cands.find((p) => exists(p)) || null;
}

// Подменяется только ПЕРВОЕ слово: внутренний `bash` у обёртки храповика запускает уже Git Bash,
// а у него свой PATH. Кавычки — путь почти всегда с пробелом («Program Files»).
function launchable(cmd, bash) {
  const s = String(cmd || "");
  return bash && /^bash(\s|$)/.test(s) ? `"${bash}"${s.slice(4)}` : s;
}

// Одна точка для всех пяти мест, где запускается команда гейта: прогон, доказательство, проба,
// храповик, `why`. Поиск делается раз на процесс — он смотрит на диск, а гейтов бывает тридцать.
let cachedBash;
function gateCommand(cmd) {
  if (cachedBash === undefined) cachedBash = gitBash();
  return launchable(cmd, cachedBash);
}

export { classify, findingCodes, gitBash, launchable, gateCommand };
