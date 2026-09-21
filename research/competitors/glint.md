# glint — `aiseeq/glint`

- Репозиторий: https://github.com/aiseeq/glint · изучен коммит `54b70f4` (2026-09-11) · MIT ·
  18 звёзд, 4 форка · создан 2026-01-07 · Go, 75 864 строки, из них 161 файл проверок
- Форма: **статический анализатор** Go и TypeScript/JavaScript, одна программа, 129 правил
  (`glint rules`), вывод console/JSON/summary, автоисправление у семи правил
- Разбор 2026-09-21: собран в `golang:1.25` (на машине Go нет), `go test -short ./...` зелёный
  (15 пакетов, 62 с), прогнан на близнецах, на нашем репозитории и на пяти минимальных
  воспроизведениях

## Вывод одной строкой

**Не сосед по вопросу, а исполнитель для каталога.** glint не спрашивает «покраснеет ли ваша
проверка» — он сам и есть проверка. Из 129 правил: **6** — родной рецепт для Go в две наши
записи (`test-has-assertion` Go сейчас не покрывает вовсе), **10** — заявки на новые классы,
**36** уже закрыты готовым (golangci-lint, компилятор), **77** не берём: чужая предметная
область, не наша тема или вкус автора. Разбор — ниже, в «Все 129 правил».

## Кто и как его пишет

147 коммитов из 190 подписаны `Co-Authored-By: Claude`, `make commit` ставит подпись сам. Свод
агента (`CLAUDE.md`, 40 строк, по-русски) почти дословно совпадает с нашим: «фолбек к
default/magic/0/nil запрещён», «ложные срабатывания чинить в правиле, красный тест с реальным
кодом», «факты выяснять своими инструментами». Правила растут **из находок в закрытых проектах
автора** (файл `.glint-parity`, в git не входит): каждое новое правило — TDD-репро с реальной
находки и сверка числа находок до и после на пяти проектах. Это наш инструмент 1 из
`growth/SKILL.md`, только корпус у них закрытый.

**Конвейера нет.** В репозитории нет `.github/`: ни тесты, ни `self-check` не гоняются ни на
одной машине, кроме машины автора. Следствие ниже, в дефекте 4.

## Близнецы

Пара Go-проектов, одинаковых во всём, кроме способности проверки провалиться:

| | настоящий | поддельный |
|---|---|---|
| `assert.Equal(t, 4, got)` / `assert.Equal(t, got, got)` | — | **tautological-assertion**, HIGH |
| `if got != 4 { t.Fatalf }` / `t.Logf` вместо проверки | — | **test-without-assertion**, HIGH |
| `os.Exit(1)` / голый `return` после ошибки в `main` | — | **main-return-after-error**, HIGH: «the process exits 0 and scripts, CI and cron see a successful run» |
| код возврата | 0, «No issues found» | 1 |

Три отличия из трёх, ноль ложных на настоящем. `if got != got` (тавтология без testify) не ловит:
Go-правило смотрит только вызовы testify. Это граница, а не дефект.

## Прогон по нашему репозиторию

С первого раза не отработал вовсе (дефект 1). После вырезания шести `.go`-файлов: 108 файлов,
95 находок: 82 про оформление Markdown, 6 битых ссылок (все ложные: пример `[name](url)` в
обратных кавычках и адрес опубликованного сайта), один «секрет», один `TODO` и четыре находки про
тесты в наших **красных** образцах, где брак стоит намеренно, — и одна на зелёном.

**Одно срабатывание на зелёном — ценное место (инструмент 7):**
`kit/gates/test-has-assertion/green/checkout.test.ts:7`

```ts
it("не падает на пустой корзине", async () => {
  await checkout({ items: [] });
});
```

glint: «has no assertions at all — nothing in its body can fail». Неправда: тест падает, если
`checkout` бросит. Их собственное Go-правило `test-without-assertion` пишет в шапке ровно наше
мнение: «A test that merely exercises code without logging is a different, legitimate thing — it
fails if that code panics — and is not reported». Правило для TS решает противоположно. Это
расхождение внутри glint, а не у нас; нашего зелёного образца не меняем.

## Дефекты, найденные прогоном

Каждый воспроизведён на `54b70f4`, воспроизведение — в самом пункте.

