// Набор настоящих случаев: то, что мы нашли на живых проектах, в журнале и в разборах соседей,
// — минимальными воспроизведениями с ожидаемым ответом комплекта.
//
// ЗАЧЕМ. Образцы red/green проверяют запись В ОДИНОЧКУ, на примере, написанном под неё. Ломается
// же комплект на целых проектах, где записи стоят рядом: «определение соседней записи —
// находка» (журнал, 2026-09-09) образцы не поймали ни разу. Разбор AgentLint 2026-09-11 показал
// другую половину: их «точность 99%» мерила согласие сканера с собственным пересказом правил.
// Здесь разметка — по СВОЙСТВУ проекта: у каждого случая назван источник, где это свойство
// видели на деле. Файлы случаев живут внутри проверки, а не в дереве: иначе наши же гейты
// находили бы в них «находки» у нас в репозитории.
//
// Каждый случай — минимальное воспроизведение, а не копия: чужой код переносить нельзя по
// лицензии, и копия в тысячи строк проверяла бы то же самое, только медленнее.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { project, aqk, aqkEnv, gate } from "./_fixture.mjs";

const KIT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "kit", "gates");

const TWIN = (fake) => ({
  "CLAUDE.md": "# Shop API\n\nSmall HTTP API.\n\n## Commands\n- Test: `npm test`\n",
  "package.json": JSON.stringify({ name: "shop", type: "module", scripts: { test: fake ? "node --test || true" : "node --test" } }),
  "src/cart.js": "export function total(items) {\n  return items.reduce((s, i) => s + i.price, 0);\n}\n",
  "test/cart.test.js": fake
    ? "import test from 'node:test';\nimport { total } from '../src/cart.js';\ntest('total', () => { total([{ price: 2 }]); });\n"
    : "import test from 'node:test';\nimport assert from 'node:assert';\nimport { total } from '../src/cart.js';\ntest('total', () => { assert.equal(total([{ price: 2 }]), 2); });\n",
  ".github/workflows/ci.yml": "name: ci\non: [push]\npermissions:\n  contents: read\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n" +
    "      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262\n      - run: npm test\n" +
    (fake ? "        continue-on-error: true\n" : ""),
});

