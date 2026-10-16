import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { initProject } from '../src/project.mjs';
import { createRuntime } from '../src/runtime.mjs';
import { runEngineeringTask } from '../src/core/engineering.mjs';
import { renderTasks } from '../src/render.mjs';
import { workflowLines } from '../src/web/workflow.mjs';
import { primaryAction, initialState } from '../src/tui/state.mjs';

const zero = { moneyMicros: 0, tokens: 0, modelCalls: 0, providerCalls: 0 };
const good = 'export function parseTaskId(s) { return /^0*[1-9][0-9]*$/.test(s) ? Number(s) : null; }\n';
const bad = 'export function parseTaskId() { return null; }\n';
const execute = promisify(execFile);

async function fixture(t, opts = {}) {
  const base = await fs.mkdtemp('/private/tmp/0x2f-engineering-test-');
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  await initProject(base);
  await fs.mkdir(path.join(base, 'src'));
  await fs.mkdir(path.join(base, 'test'));
  await fs.writeFile(path.join(base, 'src/id.mjs'), bad);
  await fs.writeFile(path.join(base, 'test/id.test.mjs'), `import test from 'node:test'; import assert from 'node:assert/strict'; import {parseTaskId} from '../src/id.mjs'; test('zero padding and invalid input',()=>{assert.equal(parseTaskId('014'),14);assert.equal(parseTaskId(''),null);assert.equal(parseTaskId('0'),null);assert.equal(parseTaskId('x'),null);});\n`);
  const config = { schemaVersion: 1, enabled: true, currency: 'USD', providers: ['primary', 'secondary'], files: ['src/id.mjs', 'test/id.test.mjs'], writePaths: ['src/id.mjs'], check: [process.execPath, '--test', 'test/id.test.mjs'], limits: { ...zero, wallClockMs: 30000, implementationAttempts: 2 } };
  await fs.writeFile(path.join(base, '.work/engineering.json'), JSON.stringify(config));
  const calls = [];
  const inputs = [];
  const make = id => ({ id, displayName: id, integrationType: 'command', command: [process.execPath], capabilities: {}, async start(input) {
    calls.push(id); inputs.push(JSON.parse(input.prompt));
    if (opts.run) return opts.run({ id, input, base, calls });
    await fs.writeFile(path.join(base, 'src/id.mjs'), good);
    return { status: 'ready', result: 'Patched id parser.', usage: zero };
  } });
  const runtime = createRuntime(base, { providers: [make('primary'), make('secondary')], node: { id: 'local', async startExecution() { return null; } } });
  const task = await runtime.actions.createWork({ brief: 'Fix parseTaskId("014"); preserve API; no commit.' });
  const args = { store: runtime.store, slug: task.slug, token: task.engineering.driver.token, providers: runtime.providers, qualify: p => ({ maximum: opts.maximum ?? zero, execute: input => p.start(input) }) };
  return { base, runtime, task, calls, inputs, args };
}

test('A: actual file patch + real node test, one primary, durable task and immutable inputs', async t => {
  const f = await fixture(t);
  const task = await runEngineeringTask(f.args);
  assert.equal(task.status, 'ready');
  assert.deepEqual(f.calls, ['primary']);
  assert.deepEqual(task.runs.map(r => r.purpose), ['implement', 'verify']);
  assert.equal(task.engineering.verification.code, 0);
  assert.equal(task.engineering.verification.sourceUnchanged, true);
  const root = f.runtime.store.taskDir(task.slug);
  assert.equal(await fs.readFile(path.join(root, 'runs/1/inputs/files/src/id.mjs'), 'utf8'), bad);
  assert.equal(await fs.readFile(path.join(root, 'runs/1/artifacts/files/src/id.mjs'), 'utf8'), good);
  assert.match(await fs.readFile(path.join(root, 'result.md'), 'utf8'), /Verified artifact:/);
  assert.equal((await f.runtime.actions.getRun(task.id, 2)).purpose, 'verify');
  assert.equal((await f.runtime.actions.getWork(task.id)).id, task.id);
  await assert.rejects(f.runtime.actions.rerunWork(task.id), /cannot bypass/);
  assert.equal((await f.runtime.actions.closeWork(task.id)).status, 'done');
});

