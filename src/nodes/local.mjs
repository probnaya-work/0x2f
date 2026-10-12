// Execution nodes — where a run actually happens.
//
// A node is a machine boundary: "spawn the execution somewhere". The local
// node spawns the detached worker on this machine; a future trusted-node
// implementation would transport the same normalized request to another
// machine (a mini-PC) and return a remote handle. Work Core only ever talks
// to the node contract — never to process spawns, and never assuming the
// execution machine is the machine the UI runs on.
//
//   ExecutionNode contract:
//     id: string                        e.g. "local"
//     displayName: string
//     resolveWorkspace(workspaceId)     -> local path (throws if unknown)
//     startExecution({ task })          -> pid (or null)
//     resumeExecution({ task, grant })  -> pid (or null)
//     cancelExecution({ task })         -> best-effort stop
//
// The `workspace` stored on a task is a LOGICAL project id ("local" today);
// each node resolves it to its own filesystem. A future mini-PC node maps
// workspace ids to checkouts on that machine — Work never assumes the UI
// filesystem path equals the execution filesystem path.
//
// This file is deliberately small: it owns process launch for THIS machine
// only. Provider behavior (which CLI, which flags) lives in the provider;
// state meaning lives in core; both are invisible here.

import { spawn as defaultSpawn } from "node:child_process";
import fsSync from "node:fs";
import path from "node:path";
import { currentRunNumber } from "../core/runs.mjs";

export function createLocalNode({
  workspace,
  spawn = defaultSpawn,
  kill = process.kill,
  env = process.env
} = {}) {
  if (!workspace) throw new Error("createLocalNode requires a workspace path.");

  function resolveWorkspace(workspaceId) {
    // Missing/legacy tasks (v0.2 tasks have no workspace field) are local.
    if (!workspaceId || workspaceId === "local") return workspace;
    throw new Error(`Local execution node cannot resolve workspace "${workspaceId}".`);
  }

  function spawnWorker({ base, slug, run = 1, mode, grant }) {
    const worker = new URL("../worker.mjs", import.meta.url);
    const logPath = path.join(base, ".work", "tasks", slug, "run.log");
    // The node owns where this run's output goes; don't assume the task dir
    // exists yet (in practice the action creates it before launching).
    fsSync.mkdirSync(path.dirname(logPath), { recursive: true });
    const logFd = fsSync.openSync(logPath, "a");
    // run.log captures the provider's output — keep it owner-only.
    fsSync.chmodSync(logPath, 0o600);

    // The run number is explicit: the worker records it on events and uses it
    // to finalize the right run record, never guessing which run it is.
    const args = [worker.pathname, base, slug, String(run)];
    if (mode === "resume") args.push("resume", grant);

    // The worker inherits this runtime's environment, including a temporary
    // OpenCode model override on the process that started the run. A Core
    // started earlier does not replace it: each runtime spawns its own worker.
    const child = spawn(process.execPath, args, {
      detached: true,
      stdio: ["ignore", logFd, logFd],
      env
    });
    child.unref();
    return child.pid;
  }

  return {
    id: "local",
    displayName: "Local machine",
    resolveWorkspace,

    async startExecution({ task }) {
      const base = resolveWorkspace(task.execution?.workspace);
      return spawnWorker({ base, slug: task.slug, run: currentRunNumber(task) });
    },

    async resumeExecution({ task, grant }) {
      const base = resolveWorkspace(task.execution?.workspace);
      return spawnWorker({
        base,
        slug: task.slug,
        run: currentRunNumber(task),
        mode: "resume",
        grant
      });
    },

    // SIGTERM asks the worker to cancel the provider run and record the
    // terminal state. The signal is the node's stop; the worker owns the
    // outcome. No pid is a no-op (nothing was launched).
    async cancelExecution({ task }) {
      if (!task.pid) return;
      kill(task.pid, "SIGTERM");
    }
  };
}
