# code-quality: журнал чтения по файлам

Дата 2026-09-23. Снимок `407501608b1ffe8ab0e236b742513592fca9ed60`. Исследуемые SKILL.md не активированы.

Все 105 файлов снимка имеют запись: 91 текстовый прочитан целиком, 11 обёрток побайтово равны прочитанной, 3 графических ресурса проверены отдельно. Чтение и наличие авторских тестов не означают успешный запуск.

read: полное чтение текста, не успешный запуск; equivalent-verified: побайтовое равенство прочитанному; asset-reviewed: визуальная или структурная проверка графического ресурса.

## .agents/plugins/marketplace.json

Источник: [.agents/plugins/marketplace.json](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/.agents/plugins/marketplace.json). Статус: `read`.

Каталог локального плагина: объявляет доступность/установку. Сам по себе не включает гейты в AQK; проверка синтаксиса JSON не доказывает совместимость клиента.

## .claude-plugin/marketplace.json

Источник: [.claude-plugin/marketplace.json](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/.claude-plugin/marketplace.json). Статус: `read`.

Метаданные каталога Claude. Нужны для обнаружения плагина, а не для оценки качества исходников.

## .claude-plugin/plugin.json

Источник: [.claude-plugin/plugin.json](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/.claude-plugin/plugin.json). Статус: `read`.

Манифест Claude, версия 1.0.0. Согласованность версий поддерживает bump-version.ts; установки в настоящем клиенте не было.

## .codex-plugin/plugin.json

Источник: [.codex-plugin/plugin.json](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/.codex-plugin/plugin.json). Статус: `read`.

Манифест Codex, ссылки на skills/hooks. Наличие файла не является доказательством работы хуков в установленной версии клиента.

## .gitignore

Источник: [.gitignore](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/.gitignore). Статус: `read`.

Исключает scratch, node_modules, логи и служебные результаты. Для AQK важна отдельная политика: воспроизводимые итоговые свидетельства сохранять, временные артефакты исключать.

## LICENSE

Источник: [LICENSE](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/LICENSE). Статус: `read`.

MIT: разрешение использовать, изменять и распространять с сохранением уведомления об авторстве и лицензии. Это основание рассматривать перенос, а не доказательство полезности или отсутствия ошибок.

## README.md

Источник: [README.md](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/README.md). Статус: `read`.

Прочитан целиком. Описывает full/check/pre-push и 12 языков, но поддержка языка неоднородна. Число тестов на значке и заявления о скорости требуют прогона; GATE PASS явно отделён от запуска тестов.

## adapters/invoke.ts

Источник: [adapters/invoke.ts](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/adapters/invoke.ts). Статус: `read`.

Строки 6–19: bun-процесс, сбор stdout/stderr, JSON.parse, код процесса. Строки 23–26: denied учитывает deny и ненулевой код, но не output=null при code=0. Кандидат на пропуск неисправного протокола; нужен отдельный запуск. Собственного таймаута/лимита буфера нет. Последующая независимая проба подтвердила аварийные сценарии: см. CQ-01 в CODE-QUALITY-DEEP.md.

## adapters/omp.ts

Источник: [adapters/omp.ts](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/adapters/omp.ts). Статус: `read`.

Общий invoke/denied на вызове bash; session_stop отдельно проверяет отсутствие output. Поэтому аварийная семантика guard и stop различается. Реальная интеграция OMP не запускалась.

## adapters/opencode.js

Источник: [adapters/opencode.js](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/adapters/opencode.js). Статус: `read`.

Отдельная реализация invoke отклоняет невалидный JSON. V1 через session.idle пишет noReply, V2 подписывается на события и возобновляет агент. Ошибка подписки завершает цикл после console.error; автоматического восстановления не видно. Не считать одинаковые названия событий одинаковой гарантией.

## adapters/pi.ts

Источник: [adapters/pi.ts](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/adapters/pi.ts). Статус: `read`.

tool_call использует общий guard; agent_before_settle возвращает continue при блокировке, ненулевом коде либо отсутствии output. Текстовая документация конфигурации упоминает другое событие agent_settled — сверять с фактическим API при переносе.

## assets/hero.webp

Источник: [assets/hero.webp](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/assets/hero.webp). Статус: `asset-reviewed`.

Визуально просмотрен: декоративная иллюстрация шлагбаума с красным и зелёным сигналами. Не содержит схемы алгоритма, инструкций, метрик или скрытого текстового источника для исследования. Размер 15124 байта, hash в описи; не засчитывается как чтение кода.

## assets/logo-dark.svg

Источник: [assets/logo-dark.svg](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/assets/logo-dark.svg). Статус: `asset-reviewed`.

Проверен XML целиком: svg 880×420, viewBox 440 150 880 420, 19 path, 2 linearGradient, 4 stop; внешних изображений, scripts и текстовых узлов нет. Ресурс брендинга. Координаты кривых не трактуются как инженерные рекомендации.

## assets/logo-light.svg

Источник: [assets/logo-light.svg](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/assets/logo-light.svg). Статус: `asset-reviewed`.

XML разобран целиком; побайтово доказано, что это logo-dark.svg с заменой #E2F6FD на #0C212B. Та же геометрия и только смена цвета для темы. Отдельный asset-review, не второй прочитанный алгоритм.

## examples/python.quality.toml

Источник: [examples/python.quality.toml](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/examples/python.quality.toml). Статус: `read`.

Python-профиль с pytest/pytest-cov через uv, те же пороги, pre-push и Jev=true. Часть общих настроек не означает одинаковую поддержку языка. Использование --with без pins в test_cmd оставляет версии тестового инструментария внешнему окружению.

## examples/typescript.quality.toml

Источник: [examples/typescript.quality.toml](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/examples/typescript.quality.toml). Статус: `read`.

Полный пример. test_cmd пишет LCOV в QG_LCOV, явные пороги, слои и glossary. В отличие от defaults включает review.jev=true: копирование примера при наличии ключа может включить отправку diff во внешний сервис. Нельзя считать пример безусловно безопасной конфигурацией по умолчанию.

## git-hooks/_chain

Источник: [git-hooks/_chain](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/git-hooks/_chain). Статус: `read`.

