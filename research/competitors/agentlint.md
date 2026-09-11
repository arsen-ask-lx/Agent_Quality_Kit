# agentlint

- Репозиторий: https://github.com/agentlint/agentlint · изучен коммит `f922222108dbc0bf7bc11b63f25097f7219eb86d` (ветка main, 2026-06-17)
- Пакет: `@agentlinthq/cli` 2.3.0 (npm, 2026-06-12). Одноимённый пакет `agentlint` без области — **другой проект**
- MIT · 75 коммитов · 2 звезды, 0 форков (замер 2026-09-11) · создан 2026-05-10
- Разбирали вместе с владельцем 2026-09-11: код прочитан по группам, запущен на общем наборе

## Что это на самом деле

Оценка готовности репозитория к агентам от 0 до 100. Около 30 правил в пяти группах с
весами: обнаружимость 25, сборка 25, соглашения 20, документация 15, безопасность 15
(`packages/core/src/score.ts:3-9`). Правило получает только три операции — прочитать файл,
проверить существование, найти по маске (`packages/core/src/types.ts` — `ScanContext`); **ничего
не запускает**. Всё, что проверяется, — наличие файлов и слов в тексте. Растёт в облачный
сервис: `--push` на agentlint.sh, панель, таблица лидеров, пороги для команд (ветки
`feat/leaderboard-runner`, `feat/policy-thresholds-team`, `docs/server-side-scan-on-push`).

## Близнецы: различает ли real и fake

**Нет.** `twin-real` и `twin-fake` (отличаются тремя строками: `|| true` в CI и Makefile,
`--exit-zero` у ruff, тест без assert) — оба **38/100**, отчёты совпадают байт в байт, кроме пути.
Для сравнения: первый `aqk doctor` тоже не различает; различает запись каталога
`ci-actually-fails`, запущенная напрямую.

## Сравнение на одних проектах

| Проект | agentlint | AQK |
|---|---|---|
| twin-real / twin-fake | 38 / 38 | `doctor` одинаково; `ci-actually-fails` 0 / 1 |
| requests | 24/100: нет AGENTS.md, нет переходников, «нет команды сборки», «нет линтера» | видит `make test` и pre-commit, «начните с трёх», 18 записей к установке |
| express | 19/100 | — |
| сам AQK | 35/100: «CI не запускает сборку/тесты/линт», «соглашения 0/20» | AQK-3, 30 гейтов доказанно ловят брак |

## Ошибки, найденные при чтении и запуске

- `.env` ищется на диске, а не в git (`scan-context.ts` — `exists` через stat): закоммиченный и
  лежащий в `.gitignore` не различаются — ложная тревога «credentials may be exposed»
- обход не читает `.gitignore` (игнор только `node_modules`, `dist`, `.git`)
- python не может пройти `typecheck-cmd-documented`: нужен npm-скрипт (`rules/buildability.ts:183-190`)
- `lint-cmd-documented` признаёт только npm-скрипты: `make lint`, записанный в AGENTS.md, — «не описан»
- `test-cmd-documented` описан как «runnable», а засчитывает любой `pyproject.toml` (`buildability.ts:88-89`)
- по умолчанию кладёт `agentlint-report.html` в корень чужого репозитория

## Как показывает результат человеку

- терминал: пять полосок с баллами, итог, «5 прошло, 13 нет, 4 предупреждения» и **только пять
  главных исправлений** (`Top fixes`), а не весь список
- у каждого провала рецепт: `summary`, `diff`, `docsUrl`, `prompt` (`core/src/types.ts` — `Result.fix`)
- **`agentlint prompt`** — одно задание для агента: правила поведения сверху («команды только из
  репозитория», «не подгоняй под проверку», «решение владельца — остановись и спроси»), затем
  исправления по весу, в каждом шаг «запусти один раз и убедись»
- HTML без скриптов: разделы по группам, значки строк, у каждой неудачи раскрывашка
  «Copy-paste prompt for your AI agent»

## Что брать себе

1. **Задание для агента из диагноза** (`aqk doctor --prompt` или отдельная команда): три первых
   шага, непойманные классы из пробы, команды — одним текстом с правилами поведения. Наш
   пользователь уже работает с агентом; сейчас между диагнозом и действием нет моста
2. **Проверка «`.env` в git»** — через `git ls-files`, а не диск. В каталоге AQK `.env` не
   упоминает ни одна запись. Их идея, сделанная правильно
3. **Команда, названная в своде, существует** (`cmd-cross-reference`): `npm run X` / `make X` в
   AGENTS.md → есть ли X. Дёшево, ловит настоящую беду: агент зовёт несуществующую команду
4. **«Только пять главных» в терминале** — у нас «начните с трёх» уже есть; сверить, не тонет ли
   оно в остальном выводе
5. **Свод виден каждому агенту** (переходники CLAUDE.md и т.п.) — только после проверки по
   документации, какие агенты сейчас читают AGENTS.md сами

## Как это у них устроено — подробно, с кодом

Код — MIT, цитаты с изученного коммита `f922222`. Пути от `packages/`.

### 1. Задание для агента (`agentlint prompt`)

Три части. **Рецепт у каждой находки** — поле в типе результата (`core/src/types.ts`):

