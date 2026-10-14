import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
const exec = promisify(execFile);
const hash = v => createHash('sha256').update(v).digest('hex');
export async function processIdentity(pid) {
  if (!Number.isInteger(pid) || pid < 1) return null;
  try {
    if (process.platform === 'linux') {
      const [stat, boot] = await Promise.all([fs.readFile(`/proc/${pid}/stat`, 'utf8'), fs.readFile('/proc/sys/kernel/random/boot_id', 'utf8')]);
      const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      return { schemaVersion: 1, pid, birth: fields[19], boot: boot.trim() };
    }
    const { stdout } = await exec('/bin/ps', ['-p', String(pid), '-o', 'lstart=', '-o', 'command='], { env: { PATH: '/usr/bin:/bin', LC_ALL: 'C', TZ: 'UTC' }, timeout: 2000, maxBuffer: 16384 });
    const value = stdout.trim(); if (!value) return null;
    return { schemaVersion: 1, pid, birth: value.slice(0, 24), commandHash: hash(value.slice(24).trim()) };
  } catch {
    try { process.kill(pid, 0); return { schemaVersion: 1, pid, unknown: true }; }
    catch (e) { return e.code === 'EPERM' ? { schemaVersion: 1, pid, unknown: true } : null; }
  }
}
export async function identityMatches(expected, inspect = processIdentity) {
  if (!expected || expected.unknown) return false;
  const actual = await inspect(expected.pid);
  return Boolean(actual && !actual.unknown && actual.birth === expected.birth && actual.boot === expected.boot && actual.commandHash === expected.commandHash);
}
