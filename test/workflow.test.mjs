import {nativeLaunchdEnabled} from './native-launchd-fixture.mjs';
import nodeTest from 'node:test';
const test=nativeLaunchdEnabled()?nodeTest:nodeTest.skip;
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRuntime } from '../src/runtime.mjs';
import { createStore } from '../src/core/store.mjs';
import { dueSlot, readDefinition } from '../src/core/workflows.mjs';
import { withLock } from '../src/core/lock.mjs';
import { recoverInterruptedRuns } from '../src/recover.mjs';
const exec = promisify(execFile);
const cli = new URL('../src/cli.mjs', import.meta.url).pathname;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

import { fixture, settled, packDir } from './workflow-fixture.mjs';

test('real CLI / detached worker / saved package / decisions / immutable history', async t => {
  const f = await fixture(t);
  const { stdout } = await exec(process.execPath, [cli, 'workflow', 'run', 'probnaya-editorial', 'same-trigger'], { cwd: f.base });
  assert.match(stdout, /#1/);
  let task = await settled(f.runtime, 1, 'needs_you');
  assert.equal(task.workflow.packageComplete, true);
  const pack = await f.runtime.store.readJson(path.join(packDir(f.runtime.store,task),'package.json'));
  assert.equal(pack.topics.length, 1); assert.equal(pack.visual.complete, true);
  assert.equal(pack.selectionOrigin, 'proposed preview');
  const archived=await f.runtime.store.readJson(path.join(f.runtime.store.taskDir(task.slug),'runs','1','artifacts','editorial','package.json'));
  assert.match(archived.visual.file,/runs[\/]1[\/]artifacts/);
  assert.ok(await f.runtime.store.exists(path.join(f.runtime.store.taskDir(task.slug),'runs','1','artifacts','editorial','visual.png')));
  const restarted = createRuntime(f.base);
  assert.equal((await restarted.actions.startWorkflow('probnaya-editorial', { triggerKey: 'same-trigger' })).id, task.id);
  assert.equal((await restarted.store.listTasks()).length,1);
  await assert.rejects(restarted.actions.allowWork(1), /decision/);
  await restarted.actions.answerWork(1,{answer:'changes 1 PROB–2026.10.14\n\nA corrected post.\n'});
  await assert.rejects(restarted.actions.answerWork(1,{answer:'accept'}), /complete review package/);
  await restarted.actions.rerunWork(1);
  task = await settled(restarted,1,'needs_you');
  const corrected=await restarted.store.readJson(path.join(packDir(restarted.store,task),'package.json'));
  assert.match(corrected.topics[0].post,/A corrected post/);
  await restarted.actions.answerWork(1,{answer:'accept'});
  await assert.rejects(restarted.actions.rerunWork(1), /new select or changes/);
  task=await restarted.actions.answerWork(1,{answer:'published https://www.linkedin.com/posts/test-confirmed'});
  assert.equal(task.workflow.review,'published');
  assert.ok(task.workflow.publication.url);
  await restarted.actions.closeWork(1);
  await restarted.actions.answerWork(1,{answer:'defer'});
  assert.equal((await restarted.store.findTask(1)).status,'done');
  const reopened=await restarted.actions.answerWork(1,{answer:'select 1'});
  assert.equal(reopened.status,'needs_you');
  assert.equal(reopened.workflow.publications.length,1);
  assert.equal(task.runs.length,2);
  const second=await restarted.actions.startWorkflow('probnaya-editorial',{triggerKey:'next-trigger'});
  assert.equal((await settled(restarted,second.id,'ready')).status,'ready');
  assert.match(await restarted.store.readTaskResult(second), /No material/);
});

test('concurrent duplicate triggers from separate CLI processes create one task', async t => {
  const f=await fixture(t);
  await Promise.all(Array.from({length:4},()=>exec(process.execPath,[cli,'workflow','run','probnaya-editorial','concurrent'],{cwd:f.base})));
  assert.equal((await f.runtime.store.listTasks()).length,1);
  await settled(f.runtime,1,'needs_you');
});

test('sequential workflow execution / cancel / resume by a new run', async t => {
  const f=await fixture(t,{adapter:'slow'});
  const task=await f.runtime.actions.startWorkflow('probnaya-editorial',{triggerKey:'cancel'});
  await assert.rejects(f.runtime.actions.startWorkflow('probnaya-editorial',{triggerKey:'other'}),/already executing/);
  await f.runtime.actions.cancelWork(task.id);
  const cancelled=await settled(f.runtime,task.id,'failed');
  assert.equal(cancelled.failure.kind,'cancelled');
  await f.runtime.actions.rerunWork(task.id);
  const resumed=await settled(f.runtime,task.id,'needs_you');
  assert.equal(resumed.runs.length,2);
});

test('adapter error is a failed run, never a complete package', async t => {
  const f=await fixture(t,{adapter:'fail'});
  const task=await f.runtime.actions.startWorkflow('probnaya-editorial');
  const failed=await settled(f.runtime,task.id,'failed');
  assert.match(failed.error,/Adapter failed/); assert.notEqual(failed.workflow.packageComplete,true);
});

test('duration limit aborts the actual adapter process', async t => {
  const f=await fixture(t,{adapter:'slow',duration:350});
  const task=await f.runtime.actions.startWorkflow('probnaya-editorial');
  assert.match((await settled(f.runtime,task.id,'failed')).error,/duration limit/);
});

test('worker crash / new runtime / recovery / rerun preserves source checkpoint', async t => {
  const f=await fixture(t,{adapter:'slow'});
  const task=await f.runtime.actions.startWorkflow('probnaya-editorial',{triggerKey:'crash'});
  const dir=packDir(f.runtime.store,task);
  for(let n=0;n<100 && !(await f.runtime.store.exists(path.join(dir,'sources.json')));n++) await pause(25);
  const source=await fs.readFile(path.join(dir,'sources.json'),'utf8');
  process.kill(-task.pid,'SIGKILL'); await pause(150);
  const restarted=createRuntime(f.base);
  await recoverInterruptedRuns(f.base,{log:()=>{}});
  assert.equal((await restarted.store.findTask(task.id)).failure.kind,'crashed');
  await restarted.actions.rerunWork(task.id);
  await settled(restarted,task.id,'needs_you');
  assert.equal(await fs.readFile(path.join(dir,'sources.json'),'utf8'),source);
});

test('paid image adapter has a durable single-attempt receipt across reruns', async t => {
  const f=await fixture(t,{generated:true});
  const task=await f.runtime.actions.startWorkflow('probnaya-editorial');
  await settled(f.runtime,task.id,'needs_you');
  await f.runtime.actions.answerWork(task.id,{answer:'select 1'});
  await f.runtime.actions.rerunWork(task.id); await settled(f.runtime,task.id,'needs_you');
  assert.equal(await fs.readFile(path.join(f.base,'calls'),'utf8'),'call\n');
  const dir=packDir(f.runtime.store,task);
  await fs.rm(path.join(dir,'visual.png'));
  await fs.rm(path.join(dir,'generated.png'));
  await f.runtime.actions.rerunWork(task.id); const incomplete=await settled(f.runtime,task.id,'needs_you');
  assert.equal(incomplete.workflow.packageComplete,false);
  assert.equal(await fs.readFile(path.join(f.base,'calls'),'utf8'),'call\n');
});

test('missed slots coalesce / DST / pause-resume / persisted schedule trigger', async t => {
  const f=await fixture(t);
  const now=new Date('2026-10-14T09:00:00Z');
  const schedule=await f.runtime.actions.scheduleWorkflow('probnaya-editorial','enable',{now});
  assert.equal(schedule.nextDate,'2026-10-16');
  assert.equal(dueSlot(schedule,new Date('2026-10-16T08:59:00Z')),null);
  assert.equal(dueSlot(schedule,new Date('2026-10-16T09:00:00Z')),'2026-10-16');
  assert.equal(dueSlot(schedule,new Date('2026-10-26T09:59:00Z')),'2026-10-24');
  assert.equal(dueSlot(schedule,new Date('2026-10-26T10:00:00Z')),'2026-10-26');
  await f.runtime.actions.scheduleWorkflow('probnaya-editorial','pause');
  assert.deepEqual(await f.runtime.actions.tickWorkflows({now:new Date('2026-10-26T12:00:00Z')}),[]);
  await f.runtime.actions.scheduleWorkflow('probnaya-editorial','resume');
  const fired=await f.runtime.actions.tickWorkflows({now:new Date('2026-10-26T12:00:00Z')});
  assert.equal(fired.length,1);assert.equal(fired[0].slot,'2026-10-26');
  await settled(f.runtime,fired[0].taskId,'needs_you');
  assert.deepEqual(await createRuntime(f.base).actions.tickWorkflows({now:new Date('2026-10-26T12:00:00Z')}),[]);
  assert.equal((await f.runtime.store.listTasks()).length,1);
});

test('dead lock owner is recoverable and definitions require read permissions', async t => {
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'2f-lock-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
  await fs.symlink('99999999-dead',path.join(base,'active'));
  assert.equal(await withLock(base,()=>42),42);
  const f=await fixture(t);f.cfg.permissions.readSources=[];
  await fs.writeFile(f.configPath,JSON.stringify(f.cfg));
  await assert.rejects(readDefinition(createStore(f.base),'probnaya-editorial'),/readSources/);
});

test('supplied publication history prevents proposing the same historical topic', async t => {
  const f = await fixture(t);
  f.cfg.sources[0].topics = [{ id: 'history-preserved', match: 'preserve', title: 'Preserve history', description: 'A local change.', detail: 'Existing topic.', visual: { kind: 'diagram', nodes: ['TASK', 'HISTORY'] } }];
  await fs.writeFile(f.configPath, JSON.stringify(f.cfg));
  const historyPath = path.join(path.dirname(f.configPath), 'history.json');
  const history = JSON.parse(await fs.readFile(historyPath, 'utf8'));
  history.publications.push({ id: 'past-fixture', status: 'published', topicKeys: ['fixture:history-preserved'], publicationUrl: null });
  await fs.writeFile(historyPath, JSON.stringify(history));
  const task = await f.runtime.actions.startWorkflow('probnaya-editorial');
  const done = await settled(f.runtime, task.id, 'ready');
  assert.match(await f.runtime.store.readTaskResult(done), /No material/);
  assert.equal(done.workflow.definition.publicationHistory.publications.length, 10);
  assert.equal(done.workflow.definition.publicationHistory.publications.at(-1).publicationUrl, null);
});

test('explicit settings refresh retains evidence and prior run artifacts', async t => {
  const f = await fixture(t);
  const task = await f.runtime.actions.startWorkflow('probnaya-editorial');
  const first = await settled(f.runtime, task.id, 'needs_you');
  const oldDefinition = await f.runtime.store.readJson(path.join(f.runtime.store.taskDir(task.slug), 'runs', '1', 'workflow-definition.json'));
  const evidence = await fs.readFile(path.join(packDir(f.runtime.store, task), 'sources.json'), 'utf8');
  await f.runtime.actions.answerWork(task.id, { answer: 'accept' });
  f.cfg.version = '2.0.0';
  f.cfg.visual.provenance = 'New user-supplied visual reference';
  await fs.writeFile(f.configPath, JSON.stringify(f.cfg));
  const refreshed = await f.runtime.actions.refreshWorkflow(task.id);
  assert.equal(refreshed.workflow.version, '2.0.0');
  assert.equal((await f.runtime.actions.getRun(task.id,1)).workflow.version, first.workflow.version);
  assert.equal(refreshed.workflow.packageComplete, false);
  assert.equal(refreshed.workflow.acceptedDigest, undefined);
  assert.equal(oldDefinition.version, first.workflow.version);
  await f.runtime.actions.rerunWork(task.id);
  const result = await settled(f.runtime, task.id, 'needs_you');
  assert.equal(result.workflow.packageComplete, true);
  assert.equal((await f.runtime.actions.getRun(task.id,2)).workflow.version, "2.0.0");
  assert.equal(await fs.readFile(path.join(packDir(f.runtime.store, task), 'sources.json'), 'utf8'), evidence);
  assert.deepEqual(await f.runtime.store.readJson(path.join(f.runtime.store.taskDir(task.slug), 'runs', '1', 'workflow-definition.json')), oldDefinition);
});
