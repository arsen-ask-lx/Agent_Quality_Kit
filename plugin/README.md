# AQK as a Claude Code plugin

A thin wrapper over [`agent-quality-kit`](https://github.com/arsen-ask-lx/Agent_Quality_Kit) —
**and nothing more.** The moment logic of its own appears here, it drifts from the program, and
the plugin starts answering a different question than the CLI. Same reason the GitHub Action in
this repository is three lines over `npx agent-quality-kit doctor --run`.

## What it adds to a session

| piece | what it does |
| --- | --- |
| `SessionStart` hook | puts the repository's real state into the agent's context **before its first action**: level, what is red right now, rules nobody enforces, what the probe found blind, the next three steps with commands. A file is an invitation to read; a hook is not refusable — that is the whole difference. |
| `/aqk:check` | whether this repository's checks can actually fail, and how to read the three outcomes (`clean` · `finding` · **could not check**) without confusing the last two. |
| `/aqk:fix` | what to fix, in order, with the command that proves each item done. |

## Install

```
/plugin marketplace add arsen-ask-lx/Agent_Quality_Kit
/plugin install aqk@agent-quality-kit
```

This repository is its own marketplace — no approval from anyone, and the two lines above work
today. Nothing else is required: the hook and the skills call `npx -y agent-quality-kit`, which
picks a local install from `node_modules/.bin` when the project has one.

**What it costs you, measured** (2026-09-14, Linux, Node 22): the session-start hook takes **2.6 s
the first time** (npx fetches the package) and **~1.0 s afterwards**, of which most is npx
resolution — the state block itself only reads files and never runs your gates. Once per session,
never during a commit. If that is too much, drop the plugin and run
`npx agent-quality-kit context --install` instead: same block, installed as a plain hook you own.

## What it does not do

- **Sends nothing on its own.** The kit makes exactly one outgoing request of its own — asking npm
  whether a newer version exists — and it is documented in
  [`SECURITY.md`](https://github.com/arsen-ask-lx/Agent_Quality_Kit/blob/main/SECURITY.md).
  `aqk feedback` only prints a report — no paths, no code, no repository name; `aqk feedback --send`
  posts that same report through **your own `gh`**, and the consent lives in the flag. A machine
  check holds that: without `--send`, `gh` is never called even once.
- **Writes nothing into your project** unless you run `init` or `add` yourself.
- **Never weakens a check to make it green.** That is the failure this tool exists to find.

## Why this exists at all

A check that cannot fail looks exactly like a check that passes. `|| true`, `continue-on-error`,
a linter aimed at an empty directory, a test with no assertion — every one of them prints a green
tick. The kit plants a known defect into a **copy** of the file your own history shows as the most
repaired, runs your declared checks against it, and counts a catch only when a check names the
planted file and stays quiet on the clean one.

Measured on a pair of twins — two projects identical except for whether the checks can fail —
a neighbouring tool scored 71 and 71. Details, with the code:
[`research/competitors/`](https://github.com/arsen-ask-lx/Agent_Quality_Kit/tree/main/research/competitors).
