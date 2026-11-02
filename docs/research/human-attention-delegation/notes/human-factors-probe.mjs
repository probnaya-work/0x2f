// Research-only deterministic probe; never starts an actual provider.
// Run: node docs/research/human-attention-delegation/notes/human-factors-probe.mjs
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createRuntime } from '../../../../src/runtime.mjs';
import { applyOutcome, classifyResult } from '../../../../src/core/lifecycle.mjs';
import { snapshot } from '../../../../src/tui/model.mjs';
import { buildRight } from '../../../../src/tui/view.mjs';
import { initialState, primaryAction } from '../../../../src/tui/state.mjs';
import { palette } from '../../../../src/tui/theme.mjs';
import { projectBlockedOn } from '../../../../src/relay/project.mjs';

const outDir = path.dirname(fileURLToPath(import.meta.url));
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), '0x2f-human-factors-'));
const starts = [];
const node = {
  id: 'research-inert',
  resolveWorkspace: () => scratch,
  startExecution: async ({ task }) => { starts.push(task.slug); return 424242; },
  resumeExecution: async () => { throw new Error('No real execution permitted'); },
  cancelExecution: async () => {}
};
try {
  const runtime = createRuntime(scratch, {
    node,
    env: { ...process.env, CLAUDE_BIN: process.execPath }
  });
  const brief = 'Inspect the CSV importer.\n\nRETURN_INTENT_SENTINEL: Preserve blank-cell semantics and investigate only; do not modify files.';
  const result = '## Result\nRESULT_SENTINEL: Importer investigation complete.\n\n## Verification\nVERIFICATION_SENTINEL: Unit checks passed, network integration was not run.\n\n## Needs human decision\nREQUIRED: no';
  const task = await runtime.actions.createWork({ brief, provider: 'claude-code' });
  await runtime.store.updateTask(applyOutcome(task, { status: 'ready', result }));
  await fs.writeFile(path.join(runtime.store.taskDir(task.slug), 'result.md'), result);
  const cliData = await runtime.actions.getWork(task.id);
  assert.equal(cliData.result, result);
  const model = await snapshot(runtime, { node: 'research-fixture' });
  const tuiTask = model.tasks[0];
  const T = (t, c, b) => ({ t: String(t), c, b: b || 400 });
  const detail = buildRight(model, initialState(), 140, palette('dark'), T)
    .map(row => row.cells.map(cell => cell.t).join('')).join('\n');
  await fs.writeFile(path.join(outDir, 'human-factors-tui-ready.txt'), detail + '\n');
  assert.equal(primaryAction(tuiTask, initialState(), model).label, 'ACCEPT');
  assert.equal(detail.includes('RETURN_INTENT_SENTINEL'), false);
  assert.equal(detail.includes('RESULT_SENTINEL'), false);
  assert.equal(detail.includes('VERIFICATION_SENTINEL'), false);
  assert.equal(tuiTask.brief.includes('RETURN_INTENT_SENTINEL'), true);
  const permission = projectBlockedOn({
    type: 'permission', tool: 'Bash', file: '/outside-A/deploy.sh',
    plannedChange: 'x'.repeat(220) + ' CONSEQUENTIAL_TAIL',
    raw: { command: 'rm -rf /outside-A/shared-data' }
  }, scratch);
  assert.equal(permission.plannedChange.includes('CONSEQUENTIAL_TAIL'), false);
  assert.equal(permission.raw, undefined);
  const noChecks = classifyResult('## Result\nImplemented.\n\n## Verification\nNo checks were run.');
  const partialChecks = classifyResult('The fix is complete. I could not run integration tests because the network is blocked.');
  assert.equal(noChecks.status, 'ready');
  assert.equal(partialChecks.status, 'ready');
  const report = {
    kind: 'deterministic-source-projection-probe',
    humanParticipants: 0,
    realProviderCalls: 0,
    fixtureStartRequestsIntercepted: starts.length,
    readyTui: {
      primaryAction: 'ACCEPT',
      originalBriefPersisted: true,
      fullBriefInTuiViewModel: true,
      fullBriefVisibleAnywhereInUnclippedDetail: false,
      writtenResultAvailableThroughSharedGetWork: true,
      writtenResultVisibleAnywhereInUnclippedDetail: false,
      verificationVisibleAnywhereInUnclippedDetail: false
    },
    remotePermission: {
      fileProjected: permission.file,
      fullRawInputAvailable: false,
      plannedChangeLengthAfterProjection: permission.plannedChange.length,
      consequentialTailVisible: false
    },
    classification: { noChecks: noChecks.status, integrationNotRun: partialChecks.status },
    caveat: 'Mechanical information availability only; no measured human time, comprehension, trust, or prevalence.'
  };
  await fs.writeFile(path.join(outDir, 'human-factors-probe.json'), JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
} finally {
  await fs.rm(scratch, { recursive: true, force: true });
}
