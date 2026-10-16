import path from 'node:path';
import { readBounded } from './durable.mjs';
import { handoffHash as hash } from './engineering-handoff.mjs';

// Only a preapproved deterministic reproduction on the same artifact can
// authorize automatic fixes. Reviewer prose alone is not confirmation.
export async function confirmEngineeringReview({ store, task, run, review, artifact, verification, cwd, checkRunner, signal, timeout, inventory }) {
  if (!review || !Array.isArray(review.findings) || review.findings.length > 20) throw new Error('Independent review must explicitly return a bounded findings array.');
  const manifest = await store.readJson(path.join(store.taskDir(task.slug), artifact.path));
  const findings = [];
  const reproductions = new Map();
  for (const f of review.findings) {
    if (!['low', 'medium', 'high', 'critical'].includes(f.severity) || typeof f.message !== 'string' || !f.message.trim() || f.message.length > 2000) throw new Error('Invalid independent review finding.');
    const evidence = f.evidence;
    const bound = evidence?.artifactDigest === artifact.contentDigest && manifest.files[evidence?.path]?.sha256 === evidence?.sha256;
    const pin = bound && task.engineering.config.reviewCheckPins?.[f.checkId];
    let reproduction = null;
    if (pin) {
      if (!reproductions.has(f.checkId)) {
        if (hash(await readBounded(pin.argv[0], 256000000)) !== pin.executableDigest) throw new Error('Review reproduction executable changed.');
        if ((await inventory(cwd)).digest !== artifact.contentDigest) throw new Error('Review artifact changed before reproduction.');
        const receipt = await checkRunner({ argv: pin.argv, cwd, timeout: Math.max(1, Math.min(5000, timeout())), signal });
        if ((await inventory(cwd)).digest !== artifact.contentDigest) throw new Error('Review reproduction changed the artifact.');
        const data = { schemaVersion: 1, artifact, checkId: f.checkId, argv: pin.argv, executableDigest: pin.executableDigest, ...receipt, outputDigest: hash(receipt.output) };
        const ref = { path: `runs/${run}/reproduction-${f.checkId}.json`, digest: hash(data) };
        await store.writeJson(path.join(store.taskDir(task.slug), ref.path), data);
        reproductions.set(f.checkId, { ref, failed: receipt.code === 1 && !receipt.error });
      }
      reproduction = reproductions.get(f.checkId);
    }
    findings.push({ severity: f.severity, message: f.message, evidence, confirmed: Boolean(reproduction?.failed), reason: !bound ? 'artifact_mismatch' : !pin ? 'no_approved_reproduction' : reproduction.failed ? 'reproduced' : 'not_reproduced', ...(reproduction ? { reproduction: reproduction.ref } : {}) });
  }
  const data = { schemaVersion: 1, run, mode: 'independent-fresh-context', artifact, verification, findings };
  const ref = { path: `runs/${run}/review.json`, digest: hash(data) };
  await store.writeJson(path.join(store.taskDir(task.slug), ref.path), data);
  return { data, ref };
}
