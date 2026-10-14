import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { crashPoint } from './faults.mjs';
import { schema, fields, validateTaskWorkflow } from './workflow-schema.mjs';
import { verifyArtifacts } from './workflow-artifacts.mjs';
import { workEvent } from './events.mjs';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
// Hold the workflow lock while checking this barrier and mutating state.
// A pending operation owns its precondition and required files until explicit
// recovery (or an identical operation retry) finishes it.
export async function assertNoPendingOperation(store, task, exceptId) {
  const dir = path.join(store.taskDir(task.slug), 'operations');
  const names = await fs.readdir(dir).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
  for (const name of names.filter(name => name.endsWith('.json'))) {
    const op = schema(await store.readJson(path.join(dir, name)), 'operation');
    if (!['pending','complete'].includes(op.state) || typeof op.operationId !== 'string' || name !== `${op.operationId}.json`) throw new Error('Malformed workflow operation; explicit recovery is required.');
    if (op.state !== 'complete' && op.operationId !== exceptId) throw new Error(`Task #${task.id} has a pending workflow operation; use workflow recover ${task.id} before another mutation.`);
  }
}
export const operationPath = (store, task, id) => {
  if (!/^[a-zA-Z0-9-]{1,128}$/.test(id)) throw new Error('Invalid workflow operation ID.');
  return path.join(store.taskDir(task.slug), 'operations', `${id}.json`);
};
// task.json is the commit point. A durable intent makes post-commit events
// replayable; an intent never implies that an external operation can be retried.
export async function commitWorkflow(store, before, next, { operationId = randomUUID(), kind, payload = {}, files = [], events = [] } = {}) {
  const file = operationPath(store, before, operationId);
  await assertNoPendingOperation(store, before, operationId);
  if (await store.exists(file)) {
    const existing = schema(await store.readJson(file), 'operation');
    if (existing.payloadDigest !== hash(payload) || existing.kind !== kind) throw new Error('Operation ID was already used with a different payload.');
    await replayWorkflowOperation(store, before, existing, file);
    return store.findTask(before.id);
  }
  for (const required of files) await store.writeText(required.path, required.bytes);
  next = { ...next, updatedAt: new Date().toISOString(), lastWorkflowOperation: operationId };
  const op = { schemaVersion: 1, operationId, kind, payloadDigest: hash(payload), beforeDigest: hash(before), next, state: 'pending', at: new Date().toISOString(),
    required: files.map(f => ({ path: path.relative(store.taskDir(before.slug), f.path), sha256: createHash('sha256').update(f.bytes).digest('hex') })),
    events: events.map((e, i) => ({ ...workEvent(e.type, before.id, e.data), eventId: `${operationId}-${i}` })) };
  await store.writeJson(file, op); crashPoint(`${kind}.intent-durable`);
  await replayWorkflowOperation(store, before, op, file);
  return store.findTask(before.id);
}
export async function replayWorkflowOperation(store, task, op, file = operationPath(store, task, op.operationId)) {
  fields(op, ['operationId','kind','payloadDigest','beforeDigest','next','state','at','required','events','completedAt'], 'operation');
  if (!['pending','complete'].includes(op.state) || !['decision','result','rerun','refresh'].includes(op.kind) || !Array.isArray(op.required) || !Array.isArray(op.events) || op.next?.id !== task.id || op.next?.slug !== task.slug) throw new Error('Malformed workflow operation; recovery refused.');
  validateTaskWorkflow(op.next.workflow);
  if (op.state === 'complete') return;
  const fresh = await store.findTask(task.id);
  const committed = fresh.lastWorkflowOperation === op.operationId;
  if (!committed && hash(fresh) !== op.beforeDigest) throw new Error('Pending operation conflicts with newer task state. Inspect journal; no automatic overwrite.');
  for (const r of op.required) {
    if (r.path.startsWith('..') || path.isAbsolute(r.path)) throw new Error('Invalid required artifact path.');
    const bytes = await store.readText(path.join(store.taskDir(task.slug), r.path), null);
    if (bytes === null || createHash('sha256').update(bytes).digest('hex') !== r.sha256) throw new Error('Required operation artifact is missing or changed.');
  }
  if (op.kind === 'result' && op.next.status === 'needs_you') await verifyArtifacts(store, op.next);
  if (op.kind === 'decision' && ['accepted', 'published'].includes(op.next.workflow.review)) await verifyArtifacts(store, op.next);
  const ids = new Set((await store.readEvents(task.slug)).map(e => e.eventId));
  for (const event of op.events.filter(e => e.type !== 'task.updated')) if (!ids.has(event.eventId)) await store.appendEvent(task.slug, event);
  if (!committed) { await store.writeJson(path.join(store.taskDir(task.slug), 'task.json'), op.next); crashPoint(`${op.kind}.state-durable`); }
  // The post-commit notification makes live surfaces reload the committed state.
  for (const event of op.events.filter(e => e.type === 'task.updated')) if (!ids.has(event.eventId)) await store.appendEvent(task.slug, event);
  await store.writeJson(file, { ...op, state: 'complete', completedAt: new Date().toISOString() }); crashPoint(`${op.kind}.complete`);
}