Разрешает прежний local hooksPath, затем global/system, затем hooks общего git-dir. Относительные пути от корня дерева, защита от рекурсии, exec прежнего исполняемого хука. Стоит адаптировать идею сохранения инфраструктуры, предварительно проверить собственный установщик AQK.

## git-hooks/applypatch-msg

Источник: [git-hooks/applypatch-msg](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/git-hooks/applypatch-msg). Статус: `equivalent-verified`.

Байт-в-байт совпадает с прочитанным git-hooks/_chain; сверено SHA-256. Логика передаёт имя вызванного хука через basename, поэтому имена требуют интеграционных проверок, даже при одинаковом тексте.

## git-hooks/commit-msg

Источник: [git-hooks/commit-msg](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/git-hooks/commit-msg). Статус: `read`.

Та же последовательность для сообщения коммита. Политика содержания сообщения — выбор автора, не универсальный признак качества кода.

## git-hooks/post-applypatch

Источник: [git-hooks/post-applypatch](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/git-hooks/post-applypatch). Статус: `equivalent-verified`.

Байт-в-байт совпадает с прочитанным git-hooks/_chain; сверено SHA-256. Логика передаёт имя вызванного хука через basename, поэтому имена требуют интеграционных проверок, даже при одинаковом тексте.

## git-hooks/post-checkout

Источник: [git-hooks/post-checkout](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/git-hooks/post-checkout). Статус: `equivalent-verified`.

Байт-в-байт совпадает с прочитанным git-hooks/_chain; сверено SHA-256. Логика передаёт имя вызванного хука через basename, поэтому имена требуют интеграционных проверок, даже при одинаковом тексте.

## git-hooks/post-commit

Источник: [git-hooks/post-commit](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/git-hooks/post-commit). Статус: `equivalent-verified`.

Байт-в-байт совпадает с прочитанным git-hooks/_chain; сверено SHA-256. Логика передаёт имя вызванного хука через basename, поэтому имена требуют интеграционных проверок, даже при одинаковом тексте.

## git-hooks/post-merge

Источник: [git-hooks/post-merge](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/git-hooks/post-merge). Статус: `equivalent-verified`.

Байт-в-байт совпадает с прочитанным git-hooks/_chain; сверено SHA-256. Логика передаёт имя вызванного хука через basename, поэтому имена требуют интеграционных проверок, даже при одинаковом тексте.

## git-hooks/post-rewrite

Источник: [git-hooks/post-rewrite](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/git-hooks/post-rewrite). Статус: `equivalent-verified`.

Байт-в-байт совпадает с прочитанным git-hooks/_chain; сверено SHA-256. Логика передаёт имя вызванного хука через basename, поэтому имена требуют интеграционных проверок, даже при одинаковом тексте.

## git-hooks/pre-applypatch

Источник: [git-hooks/pre-applypatch](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/git-hooks/pre-applypatch). Статус: `equivalent-verified`.

Байт-в-байт совпадает с прочитанным git-hooks/_chain; сверено SHA-256. Логика передаёт имя вызванного хука через basename, поэтому имена требуют интеграционных проверок, даже при одинаковом тексте.

## git-hooks/pre-auto-gc

Источник: [git-hooks/pre-auto-gc](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/git-hooks/pre-auto-gc). Статус: `equivalent-verified`.

Байт-в-байт совпадает с прочитанным git-hooks/_chain; сверено SHA-256. Логика передаёт имя вызванного хука через basename, поэтому имена требуют интеграционных проверок, даже при одинаковом тексте.

## git-hooks/pre-commit

Источник: [git-hooks/pre-commit](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/git-hooks/pre-commit). Статус: `read`.

Находит текущий корень плагина через стабильный pointer, запускает bun hook pre-commit; при ошибке останавливается, затем передаёт управление старому хуку.

## git-hooks/pre-merge-commit

Источник: [git-hooks/pre-merge-commit](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/git-hooks/pre-merge-commit). Статус: `equivalent-verified`.

Байт-в-байт совпадает с прочитанным git-hooks/_chain; сверено SHA-256. Логика передаёт имя вызванного хука через basename, поэтому имена требуют интеграционных проверок, даже при одинаковом тексте.

## git-hooks/pre-push

Источник: [git-hooks/pre-push](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/git-hooks/pre-push). Статус: `read`.

Сохраняет stdin с refs во временный файл и подаёт одинаковые данные своей проверке и старому хуку. trap удаляет файл; код прежнего хука сохраняется. Полезный конкретный образец совместимости.

## git-hooks/pre-rebase

Источник: [git-hooks/pre-rebase](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/git-hooks/pre-rebase). Статус: `equivalent-verified`.

Байт-в-байт совпадает с прочитанным git-hooks/_chain; сверено SHA-256. Логика передаёт имя вызванного хука через basename, поэтому имена требуют интеграционных проверок, даже при одинаковом тексте.

## git-hooks/prepare-commit-msg

Источник: [git-hooks/prepare-commit-msg](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/git-hooks/prepare-commit-msg). Статус: `equivalent-verified`.

Байт-в-байт совпадает с прочитанным git-hooks/_chain; сверено SHA-256. Логика передаёт имя вызванного хука через basename, поэтому имена требуют интеграционных проверок, даже при одинаковом тексте.

## hooks/hooks.json

Источник: [hooks/hooks.json](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/hooks/hooks.json). Статус: `read`.

Stop с timeout 300 и PreToolUse/Bash с timeout 30. Строки команд используют CLAUDE_PLUGIN_ROOT; совместимость и пути с пробелами не проверены живым клиентом. Не переносить такой файл как доказательство исполнения.

## package.json

Источник: [package.json](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/package.json). Статус: `read`.

Манифест плагина и команды Bun test/typecheck; CLI опирается на Bun и внешние анализаторы. Для беззависимого CLI AQK это кандидат на внешний гейт/профиль, не библиотека для импорта внутрь раннера. Полный авторский набор в этом исследовании не запускался.

## rules/semgrep.yml

Источник: [rules/semgrep.yml](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/rules/semgrep.yml). Статус: `read`.

Generic-правило eval/exec. Узкий эвристический сигнал, не доказательство эксплуатации; в описанном процессе advisory.

## rules/sg/catch-only-logs.yml

Источник: [rules/sg/catch-only-logs.yml](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/rules/sg/catch-only-logs.yml). Статус: `read`.

