// Detached execution worker. Task input and user state can change in other
// processes while a provider runs, so every publication merges fresh state
// under the task lock and verifies this run's worker still owns it.
import fs from "node:fs/promises";
import path from "node:path";
import { createStore } from "./core/store.mjs";
import { applyOutcome, beginResume } from "./core/lifecycle.mjs";
import { workEvent } from "./core/events.mjs";
import { currentRunNumber, updateRun } from "./core/runs.mjs";
import { createProviderRegistry } from "./providers/index.mjs";
import { snapshotWorktree, changedSince } from "./core/worktree.mjs";

// node worker.mjs <base> <slug> <run> [resume <allow|reject|continue>]
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
const runPromptPath = path.join(dir, "runs", String(runNumber), "prompt.md");
const resultPath = path.join(dir, "result.md");
const permissionDecisionFile = path.join(dir, "permission.json");

function ownsExecution(current) {
  return currentRunNumber(current) === runNumber &&
    (current.pid == null || current.pid === process.pid);
}

function log(line) {
  process.stdout.write(`[${new Date().toISOString().slice(11, 19)}] ${line}\n`);
}

// Actions reserve a resume and persist its new PID while holding this same
// lock. A worker cannot read the old PID or reopen an already-reserved run.
// The no-PID needs_you branch supports direct workers for legacy state.
const task = await store.withTaskLock(slug, async () => {
  let current = await store.readJson(metaPath);
  if (!ownsExecution(current)) return null;
  let changed = false;
  if (mode === "resume") {
    if (current.status === "needs_you") {
      current = beginResume(current, grant);
      current = updateRun(current, runNumber, {
        outcome: "working",
        attempts: current.execution?.attempts,
        completedAt: undefined,
        durationMs: undefined,
        error: undefined,
        blockedOn: undefined
      });
      changed = true;
    } else if (
      !["working", "done"].includes(current.status) ||
      current.execution?.lastAction !== grant
    ) {
      return null;
    }
  } else if (
    current.status !== "working" &&
    !(current.status === "done" && current.runs?.at(-1)?.outcome === "working")
  ) {
    return null;
  }
  if (current.pid == null) {
    current = { ...current, pid: process.pid };
    changed = true;
  }
  // A stale worker must not erase a newer execution's decision channel.
  await fs.rm(permissionDecisionFile, { force: true });
  if (changed) await store.writeJson(metaPath, current);
  return current;
});
if (!task) {
  log("outcome: skipped — this worker no longer owns the requested execution");
  process.exit(0);
}

let currentProvider = null;
let runSessionId = null;
let worktreeBefore = null;
let finished = false;
process.on("SIGTERM", () => {
  try { currentProvider?.cancel?.(); } catch { /* best-effort */ }
  process.exit(0);
});

// Providers may fire callbacks without awaiting them. One local queue keeps
// their chronology, and the cross-process task lock protects the actual
// read/modify/write against notes, close, resume, and recovery in other clients.
let stateChain = Promise.resolve();
let eventError = null;
function withState(fn) {
  const operation = stateChain.then(fn);
  stateChain = operation.catch(() => {});
  return operation;
}

function append(current, type, data = {}) {
  return store.appendEvent(slug, workEvent(type, current.id, { ...data, run: runNumber }));
}

function finalizeRun(current, outcome) {
  const record = Array.isArray(current.runs) ? current.runs.find(r => r.run === runNumber) : null;
  if (!record) return current;
  const completedAt = new Date().toISOString();
  const startedMs = Date.parse(record.startedAt);
  return updateRun(current, runNumber, {
    // Closing a task does not change what its execution actually produced.
    outcome: outcome.status,
    completedAt,
    ...(Number.isFinite(startedMs)
      ? { durationMs: Date.parse(completedAt) - startedMs }
      : {}),
    externalSessionId: current.execution?.externalSessionId,
    attempts: current.execution?.attempts ?? record.attempts ?? 1,
    error: outcome.status === "failed" ? current.error : undefined,
    blockedOn: outcome.status === "needs_you" ? current.blockedOn : undefined
  });
}

