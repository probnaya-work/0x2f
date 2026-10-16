// Retained, inspectable E2E evidence; deterministic fixture executors only.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { initProject } from '../src/project.mjs';
import { createRuntime } from '../src/runtime.mjs';
import { runEngineeringTask } from '../src/core/engineering.mjs';
import { handoffHash } from '../src/core/engineering-handoff.mjs';
import { workflowLines } from '../src/web/workflow.mjs';
const root = await fs.mkdtemp('/private/tmp/0x2f-playbook-demo-');
const zero = { moneyMicros: 0, tokens: 0, modelCalls: 0, providerCalls: 0 };
const fixed = 'export const parseTaskId = s => /^0*[1-9][0-9]*$/.test(s) ? Number(s) : null;\n';
const evidence = [];
for (const scenario of ['one-primary', 'observed-unavailable', 'failed-check-fix', 'risk-review', 'bounded-stop', 'resume']) {
  const base = path.join(root, scenario); await fs.mkdir(base); await initProject(base);
  const source = scenario === 'risk-review' ? 'src/auth.mjs' : 'src/id.mjs';
  await fs.mkdir(path.join(base, 'src')); await fs.mkdir(path.join(base, 'test'));
  await fs.writeFile(path.join(base, source), 'export const parseTaskId = () => null;\n');
  await fs.writeFile(path.join(base, 'test/id.test.mjs'), `import assert from 'node:assert/strict';import {parseTaskId} from '../${source}';assert.equal(parseTaskId('014'),14);\n`);
  await fs.writeFile(path.join(base, '.work/engineering.json'), JSON.stringify({ schemaVersion: 1, enabled: true, playbook: true, currency: 'USD', providers: ['fixture-primary', 'fixture-secondary'], reviewProviders: ['fixture-reviewer'], files: [source, 'test/id.test.mjs'], writePaths: [source], check: [process.execPath, '--test', 'test/id.test.mjs'], limits: { ...zero, wallClockMs: 30000, implementationAttempts: 2 } }));
  const calls = [];
  const make = id => ({ id, displayName: id, integrationType: 'command', command: [process.execPath], capabilities: { engineeringPurposes: id === 'fixture-reviewer' ? ['review'] : ['investigate', 'implement', 'fix'] }, async start(input) {
    const h = JSON.parse(input.prompt); calls.push({ id, purpose: input.purpose });
    if (scenario === 'observed-unavailable' && id === 'fixture-primary') return { status: 'failed', failure: { kind: 'unavailable' }, error: 'Observable fixture unavailable', usage: zero };
    if (input.purpose === 'investigate') return { status: 'ready', result: 'Source-backed diagnosis', usage: zero, engineering: { diagnosis: { confirmed: true, evidence: [{ path: source, sha256: handoffHash(await fs.readFile(path.join(input.cwd, source))) }] } } };
    if (input.purpose === 'review') return { status: 'ready', result: 'Fresh review clear', usage: zero, engineering: { review: { findings: [] } } };
    if (scenario !== 'bounded-stop' && !(scenario === 'failed-check-fix' && input.purpose === 'implement')) await fs.writeFile(path.join(input.cwd, source), fixed);
    return { status: 'ready', result: 'Offline implementation claim; real Node check decides.', usage: zero };
  } });
  const providers = ['fixture-primary', 'fixture-secondary', 'fixture-reviewer'].map(make);
  const node = { id: 'local', startExecution: async () => null };
  let runtime = createRuntime(base, { providers, node });
  let task = await runtime.actions.createWork({ brief: 'Fix parseTaskId("014") without changing its public API. No delivery.' });
  const args = () => ({ store: runtime.store, providers: runtime.providers, slug: task.slug, token: task.engineering.driver.token, qualify: p => ({ maximum: zero, execute: input => p.start(input) }) });
  task = await runEngineeringTask({ ...args(), ...(scenario === 'resume' ? { pauseAfterPurpose: p => p === 'investigate' } : {}) });
  if (scenario === 'resume') {
    assert.equal(task.blockedOn.code, 'paused_boundary');
    await runtime.actions.answerWork(task.id, { answer: 'Keep the public API.' });
    runtime = createRuntime(base, { providers, node });
    task = await runtime.actions.rerunWork(task.id);
    task = await runEngineeringTask(args());
  }
  assert.equal(task.status, scenario === 'bounded-stop' ? 'needs_you' : 'ready', task.blockedOn?.text);
  if (scenario === 'bounded-stop') { assert.equal(task.blockedOn.code, 'attempt_limit'); assert.equal(calls.filter(c => ['implement', 'fix'].includes(c.purpose)).length, 2); }
  if (scenario === 'one-primary') assert.ok(calls.every(c => c.id === 'fixture-primary'));
  if (scenario === 'observed-unavailable') assert.equal(task.engineering.decisions[1].reason, 'executor_unavailable');
  if (scenario === 'failed-check-fix') assert.equal(calls.filter(c => c.purpose === 'fix').length, 1);
  if (scenario === 'risk-review') assert.equal(calls.filter(c => c.purpose === 'review').length, 1);
  const diff = await runtime.actions.getTaskDiff(task.id);
  evidence.push({ scenario, base, taskId: task.id, status: task.status, calls, diffFiles: diff.map(d => d.path), projection: workflowLines(task) });
}
await fs.writeFile(path.join(root, 'evidence.json'), JSON.stringify({ mode: 'offline-fixture', liveModelCalls: 0, scenarios: evidence }, null, 2));
console.log(JSON.stringify({ mode: 'offline-fixture', liveModelCalls: 0, root, scenarios: evidence.map(({ scenario, status, calls }) => ({ scenario, status, calls })) }, null, 2));