1. **Один `.go` без `go.mod` роняет весь прогон**, включая анализ JS и Markdown:
   `analyzed file "/p/x.go" is outside a Go module`, код 1. Документированный обход
   `--tolerate-broken-packages` («their files are analyzed without type information») падает
   дальше: `rule "audit-actor-propagation": Go project has no SSA program`. Воспроизведение: папка
   с одним `package main; func main() {}`. Тот же класс, что их открытая issue #2 (одно правило
   роняет весь прогон), но причина другая. **Не молчит** — падает громко, их ценность соблюдена.
2. **`.mjs`, `.cjs`, `.mts` не анализируются вовсе, а `filesSkipped` говорит 0.** Четыре копии
   нашего красного `checkout.test.js` с разными расширениями: находки у одной, «Files analyzed: 1».
   Наш репозиторий: 79 `.mjs`, glint их не видел и не сказал об этом. Проект на Node с ESM-тестами
   получит «No issues found» по построению. **Это наш класс в чистом виде** — проверка зелёная там,
   где работать не могла.
3. **`glint config validate` одобряет опечатки.** `tautologcal-assertion:` (нет такого правила),
   `patern:` (нет такой категории), `setings:` (нет такого раздела) — на все три «Configuration
   valid», код 0. Флаг `--rule` с неизвестным именем при этом падает, и у них есть проверка
   именно на это (`TestGetEnabledRulesRejectsUnknownRule`: «must be an error, not a silent
   fallback»). Файл конфигурации той же защиты не получил. Направление опечатки здесь безопасное —
   правило остаётся включённым, — но `exceptions:` под опечатанным именем молча не действуют, и
   `validate` об этом не скажет. У нас этот класс закрыт: «непонятая строка манифеста называется».
4. **Их `make self-check` падает на свежем клоне.** `AGENTS.md` — символическая ссылка на
   `/home/aisee/work/glint/CLAUDE.md`, и glint на битой ссылке прерывает обход:
   `walk project files: open /src/AGENTS.md: no such file or directory`. Сама ссылка — issue #3
   (2026-08-11, без ответа), но то, что **любая битая ссылка на файл в чужом репозитории роняет
   весь прогон**, там не сказано. Воспроизведение: `README.md` плюс `ln -s /nonexistent/x.md
   NOTES.md` → код 1; ссылка на каталог не мешает. Конвейер нашёл бы это в первый же день.
5. **Подавление без причины принимается.** `//nolint:main-return-after-error` без единого слова
   снимает находку. README: «Always add the reason after the marker» — требование написано и не
   проверяется. Голый `//nolint` не действует — это правильно.
