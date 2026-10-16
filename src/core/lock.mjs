import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { durableWrite, registerFence, syncDirectory, safePath } from './durable.mjs';
import { credentialFreeEnvironment } from './workflow-credentials.mjs';
const scopes = new AsyncLocalStorage();
const awaitPython = () => process.platform === 'darwin' ? '/usr/bin/python3' : 'python3';
const helper = new URL('./lock-helper.py', import.meta.url).pathname;
export function assertLockHeld() {
  for (const lease of scopes.getStore()?.values() ?? []) if (lease.lost) throw new Error('Mutation lock was lost; no state commit is allowed. Run workflow doctor.');
}
registerFence(assertLockHeld);
async function acquire(root, probe = false) {
  await safePath(root);
  if (!probe) {
    await fs.mkdir(root, { recursive: true, mode: 0o700 });
    if ((await fs.lstat(root)).isSymbolicLink()) throw new Error('Lock root cannot be a symlink.');
    const legacy = await fs.readlink(path.join(root, 'active')).catch(e => { if (e.code === 'ENOENT') return null; throw new Error('Malformed legacy lock; use workflow doctor.'); });
    if (legacy) {
      if (!/^\d+-[a-zA-Z0-9-]+$/.test(legacy)) throw new Error('Malformed legacy lock owner; use workflow doctor.');
      try { process.kill(Number(legacy.split('-')[0]), 0); throw new Error('A legacy runtime may own this lock. Stop it and use explicit recovery.'); }
      catch (e) { if (e.code !== 'ESRCH') throw e; }
    }
  }
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.WORKFLOW_LOCK_PYTHON || (awaitPython()), [helper, root, probe ? 'probe' : 'hold'], { stdio: ['pipe', 'pipe', 'ignore'], env:credentialFreeEnvironment() });
    child.stdin.on('error', () => {});
    let text = '', settled = false;
    const fail = message => { if (!settled) { settled = true; child.stdin.end(); reject(new Error(message)); } };
    const timer = setTimeout(() => { child.kill('SIGKILL'); fail('Lock helper timed out; Python 3 with POSIX fcntl is required.'); }, 12000);
    child.on('error', () => { clearTimeout(timer); fail('Lock helper unavailable. Install Python 3 or set WORKFLOW_LOCK_PYTHON; no data was changed.'); });
    child.stdout.on('data', b => {
      text += b.toString(); if (!text.includes('\n') || settled) return; clearTimeout(timer);
      try { const info = JSON.parse(text.split('\n')[0]); if (info.error) return fail(info.error); settled = true; resolve({ child, info, lost: false }); }
      catch { fail('Lock helper returned an invalid response.'); }
    });
    child.on('exit', () => { clearTimeout(timer); if (!settled) fail('Lock helper failed. Python 3 with fcntl is required.'); });
  });
}
export async function probeLock(root) {
  try { const lease = await acquire(root, true); lease.child.stdin.end(); return lease.info; }
  catch (error) { return { locked: null, error: error.message }; }
}
export async function withLock(root, fn) {
  root = path.resolve(root); const inherited = scopes.getStore() ?? new Map();
  if (inherited.has(root)) { assertLockHeld(); return fn(); }
  const lease = await acquire(root);
  const owner = { schemaVersion: 1, token: randomUUID(), pid: process.pid, helperPid: lease.info.helperPid, acquiredAt: new Date().toISOString() };
  lease.child.on('exit', () => { lease.lost = true; }); lease.child.stdin.on('error', () => { lease.lost = true; });
  const next = new Map(inherited); next.set(root, lease);
  try { await durableWrite(path.join(root, 'owner.json'), JSON.stringify(owner)); return await scopes.run(next, fn); }
  finally {
    try { if (!lease.lost) { await fs.rm(path.join(root, 'owner.json'), { force: true }); await syncDirectory(root); } }
    finally { lease.child.stdin.end(); } // even a failed diagnostic cleanup releases the kernel holder
  }
}
