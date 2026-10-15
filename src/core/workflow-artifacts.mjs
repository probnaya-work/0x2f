import path from 'node:path';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { durableWrite, readBounded, safePath } from './durable.mjs';
import { schema } from './workflow-schema.mjs';
import { rejectCredentials } from './workflow-adapters.mjs';
export const sha256 = b => createHash('sha256').update(b).digest('hex');
export async function archiveArtifacts(store, task, source, run) {
  const destination = path.join(store.taskDir(task.slug), 'runs', String(run), 'artifacts', task.workflow.definition.kind);
  const files = [];
  await safePath(source);
  for (const entry of await fs.readdir(source, { withFileTypes: true })) {
    rejectCredentials(entry.name, task.workflow.definition);
    if (entry.name.startsWith('.')) continue;
    if (!entry.isFile()) throw new Error('Artifacts must be regular files.');
    const bytes = await readBounded(path.join(source, entry.name), 64_000_000);
    rejectCredentials(bytes, task.workflow.definition);
    await durableWrite(path.join(destination, entry.name), bytes, { point: 'artifact' });
    files.push({ path: entry.name, bytes: bytes.length, sha256: sha256(bytes) });
  }
  const manifest = { schemaVersion: 1, workflow: task.workflow.id, run, files };
  rejectCredentials(manifest, task.workflow.definition);
  await store.writeJson(path.join(destination, 'manifest.json'), manifest);
  return { manifest: path.relative(store.taskDir(task.slug), path.join(destination, 'manifest.json')), manifestDigest: sha256(JSON.stringify(manifest)), artifactRun: run };
}
export async function verifyArtifacts(store, task) {
  const w = task.workflow;
  if (!w.manifest) throw new Error('This legacy package has no integrity manifest. Explicitly refresh and rerun before accepting.');
  if (path.isAbsolute(w.manifest) || w.manifest.split(/[\\/]/).includes('..')) throw new Error('Invalid artifact manifest path.');
  const file = path.join(store.taskDir(task.slug), w.manifest), dir = path.dirname(file);
  const manifest = schema(await store.readJson(file), 'artifact manifest');
  if (sha256(JSON.stringify(manifest)) !== w.manifestDigest || !Array.isArray(manifest.files) || manifest.run !== w.artifactRun) throw new Error('Artifact manifest changed.');
  for (const f of manifest.files) {
    if (typeof f.path !== 'string' || f.path.includes('/') || f.path.includes('\\') || f.path.startsWith('.')) throw new Error('Invalid artifact filename.');
    const bytes = await readBounded(path.join(dir, f.path), 64_000_000);
    if (bytes.length !== f.bytes || sha256(bytes) !== f.sha256) throw new Error(`Artifact missing or changed: ${f.path}`);
  }
  return manifest;
}
