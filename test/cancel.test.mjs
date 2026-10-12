import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { outcomeAfterCancel, cancelledOutcome } from "../src/core/lifecycle.mjs";
import { createChildCancel } from "../src/providers/child-cancel.mjs";
import { projectRow, projectRuns } from "../src/web/ledger.mjs";
import { createRuntime } from "../src/runtime.mjs";
import { createStore } from "../src/core/store.mjs";
import { initProject } from "../src/project.mjs";

test("a finished turn keeps its result when cancel arrives in the same moment", () => {
  const ready = { status: "ready", result: "shipped" };
  assert.equal(
    outcomeAfterCancel({ cancelRequested: true, outcome: ready }),
    ready
  );
  const parked = { status: "needs_you", reason: "decision", result: "question" };
  assert.equal(
    outcomeAfterCancel({ cancelRequested: true, outcome: parked }),
    parked
  );
});

test("a provider that does not accept cancel still ends as cancelled", () => {
  const outcome = outcomeAfterCancel({
    cancelRequested: true,
    deliveryError: "broken pipe",
    outcome: { status: "failed", error: "exited before completing" }
  });
  assert.equal(outcome.status, "failed");
  assert.equal(outcome.failure.kind, "cancelled");
  assert.match(outcome.error, /Cancelled\. The provider did not accept the cancellation: broken pipe/);
});

test("cancel without a delivery error is a clean cancellation", () => {
  const outcome = cancelledOutcome("");
  assert.equal(outcome.error, "Cancelled.");
  assert.equal(outcome.failure.kind, "cancelled");
});

test("child cancel reports a kill failure and treats an already-exited process as delivered", () => {
  const missing = createChildCancel();
  assert.equal(missing.cancel().delivered, false);

  const gone = createChildCancel();
  gone.bind({
    kill() {
      const error = new Error("no such process");
      error.code = "ESRCH";
      throw error;
    }
  });
  assert.equal(gone.cancel().delivered, true);

  const stuck = createChildCancel();
  stuck.bind({
    kill() {
      throw new Error("operation not permitted");
    }
  });
  const result = stuck.cancel();
  assert.equal(result.delivered, false);
  assert.match(result.error, /not permitted/);
});

test("the ledger labels a cancelled run without treating it as a generic failure headline", () => {
  const task = {
    id: 1,
    title: "Stop this",
    brief: "Stop this",
    status: "failed",
    error: "Cancelled.",
    failure: { kind: "cancelled" },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    execution: { provider: "opencode" },
    runs: [
      {
        run: 1,
        provider: "opencode",
        outcome: "failed",
        error: "Cancelled.",
        failure: { kind: "cancelled" },
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString()
      }
    ]
  };
  const row = projectRow(task, [], { open: true });
  assert.equal(row.stateLabel, "CANCELLED");
  assert.equal(row.failureKind, "cancelled");
  assert.equal(row.sub, "cancelled");
  assert.equal(projectRuns(task.runs)[0].state, "CANCELLED");
});

