// Detached background worker: runs one execution on behalf of a task and
// applies the normalized outcome to the task state.
//
//   node worker.mjs <base> <slug> <run>                -> provider.start
//   node worker.mjs <base> <slug> <run> resume <grant> -> provider.resume
//
// The worker is execution-node infrastructure: the local node spawns it, and
// a future remote node would run the same entrypoint on another machine. It
// consumes normalized provider outcomes (core/lifecycle.mjs) and appends
// normalized Work events (core/events.mjs) to the task's event log so any
// connected client can observe the run. Provider behavior stays inside the
// provider; state meaning stays inside the core; this file only wires them.

import { createWorkflowProvider } from "./workflows/provider.mjs";
import { assertRuntimeCompatible, loadedRuntimeFingerprint } from "./core/workflow-scheduler.mjs";
import { identityMatches } from "./core/process-identity.mjs";
import { workflowLock } from "./core/workflows.mjs";
import { currentRunNumber } from "./core/runs.mjs";
import { commitWorkflow } from "./core/workflow-transaction.mjs";
import { verifyArtifacts } from "./core/workflow-artifacts.mjs";
import { crashPoint } from "./core/faults.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import { createStore } from "./core/store.mjs";
import { applyOutcome, beginResume, cancelledOutcome, outcomeAfterCancel } from "./core/lifecycle.mjs";
import { workEvent } from "./core/events.mjs";
import { updateRun } from "./core/runs.mjs";
import { createProviderRegistry } from "./providers/index.mjs";
import { snapshotWorktree, changedSince } from "./core/worktree.mjs";

// argv: node worker.mjs <base> <slug> <run> [resume <grant>]
// The run number is explicit (the node derives it from the task's run
// records) so this process never has to guess which run it is executing.
const [, , base, slug, runArg, mode, grant] = process.argv;
const runNumber = Number(runArg) || 1;

if (!base || !slug) {
  console.error("worker requires <cwd> <slug> <run> [resume <allow|reject|continue>]");
  process.exit(1);
}

const store = createStore(base);
const dir = store.taskDir(slug);
const metaPath = path.join(dir, "task.json");
const promptPath = path.join(dir, "prompt.md");
// THIS run's generated input, persisted by the actions when the run starts
// (runs/<n>/prompt.md). A run that predates per-run prompts falls back to the
// task-level original prompt.md. Resume never reads either: it continues the
// existing provider session with the canned grant prompt.
const runPromptPath = path.join(dir, "runs", String(runNumber), "prompt.md");
const resultPath = path.join(dir, "result.md");

// The provider registry for THIS workspace: built-in providers plus any
// manifests under .work/providers/. A malformed manifest fails loudly here,
// exactly as it does for the CLI/API — never silently.
const providers = createProviderRegistry({ base });

// The interactive-permission channel: the actions write the human's
// ALLOW/REJECT here; a provider that holds an outstanding ACP permission
// request polls this file and answers the ORIGINAL request in place, so the
// same session/execution continues. A stale file from an interrupted run is
// cleared before we start.
const permissionDecisionFile = path.join(dir, "permission.json");

// Installed before the first await. A SIGTERM that arrives while the task
// file is still being read must not take the default action and die, or the
// run would stay `working` with no outcome.
let currentProvider = null;
let cancelRequested = false;
let cancelDeliveryError = null;
let outcomeOwned = false;
let cancelTimer = null;
let cancelInFlight = Promise.resolve();

process.on("SIGTERM", () => {
  if (cancelRequested) return;
  cancelRequested = true;
  if (outcomeOwned) return;
  armCancel();
});

await fs.rm(permissionDecisionFile, { force: true }).catch(() => {});

const task = await store.readJson(metaPath);

// The node's cancelExecution sends SIGTERM. This process asks the provider
// to cancel, then records the terminal state. It does not exit before that
// write: a completion that already won is left as-is.
let runSessionId = null; // the provider-surfaced session id, persisted on pause
// Git baseline captured before the run starts, so the worker can observe
// which files the run changed (see recordObservedChanges). Null when the
// workspace has no git baseline (observation is impossible, honestly).
let worktreeBefore = null;

function log(line) {
  process.stdout.write(`[${new Date().toISOString().slice(11, 19)}] ${line}\n`);
}

