# Снимок гейтов audit_project (2026-08-24)

> **Это не ваш чек-лист.** Это состояние гейтов одного конкретного проекта — Django + React,
> около года работы с агентами — на 24 августа 2026 года. Читать его как список «что мне надо
> внедрить» нельзя: половина пунктов привязана к Django, DRF и 1С.
>
> **Зачем он здесь.** Это сырьё каталога: 98 пунктов, каждый со статусом и историей. Из них
> вырастают записи `gates/`, когда у пункта находится команда-арбитр, переносимая на любой стек,
> и доказательство отказом.
>
> **Метод чтения — в `gates/README.md`:** пять полей записи, четыре способа вранья гейта,
> триггер как запрос к репозиторию. Раньше он жил в шапке этого файла.
>
> Статусы: ✅ внедрено · 🟡 частично, необязательное или спит · ❌ нет · ⛔ не применимо.
> Числа проверены прогоном по репозиторию 2026-08-24, а не переписаны с прошлой версии.

---

## Статика Python

- [x] ✅ ruff (`ruff.toml`: E,F + extend `I,B,UP,DJ,SIM,RUF,PERF,FURB,PLR0402/1711/5501`) — pre-commit + CI blocking
- [x] ✅ ruff-format `--check` — pre-commit + CI blocking
- [x] ✅ mypy lite — pre-commit + CI blocking, **15 приложений**: `core users companies contacts requisites projects integrations tracker vouching teams workdocs notifications documents retain timesheets`
- [x] ✅ bandit (`bandit.yaml`) — pre-commit + CI blocking
- [x] ✅ PERF + FURB + мелкие PLR — 98 фиксов, onec money-safe. `PERF401`/`PLR2004` в ignore (шум)
- [x] ✅ **`import-linter` — границы модулей монолита** (task-336, 2026-08-25). CI blocking +
  `make verify`. Два контракта, оба зелёные: «`core` — фундамент и не зависит от доменных
  приложений» и «верхушку (`nextcloud`, `questionnaires`, `tools`) не импортирует никто».
  Проверен подсадкой нарушения: импорт `projects.models` в `core/checks.py` красит гейт.
  **Чего НЕ ловит (важнее того, что ловит):** 18 взаимных зависимостей между доменными
  приложениями (`projects ⇄ tracker` и другие). Слоистую модель включить нельзя, пока их не
  разорвут; записано долгом в реестре. Исключения в `.importlinter` названы поимённо и
  помечены: `seed_demo` — законное, `automation_access` — ДОЛГ.
  📏 История: инструмент лежал в `pyproject.toml` неиспользуемым. Первым порывом было снести
  его вместе с тремя другими «зомби»; владелец возразил — «может, их надо включить, а не
  сносить». Проверка по факту показала, что он прав: из четырёх один включён, один оставлен
  как библиотека, по двум решение открыто. **Списывать инструменты скопом — плохая привычка;
  «не используется» и «не применим» — разные утверждения.**
- [ ] 🟡 **mypy не покрывает новые приложения**: `nextcloud`, `questionnaires`, `analytics` — их просто нет в списке CI (не «осознанный ignore», а дрейф: приложение завели после того, как список зафиксировали)
- [ ] ⏸️ `ignore_errors` осознанно: `onec` (последним), `integrations` (Bitrix-legacy), `tools`, `tools.processors`; file-level `projects.serializers`
- [ ] ❌ mypy `--disallow-untyped-defs` (strict)
- [ ] ❌ ruff-группы — **разбить по ценности, а не одной строкой** (см. «Кандидаты», п. A)

## Frontend

- [x] ✅ eslint + FSD-boundaries + no-any (на **error**) — CI blocking
- [x] ✅ tsc strict (`tsc -b`) + прод-сборка `npm run build` — CI blocking
- [x] ✅ frontend-guards (`check:rq` / `check:themes` / `check:styles`) — вшиты в `npm run lint` → pre-commit + CI
- [x] ✅ knip (мёртвый TS / экспорты / зависимости / дубли) — CI **advisory**, `frontend/knip.json`. Чистка сделана: −20 файлов, −8 пакетов, −6 дублей (осталось 46 unused exports — tree-shaken, косметика)
- [x] ✅ size-limit (JS 1.1 МБ / CSS 80 КБ gzip) — CI **advisory**
- [x] ✅ npm audit `--audit-level=high` — CI **advisory**
- [ ] 🟡 vitest — скрипты есть (`test`, `test:coverage`), в CI **не подключён** (осознанно, «фронт без тестов»)
- [ ] ❌ prettier `--check` (конфига нет) · eslint `--max-warnings 0`

