import {nativeLaunchdEnabled} from './native-launchd-fixture.mjs';
import nodeTest from 'node:test';
const test=nativeLaunchdEnabled()?nodeTest:nodeTest.skip;
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fixture, settled, packDir, pause, cli } from './workflow-fixture.mjs';
import { createStore } from '../src/core/store.mjs';
import { readDefinition } from '../src/core/workflows.mjs';
import { workflowDoctor, recoverWorkflow, repairWorkflow } from '../src/core/workflow-doctor.mjs';
import { identityMatches } from '../src/core/process-identity.mjs';
const exec = promisify(execFile);
async function crash(base, point, args) {
  await assert.rejects(exec(process.execPath, [cli, ...args], { cwd: base,
    env: { ...process.env, WORKFLOW_TEST_MODE: '1', WORKFLOW_TEST_CRASH_AT: point } }), error => error.signal === 'SIGKILL');
}
async function exited(store, id) {
  for (let n = 0; n < 200; n++) {
    if (!await identityMatches((await store.findTask(id)).workerIdentity)) return;
    await pause(25);
  }
  throw new Error('Fixture worker did not exit.');
}

test('pending decision fences later mutations and recovers from a fresh process', async t => {
  const f = await fixture(t); const task = await f.runtime.actions.startWorkflow('probnaya-editorial');
  await settled(f.runtime, 1, 'needs_you'); await exited(f.runtime.store, 1);
  await crash(f.base, 'decision.intent-durable', ['answer', '1', 'accept']);
  const meta = path.join(f.runtime.store.taskDir(task.slug), 'task.json');
  const answer = path.join(f.runtime.store.taskDir(task.slug), 'answer.json');
  const before = await fs.readFile(meta); const savedAnswer = await fs.readFile(answer);
  for (const args of [['note', '1', 'intervening'], ['answer', '1', 'defer'], ['rerun', '1'], ['close', '1'], ['workflow', 'refresh', '1']]) {
    await assert.rejects(exec(process.execPath, [cli, ...args], { cwd: f.base }), /pending|recover/i);
    assert.deepEqual(await fs.readFile(meta), before); assert.deepEqual(await fs.readFile(answer), savedAnswer);
  }
  await exec(process.execPath, [cli, 'workflow', 'recover', '1'], { cwd: f.base });
  const recovered = await createStore(f.base).findTask(1);
  assert.equal(recovered.workflow.review, 'accepted'); assert.equal(recovered.workflow.decisions.length, 1);
  const events = await f.runtime.store.readEvents(task.slug);
  assert.equal(events.filter(e => e.type === 'task.answered').length, 1);
  assert.ok(events.some(e => e.type === 'task.updated' && e.eventId?.startsWith(recovered.lastWorkflowOperation)));
});

test('acceptance replay rechecks archive bytes before committing approval', async t => {
  const f = await fixture(t); const task = await f.runtime.actions.startWorkflow('probnaya-editorial');
  const done = await settled(f.runtime, 1, 'needs_you'); await exited(f.runtime.store, 1);
  await crash(f.base, 'decision.intent-durable', ['answer', '1', 'accept']);
  const artifact = path.join(f.runtime.store.taskDir(task.slug), path.dirname(done.workflow.manifest), 'topic-1.txt');
  const original = await fs.readFile(artifact); await fs.appendFile(artifact, 'changed after intent');
  await assert.rejects(exec(process.execPath, [cli, 'workflow', 'recover', '1'], { cwd: f.base }), /missing or changed/);
  assert.equal((await f.runtime.store.findTask(1)).workflow.acceptedDigest, undefined);
  await fs.writeFile(artifact, original); await recoverWorkflow(f.runtime.store, 1);
});

