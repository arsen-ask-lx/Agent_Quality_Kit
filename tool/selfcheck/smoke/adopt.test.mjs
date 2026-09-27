// tool/selfcheck/smoke/adopt.test.mjs — «поставил инструмент» не значит «он работает».
//
// ЗАЧЕМ. Владелец 2026-09-27: «человек если ставил, то не факт, что от того, что он просто
// поставил, у него всё заработало — мы ещё должны настроить инструмент, сделать красные тесты и
// проверить его; нужен обязательный набор для агента». Живой пример того же дня: Stryker с
// порогом по умолчанию не роняет сборку никогда (документация: `break: null`), и из 149 настоящих
// файлов его настроек на GitHub у 96 порога нет.
//
// `aqk adopt <гейт>` — договор установки. Код возврата 0 только когда машина подтвердила всё,
// что может подтвердить: гейт объявлен, у него есть образцы, он ДОКАЗАН (краснеет на красном,
// молчит на зелёном) и конвейер его гоняет. Чего машина не проверяет — прочитана ли
// документация, — печатается шагом для агента, а не засчитывается.
import test from "node:test";
import assert from "node:assert/strict";
import { project, aqk, tail, gate } from "./_fixture.mjs";

const CHECK = "if grep -rq BAD src; then echo 'BAD найдено'; exit 1; fi\n";
const CI = "on: push\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npx agent-quality-kit doctor --run\n";

function files(gates, { samples = true, ci = true } = {}) {
  const out = {
    "AGENTS.md": "# a\n", "check.sh": CHECK, "src/app.txt": "ok\n",
    ".aqk.yml": ["aqk: 1", "entry:", "  - AGENTS.md", "samples: gates", "gates:",
      ...Object.entries(gates).map(([n, c]) => `  ${n}: "${c}"`), ""].join("\n"),
  };
  if (ci) out[".github/workflows/ci.yml"] = CI;
  if (samples) {
    for (const n of Object.keys(gates)) {
      out[`gates/${n}/red/src/planted.txt`] = "BAD\n";
      out[`gates/${n}/green/src/planted.txt`] = "fine\n";
    }
  }
  return out;
}

const plain = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");

test("договор выполнен — код 0, и каждый шаг назван", (t) => {
  const p = project(t, files({ words: "sh check.sh" }));
  const r = aqk(p, "adopt", "words");
  assert.equal(r.code, 0, tail(r.out, 20));
  const out = plain(r.out);
  for (const step of [/объявлен/, /образц/, /доказ/, /конвейер/, /документаци/]) {
    assert.match(out, step, `шаг не назван: ${step}\n${tail(out, 20)}`);
  }
});

test("проверка, которая всегда «ок», договор не проходит", (t) => {
  const p = project(t, files({ lazy: "sh -c 'exit 0'" }));
  const r = aqk(p, "adopt", "lazy");
  assert.equal(r.code, 1, tail(r.out, 20));
  assert.match(plain(r.out), /✘.*доказательство.*КРАСНОМ/, tail(r.out, 20));
});

test("без образцов договор не пройден, и сказано, что положить", (t) => {
  const p = project(t, files({ words: "sh check.sh" }, { samples: false }));
  const r = aqk(p, "adopt", "words");
  assert.equal(r.code, 1);
  assert.match(plain(r.out), /gates\/words\/red/, `не сказано, куда класть образец:\n${tail(r.out, 20)}`);
});

test("конвейер гейт не гоняет — договор не пройден", (t) => {
  const p = project(t, files({ words: "sh check.sh" }, { ci: false }));
  const r = aqk(p, "adopt", "words");
  assert.equal(r.code, 1);
  assert.match(plain(r.out), /✘.*конвейер/, tail(r.out, 20));
});

test("необъявленный гейт — код 1 и подсказка, как объявить", (t) => {
  const p = project(t, files({ words: "sh check.sh" }));
  const r = aqk(p, "adopt", "nope");
  assert.equal(r.code, 1);
  assert.match(plain(r.out), /\.aqk\.yml/);
});

