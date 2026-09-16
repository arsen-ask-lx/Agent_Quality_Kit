#!/usr/bin/env bash
# Близнецы: два проекта, одинаковых во всём, кроме способности проверки провалиться.
#
# Метод разбора соседей (`.claude/skills/growth`, инструмент 2): инструмент, который меряет
# качество обвязки, обязан ответить на `real` и `fake` по-разному. До 2026-09-16 пара жила только
# описанием в `research/posts/twins-2026-09.md` и собиралась заново под каждый разбор.
#
# Четыре отличия, и больше ни одного — `diff -r` в конце это показывает:
#   package.json   node --test            | node --test || true
#   тест           assert.equal(...)      | вызов без утверждения
#   конвейер       обычный шаг            | continue-on-error: true
#   хук husky      npm test               | npm test || true
#
# Запуск: bash research/competitors/twins.sh <каталог>  → <каталог>/real и <каталог>/fake, каждый git.
set -euo pipefail
out=${1:?каталог}; rm -rf "$out"; mkdir -p "$out"
mk() { # $1 имя, $2 fake(0/1)
  d="$out/$1"; mkdir -p "$d/src" "$d/test" "$d/.github/workflows" "$d/.husky"
  if [ "$2" = 1 ]; then T='node --test || true'; A='sum(2, 2);'; COE='        continue-on-error: true'; H='npm test || true'
  else T='node --test'; A='assert.equal(sum(2, 2), 4);'; COE=''; H='npm test'; fi
  cat > "$d/package.json" <<J
{
  "name": "twin", "version": "1.0.0", "type": "module",
  "scripts": { "test": "$T", "lint": "eslint ." },
  "devDependencies": { "eslint": "^9.0.0" }
}
J
  printf 'export function sum(a, b) {\n  return a + b;\n}\n' > "$d/src/sum.js"
  printf "import assert from 'node:assert';\nimport test from 'node:test';\nimport { sum } from '../src/sum.js';\n\ntest('sum', () => {\n  $A\n});\n" > "$d/test/sum.test.js"
  { printf 'name: ci\non: [push, pull_request]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: 22\n      - run: npm ci\n      - run: npm test\n'; [ -n "$COE" ] && printf '%s\n' "$COE"; true; } > "$d/.github/workflows/ci.yml"
  printf '%s\n' "$H" > "$d/.husky/pre-commit"
  printf '# AGENTS.md\n\n## Commands\n\n- test: `npm test`\n- lint: `npm run lint`\n\n## Rules\n\n- Run `npm test` before every commit.\n' > "$d/AGENTS.md"
  printf '# twin\n\nAdds two numbers. Run `npm test`.\n' > "$d/README.md"
  printf 'node_modules\n' > "$d/.gitignore"
  (cd "$d" && git init -q && git add -A && git -c user.name=t -c user.email=t@t commit -qm init)
}
mk real 0; mk fake 1
diff -r --exclude=.git "$out/real" "$out/fake" || true
