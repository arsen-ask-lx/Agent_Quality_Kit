// Пилот пункта 3 остатка цикла 1: настоящая мутационная проверка ОДНОГО критического модуля.
//
// ЗАЧЕМ ИМЕННО execution.mjs. На нём держится весь стандарт: он решает, что считать находкой,
// что сбоем инструмента, а что чистым результатом. Если его проверки не ловят подмену этого
// решения, то не ловит ничего и всё, что стоит выше, — `prove`, `doctor --run`, ступень, значок.
//
// ЧЕМ ЭТО ОТЛИЧАЕТСЯ ОТ tool/selfcheck/mutation.sh. Тот меняет ОБРАЗЕЦ и требует, чтобы вердикт
// НЕ изменился (устойчивость к сдвигу строк и CRLF). Здесь меняется КОД и требуется, чтобы
// вердикт изменился — то есть чтобы проверки заметили подмену. Это разные вопросы, и второго
// у комплекта не было ни для одного модуля.
//
// ПОЧЕМУ БЕЗ STRYKER. Железное правило: зависимостей у CLI нет. Stryker — инструмент разработки,
// и его можно было бы взять через `npx`, но для пилота нужен ответ на вопрос «ловят ли наши
// проверки подмену решения», а не полный отчёт по всем возможным мутантам. Двенадцать мутантов,
// выбранных по смыслу, отвечают на него дешевле и понятнее. Если пилот покажет, что выживших
// много, — вот тогда есть о чём говорить с полным инструментом.
//
// ТРИ ИСХОДА, А НЕ ДВА: убит · ВЫЖИЛ · ошибка (мутант не разобрался — значит мутация была
// бессмысленной, и записывать её в «убит» нельзя: это завысило бы результат).
//
// Запуск: node research/2026-09-23-upstream-practices/pilot/mutate-execution.mjs
import { readFileSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const TARGET = join(ROOT, "tool", "lib", "execution.mjs");
const BACKUP = `${TARGET}.pilot-backup`;

// Каждый мутант — подмена решения, а не случайный символ. В скобках написано, ЧТО сломается
// в продукте, если проверки его пропустят: мутант без такого объяснения не стоит запуска.
const MUTANTS = [
  ["const DEFAULT = (code) => code === 1;", "const DEFAULT = (code) => code !== 0;",
    "любой ненулевой код становится находкой — сбой инструмента выдаётся за приговор"],
  ["const DEFAULT = (code) => code === 1;", "const DEFAULT = (code) => false;",
    "находок не бывает вовсе — гейт не может покраснеть"],
  ["vulture: (code) => code === 3,", "vulture: (code) => code === 1,",
    "находка vulture (3) читается как сбой, а его ошибка разбора (1) — как находка"],
  ["pylint: (code) => code > 0 && code < 32,", "pylint: (code) => code > 0,",
    "ошибка вызова pylint (32) засчитывается находкой"],
  // ЭКВИВАЛЕНТНЫЙ МУТАНТ, и это не отговорка, а проверенное утверждение. `classify` возвращает
  // «чисто» на нуле ДО того, как спросит адаптер, а `findingCodes` нигде не вызывается иначе,
  // как аргументом `classify` (проверено 2026-09-26: prove.mjs, gates.mjs, run.mjs — три места,
  // все через classify). Значит поведением его не убить ни одной проверкой, и требовать 100%
  // здесь означало бы дописать проверку, которая проверяет не продукт, а форму записи условия.
  ["pylint: (code) => code > 0 && code < 32,", "pylint: (code) => code < 32,",
    "чистый результат pylint (0) стал бы находкой — но classify до адаптера не доходит", true],
  ['if (r?.error?.code === "ETIMEDOUT") return { state: "infra_error", reason: "timeout", code: null };',
    'if (false) return { state: "infra_error", reason: "timeout", code: null };',
    "таймаут называется ошибкой запуска — объяснение ложное при верном состоянии"],
  ['if (r?.error) return { state: "infra_error", reason: "spawn_error", code: null };',
    'if (r?.error) return { state: "clean", reason: null, code: 0 };',
    "не запустившийся инструмент объявляется чистым результатом"],
  ['const reason = !r?.signal || r.signal === "SIGTERM" ? "timeout" : "signal";',
    'const reason = "signal";',
    "истёкший срок называется чужим сигналом"],
  ['if (code === 0) return { state: "clean", reason: null, code };',
    'if (code === 0) return { state: "finding", reason: null, code };',
    "чистый результат становится находкой — красное на исправном коде"],
  ['return { state: "infra_error", reason: "unexpected_exit", code };',
    'return { state: "clean", reason: null, code };',
    "незнакомый ненулевой код объявляется чистым — главный класс, ради которого файл написан"],
  ["if (!Number.isFinite(secs) || secs <= 0) return { ms: GATE_TIMEOUT_DEFAULT, raw, ok: false };",
    "if (!Number.isFinite(secs)) return { ms: GATE_TIMEOUT_DEFAULT, raw, ok: false };",
    "AQK_GATE_TIMEOUT=0 означает у spawnSync «ждать вечно» — висящий гейт вместо «не смогли»"],
  ['return bash && /^bash(\\s|$)/.test(s) ? `"${bash}"${s.slice(4)}` : s;',
    'return bash && /^bash/.test(s) ? `"${bash}"${s.slice(4)}` : s;',
    "команда `bashful-tool …` калечится подменой первых четырёх букв"],
];

const UNITS = ["--test", join(ROOT, "tool", "selfcheck", "units-execution.mjs")];
const ALL_UNITS = ["--test", ...["units.mjs", "units-vitals.mjs", "units-evidence.mjs", "units-execution.mjs"]
  .map((f) => join(ROOT, "tool", "selfcheck", f))];

const runTests = (args) => spawnSync(process.execPath, args, { cwd: ROOT, encoding: "utf8", timeout: 300000 });

function main() {
  const src = readFileSync(TARGET, "utf8");
  copyFileSync(TARGET, BACKUP);

  // Контроль ДО всякой мутации: на исходном коде проверки обязаны быть зелёными. Без него
  // «убит» ничего не значит — красные проверки убивают любого мутанта, включая бессмысленного.
  const base = runTests(ALL_UNITS);
  if (base.status !== 0) {
    console.log("контроль на исходном коде КРАСНЫЙ — замер не состоялся, мутанты не запускались");
    console.log(String(base.stdout).split("\n").slice(-12).join("\n"));
    rmSync(BACKUP, { force: true });
    return 2;
  }
  console.log(`контроль: проверки на исходном коде зелёные\n`);

  const rows = [];
  for (const [from, to, cost, equivalent] of MUTANTS) {
    if (!src.includes(from)) {
      rows.push({ verdict: "НЕ ПРИМЕНЁН", cost, equivalent, why: "строки нет в файле — мутант устарел" });
      continue;
    }
    writeFileSync(TARGET, src.replace(from, to), "utf8");
    const narrow = runTests(UNITS);
    const wide = narrow.status === 0 ? runTests(ALL_UNITS) : null;
    // Различаем, ЧЕМ убит: адресными проверками модуля или только общим набором. Второе значит,
    // что проверка модуля дыру не видит, и это отдельный факт, а не тот же успех.
    const verdict =
      narrow.status === 0 && (!wide || wide.status === 0) ? (equivalent ? "эквивалентный" : "ВЫЖИЛ")
      : narrow.status === 0 ? "убит только общим набором"
      : narrow.status === null ? "ошибка запуска"
      : "убит адресными";
    rows.push({ verdict, cost, equivalent });
  }
  copyFileSync(BACKUP, TARGET);
  rmSync(BACKUP, { force: true });

  const count = (v) => rows.filter((r) => r.verdict === v).length;
  console.log(`${"ИСХОД".padEnd(28)} ЧТО СЛОМАЛОСЬ БЫ В ПРОДУКТЕ`);
  for (const r of rows) console.log(`${r.verdict.padEnd(28)} ${r.cost}${r.why ? ` — ${r.why}` : ""}`);
  console.log(`\nвсего мутантов: ${rows.length} · убито адресными: ${count("убит адресными")}` +
    ` · убито только общим набором: ${count("убит только общим набором")}` +
    ` · ВЫЖИЛО: ${count("ВЫЖИЛ")} · эквивалентных: ${count("эквивалентный")}` +
    ` · не применено: ${count("НЕ ПРИМЕНЁН")}`);
  // Эквивалентный мутант, объявленный таковым и НЕ убитый, — это подтверждение разбора. А вот
  // объявленный эквивалентным и убитый — ошибка разбора: значит поведение он всё-таки менял.
  for (const r of rows) {
    if (r.verdict !== "эквивалентный" && r.equivalent) console.log(`ОШИБКА РАЗБОРА: ${r.cost}`);
  }
  return 0;
}

process.exit(main());
