import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { runEngineeringTask } from '../src/core/engineering.mjs';
import { playbookFixture } from './engineering-playbook-fixture.mjs';
import { workflowLines } from '../src/web/workflow.mjs';
import { snapshot } from '../src/tui/model.mjs';

test('shared projection and CHANGES use immutable artifacts and routing history', async t => {
  const f = await playbookFixture(t); const task = await runEngineeringTask(f.args);
  const lines = workflowLines(task).join('\n');
  assert.match(lines, /PURPOSE REVIEW.*EXECUTOR local-checks/); assert.match(lines, /NEXT ACCEPT/);
  assert.match(lines, /ROUTING implement → primary · diagnosis_confirmed/); assert.match(lines, /REVIEW runs/);
  const before = await f.runtime.actions.getTaskDiff(task.id);
  assert.equal(before.length, 1); assert.equal(before[0].path, f.source);
  assert.match(before[0].hunks, /\+export const parseTaskId/);
  await fs.writeFile(path.join(f.base, f.source), 'LIVE_UNVERIFIED_EDIT');
  assert.deepEqual(await f.runtime.actions.getTaskDiff(task.id), before);
  const model = await snapshot(f.runtime);
  assert.equal(model.engineering, true); assert.deepEqual(model.providerOrder, ['auto']);
  assert.deepEqual(model.tasks[0].workflowLines, workflowLines(await f.runtime.actions.getWork(task.id)));
  const manifest = task.engineering.playbook.artifact.path;
  await fs.writeFile(path.join(f.runtime.store.taskDir(task.slug), path.dirname(manifest), 'files', f.source), 'ARCHIVE_TAMPER');
  await assert.rejects(f.runtime.actions.getTaskDiff(task.id), /artifact bytes changed/);
});
