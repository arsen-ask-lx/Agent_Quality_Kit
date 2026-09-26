// tool/lib/protection.mjs — снимок объявленной защиты: кто его пишет и в каком виде.
//
// ОТДЕЛЬНЫМ МОДУЛЕМ, а не строкой в `add`: у формата снимка два читателя — эта запись и
// проверка `kit/gates/protection-not-removed/check.sh`. Знание об одном файле, размазанное по
// двум местам, однажды разъедется; здесь оно собрано с той стороны, где на JS.
// Вторая копия неизбежна: проверка написана на POSIX sh и разделить с ней код нельзя —
// поэтому шапка ниже и текст в её сообщении «почини» обязаны меняться вместе.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { CWD, RATCHET_DIR, MANIFEST } from "./core.mjs";
import { parseManifest } from "./manifest.mjs";

const HEADER =
  "# Снимок объявленной защиты. Набор может только РАСТИ.\n" +
  "# Убрал гейт — напиши причину после # в его строке, иначе проверка краснеет.\n" +
  "# Строка «# run имя: команда» — не комментарий: смена команды без её правки краснеет.\n";

// СНИМОК ОБЪЯВЛЕННОЙ ЗАЩИТЫ ПИШЕТ УСТАНОВКА, А НЕ ПРОВЕРКА.
//
// Раньше его вёл сам гейт `protection-not-removed`: при отсутствии создавал, при появлении новых
// имён дописывал. То есть проверка меняла то, о чём судит. Опыт 2026-09-09: в мелком клоне, где
// удаление снимка лежит глубже выкладки, свидетель (история git) слеп — и проверка записала уже
// ОСЛАБЛЕННЫЙ набор новым эталоном, вернув ноль. Храповик крутился назад.
//
// Здесь этому место по смыслу: `add` уже меняет манифест, и запись в снимок — часть того же
// действия. Проверка теперь только сравнивает.
async function recordProtection(man, slug) {
  // `init` кладёт `ratchets: ""` намеренно: пустое поле честнее заглушки. Заполняем его при
  // первой записи — ровно так же поступает `ratchet`. Иначе источников истины два: пустой
  // манифест и умолчание внутри проверки, — и они однажды разойдутся.
  let rdir = typeof man?.ratchets === "string" ? man.ratchets.trim() : "";
  const manPath = join(CWD, MANIFEST);
  if (!rdir) {
    rdir = RATCHET_DIR;
    try {
      const t = await readFile(manPath, "utf8");
      if (/^ratchets:\s*""\s*$/m.test(t)) {
        await writeFile(manPath, t.replace(/^ratchets:\s*""\s*$/m, `ratchets: ${RATCHET_DIR}`), "utf8");
      }
    } catch { /* манифест не прочитан — снимок всё равно заведём в умолчательном каталоге */ }
  }
  const file = join(CWD, rdir, "gates-declared.txt");
  let body = "";
  try { body = await readFile(file, "utf8"); } catch { /* снимка ещё нет — заведём */ }

  // КОМАНДЫ — ИЗ МАНИФЕСТА НА ДИСКЕ, а не из рецепта: одобряется то, что будет запускаться, и
  // разобранное тем же `parseManifest`, которым программа гейт и запускает.
  let gates = {};
  try { gates = parseManifest(await readFile(manPath, "utf8")).gates || {}; } catch { /* нечем дополнить */ }
  if (!Object.prototype.hasOwnProperty.call(gates, slug)) return;

  const lines = body ? body.replace(/\r/g, "").replace(/\n?$/, "").split("\n") : HEADER.replace(/\n$/, "").split("\n");
  const nameOf = (l) => (l.startsWith("#") ? "" : l.replace(/\s*#.*$/, "").trim());
  const hasRun = (n) => lines.some((l) => l.startsWith(`# run ${n}:`));
  if (!lines.some((l) => nameOf(l) === slug)) lines.push(slug);

  // Строки команд дописываются ВСЕМ гейтам из снимка, у которых их нет, — за один раз. Иначе
  // снимок, где команда записана у одного гейта, проверка читает как новый формат, и все
  // остальные краснели бы «строку стёрли» сразу после обновления комплекта.
  // ЗАПИСАННУЮ СТРОКУ НЕ ПЕРЕПИСЫВАЕМ: иначе подмену команды «лечил» бы любой следующий add.
  // Гейт, объявленный в манифесте, но не записанный в снимок, тоже не трогаем: его имя обязан
  // вписать человек — проверка это требует.
  const out = [];
  for (const l of lines) {
    out.push(l);
    const n = nameOf(l);
    if (n && Object.prototype.hasOwnProperty.call(gates, n) && !hasRun(n)) {
      out.push(`# run ${n}: ${String(gates[n])}`);
    }
  }
  await mkdir(join(CWD, rdir), { recursive: true });
  await writeFile(file, `${out.join("\n")}\n`, "utf8");
}

// Наружу — только запись. `HEADER` остаётся внутри: экспорт, который никто не берёт, читается
// как часть договора и мешает менять внутренности. Поймал наш же dead-code.
export { recordProtection };
