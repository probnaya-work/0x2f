import {readInstallation,jobState,attemptIdentity,attemptIdentityMatches} from '../src/core/workflow-supervision.mjs';
import nodeTest from 'node:test';
const test=process.platform==='darwin'?nodeTest:nodeTest.skip;
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { fixture, settled, packDir, pause, cli } from './workflow-fixture.mjs';
import { createRuntime } from '../src/runtime.mjs';
import { createStore } from '../src/core/store.mjs';
import { readDefinition, dueSlot } from '../src/core/workflows.mjs';
import { workflowDoctor, recoverWorkflow, repairWorkflow } from '../src/core/workflow-doctor.mjs';
import { processIdentity, identityMatches } from '../src/core/process-identity.mjs';
import { durableWrite } from '../src/core/durable.mjs';
import { withLock, probeLock } from '../src/core/lock.mjs';
import { runtimeFingerprint, schedulerDrift, assertSchedulerCompatible, agentPlist } from '../src/core/workflow-scheduler.mjs';
import { executableIdentity } from '../src/core/workflow-adapters.mjs';
import { validatePublicRecord } from '../src/workflows/editorial-schema.mjs';
import { workflowLines } from '../src/web/workflow.mjs';
const exec = promisify(execFile);
const faultEnv = point => ({...process.env,WORKFLOW_TEST_MODE:'1',WORKFLOW_TEST_CRASH_AT:point});
async function crashCLI(base,point,args) { await exec(process.execPath,[cli,...args],{cwd:base,env:faultEnv(point)}).catch(()=>{}); await pause(150); }
async function filesHash(dir) { const out={};async function walk(p) { for(const e of await fs.readdir(p,{withFileTypes:true})) {const f=path.join(p,e.name);if(e.isDirectory())await walk(f);else out[path.relative(dir,f)]=createHash('sha256').update(await fs.readFile(f)).digest('hex');} } await walk(dir);return out; }

for(const point of ['create.id-reserved','create.inputs-durable','create.visible','task.json.file-synced','task.json.renamed','task.json.durable']) test(`crash consistency / creation / ${point}`,async t=>{
  const f=await fixture(t); await crashCLI(f.base,point,['workflow','run','probnaya-editorial','crashed-trigger']);
  const tasks=await f.runtime.store.listTasks();assert.ok(tasks.length<=1);
  for(const task of tasks) { assert.ok(await f.runtime.store.readRunPrompt(task,1)); assert.ok(await f.runtime.store.readJson(path.join(f.runtime.store.taskDir(task.slug),'runs','1','workflow-definition.json'))); await recoverWorkflow(f.runtime.store,task.id); }
  const next=await f.runtime.actions.startWorkflow('probnaya-editorial',{triggerKey:'next'});assert.equal(next.id,2);await settled(f.runtime,2,'needs_you');
});

for(const point of ['worker.before-gate','worker.gate-open','sources.json.durable','artifact.file-synced','artifact.renamed','artifact.durable','result.artifacts-durable','result.md.file-synced','result.intent-durable','result.state-durable','result.complete']) test(`crash consistency / worker / ${point}`,async t=>{
  const f=await fixture(t);await crashCLI(f.base,point,['workflow','run','probnaya-editorial','worker-crash']);
  let task=await f.runtime.store.findTask(1);
  for(let n=0;n<400;n++){if(!await identityMatches(task.workerIdentity))break;await pause(30);task=await f.runtime.store.findTask(1);}
  task=await recoverWorkflow(f.runtime.store,1);
  if(['result.state-durable','result.complete','result.intent-durable'].includes(point)) {assert.equal(task.status,'needs_you');assert.ok(task.workflow.manifest);}
  else {assert.equal(task.status,'failed');await f.runtime.actions.rerunWork(1);await settled(f.runtime,1,'needs_you');}
});