AST catch_clause TypeScript + regex тела с единственным логированием. Не анализирует полный эффект обработчика, исключения требуют предметного разбора.

## rules/sg/empty-catch.yml

Источник: [rules/sg/empty-catch.yml](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/rules/sg/empty-catch.yml). Статус: `read`.

AST пустого catch, допускающий пробелы/комментарии. Важны lawful исключения с явной причиной и тестом поведения.

## rules/sg/textual-test.yml

Источник: [rules/sg/textual-test.yml](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/rules/sg/textual-test.yml). Статус: `read`.

Ищет чтение исходника readFileSync и строковые утверждения о нём. Для AQK, который анализирует файлы, строка может быть законным наблюдаемым результатом; нельзя автоматически запретить все такие тесты.

## rules/sgconfig.yml

Источник: [rules/sgconfig.yml](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/rules/sgconfig.yml). Статус: `read`.

Каталог AST-правил и разбор JavaScript через TypeScript-парсер. Это влияет на фактический охват, а не только на упаковку.

## scripts/bump-version.ts

Источник: [scripts/bump-version.ts](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/bump-version.ts). Статус: `read`.

Записывает новую версию в четыре манифеста последовательно. Простая semver-проверка; общей атомарной транзакции нет. Инструмент выпуска, не гейт проекта-получателя.

## scripts/fixtures/evidence-eslint-disable-codex.ts

Источник: [scripts/fixtures/evidence-eslint-disable-codex.ts](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/fixtures/evidence-eslint-disable-codex.ts). Статус: `read`.

Небольшая TypeScript-функция с CC 13 и директивой отключения ESLint. Контроль того, что собственный config анализатора игнорирует inline bypass; сама фикстура без теста не доказывает срабатывание.

## scripts/fixtures/evidence-eslint-disable-next-line.ts

Источник: [scripts/fixtures/evidence-eslint-disable-next-line.ts](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/fixtures/evidence-eslint-disable-next-line.ts). Статус: `read`.

Небольшая TypeScript-функция с CC 13 и директивой отключения ESLint. Контроль того, что собственный config анализатора игнорирует inline bypass; сама фикстура без теста не доказывает срабатывание.

## scripts/fixtures/lang/go/a.go

Источник: [scripts/fixtures/lang/go/a.go](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/fixtures/lang/go/a.go). Статус: `read`.

Фикстура адаптера языка: ветвления/дублирование/псевдосекрет либо выключенный тест; манифест обозначает корень. Прочитана целиком. Это вход для анализатора, не полноценное компилируемое приложение: например Go-тест не импортирует testing, Java-тест не содержит импортов аннотаций. Проверку интеграции искать в lang-fixtures.test.ts.

## scripts/fixtures/lang/go/a_test.go

Источник: [scripts/fixtures/lang/go/a_test.go](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/fixtures/lang/go/a_test.go). Статус: `read`.

Фикстура адаптера языка: ветвления/дублирование/псевдосекрет либо выключенный тест; манифест обозначает корень. Прочитана целиком. Это вход для анализатора, не полноценное компилируемое приложение: например Go-тест не импортирует testing, Java-тест не содержит импортов аннотаций. Проверку интеграции искать в lang-fixtures.test.ts.

## scripts/fixtures/lang/go/b.go

Источник: [scripts/fixtures/lang/go/b.go](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/fixtures/lang/go/b.go). Статус: `read`.

Фикстура адаптера языка: ветвления/дублирование/псевдосекрет либо выключенный тест; манифест обозначает корень. Прочитана целиком. Это вход для анализатора, не полноценное компилируемое приложение: например Go-тест не импортирует testing, Java-тест не содержит импортов аннотаций. Проверку интеграции искать в lang-fixtures.test.ts.

## scripts/fixtures/lang/go/go.mod

Источник: [scripts/fixtures/lang/go/go.mod](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/fixtures/lang/go/go.mod). Статус: `read`.

Фикстура адаптера языка: ветвления/дублирование/псевдосекрет либо выключенный тест; манифест обозначает корень. Прочитана целиком. Это вход для анализатора, не полноценное компилируемое приложение: например Go-тест не импортирует testing, Java-тест не содержит импортов аннотаций. Проверку интеграции искать в lang-fixtures.test.ts.

## scripts/fixtures/lang/java/pom.xml

Источник: [scripts/fixtures/lang/java/pom.xml](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/fixtures/lang/java/pom.xml). Статус: `read`.

Фикстура адаптера языка: ветвления/дублирование/псевдосекрет либо выключенный тест; манифест обозначает корень. Прочитана целиком. Это вход для анализатора, не полноценное компилируемое приложение: например Go-тест не импортирует testing, Java-тест не содержит импортов аннотаций. Проверку интеграции искать в lang-fixtures.test.ts.

## scripts/fixtures/lang/java/src/main/java/A.java

Источник: [scripts/fixtures/lang/java/src/main/java/A.java](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/fixtures/lang/java/src/main/java/A.java). Статус: `read`.

Фикстура адаптера языка: ветвления/дублирование/псевдосекрет либо выключенный тест; манифест обозначает корень. Прочитана целиком. Это вход для анализатора, не полноценное компилируемое приложение: например Go-тест не импортирует testing, Java-тест не содержит импортов аннотаций. Проверку интеграции искать в lang-fixtures.test.ts.

## scripts/fixtures/lang/java/src/main/java/B.java

Источник: [scripts/fixtures/lang/java/src/main/java/B.java](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/fixtures/lang/java/src/main/java/B.java). Статус: `read`.

Фикстура адаптера языка: ветвления/дублирование/псевдосекрет либо выключенный тест; манифест обозначает корень. Прочитана целиком. Это вход для анализатора, не полноценное компилируемое приложение: например Go-тест не импортирует testing, Java-тест не содержит импортов аннотаций. Проверку интеграции искать в lang-fixtures.test.ts.

## scripts/fixtures/lang/java/src/test/java/ATest.java

Источник: [scripts/fixtures/lang/java/src/test/java/ATest.java](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/fixtures/lang/java/src/test/java/ATest.java). Статус: `read`.

