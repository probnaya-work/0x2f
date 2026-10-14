import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {createStore} from '../src/core/store.mjs';
import {readDefinition} from '../src/core/workflows.mjs';
import {executableIdentity} from '../src/core/workflow-adapters.mjs';
import {loadedRuntimeFingerprint,stopLaunchAgent} from '../src/core/workflow-scheduler.mjs';
import {manageSupervision,supervisionStatus,readInstallation,listAttempts,readAttempt,prepareAttempt,supervisedRun,promoteAttempt,attemptDir,attemptLock,writeAttempt,stopAttemptJob,reconcileAttempt,cleanupAttempt,groupMembers,jobState,attemptIdentity,attemptIdentityMatches,observeAttemptIdentity,validateAdapterPolicy,digestAttempt} from '../src/core/workflow-supervision.mjs';
import {recoverWorkflow,workflowDoctor} from '../src/core/workflow-doctor.mjs';
import {fixture,pause,settled,captureFixtureEvidence} from './workflow-fixture.mjs';
import {workflowLines} from '../src/web/workflow.mjs';
const exec=promisify(execFile),workerFile=new URL('./supervision-fixture-worker.mjs',import.meta.url).pathname;
const policy={processGroup:'inherit',daemonizes:false,unattended:true,network:false,paid:false};
async function wait(fn,label='condition',ms=12000){const until=Date.now()+ms;while(Date.now()<until){const v=await fn();if(v)return v;await pause(30);}throw new Error('Timed out: '+label);}
async function harness(t,mode='success',{timeoutMs=4000,maxBytes=1000000,testCrashAt,credentialEnv=[],outputRules={}}={}){
  const cleanup=[];const f=await fixture({after(fn){cleanup.push(fn);}}),store=f.runtime.store;
  const script=path.join(f.base,'attempt-fixture.mjs');
  await fs.writeFile(script,`#!${process.execPath}
import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';
const [mode,output,ledger]=process.argv.slice(2);
fs.appendFileSync(ledger,JSON.stringify({pid:process.pid,mode,key:process.env.WORKFLOW_OPERATION_ID??null})+'\\n');
if(mode==='tree'||mode==='child'||mode==='grandchild'){
 fs.writeFileSync(ledger+'.'+mode+'.pid',String(process.pid));
 if(mode!=='grandchild')spawn(process.execPath,[import.meta.filename,mode==='tree'?'child':'grandchild',output,ledger],{stdio:'ignore'});
 const fd=fs.openSync(path.join(output,'result.txt'),'a');setInterval(()=>fs.writeSync(fd,'late\\n'),25);
}else if(mode==='hang'){fs.writeFileSync(path.join(output,'result.txt'),'started');setInterval(()=>{},1000);}
else if(mode==='descendant'){spawn(process.execPath,[import.meta.filename,'grandchild',output,ledger],{stdio:'ignore'});}
else if(mode==='unexpected'){fs.writeFileSync(path.join(output,'wrong.txt'),'bad');}
else if(mode==='oversized'){fs.writeFileSync(path.join(output,'result.txt'),Buffer.alloc(2000000));}
else if(mode==='symlink'){fs.symlinkSync(ledger,path.join(output,'result.txt'));}
else if(mode==='secret-unknown'){fs.writeFileSync(path.join(output,'unknown.txt'),process.env.FIXTURE_CREDENTIAL);}
else if(mode==='secret'){console.log(process.env.FIXTURE_CREDENTIAL);console.error(process.env.FIXTURE_CREDENTIAL);fs.writeFileSync(path.join(output,'result.txt'),process.env.FIXTURE_CREDENTIAL);}
else if(mode==='fail'){process.exit(7);}
else {fs.writeFileSync(path.join(output,'result.txt'),'known-result');}
`);await fs.chmod(script,0o700);
  const definition=await readDefinition(store,'probnaya-editorial');
  let task=await store.createTask({title:'Supervision fixture',brief:'fixture',prompt:'fixture'});
  task={...task,status:'working',execution:{launchToken:randomUUID()},runs:[{run:1}],workflow:{schemaVersion:1,id:definition.id,version:definition.version,definition,runtimeFingerprint:loadedRuntimeFingerprint,trigger:'manual',triggerKey:'fixture',decisions:[]}};
  await store.updateTask(task);
  const ledger=path.join(f.base,'ledger'),command=mode==='native-python'?'python3':script,argv=mode==='native-python'?[command,'-c',"import sys;open(sys.argv[1],'w').write('known-result');open(sys.argv[2],'a').write('call\\n')",'{outputDir}/result.txt',ledger]:[script,mode,'{outputDir}',ledger],options={operationId:'operation-1',argv,pin:await executableIdentity(command),policy:{...policy,credentialEnv},outputs:['result.txt'],outputRules,timeoutMs,maxBytes,testCrashAt,provider:{requestIdentity:'fixture-operation-1',idempotencyKey:'fixture-operation-1',statusLookup:'local-ledger'}};
  const file=path.join(f.base,'request.json');await store.writeJson(file,options);
  const child=spawn(process.execPath,[workerFile,f.base,String(task.id),file],{env:{...process.env,WORKFLOW_TEST_MODE:'1'},stdio:'ignore'});
  t.after(async()=>{await captureFixtureEvidence(store,'harness');const identity=await attemptIdentity(child.pid);if(identity&&!identity.unknown)process.kill(child.pid,'SIGKILL');await new Promise(resolve=>{if(child.exitCode!==null||child.signalCode)resolve();else child.once('exit',resolve);});await store.updateTask({...await store.findTask(task.id),status:'failed'});for(const fn of cleanup)await fn();});
  return {...f,store,task,options,file,child,ledger,attempt:()=>listAttempts(store).then(x=>x[0])};
}
const native={skip:process.platform!=='darwin'};

