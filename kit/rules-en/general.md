# General standards

> Every rule carries a mark `<!-- aqk: … -->` naming what guards it: a catalog check or a human.
> `aqk doctor` names the checks promised here that the project lacks, with the command to install them.

## Principles

- **Simple beats clever.** Every extra moving part multiplies the unreliability of the chain.  <!-- aqk: human -->
- **Fail fast.** No data means a clear error, not a placeholder.  <!-- aqk: human -->
- **No silent failures.** An error is either handled and logged, or re-raised.  <!-- aqk: swallowed-error -->
- **Explicit boundaries.** At a seam, validate the input rather than trust it.  <!-- aqk: human -->

## Doubt is a reason to look outward  <!-- aqk: human -->

An agent answers with the same confidence whether it knows or is reconstructing from memory.
From the outside those are indistinguishable; their cost is not. So four situations must end in
a search rather than a guess:

| Situation | What happens without a search |
|---|---|
| you do not know how it is done **now** | you write what was current at training time |
| you do not know whether **something already exists** | you build your own, and maintain it forever |
| you are about to write a common thing | half of it is already written and battle-tested |
| you remember the answer, but **from training, not from checking** | the remembered API may have been renamed or removed |

The rule is cheaper than it looks: a search costs a minute, a wrong guess costs an edit, a
review, and a bruise.

**"I will ask the owner" is not a substitute for searching.** The temptation is understandable:
the owner is right there and will answer faster. But most of the time they do not know either —
that is why they brought in an agent. Two people who both do not know how it is done settle on a
local workaround, and that is worse than a lone guess: it looks like an agreed decision. Ask the
human what is not available outside — what they want, what matters more to them. How it is done,
you ask the world.

**If there is no network, say so out loud.** "Not verified, this is a guess" is a legitimate
answer. A guess presented as knowledge is not.

## Forbidden in finished code

- debug printing;  <!-- aqk: no-print-in-prod -->
- "do it later" markers with no task filed;  <!-- aqk: todo-without-task -->
- made-up data standing in for real data;  <!-- aqk: human -->
- catching an error without logging it;  <!-- aqk: swallowed-error -->
- a "temporary workaround" with no written plan for removing it.  <!-- aqk: human -->

## Sizes are a gate, not a wish

- production source file over 500 lines — split it;  <!-- aqk: file-size-limit -->
- UI component over 300 lines — split it;  <!-- aqk: file-size-limit -->
- test file over 800 lines — split it by subject.  <!-- aqk: file-size-limit -->

The numbers are arguable; what matters is that **a limit exists and a machine checks it**. An
agent loses its bearings in large files and starts rewriting instead of editing.

## A new dependency is a separate decision  <!-- aqk: human -->

Check the package's age, adoption and liveness, name it to a human, get agreement. Roughly one
in five libraries a model suggests **does not exist** — and the names of such packages are
registered in advance by attackers.

## Parse input at the boundary  <!-- aqk: human -->

Data from outside is parsed in one place — a function or a schema — not as a raw dictionary
passed around the codebase. Otherwise validation spreads out and every handler trusts input in
its own way.

## Commits and changesets  <!-- aqk: human -->

A type at the start of the message (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`). One
changeset, one task: a mixed changeset can neither be reviewed nor rolled back.

In a repository where several sessions work, a commit takes an **explicit list of paths**
(`git commit -- <paths>`), never "whatever is staged": the index is shared, and someone else's
prepared work would ride along in your commit. A new file is `git add`-ed by name first.

## Explain the diff before merging  <!-- aqk: human -->

"An agent wrote it" is not an answer. Before merging, the agent explains the control flow, the
edge cases and the failure paths. A diff beyond roughly 400 lines is a heightened-risk event:
split it, or explain it in parts.

**WHY.** Code now appears faster than a human can understand it. Gates catch mechanics; they do
not catch "approved a design nobody understood".

## A check must be able to say "no"  <!-- aqk: human -->

A one-off check the agent uses to confirm "done" (a search in output, a comparison, a measurement)
also looks for a control object that is CERTAINLY there or CERTAINLY absent, and prints both
answers. A pattern that never matches anything answers "verified" to everything; being absent
from a report does not mean "verified".

## Done  <!-- aqk: human -->

Linter, types and tests are green. One task, one changeset. Touched storage — the migration ships
in the same changeset.
