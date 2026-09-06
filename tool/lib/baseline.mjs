// tool/lib/baseline.mjs — обязательный минимум проекта, проверяемый прогоном.
//
// ЗАЧЕМ. `kit/docs/ai/project-baseline.md` — 50 пунктов «что обязано быть, чтобы работу можно
// было отдать агентам». До сих пор это было единственное место, где комплект просил верить на
// слово, что человек прочитал и сверился. Ручной проход по живому проекту нашёл настоящее:
// логирование не задано вовсе, трекера ошибок нет, задачи конвейера не запускались ни разу.
// Дисциплина не масштабируется — то, что проверяется машиной, проверяет машина.
//
// ЧЕСТНАЯ ГРАНИЦА. Машина проверяет НАЛИЧИЕ, а не работоспособность: «линтер настроен» — не то
// же, что «линтер ловит». Поэтому вывод говорит, чем именно доказан пункт, а непроверяемые
// пункты называются числом, а не прячутся.
//
// НЕЙТРАЛЬНОСТЬ К СТЕКУ — условие, а не пожелание. Каждый признак — это семейство маркеров
// разных экосистем; пункт засчитывается по любому из них. Список, знающий только про npm,
// объявил бы половину мира несоответствующей.

// Совпадение по имени файла в корне: точное имя, либо имя, начинающееся с образца (`.eslintrc*`).
function hit(files, names) {
  const low = files.map((f) => f.toLowerCase());
  return names.find((n) => {
    const k = n.toLowerCase();
    return k.endsWith("*") ? low.some((f) => f.startsWith(k.slice(0, -1))) : low.includes(k);
  });
}

// Пункты, которые машина может подтвердить фактом, а не мнением. Остальные сорок с лишним
// остаются человеку — и называются вслух, чтобы «не проверено» не читалось как «в порядке».
const ITEMS = [
  { n: 1, key: "oneCommand", files: ["makefile", "justfile", "taskfile.yml", "taskfile.yaml", "rakefile", "docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml", "package.json", "mise.toml", "pixi.toml"] },
  { n: 2, key: "lockfile", files: ["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb", "poetry.lock", "pipfile.lock", "uv.lock", "requirements.txt", "go.sum", "cargo.lock", "gemfile.lock", "composer.lock", "gradle.lockfile", "packages.lock.json", "pubspec.lock", "mix.lock"] },
  { n: 3, key: "sameEnv", files: ["dockerfile", "containerfile", "docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml", ".devcontainer", "devcontainer.json", "flake.nix", "shell.nix", ".tool-versions", ".nvmrc", ".python-version", ".ruby-version", ".sdkmanrc", "mise.toml", "asdf.toml"] },
  { n: 6, key: "formatter", files: [".editorconfig", ".prettierrc*", "prettier.config*", "rustfmt.toml", ".rustfmt.toml", ".clang-format", ".scalafmt.conf", ".rubocop.yml", "biome.json", "biome.jsonc", ".dprint.json", "dprint.json"] },
  { n: 7, key: "linter", files: [".eslintrc*", "eslint.config*", "ruff.toml", ".ruff.toml", ".flake8", ".pylintrc", ".golangci.yml", ".golangci.yaml", "clippy.toml", ".rubocop.yml", "phpstan.neon", "psalm.xml", "detekt.yml", ".swiftlint.yml", "biome.json", ".credo.exs", "checkstyle.xml"] },
  { n: 8, key: "types", files: ["tsconfig.json", "jsconfig.json", "mypy.ini", ".mypy.ini", "pyrightconfig.json", "sorbet", "go.mod", "cargo.toml", "pom.xml", "build.gradle", "build.gradle.kts", "stack.yaml", "dune-project"] },
  { n: 9, key: "secretScan", files: [".gitleaks.toml", "gitleaks.toml", ".secrets.baseline", ".trufflehogignore", ".talismanrc", ".gitguardian.yml", ".gitguardian.yaml"], gate: "secrets-not-in-code" },
  { n: 10, key: "fileSize", gate: "file-size-limit" },
  { n: 11, key: "ownInvariants", gate: "no-print-in-prod" },
  { n: 13, key: "tests", fact: "has_tests" },
  { n: 19, key: "pipeline", fact: "has_ci" },
  { n: 30, key: "errorTracker", deps: ["sentry", "rollbar", "bugsnag", "honeybadger", "airbrake", "appsignal", "datadog", "newrelic", "new-relic", "elastic-apm", "opentelemetry", "glitchtip"] },
  { n: 39, key: "machineReadable", manifestField: "entry" },
  { n: 42, key: "rulesInRepo", manifestField: "rules" },
];

// Файлы, в которых объявляют зависимости. Один список на все экосистемы: пункт про трекер
// ошибок нейтрален, а знать про один только npm — значит объявить половину мира несоответствующей.
const DEP_FILES = [
  "package.json", "requirements.txt", "pyproject.toml", "pipfile", "poetry.lock", "uv.lock",
  "go.mod", "cargo.toml", "gemfile", "composer.json", "build.gradle", "build.gradle.kts",
  "pom.xml", "mix.exs", "pubspec.yaml", "project.clj", "deps.edn",
];

// Чем подтверждён пункт, возвращается СТРУКТУРОЙ, а не готовой фразой: текст переводится,
// а факт — нет. Собранная здесь строка утекла бы в английский вывод по-русски; так и вышло.
/**
 * Вход — только факты, никакого ввода-вывода: функция чистая и проверяется модульно.
 *   files      — имена файлов и каталогов в корне репозитория
 *   gateKeys   — гейты, объявленные в манифесте
 *   facts      — то, что уже насчитал осмотр репозитория (has_ci, has_tests)
 *   manifest   — разобранный .aqk.yml
 *   depsText   — склеенное содержимое файлов зависимостей, в нижнем регистре
 */
function assessBaseline({ files = [], gateKeys = [], facts = {}, manifest = {}, depsText = "" }) {
  return ITEMS.map((it) => {
    if (it.gate && gateKeys.includes(it.gate)) return { n: it.n, key: it.key, ok: true, by: { kind: "gate", value: it.gate } };
    if (it.fact) return { n: it.n, key: it.key, ok: Boolean(facts[it.fact]), by: { kind: "fact", value: it.fact } };
    if (it.manifestField) {
      const v = manifest?.[it.manifestField];
      const filled = Array.isArray(v) ? v.length > 0 : Boolean(String(v || "").trim());
      return { n: it.n, key: it.key, ok: filled, by: { kind: "manifest", value: it.manifestField } };
    }
    if (it.deps) {
      const found = it.deps.find((d) => depsText.includes(d));
      return { n: it.n, key: it.key, ok: Boolean(found), by: found ? { kind: "dep", value: found } : null };
    }
    const f = hit(files, it.files || []);
    return { n: it.n, key: it.key, ok: Boolean(f), by: f ? { kind: "file", value: f } : null };
  });
}

// Всего пунктов в методичке. Число не выводится из кода: методичка — текст, и её длину знает
// только она сама. Сверяется проверкой, чтобы не разошлось молча.
const BASELINE_TOTAL = 50;

// Наружу — только то, что зовут. Экспорт, который никто не импортирует, читается как «это
// часть договора» и мешает менять внутренности; `hit` остался внутри. Поймал наш же dead-code.
export { assessBaseline, ITEMS, DEP_FILES, BASELINE_TOTAL };
