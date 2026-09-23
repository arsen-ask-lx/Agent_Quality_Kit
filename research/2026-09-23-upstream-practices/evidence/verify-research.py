"""Verify research provenance/coverage; no product or upstream execution."""
import collections, csv, hashlib, json, os, re, subprocess
from pathlib import Path
r=Path(__file__).resolve().parent.parent
m=json.loads((r/'manifest.json').read_text())
files=list(csv.DictReader((r/'files.tsv').open(),delimiter='\t'))
assert len(files)==m['tracked_paths']==2075
repos={x['repo']:x for x in m['repositories']}
errors=[]
for repo in repos.values():
 if not repo['sha']: continue
 p=subprocess.run(['git','rev-parse','HEAD'],cwd=repo['path'],capture_output=True,text=True)
 if p.returncode or p.stdout.strip()!=repo['sha']:errors.append({'repo':repo['repo'],'problem':'HEAD mismatch'})
for row in files:
 p=Path(repos[row['repository']]['path'])/row['file']
 b=os.readlink(p).encode() if p.is_symlink() else p.read_bytes()
 if len(b)!=int(row['bytes']) or hashlib.sha256(b).hexdigest()!=row['sha256']:
  errors.append({'file':str(p),'problem':'content mismatch'})
counts=dict(collections.Counter(x['review_status'] for x in files))
assert counts==m['review_status_counts']
log=json.loads((r/'reading-log.json').read_text()); own=[x for x in files if x['repository']==log['repository']]
assert len(log['files'])==len(own)==105
notes={x['file']:x for x in log['files']}
for row in own:
 assert row['review_status']==notes[row['file']]['status']
 assert notes[row['file']]['observation'].strip()
for repo in repos.values():
 rows=[x for x in files if x['repository']==repo['repo']]
 assert repo['read_files']==sum(x['review_status']=='read' for x in rows)
 assert repo['read_bytes']==sum(int(x['bytes']) for x in rows if x['review_status']=='read')
# Only Markdown document links, not backticks, are checked. Web reachability is a separate claim.
links=0
for p in r.rglob('*.md'):
 for target in re.findall(r'\]\(([^\s)]+)\)',p.read_text()):
  if '://' in target or target.startswith('#'):continue
  target=target.split('#')[0]
  dest=p.parent/target
  if not dest.exists():errors.append({'file':str(p.relative_to(r)),'link':target,'problem':'missing local target'})
  links+=1
attachment=r/'inputs/runtime-metrics-idea.txt'
original=Path('/mnt/c/Users/User/.codex/attachments/2669e84b-78c3-4602-82e9-7a55d3f5b759/Вставленный текст.txt')
assert attachment.read_bytes()==original.read_bytes()
probe_counts={}
for name in ['code-quality-probes','adapter-failure-probes']:
 data=json.loads((r/f'evidence/{name}.json').read_text());assert data['upstreamCommit']==log['commit'];probe_counts[name]=len(data['results'])
summary={'date':'2026-09-23','scope':'Inventory hashes, pinned HEADs, coverage counters, note coverage, local Markdown links, attachment copy and probe metadata. Does not validate the truth of every research claim or execute product tests.','tracked_entries':len(files),'code_quality_entries_with_notes':len(own),'review_status_counts':counts,'local_links_checked':links,'attachment_sha256':hashlib.sha256(attachment.read_bytes()).hexdigest(),'probe_observations':probe_counts,'errors':errors}
print(json.dumps(summary,ensure_ascii=False,indent=2))
raise SystemExit(bool(errors))
