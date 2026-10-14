import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readBounded } from './durable.mjs';
export async function executableIdentity(command) {
  const candidates = command.includes('/') ? [path.resolve(command)] : (process.env.PATH ?? '/usr/bin:/bin').split(path.delimiter).map(p => path.join(p, command));
  for (const candidate of candidates) {
    try {
      await fs.access(candidate, 1); const realPath = await fs.realpath(candidate); const stat = await fs.stat(realPath);
      const bytes = await readBounded(realPath, 256_000_000);
      return { schemaVersion: 1, command, realPath, dev: stat.dev, ino: stat.ino, size: stat.size, sha256: createHash('sha256').update(bytes).digest('hex') };
    } catch (error) { if (['ENOENT','EACCES','ENOTDIR'].includes(error.code)) continue; throw error; }
  }
  throw new Error(`Adapter executable unavailable: ${command}`);
}
export async function verifyExecutable(pin) {
  if (!pin || pin.schemaVersion !== 1) throw new Error('Unpinned adapter: explicitly refresh workflow settings before executing commands.');
  const actual = await executableIdentity(pin.command);
  for (const key of ['realPath','dev','ino','size','sha256']) if (actual[key] !== pin[key]) throw new Error('Adapter executable changed after approval. Inspect it and explicitly refresh settings.');
  return actual.realPath;
}
export async function pinAdapters(def) {
  const pins = { git: await executableIdentity('git'), python: await executableIdentity(def.adapters.python) };
  if (def.adapters.image) pins.image = await executableIdentity(def.adapters.image.argv[0]);
  const secrets = (def.adapters.image?.credentialEnv ?? []).map(k => process.env[k]).filter(Boolean);
  if (secrets.some(secret => JSON.stringify(def).includes(secret))) throw new Error('Workflow config contains credential values; use credentialEnv names only.');
  return pins;
}
export function rejectCredentials(bytes, def) {
  const value = Buffer.isBuffer(bytes) ? bytes.toString('utf8') : String(bytes);
  for (const name of def.adapters.image?.credentialEnv ?? []) if (process.env[name] && value.includes(process.env[name])) throw new Error('Credential-bearing adapter/source output refused.');
  return bytes;
}
