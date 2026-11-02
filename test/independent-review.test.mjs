import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRuntime } from '../src/runtime.mjs';
import { backupWorkspace, restoreBackup } from '../src/backup.mjs';
import { git, captureTree, treeDiff, requireSharedSlot } from '../src/core/isolation.mjs';
import { resultEvidence } from '../src/web/result-evidence.mjs';
import { reserveExecution } from '../src/core/execution.mjs';

async function root(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), '2f-independent-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

test('legacy tasks use shared admission and new attempts discard old worker generation', async () => {
  await assert.rejects(() => requireSharedSlot({ async listTasks() { return [{ id: 2, status: 'working', checkout: { mode: 'shared' } }]; } }, { id: 1 }), /owned by task #2/);
  const next = reserveExecution({ execution: { id: 'old', process: { pid: 11, start: 'old-generation' } }, runs: [{ run: 1, harnessProcess: { pid: 12 }, checks: [{ status: 'passed' }] }], cancelRequested: { executionId: 'old' } });
  assert.notEqual(next.execution.id, 'old');
  assert.equal(next.execution.process, undefined);
  assert.equal(next.cancelRequested, undefined);
  assert.equal(next.runs[0].harnessProcess, undefined);
  assert.equal(next.runs[0].checks, undefined);
  assert.equal(next.runs[0].executionId, next.execution.id);
});

test('stale cancellation cannot retarget a newer run or native-resume attempt', async t => {
  const base = await root(t);
  let stops = 0;
  const rt = createRuntime(base, { node: { id: 'fixture', async startExecution() { return process.pid; }, async cancelExecution() { stops++; } } });
  const task = await rt.actions.createWork({ brief: 'cancellation occurrence fixture' });
  await assert.rejects(() => rt.actions.cancelWork(task.id, { executionId: 'old-attempt' }), /execution.*changed/i);
  assert.equal(stops, 0);
  assert.equal((await rt.store.findTask(task.id)).cancelRequested, undefined);
  const stopped = await rt.actions.cancelWork(task.id, { executionId: task.execution.id });
  assert.equal(stopped.cancelRequested.executionId, task.execution.id);
  assert.equal(stops, 1);
});

test('restore refuses symlinked task control directories before touching original state', async t => {
  const dir = await root(t), base = path.join(dir, 'source'), external = path.join(dir, 'original-tasks');
  await fs.mkdir(path.join(base, '.work'), { recursive: true });
  await fs.mkdir(path.join(external, '001-task'), { recursive: true });
  const original = JSON.stringify({ id: 1, title: 'original', slug: '001-task', status: 'ready', pid: 12345, execution: { id: 'historical' } });
  await fs.writeFile(path.join(external, '001-task/task.json'), original);
  await fs.symlink(external, path.join(base, '.work/tasks'));
  const backup = path.join(dir, 'backup');
  // Old backups must also be refused at restore, even when their receipt matches.
  await assert.rejects(() => backupWorkspace(base, backup), /symlink|symbolic/i);
  // Construct the exact valid old-format backup shape accepted before this fix.
  await fs.mkdir(path.join(backup, 'workspace/.work'), { recursive: true, mode: 0o700 });
  await fs.symlink(external, path.join(backup, 'workspace/.work/tasks'));
  const files = [{ path: '.work', type: 'directory', mode: (await fs.stat(path.join(backup, 'workspace/.work'))).mode & 0o777 }, { path: '.work/tasks', type: 'symlink', target: external }];
  await fs.writeFile(path.join(backup, 'receipt.json'), JSON.stringify({ version: 1, originalBase: base, files, sourceModes: files }));
  await assert.rejects(() => restoreBackup(backup, path.join(dir, 'restored')), /symlink|symbolic/i);
  assert.equal(await fs.readFile(path.join(external, '001-task/task.json'), 'utf8'), original);
});

test('tool receipts never borrow commands from a future invocation or different attempt', () => {
  const events = [
    { type: 'tool.started', run: 1, executionId: 'one', toolCallId: '1', input: { command: 'false' } },
    { type: 'tool.completed', run: 1, executionId: 'one', toolCallId: '1', exitCode: 1 },
    { type: 'tool.completed', run: 1, executionId: 'two', toolCallId: '1', exitCode: null, output: 'unknown' },
    { type: 'tool.started', run: 1, executionId: 'two', toolCallId: '1', input: { command: 'true' } },
    { type: 'tool.completed', run: 1, executionId: 'two', toolCallId: '1', exitCode: 0 }
  ];
  const receipts = resultEvidence('', events).receipts;
  assert.deepEqual(receipts.map(r => r.command), ['false', undefined, 'true']);
  assert.deepEqual(receipts.map(r => r.exitCode), [1, null, 0]);
});

test('Git-visible non-UTF8 text keeps exact bytes through immutable patch and apply', async t => {
  const base = await root(t);
  await git(base, ['init']);
  await fs.writeFile(path.join(base, 'latin1.txt'), Buffer.from([0x61, 0xe9, 10]));
  await git(base, ['add', '.']);
  await git(base, ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'baseline']);
  const evidence = path.join(base, '.work/evidence');
  const before = await captureTree(base, evidence);
  const expected = Buffer.from([0x62, 0xe9, 10]);
  await fs.writeFile(path.join(base, 'latin1.txt'), expected);
  const after = await captureTree(base, evidence);
  const diff = await treeDiff(base, evidence, before, after);
  const patch = path.join(base, '.work/saved.patch');
  await fs.writeFile(patch, diff.patchBytes ?? diff.patch);
  await fs.writeFile(path.join(base, 'latin1.txt'), Buffer.from([0x61, 0xe9, 10]));
  await git(base, ['apply', '--binary', patch]);
  assert.deepEqual(await fs.readFile(path.join(base, 'latin1.txt')), expected);
});