```ts
fix?: {
  summary: string;
  diff?: string;
  docsUrl?: string;
  /** Predefined, copy-pasteable prompt an AI coding agent can run to apply
   *  the fix. Generated from static templates — never by an LLM. */
  prompt?: string;
};
```

**Шаблон на каждое правило** — словарь `id → функция`, в которую подставляются факты о проекте
(`cli/src/prompts/registry.ts`). Модель не зовётся никогда; шаблон велит агенту брать значения
из репозитория:

```ts
"agents-md-exists": ({ meta }) => `Create an AGENTS.md file at the repository root ...
1. Read README.md, ${manifestName(meta)}, and any CI workflows to learn the project's real
   build/test/lint commands. Do not invent commands.
2. Write AGENTS.md (aim for 30–250 lines) with these sections: ...
3. Every command you document must exist in the repository today.`,
```

**Сборка в одно задание** (`cli/src/prompts/compose.ts:72-127`): берутся только действия
(провал, или предупреждение с рецептом), провалы раньше предупреждений, внутри — по весу
правила; сверху четыре правила поведения, снизу — как проверить:

```ts
lines.push("## Ground rules");
lines.push("- Derive every command, path, and convention from the actual repository — never invent commands that don't exist.");
lines.push("- Keep changes minimal and scoped to these fixes. Do not refactor unrelated code.");
lines.push("- Do not game the checks: the goal is genuinely useful agent context, not merely passing the linter.");
lines.push("- If a fix requires a decision only the repository owner can make (e.g. choosing a license), stop and ask instead of guessing.");
...
lines.push("## Verify");
lines.push("When done, run `npx @agentlinthq/cli@latest .` ... and confirm the rules above now pass and the score improved.");
```

Команда умеет сузить задание до названных правил: `agentlint prompt --rules a,b`
(`cli/src/prompt-cmd/index.ts:35-46`); неизвестный id — ошибка, а не молчание.

**Как ляжет к нам.** Источник заданий у нас уже есть и сильнее их: «начните с этих трёх»
(`startWith`), непойманные классы из пробы (`.aqk/last-probe.md`), готовая команда под язык
(`blindAdvice`), адрес инструмента. Нужны: шаблон на запись (из `gate.yml` и README записи —
второй источник истины заводить нельзя), сборка в одно задание, правила поведения из нашего
же свода («красный тест до кода», «готово = доказано»), и шаг «Проверь» — `aqk doctor --run`.
Их слабость не копировать: у них «проверь» — это «балл вырос», у нас — «гейт краснеет на
красном образце».

### 2. «`.env` в репозитории» — их проверка с ошибкой

```ts
// cli/src/rules/safety.ts
const hasReal =
  (await ctx.exists(".env")) ||
  (await ctx.exists(".env.local")) ||
  (await ctx.exists(".env.production"));
if (hasReal)
  return fail("env-example-no-env", ".env file is committed — credentials may be exposed.", ...);
```

`ctx.exists` — проверка диска (`cli/src/scan-context.ts:30-38`), а не git. `.env`, лежащий в
`.gitignore`, — обычное состояние у любого разработчика — даёт ложное «закоммичен».

**Как ляжет к нам.** Новая запись каталога: `git ls-files` → любой `.env`, `.env.*` кроме
`.example`, `.sample`, `.template` → находка. Красный образец — репозиторий с закоммиченным
`.env`; зелёный — `.env` в `.gitignore` и `.env.example` в git. Проверить снаружи, что класс
настоящий (отчёты об утечках), и завести доказательство в `incidents/`.

### 3. «Команда из свода существует» (`cmd-cross-reference`)

```ts
// cli/src/rules/buildability.ts:234-248
const reRun = /(?:npm|bun|yarn|pnpm)\s+run\s+([a-zA-Z][\w:-]*)/g;
const reShort = /(?:npm|bun|yarn|pnpm)\s+(test|start|build|lint|format|typecheck|type-check)\b/g;
...
const builtin = new Set(["test", "start", "install", "i", "add", "ci"]);
const missing = [...mentioned].filter((name) => !(name in scripts) && !builtin.has(name));
```

Видит только npm-скрипты. **Как ляжет к нам:** то же для всех источников, которые уже читает
`lib/adopt.mjs` — `npm run X` → `package.json`, `make X` → цели `Makefile`, `tox -e X` →
окружения tox, `just X` → `justfile`. Место — рядом с `entry-links-exist` (та ловит
несуществующие ФАЙЛЫ в своде, эта — несуществующие КОМАНДЫ).

### 4. «Только пять главных» (`cli/src/report/terminal.ts:55-63`)

Провалы сортируются по весу правила, в терминал идут первые пять, остальное — в HTML и в
задание. **Как ляжет к нам:** сверить, где у нас «начните с этих трёх» стоит в выводе — не
после ли списка из двадцати крестов, который человек пролистывает.

## Чего не брать

- оценку 0–100 и веса: на близнецах и на самом AQK видно, что число меряет наличие файлов
- порог «AGENTS.md 30–250 строк»: взят без замера
- группу «документация сайта» (`llms.txt`, `robots.txt`): другая задача и расширение вширь,
  заморожено (`PROJECT.md` §9а)
- «конфиг линтера есть» как проверку: у нас сверка кодов правил сильнее

## Не проверено

- качество `--url` (аудит сайта документации) — не запускали
- облачная часть (`--push`, панель, пороги для команд) — без регистрации не смотрели
