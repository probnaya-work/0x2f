import fs from 'node:fs/promises';
import path from 'node:path';
import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { crashPoint } from './faults.mjs';
let fence = () => {};
export const registerFence = fn => { fence = fn; };
export async function safePath(file) {
  const parts = path.resolve(file).split(path.sep); let current = path.parse(path.resolve(file)).root;
  for (const part of parts.slice(1)) {
    current = path.join(current, part);
    const st = await fs.lstat(current).catch(e => { if(e.code === 'ENOENT') return null; throw e; });
    if (st?.isSymbolicLink() && !['/var','/tmp','/etc'].includes(current)) throw new Error(`Symlink state path refused: ${current}`);
  }
}
export async function syncDirectory(dir) {
  const fd = await fs.open(dir, 'r'); try { await fd.sync(); } finally { await fd.close(); }
}
export async function durableWrite(file, bytes, { point } = {}) {
  fence(); await safePath(file);
  const dir = path.dirname(file);
  const created = await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  if (created) { let current = dir; while (true) { await syncDirectory(current); await syncDirectory(path.dirname(current)); if (path.resolve(current) === path.resolve(created)) break; current = path.dirname(current); } }
  const stat = await fs.lstat(file).catch(e => { if (e.code === 'ENOENT') return null; throw e; });
  if (stat?.isSymbolicLink() || (stat && !stat.isFile())) throw new Error('Refusing a symlink/non-file state target.');
  const tmp = path.join(dir, `.${path.basename(file)}.${randomUUID()}.tmp`); let fd;
  try {
    fd = await fs.open(tmp, 'wx', 0o600); await fd.writeFile(bytes); await fd.sync();
    if (point) crashPoint(`${point}.file-synced`);
    await fd.close(); fd = null; fence(); await fs.rename(tmp, file);
    if (point) crashPoint(`${point}.renamed`);
    await syncDirectory(dir); if (point) crashPoint(`${point}.durable`);
  } finally { if (fd) await fd.close(); await fs.rm(tmp, { force: true }); }
}
export async function readBounded(file, maxBytes = 4000000) {
  await safePath(file);
  const fd = await fs.open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { const s = await fd.stat(); if (!s.isFile() || s.size > maxBytes) throw new Error(`State file exceeds ${maxBytes} bytes or is not a file.`); const b = await fd.readFile(); if (b.length > maxBytes) throw new Error('State file grew beyond its limit.'); return b; }
  finally { await fd.close(); }
}
export async function backupFile(file) {
  const b = await readBounded(file, 64000000); const target = path.join(path.dirname(file), '.backups', `${path.basename(file)}.${randomUUID()}.bak`); await durableWrite(target, b); return target;
}
