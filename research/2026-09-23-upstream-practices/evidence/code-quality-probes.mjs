// Independent contract probes; no upstream installation, no network, no real agent client.
// Run: node --experimental-strip-types research/2026-09-23-upstream-practices/evidence/code-quality-probes.mjs
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const upstream = resolve(root, 'sandbox/upstream-audit-2026-09-23/smixs--code-quality');
const { invoke, denied } = await import(pathToFileURL(join(upstream, 'adapters/invoke.ts')));
const { runTests, ensureTools } = await import(pathToFileURL(join(upstream, 'scripts/lib/crap.ts')));
const { buildOpts, readArgs } = await import(pathToFileURL(join(upstream, 'scripts/lib/config.ts')));
const temp = mkdtempSync(join(tmpdir(), 'aqk-upstream-contracts-'));
const results = [];
const oldPath = process.env.PATH;
function add(id, evidence) { results.push({ id, ...evidence }); }
function git(repo, ...args) {
 const r=spawnSync('git',['-c','core.hooksPath=/dev/null','-c','user.name=AQK audit','-c','user.email=audit@example.invalid',...args],{cwd:repo,encoding:'utf8'});
 assert.equal(r.status,0,r.stderr); return r.stdout.trim();
}
try {
 const bin=join(temp,'bin'); mkdirSync(bin);
 const fake=join(bin,'bun');
 writeFileSync(fake,'#!/bin/sh\ncat >/dev/null\nprintf "%s" "$AUDIT_PROTOCOL_RESPONSE"\nexit "$AUDIT_PROTOCOL_STATUS"\n'); chmodSync(fake,0o755);
 process.env.PATH=bin+':'+oldPath;
 const cases=[['valid-allow','{}','0'],['malformed-json','not json','0'],['json-null','null','0'],['valid-deny',JSON.stringify({hookSpecificOutput:{permissionDecision:'deny',permissionDecisionReason:'fixture denial'}}),'0'],['deny-without-reason',JSON.stringify({hookSpecificOutput:{permissionDecision:'deny'}}),'0'],['crash','not json','2']];
 for(const [name,body,status] of cases){
  process.env.AUDIT_PROTOCOL_RESPONSE=body; process.env.AUDIT_PROTOCOL_STATUS=status;
  const response=await invoke('guard-bash',{cwd:temp,tool_input:{command:'git status'}},temp);
  const reason=denied(response);
  add('adapter-'+name,{response,deniedReturn:reason??null,wouldBlockViaTruthyReason:Boolean(reason)});
 }
 assert.equal(results.find(r=>r.id==='adapter-valid-deny').wouldBlockViaTruthyReason,true);
 assert.equal(results.find(r=>r.id==='adapter-crash').wouldBlockViaTruthyReason,true);
 assert.equal(results.find(r=>r.id==='adapter-malformed-json').wouldBlockViaTruthyReason,false);
 process.env.PATH=oldPath;
 const repo=join(temp,'repo'); mkdirSync(join(repo,'src'),{recursive:true}); mkdirSync(join(repo,'tests'));
 writeFileSync(join(repo,'src/value.js'),'export const value = 1;\n');
 writeFileSync(join(repo,'tests/value.test.js'),'// initial independent test fixture\n');
 writeFileSync(join(repo,'package.json'),'{"name":"audit-fixture","type":"module"}\n');
 writeFileSync(join(repo,'writer.mjs'),"import { writeFileSync } from 'node:fs'; writeFileSync(process.env.QG_LCOV, 'SF:src/value.js\\nDA:1,1\\nend_of_record\\n');\n");
 git(repo,'init','-q'); git(repo,'add','.'); git(repo,'commit','-qm','Independent contract fixture');
 const out=join(repo,'.scratch/quality'); mkdirSync(out,{recursive:true});
 const minimal={repo,out,dirs:['src'],lang:'ts',langs:[],testCmd:'node writer.mjs'};
 const full=runTests(minimal,'run');
 assert.equal(full.used,true);
 const unchanged=runTests(minimal,'fresh-or-none'); add('coverage-unchanged',{used:unchanged.used,red:unchanged.red});
 writeFileSync(join(repo,'tests/value.test.js'),'// test contract has changed\n');
 const testChange=runTests(minimal,'fresh-or-none'); add('coverage-test-outside-src-changed',{used:testChange.used,red:testChange.red});
 writeFileSync(join(repo,'package.json'),'{"name":"audit-fixture","type":"module","scripts":{"test":"exit 1"}}\n');
 const dependencyChange=runTests(minimal,'fresh-or-none'); add('coverage-package-outside-src-changed',{used:dependencyChange.used,red:dependencyChange.red});
 const commandChange=runTests({...minimal,testCmd:'exit 1'},'fresh-or-none'); add('coverage-test-command-changed',{used:commandChange.used,red:commandChange.red});
 writeFileSync(join(repo,'src/value.js'),'export const value = 2;\n');
 const sourceChange=runTests(minimal,'fresh-or-none'); add('coverage-source-changed',{used:sourceChange.used,red:sourceChange.red});
 assert.equal(sourceChange.used,false);
 const thresholdRepo=join(temp,'empty-repo'); mkdirSync(thresholdRepo); git(thresholdRepo,'init','-q');
 const options=buildOpts(readArgs(['check','--repo',thresholdRepo,'--src','src','--max-cc','not-a-number']));
 add('invalid-cli-threshold',{maxCc:String(options.maxCc),acceptedWithoutError:true,cc100ExceedsThreshold:100>options.maxCc});
 assert.equal(Number.isNaN(options.maxCc),true);
 const cache=join(temp,'cache'); mkdirSync(join(cache,'node_modules/fictional-tool'),{recursive:true});
 writeFileSync(join(cache,'node_modules/fictional-tool/package.json'),'{"name":"fictional-tool","version":"1.0.0"}');
 // No install should run: existing package presence triggers return before npm invocation.
 ensureTools(['fictional-tool@9.9.9'],cache);
 add('tool-cache-version',{requested:'9.9.9',retained:JSON.parse(readFileSync(join(cache,'node_modules/fictional-tool/package.json'),'utf8')).version});
 const evidence={date:'2026-09-23',node:process.version,upstreamCommit:'407501608b1ffe8ab0e236b742513592fca9ed60',scope:'Real exported functions under Node type stripping. Fake bun protocol subprocess and synthetic LCOV writer; not a Bun suite or agent integration run.',results};
 console.log(JSON.stringify(evidence,null,2));
} finally {
 process.env.PATH=oldPath; delete process.env.AUDIT_PROTOCOL_RESPONSE; delete process.env.AUDIT_PROTOCOL_STATUS;
 rmSync(temp,{recursive:true,force:true});
}
