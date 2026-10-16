import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { initProject } from '../src/project.mjs';
import { createRuntime } from '../src/runtime.mjs';
import { runEngineeringTask } from '../src/core/engineering.mjs';
import { ensureEngineeringWorkspace, assertEngineeringWorkspace, cleanupEngineeringWorkspace, engineeringWorkspaceStatus } from '../src/core/engineering-workspace.mjs';
const exec = promisify(execFile);
const zero = { moneyMicros: 0, tokens: 0, modelCalls: 0, providerCalls: 0 };
const git = async (base, args) => (await exec('git', ['-C', base, ...args])).stdout.trim();

async function fixture(t) {
  const base = await fs.mkdtemp('/private/tmp/0x2f-managed-workspace-');
  let workspace;
  t.after(async () => { if (workspace) await git(base, ['worktree', 'remove', '--force', workspace]).catch(() => {}); await fs.rm(base, { recursive: true, force: true }); });
  await initProject(base);
  await fs.mkdir(path.join(base, 'src')); await fs.mkdir(path.join(base, 'test'));
  await fs.writeFile(path.join(base, '.gitignore'), '.work/\n');
  await fs.writeFile(path.join(base, 'src/id.mjs'), 'export const id = null;\n');
  await fs.writeFile(path.join(base, 'test/id.test.mjs'), `import assert from 'node:assert/strict'; import {id} from '../src/id.mjs'; assert.equal(id,14);\n`);
  await git(base, ['init']); await git(base, ['add', '.gitignore', 'src', 'test']);
  await git(base, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'fixture baseline']);
  const ref = await git(base, ['rev-parse', 'HEAD']);
  await fs.writeFile(path.join(base, 'src/id.mjs'), 'USER DIRTY CONTENT\n');
  const config = { schemaVersion: 1, enabled: true, currency: 'USD', providers: ['fixture'], files: ['src/id.mjs', 'test/id.test.mjs'], writePaths: ['src/id.mjs'], check: [process.execPath, '--test', 'test/id.test.mjs'], limits: { ...zero, wallClockMs: 30000, implementationAttempts: 2 }, workspace: { repository: base, ref } };
  await fs.writeFile(path.join(base, '.work/engineering.json'), JSON.stringify(config));
  const provider = { id: 'fixture', integrationType: 'command', command: [process.execPath], capabilities: {}, async start({ cwd }) { await fs.writeFile(path.join(cwd, 'src/id.mjs'), 'export const id = 14;\n'); return { status: 'ready', result: 'fixture patch', usage: zero }; } };
  const runtime = createRuntime(base, { providers: [provider], node: { id: 'local', startExecution: async () => null } });
  const task = await runtime.actions.createWork({ brief: 'Fix parser in a managed worktree.' });
  workspace = task.engineering.workspace?.path;
  assert.ok(workspace, task.blockedOn?.text);
  return { base, config, runtime, task, workspace, provider };
}

test('managed worktree creates idempotently at exact ref, preserves source dirty bytes and runs the same task there', async t => {
  const f = await fixture(t);
  const again = await ensureEngineeringWorkspace(f.runtime.store, f.task, f.config.workspace);
  assert.equal(again.identity, f.task.engineering.workspace.identity);
  assert.equal((await git(f.base, ['worktree', 'list', '--porcelain'])).match(/worktree /g).length, 2);
  assert.equal(await fs.readFile(path.join(f.base, 'src/id.mjs'), 'utf8'), 'USER DIRTY CONTENT\n');
  const done = await runEngineeringTask({ store: f.runtime.store, slug: f.task.slug, token: f.task.engineering.driver.token, providers: f.runtime.providers, qualify: p => ({ maximum: zero, execute: input => p.start(input) }) });
  assert.equal(done.status, 'ready');
  assert.equal(done.engineering.verification.cwd, f.workspace);
  assert.equal(await fs.readFile(path.join(f.base, 'src/id.mjs'), 'utf8'), 'USER DIRTY CONTENT\n');
  assert.deepEqual(await cleanupEngineeringWorkspace(f.runtime.store, done), { removed: false, reason: 'uncommitted_results', path: f.workspace });
  assert.equal((await engineeringWorkspaceStatus(f.runtime.store, done)).sandbox, false);
});

test('preparing receipt adopts the one existing owned worktree after a creation crash', async t => {
  const f = await fixture(t);
  const file = path.join(f.runtime.store.taskDir(f.task.slug), 'workspace.json');
  const receipt = await f.runtime.store.readJson(file);
  await f.runtime.store.writeJson(file, { ...receipt, state: 'preparing' });
  assert.equal((await ensureEngineeringWorkspace(f.runtime.store, f.task, f.config.workspace)).state, 'ready');
  await assert.rejects(assertEngineeringWorkspace(f.runtime.store, f.task, 99), /Stale task\/run/);
  await assert.rejects(ensureEngineeringWorkspace(f.runtime.store, { ...f.task, id: 99 }, f.config.workspace), /does not belong/);
});

test('clean inactive owned worktree can be removed idempotently; active use cannot', async t => {
  const f = await fixture(t);
  await assert.rejects(cleanupEngineeringWorkspace(f.runtime.store, f.task), /Active/);
  const stopped = { ...f.task, status: 'needs_you' }; await f.runtime.store.updateTask(stopped);
  assert.equal((await cleanupEngineeringWorkspace(f.runtime.store, stopped)).removed, true);
  assert.equal((await cleanupEngineeringWorkspace(f.runtime.store, stopped)).removed, true);
  assert.equal((await engineeringWorkspaceStatus(f.runtime.store, stopped)).state, 'removed');
});