function onEvent(event) {
  return withState(() => store.withTaskLock(slug, async () => {
    if (finished) return;
    const fresh = await store.readJson(metaPath);
    if (!ownsExecution(fresh)) return;
    switch (event.type) {
      case "run.started": {
        await append(fresh, "run.started", { sessionId: event.sessionId ?? null });
        if (event.sessionId) {
          runSessionId = event.sessionId;
          const started = updateRun({ ...fresh, execution: {
            ...(fresh.execution ?? {}), externalSessionId: runSessionId
          } }, runNumber, { externalSessionId: runSessionId });
          await store.writeJson(metaPath, started);
        }
        log(`session started: ${event.sessionId ?? "unknown"}`);
        break;
      }
      case "tool.started": {
        const input = event.input ?? {};
        const target = typeof input.file_path === "string" ? input.file_path
          : typeof input.command === "string" ? input.command.slice(0, 80) : "";
        await append(fresh, "tool.started", { name: event.name, input });
        log(`tool: ${event.name}${target ? ` ${target}` : ""}`);
        break;
      }
      case "file.changed":
        await append(fresh, "file.changed", { path: event.path });
        log(`file changed: ${event.path}`);
        break;
      case "progress":
        if (event.text) {
          await append(fresh, "progress", { text: event.text });
          log(event.text.replace(/\s+/g, " ").trim().slice(0, 160));
        }
        break;
      case "needs_user": {
        await append(fresh, "needs_user", {
          reason: event.reason,
          detail: event.detail ?? {},
          ...(event.blockedOn ? { blockedOn: event.blockedOn } : {})
        });
        if (event.blockedOn?.live) {
          const now = new Date().toISOString();
          let paused = { ...fresh, updatedAt: now };
          if (fresh.status !== "done") {
            paused.status = "needs_you";
            paused.blockedOn = event.blockedOn;
          }
          if (runSessionId) paused.execution = {
            ...(fresh.execution ?? {}), externalSessionId: runSessionId
          };
          delete paused.error;
          const record = Array.isArray(paused.runs) ? paused.runs.find(r => r.run === runNumber) : null;
          const startedMs = Date.parse(record?.startedAt);
          paused = updateRun(paused, runNumber, {
            outcome: "needs_you",
            completedAt: now,
            ...(Number.isFinite(startedMs) ? { durationMs: Date.parse(now) - startedMs } : {}),
            externalSessionId: runSessionId ?? record?.externalSessionId,
            blockedOn: event.blockedOn
          });
          await store.writeJson(metaPath, paused);
          log("needs user (permission): awaiting your decision");
        } else {
          log(`needs user (${event.reason}): ${event.detail?.message ?? ""}`);
        }
        break;
      }
      case "permission.resolved": {
        await append(fresh, "permission.resolved", { grant: event.grant });
        if (!["needs_you", "done"].includes(fresh.status)) break;
        let resumed = { ...fresh, updatedAt: new Date().toISOString() };
        if (fresh.status !== "done") resumed.status = "working";
        delete resumed.blockedOn;
        resumed = updateRun(resumed, runNumber, {
          outcome: "working", completedAt: undefined, durationMs: undefined, blockedOn: undefined
        });
        await store.writeJson(metaPath, resumed);
        log(`permission ${event.grant} — continuing the same run`);
        break;
      }
    }
  })).catch(error => {
    // A fire-and-forget provider callback must not become an unhandled
    // rejection. The main path turns its persistence failure into an outcome.
    eventError ??= error;
  });
}

async function observedChanges() {
  if (!worktreeBefore) return [];
  return (await changedSince(base, worktreeBefore))
    .filter(p => p !== ".work" && !p.startsWith(".work/"));
}

async function finish(outcome, changed = []) {
  return withState(() => store.withTaskLock(slug, async () => {
    const fresh = await store.readJson(metaPath);
    if (finished || !ownsExecution(fresh)) {
      log("outcome: skipped — this worker no longer owns the requested execution");
      return false;
    }
    let current = applyOutcome(fresh, outcome);
    if (outcome.externalSessionId) current.execution = {
      ...(current.execution ?? {}), externalSessionId: outcome.externalSessionId
    };
    current = finalizeRun(current, outcome);
    if (fresh.status === "done") {
      current.status = "done";
      delete current.blockedOn;
    }
    // Results and state are one ownership-protected publication. A late
    // worker cannot replace the current result even if its run number changed
    // while the provider or git observation was awaiting I/O.
    if (outcome.status === "ready" || outcome.status === "needs_you") {
      await store.writeText(resultPath, outcome.result ?? "");
      if (Array.isArray(current.runs)) {
        await store.writeText(path.join(dir, "runs", String(runNumber), "result.md"), outcome.result ?? "");
      }
    }
    for (const p of changed) {
      await append(current, "file.changed", { path: p, source: "worktree" });
      log(`observed change: ${p}`);
    }
    await store.writeJson(metaPath, current);
    if (outcome.status === "failed") {
      await append(current, "run.failed", { error: outcome.error ?? "Execution failed" });
    } else if (outcome.status === "needs_you") {
      await append(current, "needs_user", { reason: outcome.reason, blockedOn: outcome.blockedOn ?? {} });
    } else {
      await append(current, "run.completed", { status: outcome.status });
    }
    await append(current, "task.updated", { status: current.status });
    finished = true;
    log(`outcome: ${outcome.status}${outcome.reason ? ` (${outcome.reason})` : ""}`);
    return true;
  }));
}

try {
  // Registry errors must also finalize this worker's reserved run.
  const providers = createProviderRegistry({ base });
  const provider = providers.getProvider(task.execution?.provider ?? providers.defaultProviderId);
  if (!provider) throw new Error(`No execution provider found for "${task.execution?.provider}".`);
  currentProvider = provider;
  worktreeBefore = await snapshotWorktree(base);
  let outcome;
  if (mode === "resume") {
    if (provider.capabilities?.supportsResume === false) {
      throw new Error(`Provider "${provider.id}" does not support resuming sessions.`);
    }
    await withState(() => store.withTaskLock(slug, async () => {
      const fresh = await store.readJson(metaPath);
      if (ownsExecution(fresh)) await append(fresh, "task.updated", { status: fresh.status, grant });
    }));
    log(`resuming session ${task.execution?.externalSessionId ?? "?"} (${grant})`);
    outcome = await provider.resume({
      cwd: base, externalSessionId: task.execution?.externalSessionId, grant, onEvent,
      permission: { decisionFile: permissionDecisionFile }, model: task.execution?.model
    });
  } else {
    const prompt = (await store.exists(runPromptPath))
      ? await fs.readFile(runPromptPath, "utf8") : await fs.readFile(promptPath, "utf8");
    log(`launching ${provider.displayName} (${provider.id})`);
    outcome = await provider.start({
      cwd: base, prompt, onEvent, permission: { decisionFile: permissionDecisionFile }, model: task.execution?.model
    });
  }
  await stateChain;
  if (eventError) throw eventError;
  await finish(outcome, await observedChanges());
} catch (error) {
  await stateChain;
  await finish({ status: "failed", error: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
}