// Every event this process records belongs to the run it is executing —
// including its task.updated writes (a resume's grant is part of run N's
// story). Events written before run history existed carry no `run` and belong
// to run 1. Action-level events (task.created / task.closed) are not run
// events and are never stamped.
//
// Records are serialized on one promise chain: appendFile is async and
// concurrent appends could otherwise land out of order in the log, corrupting
// the chronology every surface reads.
let recordChain = Promise.resolve();
function record(type, data = {}) {
  recordChain = recordChain.then(() =>
    store.appendEvent(slug, workEvent(type, task.id, { ...data, run: runNumber }))
  );
  return recordChain;
}

// Serialize task.json read-modify-write operations. The interactive
// permission handlers run fire-and-forget from the event stream, so their
// writes must not interleave with finish()'s final write — a lost update
// would leave the task stuck in an intermediate state.
let stateChain = Promise.resolve();
const withState = fn => {
  stateChain = stateChain.then(() => task.workflow ? workflowLock(store, fn) : fn());
  return stateChain;
};

// Finalize the run record for THIS run: outcome, real timing, session,
// attempts, and the failure/block details the outcome produced. The run's
// outcome is the task status produced by the provider contract (ready /
// needs_you / failed) — nothing provider-shaped leaks in. Legacy tasks with
// no run records are left untouched (their history stays interpreted).
function finalizeRun(current) {
  if (!Array.isArray(current.runs)) return current;
  const record = current.runs.find(r => r.run === runNumber);
  if (!record) return current;
  const completedAt = new Date().toISOString();
  const startedMs = Date.parse(record.startedAt);
  return updateRun(current, runNumber, {
    outcome: current.status,
    completedAt,
    ...(Number.isFinite(startedMs)
      ? { durationMs: Date.parse(completedAt) - startedMs }
      : {}),
    externalSessionId: current.execution?.externalSessionId,
    attempts: current.execution?.attempts ?? record.attempts ?? 1,
    error: current.status === "failed" ? current.error : undefined,
    ...(current.status === "failed" && current.failure ? { failure: current.failure } : {}),
    blockedOn: current.status === "needs_you" ? current.blockedOn : undefined
  });
}

const onEvent = async event => {
  switch (event.type) {
    case "run.started":
      record("run.started", { sessionId: event.sessionId ?? null });
      if (event.sessionId) runSessionId = event.sessionId;
      log(`session started: ${event.sessionId ?? "unknown"}`);
      break;
    case "tool.started": {
      const input = event.input ?? {};
      const target =
        typeof input.file_path === "string"
          ? input.file_path
          : typeof input.command === "string"
            ? input.command.slice(0, 80)
            : "";
      record("tool.started", { name: event.name, input: event.input ?? {} });
      log(`tool: ${event.name}${target ? ` ${target}` : ""}`);
      break;
    }
    case "file.changed":
      // The provider adapter decides what counts as a change (vendor tool
      // vocabulary is its concern, not ours) — this just records what it says.
      record("file.changed", { path: event.path });
      log(`file changed: ${event.path}`);
      break;
    case "progress":
      if (event.text) {
        record("progress", { text: event.text });
        log(event.text.replace(/\s+/g, " ").trim().slice(0, 160));
      }
      break;
    case "needs_user": {
      await record("needs_user", {
        reason: event.reason,
        detail: event.detail ?? {},
        ...(event.blockedOn ? { blockedOn: event.blockedOn } : {})
      });
      // An INTERACTIVE ACP permission request pauses the run for the human
      // while the provider keeps the agent session alive. Persist the
      // needs_you state so every surface sees the halt; the provider is
      // waiting on the decision file and will continue the SAME run when the
      // human decides.
      if (event.blockedOn?.live) {
        await withState(async () => {
          const fresh = await store.readJson(metaPath);
          const now = new Date().toISOString();
          let paused = {
            ...fresh,
            status: "needs_you",
            blockedOn: event.blockedOn,
            updatedAt: now,
            // The session id is real (surfaced at run.started); persist it so
            // the paused run is inspectable while the human decides.
            ...(runSessionId
              ? { execution: { ...(fresh.execution ?? {}), externalSessionId: runSessionId } }
              : {})
          };
          delete paused.error;
          if (Array.isArray(paused.runs)) {
            const record = paused.runs.find(r => r.run === runNumber);
            const startedMs = record ? Date.parse(record.startedAt) : NaN;
            paused = updateRun(paused, runNumber, {
              outcome: "needs_you",
              completedAt: now,
              ...(Number.isFinite(startedMs)
                ? { durationMs: Date.parse(now) - startedMs }
                : {}),
              externalSessionId: runSessionId ?? record?.externalSessionId,
              blockedOn: event.blockedOn
            });
          }
          await store.writeJson(metaPath, paused);
        });
        log(`needs user (permission): awaiting your decision`);
      } else {
        log(`needs user (${event.reason}): ${event.detail?.message ?? ""}`);
      }
      break;
    }
    case "permission.resolved": {
      // The human answered the outstanding permission request; the provider
      // responded and the SAME run continues (no new session, no restart).
      await record("permission.resolved", { grant: event.grant });
      await withState(async () => {
        const fresh = await store.readJson(metaPath);
        // Reflect the resumed run only while the task is still parked on it.
        // If the run already settled to a terminal state (the completion
        // raced this fire-and-forget handler), the terminal state stands —
        // a late "working" write must never clobber ready/failed.
        if (fresh.status !== "needs_you") return;
        const now = new Date().toISOString();
        let resumed = { ...fresh, status: "working", updatedAt: now };
        delete resumed.blockedOn;
        if (Array.isArray(resumed.runs)) {
          resumed = updateRun(resumed, runNumber, {
            outcome: "working",
            completedAt: undefined,
            durationMs: undefined,
            blockedOn: undefined
          });
        }
        await store.writeJson(metaPath, resumed);
      });
      log(`permission ${event.grant} — continuing the same run`);
      break;
    }
  }
};

