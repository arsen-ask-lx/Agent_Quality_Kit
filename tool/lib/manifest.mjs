// tool/lib/manifest.mjs — чтение .aqk.yml и вычисление ступени соответствия.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CWD, MANIFEST, PROJECT_GATES, exists } from "./core.mjs";

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

  const steps = [
    {
      level: 0,
      title: "манифест и точка входа",
      ok: Boolean(man?.aqk) && entriesExist,
      need: "создай .aqk.yml и укажи в entry файл, который агент читает первым (AGENTS.md)",
      gives: "любой инструмент понимает, что читать в этом репозитории",
    },
    {
      level: 1,
      title: "правила и работающие гейты",
      ok: (await has(man?.rules)) && filledGates.length > 0,
      need: "укажи rules (каталог стандартов) и заполни хотя бы один гейт в gates реальной командой",
      gives: "проверки объявлены командами, а не описаны словами",
    },
    {
      level: 2,
      title: "гейты доказаны, долг под храповиком",
      ok: (await has(man?.samples)) && (await has(man?.ratchets)),
      need: "заведи samples (красные и зелёные образцы гейтов) и ratchets (реестры долга)",
      gives: "гейт доказал, что ловит брак и молчит на исправном коде",
    },
    {
      level: 3,
      title: "уроки возвращаются в работу",
      ok: isUrl(man?.lessons) || (await has(man?.lessons)),
      need: "укажи lessons — путь или адрес журнала, где каждый инцидент даёт вывод",
      gives: "проект учится: одна и та же шишка не набивается дважды",
    },
  ];

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