Фикстура адаптера языка: ветвления/дублирование/псевдосекрет либо выключенный тест; манифест обозначает корень. Прочитана целиком. Это вход для анализатора, не полноценное компилируемое приложение: например Go-тест не импортирует testing, Java-тест не содержит импортов аннотаций. Проверку интеграции искать в lang-fixtures.test.ts.

## scripts/fixtures/lang/php/composer.json

Источник: [scripts/fixtures/lang/php/composer.json](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/fixtures/lang/php/composer.json). Статус: `read`.

Фикстура адаптера языка: ветвления/дублирование/псевдосекрет либо выключенный тест; манифест обозначает корень. Прочитана целиком. Это вход для анализатора, не полноценное компилируемое приложение: например Go-тест не импортирует testing, Java-тест не содержит импортов аннотаций. Проверку интеграции искать в lang-fixtures.test.ts.

## scripts/fixtures/lang/php/src/a.php

Источник: [scripts/fixtures/lang/php/src/a.php](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/fixtures/lang/php/src/a.php). Статус: `read`.

Фикстура адаптера языка: ветвления/дублирование/псевдосекрет либо выключенный тест; манифест обозначает корень. Прочитана целиком. Это вход для анализатора, не полноценное компилируемое приложение: например Go-тест не импортирует testing, Java-тест не содержит импортов аннотаций. Проверку интеграции искать в lang-fixtures.test.ts.

## scripts/fixtures/lang/php/src/b.php

Источник: [scripts/fixtures/lang/php/src/b.php](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/fixtures/lang/php/src/b.php). Статус: `read`.

Фикстура адаптера языка: ветвления/дублирование/псевдосекрет либо выключенный тест; манифест обозначает корень. Прочитана целиком. Это вход для анализатора, не полноценное компилируемое приложение: например Go-тест не импортирует testing, Java-тест не содержит импортов аннотаций. Проверку интеграции искать в lang-fixtures.test.ts.

## scripts/fixtures/lang/php/tests/ValueTest.php

Источник: [scripts/fixtures/lang/php/tests/ValueTest.php](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/fixtures/lang/php/tests/ValueTest.php). Статус: `read`.

Фикстура адаптера языка: ветвления/дублирование/псевдосекрет либо выключенный тест; манифест обозначает корень. Прочитана целиком. Это вход для анализатора, не полноценное компилируемое приложение: например Go-тест не импортирует testing, Java-тест не содержит импортов аннотаций. Проверку интеграции искать в lang-fixtures.test.ts.

## scripts/fixtures/lang/ruby/Gemfile

Источник: [scripts/fixtures/lang/ruby/Gemfile](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/fixtures/lang/ruby/Gemfile). Статус: `read`.

Фикстура адаптера языка: ветвления/дублирование/псевдосекрет либо выключенный тест; манифест обозначает корень. Прочитана целиком. Это вход для анализатора, не полноценное компилируемое приложение: например Go-тест не импортирует testing, Java-тест не содержит импортов аннотаций. Проверку интеграции искать в lang-fixtures.test.ts.

## scripts/fixtures/lang/ruby/lib/a.rb

Источник: [scripts/fixtures/lang/ruby/lib/a.rb](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/fixtures/lang/ruby/lib/a.rb). Статус: `read`.

Фикстура адаптера языка: ветвления/дублирование/псевдосекрет либо выключенный тест; манифест обозначает корень. Прочитана целиком. Это вход для анализатора, не полноценное компилируемое приложение: например Go-тест не импортирует testing, Java-тест не содержит импортов аннотаций. Проверку интеграции искать в lang-fixtures.test.ts.

## scripts/fixtures/lang/ruby/lib/b.rb

Источник: [scripts/fixtures/lang/ruby/lib/b.rb](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/fixtures/lang/ruby/lib/b.rb). Статус: `read`.

Фикстура адаптера языка: ветвления/дублирование/псевдосекрет либо выключенный тест; манифест обозначает корень. Прочитана целиком. Это вход для анализатора, не полноценное компилируемое приложение: например Go-тест не импортирует testing, Java-тест не содержит импортов аннотаций. Проверку интеграции искать в lang-fixtures.test.ts.

## scripts/fixtures/lang/ruby/spec/value_spec.rb

Источник: [scripts/fixtures/lang/ruby/spec/value_spec.rb](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/fixtures/lang/ruby/spec/value_spec.rb). Статус: `read`.

Фикстура адаптера языка: ветвления/дублирование/псевдосекрет либо выключенный тест; манифест обозначает корень. Прочитана целиком. Это вход для анализатора, не полноценное компилируемое приложение: например Go-тест не импортирует testing, Java-тест не содержит импортов аннотаций. Проверку интеграции искать в lang-fixtures.test.ts.

## scripts/fixtures/lang/rust/Cargo.toml

Источник: [scripts/fixtures/lang/rust/Cargo.toml](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/fixtures/lang/rust/Cargo.toml). Статус: `read`.

Фикстура адаптера языка: ветвления/дублирование/псевдосекрет либо выключенный тест; манифест обозначает корень. Прочитана целиком. Это вход для анализатора, не полноценное компилируемое приложение: например Go-тест не импортирует testing, Java-тест не содержит импортов аннотаций. Проверку интеграции искать в lang-fixtures.test.ts.

## scripts/fixtures/lang/rust/src/copy.rs

Источник: [scripts/fixtures/lang/rust/src/copy.rs](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/fixtures/lang/rust/src/copy.rs). Статус: `read`.

Фикстура адаптера языка: ветвления/дублирование/псевдосекрет либо выключенный тест; манифест обозначает корень. Прочитана целиком. Это вход для анализатора, не полноценное компилируемое приложение: например Go-тест не импортирует testing, Java-тест не содержит импортов аннотаций. Проверку интеграции искать в lang-fixtures.test.ts.

## scripts/fixtures/lang/rust/src/lib.rs

Источник: [scripts/fixtures/lang/rust/src/lib.rs](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/fixtures/lang/rust/src/lib.rs). Статус: `read`.

Фикстура адаптера языка: ветвления/дублирование/псевдосекрет либо выключенный тест; манифест обозначает корень. Прочитана целиком. Это вход для анализатора, не полноценное компилируемое приложение: например Go-тест не импортирует testing, Java-тест не содержит импортов аннотаций. Проверку интеграции искать в lang-fixtures.test.ts.