## API-контракт / OpenAPI ← НОВЫЙ РАЗДЕЛ (раньше в чек-листе отсутствовал)

**Схема у нас есть и она рабочая — но дырявая, и это не было видно, т.к. раздела не существовало.**

- [x] ✅ `drf-spectacular>=0.28` в зависимостях + `INSTALLED_APPS` + `DEFAULT_SCHEMA_CLASS: AutoSchema`
- [x] ✅ `SPECTACULAR_SETTINGS` (TITLE / VERSION 1.0.0 / TAGS) — `_config/settings/base.py:289`
- [x] ✅ Эндпоинты `/api/v1/schema/` + `/api/v1/docs/` (Swagger UI) — `api/v1/urls.py:19-20`
- [x] ✅ schemathesis фаззит схему в CI — **advisory**, только `GET`, `--hypothesis-max-examples=5`
- [ ] 🔴 **Схема неполная.** Прогон `manage.py spectacular` (2026-07-27): **Warnings 46 (28 уникальных), Errors 202 (39 уникальных)**; на выходе 219 путей / 303 операции / 201 компонент. Из них **37 вьюх выброшены целиком** (`unable to guess serializer` → «Ignoring view for now»):
  - весь `timesheets` (MyTimeSheet, TimeSheetSummary, TimeSheetDayDetail, UserTimeSheet, TimesheetAnalytics, TimesheetDrillDown)
  - весь `nextcloud` (NcFolderBrowse, NcFolderBrowseGlobal, NcProjectFolder, NextcloudAttachment)
  - auth-контур: `MeAPIView`, `CookieTokenRefreshView`, `CookieTokenLogoutView`, `CentrifugoConnectTokenView`
  - `onec` DirectPG (OneCConnection*, OneCDirectPgOverview, TestDirectPg*), аналитика (ExecutiveDashboard, NativeExecutive, ResourcePlanning, BonusMetrics), CBU forex, все Bitrix
  - **Следствие:** фаззинг API покрывает заметно меньше, чем кажется по галочке «schemathesis ✅»
- [ ] 🟡 Untyped path-параметры в nested-роутах (`contacts`, `documents`) → `id` уезжает в `"string"` вместо `integer`
- [ ] 🟡 Enum-коллизии не разрулены: в схеме живут `StatusFdfEnum`, `Status88eEnum`, `Status88aEnum`, `Status13aEnum`, `Status560Enum`, `Mode24bEnum`, `Stage611Enum`, `KindAf8Enum` — `ENUM_NAME_OVERRIDES` пуст
- [ ] ❌ **Фронт не потребляет схему**: ни `openapi-typescript`, ни `orval` в `frontend/package.json`. Типы API написаны руками → дрейф бек↔фронт ничем не ловится
- [ ] ❌ **Схема не коммитится** → нет diff-гейта на breaking changes (кандидат: `oasdiff`)
- [ ] 🟡 `/api/v1/schema/` и `/api/v1/docs/` отдают **200 анонимно** (проверено curl на :8180). `SERVE_PERMISSIONS`/`SERVE_AUTHENTICATION` не заданы, nginx не режет. В dev нормально, в проде — публичная карта всей API-поверхности

**План внедрения (порядок):**
1. `@extend_schema` / `serializer_class` на 37 выброшенных вьюх → Errors к нулю (даёт эффект сразу на schemathesis).
2. `ENUM_NAME_OVERRIDES` + типизация path-параметров (`<int:pk>`) → чистые Warnings.
3. Закрыть `/schema/` + `/docs/` в проде (`SERVE_PERMISSIONS: IsAdminUser` либо nginx-allowlist).
4. Гейт «схема генерится без Errors» в CI blocking (`spectacular --fail-on-warn` после чистки).
5. `openapi-typescript` → генерация TS-типов фронта из схемы; дрейф ловится `tsc`.
6. Коммитить `schema.yml` + `oasdiff` на breaking changes в MR.
7. Снять с schemathesis ограничение `^GET$` и поднять `--hypothesis-max-examples`, когда схема станет честной.

