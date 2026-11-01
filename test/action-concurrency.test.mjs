import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRuntime } from "../src/runtime.mjs";

async function fixture(t, { failLaunch = false } = {}) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "work-action-concurrency-"));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  let resumes = 0;
  const node = {
    id: "fixture", startExecution: async () => {
      if (failLaunch) throw new Error("fixture spawn failure");
      return null;
    },
    resumeExecution: async () => { ++resumes; return null; }
  };
  const rt = createRuntime(base, { node });
  return { ...rt, resumes: () => resumes };
}

test("simultaneous human notes retain every acknowledged constraint", async t => {
  const rt = await fixture(t);
  const task = await rt.actions.createWork({ brief: "Concurrent notes" });
  await Promise.all(Array.from({ length: 20 }, (_, i) => rt.actions.noteWork(task.id, { note: `constraint ${i}` })));
  const fresh = await rt.store.findTask(task.id);
  assert.equal(new Set(fresh.context.notes.map(n => n.text)).size, 20);
});

test("distinct concurrent permission resumes admit exactly one execution", async t => {
  const rt = await fixture(t);
  const task = await rt.actions.createWork({ brief: "Resume once" });
  await rt.store.updateTask({ ...task, status: "needs_you", blockedOn: { type: "permission" },
    execution: { ...task.execution, externalSessionId: "local-session" } });
  const results = await Promise.allSettled([rt.actions.allowWork(task.id), rt.actions.rejectWork(task.id)]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(rt.resumes(), 1);
  const fresh = await rt.store.findTask(task.id);
  assert.equal(fresh.status, "working");
  assert.equal(fresh.execution.attempts, 2);
});

test("live permissions and closed in-flight executions cannot be rerun", async t => {
  const rt = await fixture(t);
  const task = await rt.actions.createWork({ brief: "One active execution" });
  const paused = { ...task, status: "needs_you", pid: process.pid,
    blockedOn: { type: "permission", live: true, requestId: "specific-request" },
    runs: task.runs.map(r => ({ ...r, outcome: "needs_you", blockedOn: { live: true } })) };
  await rt.store.updateTask(paused);
  await assert.rejects(rt.actions.rerunWork(task.id), /sequential/);
  await rt.actions.allowWork(task.id);
  const decision = await rt.store.readJson(path.join(rt.store.taskDir(task.slug), "permission.json"));
  assert.equal(decision.requestId, "specific-request");
  await rt.actions.closeWork(task.id);
  await assert.rejects(rt.actions.rerunWork(task.id), /sequential/);
});

test("spawn failure is durably failed instead of stranded working", async t => {
  const rt = await fixture(t, { failLaunch: true });
  await assert.rejects(rt.actions.createWork({ brief: "Fail to spawn" }), /fixture spawn failure/);
  const [task] = await rt.store.listTasks();
  assert.equal(task.status, "failed");
  assert.equal(task.runs[0].outcome, "failed");
  assert.equal(task.pid, undefined);
});

test("non-text action inputs are rejected before persistence or execution", async t => {
  const rt = await fixture(t);
  for (const fields of [{ brief: {} }, { brief: 1 }, { brief: "Valid", model: {} }, { brief: "Valid", provider: [] }]) {
    await assert.rejects(rt.actions.createWork(fields), error => error.status === 400 && /must be text/.test(error.message));
  }
  assert.equal((await rt.store.listTasks()).length, 0);
  const task = await rt.actions.createWork({ brief: "Valid" });
  await assert.rejects(rt.actions.noteWork(task.id, { note: {} }), /must be text/);
  await assert.rejects(rt.actions.correctWork(task.id, { correction: 3 }), /must be text/);
  await assert.rejects(rt.actions.answerWork(task.id, { answer: [] }), /must be text/);
  assert.equal((await rt.store.findTask(task.id)).context, undefined);
});

test("a gesture bound to an earlier permission cannot authorize the current occurrence", async t => {
  const rt = await fixture(t);
  const task = await rt.actions.createWork({ brief: "Permission freshness" });
  await rt.store.updateTask({ ...task, status: "needs_you", pid: process.pid,
    blockedOn: { type: "permission", live: true, requestId: 100, decisionId: "occurrence-b" } });
  for (const decisionId of ["occurrence-a", null]) {
    await assert.rejects(rt.actions.allowWork(task.id, { decisionId }), error => error.status === 409);
  }
  await assert.rejects(fs.access(path.join(rt.store.taskDir(task.slug), "permission.json")));
  const resumed = await rt.actions.allowWork(task.id, { decisionId: "occurrence-b" });
  assert.equal(resumed.status, "working");
  assert.equal((await rt.store.readJson(path.join(rt.store.taskDir(task.slug), "permission.json"))).decisionId, "occurrence-b");
});