6. **`range-val-pointer` врёт на Go 1.22+.** Модуль с `go 1.22`, `ps = append(ps, &v)` в цикле —
   «all iterations share same address». С Go 1.22 переменная цикла своя на каждой итерации для
   модулей, объявивших `go 1.22` и новее (https://go.dev/blog/loopvar-preview); правило версию
   из `go.mod` не читает вовсе.

## Все 129 правил

Разобраны 2026-09-21 по шапке каждого правила в коде (там автор пишет, из какой беды оно
выросло), кандидаты — ещё и прогоном. Полнота сверена машиной: каждое из 129 имён из
`glint rules` стоит ровно в одной группе ниже. Готовые аналоги сверены по списку линтеров
golangci-lint из их JSON-схемы (115 имён), а не по памяти; где поведение аналога проверено
отдельно — сказано.

**Прогон кандидатов.** Подопытный модуль `go 1.22` с посаженными дефектами: сработали
`never-assigned-field`, `map-iteration-order` (отсортированная копия — молчит),
`unchecked-len-division`, `test-external-service`, `migration-duplicate-version`,
`unused-config-field`. Последнее — только на тегах `yaml`/`toml`/`env`/`mapstructure`/`ini`:
`json` исключён намеренно, хотя шапка правила говорит «or from a payload».

**Голова к голове на проглоченной ошибке**, четыре формы в одном файле:

| форма | nilerr (golangci-lint) | glint |
|---|---|---|
| `if err != nil { return nil }` | да | да (`silent-error-handling`) |
| `if err != nil \|\| v == nil { return 0, nil }` | да | да (`masked-error-in-or-condition`) |
| `log.Printf(err); return ""` | нет | **нет**: `log-and-return-zero` ждёт уровня Error/Warn |
| `ValidatePermission() bool { … return false }` | нет | да (`error-masked-as-false-bool`) |

### 1. Берём в существующую запись как родной рецепт для Go — 6

Проверено на наших записях: **`test-has-assertion` Go не покрывает вообще** — её `check.sh`
разбирает Python, JS и TS. `swallowed-error` зовёт для Go `errcheck -blank`, а тот видит только
`_ = f()`, но не ветку, где ошибку проверили и выбросили.

| правило | в какую запись | готовый аналог |
|---|---|---|
| `test-without-assertion` | `test-has-assertion` | поиск не нашёл. Тавтологии в Go закрывает `testifylint`, чекер `useless-assert` (README сверен) — он стандартнее, берём его, а не `tautological-assertion` |
| `error-masking` | `swallowed-error` | ядро — `nilerr` (README сверен, прогон выше) |
| `silent-error-handling` | `swallowed-error` | то же ядро, что `nilerr` |
| `masked-error-in-or-condition` | `swallowed-error` | `nilerr` ловит ту же форму |
| `error-masked-as-false-bool` | `swallowed-error` | не найден; `nilerr` пропустил |
| `log-and-return-zero` | `swallowed-error` | не найден |

Порядок по правилу «сперва готовое»: в рецепт идут `nilerr` и `testifylint`, glint — добавкой
там, где он видит больше (`error-masked-as-false-bool`, `test-without-assertion`). Рецепт
обязан называть правила через `--rule`: заявку `covers` мы сверяем с командой.

### 2. Новые классы — заявки в каталог, каждой нужен замер частоты — 10

Отобраны по одному признаку: **обещание или защита молча не действует** — наша тема, а не
общее качество кода.

| правило | что молча не работает | проверено прогоном |
|---|---|---|
| `main-return-after-error` | ошибка обработана, процесс выходит с 0, конвейер видит успех. Поиск аналога не нашёл | да, близнецы |
| `unused-config-field` | настройку пишут в конфиг, она ни на что не влияет | да, `yaml` |
| `never-assigned-field` | зависимость читают, никто не присваивает — паника на первом вызове | да |
| `silently-optional-dependency` | сеттер зовут не везде, фича выключена без слова (у автора: алерты не ушли ни разу за всю историю) | нет |
| `typed-nil-into-interface` | проверка `iface == nil` не срабатывает на nil-указателе | нет |
| `test-external-service` | «пропустить, если нет ключа» — а ключ всегда есть в `.env`, тест ходит в живой сервис | да |
| `stub-method` | метод возвращает `not implemented` — заглушка агента, доехавшая до кода | нет |
| `mock-identifier` | `Mock`/`Fake`/`Stub` в прод-коде: подделка выглядит как настоящий путь | нет |
| `tombstone-comment` | «// X удалён» — агентский след; но это чтение текста, запись второго рода (`SPEC.md` §6) | нет |
| `migration-duplicate-version` | две миграции с одним номером, мигратор молча берёт одну | да |

Приоритет внутри группы: `main-return-after-error` и `unused-config-field` — наш класс в чистом
виде и оба проверены прогоном.

### 3. Есть готовое — glint для этого не нужен — 36

- **компилятор**: `append-assign` — неприсвоенный `append` Go не собирает (`go vet`: «is not
  used»), правило пустое;
- **поведение аналога сверено отдельно**: `tautological-assertion` → `testifylint`
  `useless-assert`; `error-rebuilt-from-text` → `errorlint`, настройка `errorf` («Check whether
  fmt.Errorf uses the %w verb»); `e2e-blind-wait` → `eslint-plugin-playwright`,
  `no-networkidle` и `no-wait-for-timeout`; `range-val-pointer` → семантика Go 1.22 (и дефект 6);
- **аналог в golangci-lint по имени, поведение не прогонялось**: `cyclomatic-complexity` →
  `gocyclo`/`cyclop`; `deep-nesting` → `nestif`; `long-function` → `funlen`; `solid-isp` →
  `interfacebloat`; `unused-param` → `unparam`; `unused-symbol` → `unused`; `doc-missing`,
  `naming-convention` → `revive`; `cross-file-duplicate`, `duplicate-block` → `dupl`;
  `bool-compare`, `deprecated-ioutil`, `empty-block` → `staticcheck`; `context-background` →
  `contextcheck`; `defer-in-loop` → `gocritic`; `error-string` → `staticcheck`; `error-wrap` →
  `wrapcheck`; `go-modern`, `interface-any` → `modernize`; `http-body-close` → `bodyclose`;
  `ignored-error` → `errcheck`; `magic-number` → `mnd`; `return-nil-error`, `nil-return-stub` →
  `nilnil`; `shadow-variable` → `govet`; `sql-rows-close` → `sqlclosecheck`/`rowserrcheck`;
  `todo-comment` → `godox`; `hardcoded-secret`, `sql-injection` → `gosec`; `type-assertion` →
  `forcetypeassert`; `scattered-construction` → `exhaustruct`.

У нас эти намерения уже держат `complexity-limit`, `dead-code`, `duplicate-code`,
`todo-without-task`, `secrets-not-in-code`.

### 4. Не берём — 77

**а) Предметная область автора — 27.** Деньги, платежи, аудит, БД, одна конкретная
архитектура: `audit-actor-propagation`, `deterministic-uuid`, шесть `financial-*`,
`frontend-money-arithmetic`, `frontend-env-fallback`, `idempotency-check-then-create`,
`provider-command-before-intent-persist`, `provider-command-retry`,
`pagination-boundary-truncation`, `terminal-after-failed-checkpoint`,
`non-atomic-status-history`, `multi-write-no-transaction`, `select-then-write-race`,
`select-star-struct-scan`, `query-in-loop`, `test-schema-mutation-without-cleanup`,
`deprecated-nginx-http2-listen`, `react-remount-key`, `nullable-object-call`,
`response-type-in-function`, `http-error-plaintext`, `token-pos-offset`. Их свод сам говорит:
проектно-специфичное живёт у проекта. Многие — настоящие беды с настоящим случаем в шапке, но
сторожат корректность программы, а не то, работает ли защита.