test('real inspector timeout is unknown rather than proof of worker death',native,async t=>{
  const identity=await attemptIdentity(process.pid);assert.equal(identity.native,true);
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'2f-identity-observation-'));
  const wrapper=path.join(dir,'delayed-python');
  await fs.writeFile(wrapper,"#!/usr/bin/python3\nimport time,os,sys\ntime.sleep(3)\nos.execv('/usr/bin/python3',['/usr/bin/python3']+sys.argv[1:])\n");await fs.chmod(wrapper,0o700);
  const prior=process.env.WORKFLOW_LOCK_PYTHON;
  try{
    process.env.WORKFLOW_LOCK_PYTHON=wrapper;
    assert.equal(await observeAttemptIdentity(identity),'unknown');
    assert.doesNotThrow(()=>process.kill(identity.pid,0));
  }finally{
    if(prior===undefined)delete process.env.WORKFLOW_LOCK_PYTHON;else process.env.WORKFLOW_LOCK_PYTHON=prior;
    await fs.rm(dir,{recursive:true,force:true});
  }
  assert.equal(await observeAttemptIdentity(identity),'alive');
  assert.equal(await attemptIdentity(2147483647),null);
});

test('policy rejects escape/network/paid/environment injection contracts',()=>{
  for(const patch of [{daemonizes:true},{processGroup:'detached'},{network:true},{paid:true},{unattended:false},{credentialEnv:['NODE_OPTIONS']},{credentialEnv:['PATH']},{credentialEnv:Array.from({length:33},(_,n)=>'KEY'+n)}])assert.throws(()=>validateAdapterPolicy({...policy,...patch}));
});

test('successful real launchd attempt closes group, seals archive and deduplicates intent',native,async t=>{
  const h=await harness(t);const r=await wait(async()=>{const r=await h.attempt();return r?.state==='promoted'&&r;},'promotion');
  assert.equal(await fs.readFile(path.join(attemptDir(h.store,r.request.id),'archive/result.txt'),'utf8'),'known-result');
  assert.deepEqual(await groupMembers(r.pgid),[]);assert.equal((await jobState(r.request.label)).pid,null);
  const repeated=await prepareAttempt(h.store,h.task,h.options);assert.equal(repeated.state,'promoted');assert.equal((await fs.readFile(h.ledger,'utf8')).trim().split('\n').length,1);
  await assert.rejects(prepareAttempt(h.store,h.task,{...h.options,outputs:['other']}),/payload conflict/);
  await assert.rejects(attemptLock(h.store,r.request.id,()=>writeAttempt(h.store,r,{state:'running'})),/monotonic/);
});

