// Crash/reboot recovery — the startup sweep that turns interrupted runs into
// honest failures.
//
// A run's execution is owned by a detached worker process (src/worker.mjs)
// whose pid is persisted on the task (task.pid). When the host restarts, or
// the worker dies without writing a terminal outcome, its working execution
// or live permission pause has no process left to advance it. Closed tasks
// may still have such an in-flight run; their done status is preserved while
// the interrupted run itself is finalized.
//
// This sweep runs once, on runtime startup (src/serve.mjs), BEFORE the API
// accepts requests. It finalizes interrupted runs through the existing lifecycle
// (applyOutcome + the already-defined failure kind "crashed"), finalizing the
// interrupted run's record the way the worker would have — but with the run's
// completedAt/durationMs anchored to the last event the worker persisted (an
// honest lower bound, since its true death moment is unknowable) — while
// preserving run history and any persisted externalSessionId. A task whose
// worker is alive is never touched — the sweep must not race a genuinely
// running run.
//
// PID liveness is a cheap existence probe (signal 0). A task whose worker
// died is unrecoverable in place, so the honest state is failed; the
// persisted session id remains on the run record for inspection, and the
// task reruns normally (rerunWork only refuses while a task is "working").

import path from "node:path";
import { createStore } from "./core/store.mjs";
import { applyOutcome } from "./core/lifecycle.mjs";
import { workEvent } from "./core/events.mjs";
import { currentRunNumber, updateRun } from "./core/runs.mjs";

export const INTERRUPTED_ERROR =
  "Run was interrupted — the worker process is no longer alive (host restart or crash). Rerun the task to continue.";

// Is a pid a live process? Signal 0 tests existence without delivering a
// real signal. EPERM means the process exists but is owned by another user —
// treated as alive (defensive; the worker is ours). A zombie that has not yet
// been reaped still "exists"; the parent (the runtime) reaps its workers, and
// an orphaned zombie is reaped by init, so a dead worker stops answering this
// probe almost immediately after the machine or worker is gone.
export function pidAlive(pid, kill = process.kill) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

// Local workers are detached POSIX process-group leaders. The group may
// survive its worker (SIGKILL cannot run cleanup). Probe only: never kill a
// saved process group, whose numeric identity could have been reused.
export function processGroupAlive(pgid, kill = process.kill) {
  if (process.platform === "win32" || !Number.isSafeInteger(pgid) || pgid <= 0) return false;
  try {
    kill(-pgid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

function info(log, ...args) {
  if (typeof log?.log === "function") log.log(...args);
  else if (typeof log === "function") log(...args);
}

// Mark one interrupted task failed through the shared lifecycle. The current
// run's record is finalized like the worker would have finalized it (outcome
// failed), but the worker is dead so its true completion moment is unknowable.
// Rather than stamp the sweep's own time as the completion time — which would
// show every interrupted run as having run until recovery — we anchor the run's
// completedAt and durationMs to the LAST event the worker actually persisted
// (its events.jsonl entry for this run): an honest lower bound saying "it ran
// at least until this moment". A run that died silently after its last event is
// still understated, which is exactly how a lower bound should behave. When the
// run persisted no events at all, there is no event to anchor to, so we fall
// back to the sweep's time (the only remaining anchor). externalSessionId and
// every other historical field are preserved. Returns the failed task.
async function failLockedRun(store, task, { log = console } = {}) {
  const runNumber = currentRunNumber(task);
  // The last event this run's worker persisted — the honest lower-bound anchor.
  const events = await store.readEvents(task.slug);
  const lastPersistedAt = events.filter(e => e.run === runNumber).at(-1)?.at;
  const now = new Date().toISOString();
  // Without any persisted event there is nothing to anchor to; the sweep time is
  // the only signal we have that the run ended by recovery.
  const completedAt = typeof lastPersistedAt === "string" ? lastPersistedAt : now;
  const completedMs = Date.parse(completedAt);
  let failed = applyOutcome(task, {
    status: "failed",
    error: INTERRUPTED_ERROR,
    failure: { kind: "crashed" }
  });
  if (Array.isArray(failed.runs)) {
    const record = failed.runs.find(r => r.run === runNumber);
    const startedMs = record ? Date.parse(record.startedAt) : NaN;
    failed = updateRun(failed, runNumber, {
      outcome: "failed",
      completedAt,
      ...(Number.isFinite(startedMs) && Number.isFinite(completedMs)
        ? { durationMs: completedMs - startedMs }
        : {}),
      error: INTERRUPTED_ERROR,
      blockedOn: undefined
    });
  }
  // A user may close a task while its worker is still executing. Keep that
  // decision, but make the interrupted run's own history truthful.
  if (task.status === "done") failed.status = "done";
  await store.writeJson(path.join(store.taskDir(task.slug), "task.json"), failed);
  // Normalized events, stamped with the run — the same shape the worker's own
  // terminal events carry, so every surface renders the recovery identically.
  await store.appendEvent(
    task.slug,
    workEvent("run.failed", task.id, { error: INTERRUPTED_ERROR, run: runNumber })
  );
  await store.appendEvent(
    task.slug,
    workEvent("task.updated", task.id, { status: failed.status, run: runNumber })
  );
  info(
    log,
    `recovered task #${task.id} (${task.slug}): run ${runNumber} interrupted — ` +
      `marked failed (worker pid ${task.pid ?? "?"} not alive)`
  );
  return failed;
}

function hasInterruptedExecution(task) {
  if (task.status === "working") return true;
  if (task.status === "needs_you") return task.blockedOn?.live === true;
  if (task.status !== "done") return false;
  const run = task.runs?.at(-1);
  return run?.outcome === "working" ||
    (run?.outcome === "needs_you" && run.blockedOn?.live === true);
}

// The initial listing is only a candidate list. Another process can close,
// resume, or finish between that read and recovery, so re-read ownership and
// liveness under the same lock actions and workers use before writing.
export async function failInterruptedRun(
  store,
  task,
  { kill = process.kill, log = console } = {}
) {
  return store.withTaskLock(task.slug, async () => {
    const fresh = await store.readJson(path.join(store.taskDir(task.slug), "task.json"));
    if (currentRunNumber(fresh) !== currentRunNumber(task) || fresh.pid !== task.pid) return null;
    if (!hasInterruptedExecution(fresh) || pidAlive(fresh.pid, kill)) return null;
    return failLockedRun(store, fresh, { log });
  });
}

// Recover working runs and live permission pauses whose worker pid is gone
// (or was never recorded). A completed human decision is not an execution
// and remains untouched. `kill` is injectable for tests.
export async function recoverInterruptedRuns(
  base,
  { kill = process.kill, log = console } = {}
) {
  const store = createStore(base);
  const tasks = await store.listTasks();
  const recovered = [];
  for (const task of tasks) {
    if (!hasInterruptedExecution(task)) continue;
    const failed = await failInterruptedRun(store, task, { kill, log });
    if (failed) recovered.push(failed);
  }
  return recovered;
}
