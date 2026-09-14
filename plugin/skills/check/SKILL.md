---
description: Find out whether this repository's own checks can actually fail — run the declared gates, prove them against known-bad samples, and plant a defect to see what nothing catches. Use when the user asks whether their CI, hooks, linter or tests really protect anything, why a check stayed green, what this repo is missing, or mentions AQK.
---

# Are this repository's checks real?

A check that cannot fail looks exactly like a check that passes. `|| true`, `continue-on-error`,
a linter pointed at an empty directory, a test with no assertion — all of them print a green tick.
This skill answers the only question that separates them: **can it go red?**

## What to run

```bash
npx -y agent-quality-kit doctor --run
```

Read the verdict carefully; the exit code alone is not the answer.

**Three outcomes per gate, and they are not two.** Never collapse them:

| what you see | what it means | what to do |
| --- | --- | --- |
| `✔` | ran, and found nothing | nothing |
| `✘ … код N` / `exit N` | a finding about the code | fix the code |
| `не смогли проверить` / `could not check` | **the check itself failed** — tool missing, unexpected exit code, killed | fix the tooling; do not touch the code it named |

The third one is the trap. If you report it as a finding, the human will go and "fix" a file that
was never broken, and the broken instrument stays broken.

## What else is worth running

- `npx -y agent-quality-kit probe` — plants a known-bad sample into a **copy** of the file the
  repository's own history shows as the most repaired, then runs the declared gates against it.
  A class nobody catches is the most valuable thing this tool produces. It never touches the
  working tree and always exits 0.
- `npx -y agent-quality-kit prompt` — turns everything above into one ordered task list where
  **every item carries the command that proves it done**. Prefer this over inventing your own plan.
- `npx -y agent-quality-kit doctor --run --since main` — only what this branch introduced, so
  years of inherited debt do not bury today's change.

## Rules while using this

- **Do not weaken a check to make it green.** `|| true`, `--exit-zero`, `continue-on-error: true`,
  blanket suppressions — all of them turn a failure into silence, which is the exact problem this
  tool exists to find. If a check is wrong, say so to the human and stop.
- **"Looks fine" is not done.** Name the arbiter: which command was red and is now green.
- If the repository has no `.aqk.yml`, `npx -y agent-quality-kit init` lays one out — but ask the
  human first: it writes files into their project.
