import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { git, restoreSnapshotBytes } from '../src/core/isolation.mjs';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), '2f-archive-path-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const base = path.join(root, 'checkout');
  await fs.mkdir(base);
  await git(base, ['init']);
  const blob = (await git(base, ['hash-object', '-w', '--stdin'], { input: 'fixture bytes\n' })).trim();
  const tree = async (mode, name, oid) => (await git(base, ['hash-object', '--literally', '-t', 'tree', '-w', '--stdin'], {
    input: Buffer.concat([Buffer.from(`${mode} ${name}\0`), Buffer.from(oid, 'hex')])
  })).trim();
  return { root, base, blob, tree, evidence: path.join(root, 'evidence') };
}

test('raw restore refuses traversal and Git-control entries without writing outside the new checkout', async t => {
  const f = await fixture(t);
  const config = await fs.readFile(path.join(f.base, '.git/config'));
  for (const name of ['../escape', '/absolute', '.git', '.work/task.json']) {
    const tree = await f.tree('100644', name, f.blob);
    await assert.rejects(() => restoreSnapshotBytes(f.base, f.evidence, { tree }), /Unsafe archived path/);
  }
  assert.deepEqual(await fs.readFile(path.join(f.base, '.git/config')), config);
  await assert.rejects(fs.access(path.join(f.root, 'escape')));
});

test('raw restore refuses an existing symlink parent and never writes its target', async t => {
  const f = await fixture(t);
  const outside = path.join(f.root, 'outside');
  await fs.mkdir(outside);
  await fs.symlink(outside, path.join(f.base, 'dir'));
  const child = await f.tree('100644', 'file', f.blob);
  const tree = await f.tree('40000', 'dir', child);
  await assert.rejects(() => restoreSnapshotBytes(f.base, f.evidence, { tree }), /non-directory/);
  assert.deepEqual(await fs.readdir(outside), []);
});
