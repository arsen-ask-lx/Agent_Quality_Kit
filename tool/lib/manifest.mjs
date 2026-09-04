// tool/lib/manifest.mjs — чтение .aqk.yml и вычисление ступени соответствия.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CWD, MANIFEST, PROJECT_GATES, exists } from "./core.mjs";
import { L } from "../i18n/index.mjs";

// СТАНДАРТ. Уровень — не самооценка и не галочка в README, а вычисляемое утверждение:
// каждая ступень проверяется файлами на диске. Утверждение, которое нельзя проверить
// машиной, в стандарт не входит — иначе значок в README означает только доверие к автору.

// Разбор ограниченного подмножества YAML: ключ, вложенный на один уровень ключ, список.
// НАМЕРЕННО без библиотеки: манифест обязан быть настолько простым, чтобы его разбирал
// кусок кода, который читается за минуту. Сложный манифест никто не заполнит.
function parseManifest(text) {
  const out = {};
  let section = null;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/#.*$/, "").replace(/\s+$/, "");
    if (!line.trim()) continue;
    const indented = /^\s/.test(line);
    const listItem = line.trim().startsWith("- ");

    if (listItem && section) {
      // Ключ вида `entry:` без значения уже создал пустой объект — под список его надо
      // заменить массивом, иначе push падает и весь манифест читается как отсутствующий.
      if (!Array.isArray(out[section])) out[section] = [];
      out[section].push(line.trim().slice(2).trim().replace(/^["']|["']$/g, ""));
      continue;
    }
    const m = line.trim().match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    const [, key, value] = m;
    const clean = value.trim().replace(/^["']|["']$/g, "");

    if (indented && section) {
      if (typeof out[section] !== "object" || Array.isArray(out[section])) out[section] = {};
      out[section][key] = clean;
      continue;
    }
    section = key;
    // Список в одну строку: entry: [AGENTS.md, docs/START.md]. Люди пишут именно так —
    // и раньше манифест молча читался как пустой, а проект получал вердикт «нет AQK-0».
    // Неверный вердикт хуже отсутствия вердикта: ему верят.
    if (clean.startsWith("[") && clean.endsWith("]")) {
      out[key] = clean
        .slice(1, -1)
        .split(",")
        .map((v) => v.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
      continue;
    }
    out[key] = clean === "" ? {} : clean;
  }
  return out;
}

async function readManifest() {
  const p = join(CWD, MANIFEST);
  if (!(await exists(p))) return null;
  try {
    return parseManifest(await readFile(p, "utf8"));
  } catch {
    return null;
  }
}

// Каждая ступень: что требуется, как проверяется, и что это даёт человеку.
async function assessLevel(man) {
  const has = async (rel) => Boolean(rel) && (await exists(join(CWD, String(rel))));
  const isUrl = (v) => typeof v === "string" && /^https?:\/\//.test(v);

  const entries = Array.isArray(man?.entry) ? man.entry : [];
  const entriesExist = entries.length > 0 && (await Promise.all(entries.map(has))).every(Boolean);

  const gates = man?.gates && typeof man.gates === "object" && !Array.isArray(man.gates) ? man.gates : {};
  const filledGates = Object.entries(gates).filter(([, cmd]) => String(cmd || "").trim());

  // Условие ступени — здесь, её описание — в каталоге строк: текст переводится, условие нет.
  // Разложить их по разным файлам стоило того, чтобы перевод не мог случайно поменять смысл
  // проверки; порядок ступеней связывает их по индексу и сверяется модульной проверкой.
  const conditions = [
    Boolean(man?.aqk) && entriesExist,
    (await has(man?.rules)) && filledGates.length > 0,
    (await has(man?.samples)) && (await has(man?.ratchets)),
    isUrl(man?.lessons) || (await has(man?.lessons)),
  ];
  const steps = conditions.map((ok, level) => ({ level, ok, ...L.levels[level] }));

  let reached = -1;
  for (const s of steps) {
    if (!s.ok) break;
    reached = s.level;
  }
  return { reached, steps };
}

// Вписать гейт в манифест, не тронув комментарии: правим текст, а не пересобираем YAML.
function manifestWithGate(text, slug, cmd) {
  const lines = text.split("\n");
  const entry = `  ${slug}: "${cmd}"`;

  const gi = lines.findIndex((l) => /^gates:\s*$/.test(l));
  if (gi === -1) return { text: null, why: "в .aqk.yml нет блока gates:" };
  if (lines.some((l) => new RegExp(`^\\s+${slug}:`).test(l))) return { text: null, why: "уже объявлен" };

  let last = gi;
  for (let i = gi + 1; i < lines.length; i++) {
    if (/^\s+\S/.test(lines[i])) last = i;
    else if (lines[i].trim() === "" || lines[i].startsWith("#")) continue;
    else break;
  }
  lines.splice(last + 1, 0, entry);

  let out = lines.join("\n");
  // Образцы теперь есть — ступень AQK-2 требует, чтобы поле на них указывало.
  out = out.replace(/^samples:\s*""\s*$/m, `samples: ${PROJECT_GATES}`);
  return { text: out, why: null };
}

export { parseManifest, readManifest, assessLevel, manifestWithGate };