test('B: failing real regression automatically fixes with same primary and a narrow handoff', async t => {
  const f = await fixture(t, { run: async ({ base, calls }) => {
    if (calls.length === 2) await fs.writeFile(path.join(base, 'src/id.mjs'), good);
    return { status: 'ready', result: calls.length === 1 ? 'CLAIM_WITHOUT_FIX' : 'Fixed.', usage: zero };
  } });
  const task = await runEngineeringTask(f.args);
  assert.equal(task.status, 'ready');
  assert.deepEqual(f.calls, ['primary', 'primary']);
  assert.deepEqual(task.runs.map(r => r.purpose), ['implement', 'verify', 'fix', 'verify']);
  assert.equal(f.inputs[1].failedCheck.code, 1);
  assert.ok(f.inputs[1].previousArtifact.digest);
  assert.doesNotMatch(JSON.stringify(f.inputs[1]), /CLAIM_WITHOUT_FIX/);
  assert.equal(task.engineering.decisions[1].reason, 'verification_failed');
});

test('observable executor unavailable trigger transfers the same task to secondary without manual choice', async t => {
  const f = await fixture(t, { run: async ({ id, base }) => {
    if (id === 'primary') return { status: 'failed', error: 'fixture executable unavailable', failure: { kind: 'unavailable' }, usage: zero };
    await fs.writeFile(path.join(base, 'src/id.mjs'), good);
    return { status: 'ready', result: 'secondary fixed', usage: zero };
  } });
  const task = await runEngineeringTask(f.args);
  assert.equal(task.status, 'ready');
  assert.deepEqual(f.calls, ['primary', 'secondary']);
  assert.deepEqual(task.runs.map(r => r.provider), ['primary', 'secondary', 'local-checks']);
  assert.equal(task.engineering.decisions[1].reason, 'executor_unavailable');
  assert.equal(f.inputs[1].executorFailure.reason, 'unavailable');
  assert.match(f.inputs[1].executorFailure.resultRef, /runs\/1\/result/);
});

test('D: two bad patches stop; no third implementation and no reviewer', async t => {
  const f = await fixture(t, { run: async () => ({ status: 'ready', result: 'Still broken', usage: zero }) });
  const task = await runEngineeringTask(f.args);
  assert.equal(task.status, 'needs_you');
  assert.equal(task.blockedOn.code, 'attempt_limit');
  assert.deepEqual(f.calls, ['primary', 'primary']);
  assert.equal(task.runs.length, 4);
});

test('E: reserve maximum before dispatch; insufficient budget spends nothing', async t => {
  const f = await fixture(t, { maximum: { ...zero, tokens: 1 } });
  const task = await runEngineeringTask(f.args);
  assert.equal(task.blockedOn.code, 'budget_limit');
  assert.deepEqual(f.calls, []);
});

test('unknown usage retains reservation and stops before checks or another call', async t => {
  const f = await fixture(t, { run: async () => ({ status: 'ready', result: 'usage absent' }) });
  const task = await runEngineeringTask(f.args);
  assert.equal(task.blockedOn.code, 'usage_unknown');
  assert.equal(task.runs[0].usage.confirmed, null);
  assert.equal(task.engineering.budget.reservations.length, 1);
  assert.equal(task.engineering.budget.uncertain.length, 1);
  assert.equal(task.runs.length, 1);
});

test('two concurrent driver deliveries allocate/execute only one run sequence', async t => {
  const f = await fixture(t);
  await Promise.all([runEngineeringTask(f.args), runEngineeringTask(f.args)]);
  const task = await f.runtime.actions.getWork(f.task.id);
  assert.equal(task.status, 'ready');
  assert.deepEqual(f.calls, ['primary']);
  assert.equal(task.engineering.decisions.length, 1);
  await runEngineeringTask(f.args);
  assert.deepEqual(f.calls, ['primary']);
});

test('scope drift blocks success even if the executor claims completion', async t => {
  const f = await fixture(t, { run: async ({ base }) => {
    await fs.writeFile(path.join(base, 'unexpected.txt'), 'outside scope');
    return { status: 'ready', result: 'done', usage: zero };
  } });
  const task = await runEngineeringTask(f.args);
  assert.equal(task.blockedOn.code, 'scope_changed');
  assert.equal(task.runs.length, 1);
});

test('mutating verification cannot establish a verified result', async t => {
  const f = await fixture(t);
  const task = await runEngineeringTask({ ...f.args, checkRunner: async () => {
    await fs.writeFile(path.join(f.base, 'src/id.mjs'), bad);
    return { code: 0, output: 'claimed passing', error: null };
  } });
  assert.equal(task.blockedOn.code, 'artifact_changed');
  assert.equal(task.engineering.verification.sourceUnchanged, false);
});

