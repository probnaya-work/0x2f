// Reproducible OFFLINE fixture: real files/checks/task history, no model calls.
// Qualification is injected for these deterministic functions only. This is
// not a live-provider or OS isolation demonstration.
import fs from 'node:fs/promises';
import path from 'node:path';
import { initProject } from '../src/project.mjs';
import { createRuntime } from '../src/runtime.mjs';
import { runEngineeringTask } from '../src/core/engineering.mjs';
import { renderTasks } from '../src/render.mjs';

const zero = { moneyMicros: 0, tokens: 0, modelCalls: 0, providerCalls: 0 };
const base = await fs.mkdtemp('/private/tmp/0x2f-engineering-demo-');
await initProject(base);
await fs.mkdir(path.join(base, 'src'));
await fs.mkdir(path.join(base, 'test'));
await fs.writeFile(path.join(base, 'src/id.mjs'), 'export const parseTaskId = () => null;\n');
await fs.writeFile(path.join(base, 'test/id.test.mjs'), `import test from 'node:test'; import assert from 'node:assert/strict'; import {parseTaskId} from '../src/id.mjs'; test('zero padding',()=>assert.equal(parseTaskId('014'),14));\n`);
await fs.writeFile(path.join(base, '.work/engineering.json'), JSON.stringify({ schemaVersion: 1, enabled: true, currency: 'USD', providers: ['offline-primary', 'offline-secondary'], files: ['src/id.mjs', 'test/id.test.mjs'], writePaths: ['src/id.mjs'], check: [process.execPath, '--test', 'test/id.test.mjs'], limits: { ...zero, wallClockMs: 30000, implementationAttempts: 2 } }));
let unavailable = false;
const calls = [];
const make = id => ({ id, displayName: id, integrationType: 'command', command: [process.execPath], capabilities: {}, async start({ cwd }) {
  calls.push(id);
  if (unavailable && id === 'offline-primary') return { status: 'failed', error: 'Offline fixture: primary executable unavailable', failure: { kind: 'unavailable' }, usage: zero };
  await fs.writeFile(path.join(cwd, 'src/id.mjs'), 'export const parseTaskId = s => /^0*[1-9][0-9]*$/.test(s) ? Number(s) : null;\n');
  return { status: 'ready', result: 'Offline fixture patched parseTaskId; no LLM was called.', usage: zero };
} });
const runtime = createRuntime(base, { providers: [make('offline-primary'), make('offline-secondary')], node: { id: 'local', startExecution: async () => null } });
for (const name of ['one executor', 'unavailable primary']) {
  unavailable = name === 'unavailable primary';
  if (unavailable) await fs.writeFile(path.join(base, 'src/id.mjs'), 'export const parseTaskId = () => null;\n');
  const task = await runtime.actions.createWork({ brief: `Fix parseTaskId('014'): ${name}. No commit.` });
  await runEngineeringTask({ store: runtime.store, slug: task.slug, token: task.engineering.driver.token, providers: runtime.providers, qualify: p => ({ maximum: zero, execute: input => p.start(input) }) });
}
console.log('OFFLINE FIXTURE ONLY · NO LIVE PROVIDER QUALIFICATION\n');
console.log(renderTasks(await runtime.store.listTasks()));
console.log(JSON.stringify({ base, calls, expected: ['offline-primary', 'offline-primary', 'offline-secondary'], modelCalls: 0, providerCalls: 0 }));