## БД / миграции

- [x] ✅ `makemigrations --check --dry-run` — CI blocking
- [x] ✅ django-migration-linter — blocking pre-push hook; wrapper проверен task-232:
      diff считается из `/app`, текущие новые миграции `3/3 valid`; отдельного CI job нет
- [x] ✅ query-budget тесты `assertNumQueries` / `django_assert_max_num_queries` (`projects/tests/test_query_budgets.py`) — N+1-гейт по правилу в `rules/backend/database.md`
- [x] ✅ django-zen-queries — пилот `AuditProjectViewSet` + `core.query_guard.QueryGuardMixin`, активен в тестах (prod no-op), ловит N+1 (проверено)
- [ ] 🟡 django-silk — **стоит в dev-зависимостях, 0 упоминаний в коде** (мёртвая зависимость: либо подключить в dev-compose, либо выкинуть)
- [ ] 🟡 zen-queries раскатан на **один** ViewSet — остальные list-эндпоинты держатся на дисциплине + point-тестах
- [ ] 🟡 inline-snapshot-django — снапшот точных SQL вью («N+1 на стероидах»); не внедрено
- [ ] ❌ SQL-линт для `dbt/` — **дыра**: модели dbt есть, `sqlfluff` (или dbt-линт) нет вообще

## Секьюрити / SCA

- [x] ✅ gitleaks (секреты, `.gitleaks.toml`) — pre-commit + CI blocking (по диапазону коммитов)
- [x] ✅ detect-private-key (PEM) — pre-commit
- [x] ✅ pip-audit (CVE Python) — CI **advisory**
- [x] ✅ npm audit (CVE фронт) — CI **advisory**
- [x] ✅ прод-хедеры HSTS/SSL/cookies/NOSNIFF/X-Frame (`check --deploy` = 0 warning)
- [x] ✅ hadolint (5 Dockerfile) — CI blocking, `.hadolint.yaml` игнор DL3008
- [ ] 🟡 semgrep (`.semgrep/rules.yml`) — CI blocking, **правил всего 2** (money-точность), и
      **у самих правил нет тестов**. 📏 2026-08-24: правило `decimal-from-float-literal` ругалось
      на `Decimal("111.00")` — на предписанное им же написание; срабатывало не всегда, а в
      зависимости от соседнего кода в файле (`metavariable-regex` у semgrep местами отдаёт
      содержимое строки без кавычек). Починено структурно (`pattern-not: Decimal("...")`), но
      **штатный режим `semgrep --test` с файлом-образцом `# ruleid:` / `# ok:` не подключён** —
      значит починка ничем не защищена от возврата. Наполнять правилами имеет смысл только
      вместе с этим режимом, иначе каждое новое правило — лотерея
- [x] ✅ **rate limiting уже есть** (было отмечено как ❌): DRF-throttling в `REST_FRAMEWORK` — `anon 100/min`, `user 1000/min`, `auth_login 5/min`, `auth_refresh 20/min`
- [ ] 🟡 django-axes (блокировка перебора на уровне аккаунта) — нет; частично закрыто throttling'ом `auth_login`
- [ ] ❌ **CSP-заголовков нет вообще** (`django-csp` не стоит, grep = 0)
- [ ] ❌ shellcheck (25+ bash-скриптов)
- [ ] ❌ Renovate/Dependabot · trivy / SBOM / OSV-Scanner

## Тесты

- [x] ✅ pytest + coverage (fail-under 85% master / 80% MR) — CI blocking
- [x] ✅ schemathesis (API-фаззинг на 5xx) — CI advisory *(см. оговорку в разделе OpenAPI: фаззит неполную схему)*
- [x] ✅ анти-паттерны тестов под гейтом (`scripts/arch-lint.sh`): observer-тесты, silent skip, `test_fix_*`, эфемерные contracts, лимиты моков/caplog, размер файла ≤800 LOC / ≤30 тестов
- [x] ✅ `scripts/test-ratio-check.sh` (test:code ratio, цель ≤2.0x)
- [ ] 🟡 coverage мерит **6 модулей** (`companies core projects requisites users _config` — `.coveragerc`); прочие тестируются, но не мерятся
- [x] ✅ `questionnaires` включён в `pytest.ini testpaths`; общий invariant-тест
      автоматически требует включать каждое Django-приложение, где есть тесты (task-234)