for(const death of ['worker-kill','runner-kill','both','worker-term','runner-term'])test(`real child/grandchild/open output descriptors / ${death}`,native,async t=>{
  const h=await harness(t,'tree',{timeoutMs:12000});
  // PID files announce startup, not a successful birth observation. Capture the
  // complete real identities while the processes are alive, before faulting them.
  const {r,ids}=await wait(async()=>{
    if(!await h.store.exists(h.ledger+'.grandchild.pid'))return false;
    const r=await h.attempt(),ids=[];
    if(r?.state!=='running')return false;
    for(const mode of ['tree','child','grandchild'])ids.push(await attemptIdentity(Number(await fs.readFile(h.ledger+'.'+mode+'.pid','utf8'))));
    return ids.every(i=>i?.native&&!i.unknown)?{r,ids}:false;
  },'grandchild');
  for(const identity of ids)assert.equal(identity.pgid,r.pgid);
  // Check authority before either fault. Once worker loss is injected the
  // watchdog is entitled to close the runner, so a later "still alive" assertion
  // contradicts the behavior this test is meant to verify.
  if(death.startsWith('runner')||death==='both')assert.equal(await attemptIdentityMatches(r.owner),true);
  if(death.startsWith('worker')||death==='both')process.kill(h.child.pid,death==='worker-term'?'SIGTERM':'SIGKILL');
  if(death.startsWith('runner')||death==='both')process.kill(r.owner.pid,death==='runner-term'?'SIGTERM':'SIGKILL');
  const end=await wait(async()=>{const x=await h.attempt();return ['needs_reconciliation','uncertain','cancelled'].includes(x?.state)&&x;},'reconciliation');
  await wait(async()=>!(await groupMembers(r.pgid)).length,'closed group');
  for(const identity of ids)assert.equal(await attemptIdentityMatches(identity),false);
  const staging=path.join(attemptDir(h.store,r.request.id),'output/result.txt'),before=await fs.readFile(staging);await pause(200);assert.deepEqual(await fs.readFile(staging),before);
  await assert.rejects(promoteAttempt(h.store,r.request.id),/validated/);assert.equal(await h.store.exists(path.join(attemptDir(h.store,r.request.id),'archive')),false);
  const count=await fs.readFile(h.ledger,'utf8');await manageSupervision(h.store,'repair');await pause(200);assert.equal(await fs.readFile(h.ledger,'utf8'),count);
  await assert.rejects(prepareAttempt(h.store,h.task,{...h.options,operationId:'operation-2'}),/reconciliation/);
  const report=await workflowDoctor(h.store);assert.ok(report.attempts.some(a=>a.pendingReconciliation));
  await reconcileAttempt(h.store,r.request.id,'abandon');await cleanupAttempt(h.store,r.request.id);assert.equal(await h.store.exists(staging),false);
});

for(const point of ['before-owned','after-owned','spawn-before-record','record-before-go','after-go','before-validation','after-validation','both:spawn-before-record','both:record-before-go','both:after-go'])test(`kernel-owned gate crash window / ${point}`,native,async t=>{
  const h=await harness(t,'success',{testCrashAt:point});
  const r=await wait(async()=>{const r=await h.attempt();return ['needs_reconciliation','uncertain','promoted'].includes(r?.state)&&r;},'fault receipt');
  if(r.pgid)await wait(async()=>!(await groupMembers(r.pgid)).length,'empty group');
  const calls=(await fs.readFile(h.ledger,'utf8').catch(()=>'' )).trim().split('\n').filter(Boolean).length;
  if(point.endsWith('after-go'))assert.ok(calls<=1);
  else assert.equal(calls,['before-owned','after-owned','spawn-before-record','record-before-go','both:spawn-before-record','both:record-before-go'].includes(point)?0:1);
  await manageSupervision(h.store,'repair');await pause(150);assert.equal((await fs.readFile(h.ledger,'utf8').catch(()=>'' )).trim().split('\n').filter(Boolean).length,calls);
  if(point!=='after-validation')await assert.rejects(promoteAttempt(h.store,r.request.id),/validated/);
});

for(const mode of ['hang','descendant'])test(`timeout closes ${mode} including held output descriptor`,native,async t=>{
  const h=await harness(t,mode,{timeoutMs:1500});const r=await wait(async()=>{const r=await h.attempt();return r?.state==='needs_reconciliation'&&r;},'timeout');
  assert.equal(r.reason,'timeout');await wait(async()=>!(await groupMembers(r.pgid)).length,'closed timed-out group');await assert.rejects(promoteAttempt(h.store,r.request.id));
});

