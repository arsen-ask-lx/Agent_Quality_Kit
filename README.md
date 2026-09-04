# AQK — Agent Quality Kit

**English** · [Русский](README.ru.md)

[![npm](https://img.shields.io/npm/v/agent-quality-kit)](https://www.npmjs.com/package/agent-quality-kit)
[![checks](https://github.com/arsen-ask-lx/Agent_Quality_Kit/actions/workflows/ci.yml/badge.svg)](https://github.com/arsen-ask-lx/Agent_Quality_Kit/actions/workflows/ci.yml)
[![MIT licence](https://img.shields.io/npm/l/agent-quality-kit)](LICENSE)

**A standard for whether a repository is ready to have its code written by agents.** Every
promise the project makes turns into a command with an exit code — held by a machine, not by
someone's good intentions.

What a project needs before that is even possible, in plain words, independent of language and
tooling: [the dark factory and the minimum that isn't optional](kit/docs/ai/project-baseline.md).

```bash
npx agent-quality-kit start     # no code yet: day-zero guards, right away
npx agent-quality-kit doctor    # code already exists: your level and what to install
```

Nothing to install — `npx` fetches the package itself (230 KB). The bleeding edge straight from
the repository is `npx github:arsen-ask-lx/Agent_Quality_Kit doctor`, but the first run that way
stays silent for two or three minutes: it clones the whole repository.

**Requirements.** Node 18+ and an `sh` shell — present on macOS, Linux and WSL; Git Bash works on
Windows. The portable checks are written in `sh` on purpose: it exists everywhere code is built.

**Tool-agnostic:** Claude Code, Codex, Cursor — and without AI at all.

The first time you run `init`/`start` on a machine, it prints a link to star the repo and to open
an issue, once. Nothing is posted anywhere — it is text for a human, and it never repeats.

**Off-the-shelf rules are optional and installed separately.** The portable check always works
without them; if the project already has `ruff`, `eslint` or `vulture`, the entry will use the
native rule instead — it is more precise. One entry, `dead-code`, does not work at all without a
real tool and honestly hides itself: you cannot build a call graph with a text search.

## How it works

The whole standard is one `.aqk.yml` file in the repository root:

```yaml
aqk: 1
entry:  [AGENTS.md]        # what the agent reads first
rules:  .aqk/rules         # where the standards live
gates:                     # what must pass — as commands, not as prose
  lint: "npm run lint"
  secrets-not-in-code: "bash gates/secrets-not-in-code/check.sh ."
samples:  gates            # a red and a green sample for every entry
ratchets: ratchets         # debt registries: the list may only get shorter
lessons:  incidents        # where lessons accumulate
```

An empty field is not a placeholder — it is an honest "this level is not reached". `init` writes
them empty, and they fill in as there becomes something real to put in them.

**If a claim cannot be checked by a machine, it is not in this standard.** Otherwise the badge
would mean trust in the author rather than a fact.

## Four levels

| Level | Required | What it proves |
|---|---|---|
| **AQK-0** | a manifest and an entry point | the tooling knows what to read |
| **AQK-1** | rules exist, gates declared as commands | the checks are executable |
| **AQK-2** | gates have red and green samples, debt under a ratchet | the gate catches defects and stays quiet on correct code |
| **AQK-3** | a lesson journal with conclusions | the same bruise is not collected twice |

```bash
aqk doctor --run --min 1   # in CI: fails below AQK-1 OR if any gate failed
```

## Installing a gate

```bash
aqk find "print statements in production"   # is there already such a gate — matched by intent
aqk doctor                                  # what applies to this repository and what is missing
aqk add secrets-not-in-code                 # copies the check and its samples in, declares it
aqk doctor --run                            # runs the declared gates and shows the result
aqk ratchet no-print-in-prod                # existing violations become debt, new ones are blocked
```

Every `doctor --run` rewrites `.aqk/last-run.md` — a short report of what actually ran and how
long it took. The list of gates in the manifest says nothing about how many of them are alive
right now; the report does. The file is ephemeral — keep it in your own `.gitignore`.

## When a bug slips past the guards

```bash
aqk why "a file grew to nine thousand lines"
```

The answer is one of three, and it is chosen by an actual run rather than by memory: **there was
no guard** · **the guard exists but does not see this failure** · **the guard exists and catches
it — so it was bypassed**. The difference decides what to fix: the check itself, or its place in
the pipeline. Without a run those two are indistinguishable, and people usually fix the wrong
one. On an uncertain match the command asks instead of choosing for you.

**The ratchet** is for introducing a rule into a project whose existing code violates it. The
violations are captured into a registry; the gate lets that list get **shorter** and refuses to
let it grow. The rule applies from the day it is installed — the old code stays untouched.

`add` **copies the check into your repository** rather than referencing the package: installed
via `npx` the package is temporary, and tomorrow the command in your manifest would point at
nothing.

## The catalogue of promises

`doctor` inspects the repository — languages, existing gates — and shows **only what applies**:
what a machine already holds, what applies but is not installed, and what is hidden and why. The
catalogue may grow to hundreds of entries; a given project still sees about a dozen.

An entry is accepted only if its arbiter goes red on the red sample, stays quiet on the green
one, and names a real failure it caught. A machine checks this: `bash tool/selfcheck/gates.sh`.

## The guides as a single file

```bash
aqk blob     # assembles GOD_AI.md out of kit/docs — to hand the guides to a chat in one go
```

The file is **assembled, not stored**: edit the originals. A hand-edited copy drifts from its
source within a week, and then nobody knows which one is real.

## Contributing a gate

The catalogue lives on other people's bruises. The procedure and the bar are in
[`CONTRIBUTING.md`](CONTRIBUTING.md): check for duplicates with `aqk find`, scaffold with
`aqk new`, add two samples, fill in four fields, run the machine. The filtering is done by
`tool/selfcheck/gates.sh`, not by a reviewer.

## The bruise journal

```bash
aqk note "the gate went red on correct code"   # an entry without a conclusion is rejected
```

## Honestly, where this stands

The full brief is in [`PROJECT.md`](PROJECT.md) (in Russian): what is being built, the four
scenarios, the success criterion, and what is left.

Version 1, one author. The kit holds **AQK-3** on itself: everything declared is executed by CI
on every push, two debt registries under a ratchet — `node tool/program.mjs doctor --run --min 1`.
As long as one person uses it, AQK is a nice acronym in a README. It starts being real when a
third, foreign project appears.

**A standard cannot be shipped first.** A specification ahead of practice is the thirty-first
abandoned repository with a manifest and zero users. The order is the other way round:

| # | Step | State |
|---|---|---|
| 1 | live by this on our own projects | ⬜ measured: three of our own projects have no manifest |
| 2 | `doctor` computes the level | ✅ done |
| 3 | what settled is written up as a short spec | ✅ [`SPEC.md`](SPEC.md) |
| 4 | a third project — **someone else's** | ❌ the first honest signal, still missing |
| 5 | badge, site, talking to people | ❌ only after step four |

## The work queue

Lives in one place — [`PROJECT.md` §9](PROJECT.md). It is not repeated here: two lists drift
apart within a month, and then nobody knows which is real.

What is missing: a second user; per-command coverage of the commands that write to disk (they are
exercised by a clean-folder run, but not individually); a third — foreign — project.

MIT.
