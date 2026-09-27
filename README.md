# AQK — Agent Quality Kit

**English** · [Русский](README.ru.md)

[![npm](https://img.shields.io/npm/v/agent-quality-kit)](https://www.npmjs.com/package/agent-quality-kit)
[![checks](https://img.shields.io/github/actions/workflow/status/arsen-ask-lx/Agent_Quality_Kit/ci.yml?branch=main&label=checks)](https://github.com/arsen-ask-lx/Agent_Quality_Kit/actions/workflows/ci.yml)
[![AQK-3](https://img.shields.io/badge/AQK-3-2ea44f)](https://github.com/arsen-ask-lx/Agent_Quality_Kit)
[![node](https://img.shields.io/node/v/agent-quality-kit)](package.json)
[![dependencies: 0](https://img.shields.io/badge/dependencies-0-2ea44f)](package.json)
[![MIT licence](https://img.shields.io/npm/l/agent-quality-kit)](LICENSE)

[![Linux](https://img.shields.io/badge/Linux-tested-FCC624?logo=linux&logoColor=black)](https://github.com/arsen-ask-lx/Agent_Quality_Kit/actions/workflows/ci.yml)
[![Windows](https://img.shields.io/badge/Windows-tested-0078D6)](https://github.com/arsen-ask-lx/Agent_Quality_Kit/actions/workflows/ci.yml)
[![Python](https://img.shields.io/badge/Python-3776AB?logo=python&logoColor=white)](docs/guide.md)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](docs/guide.md)
[![Go](https://img.shields.io/badge/Go-00ADD8?logo=go&logoColor=white)](docs/guide.md)
[![Rust](https://img.shields.io/badge/Rust-000000?logo=rust&logoColor=white)](docs/guide.md)
[![any language](https://img.shields.io/badge/any%20language-sh-4EAA25?logo=gnubash&logoColor=white)](kit/gates)

[![Claude Code](https://img.shields.io/badge/Claude%20Code-plugin-D97757?logo=claude&logoColor=white)](#install-for-good)
[![Codex](https://img.shields.io/badge/Codex-AGENTS.md-412991)](AGENTS.md)
[![Cursor](https://img.shields.io/badge/Cursor-AGENTS.md-000000)](AGENTS.md)
[![any agent](https://img.shields.io/badge/any%20agent%20or%20none-555555)](AGENTS.md)
[![GitHub Action](https://img.shields.io/badge/GitHub%20Action-Marketplace-2ea44f?logo=github)](https://github.com/marketplace/actions/agent-quality-kit-aqk)

```
 █████╗   ██████╗ ██╗  ██╗
██╔══██╗ ██╔═══██╗██║ ██╔╝
███████║ ██║   ██║█████╔╝
██╔══██║ ██║▄▄ ██║██╔═██╗
██║  ██║ ╚██████╔╝██║  ██╗
╚═╝  ╚═╝  ╚══▀▀═╝ ╚═╝  ╚═╝
   a promise without an exit code is just a sentence
```

**AQK checks that your repository's checks actually catch mistakes.** Especially when an AI agent
writes the code.

## Why

An agent writes code faster than you can read it. What keeps quality up is checks: tests, linters,
CI. But a check that cannot fail prints the same green tick as one that works: `|| true` in a
script, a test with no assertion, a hook nobody installed, a command in `AGENTS.md` that no longer
exists.

AQK finds those. It plants a known mistake into a **copy** of your code, runs the checks your
repository declares, and tells you which of them noticed and which stayed silent.

## Who it is for, and when

- **You write code with an agent** — Claude Code, Codex, Cursor or any other — and want the
  project's rules held by a machine, not by the agent's memory.
- **Your CI is green, but you are not sure it catches anything.**
- **You are starting a project** and want guards from day one: secrets, debug prints, swallowed
  errors, giant files.
- **You run several projects**, and "what already burned us" should move between them.

Works with any agent, or none, and any language. Nothing to install.

## Try it in a minute

```bash
npx agent-quality-kit doctor    # code already exists: what is checked, what nothing watches
npx agent-quality-kit start     # no code yet: set up the guards right away
```

`doctor` only reads: it writes no file and sends nothing anywhere. Here is what it says about a
project whose CI is green and whose checks cannot go red:

```text
✘  test         npm test   ← package.json
   cannot fail: the verdict is swallowed right in the script — «|| true»
✔  lint         npm run lint   ← package.json
✘  typecheck    npm run typecheck   ← package.json
   proves nothing: the whole script is a printout — «echo 'todo: turn this on'»
```

Every check has three outcomes, not two: `✔` clean, `✘` a finding in the code, `?` **the check
itself could not run** — fix the tool, not the file. Each failure is written for the agent: it
says what to do.

## Main commands

| Command | What it does |
|---|---|
| `doctor` | inspection: what is declared, what nothing watches, which level |
| `doctor --run` | runs the declared checks; the exit code is for CI |
| `add <name>` | installs a ready guard from the catalogue |
| `prove` | proves each check goes red on its own sample mistake |
| `probe` | plants mistakes into a copy of the code and sees who catches them |
| `report --html` | one page for a human: what is protected, better or worse, what to hand the agent |
| `context` | the repository's state for the agent — before its first action |

## Install for good

In GitHub CI:

```yaml
- uses: arsen-ask-lx/Agent_Quality_Kit@v0.19.0
  with:
    min: 1   # the build fails below AQK-1 or if any declared check failed
```

As a [pre-commit](https://pre-commit.com) hook:

```yaml
repos:
  - repo: https://github.com/arsen-ask-lx/Agent_Quality_Kit
    rev: v0.19.0
    hooks:
      - id: aqk
```

As a Claude Code plugin — the repository's state reaches the agent's context:

```bash
/plugin marketplace add arsen-ask-lx/Agent_Quality_Kit
/plugin install aqk@agent-quality-kit
```

**Needs:** Node 18+ and `sh` (macOS, Linux, WSL; on Windows, Git Bash). The package is
**≈0.8 MB** with no dependencies. Once a day, never in CI, `doctor --brief` asks npm for the
latest version number; turn it off with `AQK_UPDATE=0`. There is no auto-update.

## More

- [The full guide](docs/guide.md) — every command, levels AQK-0…3, how checks work, the
  catalogue, how to introduce a rule into a live project.
- [Guard catalogue](kit/gates) · [Incident log](incidents/README.md) · [Specification](SPEC.md)
- [Bring your own gate](CONTRIBUTING.md) · [Report a problem](https://github.com/arsen-ask-lx/Agent_Quality_Kit/issues)

MIT licence.