test('explicit cancel closes group and preserves staging until explicit cleanup',native,async t=>{
  const h=await harness(t,'hang',{timeoutMs:12000});const r=await wait(async()=>{const r=await h.attempt();return r?.state==='running'&&r;});
  await attemptLock(h.store,r.request.id,()=>stopAttemptJob(h.store,r,'user_cancel'));
  await wait(async()=> (await h.attempt()).state==='cancelled');
  await assert.rejects(cleanupAttempt(h.store,r.request.id),/reconciliation/);
  await reconcileAttempt(h.store,r.request.id,'confirmed-no-effect');await cleanupAttempt(h.store,r.request.id);
});

for(const mode of ['fail','oversized','unexpected','symlink','secret','secret-unknown'])test(`unsafe output / ${mode} never promotes or persists secret logs`,native,async t=>{
  process.env.FIXTURE_CREDENTIAL='disposable-secret-do-not-persist-39';t.after(()=>delete process.env.FIXTURE_CREDENTIAL);
  const h=await harness(t,mode,{credentialEnv:mode.startsWith('secret')?['FIXTURE_CREDENTIAL']:[],maxBytes:mode==='oversized'?1000:1000000});
  const r=await wait(async()=>{const r=await h.attempt();return ['failed','needs_reconciliation'].includes(r?.state)&&r;});
  assert.equal(await h.store.exists(path.join(attemptDir(h.store,r.request.id),'archive')),false);
  for(const name of ['receipt.json','manifest.json']){const bytes=await fs.readFile(path.join(attemptDir(h.store,r.request.id),name)).catch(()=>Buffer.alloc(0));assert.equal(bytes.includes(Buffer.from(process.env.FIXTURE_CREDENTIAL)),false);}
  assert.equal(await h.store.exists(path.join(attemptDir(h.store,r.request.id),'stdout')),false);
});

test('same-native-job PID with wrong birth refuses signals; damaged receipt refuses everything',native,async t=>{
  const h=await harness(t,'hang',{timeoutMs:5000});const r=await wait(async()=>{const r=await h.attempt();return r?.state==='running'&&r;});
  await attemptLock(h.store,r.request.id,async()=>{const current=await readAttempt(h.store,r.request.id);const bad=await writeAttempt(h.store,current,{owner:{...current.owner,birth:'1:1'}});assert.equal(await stopAttemptJob(h.store,bad,'user_cancel'),false);});
  assert.equal(await attemptIdentityMatches(r.owner),true);await assert.rejects(promoteAttempt(h.store,r.request.id));
  // Restore only exact fixture bytes, then cancel the verified job for teardown.
  const current=await readAttempt(h.store,r.request.id);const fixed={...current,owner:r.owner,state:'running'};delete fixed.integrity;fixed.integrity=digestAttempt(fixed);await h.store.writeJson(path.join(attemptDir(h.store,r.request.id),'receipt.json'),fixed);
  await attemptLock(h.store,r.request.id,()=>stopAttemptJob(h.store,fixed,'user_cancel'));await wait(async()=>!(await jobState(r.request.label)).pid);
  const receiptFile=path.join(attemptDir(h.store,r.request.id),'receipt.json'),saved=await fs.readFile(receiptFile);await fs.writeFile(receiptFile,'{"broken":');
  try{await assert.rejects(readAttempt(h.store,r.request.id));await assert.rejects(promoteAttempt(h.store,r.request.id));const doctor=await workflowDoctor(h.store);assert.ok(doctor.issues.some(x=>x.code==='ATTEMPT_RECEIPT'));}finally{await fs.writeFile(receiptFile,saved);}
});

test('executable drift and absent declared credentials fail before external intent',native,async t=>{
  const h=await harness(t,'success');await wait(async()=> (await h.attempt())?.state==='promoted');
  await assert.rejects(prepareAttempt(h.store,h.task,{...h.options,operationId:'missing-key',policy:{...policy,credentialEnv:['ABSENT_FIXTURE_KEY']}}),/credential is absent/);
  await fs.appendFile(h.options.pin.realPath,'\n// drift\n');await assert.rejects(prepareAttempt(h.store,h.task,{...h.options,operationId:'drift'}),/changed/);
});

