// tool/lib/annotate.mjs — находки упавших гейтов пометками GitHub Actions.
//
// ЗАЧЕМ. Находка видна только в логе конвейера, куда почти никто не заглядывает. Строка
// `::error file=…,line=…,title=…::…` в выводе шага становится красной пометкой у строки файла
// прямо в pull request. Идея — из разбора AgentLint (research/competitors/agentlint-0xmariowu.md);
// формат — документация GitHub «Workflow commands»; экранирование — официальный @actions/core
// (packages/core/src/command.ts, escapeData и escapeProperty), а не их код.
//
// ЧТО НЕ ДЕЛАЕТСЯ НИКОГДА: пометка не меняет вердикт. Это печать того же, что уже решил прогон.
import { splitAdvice, normPath } from "./scope.mjs";

const ANSI = new RegExp(String.fromCharCode(27) + "\\[[0-9;]*[a-zA-Z]", "g");

// Потолок. В документации GitHub лимита не нашли; в обсуждении сообщества 2020 года
// (github.com/orgs/community/discussions/26680): «10 warning annotations and 10 error annotations
// per step». Прогон `doctor` — один шаг, поэтому потолок на весь прогон, а остаток — числом в лог.
const LIMIT = 10;

// Путь с расширением или с косой чертой — как в scope.mjs. Две формы строки находки: «файл:строка:
// текст» (grep -n, линтеры, иногда ещё «:колонка») и «файл: текст» (наши записи каталога).
const PATH = "(?:\\.\\/)?((?:[\\w.@+-]+\\/)*[\\w.@+-]+\\.[A-Za-z][A-Za-z0-9]{0,9})";
const WITH_LINE = new RegExp(`^${PATH}:(\\d+)(?::\\d+)?:\\s*([\\s\\S]*)$`);
const NO_LINE = new RegExp(`^${PATH}:\\s+([\\s\\S]+)$`);

function locate(raw) {
  const plain = String(raw).replace(ANSI, "").trim();
  if (/^(почини|fix)\s*:/i.test(plain)) return null;
  let m = WITH_LINE.exec(plain);
  if (m) return { file: normPath(m[1]), line: Number(m[2]), message: m[3] || plain };
  m = NO_LINE.exec(plain);
  if (m) return { file: normPath(m[1]), line: null, message: m[2] };
  return null;
}

const escData = (s) => String(s).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
const escProp = (s) => escData(s).replace(/:/g, "%3A").replace(/,/g, "%2C");

// results — те же записи, что возвращает runGates: { name, ok, advisory, out, shown }. Берётся
// `shown` — показанное прогоном после сужения по дифу; сырой `out` — только если его нет. exists(путь) —
// есть ли файл в репозитории: пометка на несуществующий файл GitHub вешает на `.github`, и
// человек ищет то, чего нет. Такая находка идёт общей пометкой гейта без файла.
function annotations(results, { exists = () => true, limit = LIMIT } = {}) {
  const lines = [];
  const used = { error: 0, warning: 0 };
  let dropped = 0;
  const emit = (level, title, message, loc = null) => {
    if (used[level] >= limit) { dropped++; return; }
    used[level]++;
    const props = loc ? [`file=${escProp(loc.file)}`, ...(loc.line ? [`line=${loc.line}`] : [])] : [];
    props.push(`title=${escProp(title)}`);
    lines.push(`::${level} ${props.join(",")}::${escData(message)}`);
  };
  for (const r of results || []) {
    if (r.ok) continue;
    const level = r.advisory ? "warning" : "error";
    const title = `aqk: ${r.name}`;
    const { findings, advice } = splitAdvice(String(r.shown ?? r.out ?? "").split("\n").filter((l) => l.trim()));
    const fix = advice.length ? ` — ${String(advice[0]).replace(ANSI, "").trim()}` : "";
    const located = findings.map(locate).filter((f) => f && exists(f.file));
    for (const f of located) emit(level, title, `${f.message}${fix}`, f);
    if (!located.length) emit(level, title, `${String(findings[0] || r.note || "").replace(ANSI, "").trim()}${fix}`);
  }
  return { lines, dropped };
}

export { locate, annotations };