## scripts/fixtures/lang/rust/tests/risky.rs

Источник: [scripts/fixtures/lang/rust/tests/risky.rs](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/fixtures/lang/rust/tests/risky.rs). Статус: `read`.

Фикстура адаптера языка: ветвления/дублирование/псевдосекрет либо выключенный тест; манифест обозначает корень. Прочитана целиком. Это вход для анализатора, не полноценное компилируемое приложение: например Go-тест не импортирует testing, Java-тест не содержит импортов аннотаций. Проверку интеграции искать в lang-fixtures.test.ts.

## scripts/lib/adapter-tools.test.ts

Источник: [scripts/lib/adapter-tools.test.ts](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/lib/adapter-tools.test.ts). Статус: `read`.

Прочитаны все 198 строк. Протоколы Go/Rust/PMD/Ruff/Vulture проверяются фиктивными исполняемыми файлами; SARIF и относительные пути, восстановление gocyclo suppression, дедупликация notices, legacy baseline. Lockfiles обнаруживаются на реальном временном дереве, результаты OSV подставлены. Есть отличение no packages от недоступной БД и продолжение после пустого lockfile. Сценарии «вывел известную находку и аварийно завершился» и «первый lockfile уязвим, второй offline» не найдены в прочитанных тестах; добавлены независимые исследовательские пробы, исходный репозиторий не менялся.

## scripts/lib/adapter-tools.ts

Источник: [scripts/lib/adapter-tools.ts](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/lib/adapter-tools.ts). Статус: `read`.

Прочитаны все 474 строки. Команды адаптеров дедуплицируются по root/kind/command, запускаются через shell с timeout 600s. Есть SARIF, generic JSON/JSONL/text и специальные Go/Rust-парсеры. Generic parser ищет знакомые поля и не проверяет полную схему произвольного анализатора. Аудит OSV обнаруживает lockfiles и сканирует каждый; ранний return при поздней недоступной БД теряет ранее собранные находки — воспроизведено CQ-06. acceptedResult принимает любой exit при наличии findings; после baseline может исчезнуть и находка, и свидетельство аварии — CQ-05. gocyclo-ignore перепроверяется на временной копии без директивы, с hardcoded -over 10. SARIF-файл читается при пустом stdout; очистку старого файла этот модуль не обеспечивает (гипотеза для отдельного опыта, не доказанный дефект всех адаптеров). Ключ baseline включает строку и текст: перенос строк способен создавать новый долг. Legacy baseline без tools намеренно снимает все findings с notice. Обычные tool.command не переписываются целиком через [tools]; отдельно применяется выбор OSV binary. Нужны реальные интеграционные контроли поддерживаемых анализаторов.

## scripts/lib/astgrep.test.ts

Источник: [scripts/lib/astgrep.test.ts](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/lib/astgrep.test.ts). Статус: `read`.

Прочитан целиком. Java empty catch; матрица десяти catch-языков + две явные not-run записи; jscpd Go clone; missing Semgrep через fake run. Тест документации проверяет исчезновение старого rule-id, что уместно для договора документации, хотя сам продукт предостерегает от textual tests.

## scripts/lib/astgrep.ts

Источник: [scripts/lib/astgrep.ts](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/lib/astgrep.ts). Статус: `read`.

Прочитаны все 161 строка. TS использует YAML-правила, прочие языки inline AST+regex; Go/Rust не имеют catch-rules. Директива ast-grep-ignore нейтрализуется в временной копии с alias обратно к исходнику и cleanup finally. sgCommand сверяет строку версии; astGroup принимает распарсенный JSON-массив, ошибки формата дают error. code -1 смешивает timeout/отсутствие инструмента и становится notice. Semgrep всегда advisory. SUPPRESSION — текстовая замена, семантическую сохранность строковых литералов надо испытать.

## scripts/lib/config.ts

Источник: [scripts/lib/config.ts](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/lib/config.ts). Статус: `read`.

Прочитаны все 187 строк порциями. Приоритет CLI → TOML → defaults, worktree ищет конфиг основного checkout; baseline общий, отчёт локальный. Проверяются имена секций/ключей, но общей проверки типов и диапазонов порогов нет; Number(flag) может дать NaN. Не объявлять подтверждённым дефектом до пробы. Приоритет scope all > staged > since > base.

## scripts/lib/crap.test.ts

Источник: [scripts/lib/crap.test.ts](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/lib/crap.test.ts). Статус: `read`.

Прочитан целиком. Проверяет Lizard CSV, LCOV без FN, Radon closures, Go/Rust, forgiveness comments, native ESLint vs Lizard, non-ASCII пути и per-file fallback. Часть проверок реально запускает инструменты, часть использует внедрённые зависимости. Этот Bun-набор нами не запускался.

## scripts/lib/crap.ts

Источник: [scripts/lib/crap.ts](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/lib/crap.ts). Статус: `read`.

Полностью прочитаны 416 строк. runFresh удаляет прежний LCOV, вызывает test_cmd и сохраняет код/число падений; fingerprint только diff+untracked под dirs. parseLcov суммирует DA дублей SF, score исключает вложенные функции. ESLint/Radon первичны, Lizard fallback; отсутствие данных даёт riskCrap с cov=0, но при отсутствии свежего отчёта CRAP-гейт не судится. ensureTools проверяет наличие package.json без version. Пробы CQ-02/CQ-04 подтвердили границы. Каталоги инструментов не устанавливались.

## scripts/lib/deps.ts

Источник: [scripts/lib/deps.ts](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/lib/deps.ts). Статус: `read`.

dependency-cruiser строит временную конфигурацию циклов/слоёв; Knip получает entry/project из src и тестов. Перед depcruise удаляется старый JSON. Результат принимается по JSON, а не только по exit; схемы полного ответа не валидируются. Циклы дедуплицируются по отсортированному набору участников, разные пути внутри набора могут схлопнуться.

## scripts/lib/diff.ts

Источник: [scripts/lib/diff.ts](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/lib/diff.ts). Статус: `read`.

Разбор unified diff -U0, карта добавленных строк и удалённых фрагментов. Staged без HEAD использует пустое дерево — прежний тезис из limits.md о невозможности первого коммита устарел относительно кода. Удалённый hunk затрагивает соседние строки. wholeFile пропускает файл >2 MB; all только tracked, base добавляет untracked.