test('validated stale run and corrupted manifest cannot promote',native,async t=>{
  const h=await harness(t,'success',{testCrashAt:'after-validation'});const r=await wait(async()=>{const r=await h.attempt();return r?.state==='promoted'&&r;});
  const original=await h.store.findTask(h.task.id);await h.store.updateTask({...original,runs:[{run:1},{run:2}],execution:{launchToken:'new-token'}});
  await assert.rejects(promoteAttempt(h.store,r.request.id),/Stale/);
  await h.store.updateTask(original);const file=path.join(attemptDir(h.store,r.request.id),'manifest.json'),saved=await fs.readFile(file);await fs.writeFile(file,'{}');
  try{await assert.rejects(promoteAttempt(h.store,r.request.id),/manifest/);}finally{await fs.writeFile(file,saved);}
});

test('long-lived supervisor SIGKILL restarts while owned attempt stays managed',native,async t=>{
  const h=await harness(t,'hang',{timeoutMs:2500});const r=await wait(async()=>{const r=await h.attempt();return r?.state==='running'&&r;});
  const installation=await readInstallation(h.store),old=(await jobState(installation.label)).pid;process.kill(old,'SIGKILL');
  await wait(async()=>{const state=await supervisionStatus(h.store);return state.healthy&&(await jobState(installation.label)).pid!==old;},'KeepAlive restart');
  await wait(async()=> (await h.attempt()).state==='needs_reconciliation');assert.deepEqual(await groupMembers(r.pgid),[]);
});

test('scheduled external definition fails closed without supervisor; built-in collection remains independent',native,async t=>{
  const f=await fixture(t);await manageSupervision(f.runtime.store,'uninstall');
  await f.runtime.actions.scheduleWorkflow('probnaya-editorial','enable',{now:new Date('2026-10-14T09:00:00Z')});
  const blocked=await f.runtime.actions.tickWorkflows({now:new Date('2026-10-16T09:00:00Z')});assert.ok(blocked.some(r=>/supervisor/i.test(r.error??'')));assert.equal((await f.runtime.store.listTasks()).length,0);
  const contract=f.cfg.adapters.supervision;delete f.cfg.adapters.supervision;await fs.writeFile(f.configPath,JSON.stringify(f.cfg));
  await assert.rejects(readDefinition(f.runtime.store,'probnaya-editorial'),/reviewed inherited-group/);
  f.cfg.adapters.supervision=contract;
  f.cfg.adapters.python='python3';await fs.writeFile(f.configPath,JSON.stringify(f.cfg));await assert.rejects(f.runtime.actions.startWorkflow('probnaya-editorial'),/supervisor/);
  f.cfg.previewFirstTopic=false;f.cfg.adapters.python='python3';delete f.cfg.adapters.supervision;delete f.cfg.permissions.unattendedAdapters;await fs.writeFile(f.configPath,JSON.stringify(f.cfg));
  const results=await f.runtime.actions.tickWorkflows({now:new Date('2026-10-16T09:00:00Z')});assert.ok(results.some(r=>r.taskId));assert.equal((await settled(f.runtime,1,'needs_you')).workflow.packageComplete,false);
});

test('shared CLI/TUI/Web projection separates worker and external attempt states',()=>{
  const lines=workflowLines({status:'working',pid:3,workflow:{id:'fixture',version:'1'},externalAttempts:[{id:'abc',state:'needs_reconciliation',run:1,worker:3,supervisor:5,reason:'worker_lost'}]});
  assert.ok(lines.some(x=>x.includes('EXTERNAL abc')&&x.includes('worker 3')&&x.includes('supervisor 5')&&x.includes('needs_reconciliation')));
});