**б) Настоящие ошибки программы, но не наша тема — 26.** Гонки, утечки, NaN, повторы запросов:
`map-iteration-order`, `unchecked-len-division`, `unguarded-shared-field`, `mutex-lock`,
`retry-drops-transport-failure`, `retry-request-reuse`, `server-error-hides-client-cancel`,
`secret-in-query-url`, `sensitive-query-param`, `unbounded-response-read`,
`unbounded-sync-map`, `sleep-without-context`, `context-first`, `quadratic-loop`,
`string-concat`, `time-equal`, `nil-slice`, `nil-di`, `ignored-decision-result`,
`reimplemented-stdlib`, `unused-field`, `unused-internal-export`, `orphaned-interface`,
`error-string-compare`, `error-length-check`, `doc-wrong-subject`. Каталог AQK — про то, держит ли
обещание машина, а не второй линтер Go (`PROJECT.md` §9а: расширение вширь заморожено).

**в) Политика автора, вкус или шум — 24.** Правила его `CLAUDE.md` («no legacy», «no fallback»),
у чужого проекта такой политики может не быть: `import-direction`, `layer-violation`,
`solid-srp` (сам автор его у себя выключил), `deprecated-comment`, `legacy-comment-marker`,
`legacy-identifier`, `redundant-compatibility`, `tech-debt`, `any-in-public-contract` (мы сами
отказались от проверки `any`, `PROJECT.md` §9а), `constructor-nil-return`,
`constructor-swallows-nil-dep`, `empty-struct-return`, `fallback-return`,
`anon-interface-degradation`, `error-cause-dropped`, `silent-config-error`,
`frontend-silent-catch`, `non-canonical-logger` (молчит только в `cmd/**/main.go` — та же стена,
из-за которой наша `no-print-in-prod` Go не берёт). Оформление Markdown: `doc-links`,
`md-broken-link` (6 из 6 на нас ложные), `md-frontmatter`, `md-line-break`,
`md-list-after-label` (82 из 95 находок на нас). И `unfalsifiable-test-case` — семь регулярных
выражений на строку, «запись понимает текст»; ложное на нашем зелёном — оттуда. Из него
берём одну **идею для образца**: `expect([200, 404]).toContain(status)` — утверждение, которому
подходит и рабочий, и удалённый адрес.

### Кроме правил

