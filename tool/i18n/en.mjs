// tool/i18n/en.mjs — английский каталог строк вывода.
//
// Правка здесь обязана иметь пару в ru.mjs с тем же ключом: расхождение ловит модульная
// проверка «оба каталога несут одни и те же ключи».

export const en = {
  help: {
    tagline: "tooling for building software with agents",
    name: "<name>",
    init: "lay the rules and guides into the current project",
    initForce: "overwrite files that already exist",
    start: "no code yet: day-zero guards and the order of work",
    doctor: "check what is laid out and what is missing",
    doctorRun: "and also run the declared gates",
    add: "install a gate from the catalogue into the project",
    find: "is there already such a gate — matched by intent",
    why: "a bug slipped through — why did no guard catch it",
    ratchet: "ratchet: existing violations become debt, new ones are blocked",
    new: "scaffold your own gate for the catalogue",
    note: "record a lesson in the shared bruise journal",
    blob: "assemble the guides into a single GOD_AI.md",
    noInstall: "Without installing:  npx agent-quality-kit init",
    language: "Output language: AQK_LANG=ru (or en), otherwise your system locale",
  },

  doctor: {
    docsKit: "guides — the originals live here, not a copy",
    docs: "guides",
    rulesKit: "standards — the originals live here, not a copy",
    rules: "standards",
    agents: "entry point for agents",
    gitignore: "repository hygiene",
    git: "project under version control",

    emptyCommands: (n) => `AGENTS.md has ${n} unfilled commands.`,
    emptyCommandsWhy: "An agent cannot execute an empty line.",

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
    total: "Total:",
    totalHeld: (n) => `held by a machine ${n}`,
    totalTodo: (n) => `applicable but not installed ${n}`,
    totalSkip: (n) => `hidden ${n}`,

    runHeading: "Running the declared gates",
    timeout: "did not finish within 5 minutes",
    exitCode: (code) => `exit ${code}`,
    moreLines: (n) => `… and ${n} more lines`,
    declaredNotRun: (n) => `${n} gates declared, but never run.`,
    declaredNotRunWhy: (cmd) => ` "declared" and "works" are different claims: ${cmd}`,

    thresholdPass: (min) => `Threshold AQK-${min} passed.`,
    thresholdFail: (min, now) => `Threshold AQK-${min} NOT passed: currently AQK-${now}.`,
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
    },
  },

  recipe: {
    skipped: (lang, prog) => `skipped the ${lang} recipe: "${prog}" is not installed`,
    none: "no recipe described",
  },

  manifest: {
    noGatesBlock: "no gates: block in .aqk.yml",
    alreadyDeclared: "already declared",
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
