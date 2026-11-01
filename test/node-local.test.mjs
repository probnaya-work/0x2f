// LocalExecutionNode — the machine boundary.
//
// These tests pin the node contract: execution requests arrive at the node
// as normalized { task } objects, and the node turns them into process
// launches. spawn/kill are injectable, which is exactly the seam a future
// remote node (mini-PC) would replace with a transport instead of a spawn —
// proving execution does not have to mean "spawn on the UI machine".

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { EventEmitter } from "node:events";
import { createLocalNode } from "../src/nodes/local.mjs";

function recordingSpawn() {
  const calls = [];
  return {
    calls,
    spawn(cmd, args, opts) {
      calls.push({ cmd, args, opts });
      const child = Object.assign(new EventEmitter(), { pid: 4242, unref() {} });
      queueMicrotask(() => child.emit("spawn"));
      return child;
    }
  };
}

const task = slug => ({ slug, execution: { workspace: "local" } });

for (const mode of ["start", "resume"]) {
  test(`an asynchronous EAGAIN during worker ${mode} rejects and closes the log descriptor`, async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "work-node-async-fail-"));
    let fd;
    let unref = false;
    const node = createLocalNode({ workspace, spawn(_command, _args, opts) {
      fd = opts.stdio[1];
      const child = Object.assign(new EventEmitter(), { unref() { unref = true; } });
      setImmediate(() => child.emit("error", Object.assign(new Error("spawn EAGAIN"), { code: "EAGAIN" })));
      return child;
    } });
    try {
      const operation = mode === "start"
        ? node.startExecution({ task: task("001-async-failed") })
        : node.resumeExecution({ task: task("001-async-failed"), grant: "allow" });
      await assert.rejects(operation, { code: "EAGAIN" });
      assert.equal(unref, false, "a failed launch must not be detached as a successful worker");
      assert.throws(() => fsSync.fstatSync(fd), { code: "EBADF" });
    } finally {
      try { fsSync.closeSync(fd); } catch {}
      await fs.rm(workspace, { recursive: true, force: true });
    }
  });
}