test('actual editorial worker SIGKILL kills adapter tree, blocks archive and never retries uncertain older run',native,async t=>{
  const f=await fixture(t,{adapter:'slow',duration:20000});
  const marker=path.join(f.base,'native-tree');
  await fs.writeFile(f.cfg.adapters.python,`#!${process.execPath}
import fs from 'node:fs';import {spawn} from 'node:child_process';
const args=process.argv.slice(2),mode=args[0]==='child'||args[0]==='grandchild'?args[0]:'adapter';
const output=mode==='adapter'?JSON.parse(fs.readFileSync(args.at(-1),'utf8')).output:args[1];
fs.writeFileSync(${JSON.stringify(marker)}+'.'+mode,String(process.pid));
if(mode==='adapter')fs.appendFileSync(${JSON.stringify(marker)}+'.calls','call\\n');
if(mode!=='grandchild')spawn(process.execPath,[import.meta.filename,mode==='adapter'?'child':'grandchild',output],{stdio:'ignore'});
const fd=fs.openSync(output,'a');setInterval(()=>fs.writeSync(fd,'late\\n'),25);
`);
  const task=await f.runtime.actions.startWorkflow('probnaya-editorial');
  await wait(()=>f.runtime.store.exists(marker+'.grandchild'),'real editorial grandchild');
  const receipt=(await listAttempts(f.runtime.store))[0];assert.equal(receipt.request.worker.pid,task.pid);
  assert.equal(await attemptIdentityMatches(receipt.request.worker),true);process.kill(task.pid,'SIGKILL');
  await wait(async()=>['needs_reconciliation','uncertain'].includes((await readAttempt(f.runtime.store,receipt.request.id)).state));
  await wait(async()=>!(await groupMembers(receipt.pgid)).length);
  const output=path.join(attemptDir(f.runtime.store,receipt.request.id),'output/visual.png'),before=await fs.readFile(output);await pause(200);assert.deepEqual(await fs.readFile(output),before);
  assert.equal(await f.runtime.store.exists(path.join(attemptDir(f.runtime.store,receipt.request.id),'archive')),false);
  const calls=await fs.readFile(marker+'.calls','utf8');await recoverWorkflow(f.runtime.store,task.id);
  await f.runtime.actions.rerunWork(task.id);const blocked=await settled(f.runtime,task.id,'failed');assert.match(blocked.error,/reconciliation/);
  assert.equal(await fs.readFile(marker+'.calls','utf8'),calls);assert.equal((await listAttempts(f.runtime.store)).length,1);
});

test('concurrent/double delivery cannot create another effect; new run archive fences stale old attempt',native,async t=>{
  const h=await harness(t,'hang',{timeoutMs:10000});const r=await wait(async()=>{const r=await h.attempt();return r?.state==='running'&&r;});
  await wait(()=>h.store.exists(h.ledger),'adapter released GO');
  const results=await Promise.allSettled([prepareAttempt(h.store,h.task,h.options),prepareAttempt(h.store,h.task,{...h.options,operationId:'concurrent-other'})]);
  assert.equal(results[0].status,'fulfilled');assert.equal(results[1].status,'rejected');assert.match(results[1].reason.message,/reconciliation/);assert.equal((await fs.readFile(h.ledger,'utf8')).trim().split('\n').length,1);
  await attemptLock(h.store,r.request.id,()=>stopAttemptJob(h.store,r,'user_cancel'));await wait(async()=>(await h.attempt()).state==='cancelled');await reconcileAttempt(h.store,r.request.id,'confirmed-effect');
  let task={...await h.store.findTask(h.task.id),runs:[{run:1},{run:2}],execution:{launchToken:randomUUID()}};await h.store.updateTask(task);
  await assert.rejects(prepareAttempt(h.store,task,h.options),/new operation ID/);
  const successful={...h.options,operationId:'explicit-retry-2',argv:[h.options.argv[0],'success','{outputDir}',h.ledger]};
  const second=await supervisedRun(h.store,task,successful),bytes=await fs.readFile(path.join(second.directory,'result.txt'));
  await assert.rejects(promoteAttempt(h.store,r.request.id));assert.deepEqual(await fs.readFile(path.join(second.directory,'result.txt')),bytes);
  assert.equal((await fs.readFile(h.ledger,'utf8')).trim().split('\n').length,2);
  assert.equal((await readAttempt(h.store,r.request.id)).resolution,'confirmed-effect');assert.notEqual(second.id,r.request.id);
});

test('unsafe ownership channel refuses credential delivery and scheduler refuses runtime/plist drift',native,async t=>{
  const f=await fixture(t),store=f.runtime.store;
  const m=await readInstallation(store),plist=path.join(os.homedir(),'Library/LaunchAgents',m.label+'.plist'),saved=await fs.readFile(plist);
  await fs.appendFile(plist,'<!-- drift -->');
  try{assert.equal((await supervisionStatus(store)).healthy,false);await assert.rejects(f.runtime.actions.startWorkflow('probnaya-editorial'),/supervisor/);}finally{await fs.writeFile(plist,saved);}
  const install=path.join(store.workDir(),'supervision/installation.json'),original=await fs.readFile(install);await store.writeJson(install,{...m,runtimeFingerprint:'0'.repeat(64)});
  try{assert.equal((await supervisionStatus(store)).healthy,false);await assert.rejects(f.runtime.actions.startWorkflow('probnaya-editorial'),/supervisor/);}finally{await fs.writeFile(install,original);}
  const {ensureChannel,channelPath}=await import('../src/core/workflow-supervision.mjs'),id='b'.repeat(64),dir=path.dirname(channelPath(store,id));await fs.mkdir(dir,{mode:0o755});
  try{await assert.rejects(ensureChannel(store,id,{create:true}),/unsafe/);}finally{await fs.rm(dir,{recursive:true});}
});


