// Task-owned Git worktrees, not security sandboxes. Git owns removal; we never
// force-delete a checkout or discard uncommitted output.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { withLock } from './lock.mjs';
import { safePath } from './durable.mjs';

const exec = promisify(execFile);
const git = async (repository, args) => (await exec('git', ['-C', repository, ...args], { timeout: 15000, maxBuffer: 1000000 })).stdout.trim();
const receiptPath = (store, task) => path.join(store.taskDir(task.slug), 'workspace.json');
const lock = (store, task, fn) => withLock(path.join(store.taskDir(task.slug), 'workspace-lock'), fn);
export const engineeringDirectory = (store, task) => task.engineering.workspace?.path ?? store.base;

const expectedHead = (task, receipt) => task.engineering.delivery?.state === 'committed' && task.engineering.delivery.commit === receipt.deliveredCommit ? receipt.deliveredCommit : receipt.commit;
async function inspect(receipt, head = receipt.commit) {
  await safePath(receipt.path);
  const exists = await fs.stat(receipt.path).then(() => true, e => { if (e.code === 'ENOENT') return false; throw e; });
  if (!exists) return { exists: false };
  const common = await fs.realpath(await git(receipt.path, ['rev-parse', '--path-format=absolute', '--git-common-dir']));
  if (common !== receipt.commonDir || await git(receipt.path, ['rev-parse', 'HEAD']) !== head) throw new Error('Engineering worktree repository/ref identity changed.');
  if (await fs.realpath(receipt.path) !== receipt.path) throw new Error('Engineering worktree path changed.');
  return { exists: true, dirty: Boolean(await git(receipt.path, ['status', '--porcelain', '--untracked-files=all'])) };
}

function owned(store, task, r) {
  const expected = path.join(store.workDir(), 'worktrees', task.slug);
  if (r.schemaVersion !== 1 || r.taskId !== task.id || r.slug !== task.slug || r.path !== expected || task.engineering.workspace && task.engineering.workspace.identity !== r.identity) throw new Error('Engineering worktree does not belong to this task.');
}

export async function ensureEngineeringWorkspace(store, task, spec) {
  return lock(store, task, async () => {
    const file = receiptPath(store, task);
    let r = await store.exists(file) ? await store.readJson(file) : null;
    if (!r) {
      const repository = await fs.realpath(spec.repository);
      const commit = await git(repository, ['rev-parse', '--verify', '--end-of-options', `${spec.ref}^{commit}`]);
      const commonDir = await fs.realpath(await git(repository, ['rev-parse', '--path-format=absolute', '--git-common-dir']));
      const target = path.join(store.workDir(), 'worktrees', task.slug);
      await safePath(target);
      if (await store.exists(target)) throw new Error('Unowned engineering workspace already exists; it will not be adopted.');
      const identity = createHash('sha256').update(JSON.stringify({ taskId: task.id, slug: task.slug, repository, commit, target })).digest('hex');
      r = { schemaVersion: 1, taskId: task.id, slug: task.slug, repository, commonDir, requestedRef: spec.ref, commit, path: target, identity, state: 'preparing' };
      await store.writeJson(file, r);
    }
    owned(store, task, r);
    if (await fs.realpath(spec.repository) !== r.repository || spec.ref !== r.requestedRef) throw new Error('Workspace request differs from the saved task binding.');
    if (r.state === 'removed' || r.state === 'removing') throw new Error('Engineering workspace was removed or has pending removal.');
    const actual = await inspect(r, expectedHead(task, r));
    if (!actual.exists) {
      if (r.state !== 'preparing') throw new Error('Owned engineering workspace is missing; explicit recovery is required.');
      // This durable receipt precedes creation. A crash after Git succeeds can
      // adopt only the same repository/ref/path, never create another checkout.
      await git(r.repository, ['worktree', 'add', '--detach', r.path, r.commit]);
      await inspect(r);
    }
    r = { ...r, state: 'ready' };
    await store.writeJson(file, r);
    return r;
  });
}

export async function assertEngineeringWorkspace(store, task, run) {
  if (!task.engineering.workspace) return;
  const fresh = await store.findTask(task.id);
  if (fresh.slug !== task.slug || fresh.runs.at(-1).run !== run || fresh.engineering.driver.token !== task.engineering.driver.token) throw new Error('Stale task/run cannot use this engineering worktree.');
  const r = await store.readJson(receiptPath(store, task));
  owned(store, fresh, r);
  if (r.state !== 'ready' || !(await inspect(r, expectedHead(fresh, r))).exists) throw new Error('Engineering workspace is not ready.');
}

export async function engineeringWorkspaceStatus(store, task) {
  const file = receiptPath(store, task);
  if (!await store.exists(file)) return { managed: false };
  const r = await store.readJson(file);
  owned(store, task, r);
  return { ...r, managed: true, ...await inspect(r, expectedHead(task, r)), sandbox: false };
}

export async function cleanupEngineeringWorkspace(store, task) {
  return lock(store, task, async () => {
    const fresh = await store.findTask(task.id);
    if (fresh.status === 'working') throw new Error('Active engineering worktree cannot be removed.');
    const r = await store.readJson(receiptPath(store, fresh));
    owned(store, fresh, r);
    const actual = await inspect(r, expectedHead(fresh, r));
    if (actual.dirty) return { removed: false, reason: 'uncommitted_results', path: r.path };
    await store.writeJson(receiptPath(store, fresh), { ...r, state: 'removing' });
    if (actual.exists) await git(r.repository, ['worktree', 'remove', r.path]);
    await store.writeJson(receiptPath(store, fresh), { ...r, state: 'removed' });
    return { removed: true, path: r.path };
  });
}