async function waitFor(read, predicate, timeout = 10000) {
  const start = Date.now();
  let last;
  while (Date.now() - start < timeout) {
    last = await read();
    if (await predicate(last)) return last;
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  throw new Error("timed out: " + JSON.stringify(last));
}

test("the real worker persists a cancellation and leaves a finished run alone", async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "work-cancel-"));
  const bins = await fs.mkdtemp(path.join(os.tmpdir(), "work-cancel-bin-"));
  try {
    await initProject(base);
    const quick = path.join(bins, "quick.mjs");
    await fs.writeFile(
      quick,
      "process.stdout.write('## Result\\nkept\\n## Needs human decision\\nNone');\nprocess.exit(0);\n"
    );
    const slow = path.join(bins, "slow.mjs");
    await fs.writeFile(
      slow,
      "process.on('SIGTERM', () => process.exit(1));\nsetInterval(() => {}, 1000);\n"
    );
    await fs.writeFile(
      path.join(base, ".work", "providers", "quick.json"),
      JSON.stringify({
        id: "quick",
        displayName: "Quick",
        transport: "command",
        command: [process.execPath, quick, "{prompt}"]
      })
    );
    await fs.writeFile(
      path.join(base, ".work", "providers", "slow.json"),
      JSON.stringify({
        id: "slow",
        displayName: "Slow",
        transport: "command",
        command: [process.execPath, slow, "{prompt}"]
      })
    );

    const runtime = createRuntime(base);
    const store = createStore(base);
    const done = await runtime.actions.createWork({ brief: "finish this", provider: "quick" });
    const ready = await waitFor(
      () => store.findTask(done.id),
      task => task.status === "ready"
    );
    await assert.rejects(
      () => runtime.actions.cancelWork(done.id),
      /not working — nothing to cancel/
    );
    const untouched = await store.findTask(done.id);
    assert.equal(untouched.status, "ready");
    assert.equal(untouched.updatedAt, ready.updatedAt);
    assert.match(await store.readTaskResult(untouched), /kept/);

    const running = await runtime.actions.createWork({ brief: "wait here", provider: "slow" });
    const working = await waitFor(
      () => store.findTask(running.id),
      async task => {
        if (task.status !== "working" || !task.pid) return false;
        const events = await store.readEvents(task.slug);
        return events.some(event => event.type === "run.started");
      }
    );
    process.kill(working.pid, "SIGTERM");
    const cancelled = await waitFor(
      () => store.findTask(running.id),
      task => task.status === "failed"
    );
    assert.equal(cancelled.failure.kind, "cancelled");
    assert.match(cancelled.error, /^Cancelled\./);
    const events = await store.readEvents(cancelled.slug);
    assert.ok(events.some(event => event.type === "run.failed" && event.run === 1));

    const reloaded = createStore(base);
    const again = await reloaded.findTask(running.id);
    assert.equal(again.failure.kind, "cancelled");
    assert.match(again.error, /^Cancelled\./);
  } finally {
    try { execFileSync("pkill", ["-f", bins]); } catch { /* already gone */ }
    await fs.rm(base, { recursive: true, force: true });
    await fs.rm(bins, { recursive: true, force: true });
  }
});

test("a provider that cannot accept cancel still leaves a cancelled run", async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "work-cancel-acp-"));
  const bins = await fs.mkdtemp(path.join(os.tmpdir(), "work-cancel-acp-bin-"));
  try {
    await initProject(base);
    const agent = path.join(bins, "deaf.mjs");
    const readyFile = path.join(bins, "deaf-ready");
    await fs.writeFile(
      agent,
      `import fs from "node:fs";
import readline from "node:readline";
const send = obj => process.stdout.write(JSON.stringify(obj) + "\\n");
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", line => {
  let msg; try { msg = JSON.parse(line); } catch { return; }
  if (msg.method === "initialize") {
    send({ jsonrpc: "2.0", id: msg.id, result: { protocolVersion: 1, agentCapabilities: { loadSession: false }, agentInfo: { name: "deaf", title: "Deaf" }, authMethods: [] } });
  } else if (msg.method === "session/new") {
    send({ jsonrpc: "2.0", id: msg.id, result: { sessionId: "sess-deaf" } });
  } else if (msg.method === "session/prompt") {
    fs.closeSync(0);
    fs.writeFileSync(process.env.DEAF_READY, "1");
    setInterval(() => {}, 1000);
  }
});
`
    );
    process.env.DEAF_READY = readyFile;
    await fs.writeFile(
      path.join(base, ".work", "providers", "deaf.json"),
      JSON.stringify({
        id: "deaf",
        displayName: "Deaf",
        transport: "acp",
        command: [process.execPath, agent]
      })
    );
    const runtime = createRuntime(base);
    const store = createStore(base);
    const created = await runtime.actions.createWork({ brief: "hang", provider: "deaf" });
    const working = await waitFor(async () => {
      try {
        await fs.access(readyFile);
      } catch {
        return null;
      }
      return store.findTask(created.id);
    }, task => task?.status === "working" && task.pid);
    process.kill(working.pid, "SIGTERM");
    const cancelled = await waitFor(
      () => store.findTask(created.id),
      task => task.status === "failed",
      8000
    );
    assert.equal(cancelled.failure.kind, "cancelled");
    assert.match(cancelled.error, /did not accept the cancellation/);
  } finally {
    delete process.env.DEAF_READY;
    try { execFileSync("pkill", ["-f", bins]); } catch { /* already gone */ }
    await fs.rm(base, { recursive: true, force: true });
    await fs.rm(bins, { recursive: true, force: true });
  }
});