- [ ] 🟡 стоят, но фактически не используются: `freezegun` (0 упоминаний), `vulture` (0 вызовов), `import-linter` (контрактов нет), `pytest-randomly` (отключён `-p no:randomly` осознанно), `hypothesis` (1 файл)
- [x] 🟢 mutmut backend — ручной advisory-профиль `casts`: CLI 3.5, точный scope, stats/parser;
      доказательный baseline 45 total / 29 killed / 16 survived (task-236). Frontend Stryker
      решением человека не входит в этот срез и не считается доказанным.

### Пройдена полная батарея (mypy 0 + coverage ≥90%, reuse+fresh-db)

`core · companies · contacts · projects · requisites · users · tracker · vouching · teams · workdocs ·
notifications · documents · retain · timesheets`.
**Осталось:** `onec` (последним, e2e-first) · `analytics`/`integrations` (Bitrix, под удаление) ·
`nextcloud` и `questionnaires` (заведены позже, в батарею не заходили).

## Не-код линтеры

- [x] ✅ check-yaml / check-toml / check-json — pre-commit
- [x] ✅ semgrep — см. «Секьюрити» (гейт стоит, правил 2)
- [ ] ❌ codespell · GitLab CI lint (`.gitlab-ci.yml`) · markdownlint / lychee

## Хуки / DX / свои гейты

- [x] ✅ block-dangerous-commands · auto-format · permissions-deny — `.claude/hooks`
- [x] ✅ project-map + `@import` в CLAUDE.md + `check-map` (анти-деградация карты) — pre-commit
- [x] ✅ `arch-lint` (console.log, TODO, NBSP, raw request, анти-паттерны тестов,
      `no_silent_except`) — blocking pre-commit + change-based backend CI; process-контракт
      защищён тестом. Полный raw-request inventory честно содержит 3 legacy Bitrix-находки
- [x] ✅ **`check-queue-consumers.py`** — dev↔prod parity очередей Celery — CI blocking *(не было в чек-листе)*
- [x] ✅ **`check-celery-timeout-invariant.py`** — инвариант таймаутов задач — CI blocking *(не было в чек-листе)*
- [x] ✅ **`logs-evidence-reminder`** — напоминание «готово = тесты + логи + метрики» (task-222) *(не было в чек-листе)*
- [x] ✅ pre-push git-hook **установлен**; автоматически запускает `lint-migrations`;
      `pytest-in-docker` имеет stage `manual` и в pre-push не входит
- [x] ✅ Codex-harness: короткий `AGENTS.md` + 3 нативных repo-skills
      (`plan-template`, `tdd-workflow`, `review-checklist`); целостность путей и metadata
      проверяет blocking `scripts/tests/test_codex_harness.py` (task-237)
- [ ] 🟡 Автоматическое срабатывание Codex-skills не измеряется: гарантирован только явный
      `$skill`; для implicit activation нужен отдельный fresh-session eval
- [ ] 🟡 Stop-гейт — только `wsl-notify.sh` (уведомление), не блок качества
- [ ] ❌ `verify.sh` — одна команда = зеркало CI локально

## Наблюдаемость / Ops

- [x] ✅ **Централизованные логи: Loki + Alloy** (task-221) — `observability/loki`, `observability/alloy`, `docker-compose.observability.yml`; labels `{service, level, environment}`, `request_id` в structured metadata, PII-redact вне Django. Закрывает то, ради чего в списке стоял `django-structlog`
- [x] ✅ **Prometheus + Grafana + Alertmanager** + postgres-exporter (`observability/`, `bootstrap-postgres-exporter.sh`, `alerts.yml`)
- [x] ✅ Правило «готово = доказательства» (тест + live-stack + запрос в Loki + метрика) — `docs/operations/observability.md`, зеркало в `.claude/rules/observability.md`
- [x] ✅ `request_id` в каждом запросе (`core/logging.py`, RequestIDMiddleware) + `PIIRedactingFilter`
- [ ] 🔴 **error tracking (Sentry / self-hosted GlitchTip)** — по-прежнему НЕТ (grep по `pyproject.toml` + settings = 0). Логи в Loki есть, но нет группировки/дедупа/алерта «новый тип исключения», нет стектрейс-контекста. **Дыра №1**
- [ ] 🔴 **бэкап БД + проверенное восстановление** — в `scripts/` нет ни одного backup/restore-скрипта. **Дыра №2** (финансовые данные)
- [ ] 🟡 PgHero — медленные запросы / неиспользуемые+отсутствующие индексы. Частично перекрыт postgres-exporter'ом; UI над `pg_stat_statements` нет
- [ ] ❌ langfuse — в чек-листе значился «пустой каркас»; **фактически зависимости нет**, остались только `scripts/langfuse_*.py`
- [ ] ❌ OTel-трейсинг (крупный лифт)
- [ ] ❌ django-structlog — **закрывать не нужно**, потребность снята Loki/Alloy (оставлено как «не берём»)

