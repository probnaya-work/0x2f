// Work persistence — JSON files under <workspace>/.work.
//
// The store is the only module that knows where tasks live on disk. Actions,
// the CLI, the server, and the worker talk to the store — never to paths
// directly. A future execution node may keep its own store on another
// machine; this store is the local (workspace) one.

import { randomUUID } from "node:crypto";
import { durableWrite, readBounded, safePath, syncDirectory } from "./durable.mjs";
import { crashPoint } from "./faults.mjs";
import { validateTaskWorkflow, parseWorkflowJson } from "./workflow-schema.mjs";
import fs from "node:fs/promises";
import path from "node:path";
import { withLock } from "./lock.mjs";
import { defaultProviderId } from "../providers/index.mjs";
import { WorkError } from "./errors.mjs";

export const cwd = () => process.cwd();

export async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return false;
  }
}

export async function readText(p, fallback = "") {
  try {
    return (await readBounded(p, 64_000_000)).toString("utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return fallback;
  }
}

// Atomic, durable file replacement: file fsync -> rename -> directory fsync.
async function writeAtomic(p, value) {
  await durableWrite(p, value, { point: path.basename(p) });
}

export async function writeText(p, value) {
  await writeAtomic(p, value);
}

export async function readJson(p) {
  try { return parseWorkflowJson((await readBounded(p)).toString("utf8")); }
  catch (error) { throw new WorkError(`Cannot read ${p}: ${error.message}`); }
}

export async function writeJson(p, value) {
  const bytes = JSON.stringify(value, null, 2) + "\n";
  if (Buffer.byteLength(bytes) > 4_000_000) throw new WorkError("JSON state exceeds 4MB; no write performed.");
  await writeAtomic(p, bytes);
}

function slugify(input) {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "task"
  );
}

