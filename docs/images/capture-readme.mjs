// README illustration only: current UI, inert execution, synthetic public data.
// Start this, select Dark in SETTINGS, capture the browser, then send SIGINT.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRuntime } from '../../src/runtime.mjs';
import { initProject } from '../../src/project.mjs';
import { startServer } from '../../src/server.mjs';
import { applyOutcome } from '../../src/core/lifecycle.mjs';
import { workEvent } from '../../src/core/events.mjs';

// Do not put the operator's machine identity into public illustrations.
os.hostname = () => 'demo-host';
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), '0x2f-readme-'));
const base = path.join(temporary, 'installed-verifier');
await fs.mkdir(base);
await initProject(base);
const runtime = createRuntime(base, {
  node: { id: 'illustration', startExecution: async () => null }
});
const result = `## Result
Review the installed package on both execution hosts.

## Evidence
The original request, saved constraint and previous result remain available.

## Verification
Illustrative data only. No engineering check is claimed by this screenshot.`;
for (const [brief, status, count] of [
  ['Review the Linux package installation.', 'ready', 40],
  ['Make installed verification portable across macOS and Linux.\nKeep isolation, exclude inherited credentials and compare the installed package byte for byte.', 'working', 280]
]) {
  const task = await runtime.actions.createWork({ brief });
  const outcome = { status, ...(status === 'ready' ? { result } : {}) };
  const state = applyOutcome(task, outcome);
  state.execution.provider = 'codex';
  state.runs = state.runs.map(run => ({ ...run, provider: 'codex', outcome: status }));
  await runtime.store.updateTask(state);
  if (status === 'ready') {
    for (const target of ['result.md', 'runs/1/result.md']) {
      await fs.writeFile(path.join(runtime.store.taskDir(task.slug), target), result);
    }
  }
  const files = ['verify-installed.mjs', 'test/verify-installed.test.mjs', 'deploy/0x2f-user.service', 'docs/host-setup.md', 'README.md'];
  for (let i = 0; i < count; i++) {
    const file = files[Math.floor(i / 7) % files.length];
    const change = (i * 37 + Math.floor(i / 13) * 17) % 101 < (i < 60 ? 9 : i < 240 ? 45 : 15);
    const event = change
      ? workEvent('file.changed', task.id, { run: 1, path: file, source: 'worktree' })
      : workEvent('tool.started', task.id, {
          run: 1, name: ['Read', 'Search', 'Inspect', 'Read', 'Edit'][i % 5],
          input: i % 5 === 1 ? { pattern: ['npm executable discovery', 'credential allowlist', 'offline package verification'][i % 3] } : { file_path: file }
        });
    await runtime.store.appendEvent(task.slug, event);
  }
  for (const command of ['node --test test/verify-installed.test.mjs', 'npm run check', 'npm pack --json', '2f version']) {
    await runtime.store.appendEvent(task.slug, workEvent('tool.started', task.id, { run: 1, name: 'Bash', input: { command } }));
  }
  await runtime.store.appendEvent(task.slug, workEvent('file.changed', task.id, { run: 1, path: 'test/verify-installed.test.mjs', source: 'worktree' }));
  for (const [name, input] of [['Read', { file_path: 'package.json' }], ['Search', { pattern: 'credential allowlist' }], ['Edit', { file_path: 'deploy/0x2f-user.service' }]]) {
    await runtime.store.appendEvent(task.slug, workEvent('tool.started', task.id, { run: 1, name, input }));
  }
  await runtime.store.appendEvent(task.slug, workEvent('tool.started', task.id, { run: 1, name: 'Read', input: { file_path: 'evidence/installed-verification.json' } }));
}
const server = await startServer(base, 0, { runtime });
console.log(`README illustration: http://127.0.0.1:${server.port}`);
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await server.close();
    await fs.rm(temporary, { recursive: true, force: true });
    process.exit(0);
  });
}