## scripts/lib/diffcov.ts

Источник: [scripts/lib/diffcov.ts](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/lib/diffcov.ts). Статус: `read`.

Добавленные исполняемые строки определяются пересечением diff и LCOV DA. Нет свежего отчёта → notices, не нарушение. Отсутствующий файл и низкое покрытие разделены политикой; pre-push выключает missingFiles. 0 исполняемых строк представляется как 100% 0/0: отчёт обязан сохранять знаменатель.

## scripts/lib/dup.ts

Источник: [scripts/lib/dup.ts](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/lib/dup.ts). Статус: `read`.

jscpd запускается только на изменённых исходных файлах; затем пересечение клона с changed lines. Поэтому копия из НЕизменённого файла в изменённый не гарантированно обнаруживается. Удаляет старый отчёт. code -1 подписан npx not found, хотя утилита run объединяет отсутствие процесса и timeout. Это кандидат на потерю причины ошибки.

## scripts/lib/form.ts

Источник: [scripts/lib/form.ts](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/lib/form.ts). Статус: `read`.

ESLint API с собственным in-memory config, noInlineConfig=true; Sonar cognitive, depth, params, length. Находит владельца сообщения и проверяет изменение функции. Ошибка парсинга даёт finding. Защита от eslint-disable реализована, а не только обещана.

## scripts/lib/gate.ts

Источник: [scripts/lib/gate.ts](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/lib/gate.ts). Статус: `read`.

Оркестрация full/check/baseline: сбор структурных и текстовых проверок, запуск адаптеров, отсеивание существующего долга, отчёт. Проверка f.cc > o.maxCc чувствительна к NaN (CQ-03). Актуальный аудит зависимостей идёт через adapterChecks из adapter-tools.ts; старый экспорт auditCheck из security.ts здесь не используется. Чтение одного модуля без проверки импортов дало бы неверный вывод о поведении аудита.

## scripts/lib/grok-hooks.test.ts

Источник: [scripts/lib/grok-hooks.test.ts](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/lib/grok-hooks.test.ts). Статус: `read`.

Проверяет повторную установку/удаление, сохранность other.json, override и default home. Это проверка файлов установки, не исполнения событий настоящим Grok-клиентом.

## scripts/lib/grok-hooks.ts

Источник: [scripts/lib/grok-hooks.ts](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/lib/grok-hooks.ts). Статус: `read`.

Отдельная установка только своего JSON в GROK_HOME, shellQuote корректно экранирует одинарные кавычки. Повторная установка не пишет одинаковый файл; удаление точечное.

## scripts/lib/guard-bash.test.ts

Источник: [scripts/lib/guard-bash.test.ts](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/lib/guard-bash.test.ts). Статус: `read`.

Красные/зелёные строки команд, комбинированные флаги, camelCase JSON, отключение настройки и отсутствие configured repo. Есть реальные CLI-подпроцессы в временной папке. Нет теста неверного JSON ответа общего adapters/invoke.ts в этом файле.

## scripts/lib/guard-bash.ts

Источник: [scripts/lib/guard-bash.ts](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/lib/guard-bash.ts). Статус: `read`.

Свой токенизатор shell, намеренно только прямые git-команды, не полный интерпретатор. Блокирует no-verify/-n и изменение hooksPath; уважает строковые сообщения/--. Включён только для git-repo с .quality.toml и block_bypass. Это удобная защита от случайного обхода, не граница безопасности от произвольного shell-кода.

## scripts/lib/hooks.ts

Источник: [scripts/lib/hooks.ts](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/lib/hooks.ts). Статус: `read`.

Прочитаны все 445 строк. Подробная трасса: partlyStaged 58–64; push ranges 74–85; отбор тестов 91–151; prePush 160–176; проверки каждого first-parent коммита 221–236; сохранение/восстановление hooksPath 269–329; stop 332–445. Stop допускает первый чистый checkout без проверки и после одного повторного красного вердикта выдаёт systemMessage без decision:block. Это задокументированная политика против зацикливания, не строгая приёмка. Тесты выбираются по имени/прямому TS-импорту, ограничены 40 с явным omitted; транзитивный граф не строится.

## scripts/lib/inline-config.test.ts

Источник: [scripts/lib/inline-config.test.ts](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/lib/inline-config.test.ts). Статус: `read`.

Прочитан целиком. Реальные CLI-контроли ESLint disable на CC и max-params, ast-grep-ignore, Python noqa, запрет нового suppression даже при простой функции. Эти тесты подтверждают намеренный контракт; лог исполнения в нашей среде отсутствует.

## scripts/lib/jev.test.ts

Источник: [scripts/lib/jev.test.ts](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/lib/jev.test.ts). Статус: `read`.

Прочитаны все 128 строк. Проверяет конфигурацию ключей/endpoint/model, структуру POST, разбор ответа, отсутствие ключа и HTTP 401/429/529 через подставной fetch. Это проверка интеграционного договора, а не способности модели замечать плохие тесты. Таймаут/неблокирование проверяются также в pipeline.test.ts. Собственного полного Bun-прогона нет.

## scripts/lib/jev.ts

Источник: [scripts/lib/jev.ts](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/lib/jev.ts). Статус: `read`.

Прочитаны все 391 строка. Пять фиксированных вопросов по тестам: textual_test, error_path_tested, assertion_weakened, mock_hides_behavior, property_is_tautology. Формируются добавленные строки и по три контекстные строки; error-path контекст — эвристика по diff, для mock передаются пути изменённых исходников, не полная семантика функций. По ключам выбирается TypeSafe/OpenRouter/custom endpoint. Уходят текст hunks и пути; предварительного redaction этих текстов в этом модуле нет. Есть общий 5s AbortSignal, ограничение числа hunks, общий бюджет 40k символов; это не точный токенизатор. Ответ проверяет числовой тип вероятности, но не диапазон 0..1. JSONL содержит модель, вопрос, файл/hunk, scope, HEAD, но не отпечаток всего diff; HEAD до коммита — родитель. Калибровка модели здесь не доказана. Ни одного реального LLM-запроса в исследовании не было; пригодна только явно включаемая консультативная часть с отдельной оценкой качества.

