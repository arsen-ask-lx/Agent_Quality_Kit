# General standards

## Principles

- **Simple beats clever.** Every extra moving part multiplies the unreliability of the chain.
- **Fail fast.** No data means a clear error, not a placeholder.
- **No silent failures.** An error is either handled and logged, or re-raised.
- **Explicit boundaries.** At a seam, validate the input rather than trust it.

## Doubt is a reason to look outward

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

## Forbidden in finished code

- debug printing;
- "do it later" markers with no task filed;
- made-up data standing in for real data;
- catching an error without logging it;
- a "temporary workaround" with no written plan for removing it.

## Sizes are a gate, not a wish

- production source file over 500 lines — split it;
- UI component over 300 lines — split it;
- test file over 800 lines — split it by subject.

The numbers are arguable; what matters is that **a limit exists and a machine checks it**. An
agent loses its bearings in large files and starts rewriting instead of editing.

## A new dependency is a separate decision

Check the package's age, adoption and liveness, name it to a human, get agreement. Roughly one
in five libraries a model suggests **does not exist** — and the names of such packages are
registered in advance by attackers.

## Parse input at the boundary

Data from outside is parsed in one place — a function or a schema — not as a raw dictionary
passed around the codebase. Otherwise validation spreads out and every handler trusts input in
its own way.

## Commits and changesets

A type at the start of the message (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`). One
changeset, one task: a mixed changeset can neither be reviewed nor rolled back.

## Explain the diff before merging

"An agent wrote it" is not an answer. Before merging, the agent explains the control flow, the
edge cases and the failure paths. A diff beyond roughly 400 lines is a heightened-risk event:
split it, or explain it in parts.

**WHY.** Code now appears faster than a human can understand it. Gates catch mechanics; they do
not catch "approved a design nobody understood".

## Done

Linter, types and tests are green. One task, one changeset. Touched storage — the migration ships
in the same changeset.