test('complete JSON without the final newline cannot corrupt the next event append', async t => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), '2f-event-tail-'));
  t.after(() => fs.rm(base, { recursive: true, force: true })); const store = createStore(base);
  const task = await store.createTask({ title: 'Tail fixture', brief: 'Tail fixture', prompt: 'fixture' });
  await store.updateTask({ ...task, status: 'failed' }); // no worker was launched
  const file = store.eventLogPath(task.slug); const original = JSON.stringify({ type: 'task.created', taskId: task.id });
  await fs.writeFile(file, original);
  await assert.rejects(store.appendEvent(task.slug, { type: 'task.note', taskId: task.id }), /tail|newline|repair/i);
  assert.equal(await fs.readFile(file, 'utf8'), original);
  const repaired = await repairWorkflow(store, 'events', task.id);
  assert.equal(await fs.readFile(repaired.backup, 'utf8'), original);
  await store.appendEvent(task.slug, { type: 'task.note', taskId: task.id });
  assert.equal((await store.readEvents(task.slug)).length, 2);
});

test('source record must be in its explicit file allowlist; private runtime paths are refused', async t => {
  const f = await fixture(t); const original = structuredClone(f.cfg);
  for (const source of [
    { ...original.sources[0], type: 'engineering-record', record: 'unlisted.json' },
    { ...original.sources[0], files: ['.work/project.md'] },
    { ...original.sources[0], type: 'observation', record: '.env', files: ['.env'] }
  ]) {
    await fs.writeFile(f.configPath, JSON.stringify({ ...original, sources: [source] }));
    await assert.rejects(readDefinition(f.runtime.store, 'probnaya-editorial'), /allowlist|Private source|private source/);
  }
});

test('declared credentials are refused in material snapshots before task creation', async t => {
  const f = await fixture(t); const name = 'STABILIZATION_FIXTURE_KEY'; const secret = 'only-a-disposable-secret-53';
  process.env[name] = secret; t.after(() => { delete process.env[name]; });
  f.cfg.adapters.image = { argv: [f.cfg.adapters.python, 'generate', '{output}'], credentialEnv: [name] };
  await fs.writeFile(f.configPath, JSON.stringify(f.cfg));
  await fs.appendFile(path.join(path.dirname(f.configPath), 'rules.md'), secret);
  await assert.rejects(f.runtime.actions.startWorkflow('probnaya-editorial'), /[Cc]redential/);
  assert.equal((await f.runtime.store.listTasks()).length, 0);
});

test('doctor reports malformed legacy lock without changing workspace files', async t => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), '2f-doctor-malformed-'));
  t.after(() => fs.rm(base, { recursive: true, force: true })); const store = createStore(base);
  const root = path.join(store.workDir(), 'workflow-lock'); await fs.mkdir(root, { recursive: true });
  await fs.writeFile(path.join(root, 'active'), 'not a symlink');
  const report = await workflowDoctor(store);
  assert.equal(report.healthy, false); assert.ok(report.issues.some(i => i.code === 'LEGACY_LOCK'));
  assert.deepEqual(await fs.readdir(root), ['active']);
});

test('doctor validates frozen task metadata and checkpoint hashes', async t => {
  const f = await fixture(t); const task = await f.runtime.actions.startWorkflow('probnaya-editorial');
  const done = await settled(f.runtime, 1, 'needs_you'); await exited(f.runtime.store, 1);
  const meta = path.join(f.runtime.store.taskDir(task.slug), 'task.json');
  await f.runtime.store.writeJson(meta, { ...done, workflow: { ...done.workflow, review: 'invented' } });
  try { const report = await workflowDoctor(f.runtime.store); assert.ok(report.issues.some(i => i.code === 'TASK_STATE')); }
  finally { await f.runtime.store.writeJson(meta, done); }
  const checkpoint = path.join(packDir(f.runtime.store, task), 'sources.json');
  const source = await f.runtime.store.readJson(checkpoint); source.context[0].text += 'tampered'; await f.runtime.store.writeJson(checkpoint, source);
  const report = await workflowDoctor(f.runtime.store); assert.ok(report.issues.some(i => i.code === 'SOURCE_CHECKPOINT'));
  await f.runtime.actions.rerunWork(1); assert.match((await settled(f.runtime, 1, 'failed')).error, /hash|digest/i);
});

