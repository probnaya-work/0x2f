import { attemptProjection } from './workflow-supervision.mjs';
import { engineeringConfig, createEngineeringTask, withEngineeringLock, assertEngineeringAccepted } from './engineering.mjs';
// Shared Work actions — the SINGLE implementation of Work's business rules.
//
// Both the CLI and the HTTP API call these actions; neither implements its
// own create/allow/reject/close logic. Clients render state and invoke
// actions. Work Core owns what `ready` means, what `needs_you` means, whether
// a permission request is resolved, and how a run is resumed. The Web UI must
// not decide any of that — and neither may the CLI or a future TUI.
//
//   ctx = {
//     store,        // persistence (core/store.mjs)
//     node,         // execution node (nodes/local.mjs today)
//     events,       // live event bus (core/events.mjs)
//     providers,    // provider registry (providers/index.mjs) — native +
//                   // configured (ACP/command manifest) providers
//     router,       // AUTO routing (core/router.mjs) — resolves "auto" and
//                   // the configured default provider request
//     workspaceId,  // logical workspace id ("local" today)
//     buildPrompt   // (brief) -> prompt string
//   }

import { fields, validateSnapshot, schema } from "./workflow-schema.mjs";
import { randomUUID, createHash } from "node:crypto";
import { processIdentity } from "./process-identity.mjs";
import { commitWorkflow, operationPath, assertNoPendingOperation } from "./workflow-transaction.mjs";
import { verifyArtifacts } from "./workflow-artifacts.mjs";
import { backupFile } from "./durable.mjs";
import { assertRuntimeCompatible, loadedRuntimeFingerprint } from "./workflow-scheduler.mjs";
import { workflowKind } from "../workflows/registry.mjs";
import path from "node:path";
import { workflowLock, assertWorkflowSlot, WORKFLOW_PROVIDER } from "./workflows.mjs";
import { closeTask, applyOutcome, cancelledOutcome } from "./lifecycle.mjs";
import { WorkError } from "./errors.mjs";
import { workEvent } from "./events.mjs";
import { makeRunRecord, taskRuns, legacyRun, currentRunNumber, updateRun } from "./runs.mjs";
import { MAX_BRIEF, MAX_TITLE, MAX_NOTE, MAX_ANSWER, MAX_SELECTOR } from "./limits.mjs";
import { deriveTitle } from "./title.mjs";
import { taskDiff } from "./diff.mjs";
import { unavailableMessage } from "../providers/index.mjs";
import { pidAlive } from "../recover.mjs";