// Record the terminal run events + the resulting task state.
async function finish(current, outcome) {
  current = finalizeRun(current);

  if (outcome.status === "failed") {
    await record("run.failed", { error: outcome.error ?? "Execution failed" });
  } else if (outcome.status === "needs_you") {
    await record("needs_user", {
      reason: outcome.reason,
      blockedOn: outcome.blockedOn ?? {}
    });
  } else {
    await record("run.completed", { status: outcome.status });
  }
  await withState(async () => { await store.writeJson(metaPath, current); });
  await record("task.updated", { status: current.status });
  log(
    `outcome: ${outcome.status}${outcome.reason ? ` (${outcome.reason})` : ""}`
  );
}

// Repository-observed changes land BEFORE the terminal event, so the run's
// trace reads "changed … completed", never the reverse. The observed set is
// the authoritative on-disk final state for the aggregate changed-file list
// (the ledger dedupes provider telemetry against it by canonical path);
// 0x2F's own `.work/` state is never counted as a run's change.
async function recordObservedChanges() {
  if (!worktreeBefore) return;
  const changed = await changedSince(base, worktreeBefore);
  for (const p of changed) {
    if (p === ".work" || p.startsWith(".work/")) continue;
    await record("file.changed", { path: p, source: "worktree" });
    log(`observed change: ${p}`);
  }
}

const TERMINAL = new Set(["ready", "failed", "done"]);