test('one mismatched schedule does not prevent other schedules or persisted tick health', async t => {
  const f = await fixture(t); await f.runtime.actions.scheduleWorkflow('probnaya-editorial', 'enable');
  const dir = path.join(f.runtime.store.workDir(), 'schedules');
  const valid = await f.runtime.store.readJson(path.join(dir, 'probnaya-editorial.json'));
  await f.runtime.store.writeJson(path.join(dir, 'aaa-wrong.json'), { ...valid, nextDate: '2026-10-12', time: '00:00' });
  await f.runtime.store.writeJson(path.join(dir, 'probnaya-editorial.json'), { ...valid, nextDate: '2026-10-12', time: '00:00' });
  const results = await f.runtime.actions.tickWorkflows({ now: new Date('2026-10-14T12:00:00Z') });
  assert.ok(results.some(r => r.error)); assert.ok(results.some(r => r.taskId === 1));
  assert.equal((await f.runtime.store.readJson(path.join(f.runtime.store.workDir(), 'scheduler', 'health.json'))).success, false);
  await settled(f.runtime, 1, 'needs_you');
});

for (const action of ['timeout', 'cancel']) test(`${action} terminates the real adapter process group`, async t => {
  const f = await fixture(t, { adapter: 'slow', duration: action === 'timeout' ? 6000 : 20000, sleepMs:10000 });
  const executable = f.cfg.adapters.python, marker = path.join(f.base, 'adapter-pid');
  await fs.writeFile(executable, (await fs.readFile(executable, 'utf8')).replace('else { const spec=', `else { fs.writeFileSync(${JSON.stringify(marker)}, String(process.pid)); const spec=`));
  const task = await f.runtime.actions.startWorkflow('probnaya-editorial');
  for (let n = 0; n < 500 && !await f.runtime.store.exists(marker); n++) await pause(20);
  const pid = Number(await fs.readFile(marker, 'utf8'));
  const { processIdentity } = await import('../src/core/process-identity.mjs'); const identity = await processIdentity(pid);
  assert.ok(identity && !identity.unknown);
  t.after(async () => {
    if(await identityMatches(identity)){const {listAttempts,attemptAction}=await import('../src/core/workflow-supervision.mjs');for(const r of await listAttempts(f.runtime.store))if(r.request.pin.realPath===executable)await attemptAction(f.runtime.store,'cancel',r.request.id);}
  });
  if (action === 'cancel') await f.runtime.actions.cancelWork(task.id);
  const done = await settled(f.runtime, 1, 'failed');
  assert.match(done.error, action === 'timeout' ? /duration limit/ : /Cancelled/);
  for (let n = 0; n < 100 && await identityMatches(identity); n++) await pause(20);
  assert.equal(await identityMatches(identity), false);
});

test('LaunchAgent stop refuses loaded or unknown state after a failed bootout', async () => {
  const { stopLaunchAgent } = await import('../src/core/workflow-scheduler.mjs');
  const bootoutError = new Error('fixture bootout failure');
  await assert.rejects(stopLaunchAgent('fixture', async (_, args) => {
    if (args[0] === 'bootout') throw bootoutError;
  }), /still loaded/);
  await assert.rejects(stopLaunchAgent('fixture', async () => { throw bootoutError; }), /Could not verify/);
  await stopLaunchAgent('fixture', async (_, args) => {
    if (args[0] === 'bootout') throw bootoutError;
    throw Object.assign(new Error('absent fixture service'), { code: 113, stderr: 'Could not find service "fixture"' });
  });
});

test('malformed private JSON never echoes its contents in diagnostic errors', async t => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), '2f-json-redaction-'));
  t.after(() => fs.rm(base, { recursive: true, force: true })); const store = createStore(base);
  const secret = 'SECRET42'; const file = path.join(base, 'broken.json');
  await fs.writeFile(file, secret);
  await assert.rejects(store.readJson(file), error => !error.message.includes(secret));
  const task = await store.createTask({ title: 'Redaction fixture', brief: 'fixture', prompt: 'fixture' });
  await fs.writeFile(store.eventLogPath(task.slug), secret);
  await assert.rejects(store.readEvents(task.slug), error => !error.message.includes(secret));
  await store.updateTask({ ...task, status: 'failed' });
  await fs.writeFile(store.eventLogPath(task.slug), secret + '\n{"torn":');
  await assert.rejects(repairWorkflow(store, 'events', task.id), error => !error.message.includes(secret));
});
