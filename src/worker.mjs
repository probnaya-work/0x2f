// Detached execution worker. Task input and user state can change in other
// processes while a provider runs, so every publication merges fresh state
// under the task lock and verifies this run's worker still owns it.
import fs from "node:fs/promises";
import { runAcceptance } from "./core/acceptance.mjs";
import { hostIdentity } from "./hosts.mjs";
import os from "node:os";
import { processIdentity } from "./core/execution.mjs";
import { digest } from "./core/context.mjs";
import path from "node:path";
import { createStore } from "./core/store.mjs";
import { applyOutcome, beginResume } from "./core/lifecycle.mjs";
import { workEvent } from "./core/events.mjs";
import { currentRunNumber, updateRun } from "./core/runs.mjs";
import { createProviderRegistry } from "./providers/index.mjs";
import { captureTree, saveChanges } from "./core/isolation.mjs";

// node worker.mjs <base> <slug> <run> [resume <allow|reject|continue>]
const [, , base, slug, runArg, mode, grant] = process.argv;
const runNumber = Number(runArg) || 1;
let executionId = null;
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
    (current.pid == null || current.pid === process.pid) &&
    (!executionId || current.execution?.id === executionId);
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
  executionId = current.execution?.id ?? null;
  current = updateRun(current, runNumber, { executionId });
  const machine = await hostIdentity();
  current = updateRun(current, runNumber, { machine, environment: { platform: process.platform, arch: process.arch,
    release: os.release(), nodeVersion: process.version, cwd: current.checkout?.path ?? base } });
  changed = true;
  const identity = await processIdentity(process.pid);
  if (identity) {
    current = { ...current, execution: { ...current.execution, process: identity } };
    current = updateRun(current, runNumber, { executionId, process: identity, processGroupId: current.processGroupId });
    changed = true;
  }
  const runDir = path.join(dir, "runs", String(runNumber));
  const inputReceipt = await store.readJson(path.join(runDir, "input.json")).catch(() => null);
  const contextReceipt = await store.readJson(path.join(runDir, "context.json")).catch(() => null);
  if (inputReceipt || contextReceipt) {
    current = updateRun(current, runNumber, {
      input: inputReceipt,
      context: contextReceipt ? { version: contextReceipt.version, projectVersion: contextReceipt.projectVersion,
        characters: contextReceipt.characters, maxChars: contextReceipt.maxChars,
        shortenedRuns: contextReceipt.artifacts.filter(a => a.delivery !== "full").length } : undefined
    });
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
const executionCwd = task.checkout?.path ?? base;
let changeReceipt = null;
let checkReceipts = [];
let drainOwnedGroup = false;
const checkAbort = new AbortController();
let finished = false;
let stopping = null;
let stoppedOutcome = null;
let cancelResolve;
const cancelled = new Promise(resolve => { cancelResolve = resolve; });
const partial = [];
let partialSize = 0;
function requestStop(request) {
  if (finished || stopping) return;
  stopping = request;
  checkAbort.abort();
  try { currentProvider?.cancel?.(); } catch { /* the group stop below remains authoritative */ }
  // This process is the live detached group leader, never an old saved PID.
  if (task.processGroupId === process.pid && process.platform !== "win32") {
    try { process.kill(-process.pid, "SIGTERM"); } catch { /* already drained */ }
  }
  stoppedOutcome = { status: "failed", error: `${request.reason}. External actions may already have occurred; review before retrying.`,
    failure: { kind: "cancelled" }, stopReason: "cancelled", result: partial.join("") };
  cancelResolve(stoppedOutcome);
}
process.on("SIGTERM", () => requestStop({ reason: "Worker received SIGTERM", at: new Date().toISOString() }));
let pollingCancel = false;
const cancelTimer = setInterval(async () => {
  if (pollingCancel || finished || stopping || !executionId) return;
  pollingCancel = true;
  try {
    const fresh = await store.readJson(metaPath);
    if (ownsExecution(fresh) && fresh.cancelRequested?.executionId === executionId) requestStop(fresh.cancelRequested);
  } catch { /* transient state read; retry without signalling anything */ }
  finally { pollingCancel = false; }
}, 100);
cancelTimer.unref();


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
  return store.appendEvent(slug, workEvent(type, current.id, { ...data, run: runNumber, executionId }));
}