for(const point of ['decision.intent-durable','decision.state-durable','decision.complete']) test(`decision recovery is idempotent / ${point}`,async t=>{
  const f=await fixture(t);const task=await f.runtime.actions.startWorkflow('probnaya-editorial');await settled(f.runtime,task.id,'needs_you');
  await crashCLI(f.base,point,['answer','1','accept']);await recoverWorkflow(f.runtime.store,1);
  const accepted=await f.runtime.actions.answerWork(1,{answer:'accept'});assert.equal(accepted.workflow.review,'accepted');assert.equal(accepted.workflow.decisions.length,1);
  await f.runtime.actions.answerWork(1,{action:'published',value:'https://example.invalid/post',operationId:'publication-one'});
  const repeated=await f.runtime.actions.answerWork(1,{answer:'published https://example.invalid/post'});assert.equal(repeated.workflow.publications.length,1);
  await assert.rejects(f.runtime.actions.answerWork(1,{action:'published',value:'https://example.invalid/different',operationId:'publication-one'}),/different payload/);
});

for(const point of ['external.intent-durable','external.output-durable']) test(`uncertain external effect never retries / ${point}`,async t=>{
  const f=await fixture(t,{generated:true});await crashCLI(f.base,point,['workflow','run','probnaya-editorial','external']);
  for(let n=0;n<400 && await identityMatches((await f.runtime.store.findTask(1)).workerIdentity);n++)await pause(30);
  await recoverWorkflow(f.runtime.store,1);await f.runtime.actions.rerunWork(1);const task=await settled(f.runtime,1,'needs_you');
  assert.equal(task.workflow.packageComplete,false);const calls=await fs.readFile(path.join(f.base,'calls'),'utf8').catch(()=> '');assert.equal(calls,point==='external.intent-durable'?'':'call\n');
  const report=await workflowDoctor(f.runtime.store);assert.ok(report.issues.some(i=>i.code==='UNCERTAIN_EXTERNAL'));
});

test('answer/rerun race and active refresh preserve the winning serialized state',async t=>{
  const f=await fixture(t,{adapter:'slow'});const task=await f.runtime.actions.startWorkflow('probnaya-editorial');
  await assert.rejects(f.runtime.actions.refreshWorkflow(task.id),/Stop the active run/);await settled(f.runtime,task.id,'needs_you');
  const results=await Promise.allSettled([f.runtime.actions.answerWork(1,{answer:'select 1'}),f.runtime.actions.rerunWork(1)]);assert.ok(results.some(r=>r.status==='fulfilled'));
  const current=await settled(f.runtime,1,'needs_you');assert.equal(current.runs.length,2);
  if(results[0].status==='fulfilled')assert.equal(current.workflow.selected,1);
  else {assert.equal(current.workflow.selected,undefined);assert.match(results[0].reason.message,/working/);}
});

test('cancel before worker signal handler and after adapter start',async t=>{
  const f=await fixture(t,{adapter:'slow'});
  for(const delay of [0,250]) {const task=await f.runtime.actions.startWorkflow('probnaya-editorial',{triggerKey:`cancel-${delay}`});if(delay)await pause(delay);await f.runtime.actions.cancelWork(task.id);const cancelled=await settled(f.runtime,task.id,'failed');assert.equal(cancelled.failure.kind,'cancelled');}
});

test('different triggers are serialized; second trigger refuses while first is active',async t=>{
  const f=await fixture(t,{adapter:'slow'});const results=await Promise.allSettled(['a','b'].map(triggerKey=>f.runtime.actions.startWorkflow('probnaya-editorial',{triggerKey})));assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await f.runtime.store.listTasks()).length,1);
});