export function createActions(ctx) {
  const { store, node, providers, router } = ctx;

  // A shared input cap: refuse a value that exceeds its limit with the same
  // message the CLI and the API surface give.
  function requireWithin(value, max, label) {
    if (typeof value === "string" && value.length > max) {
      throw new WorkError(
        `${label} is too long (${value.length} characters; the limit is ${max}).`
      );
    }
  }

  // The client-facing provider list: ids in registry order (native first).
  function providerList() {
    return providers.listProviders().map(p => p.id).join(", ");
  }

  function requireProvider(id) {
    if (!providers.getProvider(id)) {
      throw new WorkError(
        `Unknown execution provider "${id}". Available: ${providerList()}.`
      );
    }
  }

  // A provider that exists but cannot run on the execution node right now.
  // Refuse BEFORE any work or run is persisted: a run against an unavailable
  // provider is guaranteed to fail, so the refusal belongs at the action
  // boundary — never as a doomed background run, and never by silently
  // switching to another provider.
  function requireAvailableProvider(id) {
    if (providers.available(id)) return;
    throw new WorkError(unavailableMessage(id, providers));
  }

  // Resolve what the user asked for into an execution target.
  //
  //   requested undefined -> the configured routing default (AUTO when
  //                          .work/routing.json says so, else the runtime
  //                          default provider)
  //   requested "auto"    -> the deterministic routing decision
  //   requested <id>      -> that provider (manual override)
  //
  // Returns { provider, node, requested, routing? } where `routing` is
  // present only for AUTO decisions — the persisted answer to "why did 0x2F
  // run this here?".
  function resolveTarget(requested) {
    const effective = requested ?? router.defaultRequestedProvider();
    if (effective === "auto") {
      const routed = router.route();
      if (!routed.provider) {
        throw new WorkError(
          `AUTO routing: ${routed.reason}. No execution target could be selected.`
        );
      }
      return {
        provider: routed.provider,
        node: routed.node,
        requested: "auto",
        routing: {
          mode: "auto",
          reason: routed.reason,
          considered: routed.considered
        }
      };
    }
    requireProvider(effective);
    // Availability is enforced at the action boundary for any EXPLICIT manual
    // selection ("--provider <id>" / the API's provider field). AUTO already
    // excludes unavailable providers, and an unspecified request (the
    // configured/runtime default) is not a manual selection — it keeps its
    // historical behavior. The check is a runtime/execution fact: `available`
    // resolves the executable in the same environment the worker will spawn
    // it in. (The CLI's `2f new` preflights the unspecified default itself,
    // so the first-use CLI journey still refuses clearly before persisting a
    // doomed run.)
    if (requested !== undefined && requested !== "auto") {
      requireAvailableProvider(effective);
    }
    return { provider: effective, node: node.id, requested: effective };
  }

  // Record a normalized event to the task's event log. The API layer tails
  // this log and broadcasts to live clients, so every client observes the
  // same state regardless of which process performed the action.
  async function record(task, type, data = {}) {
    await store.appendEvent(task.slug, workEvent(type, task.id, data));
  }

  async function launch(task) {
    const pid = await node.startExecution({ task });
    if (!pid) return task;
    const fresh = await store.findTask(task.id);
    if (currentRunNumber(fresh) !== currentRunNumber(task)) throw new WorkError("Run changed during launch.");
    const workerIdentity = task.workflow ? await processIdentity(pid) : undefined;
    if (task.workflow && (!workerIdentity || workerIdentity.unknown)) throw new WorkError("Worker identity could not be verified. Gate stays closed; use workflow doctor/recover.");
    const updated = { ...fresh, pid, ...(workerIdentity ? { workerIdentity } : {}) };
    await store.updateTask(updated);
    if (task.workflow) await store.writeJson(path.join(store.taskDir(task.slug), "runs", String(currentRunNumber(task)), "launch.json"), { schemaVersion: 1, token: task.execution.launchToken, pid });
    return updated;
  }
  const mutation = fn => async (id, ...args) => {
    const task = await store.findTask(id);
    if (task.engineering) return withEngineeringLock(store, task.slug, () => fn(id, ...args));
    return task.workflow ? workflowLock(store, async () => {
      await assertNoPendingOperation(store, await store.findTask(id));
      return fn(id, ...args);
    }) : fn(id, ...args);
  };

  // listWork(): Promise<Task[]> — all tasks, newest first.
  async function listWork() {
    const tasks=await store.listTasks();
    return Promise.all(tasks.map(async task=>task.workflow?{...task,externalAttempts:await attemptProjection(store,task)}:task));
  }

  // getWork(id): Promise<{ ...task, runs, result }> — task plus its projected
  // run history (legacy tasks read as one historical run) and final result.
  async function getWork(id) {
    const task = await store.findTask(id);
    const [result, events] = await Promise.all([
      store.readTaskResult(task),
      store.readEvents(task.slug)
    ]);
    return { ...task, ...(task.workflow?{externalAttempts:await attemptProjection(store,task)}:{}), runs: taskRuns(task, { events }), result };
  }

  // getRun(id, run): Promise<{ ...runRecord, result }> — one run's factual
  // detail: provider/node/model/timing/outcome plus its own written result.
  // The result text lives per-run on disk; this reads the record's file.
  async function getRun(id, runNumber) {
    const task = await store.findTask(id);
    const events = await store.readEvents(task.slug);
    const runs = taskRuns(task, { events });
    const record = runs.find(r => r.run === Number(runNumber));
    if (!record) {
      throw new WorkError(`Task #${id} has no run ${runNumber}.`, 404);
    }
    const result = await store.readRunResult(task, record);
    let workflow = record.workflow;
    if (task.workflow && !workflow) {
      const file = path.join(store.taskDir(task.slug), "runs", String(runNumber), "workflow-definition.json");
      if (await store.exists(file)) { const definition = schema(await store.readJson(file), "run definition"); workflow = { schemaVersion: 1, id: definition.id, version: definition.version, definitionDigest: definition.digest, trigger: task.workflow.trigger, triggerKey: task.workflow.triggerKey }; }
    }
    return { ...record, ...(workflow ? { workflow } : {}), result };
  }

  // createWork({ brief, provider?, model? }): create the task and start
  // execution on the node. `provider` is the user's request: an explicit id,
  // "auto" (the deterministic router), or undefined (the configured default —
  // AUTO when .work/routing.json says so). The task is the persistent system;
  // the node + provider + session are execution infrastructure underneath it.
  //
  // ONE piece of user text: the brief. It is the task's intent, kept
  // verbatim, and it is what the agent receives. The short `title` a ledger
  // row shows is DERIVED from it (core/title.mjs) — deterministically, with
  // no model call, so creating a task never depends on a provider being
  // authenticated. There is deliberately no Title + Description form: the
  // user writes the task, 0x2F names it.
  async function createWork({ brief, provider, model, workflow, foreground } = {}) {
    if (provider === WORKFLOW_PROVIDER && !workflow) throw new WorkError("Start a configured workflow with 2f workflow run.");
    if (!brief || !brief.trim()) {
      throw new WorkError("Task brief is required.");
    }
    requireWithin(brief, MAX_BRIEF, "Task brief");
    requireWithin(provider, MAX_SELECTOR, "Provider id");
    requireWithin(model, MAX_SELECTOR, "Model id");
    const clean = brief.trim();
    const { title } = deriveTitle(clean);
    // Derivation targets ~80 characters, so this can only fire on a bug in
    // core/title.mjs — but a guard that is only asserted in a comment is not
    // a guard, and an unbounded title would reach every surface and the
    // task's directory name.
    requireWithin(title, MAX_TITLE, "Task title");
    if (!workflow) {
      const config = await engineeringConfig(store);
      if (config) {
        if ((provider && provider !== 'auto') || model) throw new WorkError('Engineering execution is selected by workspace policy; per-task provider/model overrides are unavailable.');
        return createEngineeringTask(ctx, { title, brief: clean, prompt: await ctx.buildPrompt(clean), foreground }, config);
      }
    }
    if (foreground) throw new WorkError('Foreground engineering requires enabled .work/engineering.json.');
    const target = resolveTarget(provider);

    // The agent receives the FULL brief, never the derived label.
    const prompt = await ctx.buildPrompt(clean);
    const startedAt = new Date().toISOString();

    const task = await store.createTask({ title, brief: clean, prompt }, {
      provider: target.provider,
      ...(workflow ? { workflow } : {}),
      node: target.node,
      workspace: ctx.workspaceId,
      ...(workflow ? { launchToken: randomUUID() } : {}),
      ...(model ? { model } : {}),
      runs: [
        makeRunRecord({
          run: 1,
          provider: target.provider,
          node: target.node,
          workspace: ctx.workspaceId,
          model,
          startedAt,
          requestedProvider: target.requested,
          routing: target.routing,
          ...(workflow ? { workflow } : {})
        })
      ]
    });

    await record(task, "task.created", { status: task.status });
    return launch(task);
  }

  // rerunWork(id, { provider?, model? }): run the SAME task again as a NEW
  // run under it. The original task intent is unchanged; the previous run's
  // result and execution metadata are preserved in history (never
  // overwritten). `provider` defaults to the task's current provider —
  // rerunning without one is a retry.
  //
  // Runs of one task are STRICTLY SEQUENTIAL: two runs of the same task would
  // race against the same working directory (no isolated worktrees/sandboxes
  // yet), so a rerun refuses while the task is working. A blocked (needs_you)
  // task may be rerun — the blocked run stays in history, and the new run
  // starts fresh.
  async function rerunWork(id, options = {}) {
    const task = await store.findTask(id);
    if (task.engineering) {
      if (options.provider && options.provider !== 'auto' || options.model) throw new WorkError('Engineering continuation selects its executor automatically.');
      if (task.engineering.playbook && task.status !== 'working') return (await import('./engineering-playbook.mjs')).resumeEngineeringPlaybook(ctx, task, options);
      throw new WorkError('Engineering task continuation is bounded by its saved policy. A blocked task requires a new approved scope; ordinary rerun cannot bypass its ceilings.');
    }
    if (options.foreground) throw new WorkError('Foreground execution requires an engineering task; ordinary/workflow rerun cannot silently launch in the background.');
    if (!task.workflow) return rerunUnchecked(id, options);
    return workflowLock(store, async () => {
      const fresh = await store.findTask(id);
      await assertNoPendingOperation(store, fresh);
      await assertRuntimeCompatible();
      if (!fresh.workflow.definition.adapterPins || fresh.workflow.runtimeFingerprint !== loadedRuntimeFingerprint) throw new WorkError("Explicitly refresh workflow settings before rerunning on this runtime; prior history is preserved.");
      validateSnapshot(fresh.workflow.definition);
      if (options.provider && options.provider !== WORKFLOW_PROVIDER) throw new WorkError("Workflow execution uses its configured adapters; provider override is unavailable.");
      if (["accepted", "published", "rejected", "deferred"].includes(fresh.workflow.review)) throw new WorkError("Record a new select or changes decision before continuing this workflow.");
      await assertWorkflowSlot(store, fresh.id);
      return rerunUnchecked(id, options);
    });
  }

  async function rerunUnchecked(id, { provider, model } = {}) {
    requireWithin(provider, MAX_SELECTOR, "Provider id");
    requireWithin(model, MAX_SELECTOR, "Model id");
    const task = await store.findTask(id);
    if (task.status === "working") {
      throw new WorkError(
        `Task #${id} is working — its current run is still executing. Runs of one task are sequential; wait for it to finish before starting another.`
      );
    }
    // Without an explicit request, a rerun is a retry of the task's current
    // provider; `--provider auto` re-routes deterministically.
    const target = resolveTarget(provider ?? task.execution?.provider);

    // Materialize run history for legacy tasks BEFORE replacing execution:
    // the legacy run's provider would otherwise be lost when execution is
    // reset to the new run. Additive — historical fields are never rewritten.
    let current = task;
    if (!Array.isArray(current.runs) || current.runs.length === 0) {
      const events = await store.readEvents(current.slug);
      current = { ...current, runs: [legacyRun(current, events)] };
    }

    const runNumber = (current.runs.at(-1)?.run ?? 0) + 1;
    const startedAt = new Date().toISOString();

    current = {
      ...current,
      status: "working",
      runs: [
        ...current.runs,
        makeRunRecord({
          run: runNumber,
          provider: target.provider,
          node: target.node,
          workspace: ctx.workspaceId,
          model,
          startedAt,
          requestedProvider: target.requested,
          routing: target.routing,
          ...(task.workflow ? { workflow: task.workflow } : {})
        })
      ],
      // The CURRENT run's execution state — fresh for the new run. The
      // previous run keeps its own provider/node/session in its run record.
      execution: {
        provider: target.provider,
        node: target.node,
        workspace: ctx.workspaceId,
        ...(task.workflow ? { launchToken: randomUUID() } : {}),
        ...(model ? { model } : {})
      }
    };
    delete current.blockedOn;
    delete current.error;
    if (task.workflow) { current.workflow = { ...current.workflow, packageComplete: false }; delete current.pid; delete current.workerIdentity; }

    // Build THIS run's input from current Task state — the original task
    // request plus everything accumulated since: user input (answers,
    // constraints) and prior run outcomes/verification. Persisted per run
    // (runs/<n>/prompt.md) so the exact prompt the fresh provider session
    // receives is auditable; the original prompt.md is never overwritten.
    const originalPrompt = await store.readText(
      path.join(store.taskDir(task.slug), "prompt.md"),
      ""
    );
    const runPrompt = await ctx.buildRunPrompt({
      task: current,
      base: store.base,
      originalPrompt,
      store
    });
    if (current.workflow) current = await commitWorkflow(store, task, current, { kind: "rerun", payload: { run: runNumber }, files: [
      { path: path.join(store.taskDir(current.slug), "runs", String(runNumber), "prompt.md"), bytes: runPrompt },
      { path: path.join(store.taskDir(current.slug), "runs", String(runNumber), "workflow-definition.json"), bytes: JSON.stringify(current.workflow.definition, null, 2) + "\n" }
    ] });
    else { await store.writeRunPrompt(current, runNumber, runPrompt); await store.updateTask(current); }
    current = await launch(current);

    await record(current, "task.updated", {
      status: "working",
      run: runNumber
    });
    return current;
  }

  // resumeWork(id, grant): allow | reject — validate the task can be resumed,
  // then hand execution back to the node (which resumes the SAME provider
  // session). The needs_you -> working transition is applied by the worker
  // on the node, exactly as in v0.2.
  //
  // ALLOW / REJECT answer a PERMISSION: a concrete operation that needs
  // authorization. They are NOT the interaction for a DECISION — a decision
  // is answered (answerWork), never allowed or rejected. This guard keeps
  // the two concepts separate at the action boundary.
  //
  // Two kinds of permission needs_you are handled:
  //
  //   blockedOn.live — an INTERACTIVE permission request: the run's process
  //   is still alive, holding the outstanding request. The grant is delivered
  //   through the per-task decision file; the running worker's provider
  //   answers the ORIGINAL request and the same execution continues. No new
  //   worker, no session restart.
  //
  //   otherwise — the run ended (provider session persisted); a fresh worker
  //   resumes the same provider session (--resume / session/load).
  async function resumeWork(id, grant, options = {}) {
    const task = await store.findTask(id);
    if (task.engineering?.delivery) {
      if (!['allow','reject'].includes(grant)) throw new WorkError('Local commit permission requires explicit allow or reject.');
      const d = await import('./engineering-delivery.mjs');
      if (grant === 'reject') return d.revokeLocalCommit(ctx, id, options);
      await d.grantLocalCommit(ctx, id, options);
      return d.executeLocalCommit(ctx, id, options);
    }
    if (task.engineering) throw new WorkError('Engineering policy cannot be bypassed by a session permission resume.');
    if (task.status !== "needs_you") {
      throw new WorkError(
        `Task #${id} is ${task.status}, not needs_you — nothing to ${grant}.`
      );
    }
    if (task.blockedOn?.type === "decision") {
      throw new WorkError(
        `Task #${id} is blocked on a decision, not a permission — answer the decision (2f answer) instead of allowing or rejecting it.`
      );
    }
    if (task.blockedOn?.live === true) {
      await store.writePermissionDecision(task, {
        grant,
        at: new Date().toISOString()
      });
      return { ...task, status: "working", live: true };
    }
    const provider = providers.getProvider(task.execution?.provider);
    if (provider && provider.capabilities?.supportsResume === false) {
      // Real capability difference (e.g. DeepSeek Harness headless cannot
      // resume a session): refuse instead of faking a continuation.
      throw new WorkError(
        `Provider "${provider.id}" does not support resuming sessions — this task cannot be continued in place.`
      );
    }
    if (!task.execution?.externalSessionId) {
      throw new WorkError(
        `Task #${id} has no resumable execution session. Its provider run ended without a recoverable session, so it cannot be continued in place.`
      );
    }
    const pid = await node.resumeExecution({ task, grant });
    // Persist the resumed worker's pid so the crash/reboot recovery sweep
    // (src/recover.mjs) can tell a live resumed run from an orphaned one.
    // The worker itself flips the task to working when it starts; until then
    // the task correctly stays needs_you with the new worker's pid attached.
    if (pid) await store.updateTask({ ...task, pid });
    return { ...task, status: "working" };
  }

  // answerWork(id, { answer }): the human's response to a needs_you/decision
  // block. A decision is not a permission — it is not allowed or rejected; it
  // is answered. The answer is persisted TWICE: in the task dir's answer.json
  // (the human-readable record, as before) and appended to the task's context
  // notes (task.json), so it becomes part of the input of the task's NEXT run
  // (a rerun rebuilds the prompt from Task state).
  //
  // Answering does NOT continue the run in place: whether a provider can
  // consume the answer (resume a session with it) is a provider capability,
  // and no provider supports free-text decision continuation. The task stays
  // needs_you after answering — the human decides next (rerun the task to
  // continue with the answer in context, or close the work).
  async function answerWork(id, options = {}) {
    const task = await store.findTask(id);
    if (!task.workflow) return answerUnchecked(id, options);
    fields(options, ["answer", "action", "value", "operationId"], "decision input");
    return workflowLock(store, () => answerUnchecked(id, options));
  }

  async function answerUnchecked(id, { answer, action, value, operationId } = {}) {
    const task = await store.findTask(id);
    if (action !== undefined) {
      if (!task.workflow || typeof action !== "string" || (value !== undefined && typeof value !== "string" && typeof value !== "number")) throw new WorkError("Invalid structured decision.");
      if (answer !== undefined) throw new WorkError("Use a structured action or answer, not both.");
      answer = `${action}${value === undefined ? "" : ` ${value}`}`;
    }
    if (task.status !== "needs_you" && !(task.workflow?.packageDigest && task.status !== "working")) {
      throw new WorkError(
        `Task #${id} is ${task.status}, not needs_you — nothing to answer.`
      );
    }
    if (task.blockedOn?.type !== "decision" && !task.workflow?.packageDigest) {
      throw new WorkError(
        `Task #${id} is not blocked on a decision — there is nothing to answer.`
      );
    }
    if (typeof answer !== "string" || !answer.trim()) {
      throw new WorkError("An answer is required.");
    }
    requireWithin(answer, MAX_ANSWER, "Answer");
    const clean = answer.trim();
    const now = new Date().toISOString();
    if (task.workflow) {
      const lastDecision = task.workflow.decisions?.at(-1);
      const repeated = lastDecision?.answer === clean && lastDecision.run === currentRunNumber(task) && lastDecision.packageDigest === task.workflow.packageDigest;
      const opId = operationId ?? (repeated ? lastDecision.operationId : createHash("sha256").update(`${currentRunNumber(task)}:${task.workflow.packageDigest}:${task.workflow.decisions?.length ?? 0}:${clean}`).digest("hex"));
      if (await store.exists(operationPath(store, task, opId))) return commitWorkflow(store, task, task, { operationId: opId, kind: "decision", payload: { answer: clean } });
      await assertNoPendingOperation(store, task);
      const kind = workflowKind(task.workflow.definition.kind);
      if (kind.verifyDecisionArtifacts?.(clean)) await verifyArtifacts(store, task);
      let updated = kind.decide(task, clean);
      if (updated === task) return task;
      const decisions = updated.workflow.decisions.map((decision, index, all) => index === all.length - 1 ? { ...decision, operationId: opId, answer: clean, run: currentRunNumber(task), packageDigest: task.workflow.packageDigest } : decision);
      updated = { ...updated, workflow: { ...updated.workflow, decisions } };
      updated = { ...updated, workflow: { ...updated.workflow, schemaVersion: 1 }, context: { ...(task.context ?? {}), notes: [...(task.context?.notes ?? []), { at: now, text: clean }] } };
      if (!task.workflow.schemaVersion) await backupFile(path.join(store.taskDir(task.slug), "task.json"));
      return commitWorkflow(store, task, updated, { operationId: opId, kind: "decision", payload: { answer: clean },
        files: [{ path: path.join(store.taskDir(task.slug), "answer.json"), bytes: JSON.stringify({ schemaVersion: 1, operationId: opId, answer: clean, at: now }, null, 2) + "\n" }],
        events: [{ type: "task.answered", data: { answer: clean, operationId: opId } }, { type: "task.updated", data: { status: updated.status } }] });
    }
    const notes = [...(task.context?.notes ?? []), { at: now, text: clean }];
    let updated = { ...task, context: { ...(task.context ?? {}), notes } };
    await store.updateTask(updated);
    await store.writeDecisionAnswer(task, {
      answer: clean,
      at: now
    });
    await record(task, "task.answered", { answer: clean });
    return updated;
  }

  // noteWork(id, { note }): record a user constraint/correction on the task —
  // Task context, not an execution. The task's NEXT run (2f rerun / send-back)
  // is rebuilt from Task state and therefore includes the note; this action
  // never starts or resumes an execution, keeping "user input updates Task
  // context" separate from "rerun starts another execution". Unlike
  // answerWork it is not gated on a needs_you/decision block — a constraint
  // can be added to a READY or FAILED task before rerunning it.
  async function noteWork(id, { note } = {}) {
    const task = await store.findTask(id);
    if (!note || !note.trim()) {
      throw new WorkError("A note is required.");
    }
    requireWithin(note, MAX_NOTE, "Note");
    const clean = note.trim();
    const now = new Date().toISOString();
    const notes = [...(task.context?.notes ?? []), { at: now, text: clean }];
    const updated = { ...task, context: { ...(task.context ?? {}), notes } };
    await store.updateTask(updated);
    await record(task, "task.note", { note: clean });
    return updated;
  }

  // correctWork(id, { correction }): record a SEND-BACK correction on the
  // task — what the last run got wrong, which is why the next run is
  // rebuilt. The same task-context channel as a note (the next run's prompt
  // carries it), but its own normalized event: a correction is not a plain
  // constraint, and every surface must be able to tell the three kinds of
  // human input apart — a note, an answer, a correction.
  async function correctWork(id, { correction } = {}) {
    const task = await store.findTask(id);
    if (!correction || !correction.trim()) {
      throw new WorkError("A correction is required.");
    }
    requireWithin(correction, MAX_NOTE, "Correction");
    const clean = correction.trim();
    const now = new Date().toISOString();
    const notes = [...(task.context?.notes ?? []), { at: now, text: clean }];
    const updated = { ...task, context: { ...(task.context ?? {}), notes } };
    await store.updateTask(updated);
    await record(task, "task.corrected", { correction: clean });
    return updated;
  }

  // getTaskDiff(id): the REAL change set of the current run — one entry per
  // file the run reported touching, with unified-diff hunks computed from the
  // working tree vs HEAD (see core/diff.mjs). This is the shared-layer
  // source the `d` (CHANGES) surface draws: a real diff, never a provider
  // summary and never an invented one. A file with no baseline (untracked,
  // outside the workspace, or no git repository) is reported without hunks.
  async function getTaskDiff(id) {
    const task = await store.findTask(id);
    if (task.engineering) return (await import('./engineering-diff.mjs')).engineeringDiff(store, task);
    const events = await store.readEvents(task.slug);
    const files = [];
    for (const event of events) {
      if (event.type === "file.changed" && typeof event.path === "string" && event.path) {
        files.push(event.path);
      }
    }
    return taskDiff({ base: store.base, files });
  }

  // Write a cancelled terminal state only while the run is still working.
  // A completion that landed first is left untouched.
  async function finalizeCancelled(task, detail) {
    const fresh = await store.findTask(task.id);
    if (fresh.status !== "working") return fresh;
    const outcome = cancelledOutcome(detail);
    const runNumber = currentRunNumber(fresh);
    let next = applyOutcome(fresh, outcome);
    if (Array.isArray(next.runs)) {
      const record = next.runs.find(r => r.run === runNumber);
      const startedMs = record ? Date.parse(record.startedAt) : NaN;
      const completedAt = new Date().toISOString();
      next = updateRun(next, runNumber, {
        outcome: "failed",
        completedAt,
        ...(Number.isFinite(startedMs)
          ? { durationMs: Date.parse(completedAt) - startedMs }
          : {}),
        error: outcome.error,
        failure: outcome.failure,
        blockedOn: undefined
      });
    }
    await store.updateTask(next);
    await record(next, "run.failed", { error: outcome.error, run: runNumber });
    await record(next, "task.updated", { status: next.status, run: runNumber });
    return next;
  }

  // cancelWork(id): stop the active run through the execution node. The
  // worker receives SIGTERM, asks its provider to cancel, and records the
  // terminal state. A finished run is refused and not rewritten. A second
  // cancel of the same live run does not signal again.
  async function cancelWork(id) {
    const task = await store.findTask(id);
    if (task.status !== "working") {
      throw new WorkError(
        `Task #${id} is ${task.status}, not working — nothing to cancel.`
      );
    }
    const runNumber = currentRunNumber(task);
    const request = await store.readCancelRequest(task);
    if (request?.run === runNumber) {
      if (pidAlive(task.pid)) return task;
      return finalizeCancelled(task, "The worker was no longer running.");
    }
    await store.writeCancelRequest(task, {
      at: new Date().toISOString(),
      run: runNumber
    });
    if (!pidAlive(task.pid)) {
      return finalizeCancelled(task, "The worker was no longer running.");
    }
    try {
      await node.cancelExecution({ task });
    } catch (error) {
      const fresh = await store.findTask(id);
      if (fresh.status !== "working") return fresh;
      if (!pidAlive(fresh.pid)) {
        return finalizeCancelled(fresh, "The worker was no longer running.");
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new WorkError(`Could not cancel task #${id}: ${message}`);
    }
    // A stop can arrive before the worker installs its SIGTERM handler.
    // Observe that startup death and finalize the durable cancel request here.
    // A worker that settles normally remains the owner of the outcome.
    for (let attempt = 0; attempt < 20; attempt++) {
      const fresh = await store.findTask(id);
      if (fresh.status !== "working") return fresh;
      if (!pidAlive(fresh.pid)) return finalizeCancelled(fresh, "The worker stopped before recording its outcome.");
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    return store.findTask(id);
  }

  // closeWork(id): user closes the task (any status -> done).
  async function closeWork(id) {
    const task = await store.findTask(id);
    if (['proposed','granted','running'].includes(task.engineering?.delivery?.state)) throw new WorkError('Reject the pending commit permission before closing this task.');
    if (task.engineering && task.status === 'working') throw new WorkError('Cancel the active engineering task before closing it.');
    if (task.engineering && task.status === 'ready') await assertEngineeringAccepted(store, task);
    if (task.workflow && task.status === "working") throw new WorkError("Cancel the active workflow before closing it.");
    const closed = closeTask(task);
    await store.updateTask(closed);
    await record(task, "task.closed", { status: closed.status });
    return closed;
  }

  return {
    reconcileCommit: async (id) => (await import('./engineering-delivery-reconcile.mjs')).reconcileLocalCommit(ctx, id),
    proposeCommit: async (id, options) => (await import('./engineering-delivery.mjs')).proposeLocalCommit(ctx, id, options),
    grantCommit: async (id, options) => (await import('./engineering-delivery.mjs')).grantLocalCommit(ctx, id, options),
    executeCommit: async (id, options) => (await import('./engineering-delivery.mjs')).executeLocalCommit(ctx, id, options),
    revokeCommit: async (id, options) => (await import('./engineering-delivery.mjs')).revokeLocalCommit(ctx, id, options),
    listWork,
    getWork,
    getRun,
    getTaskDiff,
    createWork,
    rerunWork,
    resumeWork,
    answerWork: async (id, options) => {
      const task = await store.findTask(id);
      return task.engineering ? withEngineeringLock(store, task.slug, () => answerWork(id, options)) : answerWork(id, options);
    },
    noteWork: mutation(noteWork),
    correctWork: mutation(correctWork),
    cancelWork: mutation(cancelWork),
    closeWork: mutation(closeWork),
    allowWork: (id, options) => resumeWork(id, "allow", options),
    rejectWork: (id, options) => resumeWork(id, "reject", options)
  };
}
