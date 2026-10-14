import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
export function validateSourcePath(file) {
  if (typeof file !== 'string' || !file || file.startsWith('/') || file.startsWith('-') || file.split(/[\\/]/).some(part => !part || part === '.' || part === '..')) throw new Error('Source paths must be explicit relative files.');
  if (/(^|[\\/])(\.env[^/]*|\.work|\.git|node_modules|_drafts|credentials)([\\/]|$)/.test(file)) throw new Error('Private source path is not allowed.');
  return file;
}
export async function sourceRootIdentity(repo) {
  const realPath = await fs.realpath(repo), stat = await fs.stat(realPath);
  if (!stat.isDirectory()) throw new Error('Source root must be a directory.');
  return { schemaVersion: 1, realPath, dev: stat.dev, ino: stat.ino };
}
export async function readSourceFile(pin, file, { signal, maxBytes = 256000 } = {}) {
  validateSourcePath(file);
  if (!pin || pin.schemaVersion !== 1) throw new Error('Unbound source root. Explicitly refresh workflow settings.');
  const python = process.env.WORKFLOW_LOCK_PYTHON ?? (process.platform === 'darwin' ? '/usr/bin/python3' : 'python3');
  try {
    const { stdout } = await exec(python,[new URL('./source-reader.py',import.meta.url).pathname,pin.realPath,file,String(pin.dev),String(pin.ino),String(maxBytes)],{signal,maxBuffer:maxBytes+1,encoding:'buffer',timeout:15000});
    return stdout;
  } catch { throw new Error(`Source read refused: ${file} (missing, changed root, symlink, size limit, or cancelled).`); }
}
