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
const base = path.join(temporary, 'retry-review');
await fs.mkdir(base);
await initProject(base);
const runtime = createRuntime(base, {
  node: { id: 'illustration', startExecution: async () => null }
});
const result = `## Result
Keep the same task when changing harnesses.

## Evidence
The original request, saved constraint and previous result remain available.

## Verification
Illustrative data only. No engineering check is claimed by this screenshot.`;
for (const [brief, status, count] of [
  ['Review task continuity across harnesses.\nPreserve the public API and carry saved notes into the next run.', 'ready', 80],
  ['Inspect the retry boundary.\nKeep the existing behavior while checking recovery.', 'working', 1000]
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
  for (let i = 0; i < count; i++) {
    await runtime.store.appendEvent(task.slug, workEvent('tool.started', task.id, {
      run: 1, name: ['Read', 'Search', 'Edit', 'Bash'][i % 4],
      input: { file_path: 'src/retry.mjs', command: 'node --test retry.test.mjs' }
    }));
  }
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