`tools/history/measure.py` — кривая качества по истории: срез раз в две недели, каждый
прогоняется СЕГОДНЯШНИМ набором правил, настройки проекта игнорируются, чтобы прибор был один
на все срезы. Готовый принцип для нашего замера «стало ли лучше» (§9 п.1а): прибор фиксирован,
меняется только код.

## Письмо

Кандидат по канону `research/outreach/LETTER.md` — **дефект 2** (`.mjs` молча пропущен): беда,
воспроизведение в четыре файла, и она совпадает с их же принципом «fail explicitly». Дефекты 1 и
4 — второй очередью, одним сообщением: оба про «один файл роняет весь прогон», рядом с issue #2.
Оговорка: три открытые issue от посторонних (2026-08-11) без единого ответа — сопровождающий
чужое читает редко. Решение отправлять — за владельцем.

## k6: проверка, которая не может провалиться

Замер того же дня, к записи в каталог, а не к glint. Документация k6
(https://grafana.com/docs/k6/latest/using-k6/checks/): «failed checks do not cause the test to
abort or finish with a failed status»; падение даёт только порог
(https://grafana.com/docs/k6/latest/using-k6/thresholds/).

**Живая проверка, `grafana/k6:2.2.0`.** Скрипт ходит на порт, где сервера нет, три итерации:

| | код | вывод |
|---|---|---|
| `check(r, {"status is 200": …})`, порогов нет | **0** | `checks_failed 100.00% 3 out of 3`, исключение в каждой итерации |
| тот же скрипт + `thresholds: { checks: ["rate==1"] }` | **99** | `✗ 'rate==1' rate=0.00%` |

**Частота.** Поиск GitHub `"k6/http" check extension:js`, 100 файлов, по одному на репозиторий —
87 скриптов, 85 с `check(`:

- порог на `checks` — **1**;
- другие пороги (`http_req_duration`, `http_req_failed`) — 23: код ответа ловят, проверки тела нет;
- порогов в файле нет вовсе — **62**.

Выборка смещена к учебным репозиториям. Из 62 k6 запускается в CI у шести; у трёх это
бенчмарк, намеренно не блокирующий (`|| true`, `continue-on-error`) — решение, а не брак. Один
случай настоящий: `go-sigma/sigma` (181 звезда), `.github/workflows/e2e.yml` запускает
`./k6 run e2e/sc.js` как **e2e-тест** на каждый push и pull request; в скрипте четыре `check()`
(вход, создание и удаление namespace) и ни одного порога. Любой из четырёх ответов может стать
500 — прогон останется зелёным.

**Что это значит для каталога.** Запись опознаёт конструкцию: в скрипте есть `check(` из `k6`, а
в `options.thresholds` нет ключа `checks`. Красный и зелёный образцы — два файла выше.
Ограничение, названное вслух: порог можно вынести в JSON-файл и передать `--config`
(https://grafana.com/docs/k6/latest/using-k6/k6-options/reference/ — флага и переменной окружения
для порогов нет), тогда запись соврёт; значит, смотреть надо и команду запуска: есть ли в ней
`-c`/`--config`. Частота низкая: 1 живой случай на 87 скриптов. Для сравнения, «свод велит
команду, которой нет» — 9 из 99.

**Советовать или ставить k6 — ответ.** Советуем уже: `kit/docs/ai/operational-gates.md`, раздел
«Нагрузочный гейт и soak». Ставить сами — нет, по трём причинам:

1. AQK не ставит инструменты в чужой проект, он ставит гейты, которые зовут то, что у проекта
   уже есть. k6 — отдельный бинарник, а не пакет проекта;
2. нагрузочный прогон требует поднятого сервера. Условие «запустить k6» по одному репозиторию не
   вычисляется, а триггер обязан быть запросом к репозиторию (`PROJECT.md` §5);
3. голый k6 без порогов — ровно тот прибор, что мы ловим: он выходит с 0 при 100 % проваленных
   проверок. Поставить такой — значит добавить ещё одну зелёную галочку, которая ничего не держит.

Что в нашей теме: запись «у проверок k6 есть порог» — сторож для тех, у кого k6 УЖЕ есть. Она
дешёвая и опознаёт конструкцию, но класс редкий. По правилу выбора из `growth/SKILL.md` сперва
идёт письмо (`go-sigma/sigma`), потом замер на большей выборке, и только потом запись.