test('future schemas, unknown fields, invalid timezone and corrupt schedules fail closed',async t=>{
  const f=await fixture(t);for(const patch of [{schemaVersion:2},{unknownField:true},{sources:[{...f.cfg.sources[0],status:'invented'}]}]){await fs.writeFile(f.configPath,JSON.stringify({...f.cfg,...patch}));await assert.rejects(readDefinition(f.runtime.store,'probnaya-editorial'));}
  await fs.writeFile(f.configPath,JSON.stringify(f.cfg));const s=await f.runtime.actions.scheduleWorkflow('probnaya-editorial','enable');assert.throws(()=>dueSlot({...s,timezone:'Not/AZone'}),/timezone/);assert.throws(()=>dueSlot({...s,nextDate:'2026-02-30'}),/date/);
  await fs.writeFile(path.join(f.base,'.work','schedules','probnaya-editorial.json'),'{');const tick=await f.runtime.actions.tickWorkflows();assert.ok(tick[0].error);assert.equal((await f.runtime.store.listTasks()).length,0);
});

test('missing source, outside symlink, oversized source and changed executable are visible failures',async t=>{
  for(const type of ['missing','symlink','large','adapter']) {
    const f=await fixture(t);const task=await f.runtime.actions.startWorkflow('probnaya-editorial');await settled(f.runtime,task.id,'needs_you');
    if(type==='adapter'){await fs.appendFile(path.join(f.base,'visual-adapter.mjs'),'\n// changed executable\n');}
    else {await fs.rm(path.join(packDir(f.runtime.store,task),'sources.json'));await fs.rm(path.join(f.base,'source.txt'));if(type==='symlink')await fs.symlink('/etc/passwd',path.join(f.base,'source.txt'));if(type==='large')await fs.writeFile(path.join(f.base,'source.txt'),'x'.repeat(256001));}
    await f.runtime.actions.rerunWork(1);const failed=await settled(f.runtime,1,'failed');assert.ok(failed.error);assert.notEqual(failed.workflow.packageComplete,true);
  }
});

test('doctor is read-only; torn JSONL tail requires explicit backed-up repair',async t=>{
  const f=await fixture(t);const task=await f.runtime.actions.startWorkflow('probnaya-editorial');await settled(f.runtime,1,'needs_you');
  for(let n=0;n<400 && await identityMatches((await f.runtime.store.findTask(1)).workerIdentity);n++)await pause(25);
  const log=f.runtime.store.eventLogPath(task.slug);await fs.appendFile(log,'{"torn":');
  // Quiesce only the fixture inspection service: heartbeat is an independent writer.
  const installation=await readInstallation(f.runtime.store),pid=(await jobState(installation.label)).pid,birth=await attemptIdentity(pid);
  assert.equal(await attemptIdentityMatches(birth),true);process.kill(pid,'SIGSTOP');await pause(100);
  try{
    const before=await filesHash(path.join(f.base,'.work'));
    const report=await workflowDoctor(f.runtime.store);assert.ok(report.issues.some(i=>i.code==='EVENT_LOG'));assert.deepEqual(await filesHash(path.join(f.base,'.work')),before);
  }finally{if(await attemptIdentityMatches(birth))process.kill(pid,'SIGCONT');}
  const repair=await repairWorkflow(f.runtime.store,'events',1);assert.ok(await fs.readFile(repair.backup));await f.runtime.store.readEvents(task.slug);
});

test('stale diagnostics cannot steal a live kernel lock; dead helper releases it; PID reuse is refused',async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'2f-kernel-lock-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
  const module=new URL('../src/core/lock.mjs',import.meta.url).href;
  const child=spawn(process.execPath,['--input-type=module','-e',`import{withLock}from ${JSON.stringify(module)};await withLock(${JSON.stringify(base)},async()=>{console.log('held');await new Promise(r=>setTimeout(r,30000));});`],{stdio:['ignore','pipe','pipe']});
  await new Promise(resolve=>child.stdout.once('data',resolve));assert.equal((await probeLock(base)).locked,true);child.kill('SIGKILL');await pause(150);assert.equal(await withLock(base,()=>42),42);
  const identity=await processIdentity(process.pid);assert.equal(await identityMatches(identity),true);assert.equal(await identityMatches({...identity,birth:'previous-generation'}),false);
});

