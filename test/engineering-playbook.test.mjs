import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { runEngineeringTask } from '../src/core/engineering.mjs';
import { createRuntime } from '../src/runtime.mjs';
import { playbookFixture, zeroUsage, brokenParser } from './engineering-playbook-fixture.mjs';

test('engineering playbook reaches decide with one primary and no independent-review trigger', async t => {
  const f = await playbookFixture(t); const task = await runEngineeringTask(f.args);
  assert.equal(task.status, 'ready', task.blockedOn?.text);
  assert.deepEqual(task.runs.map(r => r.purpose), ['investigate', 'implement', 'verify', 'review']);
  assert.deepEqual(f.calls.map(c => c.id), ['primary', 'primary']);
  assert.equal(task.engineering.next, 'accept');
  assert.equal(task.engineering.playbook.dispatch, null);
  assert.equal((await f.runtime.actions.closeWork(task.id)).status, 'done');
});

test('observed primary unavailability automatically changes executor and retains narrow failure evidence', async t => {
  const f = await playbookFixture(t, { execute: async ({ id }) => id === 'primary' ? { status: 'failed', failure: { kind: 'unavailable' }, error: 'observed fixture unavailable', usage: zeroUsage } : null });
  const task = await runEngineeringTask(f.args);
  assert.equal(task.status, 'ready', task.blockedOn?.text);
  assert.deepEqual(f.calls.map(c => c.id), ['primary', 'secondary', 'secondary']);
  assert.equal(f.calls[1].handoff.executorFailure, undefined); // investigation uses evidence refs, not prior prose
  assert.equal(f.calls[1].handoff.refs.priorFailure.path, 'runs/1/result.md');
  assert.equal(task.engineering.decisions[1].reason, 'executor_unavailable');
});

test('contradictory verification creates one bounded fix with the exact failed check', async t => {
  const f = await playbookFixture(t, { execute: async ({ input }) => input.purpose === 'implement' ? { status: 'ready', result: 'CLAIM_WITHOUT_PATCH', usage: zeroUsage } : null });
  const task = await runEngineeringTask(f.args);
  assert.equal(task.status, 'ready', task.blockedOn?.text);
  const fix = f.calls.find(c => c.purpose === 'fix');
  assert.equal(fix.handoff.failedCheck.code, 1);
  assert.ok(fix.handoff.refs.artifact.digest);
  assert.doesNotMatch(JSON.stringify(fix.handoff), /CLAIM_WITHOUT_PATCH/);
});

test('unsupported diagnosis reinvestigates twice and stops without implementation', async t => {
  const f = await playbookFixture(t, { execute: async () => ({ status: 'ready', result: 'confidence only', usage: zeroUsage, engineering: { diagnosis: { confirmed: true, evidence: [] } } }) });
  const task = await runEngineeringTask(f.args);
  assert.equal(task.blockedOn.code, 'diagnosis_unconfirmed');
  assert.equal(f.calls.length, 2);
  assert.ok(f.calls.every(c => c.purpose === 'investigate'));
});

test('attempt limit persists a bounded stop instead of a third implementation', async t => {
  const f = await playbookFixture(t, { execute: async ({ input }) => ['implement', 'fix'].includes(input.purpose) ? { status: 'ready', result: 'still broken', usage: zeroUsage } : null });
  const task = await runEngineeringTask(f.args);
  assert.equal(task.blockedOn.code, 'attempt_limit');
  assert.equal(f.calls.filter(c => ['implement', 'fix'].includes(c.purpose)).length, 2);
});

test('no-change diagnosis completes with checks and no implementation/patch', async t => {
  const f = await playbookFixture(t, { noChange: true }); const task = await runEngineeringTask(f.args);
  assert.equal(task.status, 'ready', task.blockedOn?.text);
  assert.equal(task.engineering.outcome.kind, 'no_change');
  assert.deepEqual(f.calls.map(c => c.purpose), ['investigate']);
});

test('same task resumes from saved purpose boundary with decisions and counts preserved', async t => {
  const f = await playbookFixture(t);
  const paused = await runEngineeringTask({ ...f.args, pauseAfterPurpose: purpose => purpose === 'investigate' });
  assert.equal(paused.blockedOn.code, 'paused_boundary');
  await f.runtime.actions.answerWork(paused.id, { answer: 'Keep API stable.' });
  const fresh = createRuntime(f.base, { providers: f.extra, node: f.node });
  const resumed = await fresh.actions.rerunWork(paused.id);
  assert.equal(resumed.id, paused.id);
  const done = await runEngineeringTask({ ...f.args, store: fresh.store, providers: fresh.providers, token: resumed.engineering.driver.token });
  assert.equal(done.status, 'ready', done.blockedOn?.text);
  assert.deepEqual(f.calls.map(c => c.purpose), ['investigate', 'implement']);
  assert.equal(f.calls[1].handoff.decisions[0].answer, 'Keep API stable.');
  assert.equal(done.engineering.playbook.agentRuns, 2);
  assert.ok(done.engineering.playbook.activeMs >= paused.engineering.playbook.activeMs);
});

test('uncertain dispatched call cannot be replayed by rerun', async t => {
  const f = await playbookFixture(t, { execute: async () => { throw new Error('lost outcome after dispatch'); } });
  const task = await runEngineeringTask(f.args);
  assert.equal(task.blockedOn.code, 'execution_uncertain');
  assert.ok(task.engineering.playbook.dispatch);
  await assert.rejects(f.runtime.actions.rerunWork(task.id), /uncertain calls/);
  assert.equal(f.calls.length, 1);
});

test('read-only investigation changing source stops with retained evidence', async t => {
  const f = await playbookFixture(t, { execute: async ({ base, source }) => { await fs.writeFile(path.join(base, source), brokenParser + '// changed'); return { status: 'ready', result: 'changed investigation', usage: zeroUsage }; } });
  const task = await runEngineeringTask(f.args);
  assert.equal(task.blockedOn.code, 'read_only_violation');
  assert.equal(f.calls.length, 1);
});
