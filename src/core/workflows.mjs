import { validateDefinition, validateSchedule, schema } from './workflow-schema.mjs';
import { workflowKind } from '../workflows/registry.mjs';
import { pinAdapters, rejectCredentials } from './workflow-adapters.mjs';
import { commitWorkflow, assertNoPendingOperation } from './workflow-transaction.mjs';
import { backupFile, readBounded } from './durable.mjs';
import { assertSchedulerCompatible, manageScheduler, assertRuntimeCompatible, loadedRuntimeFingerprint } from './workflow-scheduler.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { withLock } from './lock.mjs';
import { WorkError } from './errors.mjs';
import { recoverInterruptedRuns, pidAlive } from '../recover.mjs';

export const WORKFLOW_PROVIDER = 'workflow-local';
export const digest = value => createHash('sha256').update(value).digest('hex');
export const workflowLock = (store, fn) => withLock(path.join(store.workDir(), 'workflow-lock'), fn);
const safeId = id => { if (!/^[a-z][a-z0-9-]{0,63}$/.test(id)) throw new WorkError('Invalid workflow id.'); return id; };

export async function readDefinition(store, id) {
  const dir = path.join(store.workDir(), 'workflows', safeId(id));
  const definition = validateDefinition(await store.readJson(path.join(dir, 'workflow.json')));
  if (definition.id !== id) throw new WorkError('Workflow filename/id mismatch.');
  const kind = workflowKind(definition.kind);
  const materials = {};
  for (const name of kind.materialFiles) {
    materials[name] = (await readBounded(path.join(dir, name), 256_000)).toString('utf8');
    if (materials[name] === null) throw new WorkError(`Missing workflow material: ${name}`);
  }
  for (const name of kind.optionalMaterials ?? []) {
    try { materials[name] = (await readBounded(path.join(dir, name), 256_000)).toString('utf8'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  rejectCredentials(JSON.stringify(materials), definition);
  const snapshot = { ...definition, schemaVersion: 1, materials, ...await kind.freezeSnapshot({ store, definition, materials }) };
  rejectCredentials(JSON.stringify(snapshot), definition);
  return { ...snapshot, digest: digest(JSON.stringify(snapshot)) };
}

export async function assertWorkflowSlot(store, excludeId) {
  await recoverInterruptedRuns(store.base, { log: () => {} });
  const tasks = await store.listTasks();
  if (tasks.some(t => t.workflow && t.id !== excludeId &&
    (t.status === 'working' || (t.blockedOn?.live && pidAlive(t.pid))))) {
    throw new WorkError('One workflow run is already executing; wait or cancel it.');
  }
}

export function localParts(now, timezone = 'Europe/Lisbon') {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(now).map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}
export function addDays(date, days) {
  const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
// Keep the original two-day cadence; coalesce missed slots to the latest one.
export function dueSlot(schedule, now = new Date()) {
  validateSchedule(schedule);
  if (schedule.paused) return null;
  const local = localParts(now, schedule.timezone);
  if (schedule.nextDate > local.date) return null;
  const elapsed = Math.floor((Date.parse(local.date) - Date.parse(schedule.nextDate)) / 86400000);
  let date = addDays(schedule.nextDate, Math.floor(elapsed / schedule.everyDays) * schedule.everyDays);
  if (date === local.date && local.time < schedule.time) date = addDays(date, -schedule.everyDays);
  const latest = date >= schedule.nextDate ? date : null;
  return latest;
}

export function createWorkflowActions({ store, actions }) {
  // Explicitly adopt new settings while retaining evidence and prior-run snapshots.
  // Ordinary rerun never changes a task's frozen definition implicitly.
  async function refreshWorkflow(id) {
    return workflowLock(store, async () => {
      const task = await store.findTask(id);
      if (!task.workflow) throw new WorkError('This task has no workflow.');
      await assertNoPendingOperation(store, task);
      if (task.status === 'working' || task.blockedOn?.live) throw new WorkError('Stop the active run before refreshing settings.');
      const definition = await readDefinition(store, task.workflow.id);
      if (definition.digest === task.workflow.definition.digest && task.workflow.runtimeFingerprint === loadedRuntimeFingerprint) return task;
      if (!task.workflow.schemaVersion) await backupFile(path.join(store.taskDir(task.slug), 'task.json'));
      const workflow = { ...task.workflow, schemaVersion: 1, runtimeFingerprint: loadedRuntimeFingerprint, definition, version: definition.version, review: 'changes_requested', packageComplete: false };
      delete workflow.acceptedDigest;
      const updated = { ...task, workflow };
      return commitWorkflow(store, task, updated, { kind: 'refresh', payload: { digest: definition.digest },
        files: [{ path: path.join(store.taskDir(task.slug), 'definition-revisions', `${task.workflow.definition.digest}.json`), bytes: JSON.stringify(task.workflow.definition, null, 2) + '\n' }],
        events: [{ type: 'task.note', data: { note: `Workflow settings explicitly refreshed to ${definition.version}; prior evidence and run artifacts retained.` } }, { type: 'task.updated', data: { status: updated.status } }] });
    });
  }
  async function startUnlocked(id, { triggerKey = `manual:${randomUUID()}`, trigger = 'manual' } = {}) {
    if (typeof triggerKey !== 'string' || !triggerKey.trim() || triggerKey.length > 200) throw new WorkError('Invalid trigger key.');
    const existing = (await store.listTasks()).find(t => t.workflow?.id === id && t.workflow.triggerKey === triggerKey);
    if (existing) return existing;
    await assertRuntimeCompatible();
    const definition = await readDefinition(store, id);
    await assertWorkflowSlot(store);
    return actions.createWork({
      brief: `${definition.name ?? id}: prepare evidence and a review package.`,
      provider: WORKFLOW_PROVIDER,
      workflow: { schemaVersion: 1, runtimeFingerprint: loadedRuntimeFingerprint, id, version: definition.version, definition, trigger, triggerKey, decisions: [] }
    });
  }
  const schedulePath = id => path.join(store.workDir(), 'schedules', `${safeId(id)}.json`);
  async function scheduleWorkflow(id, operation, { now = new Date(), time = '10:00' } = {}) {
    return workflowLock(store, async () => {
      if (!['pause','status'].includes(operation)) await readDefinition(store, id);
      const file = schedulePath(id);
      let s = await store.exists(file) ? validateSchedule(await store.readJson(file)) : null;
      if (operation === 'enable') {
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new WorkError('Time must be HH:MM.');
        s ??= { schemaVersion: 1, id, timezone: 'Europe/Lisbon', time, everyDays: 2, nextDate: addDays(localParts(now).date, 2), paused: false };
        s.paused = false;
      } else if (operation === 'pause' || operation === 'resume') {
        if (!s) throw new WorkError('Enable the schedule first.');
        s.paused = operation === 'pause';
      } else if (operation !== 'status') throw new WorkError('Use enable, pause, resume or status.');
      if (s && operation !== 'status') { if (!s.schemaVersion && await store.exists(file)) await backupFile(file); await store.writeJson(file, { ...s, schemaVersion: 1 }); }
      return s ?? { id, enabled: false };
    });
  }
  async function bindWorkflow(id, python) {
    return workflowLock(store, async () => {
      safeId(id);
      if (typeof python !== 'string' || !python.trim()) throw new WorkError('Specify a Python executable name/path.');
      const file = path.join(store.workDir(),'workflows',id,'workflow.json');
      const definition = validateDefinition(await store.readJson(file));
      await promisify(execFile)(python,['-c','import PIL'],{timeout:15000,maxBuffer:16000});
      const next = { ...definition, schemaVersion:1, adapters:{...definition.adapters,python},permissions:{...definition.permissions,commandAdapters:true,network:false} };
      await pinAdapters(next); const backup=await backupFile(file); await store.writeJson(file,next);
      return { id, python, backup, existingTasksUnchanged:true, refreshRequired:true };
    });
  }
  async function tickWorkflows({ now = new Date() } = {}) {
    return workflowLock(store, async () => {
      const healthFile = path.join(store.workDir(), 'scheduler', 'health.json');
      const checkedAt = now.toISOString();
      try { await assertRuntimeCompatible(); await assertSchedulerCompatible(store); } catch (error) { await store.writeJson(healthFile, { schemaVersion: 1, checkedAt, success: false, error: error.message }); throw error; }
      const dir = path.join(store.workDir(), 'schedules');
      const files = await fs.readdir(dir).catch(e => { if (e.code === 'ENOENT') return []; throw e; });
      const results = [];
      for (const file of files.filter(f => f.endsWith('.json'))) {
        let s;
        try {
          s = validateSchedule(await store.readJson(path.join(dir, file)));
          if (file !== `${s.id}.json`) throw new WorkError('Schedule filename/id mismatch.');
        } catch (error) { results.push({ workflow: file, error: error.message }); continue; }
        const date = dueSlot(s, now);
        if (!date) continue;
        try {
          const task = await startUnlocked(s.id, { trigger: 'schedule', triggerKey: `schedule:${date}` });
          await store.writeJson(path.join(dir, file), { ...s, nextDate: addDays(date, 2), lastTaskId: task.id, lastSlot: date, lastCheckedAt: now.toISOString(), lastError: null });
          results.push({ workflow: s.id, taskId: task.id, slot: date });
        } catch (error) {
          await store.writeJson(path.join(dir, file), { ...s, lastError: error.message, lastCheckedAt: now.toISOString() });
          results.push({ workflow: s.id, error: error.message });
        }
      }
      await store.writeJson(healthFile, { schemaVersion: 1, checkedAt, success: !results.some(r => r.error), results });
      return results;
    });
  }
  return {
    startWorkflow: (id, opts) => workflowLock(store, () => startUnlocked(safeId(id), opts)),
    scheduleWorkflow, tickWorkflows, refreshWorkflow, bindWorkflow, schedulerAgent: operation => workflowLock(store, () => manageScheduler(store, operation))
  };
}