## AI-ревью ← НОВЫЙ РАЗДЕЛ

**Что уже работает у нас:**
- [ ] 🔴 **Запись сгнила — исправлено 2026-08-24.** Здесь стояло `✅ Tester(+contracts) →
      Auditor(holdout) → Builder(isolated) → JiTTest → Reviewer` с пометкой «Builder не видит
      полные тесты». **Ничего из этого не работает с 2026-08-03:** изоляция Builder'а и генерация
      контрактов отключены решением владельца (`scripts/extract-contracts.py` ломает файлы —
      переносит импорт из тела функции на верхний уровень вместе с отступом), Auditor и JiTTest
      подключаются только явным решением на конкретную задачу. Фактически работает:
      **Tester ≠ Builder** (железно) + `scripts/test-lock.sh` (снимок тестов до/после Builder) +
      независимый прогон Reviewer'ом + внешний неподгоняемый арбитр + ручная приёмка.
      Класс ошибки — «устаревшая запись»: документ утверждал защиту, которой нет, четыре недели.
- [x] ✅ `Sentinel` (`/sentinel`) — периодический прогон по всей кодовой базе: мёртвый код, дублирование, архитектурные нарушения, устаревшие зависимости. Это ровно «repo-mode»-режим ревьюера, а не PR-режим
- [x] ✅ `/code-review ultra` — встроенное мульти-агентное ревью Claude Code (то самое «коробочное решение от Claude Code»): кастомизация, калибровка severity. Запускается человеком, платно
- [x] ✅ Детерминированный слой под ревью: `arch-lint.sh`, `semgrep`, `frontend-guards`, `check-map`, `check-queue-consumers`

**Вывод из внешнего опыта (CodeRabbit / Qodo / Claude Code Review / nitpicker):** узкое место AI-ревью —
не полнота, а **шум**: на одно полезное срабатывание много ложных, и это выжигает доверие ревьюеров.
Отсюда наш рабочий контур: **AI ищет паттерн → подтверждённый паттерн кодируется в детерминированный гейт**
(`semgrep` / `arch-lint`), и дальше ловится бесплатно и без ложных. Сейчас в `.semgrep/rules.yml` **2 правила** —
это и есть недоиспользованный канал (см. Приоритет 2).

- [ ] 🟡 **AI-находки не конвертируются в правила** — главный разрыв: Sentinel/Reviewer находят, но находка живёт в отчёте, а не в гейте
- [ ] ❌ Пилот nitpicker-подхода (несколько узких дешёвых прогонов под конкретные цели, разные модели, детерминированная глубина) — как advisory-канал рядом с Sentinel, а не вместо него
- [ ] ⚪ CodeRabbit / Qodo — **не берём**: файловый уровень, архитектуру игнорируют; у нас этот слой уже закрыт линтерами

## Кандидаты — чего у нас нет (ранжировано по ROI)

**A. Ruff-группы — самый дешёвый выигрыш (одна строка в `ruff.toml`), но разные по ценности:**
- `LOG` + `G` — корректность логирования. **Прямо под нашу observability-конституцию** (ADR-017): ловит f-строки в логах, потерянные `exc_info`. Брать первым
- `DTZ` — наивные `datetime` без таймзоны. У нас даты/периоды в отчётах и таймшитах — это класс реальных багов
- `C90` (mccabe) — сложность функций; дешёвая замена «xenon/radon», порог настраивается
- `T20` (`print`) · `RET` · `PT` (стиль pytest) — косметика, можно пачкой
- `S` (bandit-правила внутри ruff) — потенциально **заменяет отдельный bandit** и ускоряет CI
- `PLR too-many-*` — SOLID-метрика (~180 срабатываний) — это рефакторинг-заход, **не гейт**

