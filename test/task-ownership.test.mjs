// Real detached workers must merge Task-owned input and publish only while
// their run and PID still own the execution. Providers here are local gates;
// no vendor binary, credentials, or network is involved.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRuntime } from "../src/runtime.mjs";
import { makeRunRecord } from "../src/core/runs.mjs";
import { pidAlive, recoverInterruptedRuns } from "../src/recover.mjs";

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitFor(fn, label) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const result = await fn();
    if (result) return result;
    await delay(20);
  }
  throw new Error(`timed out waiting for ${label}`);
}

async function present(p) {
  return fs.access(p).then(() => true, () => false);
}

async function fixture(t, { code = 0, acp = false } = {}) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "work-ownership-"));
  const command = path.join(base, "gated-provider.mjs");
  const source = acp
    ? `import fs from "node:fs";
import readline from "node:readline";
const send = value => process.stdout.write(JSON.stringify(value) + "\\n");
let promptId = null;
let permitted = false;
const timer = setInterval(() => {
  if (promptId !== null && fs.existsSync("release")) {
    send({ jsonrpc: "2.0", method: "session/update", params: {
      sessionId: "local-session", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Controlled local result" } }
    } });
    send({ jsonrpc: "2.0", id: promptId, result: { stopReason: "end_turn" } });
    promptId = null;
  }
}, 20);
const input = readline.createInterface({ input: process.stdin });
input.on("close", () => { clearInterval(timer); process.exit(0); });
input.on("line", line => {
  const m = JSON.parse(line);
  if (m.method === "initialize") send({ jsonrpc: "2.0", id: m.id, result: { protocolVersion: 1, agentCapabilities: { loadSession: true }, authMethods: [] } });
  if (m.method === "session/new") send({ jsonrpc: "2.0", id: m.id, result: { sessionId: "local-session" } });
  if (m.method === "session/load") { permitted = true; send({ jsonrpc: "2.0", id: m.id, result: {} }); }
  if (m.method === "session/prompt") {
    promptId = m.id;
    fs.writeFileSync("provider-started-" + process.pid, "");
    if (!permitted) send({ jsonrpc: "2.0", id: 100, method: "session/request_permission", params: {
      sessionId: "local-session", toolCall: { toolCallId: "local-edit", title: "Local fixture edit", kind: "edit" },
      options: [{ optionId: "allow", name: "Allow once", kind: "allow_once" }, { optionId: "reject", name: "Reject once", kind: "reject_once" }]
    } });
  }
  if (m.id === 100) { permitted = true; fs.writeFileSync("permission-resolved", ""); }
});`
    : `import fs from "node:fs";
fs.writeFileSync("provider-started-" + process.pid, "");
const timer = setInterval(() => {
  if (!fs.existsSync("release")) return;
  clearInterval(timer);
  process.stdout.write("Controlled local result");
  process.exit(${code});
}, 20);`;
  await fs.writeFile(command, source);
  const manifests = path.join(base, ".work", "providers");
  await fs.mkdir(manifests, { recursive: true });
  await fs.writeFile(path.join(manifests, "fixture.json"), JSON.stringify({
    id: "fixture",
    displayName: "Local ownership fixture",
    transport: acp ? "acp" : "command",
    command: [process.execPath, command, ...(acp ? [] : ["{prompt}"])]
  }));
  const runtime = createRuntime(base);
  const pids = new Set();
  t.after(async () => {
    await fs.writeFile(path.join(base, "release"), "").catch(() => {});
    for (const task of await runtime.store.listTasks()) {
      if (task.pid !== process.pid) pids.add(task.pid);
    }
    const deadline = Date.now() + 2000;
    while ([...pids].some(pid => pidAlive(pid)) && Date.now() < deadline) await delay(20);
    for (const pid of pids) {
      if (!pid || pid === process.pid) continue;
      try { process.kill(pid, "SIGKILL"); } catch { /* already exited */ }
    }
    await fs.rm(base, { recursive: true, force: true });
  });
  return {
    runtime,
    pids,
    release: () => fs.writeFile(path.join(base, "release"), ""),
    started: () => waitFor(async () => {
      const entries = (await fs.readdir(base)).filter(name => name.startsWith("provider-started-"));
      return entries.length && entries;
    }, "provider gate"),
    async start() {
      const task = await runtime.actions.createWork({ brief: "Controlled local ownership", provider: "fixture" });
      pids.add(task.pid);
      return task;
    },
    status: (id, expected) => waitFor(async () => {
      const task = await runtime.store.findTask(id);
      return task.status === expected && task;
    }, expected)
  };
}

for (const [code, expected] of [[0, "ready"], [7, "failed"]]) {
  test(`worker ${expected} preserves notes and corrections recorded during execution`, async t => {
    const f = await fixture(t, { code });
    const task = await f.start();
    await f.started();
    await f.runtime.actions.noteWork(task.id, { note: "Keep the public API compatible." });
    await f.runtime.actions.correctWork(task.id, { correction: "Retain the previous constraint." });
    await f.release();
    const finished = await f.status(task.id, expected);
    assert.deepEqual(finished.context.notes.map(note => note.text), [
      "Keep the public API compatible.", "Retain the previous constraint."
    ]);
    assert.equal(finished.runs[0].outcome, expected);
  });
}

