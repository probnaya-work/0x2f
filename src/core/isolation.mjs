// Task workspaces and immutable Git-visible observations. Private object storage
// never adds snapshots to the repository's refs or ordinary object database.
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { WorkError } from './errors.mjs';
import { processGroupAlive } from '../recover.mjs';

export function git(base, args, options = {}) {
  return new Promise((resolve, reject) => { const child = execFile('git', ['-c', 'core.fsmonitor=false', '-c', 'core.hooksPath=/dev/null', ...args],
    { cwd: base, timeout: 30000, maxBuffer: 64 * 1024 * 1024, ...options },
    (error, stdout, stderr) => error ? reject(new WorkError(`Git workspace operation failed: ${String(stderr || error.message).trim()}`, 409)) : resolve(stdout));
    if (options.input !== undefined) child.stdin.end(options.input);
  });
}
export async function gitRoot(base) {
  try {
    const root = (await git(base, ['rev-parse', '--show-toplevel'])).trim();
    return await fs.realpath(root) === await fs.realpath(base) ? root : null;
  } catch { return null; }
}
const excludeWork = ['.', ':(exclude).work'];

export async function prepareWorkspace(base, task, requested = 'auto') {
  if (!['auto', 'shared', 'isolated'].includes(requested)) throw new WorkError('Workspace mode must be auto, shared or isolated.');
  const root = await gitRoot(base);
  let head = null;
  if (root) { try { head = (await git(base, ['rev-parse', '--verify', 'HEAD'])).trim(); } catch { /* unborn */ } }
  if (requested === 'isolated' && !head) throw new WorkError('Isolation requires a Git repository root with a commit. Use explicit shared mode for this workspace.');
  if (requested === 'shared' || !head) return { mode: 'shared', path: base, reason: requested === 'shared' ? 'explicit shared workspace' : 'non-Git, nested or unborn repository; shared execution is serialized' };
  const dirty = await git(base, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', ...excludeWork]);
  if (requested === 'auto' && dirty) throw new WorkError('This workspace has existing changes. Choose isolated mode to start from committed HEAD, or shared mode to include existing changes. Nothing was copied or discarded.', 409);
  const checkout = path.join(base, '.work', 'worktrees', task.slug);
  await fs.mkdir(path.dirname(checkout), { recursive: true, mode: 0o700 });
  await git(base, ['worktree', 'add', '--detach', checkout, head]);
  return { mode: 'isolated', path: checkout, baseHead: head, originalDirty: Boolean(dirty), reason: 'task-owned checkout from committed HEAD; original dirty files excluded' };
}

export async function requireSharedSlot(store, task) {
  // Tasks written by 0.2.0 have no checkout field and execute in this root.
  if (task.checkout?.mode === 'isolated') return;
  for (const other of await store.listTasks()) {
    if (other.id === task.id || other.checkout?.mode === 'isolated') continue;
    const r = other.runs?.at(-1);
    if (other.status === 'working' || other.blockedOn?.live || r?.outcome === 'working' || r?.blockedOn?.live || processGroupAlive(other.processGroupId)) {
      throw new WorkError(`Shared workspace is owned by task #${other.id}. Cancel or finish that execution before starting another shared task.`, 409);
    }
  }
}

async function snapshotEnv(base, artifactRoot) {
  const objects = path.join(artifactRoot, 'objects');
  await fs.mkdir(objects, { recursive: true, mode: 0o700 });
  const common = (await git(base, ['rev-parse', '--git-common-dir'])).trim();
  return { ...process.env, GIT_OBJECT_DIRECTORY: objects,
    GIT_ALTERNATE_OBJECT_DIRECTORIES: path.resolve(base, common, 'objects'),
    GIT_INDEX_FILE: path.join(artifactRoot, `index-${randomUUID()}`) };
}
export async function captureTree(base, artifactRoot) {
  if (!await gitRoot(base)) return null;
  const env = await snapshotEnv(base, artifactRoot);
  try {
    // Clean filters must not transform evidence or start arbitrary helpers.
    const filters = await git(base, ['config', '--get-regexp', '^filter\\..*\\.(clean|process|required)$']).catch(() => '');
    const names = new Set(filters.split('\n').map(l => /^filter\.(.*)\.(?:clean|process|required)\s/.exec(l)?.[1]).filter(Boolean));
    const config = [...names].flatMap(n => ['-c', `filter.${n}.clean=cat`, '-c', `filter.${n}.process=`, '-c', `filter.${n}.required=false`]);
    await git(base, ['read-tree', 'HEAD'], { env }).catch(() => git(base, ['read-tree', '--empty'], { env }));
    await git(base, ['rm', '--cached', '-r', '--ignore-unmatch', '--', '.work'], { env });
    // Include HEAD/private-index paths as well as the user's index. Otherwise
    // a staged deletion disappears from ls-files and is resurrected in evidence.
    const lists = await Promise.all([
      git(base, ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...excludeWork], { env }),
      git(base, ['ls-files', '-z', '--cached', '--', ...excludeWork])
    ]);
    const paths = [...new Set(lists.flatMap(s => s.split('\0')).filter(Boolean))].map(s => s + '\0').join('');
    if (paths) await git(base, [...config, '-c', 'core.fileMode=true', 'add', '-f', '-A', '--pathspec-from-file=-', '--pathspec-file-nul'], {
      env: { ...env, GIT_LITERAL_PATHSPECS: '1' }, input: paths
    });
    const tree = (await git(base, ['write-tree'], { env })).trim();
    return { tree, at: new Date().toISOString() };
  } finally { await fs.rm(env.GIT_INDEX_FILE, { force: true }); }
}
export async function treeDiff(base, artifactRoot, before, after) {
  if (!before || !after) return null;
  const env = await snapshotEnv(base, artifactRoot);
  const args = ['diff', '--no-ext-diff', '--no-textconv', '--binary', '--full-index', before.tree, after.tree];
  const patchBytes = await git(base, args, { env, encoding: 'buffer' });
  const patch = patchBytes.toString('utf8'); // display only; transfer keeps bytes
  const files = (await git(base, ['diff', '--name-only', '-z', before.tree, after.tree], { env })).split('\0').filter(Boolean);
  return { patch, patchBytes, files, before, after, sha256: createHash('sha256').update(patchBytes).digest('hex') };
}
export async function saveChanges(store, task, run, before, after) {
  const base = task.checkout?.path ?? store.base;
  const objects = path.join(store.workDir(), 'evidence');
  const changes = await treeDiff(base, objects, before, after);
  const dir = path.join(store.taskDir(task.slug), 'runs', String(run));
  if (!changes) {
    const receipt = { version: 1, available: false, reason: 'No Git-root baseline; provider file reports are not an attributed patch.' };
    await store.writeJson(path.join(dir, 'changes.json'), receipt);
    return receipt;
  }
  const attemptDir = path.join(dir, 'attempts', task.execution?.id ?? 'legacy');
  await store.writeText(path.join(attemptDir, 'changes.patch'), changes.patchBytes);
  await store.writeText(path.join(dir, 'changes.patch'), changes.patchBytes);
  const receipt = { ...changes, patch: undefined, patchBytes: undefined, version: 1, available: true,
    attribution: task.checkout?.mode === 'isolated' ? 'observed isolated checkout interval' : 'observed shared workspace interval; includes any concurrent external edits',
    artifact: `runs/${run}/attempts/${task.execution?.id ?? 'legacy'}/changes.patch` };
  await store.writeJson(path.join(attemptDir, 'changes.json'), receipt);
  await store.writeJson(path.join(dir, 'changes.json'), receipt);
  return receipt;
}

// Git filters/attributes can canonicalize bytes. Refuse destructive cleanup
// unless the Git-visible archive represents every current byte exactly.
export async function verifySnapshotBytes(base, artifactRoot, snapshot) {
  const env = await snapshotEnv(base, artifactRoot);
  const format = (await git(base, ["rev-parse", "--show-object-format"])).trim();
  const entries = (await git(base, ["ls-tree", "-r", "-z", snapshot.tree], { env })).split("\0").filter(Boolean);
  for (const entry of entries) {
    const match = /^(\d+) (\w+) ([a-f0-9]+)\t([\s\S]*)$/.exec(entry);
    if (!match || match[2] !== "blob") throw new WorkError("Checkout contains a submodule or unsupported Git object. Preserve it explicitly before cleanup.", 409);
    const file = path.join(base, match[4]);
    const data = match[1] === "120000" ? Buffer.from(await fs.readlink(file)) : await fs.readFile(file);
    const actual = createHash(format).update(`blob ${data.length}\0`).update(data).digest("hex");
    if (actual !== match[3]) throw new WorkError("Checkout bytes differ from the Git-visible archive (attributes, filters or concurrent edits). Nothing was removed; preserve the working copy explicitly.", 409);
  }
}
