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
};
