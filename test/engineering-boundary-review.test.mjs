import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { runEngineeringTask } from '../src/core/engineering.mjs';
import { playbookFixture, zeroUsage } from './engineering-playbook-fixture.mjs';

for (const risk of [false, true]) test(`acceptance rechecks ${risk ? 'independent' : 'local'} review receipt`, async t => {
  const f = await playbookFixture(t, { risk }); const task = await runEngineeringTask(f.args);
  assert.equal(task.status, 'ready', task.blockedOn?.text);
  const file = path.join(f.runtime.store.taskDir(task.slug), task.engineering.playbook.review.path);
  const old = await fs.readFile(file);
  await fs.writeFile(file, JSON.stringify({ artifact: 'changed', findings: [] }));
  await assert.rejects(f.runtime.actions.closeWork(task.id), /review changed/);
  await fs.writeFile(file, old);
  assert.equal((await f.runtime.actions.closeWork(task.id)).status, 'done');
});

test('nonexistent diagnosis evidence with no hash cannot authorize implementation', async t => {
  const f = await playbookFixture(t, { execute: async () => ({ status: 'ready', result: 'unsupported', usage: zeroUsage, engineering: { diagnosis: { confirmed: true, evidence: [{ path: 'missing.mjs' }] } } }) });
  const task = await runEngineeringTask(f.args);
  assert.equal(task.blockedOn.code, 'diagnosis_unconfirmed');
  assert.deepEqual(f.calls.map(c => c.purpose), ['investigate', 'investigate']);
});

test('missing finding path/hash cannot confirm even a failing approved reproduction', async t => {
  const f = await playbookFixture(t, { risk: true, config: { reviewChecks: { fail: [process.execPath, '-e', 'process.exit(1)'] } }, execute: async ({ input, handoff }) => input.purpose === 'review' ? { status: 'ready', result: 'unsupported', usage: zeroUsage, engineering: { review: { findings: [{ severity: 'high', message: 'No actual evidence', evidence: { artifactDigest: handoff.refs.artifact.contentDigest }, checkId: 'fail' }] } } } : null });
  const task = await runEngineeringTask(f.args);
  assert.equal(task.blockedOn.code, 'review_decision');
  assert.equal(task.runs.at(-1).review.findings[0].confirmed, false);
  assert.equal(f.calls.filter(c => c.purpose === 'fix').length, 0);
});

for (const cancel of [false, true]) test(`slow qualification cannot dispatch after ${cancel ? 'cancellation' : 'deadline'}`, async t => {
  const f = await playbookFixture(t, { config: { limits: { ...zeroUsage, wallClockMs: cancel ? 30000 : 10, implementationAttempts: 2 } } });
  const controller = new AbortController();
  const task = await runEngineeringTask({ ...f.args, signal: controller.signal, qualify: async p => {
    if (cancel) controller.abort();
    await new Promise(resolve => setTimeout(resolve, 30));
    return f.qualify(p);
  } });
  assert.equal(task.blockedOn.code, 'deadline');
  assert.equal(f.calls.length, 0);
});

test('hanging executor times out once without replay', async t => {
  const f = await playbookFixture(t, { config: { limits: { ...zeroUsage, wallClockMs: 1500, implementationAttempts: 2 } } });
  let calls = 0, cancelled = 0;
  const task = await runEngineeringTask({ ...f.args, qualify: () => ({ maximum: zeroUsage, cancel: () => cancelled++, execute: () => { calls++; return new Promise(() => {}); } }) });
  assert.equal(task.blockedOn.code, 'execution_uncertain');
  assert.equal(calls, 1); assert.equal(cancelled, 1);
  await assert.rejects(f.runtime.actions.rerunWork(task.id), /uncertain calls/);
});
