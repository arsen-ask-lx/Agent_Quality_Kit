// tool/i18n/en-docs.mjs — text that ends up IN A FILE, not in the terminal.
//
// WHY SEPARATE. The string catalogue outgrew its own 500-line limit — caught by our own
// file-size-limit gate. The seam follows meaning rather than the midpoint: here is what the
// program WRITES (comments in .aqk.yml, level names, the report form), and in en.mjs what it
// SAYS. These texts live differently: the first is read months later in someone's repository,
// the second for one second in a terminal.

const enDocs = {
  // THE STATE BLOCK — the one text of ours whose reader is a machine, not a person.
  // It goes into the agent's context via a SessionStart hook, so it is written as claims of
  // fact: no politeness, no preamble, every line either a fact or an honest "unknown".
  context: {
    title: "AQK — the state of this repository right now. Only what a machine computed; where it\ndoes not know, it says \"unknown\" — which is not the same as \"fine\".",
    level: (r, top, missing) =>
      `Level: AQK-${r} of ${top}.` + (missing ? ` AQK-${r + 1} is missing: ${missing}.` : ""),
    levelUnknown: "Level: not computed — there is no .aqk.yml here. The standard is not set up.",
    rules: (total, machine, human) =>
      `Rules in the entry point: ${total}. Held by a machine ${machine}, by a human ${human}.`,
    rulesNobody: "A rule held by a human is held by nobody: no machine checks it.",
    runNone:
      "No run has been made — which checks are red is UNKNOWN. This is not \"clean\": `aqk doctor --run`.",
    runStale: (when) =>
      `The last run ${when} is OLDER than the last commit — it describes different code.`,
    runClean: (when) => `Last run ${when} — nothing red.`,
    runRed: (when, names) => `Last run ${when} — RED: ${names}.`,
    andMore: (n) => `and ${n} more`,
    skipped: (n) => `Not run: ${n} — the tool is absent on this machine, their state is unknown.`,
    ratchets: (list) => `Ratchets: ${list}. The list may only get shorter, never longer.`,
    where: (entry) => `The rulebook: ${entry}. What proves a diff: \`aqk report --since main\`.`,
    hookAlready: (p) => `the hook is already in ${p} — changing nothing.`,
    hookAdded: (p) => `SessionStart hook appended to ${p}:`,
    hookCreated: (p) => `created ${p} with a SessionStart hook:`,
    hookBadJson: (p) => `${p} does not parse as JSON — leaving it alone. Fix it and retry.`,
    hookWhat:
      "the project state now reaches the agent's context before its first action, not at its discretion.",
  },
  // Форма отчёта переехала сюда из терминального каталога 2026-09-08: это текст, который
  // программа ПИШЕТ в .aqk/report.md, а не говорит в терминал. Повод — тот же гейт
  // file-size-limit, что развёл эти файлы в первый раз: терминальный каталог снова перерос
  // 500 строк. Шов по смыслу, а не пополам.
  report2: {
    evidenceNamed: (who) => `named by: ${who}`,
    evidenceSilent: (n) => `${n} check${n === 1 ? "" : "s"} walked past it and said nothing`,
    evidenceTitle: "What proves this diff",
    evidenceUncovered: "no check named this file",
    evidenceBase: "base of comparison",
    evidenceHash: "evidence fingerprint",
    evidenceBadRef: (r) => `ref "${r}" could not be resolved — coverage not computed`,
    evidenceNoFiles: (r) => `no code files in the diff against "${r}" — nothing to prove`,
    evidenceWarn:
      "◻️ means a check walked the directory and said nothing. \"Scanned and clean\" and " +
      "\"never looked\" are indistinguishable from the output, and neither may be passed off " +
      "as the other. " +
      "The fingerprint covers the base, the set of commands and the contents of the files. " +
      "Change any of them and this report is stale, so \"ran it, then edited three more files\" " +
      "stops being indistinguishable from \"ran it\". Mechanism taken from donecheck (MIT).",
    title: "AQK report",
    noManifest: (cmd) => `No .aqk.yml — nothing to report on. Start with ${cmd}`,
    level: "Level",
    holdsTitle: "What a machine holds (from a run, not from the manifest)",
    nothingRuns: "⬜ no gate is declared",
    native: (prog) => `native recipe: ${prog}`,
    portable: "portable check",
    weakerTitle: "Weaker than it could be",
    weaker: (progs) => `${progs} is available on this system, but the gate uses the portable check — it catches less`,
    missingTitle: "What is missing",
    nothingMissing: "✅ every applicable entry is installed",
    needsTool: (prog) => `needs ${prog} — not on this system`,
    notInstalled: "applicable, but not installed",
    hiddenTitle: "Not applicable to this repository",
    readTitle: "What the kit told you to read",
    readWarn:
      "The mark only means the file is on disk. Whether it was read, the machine does not know " +
      "and does not pretend to: that is answered by whoever is reporting.",
    ignoreTitle: "What .aqkignore hides",
    ignoreNone: "no .aqkignore file — nothing is hidden",
    ignoreWarn:
      "Hiding things silently is the same class as a silent gate: the gates do not look at these " +
      "paths at all. A line here means there is no protection there, and will not be.",
    whyTitle: "Why this matters — briefly",
    whyNothing: "nothing to add: everything applicable is in place",
    saved: (path) => `Saved: ${path}`,
    docs: {
      baseline: "the minimum a project needs, independent of language",
      readyMade: "the map of off-the-shelf rules: look for a ready one before writing your own",
      rulesGeneral: "general working rules",
      rulesTesting: "rules about tests",
      rulesSecurity: "rules about security",
    },
  },
  manifestDoc: {
    head: [
      "# .aqk.yml — the Agent Quality Kit manifest",
      "# What this is: a machine-readable description of how agents live in this repository.",
      "# `aqk doctor` computes the compliance level. An empty field = the level is not reached,",
      "# and that is honest: filling it with placeholders is pointless, files are checked, not words.",
    ],
    entry: "# AQK-0 — what the agent reads first.",
    rules: "# AQK-1 — where the standards are and which checks are mandatory. docs — where the\n# guides are: doctor reads both, so the kit may live anywhere you like.",
    gates: [
      "  # name: a command returning 0 or non-zero. An empty declaration protects nothing and is",
      '  # rejected by the "a declared gate runs" check — hence examples here, not placeholders.',
      '  #   lint: "ruff check ."',
      '  #   test: "pytest -q"',
      "  # To install a ready entry from the catalogue together with its samples: aqk add <name>",
    ],
    samples: [
      "# AQK-2 — what proves the gates work, and where the debt registries are.",
      "# samples: the directory with red and green samples (a gate must go red on the first and",
      "# stay quiet on the second). ratchets: lists of known violations that may only get",
      "# shorter.",
    ],
    lessons: "# AQK-3 — where lessons accumulate. A path or an address.",
    advisory: [
      "# Advisory gates: they show findings but do not fail the run. The third way to introduce",
      "# a rule, next to the ratchet and the big clean-up. The list is named on every run:",
      "# an advisory gate everyone forgot about is a switched-off check.",
      "# advisory:",
      "#   - complexity-limit",
    ],
  },
  levels: [
    {
      title: "a manifest and an entry point",
      need: "create .aqk.yml and point entry at the file an agent reads first (AGENTS.md)",
      gives: "any tool understands what to read in this repository",
    },
    {
      title: "rules and working gates",
      need: "set rules (the standards directory) and fill at least one gate in gates with a real command",
      gives: "checks are declared as commands, not described in prose",
    },
    {
      title: "gates are proven, debt is under a ratchet",
      need: "set samples (red and green gate samples) and ratchets (debt registries)",
      gives: "the gate has proven it catches defects and stays quiet on correct code",
    },
    {
      title: "lessons come back into the work",
      need: "set lessons — the path or address of a journal where every incident yields a conclusion",
      gives: "the project learns: the same bruise is not collected twice",
    },
  ],
  report: {
    title: "aqk doctor --run",
    version: "version",
    level: "level",
    summary: (ok, all) => `total: ${ok} of ${all} green`,
  },
};
export { enDocs };