## scripts/lib/lang-fixtures.test.ts

Источник: [scripts/lib/lang-fixtures.test.ts](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/lib/lang-fixtures.test.ts). Статус: `read`.

Прочитан целиком. Пять фикстур go/rust/java/php/ruby проходят через analyze+gate и обязаны дать complexity/dup/skipped/token. Отдельный тест с бедным PATH требует exit 0 и notices not run при отсутствующих анализаторах. Поэтому missing tool = green здесь осознанная политика, а не догадка аудитора.

## scripts/lib/lang.test.ts

Источник: [scripts/lib/lang.test.ts](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/lib/lang.test.ts). Статус: `read`.

Прочитан целиком. Матрица непустых полей, monorepo root routing, inference без manifest, explicit selection, skip patterns, Go hunks для Jev, синтетические ответы десяти registries и mirror/disabled. Это проверка адаптера данных, не живых API registry и не настоящих test runners всех языков.

## scripts/lib/lang.ts

Источник: [scripts/lib/lang.ts](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/lib/lang.ts). Статус: `read`.

Полностью прочитаны 351 строка. Данные 12 языков, registry URL/date adapters, рекурсивное обнаружение корней по manifests+extensions, выбор самого глубокого подходящего корня, glob test names и regex test/assert/skip/mock. Некоторые coverage-команды только конвертируют готовый отчёт (Java/Kotlin/PHP), а не запускают тесты. Для всех языков, кроме TS/Python, prePushTest пуст и fallback=node --test. Поэтому без project-specific команды нельзя обещать полноценный multilang test-run. defaultTestCommand определяет vitest по строковому вхождению в package.json; это ограниченная эвристика.

## scripts/lib/paths.test.ts

Источник: [scripts/lib/paths.test.ts](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/lib/paths.test.ts). Статус: `read`.

Прочитаны все 125 строк. out_dir, origin/HEAD и fallback branches, explicit base, relocated install+root pointer, hooks после обновления копии. Последний тест явно приравнивает Java pre-push к node --test; показывает фактическую границу multilang-поддержки, а не полноценную Java-приёмку.

## scripts/lib/pipeline.test.ts

Источник: [scripts/lib/pipeline.test.ts](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/lib/pipeline.test.ts). Статус: `read`.

Прочитаны все 626 строк порциями: diff+unicode; commit-msg; config/worktree; mean CRAP advisory; первый commit/push; docs vs ADR; stop однократный retry; реальный Git chain/local/global hooks; docs-only; baseline old/new debt; сумма failed counts; red/green complexity+doc; обходы в отчёте; full all; защита baseline от нуля функций; missing security; Jev injected post без сети. Это существенно глубже значка с числом тестов. Собственный запуск Bun-набора не выполнен.

## scripts/lib/report.ts

Источник: [scripts/lib/report.ts](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/lib/report.ts). Статус: `read`.

Полностью прочитаны 126 строк. Churn за 12 месяцев умножается на сумму riskCrap; top/worklist — эвристическая приоритизация. failCount = findings + error, notices не блокируют. Markdown включает область/base/config, JSON writeReport хранит только checks/bypasses/escalate, не весь provenance Markdown. check.json/md перезаписываются. testsLine отличает not run от failed, GATE PASS не равен полному покрытию проверками.

## scripts/lib/security.test.ts

Источник: [scripts/lib/security.test.ts](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/lib/security.test.ts). Статус: `read`.

Прочитаны все 286 строк. Gitleaks подставляется через runner: отсутствующий binary, находки, redaction, reasoned allow, удаление отчёта. Возраст пакета — подставное время/реестры, warm cache без сети, слишком новый release, workspace после npm entry, mirror, virtual uv packages и отсутствие registry. Новая dependency проверяется на временном Git-репозитории. Последние тесты проверяют старый security.auditCheck (кэш npm audit, high finding, malformed JSON, offline), а не текущий multi-lock OSV path; это существенно для оценки реального покрытия.

## scripts/lib/security.ts

Источник: [scripts/lib/security.ts](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/lib/security.ts). Статус: `read`.

Прочитаны все 514 строк. Gitleaks: version check, удаление старого отчёта, диапазон base..HEAD, --redact, допустимы exit 0/1, остальные ошибки сохраняются; JSON parse error блокирует. Исключения могут сверяться с текущей строкой worktree, хотя находка историческая — требуется отдельная проверка соответствия версии. Lock-age разбирает конечный набор lock-форматов regex, проверяет изменённые registry-пакеты через curl и кэширует дату публикации; age — политика снижения риска, не гарантия безопасности. Offline оставляет notice, уже собранные age-findings сохраняются. newPackageCheck для package.json/pyproject — notice с ожиданием qg:dep, а не строгий валидатор обоснования. Экспортированный auditCheck использует кэш lockhash+tool без срока, но поиск вызовов показывает только security.test.ts; актуальный gate вызывает аудит adapter-tools.ts. Поэтому риск старого audit-кэша НЕ объявлен дефектом действующего full gate. securityChangeChecks подключает только age/new-package.

## scripts/lib/tamper.test.ts

Источник: [scripts/lib/tamper.test.ts](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/lib/tamper.test.ts). Статус: `read`.

Прочитаны все 619 строк. Есть красные и зелёные контроли: ESLint/ast-grep/noqa/gocyclo suppression против строк, docstring и unrelated rules; старые директивы против добавленных. Удаление/переименование/skip тестов, пустые и объяснённые bypass, изоляция bypass от ослабления другого assertion. Assert equality→truthy, multiline deepEqual→ok, Python-пары, законная замена/rename, специальный перенос textual-test в behavioral. Mock-заметки по изменённому модулю и shadowing — эвристики. Baseline/config меняется отдельно (notice) или вместе с source (finding), перечислены protected keys. Pre-push проверяет отсутствие тестов, commit reason, импортёров/aliases, разные коммиты в push. Diff coverage проверяет долю, непокрытые строки, отсутствующий LCOV и различие full/pre-push. Это содержательный корпус, но не доказательство полноты всех синтаксисов и не наш успешный прогон Bun.

## scripts/lib/tamper.ts

Источник: [scripts/lib/tamper.ts](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/lib/tamper.ts). Статус: `read`.