**B. Дублирование кода — у нас нет ничего:**
- `jscpd` — copy-paste detector, умеет **и Python, и TS** одним прогоном, порог/игноры конфигом, есть npx. Ставить advisory-секцией рядом с knip
- `pylint --duplicate-code` (R0801) — только Python и тяжело тянуть весь pylint ради одной проверки → не брать
- Knip уже ловит дубли **экспортов** на фронте (найдено −6), но не дублирование тел функций

**C. N+1 и производительность — есть база, есть чем усилить:**
- Подключить уже оплаченный `django-silk` в dev-compose (сейчас мёртвая зависимость) либо выкинуть из `pyproject.toml`
- Раскатать `zen-queries` за пределы `AuditProjectViewSet`
- `inline-snapshot-django` — снапшот SQL вью (наследник django-perf-rec)
- `nplusone` — **не брать**: перекрывается zen-queries + query-budget тестами

**D. Мёртвый код / зависимости:**
- `vulture` уже стоит и ни разу не вызывается → включить advisory или удалить
- `deptry` — «knip для Python»: неиспользуемые/недекларированные зависимости. У нас на фронте это закрыто (knip), на беке — нет
- `import-linter` стоит, контрактов нет → написать 2-3 контракта (`core ⊥ onec`, `views ⊥ прямой ORM в шаблонах`) либо удалить

**E. SQL / dbt:**
- `sqlfluff` (+ dbt templater) — линт моделей `dbt/`. Сейчас SQL-слой вне любого гейта

**F. Секьюрити:**
- `django-csp` — CSP-заголовков нет вообще
- `django-axes` — блокировка перебора по аккаунту (throttling закрывает частично)

---

## 📏 Найдено 2026-08-24 (день выпуска карточки счёта)

Всё измерено в тот же день, не пересказано.

**Про сами гейты:**

- [ ] 🔴 **Нет локального зеркала CI.** `scripts/tests` (251 тест), `check-celery-timeout-invariant.py`,
      `check-openapi-debt.py`, semgrep, gitleaks живут **только** в CI-задаче `quality:backend`; в
      pre-commit их нет. Цена измерена: за день **четыре красных круга конвейера**, три из четырёх
      ловились локально за секунды. Один круг = 15–18 минут ожидания. Кандидат: `verify.sh`
      (в чек-листе уже числился как ❌ и оказался самым дорогим пропуском)
- [ ] 🔴 **Ни у одного гейта нет пары «красный / зелёный» образец**, кроме трёх: `arch-lint`
      (защищён тестом процесса), `check-celery-timeout-invariant` (свой тест),
      сторож копии предела времени рендера (доказан мутацией 2026-08-24). У semgrep и
      schemathesis — ноль. Мера здоровья набора гейтов = сколько имеют такую пару
- [ ] 🔴 **Триггеры записаны словами → не срабатывают.** Раздел «Кандидаты» ниже — список
      пожеланий: условие наступает, никто не замечает. 📏 `sqlfluff`: модели dbt в проекте есть,
      линтера нет, запись «когда появятся модели» лежит. Лечение — `check-triggers.sh`, который
      читает репозиторий и печатает «условие наступило, сторожа нет»
- [ ] 🔴 **Зомби-зависимости не под гейтом.** `silk` / `vulture` / `freezegun` / `import-linter` —
      по 0 упоминаний в `.py` (проверено grep 2026-08-24). Это не беспорядок, а поверхность
      атаки: чужой код в образе без потребителя. Кандидат: `deptry` (числится в «Кандидатах, D»)
      либо свои 10 строк. Рекомендация по самим четырём — **удалить**, вернуть с образцами, когда
      реально понадобятся
- [x] ✅ **Конфиг гейта обязан быть в белом списке путей `.gitlab-ci.yml`** — исправлено
      2026-08-24. До этого правка `.semgrep/` **не создавала пайплайн вовсе** (не «упал» — его не
      было), и вместе с ним не появлялось кнопки выката: `deploy:production` гейтится тем же
      списком. Добавлены `.semgrep/**`, `.semgrepignore`, `bandit.yaml`, `.coveragerc`

