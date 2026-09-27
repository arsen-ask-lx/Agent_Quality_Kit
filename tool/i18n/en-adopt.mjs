// tool/i18n/en-adopt.mjs — adoption contract strings (`aqk adopt`).
const enAdopt = {
  adopt: {
    usage: (cmd) => `name a gate from .aqk.yml: ${cmd} <name>. The adoption contract: declared, samples, proven, in CI.`,
    title: (name) => `aqk adopt ${name} — adoption contract: installed is not configured`,
    notDeclared: "the gate is not declared in .aqk.yml",
    declareFix: (name) => `fix: add to .aqk.yml, under gates:  ${name}: "<a command that fails on a finding>"`,
    declared: (cmd) => `declared: ${cmd}`,
    samples: (red, green) => `samples in place: ${red} · ${green}`,
    noSamples: "no samples — nothing to prove the check catches a defect with",
    samplesFix: (red, green) => `fix: put into ${red}/ what the check MUST fail on, and into ${green}/ the same place fixed. Paths inside mirror the project: ${red}/src/x.ts lands on src/x.ts`,
    samplesDirFix: "fix: fill the samples field in .aqk.yml — the directory holding gate samples",
    proven: (why) => `proof: ${why}`,
    provenFix: (cmd) => `fix: configure the tool so it fails on a finding (threshold, flags, rules), then check: ${cmd}`,
    provenNeedsSamples: "not proven: without samples there is nothing to prove with",
    infra: (reason) => `could not prove — the check itself failed${reason ? `: ${reason}` : ""}`,
    ciAll: "in CI: it runs everything declared via doctor --run",
    ciNamed: "in CI: the command is named in its config",
    ciNone: "no CI — the check runs only by hand, which lasts until the first \"forgot\"",
    ciMissing: "CI does not run this check",
    ciFix: (cmd) => `fix: add a CI step ${cmd} — it runs all declared gates at once`,
    docs: "read the tool's official documentation: how it reports a finding (exit code), where the threshold is, which flags silence it. The machine does not check this step — so it is not counted.",
    done: "contract met: the check is declared, can fail, and runs in CI",
    notDone: (n) => `contract not met: ${n} step(s) failed. The tool is installed, but whether it protects anything is not proven`,
  },
};

export { enAdopt };
