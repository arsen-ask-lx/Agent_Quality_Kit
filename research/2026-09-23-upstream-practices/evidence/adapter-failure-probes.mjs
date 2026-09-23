// Research only: real upstream functions, injected analyzer results; no real analyzer/network.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const upstream = new URL('../../../sandbox/upstream-audit-2026-09-23/smixs--code-quality/', import.meta.url);
const { adapterChecks, adapterFindingKeys, ratchetAdapterChecks } = await import(new URL('scripts/lib/adapter-tools.ts', upstream));
const repo = mkdtempSync(join(tmpdir(), 'aqk-adapter-failures-'));
const results = [];
try {
  const git = spawnSync('git', ['init', '-q', repo], { encoding: 'utf8' });
  assert.equal(git.status, 0, git.stderr);
  const o = { repo, out: join(repo, '.scratch/quality'), langs: [], toml: { tools: {}, security: { audit: true } } };
  const root = { root: '.', adapter: { id: 'py', form: { tool: 'fixture-analyzer', command: 'fixture-analyzer', format: 'json', install: 'not installed by this probe' } } };
  const finding = JSON.stringify([{ file: 'value.py', line: 1, message: 'known style finding', code: 'F1' }]);
  const runForm = (code, out, err = '') => adapterChecks(o, ['form'], { roots: [root], runner: () => ({ code, out, err }) });
  const clean = runForm(0, '[]');
  const failedEmpty = runForm(2, '[]', 'fixture analyzer crashed');
  const successfulFinding = runForm(0, finding);
  const crashedFinding = runForm(2, finding, 'fixture analyzer crashed after partial output');
  const baseline = adapterFindingKeys(successfulFinding);
  const afterBaseline = ratchetAdapterChecks(crashedFinding, baseline);
  for (const [id, checks] of Object.entries({ clean, failedEmpty, successfulFinding, crashedFinding, afterBaseline })) results.push({ id, checks });
  assert.equal(clean[0].error, '');
  assert.ok(failedEmpty[0].error);
  assert.equal(crashedFinding[0].error, '');
  assert.equal(crashedFinding[0].findings.length, 1);
  assert.equal(afterBaseline[0].error, '');
  assert.equal(afterBaseline[0].findings.length, 0);
  mkdirSync(join(repo, 'z'));
  writeFileSync(join(repo, 'package-lock.json'), '{}\n');
  writeFileSync(join(repo, 'z/Cargo.lock'), '# fixture\n');
  const vulnerable = { code: 1, out: JSON.stringify({ results: [{ source: { path: 'package-lock.json' }, packages: [{ package: { name: 'fixture', version: '1.0.0' }, vulnerabilities: [{ id: 'FIXTURE-ONLY-001' }] }] }] }), err: 'Found 1 package' };
  const secondClean = { code: 0, out: JSON.stringify({ results: [] }), err: 'Found 1 package' };
  const offline = { code: 2, out: '', err: 'unable to fetch OSV database: network offline' };
  for (const [id, second] of [['auditBothCompleted', secondClean], ['auditLaterOffline', offline]]) {
    const calls = [];
    const checks = adapterChecks(o, ['audit'], { runner: (cmd, args, cwd) => {
      calls.push({ cmd, args, cwdRelative: cwd === repo ? '.' : 'z' });
      return args.at(-1) === 'package-lock.json' ? vulnerable : second;
    } });
    results.push({ id, calls, checks });
    assert.equal(calls.length, 2);
    assert.equal(checks[0].findings.length, id === 'auditBothCompleted' ? 1 : 0);
    assert.equal(checks[0].error, '');
  }
  console.log(JSON.stringify({ date: '2026-09-23', node: process.version, upstreamCommit: '407501608b1ffe8ab0e236b742513592fca9ed60', scope: 'Real upstream adapter and ratchet functions; synthetic analyzer process results. Not a live Ruff/OSV integration or full gate run.', results }, null, 2));
} finally { rmSync(repo, { recursive: true, force: true }); }