const CASES = [
  {
    name: "близнец с настоящими воротами",
    source: "research/competitors/agentlint-0xmariowu.md, «Близнецы»: AgentLint дал 71 обоим",
    files: TWIN(false),
    gates: { "ci-actually-fails": 0, "test-has-assertion": 0 },
  },
  {
    name: "близнец с поддельными воротами",
    source: "там же; test-has-assertion молчит намеренно — «вызов без утверждения» у нас не находка (.aqk.yml)",
    files: TWIN(true),
    gates: { "ci-actually-fails": 1, "test-has-assertion": 0 },
  },
  {
    name: "ворота в check.yml под continue-on-error, «exit 1» в комментарии",
    source: "agentlint-0xmariowu.md, H7: их проверка назвала такие ворота блокирующими",
    files: {
      ".github/workflows/check.yml": "name: check\non: [push]\npermissions:\n  contents: read\njobs:\n  t:\n    runs-on: ubuntu-latest\n    steps:\n" +
        "      - run: npm test\n        continue-on-error: true\n# on failure the step does exit 1\n",
      "package.json": JSON.stringify({ name: "x", scripts: { test: "node --test" } }),
    },
    gates: { "ci-actually-fails": 1 },
  },
  {
    name: "свод велит удалённый скрипт, а debug остался в зависимостях",
    source: "incidents/README.md 2026-09-11; JonnyKreng/pebble-navi 757c563",
    files: {
      "AGENTS.md": "# Rules\n\n```sh\nnpm run debug        # build + install + logs\n```\n",
      "package.json": JSON.stringify({ name: "x", scripts: { build: "tsc" }, dependencies: { debug: "4.3.4" } }, null, 2),
    },
    gates: { "entry-commands-exist": 1 },
  },
  {
    name: "цели make в коде свода, «make sure» в прозе",
    source: "живой проект на TypeScript и Biome: шестнадцать целей make в AGENTS.md, все на месте",
    files: {
      "AGENTS.md": "# Rules\n\nMake sure the tree is clean.\n\n- проверка: `make check`\n- типы: `make typecheck`\n",
      "Makefile": ".PHONY: check typecheck\ncheck:\n\tnpm run lint\ntypecheck:\n\tnpx tsc --noEmit\n",
      "package.json": JSON.stringify({ name: "x", scripts: { lint: "biome lint ." } }),
    },
    gates: { "entry-commands-exist": 0 },
  },
  {
    name: "договор в коде (провайдер типов Fastify) без проверки типов",
    source: "отзыв с живого проекта 2026-09-11: «спецификации API не видно» при zod-схемах в общем пакете",
    files: { "backend/package.json": JSON.stringify({ dependencies: { "@fastify/type-provider-zod": "1.0.0", zod: "4.5.4" } }) },
    gates: { "api-contract-has-arbiter": 1 },
  },
  {
    name: "тот же договор, tsc --build в scripts",
    source: "там же: на живом проекте запись применима и зелёная",
    files: {
      "backend/package.json": JSON.stringify({ dependencies: { "@fastify/type-provider-zod": "1.0.0" } }),
      "package.json": JSON.stringify({ scripts: { typecheck: "tsc --build" } }),
    },
    gates: { "api-contract-has-arbiter": 0 },
  },
  {
    name: "CLAUDE.md с windows-переносами подключает AGENTS.md",
    source: "живой проект на Windows; AgentLint (F7) объявил подключение битым",
    files: {
      "CLAUDE.md": "# CLAUDE.md\r\n\r\nПравила — в AGENTS.md.\r\n\r\n@AGENTS.md\r\n",
      "AGENTS.md": "# Правила\n\n- тесты перед коммитом\n",
      ".claude/settings.json": "{}\n",
    },
    doctorNot: /(не подключает AGENTS|does not import AGENTS|Claude Code здесь настроен|Claude Code is set up)/,
  },
  {
    name: "русский свод, машина без LANG",
    source: "отзыв с живого проекта 2026-09-11: Windows без LANG — весь вывод английский",
    files: {
      "AGENTS.md": "# Правила проекта\n\n" + "Перед коммитом запусти проверку и убедись, что она проходит. Изменение договора проходит через ревью и фиксируется в журнале решений. ".repeat(3) + "\n",
    },
    env: { AQK_LANG: "", LANG: "", LC_ALL: "", LC_MESSAGES: "" },
    doctorHas: /Уровень/,
  },
  {
    name: "определения записей, разложенные в проект, — не находки",
    source: "incidents/README.md 2026-09-09 «аудит фич нашёл то, чего не нашли образцы»; AgentLint S6/S7 краснеют на таком же",
    files: { "src/app.py": "def f():\n    return 1\n" },
    before: [["init"], ["add", "secrets-not-in-code"], ["add", "personal-config-not-shared"], ["add", "env-secrets-not-committed"]],
    gates: { "secrets-not-in-code": 0, "personal-config-not-shared": 0, "env-secrets-not-committed": 0 },
  },
];

// Записи, которые работают на одном `sh` и дают один и тот же ответ на любой машине: без
// `requires:` (нет чужого инструмента — ответ зависел бы от установленного) и без сети.
const NETWORK = new Set(["no-phantom-package"]);
const PORTABLE = readdirSync(KIT, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(KIT, d.name, "gate.yml")))
  .map((d) => d.name)
  .filter((slug) => {
    const yml = readFileSync(join(KIT, slug, "gate.yml"), "utf8");
    return !NETWORK.has(slug) && /any:\s*bash \{gate\}\/check\.sh \{dir\}/.test(yml) && !/^requires:/m.test(yml);
  });

for (const c of CASES) {
  test(`случай: ${c.name}`, (t) => {
    const p = project(t, c.files);
    for (const args of c.before || []) aqk(p, ...args);
    for (const [slug, want] of Object.entries(c.gates || {})) {
      const r = gate(p, slug);
      assert.equal(r.code, want, `${slug}: ждали ${want}, получили ${r.code}. Источник: ${c.source}\n${r.out}`);
    }
    if (c.doctorNot || c.doctorHas) {
      if (!c.before) aqk(p, "init");
      const r = c.env ? aqkEnv(p, c.env, "doctor") : aqk(p, "doctor");
      if (c.doctorNot) assert.doesNotMatch(r.out, c.doctorNot, `источник: ${c.source}\n${r.out}`);
      if (c.doctorHas) assert.match(r.out, c.doctorHas, `источник: ${c.source}\n${r.out}`);
    }
    // Перекрёстная проверка: на обычном проекте ни одна переносимая запись не отвечает «не смогли
    // проверить». Код 2 здесь — сбой записи на чужой раскладке, а не свойство проекта.
    const broken = PORTABLE.map((slug) => [slug, gate(p, slug)]).filter(([, r]) => r.code !== 0 && r.code !== 1);
    assert.deepEqual(broken.map(([s, r]) => `${s}: код ${r.code}`), [],
      `записи не смогли проверить обычный проект:\n${broken.map(([s, r]) => `${s}:\n${r.out}`).join("\n")}`);
  });
}