test('private snapshots preserve staged deletions, staged ignored additions and executable bits', async t => {
  const base = await root(t);
  await git(base, ['init']);
  await fs.writeFile(path.join(base, 'gone'), 'remove me\n');
  await fs.writeFile(path.join(base, 'script'), 'echo hi\n');
  await fs.writeFile(path.join(base, '.gitignore'), '.work/\nsecret\n');
  await git(base, ['add', '.']);
  await git(base, ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'baseline']);
  await git(base, ['config', 'core.fileMode', 'false']);
  const evidence = path.join(base, '.work/evidence');
  const before = await captureTree(base, evidence);
  await git(base, ['rm', 'gone']);
  await fs.writeFile(path.join(base, 'secret'), 'explicitly staged\n');
  await git(base, ['add', '-f', 'secret']);
  await fs.chmod(path.join(base, 'script'), 0o755);
  const index = await fs.readFile(path.join(base, '.git/index'));
  const after = await captureTree(base, evidence);
  const diff = await treeDiff(base, evidence, before, after);
  assert.deepEqual(diff.files.sort(), ['gone', 'script', 'secret']);
  assert.match(diff.patch, /deleted file mode/);
  assert.match(diff.patch, /new mode 100755/);
  assert.deepEqual(await fs.readFile(path.join(base, '.git/index')), index);
});

for (const shape of ['ignored', 'crlf', 'gitlink']) {
  test(`cleanup refuses unsupported ${shape} data without removing checkout`, async t => {
    const base = await root(t);
    await git(base, ['init']);
    await fs.writeFile(path.join(base, 'file'), 'baseline\n');
    await fs.writeFile(path.join(base, '.gitignore'), '.work/\nignored-data\n');
    await fs.writeFile(path.join(base, '.gitattributes'), 'file text eol=lf\n');
    await git(base, ['add', '.']);
    await git(base, ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'baseline']);
    const rt = createRuntime(base, { node: { id: 'local', async startExecution() { return null; } } });
    const task = await rt.actions.createWork({ brief: 'cleanup preservation fixture' });
    const checkout = task.checkout.path;
    await rt.store.updateTask({ ...task, pid: undefined, processGroupId: undefined, status: 'ready', runs: [{ ...task.runs[0], outcome: 'ready' }] });
    if (shape === 'ignored') await fs.writeFile(path.join(checkout, 'ignored-data'), 'must survive');
    if (shape === 'crlf') await fs.writeFile(path.join(checkout, 'file'), 'unfinished\r\n');
    if (shape === 'gitlink') {
      const head = (await git(checkout, ['rev-parse', 'HEAD'])).trim();
      await git(checkout, ['update-index', '--add', '--cacheinfo', `160000,${head},sub`]);
      await git(checkout, ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'gitlink']);
      await fs.mkdir(path.join(checkout, 'sub'), { recursive: true });
    }
    await assert.rejects(() => rt.actions.cleanupWork(task.id), /ignored|bytes differ|submodule|unsupported|Git workspace/);
    assert.equal((await fs.stat(checkout)).isDirectory(), true);
    if (shape === 'crlf') assert.equal(await fs.readFile(path.join(checkout, 'file'), 'utf8'), 'unfinished\r\n');
  });
}