test('acceptance refuses a deleted or modified required artifact',async t=>{
  const f=await fixture(t);const task=await f.runtime.actions.startWorkflow('probnaya-editorial');const done=await settled(f.runtime,task.id,'needs_you');
  await fs.appendFile(path.join(f.runtime.store.taskDir(task.slug),path.dirname(done.workflow.manifest),'topic-1.txt'),'tampered');await assert.rejects(f.runtime.actions.answerWork(1,{answer:'accept'}),/missing or changed/);
});

test('scheduler detects moved checkout/runtime/Node drift and multiple labels have separate paths',async t=>{
  const f=await fixture(t);const root=new URL('../',import.meta.url).pathname;
  const manifest={schemaVersion:1,workspaceId:'one',label:'work.test.one',base:f.base,cli:path.join(root,'src','cli.mjs'),runtimeFingerprint:await runtimeFingerprint(),node:await executableIdentity(process.execPath),python:await executableIdentity('/usr/bin/python3'),path:process.env.PATH,destination:'/tmp/test-one.plist',log:path.join(f.base,'.work','scheduler.log')};
  assert.deepEqual(await schedulerDrift(f.runtime.store,manifest),[]);assert.match((await schedulerDrift(f.runtime.store,{...manifest,base:'/moved'})).join(),/path changed/);
  await f.runtime.store.writeJson(path.join(f.base,'.work','scheduler','installation.json'),{...manifest,runtimeFingerprint:'old'});await assert.rejects(assertSchedulerCompatible(f.runtime.store),/drift/);
  assert.notEqual(agentPlist(manifest),agentPlist({...manifest,label:'work.test.two',base:'/another'}));
});

test('workflow surface projection separates acceptance from publication',()=>{
  const lines=workflowLines({id:1,status:'needs_you',blockedOn:{type:'decision'},runs:[{run:2}],workflow:{id:'sample',version:'1',trigger:'schedule',triggerKey:'schedule:2026-10-14',packageDigest:'abc',acceptedDigest:'abc'}});
  assert.match(lines.join('\n'),/ACCEPTANCE accepted · PUBLICATION unrecorded/);assert.match(lines.join('\n'),/schedule:2026-10-14/);
});

test('the same selection is repeatable after a later defer decision',async t=>{
  const f=await fixture(t);const task=await f.runtime.actions.startWorkflow('probnaya-editorial');await settled(f.runtime,task.id,'needs_you');
  await f.runtime.actions.answerWork(1,{answer:'select 1'});await f.runtime.actions.answerWork(1,{answer:'defer'});const selected=await f.runtime.actions.answerWork(1,{answer:'select 1'});assert.equal(selected.workflow.review,'selected');assert.equal(selected.workflow.decisions.length,3);
});

for(const kind of ['rerun','refresh']) for(const boundary of ['intent-durable','state-durable']) test(`${kind} journal recovery preserves old run / ${boundary}`,async t=>{
  const f=await fixture(t);const task=await f.runtime.actions.startWorkflow('probnaya-editorial');await settled(f.runtime,1,'needs_you');
  if(kind==='refresh'){f.cfg.version='2.0.0';await fs.writeFile(f.configPath,JSON.stringify(f.cfg));}
  const first=await fs.readFile(path.join(f.runtime.store.taskDir(task.slug),'runs','1','workflow-definition.json'),'utf8');
  await crashCLI(f.base,`${kind}.${boundary}`,kind==='rerun'?['rerun','1']:['workflow','refresh','1']);
  const recovered=await recoverWorkflow(f.runtime.store,1);assert.equal(recovered.workflow.version,kind==='refresh'?'2.0.0':f.cfg.version);
  assert.equal(await fs.readFile(path.join(f.runtime.store.taskDir(task.slug),'runs','1','workflow-definition.json'),'utf8'),first);
  if(kind==='rerun'){assert.equal(recovered.status,'failed');assert.ok(await f.runtime.store.readRunPrompt(recovered,2));}
});