// Persist one outcome unless a terminal state is already on disk. Ready and
// needs_you keep their result text; a cancellation does not invent one.
// The state lock covers only the read-and-result step. finish() takes the
// same lock to write task.json, so calling it inside this critical section
// would wait on itself and the process would exit with the run still working.
async function commitOutcome(outcome) {
  if (task.workflow) {
    await withState(async () => {
      const fresh = await store.findTask(task.id);
      if (fresh.pid !== process.pid || mode !== "workflow" || grant !== task.execution.launchToken || !(await identityMatches(fresh.workerIdentity)) || currentRunNumber(fresh) !== runNumber || fresh.execution.launchToken !== task.execution.launchToken || TERMINAL.has(fresh.status)) return;
      const cancel = await store.readCancelRequest(fresh);
      if (cancel?.run === runNumber) outcome = cancelledOutcome();
      let next = applyOutcome(fresh, outcome);
      if (outcome.workflowPatch && outcome.status !== "failed") next.workflow = { ...fresh.workflow, ...outcome.workflowPatch };
      if (outcome.status === "needs_you") await verifyArtifacts(store, next);
      const files = ["ready", "needs_you"].includes(outcome.status) ? [resultPath, path.join(dir, "runs", String(runNumber), "result.md")].map(path => ({ path, bytes: outcome.result ?? "" })) : [];
      next = finalizeRun(next);
      await commitWorkflow(store, fresh, next, { operationId: `outcome-${runNumber}`, kind: "result", payload: { status: outcome.status }, files,
        events: [{ type: outcome.status === "failed" ? "run.failed" : outcome.status === "needs_you" ? "needs_user" : "run.completed", data: { run: runNumber, status: outcome.status, error: outcome.error, reason: outcome.reason, blockedOn: outcome.blockedOn } }, { type: "task.updated", data: { run: runNumber, status: outcome.status } }] });
    });
    log(`outcome: ${outcome.status}`); return;
  }
  let next = null;
  await withState(async () => {
    const fresh = await store.readJson(metaPath);
    if (TERMINAL.has(fresh.status)) return;
    next = applyOutcome(fresh, outcome);
    if (outcome.externalSessionId) {
      next.execution = {
        ...(next.execution ?? {}),
        externalSessionId: outcome.externalSessionId
      };
    }
    if (outcome.status === "ready" || outcome.status === "needs_you") {
      await store.writeText(resultPath, outcome.result ?? "");
      await fs.chmod(resultPath, 0o600).catch(() => {});
      if (Array.isArray(next.runs)) {
        const runDir = path.join(dir, "runs", String(runNumber));
        await fs.mkdir(runDir, { recursive: true });
        const runResultPath = path.join(runDir, "result.md");
        await store.writeText(runResultPath, outcome.result ?? "");
        await fs.chmod(runResultPath, 0o600).catch(() => {});
      }
    }
  });
  if (!next) return;
  await recordObservedChanges();
  await finish(next, outcome);
}

function noteCancelDelivery(result) {
  if (result && result.delivered === false) {
    cancelDeliveryError = result.error || "the provider did not accept the cancellation";
  }
}

function armCancel() {
  // cancel() may confirm delivery on a later tick (a closed ACP pipe reports
  // EPIPE asynchronously). The outcome waits for that confirmation.
  cancelInFlight = Promise.resolve()
    .then(() => currentProvider?.cancel?.())
    .then(result => noteCancelDelivery(result))
    .catch(error => {
      cancelDeliveryError = error instanceof Error ? error.message : String(error);
    });
  // The provider is expected to settle after session/cancel or the child
  // signal. If it does not, record the cancellation anyway.
  cancelTimer = setTimeout(() => {
    const pending = cancelInFlight;
    pending.finally(() => {
      if (outcomeOwned) return;
      outcomeOwned = true;
      commitOutcome(cancelledOutcome(
        cancelDeliveryError
          ? `The provider did not accept the cancellation: ${cancelDeliveryError}`
          : ""
      )).finally(() => process.exit(0));
    });
  }, 2000);
  cancelTimer.unref?.();
}