// A store is bound to one workspace (base directory). All paths are derived
// from it, so nothing else has to reason about `.work` layout.
export function createStore(base = process.cwd()) {
  const workDir = () => path.join(base, ".work");
  const tasksDir = () => path.join(workDir(), "tasks");
  const taskDir = slug => {
    if (typeof slug !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(slug)) throw new WorkError("Invalid task slug.");
    return path.join(tasksDir(), slug);
  };
  const eventLogPath = slug => path.join(taskDir(slug), "events.jsonl");

  async function listTasks() {
    const dir = tasksDir();
    if (!(await exists(dir))) return [];

    const entries = await fs.readdir(dir, { withFileTypes: true });
    const out = [];
    const ids = new Set();

    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (entry.isSymbolicLink()) throw new WorkError(`Symlink task directory: ${entry.name}`);
      if (!entry.isDirectory()) continue;
      const meta = path.join(dir, entry.name, "task.json");
      if (!(await exists(meta))) continue;
      const task = await readJson(meta);
      if (!Number.isSafeInteger(task.id) || task.id < 1 || task.slug !== entry.name) throw new WorkError(`Invalid task identity in ${meta}.`);
      if (ids.has(task.id)) throw new WorkError(`Duplicate task id ${task.id}; restore the conflicting metadata before mutating state.`);
      ids.add(task.id);
      if (task.workflow) validateTaskWorkflow(task.workflow);
      out.push(task);
    }

    return out.sort((a, b) => b.id - a.id);
  }

  // createTask({ title, brief, prompt }, opts)
  //
  //   brief   the user's own words, verbatim — the task's intent
  //   title   the short label DERIVED from it (core/title.mjs)
  //   prompt  the assembled agent input (project context + the brief)
  //
  // Three artifacts, one authored by the user. `brief` is persisted on the
  // task record because every surface needs it (a detail view shows it, the
  // relay projects it); prompt.md stays the agent-facing assembly.
  async function createTask(input, opts = {}) {
    return withLock(path.join(workDir(), "task-create-lock"), () => createTaskReserved(input, opts));
  }

  async function createTaskReserved({ title, brief, prompt }, opts = {}) {
    const provider = opts.provider ?? defaultProviderId;
    const node = opts.node ?? "local";
    const workspace = opts.workspace ?? "local";
    const model = opts.model;
    // The task's initial run records (core/runs.mjs shape). Written by the
    // action, persisted here; a task created before run history simply has
    // none and is interpreted as one historical run.
    const runs = opts.runs;

    const all = await listTasks();
    const sequenceFile = path.join(workDir(), "task-sequence.json");
    const sequence = await exists(sequenceFile) ? await readJson(sequenceFile) : { schemaVersion: 1, lastId: 0 };
    if (sequence.schemaVersion !== 1 || !Number.isSafeInteger(sequence.lastId) || sequence.lastId < 0) throw new WorkError("Corrupt task sequence; run workflow doctor.");
    const id = Math.max(sequence.lastId, ...all.map(t => t.id), 0) + 1;
    if (!Number.isSafeInteger(id)) throw new WorkError("Task ID sequence is exhausted; no task was allocated.");
    await writeJson(sequenceFile, { schemaVersion: 1, lastId: id });
    crashPoint("create.id-reserved");
    const slug = `${String(id).padStart(3, "0")}-${slugify(title)}`;
    const finalDir = taskDir(slug);
    const dir = path.join(tasksDir(), `.creating-${id}-${randomUUID()}`);
    await fs.mkdir(dir, { recursive: true });
    // The task directory is owner-only too: its listing would reveal task
    // slugs to other local users even though the files are unreadable.
    await fs.chmod(dir, 0o700).catch(() => {});

    const now = new Date().toISOString();
    const task = {
      id,
      slug,
      title,
      // The user's own words. A task written before this field existed has
      // only `title` (which WAS the full text then), so every reader falls
      // back to `task.brief ?? task.title` — correct for old tasks by
      // construction, and no migration is needed.
      brief,
      ...(opts.workflow ? { workflow: opts.workflow } : {}),
      status: "working",
      execution: {
        provider,
        ...(opts.launchToken ? { launchToken: opts.launchToken } : {}),
        node,
        workspace,
        // Model is a separate concern from provider/harness. Only persisted
        // when reliably known (e.g. an explicit selection); providers that
        // don't surface their model leave it absent.
        ...(model ? { model } : {})
      },
      // Run history is persisted data, not reconstructed from UI history.
      // An existing task without this array is interpreted as one historical
      // run (core/runs.mjs) and never rewritten unnecessarily.
      ...(runs ? { runs } : {}),
      createdAt: now,
      updatedAt: now
    };

    await writeText(path.join(dir, "prompt.md"), prompt);
    await writeText(path.join(dir, "run.log"), "");
    if (runs?.length) await writeText(path.join(dir, "runs", "1", "prompt.md"), prompt);
    if (opts.workflow) await writeJson(path.join(dir, "runs", "1", "workflow-definition.json"), opts.workflow.definition);
    await writeJson(path.join(dir, "task.json"), task);
    crashPoint("create.inputs-durable");
    await fs.rename(dir, finalDir); await syncDirectory(tasksDir());
    crashPoint("create.visible");
    return task;
  }

  async function findTask(id) {
    const all = await listTasks();
    const task = all.find(t => t.id === Number(id));
    if (!task) throw new WorkError(`Task ${id} not found.`, 404);
    return task;
  }

  async function updateTask(task) {
    task.updatedAt = new Date().toISOString();
    await writeJson(path.join(taskDir(task.slug), "task.json"), task);
    return task;
  }

  async function readTaskResult(task) {
    return readText(path.join(taskDir(task.slug), "result.md"));
  }

  // One run's written result. Persisted runs keep their result in
  // runs/<n>/result.md under the task dir; the synthesized legacy run (and
  // any run without a per-run file) reads the task-level result.md, exactly
  // as before runs existed.
  async function readRunResult(task, runRecord) {
    if (!runRecord || runRecord.legacy) return readTaskResult(task);
    return readText(
      path.join(taskDir(task.slug), "runs", String(runRecord.run), "result.md")
    );
  }

  // One run's generated input, persisted at runs/<n>/prompt.md so the exact
  // prompt a provider session received is auditable per run. Written by the
  // actions when a run starts (createWork writes run 1, rerunWork builds the
  // continuation prompt from current Task state). The task-level prompt.md —
  // the ORIGINAL task request — is never overwritten.
  async function writeRunPrompt(task, run, prompt) {
    await writeText(
      path.join(taskDir(task.slug), "runs", String(run), "prompt.md"),
      prompt
    );
  }

  // Read one run's generated input; null when the run predates per-run
  // prompts (the worker then falls back to the original prompt.md).
  async function readRunPrompt(task, run) {
    const p = path.join(taskDir(task.slug), "runs", String(run), "prompt.md");
    return (await exists(p)) ? readText(p) : null;
  }

  async function readTaskLog(task) {
    return readText(path.join(taskDir(task.slug), "run.log"));
  }

  async function readEventLog(slug) {
    return readText(eventLogPath(slug));
  }

  // Every task's raw event log, in one pass — the input shape the live
  // tailer (core/events.mjs) consumes: [{ slug, text }]. The tailer diffs
  // against what it has already emitted, so this stays cheap on a workspace
  // with many tasks. It lives HERE rather than in a surface because more
  // than one surface tails the same logs (the Web server's SSE bridge and
  // the TUI's live refresh), and neither may know the `.work` layout.
  async function readEventLogs() {
    const dir = tasksDir();
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    const out = [];
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      if (!entry.isDirectory()) continue;
      const text = await readText(eventLogPath(entry.name), null);
      // A task with no event log yet simply has nothing to tail.
      if (typeof text === "string") out.push({ slug: entry.name, text });
    }
    return out;
  }

  // The task's normalized event log as parsed events (append-only JSON lines).
  // Persistence refuses malformed lines; the live tailer can remain tolerant.
  async function readEvents(slug) {
    const text = await readEventLog(slug);
    const events = [];
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        const event = parseWorkflowJson(line, "Event log");
        if (!event || typeof event.type !== "string") throw new Error("Missing event type");
        events.push(event);
      } catch (error) { throw new WorkError(`Corrupt events.jsonl for ${slug}; explicit repair is required: ${error.message}`); }
    }
    return events;
  }

  // Append one normalized Work event (see core/events.mjs) to the task's
  // event log. Called by shared actions (in-process) and by the worker
  // (separate process). The API layer tails this log for live updates.
  async function appendEvent(slug, event) {
    const p = eventLogPath(slug);
    await safePath(p);
    const task = await readJson(path.join(taskDir(slug), "task.json"));
    // One advisory lock serializes each complete append across processes.
    const append = async () => {
      await readEvents(slug); // refuse a torn tail before another append
      const text = await readEventLog(slug);
      if (text && !text.endsWith("\n")) throw new WorkError(`Unterminated events.jsonl tail for ${slug}; explicit newline repair is required.`);
      const fd = await fs.open(p, "a", 0o600);
      try { await fd.writeFile(JSON.stringify(event) + "\n"); await fd.sync(); }
      finally { await fd.close(); }
      await syncDirectory(path.dirname(p)); crashPoint("event.durable");
    };
    if (task.workflow) await withLock(path.join(taskDir(slug), "event-lock"), append);
    else await append(); // legacy providers retain single O_APPEND writes without a helper per event
  }

  // The interactive-permission channel: the human's ALLOW/REJECT for a live
  // permission request. The running worker's provider polls this file and
  // answers the outstanding request in place (the task dir's permission.json).
  // Cross-process cancel token. The action writes it; a second cancel of the
  // same run sees it and does not signal the worker again. It is not task
  // state — the worker's terminal write remains the run's outcome.
  async function cancelRequestPath(task) {
    return path.join(taskDir(task.slug), "cancel.json");
  }

  async function readCancelRequest(task) {
    const p = await cancelRequestPath(task);
    if (!(await exists(p))) return null;
    return readJson(p);
  }

  async function writeCancelRequest(task, request) {
    await writeJson(await cancelRequestPath(task), request);
  }

  async function writePermissionDecision(task, decision) {
    await writeJson(
      path.join(taskDir(task.slug), "permission.json"),
      decision
    );
  }

  // A decision answer: the human's response to a needs_you/decision block.
  // Persisted per-task so it is part of the task's history and available to
  // any future continuation; the run itself cannot continue in place when
  // the provider does not support resuming sessions.
  async function writeDecisionAnswer(task, answer) {
    await writeJson(path.join(taskDir(task.slug), "answer.json"), answer);
  }

  return {
    base,
    workDir,
    tasksDir,
    taskDir,
    eventLogPath,
    exists,
    readText,
    writeText,
    readJson,
    writeJson,
    listTasks,
    createTask,
    findTask,
    updateTask,
    readTaskResult,
    readRunResult,
    writeRunPrompt,
    readRunPrompt,
    readTaskLog,
    readEventLog,
    readEventLogs,
    readEvents,
    appendEvent,
    readCancelRequest,
    writeCancelRequest,
    writePermissionDecision,
    writeDecisionAnswer
  };
}