test('archived bytes are rechecked rather than trusting the old manifest', async t => {
  const f = await fixture(t);
  const task = await runEngineeringTask({ ...f.args, checkRunner: async () => {
    await fs.writeFile(path.join(f.runtime.store.taskDir(f.task.slug), 'runs/1/artifacts/files/src/id.mjs'), bad);
    return { code: 0, output: 'claimed passing', error: null };
  } });
  assert.equal(task.blockedOn.code, 'execution_uncertain');
  assert.match(task.blockedOn.text, /Archived artifact bytes changed/);
});

test('ordinary production worker fails closed without injected executor qualification; CLI task remains readable', async t => {
  const f = await fixture(t);
  const worker = new URL('../src/engineering-worker.mjs', import.meta.url).pathname;
  await execute(process.execPath, [worker, f.base, f.task.slug, '1', f.task.engineering.driver.token]);
  const task = await f.runtime.actions.getWork(f.task.id);
  assert.equal(task.blockedOn.code, 'execution_unqualified');
  assert.deepEqual(f.calls, []);
  const cli = new URL('../src/cli.mjs', import.meta.url).pathname;
  const opened = await execute(process.execPath, [cli, 'open', '1'], { cwd: f.base });
  assert.match(opened.stdout, /No executor proves/);
});

test('same durable purpose/next/cost projection is reusable in terminal and web', async t => {
  const f = await fixture(t);
  const task = await runEngineeringTask(f.args);
  assert.match(workflowLines(task).join('\n'), /PURPOSE VERIFY/);
  assert.match(renderTasks([task]), /NEXT ACCEPT/);
});

test('acceptance rechecks live bytes and rejects changes since verification', async t => {
  const f = await fixture(t);
  const task = await runEngineeringTask(f.args);
  await fs.writeFile(path.join(f.base, 'src/id.mjs'), bad);
  await assert.rejects(f.runtime.actions.closeWork(task.id), /changed; acceptance refused/);
  assert.equal((await f.runtime.actions.getWork(task.id)).status, 'ready');
});

test('check environment failure does not spend a second implementation attempt', async t => {
  const f = await fixture(t);
  const task = await runEngineeringTask({ ...f.args, checkRunner: async () => ({ code: null, error: 'ETIMEDOUT', output: 'environment unavailable' }) });
  assert.equal(task.blockedOn.code, 'check_environment');
  assert.deepEqual(f.calls, ['primary']);
});

test('stale driver token is refused before any executor invocation', async t => {
  const f = await fixture(t);
  await assert.rejects(runEngineeringTask({ ...f.args, token: 'wrong-token' }), /Stale engineering/);
  assert.deepEqual(f.calls, []);
});

test('a constraint added mid-run is retained and blocks automatic verification', async t => {
  let runtime;
  const f = await fixture(t, { run: async ({ base }) => {
    await runtime.actions.noteWork(1, { note: 'Preserve this additional constraint.' });
    await fs.writeFile(path.join(base, 'src/id.mjs'), good);
    return { status: 'ready', result: 'patched', usage: zero };
  } });
  runtime = f.runtime;
  const task = await runEngineeringTask(f.args);
  assert.equal(task.blockedOn.code, 'input_changed');
  assert.equal(task.context.notes[0].text, 'Preserve this additional constraint.');
});

test('blocked engineering UI saves an answer without offering a policy-bypassing rerun', () => {
  const action = primaryAction({ id: 1, engineering: true, state: 'needs', provider: 'primary', halt: { kind: 'decision' } }, initialState());
  assert.equal(action.input, 'answer-save');
});

test('real CLI new launches the real engineering worker and gates without requiring the legacy default', async t => {
  const f = await fixture(t);
  const cli = new URL('../src/cli.mjs', import.meta.url).pathname;
  const missing = path.join(f.base, 'missing-native');
  const created = await execute(process.execPath, [cli, 'new', 'New engineering task, automatic executor selection'], { cwd: f.base, env: { ...process.env, CLAUDE_BIN: missing } });
  assert.match(created.stdout, /Created #002/);
  let task;
  for (let i = 0; i < 100; i++) {
    task = await f.runtime.actions.getWork(2);
    if (task.status !== 'working') break;
    await new Promise(resolve => setTimeout(resolve, 30));
  }
  assert.equal(task.status, 'needs_you');
  assert.equal(task.blockedOn.code, 'execution_unqualified');
  // Wait for the detached writer to close before disposable workspace cleanup.
  for (let i = 0; i < 100; i++) {
    try { process.kill(task.pid, 0); } catch { break; }
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.deepEqual(f.calls, []);
});
