// Пайп прячет код выхода проверки — вторая форма гашения, кроме `|| true` и continue-on-error.
//
// ОТКУДА. Доклад «AI-кодинг, не вайб-кодинг» (С. Шима, 2026-09-19), правило гейта «пайп
// запрещён»: у автора пайп однажды спрятал код выхода, и красный тест уехал на прод зелёным.
// Наш `ci-actually-fails` на `run: pytest | tee test.log` сказал «чисто», код 0 — проверено
// 2026-09-21 до единой правки.
//
// ПОЧЕМУ ЭТО ГАШЕНИЕ. Документация GitHub Actions, таблица оболочек по умолчанию: шаг без
// `shell:` на Linux идёт как `bash -e {0}` — БЕЗ pipefail; явный `shell: bash` — как
// `bash --noprofile --norc -eo pipefail {0}`. Без pipefail код трубы — код последней команды:
// `false | tee /dev/null` под `bash -e` даёт 0, под `-eo pipefail` — 1 (проверено вживую).
//
// ЧТО ЗЕЛЁНОЕ. Каждый законный уклад — отдельный случай ниже: гейт, который краснеет на
// `shell: bash`, выключат первым, и вместе с ним — всё, что он ловил по делу.
import test from "node:test";
import assert from "node:assert/strict";
import { project, gate } from "./_fixture.mjs";

const wf = (steps, { runsOn = "ubuntu-latest", head = "" } = {}) =>
  `name: ci\non: [push]\n${head}jobs:\n  test:\n    runs-on: ${runsOn}\n    steps:\n${steps}`;

function run(t, steps, opts) {
  return gate(project(t, { ".github/workflows/ci.yml": wf(steps, opts) }), "ci-actually-fails");
}

test("труба после проверки без pipefail — провал погашен", (t) => {
  const cases = {
    "pytest | tee": "      - run: pytest | tee test.log\n",
    "многострочный go test | go-junit-report":
      "      - name: tests\n        run: |\n          go test ./... 2>&1 | go-junit-report > report.xml\n",
    "shell: sh — тоже без pipefail":
      "      - run: npm test | tee out.txt\n        shell: sh\n",
    "cd … && перед проверкой": "      - run: cd web && npm test | tee out.txt\n",
    "npx перед проверкой": "      - run: npx vitest run --coverage | tee out.txt\n",
  };
  for (const [name, steps] of Object.entries(cases)) {
    const r = run(t, steps);
    assert.equal(r.code, 1, `«${name}» прошло зелёным:\n${r.out}`);
    assert.match(r.out, /pipefail/, `«${name}»: не сказано, что сломано и как чинить:\n${r.out}`);
  }
});

test("законные трубы не красятся", (t) => {
  const cases = {
    "shell: bash даёт pipefail": ["      - run: pytest | tee test.log\n        shell: bash\n"],
    "set -o pipefail до трубы":
      ["      - run: |\n          set -o pipefail\n          pytest | tee test.log\n"],
    "set -euo pipefail до трубы":
      ["      - run: |\n          set -euo pipefail\n          pytest | tee test.log\n"],
    "defaults на весь файл":
      ["      - run: pytest | tee test.log\n", { head: "defaults:\n  run:\n    shell: bash\n" }],
    "Windows: pwsh выходит по коду нативной команды":
      ["      - run: pytest | Tee-Object test.log\n", { runsOn: "windows-latest" }],
    "код трубы переспрошен через PIPESTATUS":
      ["      - run: |\n          pytest | tee test.log\n          exit ${PIPESTATUS[0]}\n"],
    "проверка в конце трубы": ["      - run: git ls-files '*.py' | xargs pytest\n"],
    "труба без проверки": ["      - run: git log --oneline | head -5\n"],
    // Ложные из замера 2026-09-21 по 49 чужим конвейерам — имя инструмента не на месте
    // команды: в адресе загрузки, в тексте JS-скрипта, в кавычках регулярного выражения.
    "установка инструмента через curl | tar":
      ["      - run: curl -sSfL https://github.com/gitleaks/gitleaks/releases/download/v8.21.2/gitleaks_8.21.2_linux_x64.tar.gz | tar xz\n"],
    "имя инструмента в тексте скрипта":
      ["      - run: |\n          comment += `| Filesystem (Trivy) | ok |`\n"],
    "путь с именем инструмента в echo | grep":
      ["      - run: |\n          if echo \"$FILES\" | grep -qE '^(packages/website/tests/)'; then echo hit; fi\n"],
    // Замер 2026-09-22 по 64 чужим конвейерам: `|| true` на диагностике, где имя инструмента —
    // часть пути. Ветка `|| true` искала имя где угодно в строке, как первая версия трубы.
    "|| true на ls пути с именем инструмента":
      ["      - name: Container facts\n        run: |\n          ls \"${PLAYWRIGHT_BROWSERS_PATH:-/ms-playwright}\" || true\n"],
    "труба внутри кавычек":
      ["      - run: npx playwright test -g '5368|6428'\n"],
  };
  for (const [name, [steps, opts]] of Object.entries(cases)) {
    const r = run(t, steps, opts);
    assert.equal(r.code, 0, `«${name}» покрашено:\n${r.out}`);
  }
});