try {
  if (task.workflow) {
    crashPoint('worker.before-gate');
    const gate = path.join(dir, 'runs', String(runNumber), 'launch.json');
    for (let attempt = 0; !(await store.exists(gate)); attempt++) {
      if (attempt >= 200) throw new Error('Launch gate was not committed; no adapter was started. Use workflow recover.');
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    const launch = await store.readJson(gate);
    if (mode !== 'workflow' || grant !== task.execution.launchToken || launch.token !== grant || launch.pid !== process.pid) throw new Error('Worker launch token mismatch; no adapter was started.');
    crashPoint('worker.gate-open');
    await assertRuntimeCompatible();
    if (task.workflow.runtimeFingerprint && task.workflow.runtimeFingerprint !== loadedRuntimeFingerprint) throw new Error('Runtime changed between task creation and worker start. No adapter was started.');
    const cancel = await store.readCancelRequest(task);
    if (cancelRequested || cancel?.run === runNumber) { outcomeOwned = true; await commitOutcome(cancelledOutcome()); process.exit(0); }
  }
  const provider = task.workflow ? createWorkflowProvider() : providers.getProvider(
    task.execution?.provider ?? providers.defaultProviderId
  );
  if (!provider) {
    let failed = applyOutcome(task, {
      status: "failed",
      error: `No execution provider found for "${task.execution?.provider}".`
    });
    failed = finalizeRun(failed);
    await store.writeJson(metaPath, failed);
    await record("run.failed", { error: failed.error });
    await record("task.updated", { status: failed.status });
    log("outcome: failed (no execution provider)");
    process.exit(1);
  }
  currentProvider = provider;

  // Baseline for repository-observed file changes. The worker observes git
  // around EVERY run (when a git baseline exists) so the final changed-file
  // claim is always the authoritative on-disk state — providers' own
  // file.changed telemetry (live, possibly transient) stays in the trace,
  // and the ledger's aggregate dedupes the two by canonical path with the
  // observed set authoritative. Captured after the run's prompt file is in
  // place and before the provider starts executing.
  worktreeBefore = await snapshotWorktree(base);

  let current = task;
  let outcome;

  if (mode === "resume") {
    if (provider.capabilities?.supportsResume === false) {
      // Declared capability difference: the provider cannot continue a
      // session. Fail loudly instead of pretending a new run is a resume.
      let failed = applyOutcome(task, {
        status: "failed",
        error: `Provider "${provider.id}" does not support resuming sessions.`
      });
      failed = finalizeRun(failed);
      await store.writeJson(metaPath, failed);
      await record("run.failed", { error: failed.error });
      await record("task.updated", { status: failed.status });
      log("outcome: failed (provider does not support resume)");
      process.exit(1);
    }
    if (task.status !== "needs_you") {
      log(`outcome: skipped — task is ${task.status}, not needs_you`);
      process.exit(0);
    }
    current = beginResume(task, grant);
    // The run reopens: the same run (same session) continues, so its record
    // goes back to working and its previous completion time is cleared.
    if (Array.isArray(current.runs)) {
      current = updateRun(current, runNumber, {
        outcome: "working",
        attempts: current.execution?.attempts,
        completedAt: undefined,
        durationMs: undefined,
        error: undefined,
        blockedOn: undefined
      });
    }
    await store.writeJson(metaPath, current);
    // Carry the grant on the normalized event: `beginResume` already records
    // it as execution.lastAction, so clients can show who unblocked the task
    // without inferring it from a status change.
    await record("task.updated", { status: current.status, grant });
    log(`resuming session ${current.execution?.externalSessionId ?? "?"} (${grant})`);

    outcome = await provider.resume({
      cwd: base,
      externalSessionId: current.execution?.externalSessionId,
      grant,
      onEvent,
      permission: { decisionFile: permissionDecisionFile },
      model: current.execution?.model
    });
  } else {
    if (task.status !== "working") {
      log(`outcome: skipped — task is ${task.status}, not working`);
      process.exit(0);
    }
    const prompt = (await store.exists(runPromptPath))
      ? await fs.readFile(runPromptPath, "utf8")
      : await fs.readFile(promptPath, "utf8");
    log(`launching ${provider.displayName} (${provider.id})`);
    outcome = await provider.start({
      cwd: base,
      task,
      store,
      prompt,
      onEvent,
      permission: { decisionFile: permissionDecisionFile },
      model: task.execution?.model
    });
  }

  if (cancelRequested) await cancelInFlight;
  const settled = outcomeAfterCancel({
    cancelRequested,
    deliveryError: cancelDeliveryError,
    outcome
  });
  if (!outcomeOwned) {
    outcomeOwned = true;
    if (cancelTimer) clearTimeout(cancelTimer);
    await commitOutcome(settled);
  }
} catch (error) {
    if (!outcomeOwned) {
      outcomeOwned = true;
      if (cancelTimer) clearTimeout(cancelTimer);
      if (cancelRequested) await cancelInFlight;
      const settled = outcomeAfterCancel({
        cancelRequested,
        deliveryError: cancelDeliveryError,
        outcome: {
          status: "failed",
          error: error instanceof Error ? error.message : String(error)
        }
      });
      try {
        await commitOutcome(settled);
      } catch (writeError) {
        log(`outcome: failed (${writeError instanceof Error ? writeError.message : writeError})`);
      }
    }
    process.exitCode = cancelRequested ? 0 : 1;
  }
