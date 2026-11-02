// Safe geometry stress cases. Reported signals here are explicitly test data;
// they do not execute a harness or claim an engineering result.
import fs from 'node:fs/promises';
import path from 'node:path';
import { workEvent } from '../../../src/core/events.mjs';
export async function seedTraceExamples(runtime, ids) {
  for (const [id, count] of [[ids.working, 120], [ids.ready, 35], [ids.sufficient, 65]]) {
    const task = await runtime.store.findTask(id);
    const firstAt = Date.now();
    for (let i = 0; i < count; i++) {
      const change = i % 5 === 3;
      const event = change
        ? workEvent('file.changed', id, { run: 1, path: 'src/retry.mjs', source: 'worktree' })
        : workEvent('tool.started', id, { run: 1, name: i % 5 === 0 ? 'Read' : i % 5 === 1 ? 'Search' : i % 5 === 2 ? 'Edit' : 'Bash', input: i % 5 === 4 ? {command:'node --test retry.test.mjs'} : {file_path:'src/retry.mjs'} });
      event.at = new Date(firstAt + i).toISOString();
      await runtime.store.appendEvent(task.slug, event);
    }
  }
  const task = await runtime.actions.createWork({brief:'Observe a long coarse run.\nThis geometry fixture reports no structured signals.'});
  const old = new Date(Date.now() - 3 * 3600000).toISOString();
  task.createdAt = old;
  task.execution.provider = 'deepseek-harness';
  task.runs = task.runs.map(run => ({...run, provider:'deepseek-harness',startedAt:old}));
  await runtime.store.updateTask(task);
  const file = path.join(runtime.store.taskDir(task.slug),'events.jsonl');
  const events = (await fs.readFile(file,'utf8')).trim().split('\n').filter(Boolean).map(line=>({...JSON.parse(line),at:old}));
  await fs.writeFile(file, events.map(event=>JSON.stringify(event)).join('\n')+'\n');
  return task.id;
}