**Про API-контракт (пересчитано 2026-08-24, цифры сдвинулись с 07-27):**

- 📏 схема: **240 путей / 326 операций**; в реестре долга — **29 вьюх** (было 37 выброшенных)
- [ ] 🔴 **Схему никто не потребляет.** Ни `openapi-typescript`, ни `orval` в
      `frontend/package.json` (проверено). Типы фронта написаны руками → схема остаётся
      документацией, а не договором. Класс ошибки уже прожит дважды (конверт прочитали как
      массив, список молча пуст). Самый дешёвый ход всего списка
- [ ] 🔴 **`response_schema_conformance` не включён** — schemathesis проверяет только «не 500».
      То есть врёт ли схема — не проверяет никто. Без этого генерация типов стоит на песке

**Про нагрузку (спрошено владельцем 2026-08-24):**

- [ ] 🔴 **Нагрузочного тестирования нет вообще** — ни k6, ни Locust, ни каталога тестов
- [ ] 🔴 **Пик памяти отчётов не мерян.** ОСВ по счёту и зарплата строятся `openpyxl` в памяти
      целиком при потолке контейнера 4 ГБ; карточка счёта потоковая. Заказ-гигант падает поздно
      (после минут работы и гигабайта черновиков) — ранняя оценка объёма отсутствует
- [ ] 🔴 **Очередь не наблюдаема**: глубина и возраст старейшего задания не видны нигде
- [x] ✅ Снято как ложная тревога: грация остановки `worker_report` — **960 с** против жёсткого
      лимита рендера 900 с (task-252b AC-8). Деплой во время сборки её не добивает

---

## 🎯 Приоритеты (ревизия 2026-07-27)

**🔴 Приоритет 1 — реальные дыры с ценой ошибки:**
1. **Error tracking (Sentry / GlitchTip)** — прод-исключения не группируются и не алертят. Логи в Loki ≠ трекинг ошибок
2. **Бэкап БД + проверенное восстановление** — скриптов нет вообще, данные финансовые
3. **`questionnaires` в `pytest.ini testpaths`** — тесты написаны и не запускаются (однострочный фикс, класс ошибки — ложное чувство покрытия)
4. **OpenAPI: убрать 37 выброшенных вьюх из Errors** — иначе schemathesis фаззит четверть API вхолостую

**🟡 Приоритет 2 — гейты и масштаб данных:**
5. **ruff `LOG` + `G` + `DTZ`** — дешёво, ловит класс реальных багов, ложится на observability-правила
6. **Наполнить semgrep** (сейчас 2 правила) — канал «AI-находка → детерминированное правило»
7. **Закрыть `/api/v1/docs/` и `/schema/` в проде** + `openapi-typescript` для типов фронта
8. **`jscpd`** — дублирование кода (не покрыто ничем)
9. **PgHero** либо дашборд над `pg_stat_statements` в уже стоящей Grafana
10. **`nextcloud` / `questionnaires` / `analytics` в mypy-скоуп** — дрейф списка при заведении новых приложений

**🟢 Приоритет 3:**
11. Разобрать оставшиеся «зомби-зависимости»: `silk`, `vulture`, `freezegun`, `import-linter` —
    подключить или удалить. `mutmut` закрыт backend-профилем task-236.
12. `sqlfluff` для `dbt/` · `deptry` · `verify.sh` (зеркало CI локально) · GitLab CI lint
13. Пилот nitpicker-подхода как advisory-канала рядом с Sentinel
14. Очистить advisory-baseline (`pip/npm audit`, knip, size-limit, API fuzz) и сделать секции blocking

## ⚪ Осознанно НЕ берём (низкий ROI для нас)

code-split (500 внутренних юзеров) · shellcheck · codespell · OTel-трейсинг · trivy/SBOM/OSV ·
dependency-cruiser / type-coverage / xenon / import-linter-без-контрактов · `PLR too-many-*` (рефакторинг, не гейт) ·
**django-structlog** (потребность закрыта Loki+Alloy) · **nplusone** (перекрыт zen-queries) ·
**CodeRabbit / Qodo** (файловый уровень уже закрыт линтерами) · vitest в CI («фронт без тестов»).

## ⛔ Не применимо (мы на GitLab, не GitHub)

zizmor · CodeQL workflow-анализ · actionlint — линтеры безопасности **GitHub Actions**.
