// Хук husky, который гасит провал проверки, — та же беда, что `|| true` в конвейере.
//
// ОТКУДА. Разбор соседей 2026-09-21: на паре близнецов `|| true` в `.husky/pre-commit` не поймали
// ни AQK, ни code-quality-skill — назвал его только Exadel. Замер 2026-09-22: поиск GitHub
// `"|| true" path:.husky` — 4416 файлов; из 97 хуков (по одному на репозиторий) проверку гасят 7
// у пяти авторов: `pnpm lint-staged || true`, `npx --no -- lint-staged 2>/dev/null || true`,
// `npx --no -- commitlint --edit ${1} || true`, `npm run lint:dependencies || true` (трижды),
// `yarn lint:fix && git add -A || true`. Ещё четыре попадания поиска — законные: `git add
// .stylelintrc.cjs || true`, вывод через `head | grep`, сборка списка файлов, `post-merge`.
//
// ПОЧЕМУ НЕ «ТОЛЬКО ПОСЛЕДНЯЯ КОМАНДА». В конвейере гашение прощается, если после него в том же
// шаге стоит команда, выносящая вердикт по выводу (`eslint > out || true`, потом `diff`). В хуке
// так прощать нельзя: у scolladon после `npm run lint:dependencies || true` идёт другая команда,
// и правило «последняя в блоке» промолчало бы. Прощается только вывод В ФАЙЛ — без перенаправления
// следующей команде нечего сверять.
import test from "node:test";
import assert from "node:assert/strict";
import { project, gate } from "./_fixture.mjs";

const run = (t, files) => gate(project(t, files), "ci-actually-fails");

test("хук husky, гасящий проверку, красный", (t) => {
  const cases = {
    "lint-staged под || true": { ".husky/pre-commit": "pnpm lint-staged || true\n" },
    "lint-staged с глушением вывода": { ".husky/pre-commit": "npx --no -- lint-staged 2>/dev/null || true\n" },
    "commitlint под || true": { ".husky/commit-msg": "npx --no -- commitlint --edit ${1} || true\n" },
    "погашенная проверка не последняя в хуке":
      { ".husky/pre-push": "npm run lint:dependencies || true\nnpm run build\n" },
    "цепочка с проверкой под || true": { ".husky/pre-commit": "yarn lint:fix && git add -A || true\n" },
    "вывод в /dev/null — не вывод в файл для сверки":
      { ".husky/pre-commit": "npx --no -- lint-staged 2>/dev/null || true\nnpm run build\n" },
  };
  for (const [name, files] of Object.entries(cases)) {
    const r = run(t, files);
    assert.equal(r.code, 1, `«${name}» прошло зелёным:\n${r.out}`);
  }
});

test("законное в хуках не красится", (t) => {
  const cases = {
    "служебная команда под || true": { ".husky/pre-commit": "git add \"packages/.stylelintrc.cjs\" >/dev/null 2>&1 || true\npnpm lint-staged\n" },
    "проверка без гашения": { ".husky/pre-commit": "pnpm lint-staged\n" },
    "вывод в файл и сверка следом": { ".husky/pre-commit": "npx eslint src > /tmp/lint.txt || true\ndiff lint-snapshot.txt /tmp/lint.txt\n" },
    "внутренности husky не хуки": { ".husky/_/husky.sh": "npm test || true\n", ".husky/pre-commit": "npm test\n" },
    "после слияния — не вердикт": { ".husky/post-merge": "npm install || true\n" },
    // Два ложных из замера 2026-09-22 по 97 хукам — имя инструмента не на месте команды.
    "имя инструмента в переменной":
      { ".husky/pre-commit": "head -30 \"$eslint_out\" 2>/dev/null | grep -v \"^[0-9]\" | head -20 || true\n" },
    "имя инструмента в шаблоне grep":
      { ".husky/pre-commit": "SCAN_FILES=$(git diff --cached --name-only | grep -v -E '(\\.gitleaks\\.toml$)' || true)\n" },
  };
  for (const [name, files] of Object.entries(cases)) {
    const r = run(t, files);
    assert.equal(r.code, 0, `«${name}» покрашено:\n${r.out}`);
  }
});
