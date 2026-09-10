// tool/i18n/en-gates.mjs — what the program says about CATALOGUE ENTRIES: installing, the
// blank, the ratchet, matching by intent, diagnosing a miss, proving, probing, the badge.
//
// Split out on 2026-09-09, when the `probe` strings pushed the file past our own 500-line
// limit. Split by meaning, not in half — that is what our own `file-size-limit` demands.
export const enGates = {
  add: {
    noSuchGate: (slug, cmd) => `No such gate: ${slug}\nThe applicable ones — ${cmd}`,
    toolMissing: (slug, missing) =>
      `Entry ${slug} needs ${missing.join(" and ")}, which is not on this machine.\n  fix: install ${missing.join(" and ")} and try again — this entry delegates to a ready-made tool by design and has no check of its own.`,
    noRecipe: (slug, stack, missing) =>
      `Entry ${slug} has no command for ${stack} and no portable one.` +
      (Array.isArray(missing) && missing.length
        ? `\n  fix: install ${missing.join(" or ")} and try again — this entry delegates to a ready-made tool by design and has no check of its own.`
        : `\n  fix: add a recipe for your stack to this entry's gate.yml, or pick another entry.`),
    thisStack: "this stack",
    needName: (cmd, doctor) => `Name the gate: ${cmd}. The list — ${doctor}`,
    noManifest: (cmd) => `No .aqk.yml — run ${cmd} first`,
    notApplicable: (why) => `This gate does not apply to the repository: ${why}`,
    installAnyway: "Installing anyway — your call, but it has nothing to guard here.",
    copied: (n) => `${n} files: the check and its samples`,
    declared: (cmd) => `gate declared: ${cmd}`,
    notDeclared: (why, slug, cmd) => `untouched (${why}). Add it yourself: ${slug}: "${cmd}"`,
    nextTitle: "Next:",
    next1: "Check that it goes red and stays quiet where it should:",
    expectFail: "→ a failure is expected",
    expectSilence: "→ silence is expected",
    next2: "Put the command into your commit hook and your pipeline.",
    next2Why: "A gate nobody runs is not a gate.",
    next3: (cmd) => `Run everything declared: ${cmd}`,
  },

  gnew: {
    needName: (cmd) => `Name it: ${cmd}`,
    badName: (slug) => `The name "${slug}" will not do: lowercase latin with dashes, e.g. secrets-not-in-code.\nThe name is read in other people's projects — it is part of a shared vocabulary.`,
    looksExisting: (slug) => `Looks like this already exists: ${slug}`,
    recipeNotGate: "A recipe for another stack is a line in the recipes of an existing entry.",
    forceHint: (cmd) => `Create a new one anyway: ${cmd}`,
    exists: (path) => `${path} already exists.`,
    nextTitle: "Next, in order:",
    n1: "Check whether an off-the-shelf rule exists",
    n1Where: "in ruff, eslint, semgrep.",
    n1Why: "Off-the-shelf is more precise, better documented and maintained without you. Your own check is the fallback.",
    n2: "Add the samples.",
    n2Red: "— code the check must fire on.",
    n2Green: "— the same code, done right.",
    n2Why: "The green one matters more: it catches a check that goes red on correct code.",
    n3: "Write the check",
    n3Where: "in check.sh. The failure text must say what exactly to do.",
    n4: "Fill in gate.yml:",
    n4What: "the intent, the trigger, the failure it proved itself on.",
    n5: "Run it:",
    n5Why: "The arbiter must go red on red/ and stay quiet on green/. It did not — it is not an entry.",
  },

  ratchet: {
    needName: (cmd) => `Name the gate: ${cmd}. It must already be declared in .aqk.yml`,
    noManifest: (cmd) => `No .aqk.yml — run ${cmd} first`,
    notDeclared: (slug, cmd) => `Gate "${slug}" is not declared in .aqk.yml. First: ${cmd}`,
    already: (slug) => `Gate "${slug}" already has a ratchet.`,
    notRunnable: (slug, cmd) =>
      `Gate "${slug}" does not run: ${cmd}\n` +
      `You cannot capture debt from a guard that does not exist — its own error messages\n` +
      `would land in the registry and become a permission. Fix the command first.`,
    registryHead: (slug, stamp) =>
      `# Debt registry: ${slug}\n` +
      `# Captured ${stamp}. This list may ONLY get shorter.\n` +
      `# A new violation turns the gate red; a fixed one is struck out automatically.\n` +
      `#\n` +
      `# Debt with no goal and no deadline never ends. The goal is how many violations count as\n` +
      `# paid off; on reaching it the ratchet tells you to remove the wrapper. The deadline is\n` +
      `# optional, but if set, debt still open past that date turns the gate red — a deadline\n` +
      `# without a consequence is not a deadline.\n` +
      `# aqk-goal: 0\n` +
      `# aqk-deadline:\n`,
    recorded: (n) => `${n} violations recorded as debt`,
    libCopied: "wrapper copied into the project",
    wrapped: "command wrapped in the ratchet",
    changesTitle: "What this changes:",
    fromToday: "from the day it is installed",
    changes1: (fromToday) => `The rule applies ${fromToday}. The old code stays untouched, but a new`,
    changes2: "violation of the same class will not get through.",
    test1: 'The test for a ratchet rather than an advisor: "can new code add a violation',
    test2: 'and still pass?" If it can, there is no gate.',
    run: (cmd) => `Run it: ${cmd}`,
  },

  find: {
    needQuery: (cmd) => `Describe the intent in words: ${cmd}`,
    example: 'find "debug printing reaches production"',
    exists: "This already exists — no new entry needed:",
    match: (pct) => `${pct}% match`,
    recipes: (langs) => `recipes: ${langs}portable`,
    existsWhy1: "If you have a recipe for another stack, that is a line in the recipes of the",
    existsWhy2: "existing entry, not a new gate. One intent, many possible executors.",
    near: "No exact match, but these are close:",
    nearWhy: "Read their README. If the intent is the same — extend it, do not start a new one.",
    none: "No such intent in the catalogue.",
    journal: "The journal has a bruise on this topic:",
    journalWhy: "A recorded bruise means the proof for a new entry already exists.",
    howTitle: "How to add your own gate:",
    how1: "Name the failure.",
    how1What: "What concrete defect it caught in a live project, and what that cost.",
    how1Why: '"It is a good practice" is not accepted: that is how a catalogue collects hundreds of entries and dies.',
    how2: "Create the folder",
    how2What: "— gate.yml, red/, green/, README.md.",
    how2Why: "The full entry format is in kit/gates/README.md",
    how3: "Check it by machine:",
    how3Why: "The arbiter must go red on red/ and stay quiet on green/. It did not — it is not an entry.",
    how4: "Send it as a change",
    how4What: "to the kit repository.",
  },

  why: {
    needQuery: (cmd) => `Describe what slipped through: ${cmd}`,
    example: 'why "a file grew to nine thousand lines"',
    ciAtOnce: "all at once: doctor --run",
    ciOwnStep: "as its own step",
    unsure: "No confident match. These entries look close:",
    unsureByName: (cmd) => `Name the entry directly: ${cmd}`,
    unsureNone: (cmd) => `None of them fits — then there was no guard: ${cmd}`,
    decideTitle: "The rest is your call:",
    decideQ: "is this specific to you, or a general case?",
    decideWhy: "General goes into the catalogue and reaches everyone. Specific stays with you.",
    decideNote: (cmd) => `Either way, the lesson goes into the shared journal: ${cmd}`,
    fix: "Fix it like this:",
    noGuard: "There was no guard.",
    noGuardWhy: "No entry in the catalogue carries this intent.",
    noGuardFix: (cmd) => `create an entry — ${cmd}`,
    noGuardHint: "Take the red sample straight from this failure: it already happened, nothing to invent.",
    closest: (slug, pct) => `Closest catalogue entry: ${slug}  ${pct}% match`,
    notInstalled: "The guard exists in the catalogue but is not installed in this project.",
    notInstalledHint1: "It will go red on old code — that is normal: the old is covered by a ratchet,",
    notInstalledHint2: (cmd) => `the new is caught from day one. ${cmd}`,
    declaredAs: (cmd) => `Declared as: ${cmd}`,
    notRunning: "The guard is declared but does not run.",
    notRunningWhy: "The worst case: silence reads as success.",
    notRunningFix: "the path or the program in the command does not exist — check them.",
    notRunningHint: 'A missing signal is indistinguishable from success, so this is not "a small config detail".',
    bypassed: "The guard exists and catches this failure — so it was bypassed.",
    noCiFix: "there is no pipeline. A check only a human runs",
    noCiHint: 'works right up until the first "forgot".',
    notInCiFix: "a pipeline exists, but this gate does not run in it.",
    notInCiHint: (cmd) => `The cheapest way is one step: ${cmd} — it runs everything declared.`,
    inCiFix: (how) => `the pipeline does run it (${how}) — so a red run`,
    inCiHint1: "was skipped or overridden. Move the rule out of prose and into mechanics:",
    inCiHint2: "a blocking step, not an optional one; no merging while red.",
    blind: "The guard exists, is installed and runs — but does not see this failure.",
    blindFix: (dir) => `put a piece of the broken code into ${dir}`,
    blindHint1: "and drive the check to red on it. The order is the reverse of the habit: the sample",
    blindHint2: "first, the fix second — otherwise it is unclear what exactly got fixed.",
    blindCheck: "Verify after the fix: bash tool/selfcheck/gates.sh",
  },

  init: {
    noDocs: (dir) => `Guides not found: ${dir}\nLooks like the package is not fully installed.`,
    docsRu:
      "the guides in .aqk/docs/ are in Russian — a deliberate decision, not a broken install.\n  The rules in .aqk/rules/ are in English; the guides are prose an agent may ignore anyway,\n  and what a machine holds lives in .aqk.yml and the gates. Translation waits for someone who needs it.",
    created: (n) => `created (${n}):`,
    andMore: (n) => `… and ${n} more`,
    kept: (n) => `already there, left untouched (${n}):`,
    overwrite: (cmd) => `overwrite: ${cmd}`,
    nextTitle: "What to do next, in order:",
    n1a: "Open",
    n1b: 'and fill in the "Commands" section. A command you cannot',
    n1c: "copy and run is not a command, it is a wish.",
    n2a: "Read",
    n2b: "— it is the minimum a project needs,",
    n2c: "independent of language. Go through it top to bottom and mark what is missing.",
    n3a: "Fill in",
    n3b: "— gates, samples, journal. Your AQK level",
    n3c: (cmd) => `is computed from it: ${cmd}.`,
    n4a: "Climb the levels",
    n4b: "one at a time",
    n4c: ". A gate guards an artefact that exists:",
    n4d: "a check for code that is not written yet is a dead rule.",
    burned: (cmd) => `Got burned by something — write it down: ${cmd}`,
    hookHint: (cmd) => `Claude Code: ${cmd} — the project state will reach the agent's context\n  by itself, before its first action. Other agents have no hook, and that is not an omission.`,
  },

  feedback: {
    title: "If this was useful:",
    star: (url) => `Star it — ${url}`,
    issue: "Found a bug or it did not fit — open an issue; both are the most useful feedback there is.",
    notRemembered: "could not remember this (home is not writable) — the message will appear again",
    once: "This message is shown once: it will not appear again on this machine.",
  },

  note: {
    journalTitle: "Bruise journal",
    needTitle: (cmd) => `A title is required: ${cmd}`,
    noJournal: (url) => `No journal clone found.\nDo this once:\n  git clone ${url}.git ~/projects/aqk\nor point at it: export AQK_HOME=/path/to/aqk`,
    journalMissing: (path) => `Journal not found: ${path}`,
    emptyBody: `The entry body is empty. Pass it on standard input, for example:\n\n  aqk note "title" <<'EOF'\n  **What happened.** ...\n  **What it cost.** ...\n  **Conclusion.** 🔧 ...\n  EOF`,
    noOutcome:
      "The entry carries no decision mark. A lesson without a conclusion is a story, not a lesson.\n" +
      "Add one of the three:\n" +
      "  ✅ **Became a gate:** <catalogue entry name>\n" +
      "  🔧 **Became a change to the tooling:** <what exactly changed>\n" +
      "  👤 **Will not become a gate:** <why>",
    unknownProject: "unknown",
    projectField: "Project",
    pushed: (title) => `Recorded and pushed: ${title}`,
    localOnly: (cmd) => `Recorded locally, the push failed. Push it: ${cmd}`,
  },

  blob: {
    noDocs: (dir) => `Guides not found: ${dir}`,
    header: (stamp) =>
      `<!-- ASSEMBLED BY aqk blob ${stamp} from kit/docs. Do not edit by hand:\n` +
      `     the next assembly overwrites it. The source is the separate files. -->\n\n` +
      `# AQK — the guides in one file\n`,
    source: (path) => `source: ${path}`,
    done: (n, kb) => `GOD_AI.md — ${n} files, ${kb} KB`,
    rebuilt: "Reassembled by every run. Edit the originals in kit/docs.",
  },

  start: {
    noRecipeHere: "needs a tool that is not on this machine",
    initFailed: (cmd) => `Could not lay out the kit. Start with ${cmd}`,
    tooManyFiles: (n) => `This repository already has ${n} code files — that is a different scenario.`,
    useDoctor: (cmd) => `${cmd} will inspect what is here and split the entries into three lists:`,
    threeLists: "held by a machine · applicable but not installed · not applicable, and why.",
    anyway: (cmd) => `Install the day-zero guards anyway: ${cmd}`,
    expectRed: "Expect red: a guard installed onto living code goes red across all of it.",
    expectRedFix: (cmd) => `That is cured by a ratchet — ${cmd} — not by switching it off.`,
    installed: (n) => `Day-zero guards installed: ${n}`,
    noDebt1: "There is no debt: on an empty project they have nothing to let through. The same guard,",
    noDebt2: "installed six months later, would go red on all the old code — and be switched off.",
    allDeclared: "Every applicable entry is already declared.",
    notYet: "Not applicable yet:",
    notYetWhy: "Once the sign appears, the entry shows up on its own.",
    orderTitle: "The order people actually do this in:",
    o1: "The task, in words.",
    o1What: "What, and for whom, without a single technical term.",
    o1Why: "Until the task is described in words, any architecture protects who knows what.",
    o2: "Constraints.",
    o2What: "Deadlines, money, load, what you are not allowed to use.",
    o2Why: "Constraints pick the solution far more often than taste does: without them, taste picks.",
    o3: "Sizing.",
    o3What: "How much data, how many requests, how many people — in numbers, at least an order of magnitude.",
    o3Why: 'A number separates "we need a queue" from "a table is enough". Without it, people argue in words.',
    o4: "Architecture.",
    o4What: "And only now — out of the first three, not before them.",
    softNote1: "The program does not check this order: it lives in .aqk/docs/, and an agent can",
    softNote2: "ignore it. The machine holds something else — the guards above. The difference between",
    softNote3: "soft and hard is exactly this: text is asked for, a command is executed.",
    next: "Next:",
    nextWhy: "— run everything that is declared",
  },


  probe: {
    shallow: "shallow clone (git clone --depth) — there is no history here, and that is NOT \"no fixes\". Full clone: git fetch --unshallow",
    badEvery: (v) => `the manifest says probe: "${v}", which is not a commit count. The probe does NOT run: silently using the default would mean doing something other than what is written.`,
    autoFirst: "no coverage probe has ever run here — running it myself. Turn off: AQK_PROBE=0",
    auto: (n) => `${n} commits since the last probe — running it myself. Turn off: AQK_PROBE=0`,
    title: "aqk probe — what the declared checks cannot see",
    method: (files, entries, gates) =>
      `method: a red sample from a catalogue entry is planted into a COPY of the project, then the ` +
      `DECLARED gates are run there — the command is used as written, nothing is substituted into it. ` +
      `Files: ${files}, applicable entries: ${entries}, gates green on a clean checkout: ${gates}. ` +
      `The working tree is not touched.`,
    fixes: (n) => `fixes in history: ${n}`,
    caught: (names) => `caught by: ${names}`,
    blind: "NOTHING CATCHES IT",
    unknown: "nothing to check with — the gate did not run (delegated tool missing)",
    install: (cmd) => `close it: ${cmd}`,
    noSampleFor: (ext) => `the catalogue has no red sample for "${ext}" — nothing to check with`,
    noGates: (cmd) => `no gates declared — nothing to probe with. First: ${cmd}`,
    noSandbox: "could not build a sandbox: `git archive HEAD` failed. The probe needs a copy of the tracked files to plant a sample into — it never touches the working tree.",
    noBaseline: (red, broke) =>
      `nothing to judge by: on a CLEAN checkout ${red.length ? `these gates are ALREADY red (${red.join(", ")})` : ""}${red.length && broke.length ? " and " : ""}${broke.length ? `these failed to run (${broke.join(", ")})` : ""}. A gate that is red before the sample is planted says nothing about the sample. Get the pipeline green first, then repeat.`,
    tooSlow: (names) => `not probed with (too slow to run on every planting): ${names.join(", ")}. If a class below is caught by nobody, one of these may still catch it — run them by hand.`,
    allSlow: (names) => `every gate that is green on a clean checkout is too slow to probe with: ${names.join(", ")}. Probing would re-run them for every planting. Declare a fast gate, or run these by hand.`,
    noGit: "not a git repository — there is no fix history to read",
    noFixes: "no fix commits found: the subject starts with fix / bugfix / hotfix",
    summaryBlind: (n, probes) =>
      `classes caught by nobody: ${n}` +
      (probes ? ` (over ${probes} plantings — one class repeated across several hot files is still ONE class)` : "") +
      `. This is not a judgement of the code: these are the places ` +
      `people come back to with a fix, and defects none of your checks would see there.`,
    summaryClean: "in the places probed, every applicable class is caught by something.",
    summaryPartial: (caught, unknown, unprobed) =>
      `caught: ${caught}. Could NOT be checked: ${unknown} (the tool is missing, not the protection). Not probed at all: ${unprobed} file(s) — the catalogue has no red sample for their type. "Checked and clean", "not checked" and "not looked at" are three different facts and are not merged here.`,
    summaryNothingRan: (n) =>
      `NOTHING was checked: all ${n} probe(s) failed to run — the delegated tools are missing. This is not a clean result, it is the absence of a result. Install the tools, then repeat.`,
    summaryNothingProbed: (unprobed) =>
      `not a single probe was made${unprobed ? ` — ${unprobed} hot file(s) have no red sample for their type in the catalogue` : ""}. Nothing is known about coverage: this is the absence of a measurement, not a clean result.`,
  },
  prove: {
    title: "aqk prove — proving the gates",
    running: "proving the gates against their samples…",
    proven: (n) => `proven: ${n}`,
    broken: (n) => `do not catch: ${n}`,
    unprovable: (n) => `nothing to prove with: ${n}`,
    okRed: "red on the red sample, silent on the green one",
    redPassed: "stayed silent on the RED sample — the gate does not catch the defect",
    greenFailed: "went red on the GREEN sample — the gate complains about working code",
    empty: "the command is empty — a declaration without a command protects nothing",
    noSamples: "no samples — nothing to prove with",
    noTarget: "no place to substitute the sample directory — the command was written by hand",
    otherRecipe: (lang) => `the samples are written for the "${lang}" recipe, another one is installed — nothing to prove with`,
    noGates: "no gates declared — nothing to prove",
    needsProgram: (progs) => `NOT CHECKED here — needs "${progs}"`,
    noSamplesDir: "the samples field in .aqk.yml is empty — nowhere to look for samples",
    nothingProven:
      "not a single gate is proven. A level above AQK-1 would mean trust in the author, not a fact:\n  a project whose gate is `true` would pass it exactly like a project with real protection.",
    fix: (cmd) => `fix: install a catalogue entry together with its samples — ${cmd}`,
    heading: "Proving the gates",
  },
  badge: {
    noManifest: (cmd) => `No .aqk.yml — there is no level yet. Start with ${cmd}`,
    notReached: (cmd) => `AQK-0 is not reached — there is nothing to put on a badge. What is missing: ${cmd}`,
    redGates: (n, names) =>
      `Red gates: ${n} (${names}). A badge issued over a red gate is the author's claim, not a machine's fact.`,
    hint: (n) => `Proven by a run. Green gates: ${n}. Paste the line above into your README.`,
    keepTrue: (cmd) => `To keep the badge from turning into a lie, put this in your pipeline: ${cmd}`,
    checkMissing: (places) => `No AQK badge in any of: ${places}. This is the line to paste:`,
    checkMismatch: (where, level) => `The badge lies: ${where}, while the run says AQK-${level}. Replace it with:`,
    checkOk: (level, where) => `Badge matches the run: AQK-${level} — ${where}`,
  },
};
