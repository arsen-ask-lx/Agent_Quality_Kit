---
description: Work through what this repository is missing, in order, with a command that proves each item done. Use after a check run turned up red gates, blind spots or rules nobody enforces, or when the user asks what to fix first, what to do next about repo quality, or to act on an AQK report.
---

# Fix what the repository is missing — in order, with proof

Do not invent the order. The tool computes it from facts about **this** repository:

```bash
npx -y agent-quality-kit prompt
```

It prints at most five items, heaviest first, and **every item carries the command that proves it
done**. Work them top to bottom.

## How to finish an item

An item is finished when **the command named under it was red and is now green**. Not when the
code looks right, not when you believe it works. Run the command. Show the output.

If you cannot make it green in three attempts, stop and tell the human what you tried and what
you think is in the way. Grinding past three attempts is how a small problem becomes a rewrite.

## The traps this list is built to avoid

- **A rule with no enforcer.** Writing a rule into `AGENTS.md` does not create a check. Every rule
  should carry `<!-- aqk: gate-name -->`, or honestly say `<!-- aqk: человек -->` / `<!-- aqk: human -->`
  — which admits no machine holds it. An admission is fine; a pretend check is not.
- **A gate that cannot fail.** After adding or editing any check, run
  `npx -y agent-quality-kit prove`: a gate must go red on its own bad sample and stay quiet on the
  good one. A gate that passes both proves nothing.
- **Fixing a file the tool never blamed.** If a gate reported `could not check` / `не смогли
  проверить`, the instrument broke — not the code. Fix the tooling.
- **A check the repository declares but never runs.** "Declared" and "works" are different claims;
  only `--run` tells them apart.

## When the tool itself is wrong

It happens, and it is worth more than praise. `npx -y agent-quality-kit feedback` builds a short
report — version, level, stack, what went red, what it could not check — with **no paths, no code
and no repository name**, plus a prefilled link.

`npx -y agent-quality-kit feedback --send "what you would say"` sends it in one command, using the
human's own `gh` account, as a comment in an open discussion. **Never add `--send` on your own.**
Print the report, show it to the human, ask whether to send it, and add the flag only if they say
yes. Say it once and do not insist — without the flag nothing ever leaves the machine.