test('scheduler crash after visible task before schedule commit deduplicates next tick',async t=>{
  const f=await fixture(t);await f.runtime.actions.scheduleWorkflow('probnaya-editorial','enable');
  const file=path.join(f.base,'.work','schedules','probnaya-editorial.json'),s=await f.runtime.store.readJson(file);await f.runtime.store.writeJson(file,{...s,nextDate:'2026-10-12',time:'00:00'});
  await crashCLI(f.base,'create.visible',['workflow','tick']);assert.equal((await f.runtime.store.listTasks()).length,1);
  const results=await f.runtime.actions.tickWorkflows();assert.equal(results[0].taskId,1);assert.equal((await f.runtime.store.listTasks()).length,1);assert.deepEqual(await f.runtime.actions.tickWorkflows(),[]);
});

test('loss of lock helper fences later writes',async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'2f-fence-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
  await assert.rejects(withLock(base,async()=>{
    const owner=JSON.parse(await fs.readFile(path.join(base,'owner.json'),'utf8'));process.kill(owner.helperPid,'SIGKILL');await pause(50);await durableWrite(path.join(base,'must-not-exist'),'no');
  }),/lock was lost/);await assert.rejects(fs.access(path.join(base,'must-not-exist')));
});

test('frozen definition tampering and future task schemas stop execution before adapters',async t=>{
  const f=await fixture(t);const task=await f.runtime.actions.startWorkflow('probnaya-editorial');await settled(f.runtime,1,'needs_you');
  const file=path.join(f.runtime.store.taskDir(task.slug),'task.json'),current=await f.runtime.store.findTask(1);
  await f.runtime.store.writeJson(file,{...current,workflow:{...current.workflow,definition:{...current.workflow.definition,name:'tampered'}}});
  await assert.rejects(f.runtime.actions.rerunWork(1),/digest/);const failed=await f.runtime.store.findTask(1);assert.equal(failed.status,'needs_you');
  await f.runtime.store.writeJson(file,{...failed,workflow:{...failed.workflow,schemaVersion:2}});await assert.rejects(f.runtime.store.listTasks(),/Unsupported/);
  // Restore for fixture cleanup; this is a disposable workspace.
  await f.runtime.store.writeJson(file,failed);
});

test('unknown decision fields and credential-bearing configured argv are refused',async t=>{
  const f=await fixture(t);const task=await f.runtime.actions.startWorkflow('probnaya-editorial');await settled(f.runtime,1,'needs_you');
  await assert.rejects(f.runtime.actions.answerWork(1,{action:'accept',unknown:true}),/Unknown decision/);
  const secret='DISPOSABLE-SECRET-TOKEN-123';process.env.DISPOSABLE_IMAGE_KEY=secret;t.after(()=>{delete process.env.DISPOSABLE_IMAGE_KEY;});
  f.cfg.adapters.image={argv:[f.cfg.adapters.python,secret],credentialEnv:['DISPOSABLE_IMAGE_KEY']};await fs.writeFile(f.configPath,JSON.stringify(f.cfg));await assert.rejects(readDefinition(f.runtime.store,'probnaya-editorial'),/credential values/);
});

test('lock release survives removed diagnostic directory',async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'2f-lock-cleanup-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
  await assert.rejects(withLock(base,async()=>{await fs.rm(base,{recursive:true,force:true});}),/ENOENT/);
  await pause(50);assert.equal(await withLock(base,()=>7),7);
});

test('temporary repair preserves archive bytes and backs up uncommitted temp files',async t=>{
  const f=await fixture(t);const task=await f.runtime.actions.startWorkflow('probnaya-editorial');await settled(f.runtime,1,'needs_you');
  const file=path.join(f.runtime.store.taskDir(task.slug),'.interrupted.json.test.tmp');await fs.writeFile(file,'uncommitted bytes');
  const report=await workflowDoctor(f.runtime.store);assert.ok(report.issues.some(i=>i.code==='TEMPORARY_FILES'));const repaired=await repairWorkflow(f.runtime.store,'temps',1);assert.equal(await fs.readFile(repaired.backups[0],'utf8'),'uncommitted bytes');await assert.rejects(fs.access(file));
});