Прочитаны все 587 строк. Удаление теста определяется hunk-заголовками и эвристикой похожих названий; weakening — числом строк assertions/заменой семейств с совпадающим первым аргументом; не полноценный AST и не доказательство логической силы теста. Есть локальные stub-notes, per-commit context, разрешение удаления с причиной, отдельная защита набора TOML-полей. PROTECTED_CONFIG не покрывает все project/tools/hooks поля. Перенос требует корпуса законных изменений AQK. Большой tamper.test.ts ещё не прочитан целиком.

## scripts/lib/text.ts

Источник: [scripts/lib/text.ts](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/lib/text.ts). Статус: `read`.

Прочитаны все 251 строка. Doc-links узнаёт пути в backticks по существующему первому сегменту; игнорирует ограждённые блоки, исторические docs и некоторые runtime/ignored paths. Это конечная эвристика, не проверка всех Markdown-ссылок. knownSymbols ищет вхождение через git grep, не определение символа. Сопоставление glossary зависит от свободного текста и контекста. secretCheck использует конечный набор паттернов, исключает lockfiles, допускает qg:allow с причиной и записывает bypass; не заменяет полный scanner истории. Redaction используется для вывода сканера. Запрет AI attribution/emoji в сообщениях коммита — политика автора, не доказанная характеристика качества кода. Для AQK нужны отдельные корпуса положительных/ложных срабатываний каждого правила.

## scripts/lib/tools.test.ts

Источник: [scripts/lib/tools.test.ts](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/lib/tools.test.ts). Статус: `read`.

Прочитан целиком. Проверяет наличие platform hints, override npm/PyPI версии/пути, неизвестный id и приоритет QG_TOOLS. Теста ensureTools с неверной уже установленной версией здесь нет; этот пробел проверен независимой CQ-04.

## scripts/lib/tools.ts

Источник: [scripts/lib/tools.ts](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/lib/tools.ts). Статус: `read`.

Центральный каталог npm/PyPI pins, названий native binaries и подсказок установки. Не все native tools закреплены по версии; некоторые hints используют latest. Override версией влияет на packageSpec, путь — на toolBinary. Каталог инструментов полезнее рассыпанных строк, но pin верхнего пакета не lock всей транзитивной цепочки.

## scripts/lib/util.ts

Источник: [scripts/lib/util.ts](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/lib/util.ts). Статус: `read`.

Синхронный запуск с maxBuffer 1 GiB, timeout только если передан вызывающим кодом, status=null преобразуется в -1. git-ошибка бросается; Check различает error/findings/note/notices. gitPaths выключает quoting, но разделение путей по newline не поддерживает newline внутри имени.

## scripts/quality.ts

Источник: [scripts/quality.ts](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/scripts/quality.ts). Статус: `read`.

Вход CLI. До разбора команд вызывает updatePluginRoot, то есть даже чтение через CLI имеет запись в пользовательский каталог. full принудительно берёт all; --if-configured явно допускает успешный пропуск; outer exception даёт exit 2. Все опыты проводить с CODE_QUALITY_HOME внутри sandbox.

## skills/code-quality/SKILL.md

Источник: [skills/code-quality/SKILL.md](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/skills/code-quality/SKILL.md). Статус: `read`.

Полностью прочитан как объект исследования, не установлен и не активирован. Связывает fast/full/hooks, признаёт отсутствие тестов в fast и однократный stop retry. Содержит также авторские правила коммитов; их универсальность не доказана.

## skills/code-quality/references/checks.md

Источник: [skills/code-quality/references/checks.md](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/skills/code-quality/references/checks.md). Статус: `read`.

Описание детерминированных правил и формулы CRAP; coverage собственных строк функции без вложенных. Наличие LCOV и отсутствие покрытия отдельной функции — разные состояния. Документ даёт карту, но каждую гарантию нужно сверить с кодом и пробой.

## skills/code-quality/references/config.md

Источник: [skills/code-quality/references/config.md](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/skills/code-quality/references/config.md). Статус: `read`.

Настройки, CLI и providers. Заявляет неизвестные ключи ошибкой; это не эквивалент валидации значений. LLM reviewer указан как ещё не подключённый. Событие pi в тексте расходится с именем в adapter.

## skills/code-quality/references/hook-chain.md

Источник: [skills/code-quality/references/hook-chain.md](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/skills/code-quality/references/hook-chain.md). Статус: `read`.

Объясняет сохранение предыдущих хуков, stdin pre-push, worktree и первый коммит. Утверждение про собственный опыт с LFS — свидетельство автора; в нашем окружении LFS не запускался. Про первый коммит совпадает с diff.ts, расходится с limits.md.

## skills/code-quality/references/jev.md

Источник: [skills/code-quality/references/jev.md](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/skills/code-quality/references/jev.md). Статус: `read`.

Вероятностные замечания по тестовым hunks, opt-in, несколько вопросов, общий budget, модели/провайдеры. Не влияет на детерминированный verdict. Claims калибровки пока только авторские; внешняя модель не проверяет сама исполнение теста.

## skills/code-quality/references/languages.md

Источник: [skills/code-quality/references/languages.md](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/skills/code-quality/references/languages.md). Статус: `read`.

Таблица 12 языков. Dart без CC, часть инструментов optional/not run. Язык в списке не означает полноту и успешный запуск всех анализаторов.

## skills/code-quality/references/limits.md

Источник: [skills/code-quality/references/limits.md](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/skills/code-quality/references/limits.md). Статус: `read`.

Описывает ограничения и обходы. Утверждение о первом коммите расходится с headOrEmpty в diff.ts и тестом pipeline.test.ts, который требует находку на первом staged commit. Документ нельзя использовать как единственный источник текущего поведения. Full coverage всё ещё отдельно требует HEAD; без Bun-прогона не обещаем все режимы первого коммита.

## skills/code-quality/references/report.md

Источник: [skills/code-quality/references/report.md](https://github.com/smixs/code-quality/blob/407501608b1ffe8ab0e236b742513592fca9ed60/skills/code-quality/references/report.md). Статус: `read`.

Отчёты Markdown/JSON, notices/bypass и worklist. Имена check/report перезаписываются: для идеи исторических отчётов пользователя нужен отдельный неизменяемый run-id и provenance.

