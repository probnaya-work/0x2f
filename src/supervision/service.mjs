import path from 'node:path';
import { createStore } from '../core/store.mjs';
import { loadedRuntimeFingerprint, runtimeFingerprint } from '../core/workflow-scheduler.mjs';
import {
  supervisionDir, readInstallation, listAttempts, readAttempt, attemptLock,
  writeAttempt, jobState, groupMembers, stopAttemptJob,
  attemptIdentity, attemptIdentityMatches
} from '../core/workflow-supervision.mjs';

const store = createStore(process.argv[2]);
const installation = await readInstallation(store);
if (installation.runtimeFingerprint !== loadedRuntimeFingerprint) process.exit(1);
const identity = await attemptIdentity(process.pid);
if (!identity || identity.unknown) process.exit(1);
const settled = ['promoted', 'reconciled', 'failed', 'cancelled', 'uncertain', 'needs_reconciliation'];
let stopped = false;
process.on('SIGTERM', () => { stopped = true; });

while (!stopped) {
  const matching = loadedRuntimeFingerprint === await runtimeFingerprint();
  await store.writeJson(path.join(supervisionDir(store), 'health.json'), {
    schemaVersion: 1, identity, runtimeFingerprint: loadedRuntimeFingerprint,
    at: new Date().toISOString(), matching
  });
  try {
    for (const original of await listAttempts(store)) {
      if (settled.includes(original.state)) continue; // terminal receipts need no diagnostic lock churn
      await attemptLock(store, original.request.id, async () => {
        const r = await readAttempt(store, original.request.id);
        if (settled.includes(r.state)) return;
        const job = await jobState(r.request.label);
        if (job.pid) {
          if (r.owner && (job.pid !== r.owner.pid || !await attemptIdentityMatches(r.owner))) {
            await writeAttempt(store, r, { state: 'uncertain', reason: 'owner_identity_mismatch' });
            return;
          }
          // Independent watchdog: a stalled helper cannot prevent native group closure.
          // No external side effect is possible before the owner/GO handshake exists.
          if (r.owner) {
            const started = Date.parse(r.startedAt ?? r.ownedAt);
            const task = await store.findTask(r.request.taskId);
            const cancelled = (await store.readCancelRequest(task))?.run === r.request.run;
            let reason;
            if (!await attemptIdentityMatches(r.request.worker)) reason = 'worker_lost';
            else if (cancelled) reason = 'user_cancel';
            else if (!matching) reason = 'runtime_drift';
            else if (Date.now() - started > r.request.timeoutMs) reason = 'timeout';
            if (reason) await stopAttemptJob(store, r, reason);
          }
          return;
        }
        if (r.state === 'validated') {
          if (!await attemptIdentityMatches(r.request.worker)) {
            await writeAttempt(store, r, { state: 'needs_reconciliation', reason: 'worker_lost_after_validation' });
          }
          return;
        }
        // Native startup may briefly have no PID. This bounded grace never releases GO.
        if (r.state === 'prepared' && job.loaded && Date.now() - Date.parse(r.at) < 2000) return;
        if (r.pgid && (await groupMembers(r.pgid)).length) {
          await writeAttempt(store, r, { state: 'uncertain', reason: 'surviving_or_reused_group' });
          return;
        }
        if (r.state === 'cancelling') {
          await writeAttempt(store, r, {
            state: r.reason === 'user_cancel' ? 'cancelled' : 'needs_reconciliation', groupClosed: true
          });
        } else {
          await writeAttempt(store, r, {
            state: 'needs_reconciliation', groupClosed: true,
            reason: r.state === 'prepared' ? 'incomplete_ownership_handshake' : 'supervisor_job_lost'
          });
        }
      });
    }
  } catch {
    await store.writeJson(path.join(supervisionDir(store), 'diagnostic.json'), {
      schemaVersion: 1, at: new Date().toISOString(), code: 'CORRUPT_OR_UNINSPECTABLE_ATTEMPT'
    });
  }
  await new Promise(resolve => setTimeout(resolve, 250));
}