test('published Observation may omit title, matching the existing Mostafa record',()=>{
  const record={number:'002',status:'published',published_at:'2026-09-22',author:'Mostafa',blocks:[{text:'body.txt'}]};
  assert.deepEqual(validatePublicRecord(record,'observation'),record);
  assert.throws(()=>validatePublicRecord({...record,title:7},'observation'),/Invalid Observation/);
});

test('a worker with a wrong launch token cannot fail the owned run',async t=>{
  const f=await fixture(t,{adapter:'slow'});const task=await f.runtime.actions.startWorkflow('probnaya-editorial');
  const worker=new URL('../src/worker.mjs',import.meta.url).pathname;
  await assert.rejects(exec(process.execPath,[worker,f.base,task.slug,'1','workflow','wrong-token']),/Command failed/);
  assert.equal((await f.runtime.store.findTask(task.id)).status,'working');await settled(f.runtime,task.id,'needs_you');
});

test('duplicate visible task IDs and exhausted sequences stop allocation',async t=>{
  const f=await fixture(t);const task=await f.runtime.actions.startWorkflow('probnaya-editorial');await settled(f.runtime,1,'needs_you');
  const duplicate=path.join(f.runtime.store.tasksDir(),'999-duplicate');await fs.mkdir(duplicate);await f.runtime.store.writeJson(path.join(duplicate,'task.json'),{...await f.runtime.store.findTask(1),slug:'999-duplicate'});
  await assert.rejects(f.runtime.store.listTasks(),/Duplicate task id/);const report=await workflowDoctor(f.runtime.store);assert.ok(report.issues.some(i=>i.code==='DUPLICATE_TASK_ID'));
  await fs.rm(duplicate,{recursive:true});await f.runtime.store.writeJson(path.join(f.base,'.work','task-sequence.json'),{schemaVersion:1,lastId:Number.MAX_SAFE_INTEGER});
  await assert.rejects(f.runtime.actions.startWorkflow('probnaya-editorial',{triggerKey:'exhausted'}),/exhausted/);assert.equal((await f.runtime.store.listTasks()).length,1);
});

test('unpublished records exclude private body bytes before source checkpointing',async t=>{
  for(const type of ['observation','engineering-record']) {
    const f=await fixture(t);await fs.writeFile(path.join(f.base,'source.txt'),'PRIVATE-UNPUBLISHED-BODY');
    const record=type==='observation'?{number:'003',status:'draft',author:'Fixture',blocks:[{text:'source.txt'}]}:{id:'private',status:'completed',title:'Private',summary:'Private',checks:'Private checks',verification:'passed',independentReview:'passed',userDecision:'accepted',publicEligible:false,projectStatus:'implemented_locally',publicEvidence:null};
    await fs.writeFile(path.join(f.base,'record.json'),JSON.stringify(record));
    f.cfg.sources=[{id:'fixture',type,repo:f.base,status:'published',publicEvidence:{url:'https://example.invalid/record'},record:'record.json',files:['record.json','source.txt'],topics:[]}];
    await fs.writeFile(f.configPath,JSON.stringify(f.cfg));const task=await f.runtime.actions.startWorkflow('probnaya-editorial');const done=await settled(f.runtime,task.id,'ready');
    const source=await f.runtime.store.readJson(path.join(packDir(f.runtime.store,task),'sources.json'));assert.equal(source.context.length,0);assert.ok(!JSON.stringify(source).includes('PRIVATE-UNPUBLISHED-BODY'));assert.match(await f.runtime.store.readTaskResult(done),/Warning:.*excluded/);
  }
});