test("an exception while publishing a result preserves input and finalizes the run as failed", async t => {
  const f = await fixture(t);
  const task = await f.start();
  await f.started();
  await f.runtime.actions.noteWork(task.id, { note: "Preserve this on the exception path." });
  // The provider succeeds, but the worker cannot publish its result over a
  // directory. This exercises the worker's exception finalization path.
  await fs.mkdir(path.join(f.runtime.store.taskDir(task.slug), "result.md"));
  await f.release();
  const failed = await f.status(task.id, "failed");
  assert.equal(failed.context.notes[0].text, "Preserve this on the exception path.");
  assert.equal(failed.runs[0].outcome, "failed");
  assert.match(failed.error, /EISDIR|directory/i);
});

for (const [code, expected] of [[0, "ready"], [7, "failed"]]) {
test(`closing a running task remains done when its run becomes ${expected}`, async t => {
  const f = await fixture(t, { code });
  const task = await f.start();
  await f.started();
  await f.runtime.actions.closeWork(task.id);
  await f.release();
  await waitFor(() => !pidAlive(task.pid), "worker exit");
  const finished = await f.runtime.store.findTask(task.id);
  assert.equal(finished.status, "done");
  assert.equal(finished.runs[0].outcome, expected, "the run records its own completion even after task close");
  if (code === 0) assert.equal(await f.runtime.store.readTaskResult(finished), "Controlled local result");
});
}

for (const replacement of ["newer run", "different worker PID"]) {
  test(`a worker superseded by ${replacement} cannot publish result or terminal events`, async t => {
    const f = await fixture(t);
    const task = await f.start();
    await f.started();
    let next = await f.runtime.store.findTask(task.id);
    if (replacement === "newer run") {
      next = { ...next, status: "ready", runs: [...next.runs, {
        ...makeRunRecord({ run: 2, provider: "newer-provider", startedAt: new Date().toISOString() }),
        outcome: "ready"
      }], execution: { provider: "newer-provider", node: "local", workspace: "local" } };
    } else {
      next = { ...next, pid: process.pid };
    }
    await f.runtime.store.updateTask(next);
    next = await f.runtime.store.findTask(task.id);
    await f.runtime.store.writeText(path.join(f.runtime.store.taskDir(task.slug), "result.md"), "Result of current owner");
    const before = await f.runtime.store.readEvents(task.slug);
    await f.release();
    await waitFor(() => !pidAlive(task.pid), "superseded worker exit");
    assert.deepEqual(await f.runtime.store.findTask(task.id), next);
    assert.equal(await f.runtime.store.readTaskResult(task), "Result of current owner");
    const after = await f.runtime.store.readEvents(task.slug);
    assert.deepEqual(after, before, "stale workers must not append terminal events");
    assert.equal(await present(path.join(f.runtime.store.taskDir(task.slug), "runs", "1", "result.md")), false);
  });
}

test("a live permission cannot start another run and its resolved worker preserves new input", async t => {
  const f = await fixture(t, { acp: true });
  const task = await f.start();
  await f.status(task.id, "needs_you");
  await assert.rejects(() => f.runtime.actions.rerunWork(task.id), /executing|live|sequential|permission/i);
  await f.runtime.actions.noteWork(task.id, { note: "Recorded while awaiting permission." });
  await f.runtime.actions.allowWork(task.id);
  await waitFor(() => present(path.join(f.runtime.base, "permission-resolved")), "permission resolution");
  await f.release();
  const finished = await f.status(task.id, "ready");
  assert.equal(finished.runs.length, 1);
  assert.equal(finished.context.notes[0].text, "Recorded while awaiting permission.");
});

test("concurrent session grants reserve exactly one resumed execution", async t => {
  const f = await fixture(t, { acp: true });
  const { store } = f.runtime;
  const task = await store.createTask({ title: "Saved session", brief: "Saved session", prompt: "Local prompt" }, {
    provider: "fixture",
    runs: [{ ...makeRunRecord({ run: 1, provider: "fixture", startedAt: new Date().toISOString() }), outcome: "needs_you" }]
  });
  await store.updateTask({ ...task, status: "needs_you", blockedOn: { type: "permission", tool: "Local edit" },
    execution: { ...task.execution, externalSessionId: "local-session" }
  });
  const grants = await Promise.allSettled([f.runtime.actions.allowWork(task.id), f.runtime.actions.allowWork(task.id)]);
  assert.equal(grants.filter(result => result.status === "fulfilled").length, 1);
  await f.started();
  const running = await store.findTask(task.id);
  f.pids.add(running.pid);
  assert.equal((await fs.readdir(f.runtime.base)).filter(name => name.startsWith("provider-started-")).length, 1);
  assert.equal(running.execution.attempts, 2, "reservation increments attempts exactly once");
  await f.release();
  const finished = await f.status(task.id, "ready");
  assert.equal(finished.runs[0].attempts, 2);
});

test("startup recovery fails a dead worker paused on a live permission", async t => {
  const f = await fixture(t, { acp: true });
  const task = await f.start();
  await f.status(task.id, "needs_you");
  process.kill(task.pid, "SIGKILL");
  await waitFor(() => !pidAlive(task.pid), "paused worker death");
  const recovered = await recoverInterruptedRuns(f.runtime.base, { log() {} });
  assert.equal(recovered.length, 1);
  const failed = await f.runtime.store.findTask(task.id);
  assert.equal(failed.status, "failed");
  assert.equal(failed.failure.kind, "crashed");
  assert.equal(failed.runs[0].outcome, "failed");
  assert.equal(failed.blockedOn, undefined);
  await assert.rejects(() => f.runtime.actions.allowWork(task.id), /not needs_you/);
});
