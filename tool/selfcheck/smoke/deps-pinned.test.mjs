// Закреплённые версии — это и файл версий, и конвейер, который его соблюдает.
//
// ОТКУДА. Разбор evalite (цикл 2, `CYCLE-02.md`): lock-файл в репозитории есть, а все три
// конвейера, включая выпуск, ставят зависимости с `pnpm install --no-frozen-lockfile`. У pnpm в CI
// соблюдение lock-файла включено по умолчанию («For CI: true, if a lockfile is present»,
// pnpm.io/cli/install) — флаг его выключает явно. Замер 2026-09-26: поиск по коду GitHub даёт
// около 12 576 файлов конвейеров с этим флагом; из 20 проверенных руками в 20 флаг стоит в команде
// установки и `pnpm-lock.yaml` лежит в корне. Готового правила нет: у zizmor 41 проверка, про
// lock-файл — ни одной (docs.zizmor.sh/audits).
//
// ВТОРОЕ, НАЙДЕННОЕ ПОПУТНО. Отформатированный `package.json` — первая зависимость на новой
// строке, то есть обычный вид — гейт считал файлом без зависимостей и молчал без lock-файла.
// Дефект назван аудитом 2026-09-09 и дожил до 2026-09-26: красный образец был написан в той
// единственной форме (всё в одну строку), которую гейт ловил.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const posix = (x) => String(x).replace(/\\/g, "/");
const CHECK = posix(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "kit", "gates", "deps-are-pinned", "check.sh"));
const FORMATTED = '{\n  "name": "x",\n  "dependencies": {\n    "left-pad": "1.3.0"\n  }\n}\n';

const run = (t, files) => {
  const dir = mkdtempSync(join(tmpdir(), "aqk-deps-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
  const r = spawnSync("bash", [CHECK, posix(dir)], { encoding: "utf8" });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};

test("отформатированный package.json с зависимостью и без lock-файла — красный", (t) => {
  const r = run(t, { "package.json": FORMATTED });
  assert.equal(r.code, 1, `обычный вид package.json принят за «зависимостей нет»:\n${r.out}`);
});

test("тот же package.json с lock-файлом — зелёный", (t) => {
  assert.equal(run(t, { "package.json": FORMATTED, "package-lock.json": "{}\n" }).code, 0);
});

test("package.json без зависимостей — зелёный: закреплять нечего", (t) => {
  assert.equal(run(t, { "package.json": '{\n  "name": "x",\n  "scripts": {\n    "t": "x"\n  }\n}\n' }).code, 0);
});

const PNPM = { "package.json": FORMATTED, "pnpm-lock.yaml": "lockfileVersion: '9.0'\n" };
const wf = (step) => `jobs:\n  ci:\n    runs-on: ubuntu-latest\n    steps:\n      - ${step}\n`;

for (const step of ["run: pnpm install --no-frozen-lockfile", "run: pnpm i --frozen-lockfile=false"]) {
  test(`конвейер «${step}» при pnpm-lock.yaml — красный, назван файл и строка`, (t) => {
    const r = run(t, { ...PNPM, ".github/workflows/ci.yml": wf(step) });
    assert.equal(r.code, 1, `lock-файл выключен в конвейере, а гейт молчит:\n${r.out}`);
    assert.match(r.out, /\.github\/workflows\/ci\.yml:5/, `не названо, где выключен:\n${r.out}`);
  });
}

test("соблюдающий конвейер и упоминание в комментарии — зелёный", (t) => {
  const body = wf("run: pnpm install --frozen-lockfile") + "# раньше было --no-frozen-lockfile\n";
  assert.equal(run(t, { ...PNPM, ".github/workflows/ci.yml": body }).code, 0);
});

test("выключенный файл конвейера (.disabled) не считается", (t) => {
  const r = run(t, { ...PNPM, ".github/workflows/old.yml.disabled": wf("run: pnpm install --no-frozen-lockfile") });
  assert.equal(r.code, 0, r.out);
});

test("флаг без pnpm-lock.yaml ничего не выключает — зелёный", (t) => {
  const r = run(t, { "package.json": FORMATTED, "package-lock.json": "{}\n", ".github/workflows/ci.yml": wf("run: pnpm install --no-frozen-lockfile") });
  assert.equal(r.code, 0, r.out);
});
