// The existing CHANGES surface reads saved engineering bytes, including after
// a worker exits or the live checkout changes. No delivery is performed.
import path from 'node:path';
import { execFile } from 'node:child_process';
import { verifyEngineeringArtifact } from './engineering.mjs';

export async function engineeringDiff(store, task) {
  const baseline = task.engineering.playbook?.baseline ?? task.runs.find(r => r.handoff)?.handoff;
  const artifact = task.engineering.playbook?.artifact ?? [...task.runs].reverse().find(r => r.artifact)?.artifact;
  if (!baseline || !artifact) return [];
  let source = baseline;
  if (!task.engineering.playbook?.baseline) {
    const h = await store.readJson(path.join(store.taskDir(task.slug), baseline.path));
    source = h.content.refs.source;
  }
  await verifyEngineeringArtifact(store, task, source);
  await verifyEngineeringArtifact(store, task, artifact);
  const root = store.taskDir(task.slug);
  const before = await store.readJson(path.join(root, source.path));
  const after = await store.readJson(path.join(root, artifact.path));
  const out = [];
  for (const file of task.engineering.config.files) {
    if (before.files[file]?.sha256 === after.files[file]?.sha256) continue;
    const a = before.files[file] ? path.join(root, path.dirname(source.path), 'files', file) : '/dev/null';
    const b = after.files[file] ? path.join(root, path.dirname(artifact.path), 'files', file) : '/dev/null';
    const hunks = await new Promise((resolve, reject) => execFile('git', ['diff', '--no-index', '--no-ext-diff', '--no-textconv', '--', a, b], { timeout: 5000, maxBuffer: 8000000 }, (error, stdout) => {
      if (error && error.code !== 1) reject(error); else resolve(String(stdout));
    }));
    out.push({ path: file, kind: 'hunks', hunks, artifactDigest: artifact.contentDigest });
  }
  return out;
}
