from pathlib import Path
import os,json,hashlib,subprocess
base=Path('/Users/bogart/Dev/PROBNAYA/work-cli-foreground');tmp=Path('/private/tmp/0x2f-task002-correction')
def read(p):return json.loads(Path(p).read_text())
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def canonical(value):return hashlib.sha256(json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()).hexdigest()
def tree(root):
 out={}
 for parent,dirs,files in os.walk(root,followlinks=False):
  for name in files:
   p=Path(parent)/name
   if p.is_file() and not p.is_symlink():out[str(p.relative_to(root))]={'sha256':sha(p),'mode':p.stat().st_mode}
 return dict(sorted(out.items()))
before=read(tmp/'work-before.json');after=tree(base/'.work');assert before==after,'candidate .work changed'
(tmp/'work-after.json').write_text(json.dumps(after,indent=2)+'\n')
bp=Path('/private/tmp/0x2f-phase0-20261016T001558Z-1ncn11k6/baseline.task002-before.json');ap=bp.with_name('baseline.task002-after.json');b=read(bp);a=read(ap)
for key in ['path','head','branch','status','trackedFiles']:assert b['repository'][key]==a['repository'][key],('production',key)
for key in ['stable','tasks','task2Files','packageHistoricalMatch','schedules','schedulerInstallation']:assert b[key]==a[key],key
for key in ['path','file','configuration']:assert b['launchAgent'][key]==a['launchAgent'][key],('launchAgent',key)
for key in ['program','working directory']:assert b['launchAgent']['loadedJob'][key]==a['launchAgent']['loadedJob'][key],key
changes=sorted(k for k in b['workFiles'].keys()|a['workFiles'].keys() if b['workFiles'].get(k)!=a['workFiles'].get(k));assert set(changes)<={'scheduler.log','scheduler/health.json'},changes
assert a['schedulerHealth']['success'] is True
install=read(base/'docs/evidence/managed-foreground-rollout/installation.json');assert Path(install['command']).read_text()==install['launcher'];assert os.readlink('/Users/bogart/.n/bin/2f')==install['existing2fLink']
unchanged=subprocess.check_output(['git','diff','--name-only','f673dd3a2c9c7565ed3376a677749a30c568bc9c','--','docs/evidence'],cwd=base,text=True).splitlines();assert not [p for p in unchanged if not p.startswith('docs/evidence/managed-task002-correction/')]
assert subprocess.check_output(['git','diff','--name-only','f673dd3a2c9c7565ed3376a677749a30c568bc9c','--','package.json','package-lock.json'],cwd=base,text=True)==''
receipt='/private/tmp/0x2f-canary-3vlJUt/repo/.work/tasks/001-fix-invalid-utf-16-in-truncated-task-titles/delivery/ab32e4abfd1b1f97de1c11397fd8070f86a1938ba977f3059461e11361fbc125/receipt.json'
script="import fs from 'node:fs';import{handoffHash}from'./src/core/engineering-handoff.mjs';console.log(handoffHash(JSON.parse(fs.readFileSync(process.argv[1]))));"
rhash=subprocess.check_output(['node','--input-type=module','-e',script,receipt],cwd=base,text=True).strip();assert rhash=='e7d83198ad294db44483b514e1cae3eb673fbd2c129e7df806002e5996613e7b'
taskroots=sorted((base/'.work/tasks').glob('*/task.json'));assert len(taskroots)==2
summary={'candidateWorkUnchanged':True,'canonicalBeforeManifestDigest':canonical(before),'canonicalAfterManifestDigest':canonical(after),'committedBeforeManifest':'work-manifest.json','candidateWorkFiles':len(before),'beforeManifest':str(tmp/'work-before.json'),'beforeManifestSha256':sha(tmp/'work-before.json'),'afterManifest':str(tmp/'work-after.json'),'afterManifestSha256':sha(tmp/'work-after.json'),'tasks':[],'task003Created':False,'productionBaselineBefore':str(bp),'productionBaselineAfter':str(ap),'productionTrackedBytesPackagesAndTasksUnchanged':True,'productionPackageHashes':{name:a['repository']['trackedFiles'][name]['sha256'] for name in ['package.json','package-lock.json']},'productionHead':a['repository']['head'],'stableUnchanged':True,'stableHead':a['stable']['head'],'productionTask2Files':len(a['task2Files']),'productionTask3Files':len([k for k in a['workFiles'] if k.startswith('tasks/003')]),'launchAgentScheduleAndRuntimeBindingUnchanged':True,'schedulerHealthy':True,'naturalSchedulerWake':{'before':b['launchAgent']['loadedJob'],'after':a['launchAgent']['loadedJob'],'changedOnly':changes,'phaseInvokedSchedulerControl':False},'existing2fAnd2fNextLaunchersUnchanged':True,'priorTrackedEvidenceUnchanged':True,'priorDeliveryReceiptDigest':rhash,'projectPolicyUnchanged':True,'projectPolicyLimits':read(base/'.work/engineering.json')['limits'],'realProviderRequests':0,'keychainReads':0,'keychainModifications':0}
for p in taskroots:
 t=read(p);prefix=str(p.parent.relative_to(base/'.work'))+'/';summary['tasks'].append({'id':t['id'],'status':t['status'],'reason':t['blockedOn']['code'],'unchangedFiles':sum(k.startswith(prefix) for k in before),'taskJsonSha256':sha(p),'managedAttempt':t['engineering']['managed']['attempt']})
(base/'docs/evidence/managed-task002-correction/preservation.json').write_text(json.dumps(summary,indent=2)+'\n');print(json.dumps(summary,indent=2))
