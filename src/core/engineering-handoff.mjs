// Purpose-specific engineering inputs. Audit history is measured, never fed
// wholesale to the next executor. References stay inside this durable task.
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readBounded } from './durable.mjs';

export const handoffHash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const purposes = ['investigate', 'implement', 'fix', 'verify', 'review'];
const relative = p => typeof p === 'string' && p && !path.isAbsolute(p) && !p.split(/[\\/]/).some(x => !x || x === '.' || x === '..');

export function engineeringIntent(task) {
  return handoffHash({ id: task.id, slug: task.slug, brief: task.brief, context: task.context ?? null, config: task.engineering.configDigest, workspace: task.engineering.workspace ?? null });
}

async function refBytes(store, task, ref) {
  if (!relative(ref?.path) || !/^[a-f0-9]{64}$/.test(ref.digest ?? '')) throw new Error('Invalid engineering handoff reference.');
  const file = path.join(store.taskDir(task.slug), ref.path);
  const bytes = await readBounded(file, 8000000);
  if (ref.encoding === 'json' ? handoffHash(JSON.parse(bytes.toString())) !== ref.digest : handoffHash(bytes) !== ref.digest) throw new Error('Handoff evidence changed.');
  if (ref.manifest) {
    const m = JSON.parse(bytes.toString());
    for (const p of ref.files ?? []) {
      if (!relative(p) || !m.files?.[p]) throw new Error('Invalid handoff source file.');
      const source = await readBounded(path.join(path.dirname(file), 'files', p), 2000000);
      if (handoffHash(source) !== m.files[p].sha256) throw new Error('Handoff source snapshot changed.');
    }
  }
}

export async function createHandoff(store, task, { run, purpose, source, artifact, verification, diagnosis, failedCheck, executorFailure, questions = [] }) {
  if (!purposes.includes(purpose)) throw new Error('Unsupported engineering purpose.');
  const original = await store.readText(path.join(store.taskDir(task.slug), 'prompt.md'), '');
  const events = await store.readEvents(task.slug);
  const refs = {};
  const add = (key, ref) => { if (ref) refs[key] = { ...ref, encoding: ref.encoding ?? 'json' }; };
  add('original', { path: 'prompt.md', digest: handoffHash(original), encoding: 'text' });
  const snapshot = ref => ref && ({ ...ref, manifest: true, files: task.engineering.config.files });
  if (purpose !== 'verify') add('source', snapshot(source));
  if (executorFailure) add('priorFailure', { path: executorFailure.resultRef, digest: executorFailure.resultDigest, encoding: 'text' });
  if (purpose === 'investigate') add('priorDiagnosis', task.engineering.playbook?.unconfirmedDiagnosis);
  if (['implement', 'fix'].includes(purpose)) add('diagnosis', diagnosis);
  if (['fix', 'verify', 'review'].includes(purpose)) add('artifact', snapshot(artifact));
  if (['fix', 'review'].includes(purpose)) add('verification', verification);
  if (purpose === 'fix') add('review', task.engineering.playbook?.review);
  if (purpose === 'review') add('diagnosis', diagnosis);
  if (purpose === 'review') add('baseline', snapshot(task.engineering.playbook?.baseline));
  const content = {
    schemaVersion: 1, taskId: task.id, slug: task.slug, run, purpose,
    intentDigest: engineeringIntent(task), brief: task.brief,
    scope: task.engineering.config.writePaths,
    constraints: task.context?.notes ?? [],
    decisions: events.filter(e => e.type === 'task.answered').map(e => ({ at: e.at, answer: e.answer })),
    prohibited: ['commit', 'push', 'PR', 'merge', 'deploy', 'publication', 'new credentials/provider'],
    taskDirectory: store.taskDir(task.slug), workspace: task.engineering.workspace?.path ?? store.base,
    refs,
    ...(purpose === 'investigate' ? { symptoms: task.brief, question: 'Read only. Establish a diagnosis supported by concrete evidence, or explain why no change is required. Return JSON matching outputContract; do not change files.', outputContract: { diagnosis: { confirmed: 'boolean', noChange: 'boolean', evidence: [{ path: 'relative source path', sha256: 'exact source hash' }] } } } : {}),
    ...(['implement', 'fix'].includes(purpose) ? { files: task.engineering.config.files, ...(failedCheck ? { failedCheck, previousArtifact: artifact } : {}), ...(task.engineering.playbook?.fixFindings ? { confirmedReviewFindings: task.engineering.playbook.fixFindings } : {}), ...(executorFailure ? { executorFailure } : {}) } : {}),
    ...(purpose === 'verify' ? { check: task.engineering.config.check, claimedOutcome: 'Check the exact saved artifact.' } : {}),
    ...(purpose === 'review' ? { freshContext: true, questions, permittedChecks: Object.keys(task.engineering.config.reviewChecks ?? {}), outputContract: { review: { findings: [{ severity: 'low|medium|high|critical', message: 'concrete defect', evidence: { path: 'affected path', sha256: 'exact artifact file hash', artifactDigest: 'exact artifact content digest' }, checkId: 'preapproved reproduction check, if available' }] } }, instruction: 'Review only the approved changes and receipts. Return JSON matching outputContract. Do not implement or change files.' } : {})
  };
  let fullHistoryBytes = Buffer.byteLength(original) + Buffer.byteLength(JSON.stringify(events));
  for (const r of task.runs) fullHistoryBytes += Buffer.byteLength(await store.readRunResult(task, r));
  const bytes = Buffer.byteLength(JSON.stringify(content));
  return { content, digest: handoffHash(content), metrics: { bytes, fullHistoryBytes, smallerThanHistory: bytes < fullHistoryBytes } };
}

export async function verifyHandoff(store, task, handoff, { run, sourceDigest } = {}) {
  const c = handoff.content;
  if (handoffHash(c) !== handoff.digest || c.taskId !== task.id || c.slug !== task.slug || c.intentDigest !== engineeringIntent(task) || c.run !== (run ?? task.runs.at(-1).run)) throw new Error('Stale engineering handoff; task intent or run changed.');
  if (sourceDigest && c.refs.source?.contentDigest !== sourceDigest) throw new Error('Stale engineering handoff; workspace bytes changed.');
  for (const ref of Object.values(c.refs)) await refBytes(store, task, ref);
  return c;
}