async function recordInput(prompt, transport) {
  const root = path.join(dir, 'runs', String(runNumber));
  const artifact = `attempts/${executionId ?? 'legacy'}/input.md`;
  const receipt = { version: 1, executionId, transport, artifact,
    characters: typeof prompt === 'string' ? prompt.length : null,
    sha256: typeof prompt === 'string' ? digest(prompt) : null,
    projectContext: transport === 'native resume message' ? 'existing provider session; new notes and rules not delivered' : undefined };
  if (typeof prompt === 'string') await store.writeText(path.join(root, artifact), prompt);
  await store.writeJson(path.join(root, 'attempts', executionId ?? 'legacy', 'input.json'), receipt);
  await store.writeJson(path.join(root, 'input.json'), receipt);
  await store.withTaskLock(slug, async () => {
    const fresh = await store.readJson(metaPath);
    if (ownsExecution(fresh)) await store.writeJson(metaPath, updateRun(fresh, runNumber, { input: receipt }));
  });
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
    blockedOn: outcome.status === "needs_you" ? current.blockedOn : undefined,
    stopReason: outcome.stopReason,
    cancellation: stopping ?? undefined
  });
}

function onEvent(event) {
  return withState(() => store.withTaskLock(slug, async () => {
    if (finished || stopping) return;
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
      case "integration.observed": {
        await append(fresh, event.type, { integration: event.integration });
        await store.writeJson(metaPath, updateRun(fresh, runNumber, { integration: event.integration }));
        break;
      }
      case "process.observed": {
        const identity = await processIdentity(event.pid);
        await append(fresh, event.type, { pid: event.pid, process: identity });
        await store.writeJson(metaPath, updateRun(fresh, runNumber, { harnessProcess: identity ?? { pid: event.pid, generation: "unknown" } }));
        break;
      }
      case "tool.completed": {
        const output = typeof event.output === "string" ? event.output : undefined;
        const receipt = { toolCallId: event.toolCallId, command: event.command,
          isError: event.isError === true, status: event.status,
          exitCode: Number.isInteger(event.exitCode) ? event.exitCode : undefined,
          output: output?.slice(0, 100000), outputTruncated: output ? output.length > 100000 : undefined };
        await append(fresh, event.type, receipt);
        break;
      }
      case "tool.updated":
      case "tool.started": {
        const input = event.input ?? {};
        const target = typeof input.file_path === "string" ? input.file_path
          : typeof input.command === "string" ? input.command.slice(0, 80) : "";
        await append(fresh, event.type, { name: event.name, input, toolCallId: event.toolCallId });
        log(`tool: ${event.name}${target ? ` ${target}` : ""}`);
        break;
      }
      case "file.changed":
        await append(fresh, "file.changed", { path: event.path });
        log(`file changed: ${event.path}`);
        break;
      case "progress":
        if (event.text) {
          if (partialSize < 1_000_000) { const text = event.text.slice(0, 1_000_000 - partialSize); partial.push(text); partialSize += text.length; }
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
  try {
    const after = await captureTree(executionCwd, path.join(store.workDir(), "evidence"));
    changeReceipt = await saveChanges(store, task, runNumber, worktreeBefore, after);
    return changeReceipt.files ?? [];
  } catch (error) {
    changeReceipt = { available: false, reason: `Change capture failed: ${error.message}` };
    await store.writeJson(path.join(dir, "runs", String(runNumber), "changes.json"), changeReceipt);
    return [];
  }
}

async function finish(outcome, changed = []) {
  return withState(() => store.withTaskLock(slug, async () => {
    const fresh = await store.readJson(metaPath);
    if (finished || !ownsExecution(fresh)) {
      log("outcome: skipped — this worker no longer owns the requested execution");
      return false;
    }
    if (stoppedOutcome) outcome = stoppedOutcome;
    let current = applyOutcome(fresh, outcome);
    if (outcome.externalSessionId) current.execution = {
      ...(current.execution ?? {}), externalSessionId: outcome.externalSessionId
    };
    current = finalizeRun(current, outcome);
    current = updateRun(current, runNumber, { changes: changeReceipt, checks: checkReceipts });
    if (fresh.status === "done") {
      current.status = "done";
      delete current.blockedOn;
    }
    // Results and state are one ownership-protected publication. A late
    // worker cannot replace the current result even if its run number changed
    // while the provider or git observation was awaiting I/O.
    if (outcome.status === "ready" || outcome.status === "needs_you" || typeof outcome.result === "string") {
      await store.writeText(resultPath, outcome.result ?? "");
      if (Array.isArray(current.runs)) {
        await store.writeText(path.join(dir, "runs", String(runNumber), "result.md"), outcome.result ?? "");
        await store.writeText(path.join(dir, "runs", String(runNumber), "attempts", executionId ?? "legacy", "result.md"), outcome.result ?? "");
      }
    }
    for (const p of changed) {
      await append(current, "file.changed", { path: p, source: "worktree" });
      log(`observed change: ${p}`);
    }
    if (stopping) {
      delete current.blockedOn;
      await fs.rm(permissionDecisionFile, { force: true });
      await append(current, "run.cancelled", { reason: stopping.reason, executionId });
    }
    await store.writeJson(metaPath, current);
    await store.writeJson(path.join(dir, 'runs', String(runNumber), 'attempts', executionId ?? 'legacy', 'execution.json'), current.runs?.find(r => r.run === runNumber) ?? {});
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
  worktreeBefore = task.runs?.find(r => r.run === runNumber)?.changes?.before ?? await captureTree(executionCwd, path.join(store.workDir(), "evidence"));
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
    await recordInput(null, 'native resume; message not recorded');
    outcome = await Promise.race([cancelled, stopping ? cancelled : provider.resume({
      cwd: executionCwd, externalSessionId: task.execution?.externalSessionId, grant, onEvent,
      permission: { decisionFile: permissionDecisionFile }, model: task.execution?.model,
      onInput: prompt => recordInput(prompt, 'native resume message')
    })]);
  } else {
    const prompt = (await store.exists(runPromptPath))
      ? await fs.readFile(runPromptPath, "utf8") : await fs.readFile(promptPath, "utf8");
    log(`launching ${provider.displayName} (${provider.id})`);
    await recordInput(prompt, 'fresh-session prompt');
    outcome = await Promise.race([cancelled, stopping ? cancelled : provider.start({
      cwd: executionCwd, prompt, onEvent, permission: { decisionFile: permissionDecisionFile }, model: task.execution?.model
    })]);
  }
  await stateChain;
  if (eventError) throw eventError;
  if (outcome.status === "ready" && !stopping) {
    const runDirectory = path.join(dir, "runs", String(runNumber), "attempts", executionId ?? "legacy");
    const plan = await store.readJson(path.join(dir, "runs", String(runNumber), "acceptance-plan.json")).catch(() => null);
    checkReceipts = await runAcceptance({plan,cwd:executionCwd,directory:runDirectory,
      writeJson:store.writeJson,writeText:store.writeText,signal:checkAbort.signal});
    drainOwnedGroup = checkReceipts.some(r => r.status.startsWith("timeout"));
  }
  await finish(outcome, await observedChanges());
} catch (error) {
  await stateChain;
  await finish({ status: "failed", error: error instanceof Error ? error.message : String(error) }, await observedChanges());
  process.exitCode = 1;
}

clearInterval(cancelTimer);
if (stopping || drainOwnedGroup) {
  // Give normal children time to exit; then stop this still-owned group,
  // including TERM-resistant descendants. Children which deliberately escape
  // the group require OS containment and are not claimed to be reaped.
  if (task.processGroupId === process.pid && process.platform !== "win32") {
    setTimeout(() => { try { process.kill(-process.pid, "SIGKILL"); } catch { process.exit(0); } }, 500);
  } else process.exit(0);
}
