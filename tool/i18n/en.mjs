// tool/i18n/en.mjs — английский каталог строк вывода.
//
// Правка здесь обязана иметь пару в ru.mjs с тем же ключом: расхождение ловит модульная
// проверка «оба каталога несут одни и те же ключи».

import { enDocs } from "./en-docs.mjs";

import { templates } from "./templates-en.mjs";

import { enGates } from "./en-gates.mjs";

export const en = {
  learn: {
    title: "Said out loud, never written down",
    noLogs: (p) => `no logs for this project: ${p}\n  The command reads Claude Code transcripts on this machine. Empty means nobody worked here.`,
    counted: (s, typed, said, fresh) =>
      `sessions: ${s} · typed by a human: ${typed} · looks like an instruction: ${said} · not in the entry point: ${fresh}`,
    nothing: "everything that looks like a rule is already in the entry point",
    andMore: (n) => `… and ${n} more`,
    warn:
      "These are CANDIDATES, not findings: measured on 1619 messages, the markers returned 79, and " +
      "about half of those are real rules. The human decides. Nothing was written to disk — the " +
      "command reads transcripts and prints to the terminal only.",
  },
  ...enDocs,
  templates,
  help: {
    tagline: "tooling for building software with agents",
    name: "<name>",
    init: "lay the rules and guides into the current project",
    initForce: "overwrite files that already exist",
    start: "no code yet: day-zero guards and the order of work",
    probe: "what the declared checks cannot see: plant a defect into files history calls hot",
    prove: "prove the gates catch a defect: each against its own red and green sample",
    doctor: "check what is laid out and what is missing",
    doctorRun: "and also run the declared gates",
    doctorSince: "the same, but show only what the diff against a ref introduced",
    add: "install a gate from the catalogue into the project",
    find: "is there already such a gate — matched by intent",
    why: "a bug slipped through — why did no guard catch it",
    ratchet: "ratchet: existing violations become debt, new ones are blocked",
    new: "scaffold your own gate for the catalogue",
    note: "record a lesson in the shared bruise journal",
    blob: "assemble the guides into a single GOD_AI.md",
    learn: "rule candidates from local transcripts: said out loud, never written down",
    context: "the project state in one block — for an agent's context, not for reading",
    contextInstall: "the same in full — the map and the rulebook — installed as a hook",
    report: "the mandatory report form: what is in place, what is not, what was not read; --since <ref> adds what proves the diff",
    badge: "a level badge for your README — and a check that it does not lie",
    version: "the banner and the version number — same as --version and -v",
    noInstall: "Without installing:  npx agent-quality-kit init",
    language: "Output language: AQK_LANG=ru (or en), otherwise your system locale",
  },

  doctor: {
    baselineClash: (f) =>
      `"--baseline" is an inspection, not a run: it always exits 0, so together with "${f}" it\n` +
      "  gives you a pipeline that cannot go red.\n" +
      "  fix: split it in two — \"doctor --baseline\" and \"doctor --run --min 1\".",
    docsKit: "guides — the originals live here, not a copy",
    docs: "guides",
    rulesKit: "standards — the originals live here, not a copy",
    rules: "standards",
    agents: "entry point for agents",
    gitignore: "repository hygiene",
    git: "project under version control",

    emptyCommands: (n) => `AGENTS.md has ${n} unfilled commands.`,
    emptyCommandsWhy: "An agent cannot execute an empty line.",

    levelUnproven: (cmd) => `not proven: ${cmd}`,
    gatesDoNotCatch: (n, cmd) => `gates that do not catch a defect: ${n}. Details: ${cmd}`,
    levelHeading: "AQK compliance level",
    levelNone: "none",
    levelNotSet: "Level: the standard is not set up in this repository.",
    levelNotSetWhy: [
      "This is not a verdict on the project. The level measures how machine-readable",
      "your practice is, not how mature it is. Checks may exist and work — but until",
      "they are declared in .aqk.yml, no agent, no pipeline and no newcomer knows.",
    ],
    levelManifestNoZero: "Level: a manifest exists, but AQK-0 is not reached.",
    level: (n) => `Level: AQK-${n}.`,
    toReach: (n) => `To reach AQK-${n}:`,
    gives: (what) => `What it buys you: ${what}`,
    allDone: "All levels reached.",

    gatesHeading: "Gates",
    langs: "languages",
    langsUnknown: "not detected",
    files: "files",
    hasThings: "has",
    install: (cmd) => `install: ${cmd}`,
    notApplicable: (n) => `Not applicable to this repository (${n}):`,
    noBrowserServer:
      "this project has a UI, and the agent has no browser: it cannot look at its own change\n  and judges the work by what compiled. Those are different claims.",
    noBrowserServerHow: (l) => `add an MCP server — works with any agent: ${l}`,
    coveredBy: (n) => `held by another arbiter: ${n} — the portable entry is not needed`,
    coveredByGate: (g) => `held by "${g}", declared in the manifest`,
    coversUnknown: (l) => `covers names a gate absent from gates: ${l} — those entries are held by nothing`,
    coversUnproven: (e, g, codes) =>
      `claim unverified: "${e}" is declared held by gate "${g}", but neither its command nor the\n  linter config names rules ${codes} — the entry may be held by nothing`,
    coversUnprovenHow: (cmd) => `settle it: add those rules to the linter, or install the entry — ${cmd}`,
    totalCovered: (n) => `held by another arbiter ${n}`,
    total: "Total:",
    totalHeld: (n) => `held by a machine ${n}`,
    totalTodo: (n) => `applicable but not installed ${n}`,
    totalSkip: (n) => `hidden ${n}`,

    sinceHeading: (ref, n) => `narrowed to the diff against ${ref}: ${n} files touched`,
    sinceBadRef: (ref) => `cannot compare against "${ref}": no such ref, or this is not a git repository`,
    notScopable: "output carries no paths — cannot be narrowed by diff, left red",
    outsideDiff: (n) => `findings exist, but outside the diff (${n})`,
    advisoryQuiet: "(advisory — cannot fail the run)",
    advisoryMark: "advisory — shown, the run was not failed",
    advisorySummary: (names) =>
      `advisory and red: ${names.join(", ")}. These are switched-off checks: ` +
      `either fix them and drop them from advisory, or admit the rule does not exist.`,
    runHeading: "Running the declared gates",
    timeout: "did not finish within 5 minutes",
    exitCode: (code) => `exit ${code}`,
    moreLines: (n) => `… and ${n} more lines`,
    declaredNotRun: (n) => `${n} gates declared, but never run.`,
    declaredNotRunWhy: (cmd) => ` "declared" and "works" are different claims: ${cmd}`,

    manifestUnknown: (keys) =>
      `The manifest has fields the standard does not know: ${keys.join(", ")}. Looks like a typo — ` +
      `such a field is silently read as absent, and the verdict comes out wrong.`,
    manifestUnparsed: (n, t) => `manifest line ${n} was not parsed and HAS NO EFFECT: ${t}`,
    manifestUnparsedWhy:
      "field and gate names use latin letters, digits, dash and underscore. What is declared here\n  does not run at all — while looking as if it does.",
    manifestKnown: (keys) => `Manifest fields: ${keys.join(", ")}`,
    thresholdPass: (min) => `Threshold AQK-${min} passed.`,
    thresholdFail: (min, now) => `Threshold AQK-${min} NOT passed: currently AQK-${now}.`,
    thresholdGateFail: (min, now, names) =>
      `Threshold AQK-${min} passed (currently AQK-${now}), but a gate failed: ${names.join(", ")}.`,
  },

  baseline: {
    heading: "The minimum a project needs",
    intro: (checked, total) =>
      `a machine confirms ${checked} of ${total} points; the rest are for your eyes, in the guide`,
    eyes: (n, path) => `${n} points a machine cannot check — they live in ${path}`,
    caveat: "presence is what gets checked, not whether it works: \"a linter is configured\" and \"a linter catches things\" are different claims",
    by: (b) =>
      "proven by: " +
      ({ gate: `gate ${b.value}`, fact: `repository scan: ${b.value}`,
         manifest: `field ${b.value} in the manifest`, dep: `dependency ${b.value}`,
         file: b.value }[b.kind] || b.value),
    none: "no conventional marker — check by eye, it may be done another way",
    titles: {
      oneCommand: "one command brings the whole project up",
      lockfile: "exact versions pinned in a lockfile",
      sameEnv: "the environment is the same for everyone and in CI",
      formatter: "formatting is uniform and applied automatically",
      linter: "a linter is configured",
      types: "type checking exists",
      secretScan: "secret scanning",
      fileSize: "a file size limit",
      ownInvariants: "the project's own invariants",
      tests: "arbiters of correctness: tests exist",
      pipeline: "a pipeline exists",
      errorTracker: "errors are collected separately from logs",
      machineReadable: "the project is machine-readable",
      rulesInRepo: "rules live in the repository and are versioned",
    },
  },

  trigger: {
    noLangs: (langs) => `none of these languages: ${langs}`,
    tooFewFiles: (n) => `fewer than ${n} files — too early`,
    tooManyFiles: (n) => `more than ${n} files`,
    notSet: "no trigger declared",
    unknown: (key) => `the program cannot evaluate the condition "${key}"`,
    flags: {
      has_gates: ["no gates declared in the manifest", "gates are already declared"],
      has_ci: ["no pipeline in this repository", "a pipeline already exists"],
      has_db: ["no database in sight: no migrations, no sql", "a database exists"],
      has_docker: ["no Dockerfile or compose", "docker is already here"],
      has_deps: ["no dependency file in sight", "dependencies are declared"],
      has_tests: ["no tests in sight", "tests exist"],
      has_env: ["no environment file", "an environment file exists"],
      has_agent_config: ["the agent was never configured here", "agent settings exist"],
      has_agent_entry: ["no entry point for an agent here", "an entry point for an agent exists"],
      has_ui: ["no stylesheets or UI components in sight", "a UI exists: stylesheets or components"],
      has_mcp: ["no MCP tools are wired up for the agent here", "MCP servers are declared"],
    },
  },

  recipe: {
    skipped: (lang, prog) => `skipped the ${lang} recipe: "${prog}" is not installed`,
    none: "no recipe described",
  },

  // Entry maturity. Computed from the entry's proof; it cannot be declared — see
  // entryLifecycle in tool/lib/manifest.mjs.
  lifecycle: {
    stable: "proven by an incident from the journal",
    experimental: "proof is not from the journal — the entry is provisional",
    deprecated: "retired",
    unknownReplacement: (v) => `superseded_by: ${v} — no such entry in the catalogue`,
    noReplacement: "lifecycle: deprecated without superseded_by — no replacement is named",
    notDeclarable: (v) => `lifecycle: ${v} cannot be declared — maturity is computed from the proof`,
    unknown: (v) => `lifecycle: ${v} — no such state; only deprecated is declared`,
    installDeprecated: (slug, by) => `entry ${slug} is retired, ${by} replaces it`,
  },
  manifest: {
    noGatesBlock: "no gates: block in .aqk.yml",
    alreadyDeclared: "already declared",
  },

  ...enGates,
};
