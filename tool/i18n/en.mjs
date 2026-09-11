// tool/i18n/en.mjs — английский каталог строк вывода.
//
// Правка здесь обязана иметь пару в ru.mjs с тем же ключом: расхождение ловит модульная
// проверка «оба каталога несут одни и те же ключи».

import { enDocs } from "./en-docs.mjs";

import { templates } from "./templates-en.mjs";

const ago = (n) => (n === null || n === undefined ? "" : ` (${n} commit${n === 1 ? "" : "s"} ago)`);

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
    vitals: "is what the kit runs on wired up: gate tools, hooks, version freshness",
    prompt: "one task for the agent: what to fix, in order, and how to prove it is done",
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

    runtimeTracked: (f, cmd) => `${f} is tracked by git — every run rewrites it, and the tree always shows a modified file. Take it out: ${cmd}`,
    runtimeNotIgnored: (f, cmd) => `${f} is this machine's state, yet git sees it: one \`git add .\` and it is in a commit. Hide it: ${cmd}`,
    layoutAdvice: "missing — advice, it does not fail the run",
    coversImpossible: (entry, gate, linter) => `the claim "${gate} holds ${entry}" is wrong: ${linter} has no rule for this class — there is nothing to hold it with`,
    coversCantCheck: (entry, gate) => `cannot check the claim "${gate} holds ${entry}": the gate's linter is not recognised or the entry has no rules for it — taken on trust`,
    selectUnknown: (names, groups) => `--only/--skip: "${names}" is neither a gate from gates: nor a group from groups:${groups ? ` (groups: ${groups})` : ""}. Running everything instead of skipping would be a lie, so stopping.`,
    selectSkipped: (names) => `not run (by --only/--skip): ${names} — their state is unknown, they are not "green"`,
    claudeShim: {
      missing: "Claude Code is set up here (.claude/), but the rules live in AGENTS.md — it does not read that file. Fix: a CLAUDE.md with the single line \"@AGENTS.md\".",
      noImport: "CLAUDE.md does not import AGENTS.md — Claude Code only sees CLAUDE.md. Fix: add the line \"@AGENTS.md\" to CLAUDE.md (mentioning the file in prose does not load it).",
    },
    heldQuiet: (n, cmd) => `held by the machine: ${n} — by name: ${cmd}`,
    skipQuiet: (n, cmd) => `not applicable to this repository: ${n} — by name and why: ${cmd}`,
    passedQuiet: (n) => `${n} more passed — by name: --verbose`,
    jobsBad: (v) => `--jobs expects a whole number from 1: "${v}" will not do. A one-by-one run passed off as parallel would be a lie, so stopping.`,
    rulesByHuman: (total, machine, human) =>
      `${human} of ${total} rules in the entry point are guarded by a HUMAN, ${machine} by a machine.`,
    rulesByHumanWhy: "A rule guarded by a human is guarded by nobody the day the human is busy. That is the hole this kit exists to close — and the reminder belongs to the human, not only to the agent. Counted in the ENTRY POINT only: a promise kept in any other file is checked by nothing at all, and this kit will not tell you it exists.",
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
    limitsTitle: "A level measures tooling, not reliability. What it does not prove:",
    limitsProbe: {
      never: (_, cmd) => `defects in your files: the probe has never run — ${cmd}`,
      off: () => "defects in your files: the probe is off (probe: 0) — whether your checks catch them is unknown",
      blind: ({ names, behind }) => `defects in your files: the probe${ago(behind)} did NOT catch — ${names.join(", ")}`,
      partial: ({ caught, unknown, behind }, cmd) => `defects in your files: the probe${ago(behind)} caught ${caught} classes, ${unknown} unproven (${cmd})`,
      caught: ({ caught, behind }) => `defects in your files: the probe${ago(behind)} caught all ${caught} planted classes — only those the catalog has`,
      nothing: ({ behind }, cmd) => `defects in your files: the probe${ago(behind)} planted nothing — ${cmd}`,
      old: ({ behind }, cmd) => `defects in your files: the probe ran${ago(behind)}; ${cmd} shows the result`,
    },
    limitsCi: "pipeline: whether it passed is not visible from here — we only check that gates are declared in it",

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
    blindHeading: (behind) => `The probe${behind ? ` (${behind} commits ago)` : ""} planted defects in your files — your checks did NOT catch them:`,
    blindRan: (g) => `gate ${g} is declared and was run — and still missed the defect in this file`,
    blindInstalled: "declared, but the probe did not run this gate (added later or too slow) — the next probe will show whether it catches",
    blindMore: (cmd) => `what was planted and where — ${cmd}`,
    probeNever: (cmd) => `Whether your checks catch a real defect has not been tested yet: ${cmd} plants one in a copy of the project and shows (a minute or two, your project files are not changed).`,
    todoRest: (n) => `The other entries that apply here (${n}):`,
    todoRestHow: (self) => `install any: ${self} add <name> · what it catches and why: ${self} why <name>`,
    startWith: "Start with these three — born from a real failure, and each closes with one ready command:",
    startCmd: (cmd) => `one line, no kit needed:  ${cmd}`,
    startTool: (url) => `the tool: ${url}`,
    startHook: "Running these by hand is a one-off. To have them run before every push: pre-commit (repo: https://github.com/arsen-ask-lx/Agent_Quality_Kit, hooks aqk / aqk-doctor), or a plain .git/hooks/pre-push.",
    haveAlready: (n) => `Checks you ALREADY have (${n}) — found in your own files, not invented:`,
    haveAlreadyHow: (line) => `declare them and a machine holds them, not your attention. In .aqk.yml, under gates:  ${line}`,
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
    running: (i, n) => `[${i}/${n}] running…`,
    proving: "checking that the gates catch defects on their own samples…",
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
    runVerdictOk: "Everything declared is green.",
    runVerdictFail: (why) => `The run is red: ${why}.`,
    whyMissing: "files from the header are missing",
    whyLevel: "the level was not reached",
    whyGates: (n, names) => `${n} red gate(s)${names ? ` (${names})` : ""}`,
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
      has_biome: ["the linter is not Biome", "the project's linter is Biome"],
      has_env: ["no environment file", "an environment file exists"],
      has_agent_config: ["the agent was never configured here", "agent settings exist"],
      has_agent_entry: ["no entry point for an agent here", "an entry point for an agent exists"],
      has_ui: ["no stylesheets or UI components in sight", "a UI exists: stylesheets or components"],
      has_mcp: ["no MCP tools are wired up for the agent here", "MCP servers are declared"],
      has_api_spec: ["no API contract in sight: no OpenAPI file, no tRPC, ts-rest or Fastify type provider", "an API contract exists: a specification file or schemas in code"],
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

  prompt: {
    title: "# Task: get this project's checks actually working",
    intro: "Written by AQK from the current state of the repository. Do the items in order.",
    rulesTitle: "## Ground rules",
    rules: [
      "Use only commands from this task and from the repository. Do not invent any.",
      "Run an item's check first and see it fail. Then fix. Done means the same command passes.",
      "Fix the code, not the check: do not loosen a threshold, add exclusions or switch a gate off. If you think a check is wrong, stop and ask the owner.",
      "A decision only the owner can make (what to add to the project, which rules to adopt) — ask, do not guess.",
      "Change only what these items need.",
    ],
    tasksTitle: "## What to do",
    empty: "Nothing to do: no gate is red, the probe found nothing, nothing to add. Still run the verification below.",
    done: "Done —",
    item: {
      init: (s) => `Create the manifest: \`${s} init\` — without it the other commands refuse. Done — \`${s} doctor\` shows a level.`,
      runNone: (s) => `There has been no run yet. Run \`${s} doctor --run\` and fix whatever turns red, one gate at a time: \`${s} doctor --run --only <name>\`. Done — the run passes.`,
      runStale: (s, when) => `The run from ${when} is older than the last commit — the red list below may describe other code. Run \`${s} doctor --run\` again. Done — you have a fresh result and have checked the items below against it.`,
      missed: ({ slug, file }, s) => `Gate \`${slug}\` is installed but missed the defect the probe planted into \`${file}\`. Find out why — a common cause is that the gate does not look at this file type or folder; \`${s} probe\` has the details. Done — \`${s} probe\` no longer names this class.`,
      red: (name, s) => `Gate \`${name}\` is red. Run \`${s} doctor --run --only ${name}\`, read the findings and fix the code. Done — that command passes.`,
      blind: ({ slug, file, command }, s) => `The probe planted a \`${slug}\` defect into \`${file}\` and the project's checks did not notice. Add a check: \`${s} add ${slug}\`${command ? ` (the same as one line, without the kit: \`${command}\`)` : ""}. Done — \`${s} doctor --run --only ${slug}\` passes and \`${s} probe\` no longer names this class.`,
      adopt: (gates, s) => `The project already has its own checks: ${gates.map((g) => `\`${g.cmd}\` (${g.source})`).join(", ")}. Declare them under gates: in .aqk.yml — ${gates.map((g) => `\`${g.name}: "${g.cmd}"\``).join(", ")}. Done — \`${s} doctor --run\` runs them.`,
      shim: {
        missing: (s) => `Claude Code is set up here, but the rules live in AGENTS.md — it only reads CLAUDE.md. Create a CLAUDE.md with the single line \`@AGENTS.md\`. Done — \`${s} doctor\` no longer warns about it.`,
        noImport: (s) => `CLAUDE.md does not import AGENTS.md — Claude Code only sees CLAUDE.md. Add the line \`@AGENTS.md\` to CLAUDE.md (mentioning the file in prose does not load it). Done — \`${s} doctor\` no longer warns about it.`,
      },
      start: ({ slug, intent, command }, s) => `Propose the \`${slug}\` check to the owner${intent ? ` — ${intent}` : ""}. If they agree — \`${s} add ${slug}\`${command ? ` (the same as one line, without the kit: \`${command}\`)` : ""}. If it fails on existing code, do not silence it — show the findings to the owner. Done — \`${s} doctor --run --only ${slug}\` passes and \`${s} prove\` shows it proven.`,
    },
    more: (n, s) => `And ${n} more — the full list: \`${s} doctor\`. Finish these first.`,
    verifyTitle: "## How to verify it is done",
    verify: (s) => [
      `\`${s} doctor --run\` — the run passes.`,
      `\`${s} prove\` — no gate is broken: each one fails on its own red sample.`,
      "Name these commands and their results in your report. \"Looks like it works\" is not done.",
    ],
  },
  ...enGates,
};
