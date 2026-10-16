import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { runEngineeringTask } from '../src/core/engineering.mjs';
import { handoffHash } from '../src/core/engineering-handoff.mjs';
import { playbookFixture, zeroUsage } from './engineering-playbook-fixture.mjs';
const bug = 'export const parseTaskId = s => Number(s);\n';

async function reviewFixture(t, mode) {
  return playbookFixture(t, { risk: true,
    setup: async ({ base, source }) => fs.writeFile(path.join(base, 'test/review.test.mjs'), `import assert from 'node:assert/strict'; import {parseTaskId} from '../${source}'; assert.equal(parseTaskId('0'),null);\n`),
    config: { files: ['src/auth.mjs', 'test/id.test.mjs', 'test/review.test.mjs'], reviewChecks: { 'invalid-id': [process.execPath, '--test', 'test/review.test.mjs'] }, limits: { ...zeroUsage, wallClockMs: 30000, implementationAttempts: 3, reviewCycles: 2, agentRuns: 10 } },
    execute: async ({ input, source, handoff }) => {
      if (input.purpose === 'implement' || mode === 'cycles' && input.purpose === 'fix') {
        await fs.writeFile(path.join(input.cwd, source), bug);
        return { status: 'ready', result: 'IMPLEMENTER_PRIVATE_CONTEXT', usage: zeroUsage };
      }
      if (input.purpose === 'review') {
        const bytes = await fs.readFile(path.join(input.cwd, source));
        const finding = { severity: 'high', message: 'Zero identifier is accepted.', evidence: { path: source, sha256: handoffHash(bytes), artifactDigest: handoff.refs.artifact.contentDigest }, checkId: 'invalid-id' };
        if (mode === 'unconfirmed') delete finding.checkId;
        if (mode === 'stale') finding.evidence.artifactDigest = 'wrong';
        return { status: 'ready', result: 'Focused fresh review', usage: zeroUsage, engineering: { review: { findings: bytes.toString() === bug ? [finding] : [] } } };
      }
      return null;
    }
  });
}

test('risk automatically creates exactly one fresh-context reviewer when no finding remains', async t => {
  const f = await playbookFixture(t, { risk: true }); const task = await runEngineeringTask(f.args);
  assert.equal(task.status, 'ready', task.blockedOn?.text);
  assert.deepEqual(f.calls.map(c => c.id), ['primary', 'primary', 'reviewer']);
  const h = f.calls[2].handoff;
  assert.equal(h.freshContext, true); assert.ok(h.refs.verification.digest); assert.ok(h.refs.artifact.digest);
  assert.doesNotMatch(JSON.stringify(h), /IMPLEMENTER_CONVERSATION_DO_NOT_SHARE/);
  assert.equal(task.engineering.decisions.at(-1).reason, 'risk_policy');
  assert.equal(task.runs.at(-1).review.mode, 'independent-fresh-context');
});

test('confirmed reproduction creates narrow fix; clear re-review causes no further agent', async t => {
  const f = await reviewFixture(t, 'fix'); const task = await runEngineeringTask(f.args);
  assert.equal(task.status, 'ready', task.blockedOn?.text);
  assert.deepEqual(f.calls.map(c => c.purpose), ['investigate', 'implement', 'review', 'fix', 'review']);
  const fix = f.calls.find(c => c.purpose === 'fix').handoff;
  assert.equal(fix.confirmedReviewFindings[0].confirmed, true);
  assert.equal(fix.confirmedReviewFindings[0].reason, 'reproduced');
  assert.ok(fix.refs.review.digest);
  assert.doesNotMatch(JSON.stringify(fix), /IMPLEMENTER_PRIVATE_CONTEXT/);
  assert.equal(task.engineering.playbook.reviewCycles, 1);
});

for (const mode of ['unconfirmed', 'stale']) test(`${mode} finding cannot automatically spend a fix call`, async t => {
  const f = await reviewFixture(t, mode); const task = await runEngineeringTask(f.args);
  assert.equal(task.blockedOn.code, 'review_decision');
  assert.equal(f.calls.filter(c => c.purpose === 'fix').length, 0);
  assert.equal(task.runs.at(-1).review.findings[0].confirmed, false);
});

test('two fix/review cycles stop with evidence and no third fix', async t => {
  const f = await reviewFixture(t, 'cycles'); const task = await runEngineeringTask(f.args);
  assert.equal(task.blockedOn.code, 'review_cycle_limit', task.blockedOn?.text);
  assert.equal(f.calls.filter(c => c.purpose === 'fix').length, 2);
  assert.equal(f.calls.filter(c => c.purpose === 'review').length, 3);
  assert.equal(task.engineering.playbook.reviewCycles, 2);
});

test('reviewer changing source is stopped before any fix or approval', async t => {
  const f = await playbookFixture(t, { risk: true, execute: async ({ input, source }) => {
    if (input.purpose !== 'review') return null;
    await fs.writeFile(path.join(input.cwd, source), bug);
    return { status: 'ready', result: 'no issues', usage: zeroUsage, engineering: { review: { findings: [] } } };
  } });
  const task = await runEngineeringTask(f.args);
  assert.equal(task.blockedOn.code, 'read_only_violation');
  assert.equal(f.calls.filter(c => c.purpose === 'fix').length, 0);
});
