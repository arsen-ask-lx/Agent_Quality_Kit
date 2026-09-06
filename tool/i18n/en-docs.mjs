// tool/i18n/en-docs.mjs — text that ends up IN A FILE, not in the terminal.
//
// WHY SEPARATE. The string catalogue outgrew its own 500-line limit — caught by our own
// file-size-limit gate. The seam follows meaning rather than the midpoint: here is what the
// program WRITES (comments in .aqk.yml, level names, the report form), and in en.mjs what it
// SAYS. These texts live differently: the first is read months later in someone's repository,
// the second for one second in a terminal.

const enDocs = {
  manifestDoc: {
    head: [
      "# .aqk.yml — the Agent Quality Kit manifest",
      "# What this is: a machine-readable description of how agents live in this repository.",
      "# `aqk doctor` computes the compliance level. An empty field = the level is not reached,",
      "# and that is honest: filling it with placeholders is pointless, files are checked, not words.",
    ],
    entry: "# AQK-0 — what the agent reads first.",
    rules: "# AQK-1 — where the standards are and which checks are mandatory.",
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