test('independent service watchdog kills stopped helper group after owning worker SIGKILL',native,async t=>{
  const h=await harness(t,'tree',{timeoutMs:12000});await wait(()=>h.store.exists(h.ledger+'.grandchild.pid'));
  const r=await h.attempt();assert.equal(await attemptIdentityMatches(r.owner),true);process.kill(r.owner.pid,'SIGSTOP');process.kill(h.child.pid,'SIGKILL');
  await wait(async()=> !(await groupMembers(r.pgid)).length,'watchdog closes stopped native job');
  const end=await wait(async()=>{const x=await h.attempt();return x?.state==='needs_reconciliation'&&x;});assert.equal(end.reason,'worker_lost');
  await assert.rejects(promoteAttempt(h.store,r.request.id));assert.equal(await h.store.exists(path.join(attemptDir(h.store,r.request.id),'archive')),false);
});


test('pinned native Python command uses gate, resource limits and isolated promotion',native,async t=>{
  const h=await harness(t,'native-python');const r=await wait(async()=>{const x=await h.attempt();return x?.state==='promoted'&&x;});
  assert.equal(r.request.pin.command,'python3');assert.deepEqual(await groupMembers(r.pgid),[]);assert.equal(await fs.readFile(path.join(attemptDir(h.store,r.request.id),'archive/result.txt'),'utf8'),'known-result');
});

test('PNG output result checks run before immutable promotion',native,async t=>{
  const h=await harness(t,'success',{outputRules:{'result.txt':{kind:'png',width:1200,height:630}}});
  const r=await wait(async()=>{const x=await h.attempt();return x?.state==='failed'&&x;});assert.equal(r.reason,'output_validation_failed');assert.equal(await h.store.exists(path.join(attemptDir(h.store,r.request.id),'archive')),false);
});


test('damaged service installation cannot stop or delete another workspace native job',native,async t=>{
  const a=await fixture(t),b=await fixture(t),first=await readInstallation(a.runtime.store),other=await readInstallation(b.runtime.store);
  const identity=await attemptIdentity((await jobState(other.label)).pid),file=path.join(a.runtime.store.workDir(),'supervision/installation.json'),original=await fs.readFile(file);
  await a.runtime.store.writeJson(file,{...first,workspaceId:other.workspaceId,label:other.label});
  try{
    assert.equal((await supervisionStatus(a.runtime.store)).healthy,false);
    await assert.rejects(manageSupervision(a.runtime.store,'uninstall'),/different workspace|ambiguous/);
    assert.equal(await attemptIdentityMatches(identity),true);assert.equal((await supervisionStatus(b.runtime.store)).healthy,true);
  }finally{await fs.writeFile(file,original);}
});

test('login-style native job redelivery inspects old receipt without another provider-fixture effect',native,async t=>{
  const h=await harness(t,'hang',{timeoutMs:12000});await wait(()=>h.store.exists(h.ledger));const r=await h.attempt(),m=await readInstallation(h.store);
  assert.equal(await attemptIdentityMatches(r.owner),true);await stopLaunchAgent(r.request.label);await stopLaunchAgent(m.label);await wait(async()=>!(await groupMembers(r.pgid)).length);
  const calls=await fs.readFile(h.ledger,'utf8');
  await exec('/bin/launchctl',['bootstrap',`gui/${process.getuid()}`,path.join(os.homedir(),'Library/LaunchAgents',r.request.label+'.plist')]);
  await manageSupervision(h.store,'repair');await wait(async()=>['needs_reconciliation','uncertain'].includes((await h.attempt()).state));
  assert.equal(await fs.readFile(h.ledger,'utf8'),calls);await assert.rejects(promoteAttempt(h.store,r.request.id));
});
