// tool/i18n/templates-en.mjs — английские тексты, которые программа кладёт в чужой проект.
//
// Ключи обязаны совпадать с templates-ru.mjs: каталоги подмешивают их полем templates, и
// модульная проверка «одни и те же ключи» заходит внутрь.

const AGENTS_MD = `# AGENTS.md

> The entry point for an agent. Keep this file short: a bloated rulebook pushes the actual task
> out of the context window, and then every rule gets ignored at once. Anything long goes behind
> the links below.

## Hard rules

- **A plan before code.** A non-trivial task starts with a plan a human approved in words.
- **A red test before code.** First a check that fails, then the implementation.
- **Three attempts maximum.** Not solved in three — stop and ask a human, not a fourth try.
- **Secrets only in the environment.** Never in code, logs or commits.
- **Only the files the task is about.** No fixing things "while we are here".
- **Done = proven.** Name the arbiter: a test, a live run, a check against the source.
  "Looks like it works" is not done.
- **Never swallow an error.** Either handled and logged, or re-raised.
- **A fork in the road is a question for a human.** Departing from an agreed decision is not
  documented with a code comment.
- **Report on your work with the kit with a command, not with words.** When you are done, run
  \`aqk report\`. It is assembled from an actual run: a summary from memory always picks the
  convenient parts and stays quiet about a gate standing on the weakest recipe.

## The AQK tooling is your commands, not the human's

This repository has the AQK kit installed. Its point: **a promise the project makes turns into a
command with an exit code**, and from then on a machine holds it, not somebody's attention.
"We do not leave debug printing" is text you can ignore; a command returning non-zero is not.

Running them is your job. The human looks at the list of holes and decides which to close.

| Command | What it does | When to reach for it |
|---|---|---|
| \`aqk doctor\` | inspects the repository and prints three lists: what a machine already holds, what is missing, and what this project does not need and why | starting work on quality; "what is even here" |
| \`aqk doctor --run\` | **runs** the declared checks and shows which one found a defect | before handing work over; after changes; whenever you need a fact rather than a promise |
| \`aqk add <name>\` | installs a check from the catalogue: copies it and its samples into the project, declares it in the manifest | the human agreed to close a hole from the \`doctor\` list |
| \`aqk ratchet <name>\` | records existing violations as debt and stops letting new ones through | the check goes red on old code nobody is going to fix right now |
| \`aqk find "…"\` | searches by meaning for an existing check | before inventing your own |
| \`aqk note "…"\` | writes a lesson into the shared journal | the process or an instrument let you down: a check lied, a rule was bypassed |
| \`aqk report\` | assembles a report from an actual run: what is in place and with which recipe, what is missing, what the kit told you to read | **mandatory** at the end of working with the kit — instead of a summary from memory |

If there is no \`aqk\` command on the system, the kit was used without installing. Then write
\`npx agent-quality-kit\` instead of \`aqk\`. Every command prints the invocation that will
actually work for you.

**Three things to understand rather than memorise:**

1. **"Declared" and "works" are different claims.** \`doctor\` without \`--run\` honestly says it
   ran nothing. Do not present the declared as the working.
2. **A check without two samples proves nothing.** The red one is code it must fire on; the green
   one is correct code it must stay quiet on. The green one matters more: without it, one day the
   check goes red on correct code and gets switched off along with all the others.
3. **A rule is introduced with a ratchet, not with a big cleanup.** The cleanup is postponed
   forever, because it is big. The ratchet gives you a rule in force from the day it lands.

**A defect of the same class repeating is not a reason to be more careful — it is a reason to add
a check.** Discipline does not scale; mechanics do.

## Third-party code inside the repository

Code that lives here but was not written here (a reference copy, vendored code, generated
clients) is excluded with \`.aqkignore\` in the root — one pattern per line. Editing the copy of
\`_skip.sh\` is not configuration: the next \`aqk add\` overwrites it.

## Where things live

- \`.aqk/rules/\` — standards: general, tests, security
- \`.aqk/docs/\` — guides: the project minimum, the harness, process, research
- \`.aqk/docs/project-baseline.md\` — **start here** if the project is new

## Commands

<!-- Fill this in for your project. A command you cannot copy and run is not a command. -->

- build: \`\`
- tests: \`\`
- linter: \`\`
- everything at once before pushing: \`\`

## What this project does not have

<!-- Be honest here. An unwritten "no" is something the agent will assume is a "yes". -->
`;

const CLAUDE_MD = `# CLAUDE.md

The rules for this project live in \`AGENTS.md\` — read that.

One rulebook, several entry points: \`AGENTS.md\` for agents that understand it, \`CLAUDE.md\`
for Claude Code. Keeping two diverging rulebooks is not an option: within a month they lie in
different ways, and nobody knows which one is real.

@AGENTS.md
`;


const GATE_YML_TEMPLATE = (slug) => `# An AQK catalogue entry. The format and every field — kit/gates/README.md
# Until the lines below are filled in, the check will reject this entry — by design.

# In one phrase: which class of defect it catches. Deduplication runs on this field.
intent: FILL IN — which class of defect it catches
intent_en: FILL IN — which class of defect it catches

# When the entry is shown to a human. The condition must be a query about the repository
# that the program can evaluate: always | langs: python, go | has_gates: true
trigger:
  always: true

# The arbiter command per stack. {gate} is the entry folder, {dir} is what we check.
# any — a portable command that needs no third-party programs.
recipes:
  any: bash {gate}/check.sh {dir}

# A real failure this check caught. "A good practice" is not accepted:
# point at a journal entry — incidents/README.md
proof: FILL IN — which failure it caught and what that cost
`;

const CHECK_SH_TEMPLATE = `#!/usr/bin/env sh
# A check. Returns 0 — clean, non-zero — defect. The failure text must SAY what to do:
# it lands straight in the agent's context, and with an instruction the agent fixes it itself.
DIR="\${1:-.}"
. "$(dirname "$0")/../_skip.sh" 2>/dev/null || SKIP_NAMES=".git .aqk node_modules .venv"

# own_samples_filter hides ONLY gates/<name>/red|green/ — not every folder with that name in
# the project. --exclude-dir=red by bare name would one day hide a real user folder called
# red/ (found on secrets-not-in-code — see the journal, 2026-09-04).
HITS=$(grep -rnE $(skip_grep "$DIR") 'FILL_IN_SEARCH_PATTERN' "$DIR" 2>/dev/null | own_samples_filter "$DIR")
if [ -n "$HITS" ]; then
  echo "$HITS"
  echo "  fix: FILL IN — what exactly to do"
  exit 1
fi
exit 0
`;

const README_TEMPLATE = (slug) => `# FILL IN — a one-line title

**Intent.** What must not reach the code, and why.

**Which failure this caught.** What broke, in which project, and what it cost. Without this the
entry is not accepted: "it is a good practice" collects hundreds of entries you cannot choose
between.

**Why a machine and not attention.** The moment at which a human misses this.

**An off-the-shelf equivalent.** Does ruff, eslint or semgrep already have this check? If it
does, the recipe for that language must use it, and your own check stays the fallback. If it does
not, write down what exactly you checked: "did not look" and "there is none" are different claims.

**What it does NOT catch.** Name the boundary honestly. A gate whose limits go unmentioned is
more dangerous than a missing one: people will rely on it.

**Samples.** \`red/\` — what is violated here. \`green/\` — the same thing, done right.
`;

export const templates = {
  AGENTS_MD, CLAUDE_MD,
  GATE_YML_TEMPLATE, CHECK_SH_TEMPLATE, README_TEMPLATE,
};