// ДВЕ КОПИИ ОДНОГО ПРАВИЛА. «Гейт идёт в конвейере» решает запись `gates-run-in-ci` оболочкой и
// `adopt` в Node. Разойдясь, они дали бы два ответа на один вопрос в одном выводе. Сверка по
// случаям, где конвейер есть; без конвейера ответы расходятся НАМЕРЕННО: запись говорит «не про
// тебя», договор — «не выполнен», потому что проверку тогда гоняют только руками.
test("adopt и запись gates-run-in-ci одинаково решают, идёт ли гейт в конвейере", async (t) => {
  const { ciRuns } = await import("../../commands/adopt.mjs");
  const cases = [
    { ci: "steps:\n  - run: npx agent-quality-kit doctor --run\n", cmd: "sh check.sh", want: true },
    { ci: "steps:\n  - run: bash tools/lint.sh .\n", cmd: "bash tools/lint.sh .", want: true },
    { ci: "steps:\n  - run: npm test\n", cmd: "bash tools/lint.sh .", want: false },
    { ci: "steps:\n  - run: aqk --run doctor\n", cmd: "sh check.sh", want: true },
  ];
  for (const k of cases) {
    const p = project(t, {
      ".aqk.yml": `gates:\n  g: "${k.cmd}"\n`, ".github/workflows/ci.yml": k.ci,
    });
    const sh = gate(p, "gates-run-in-ci");
    const node = ["all", "named"].includes(ciRuns([k.ci], k.cmd));
    assert.equal(sh.code === 0, k.want, `запись: ${k.ci}${sh.out}`);
    assert.equal(node, k.want, `adopt: ${k.ci}`);
  }
});

// ЧАСТИЧНАЯ БЕЗЗУБОСТЬ, КОТОРУЮ ПОДСАДКА НЕ ВИДИТ. eslint без `--max-warnings` не роняет проверку
// на правилах уровня `warn` никогда (документация, раздел Exit Codes). Гейт объявлен обёрткой
// `npm run lint` — флаги живут в package.json, и смотреть надо туда.
test("eslint с правилами warn и без --max-warnings — шаг «заглушён» с цитатой и починкой", (t) => {
  const p = project(t, {
    ...files({ lint: "npm run lint" }, { samples: false }),
    "package.json": JSON.stringify({ scripts: { lint: "eslint ." } }),
    "eslint.config.js": "export default [{ rules: { 'no-console': 'warn' } }];\n",
  });
  const out = plain(aqk(p, "adopt", "lint").out);
  assert.match(out, /✘\s+заглушён: eslint/, tail(out, 25));
  assert.match(out, /--max-warnings 0/, "не сказано, как починить");
  assert.match(out, /eslint\.org\/docs/, "нет адреса документации");
});

test("eslint с --max-warnings 0 — шаг «не заглушён»; неизвестный инструмент — без галочки", (t) => {
  const p = project(t, {
    ...files({ lint: "npm run lint", words: "sh check.sh" }, { samples: false }),
    "package.json": JSON.stringify({ scripts: { lint: "eslint . --max-warnings 0" } }),
    "eslint.config.js": "export default [{ rules: { 'no-console': 'warn' } }];\n",
  });
  assert.match(plain(aqk(p, "adopt", "lint").out), /✔\s+не заглушён: eslint/);
  const unknown = plain(aqk(p, "adopt", "words").out);
  assert.doesNotMatch(unknown, /заглушён/, "про неизвестный инструмент сказано «(не) заглушён»");
  assert.match(unknown, /сведений об этом инструменте в AQK нет/);
});

// Настройки в файле, который назван в САМОЙ команде: у k6 пороги живут в скрипте теста.
// Без порогов прогон не падает ни от проваленных check(), ни от ошибок запросов — документация k6.
test("k6: скрипт из команды без thresholds — «заглушён»; с порогами — нет", (t) => {
  const bare = project(t, {
    ...files({ load: "k6 run tests/load.js" }, { samples: false }),
    "tests/load.js": "import http from 'k6/http';\nexport default function () { http.get('http://x'); }\n",
  });
  assert.match(plain(aqk(bare, "adopt", "load").out), /✘\s+заглушён: k6/);
  const strict = project(t, {
    ...files({ load: "k6 run tests/load.js" }, { samples: false }),
    "tests/load.js": "export const options = { thresholds: { http_req_failed: ['rate<0.01'] } };\n",
  });
  assert.match(plain(aqk(strict, "adopt", "load").out), /✔\s+не заглушён: k6/);
});
