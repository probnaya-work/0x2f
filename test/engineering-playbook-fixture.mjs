import fs from 'node:fs/promises';
import path from 'node:path';
import { initProject } from '../src/project.mjs';
import { createRuntime } from '../src/runtime.mjs';
import { handoffHash } from '../src/core/engineering-handoff.mjs';
export const zeroUsage = { moneyMicros: 0, tokens: 0, modelCalls: 0, providerCalls: 0 };
export const validParser = 'export const parseTaskId = s => /^0*[1-9][0-9]*$/.test(s) ? Number(s) : null;\n';
export const brokenParser = 'export const parseTaskId = () => null;\n';

export async function playbookFixture(t, options = {}) {
  const base = await fs.mkdtemp('/private/tmp/0x2f-playbook-');
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  await initProject(base); await fs.mkdir(path.join(base, 'src')); await fs.mkdir(path.join(base, 'test'));
  const source = options.risk ? 'src/auth.mjs' : 'src/id.mjs';
  await fs.writeFile(path.join(base, source), options.noChange ? validParser : brokenParser);
  await fs.writeFile(path.join(base, 'test/id.test.mjs'), `import assert from 'node:assert/strict'; import {parseTaskId} from '../${source}'; assert.equal(parseTaskId('014'),14);\n`);
  if (options.setup) await options.setup({ base, source });
  const config = { schemaVersion: 1, enabled: true, playbook: true, currency: 'USD', providers: ['primary', 'secondary'], reviewProviders: ['reviewer'], files: [source, 'test/id.test.mjs'], writePaths: [source], check: [process.execPath, '--test', 'test/id.test.mjs'], limits: { ...zeroUsage, wallClockMs: 30000, implementationAttempts: 2, investigationAttempts: 2, reviewCycles: 2, agentRuns: 10 }, ...options.config };
  await fs.writeFile(path.join(base, '.work/engineering.json'), JSON.stringify(config));
  const calls = [];
  const make = id => ({ id, displayName: id, integrationType: 'command', command: [process.execPath], capabilities: { engineeringPurposes: id === 'reviewer' ? ['review'] : ['investigate', 'implement', 'fix'] }, async start(input) {
    const handoff = JSON.parse(input.prompt); calls.push({ id, purpose: input.purpose, handoff });
    const custom = options.execute && await options.execute({ id, input, handoff, calls, source, base });
    if (custom) return custom;
    if (input.purpose === 'investigate') return { status: 'ready', result: 'Diagnosis supported by source.', usage: zeroUsage, engineering: { diagnosis: { confirmed: true, noChange: Boolean(options.noChange), evidence: [{ path: source, sha256: handoffHash(await fs.readFile(path.join(input.cwd, source))) }] } } };
    if (input.purpose === 'review') return { status: 'ready', result: 'Independent review clear.', usage: zeroUsage, engineering: { review: { findings: [] } } };
    await fs.writeFile(path.join(input.cwd, source), validParser);
    return { status: 'ready', result: 'IMPLEMENTER_CONVERSATION_DO_NOT_SHARE', usage: zeroUsage };
  } });
  const extra = [make('primary'), make('secondary'), make('reviewer')];
  const node = { id: 'local', startExecution: async () => null };
  const runtime = createRuntime(base, { providers: extra, node });
  const task = await runtime.actions.createWork({ brief: 'Fix parser without changing public API or delivering it.' });
  const qualify = p => ({ maximum: zeroUsage, execute: input => p.start(input) });
  return { base, source, config, calls, runtime, task, qualify, extra, node, args: { store: runtime.store, slug: task.slug, token: task.engineering.driver.token, providers: runtime.providers, qualify } };
}
