# AQK — Agent Quality Kit

[English](README.md) · **Русский**

[![npm](https://img.shields.io/npm/v/agent-quality-kit)](https://www.npmjs.com/package/agent-quality-kit)
[![проверки](https://img.shields.io/github/actions/workflow/status/arsen-ask-lx/Agent_Quality_Kit/ci.yml?branch=main&label=%D0%BF%D1%80%D0%BE%D0%B2%D0%B5%D1%80%D0%BA%D0%B8)](https://github.com/arsen-ask-lx/Agent_Quality_Kit/actions/workflows/ci.yml)
[![AQK-3](https://img.shields.io/badge/AQK-3-2ea44f)](https://github.com/arsen-ask-lx/Agent_Quality_Kit)
[![node](https://img.shields.io/node/v/agent-quality-kit)](package.json)
[![зависимостей: 0](https://img.shields.io/badge/%D0%B7%D0%B0%D0%B2%D0%B8%D1%81%D0%B8%D0%BC%D0%BE%D1%81%D1%82%D0%B5%D0%B9-0-2ea44f)](package.json)
[![лицензия MIT](https://img.shields.io/npm/l/agent-quality-kit)](LICENSE)

[![Linux](https://img.shields.io/badge/Linux-%D0%BF%D1%80%D0%BE%D0%B2%D0%B5%D1%80%D0%B5%D0%BD%D0%BE-FCC624?logo=linux&logoColor=black)](https://github.com/arsen-ask-lx/Agent_Quality_Kit/actions/workflows/ci.yml)
[![Windows](https://img.shields.io/badge/Windows-%D0%BF%D1%80%D0%BE%D0%B2%D0%B5%D1%80%D0%B5%D0%BD%D0%BE-0078D6)](https://github.com/arsen-ask-lx/Agent_Quality_Kit/actions/workflows/ci.yml)
[![Python](https://img.shields.io/badge/Python-3776AB?logo=python&logoColor=white)](docs/guide.ru.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](docs/guide.ru.md)
[![Go](https://img.shields.io/badge/Go-00ADD8?logo=go&logoColor=white)](docs/guide.ru.md)
[![Rust](https://img.shields.io/badge/Rust-000000?logo=rust&logoColor=white)](docs/guide.ru.md)
[![любой язык](https://img.shields.io/badge/%D0%BB%D1%8E%D0%B1%D0%BE%D0%B9%20%D1%8F%D0%B7%D1%8B%D0%BA-sh-4EAA25?logo=gnubash&logoColor=white)](kit/gates)

[![Claude Code](https://img.shields.io/badge/Claude%20Code-%D0%BF%D0%BB%D0%B0%D0%B3%D0%B8%D0%BD-D97757?logo=claude&logoColor=white)](#поставить-насовсем)
[![Codex](https://img.shields.io/badge/Codex-AGENTS.md-412991)](AGENTS.md)
[![Cursor](https://img.shields.io/badge/Cursor-AGENTS.md-000000)](AGENTS.md)
[![любой агент](https://img.shields.io/badge/%D0%BB%D1%8E%D0%B1%D0%BE%D0%B9%20%D0%B0%D0%B3%D0%B5%D0%BD%D1%82%20%D0%B8%D0%BB%D0%B8%20%D0%B1%D0%B5%D0%B7%20%D0%BD%D0%B5%D0%B3%D0%BE-555555)](AGENTS.md)
[![GitHub Action](https://img.shields.io/badge/GitHub%20Action-Marketplace-2ea44f?logo=github)](https://github.com/marketplace/actions/agent-quality-kit-aqk)

```
 █████╗   ██████╗ ██╗  ██╗
██╔══██╗ ██╔═══██╗██║ ██╔╝
███████║ ██║   ██║█████╔╝
██╔══██║ ██║▄▄ ██║██╔═██╗
██║  ██║ ╚██████╔╝██║  ██╗
╚═╝  ╚═╝  ╚══▀▀═╝ ╚═╝  ╚═╝
   обещание без кода возврата — просто предложение
```

**AQK проверяет, что проверки вашего репозитория действительно ловят ошибки.** Особенно когда
код пишет ИИ-агент.

## Зачем

Агент пишет код быстрее, чем вы успеваете его читать. Качество держат проверки: тесты, линтер,
конвейер. Но проверка, которая не может провалиться, показывает ту же зелёную галочку, что и
рабочая: `|| true` в скрипте, тест без единого утверждения, хук, который никто не поставил,
команда из `AGENTS.md`, которой больше нет.

AQK находит такие проверки. Он подсаживает заведомую ошибку в **копию** вашего кода, запускает
проверки, которые объявил репозиторий, и говорит, какая заметила, а какая промолчала.

## Кому и когда

- **Вы пишете код с агентом** — Claude Code, Codex, Cursor или другим — и хотите, чтобы правила
  проекта держала машина, а не его память.
- **Конвейер зелёный, но вы не уверены, что он что-то ловит.**
- **Начинаете новый проект** и хотите сторожей с первого дня: секреты, отладочная печать,
  проглоченные ошибки, огромные файлы.
- **У вас несколько проектов**, и опыт «на чём уже обжигались» должен переезжать между ними.

Работает с любым агентом и без него, на любом языке. Ставить ничего не нужно.

## Попробовать за минуту

```bash
npx agent-quality-kit doctor    # код уже есть: что проверяется, а что не сторожит никто
npx agent-quality-kit start     # кода ещё нет: поставить сторожей сразу
```

`doctor` только читает: не пишет файлов и ничего не отправляет. Вот что он говорит о проекте,
где конвейер зелёный, а покраснеть не может ни одна проверка:

```text
✘  test         npm test   ← package.json
   не может провалиться: исход погашен прямо в скрипте — «|| true»
✔  lint         npm run lint   ← package.json
✘  typecheck    npm run typecheck   ← package.json
   ничего не доказывает: всё тело скрипта — печать — «echo 'todo: turn this on'»
```

У каждой проверки три исхода, а не два: `✔` чисто, `✘` находка в коде, `?` **сама проверка не
смогла** — чинить нужно инструмент, а не файл. Отказ написан для агента: в нём сказано, что
сделать.

## Главные команды

| Команда | Что делает |
|---|---|
| `doctor` | осмотр: что объявлено, что не сторожит никто, какой уровень |
| `doctor --run` | запускает объявленные проверки; код возврата — для конвейера |
| `add <имя>` | ставит готового сторожа из каталога |
| `prove` | доказывает, что каждая проверка краснеет на своём образце ошибки |
| `probe` | подсаживает ошибки в копию кода и смотрит, кто их поймает |
| `report --html` | страница для человека: что защищено, лучше или хуже, что поручить агенту |
| `context` | состояние репозитория для агента — до его первого действия |

## Поставить насовсем

В конвейер GitHub:

```yaml
- uses: arsen-ask-lx/Agent_Quality_Kit@v0.18.0
  with:
    min: 1   # сборка падает ниже AQK-1 или если упала любая объявленная проверка
```

Хуком [pre-commit](https://pre-commit.com):

```yaml
repos:
  - repo: https://github.com/arsen-ask-lx/Agent_Quality_Kit
    rev: v0.18.0
    hooks:
      - id: aqk
```

Плагином Claude Code — состояние репозитория попадает агенту в контекст:

```bash
/plugin marketplace add arsen-ask-lx/Agent_Quality_Kit
/plugin install aqk@agent-quality-kit
```

**Нужно:** Node 18+ и `sh` (macOS, Linux, WSL; на Windows — Git Bash). Пакет весит **≈0,8 МБ**,
зависимостей нет. Раз в сутки, и никогда в конвейере, `doctor --brief` спрашивает у npm номер
последней версии; выключается `AQK_UPDATE=0`. Автообновления нет.

## Подробнее

- [Полное руководство](docs/guide.ru.md) — все команды, ступени AQK-0…3, как устроены проверки,
  каталог, как ввести правило в живой проект.
- [Каталог сторожей](kit/gates) · [Журнал шишек](incidents/README.md) · [Спецификация](SPEC.md)
- [Как принести свой гейт](CONTRIBUTING.md) · [Сообщить об ошибке](https://github.com/arsen-ask-lx/Agent_Quality_Kit/issues)

Лицензия MIT.