test("worker startup waits for the child spawn event before returning its PID", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "work-node-spawn-handshake-"));
  const child = Object.assign(new EventEmitter(), { pid: 4242, unref() {} });
  let fd;
  const node = createLocalNode({ workspace, spawn(_command, _args, opts) { fd = opts.stdio[1]; return child; } });
  try {
    let settled = false;
    const pending = node.startExecution({ task: task("001-handshake") }).then(pid => { settled = true; return pid; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(settled, false);
    child.emit("spawn");
    assert.equal(await pending, 4242);
    assert.throws(() => fsSync.fstatSync(fd), { code: "EBADF" });
  } finally {
    try { fsSync.closeSync(fd); } catch {}
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("worker launches close the parent's log descriptor after start and resume", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "work-node-fds-"));
  const spawner = recordingSpawn();
  const node = createLocalNode({ workspace, spawn: spawner.spawn });
  try {
    for (let i = 0; i < 32; i++) {
      await node.startExecution({ task: task("001-fd") });
      assert.throws(() => fsSync.fstatSync(spawner.calls.at(-1).opts.stdio[1]), { code: "EBADF" });
      await node.resumeExecution({ task: task("001-fd"), grant: "allow" });
      assert.throws(() => fsSync.fstatSync(spawner.calls.at(-1).opts.stdio[1]), { code: "EBADF" });
    }
  } finally {
    // Also release descriptors when exercising the regression against an old build.
    for (const call of spawner.calls) {
      try { fsSync.closeSync(call.opts.stdio[1]); } catch {}
    }
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("a failed worker spawn also closes the parent's log descriptor", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "work-node-spawn-fail-"));
  let fd;
  const node = createLocalNode({ workspace, spawn(_command, _args, opts) {
    fd = opts.stdio[1];
    throw new Error("fixture spawn failure");
  } });
  try {
    await assert.rejects(() => node.startExecution({ task: task("001-failed") }), /fixture spawn failure/);
    assert.throws(() => fsSync.fstatSync(fd), { code: "EBADF" });
  } finally {
    try { fsSync.closeSync(fd); } catch {}
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("a package path containing spaces and URL characters launches an existing worker path", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "work-node-path-"));
  const copiedSrc = path.join(workspace, "package with spaces # percent%", "src");
  try {
    await fs.mkdir(path.join(copiedSrc, "nodes"), { recursive: true });
    await fs.mkdir(path.join(copiedSrc, "core"));
    await fs.copyFile(new URL("../src/nodes/local.mjs", import.meta.url), path.join(copiedSrc, "nodes", "local.mjs"));
    await fs.copyFile(new URL("../src/core/runs.mjs", import.meta.url), path.join(copiedSrc, "core", "runs.mjs"));
    const worker = path.join(copiedSrc, "worker.mjs");
    await fs.writeFile(worker, "// fixture worker\n");
    const { createLocalNode: copiedNode } = await import(pathToFileURL(path.join(copiedSrc, "nodes", "local.mjs")));
    const spawner = recordingSpawn();
    await copiedNode({ workspace, spawn: spawner.spawn }).startExecution({ task: task("001-path") });
    assert.equal(spawner.calls[0].args[0], await fs.realpath(worker));
    await fs.access(spawner.calls[0].args[0]);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("startExecution spawns the detached worker on this machine and returns its pid", async () => {
  const spawner = recordingSpawn();
  const node = createLocalNode({ workspace: "/tmp/proj", spawn: spawner.spawn });

  const pid = await node.startExecution({ task: task("003-x") });

  assert.equal(pid, 4242);
  assert.equal(spawner.calls.length, 1);
  const { cmd, args, opts } = spawner.calls[0];
  assert.equal(cmd, process.execPath);
  assert.ok(args[0].endsWith("worker.mjs"), `worker path: ${args[0]}`);
  // The worker receives the run number explicitly (a legacy task without run
  // records is run 1) so it never guesses which run it is executing.
  assert.deepEqual(args.slice(1), ["/tmp/proj", "003-x", "1"]);
  assert.equal(opts.detached, true);
  // stdout/stderr go to the task's run.log (an fd the node opened).
  assert.equal(opts.stdio[0], "ignore");
  assert.equal(typeof opts.stdio[1], "number");
  assert.equal(opts.stdio[2], opts.stdio[1]);
});

test("startExecution passes the current run number to the worker", async () => {
  const spawner = recordingSpawn();
  const node = createLocalNode({ workspace: "/tmp/proj", spawn: spawner.spawn });

  await node.startExecution({
    task: {
      slug: "003-x",
      execution: { workspace: "local" },
      runs: [{ run: 1, outcome: "ready" }, { run: 2, outcome: "working" }]
    }
  });
  assert.deepEqual(spawner.calls[0].args.slice(1), ["/tmp/proj", "003-x", "2"]);
});

test("resumeExecution spawns the worker in resume mode with the grant", async () => {
  const spawner = recordingSpawn();
  const node = createLocalNode({ workspace: "/tmp/proj", spawn: spawner.spawn });

  await node.resumeExecution({ task: task("003-x"), grant: "allow" });
  const { args } = spawner.calls[0];
  assert.deepEqual(args.slice(1), ["/tmp/proj", "003-x", "1", "resume", "allow"]);
});

test("resolveWorkspace maps the logical 'local' workspace to the local path", () => {
  const node = createLocalNode({ workspace: "/tmp/proj" });
  assert.equal(node.resolveWorkspace("local"), "/tmp/proj");
  // v0.2 tasks have no workspace field — treated as local.
  assert.equal(node.resolveWorkspace(undefined), "/tmp/proj");
  assert.throws(() => node.resolveWorkspace("mini-pc"), /cannot resolve workspace "mini-pc"/);
});

test("cancelExecution is a best-effort stop of the recorded pid", async () => {
  const killed = [];
  const node = createLocalNode({
    workspace: "/tmp/proj",
    kill: pid => killed.push(pid)
  });
  await node.cancelExecution({ task: { slug: "003-x", pid: 77 } });
  assert.deepEqual(killed, [77]);
  await node.cancelExecution({ task: { slug: "003-x" } }); // no pid — no-op
  assert.deepEqual(killed, [77]);
});

test("the node is a swappable seam: the same contract a remote node would implement", async () => {
  // The action layer only knows { startExecution, resumeExecution,
  // cancelExecution, resolveWorkspace, id }. A future trusted mini-PC node
  // implements the SAME five members over a transport. Assert the local node
  // exposes exactly that contract, nothing more (no claude, no store, no UI).
  const node = createLocalNode({ workspace: "/tmp/proj" });
  const contract = Object.keys(node).sort();
  assert.deepEqual(contract, [
    "cancelExecution",
    "displayName",
    "id",
    "resolveWorkspace",
    "resumeExecution",
    "startExecution"
  ]);
  assert.equal(node.id, "local");
  assert.equal(node.displayName, "Local machine");
});
