import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createStore } from "../src/core/store.mjs";
import { initProject } from "../src/project.mjs";

const exec = promisify(execFile);
const cli = fileURLToPath(new URL("../src/cli.mjs", import.meta.url));

// Exercise the real read-only CLI against saved state; no providers execute.
async function fixture(t) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "work-cli-open-"));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  await initProject(base);
  const store = createStore(base);
  const runs = [
    { run: 1, provider: "codex", outcome: "ready", startedAt: "2026-11-01T21:30:00Z", completedAt: "2026-11-01T21:35:00Z", durationMs: 300000 },
    { run: 2, provider: "gemini", outcome: "failed", startedAt: "2026-11-01T21:36:00Z", completedAt: "2026-11-01T21:36:01Z", durationMs: 1000, error: "Intermediate provider failed" },
    { run: 3, provider: "opencode", outcome: "working", startedAt: "2026-11-01T21:37:00Z" }
  ];
  const task = await store.createTask({ title: "Inspect current run", brief: "Original request", prompt: "Original request" }, { provider: "opencode", runs });
  const dir = store.taskDir(task.slug);
  await store.writeText(path.join(dir, "result.md"), "Earlier successful report");
  await store.writeText(path.join(dir, "runs", "1", "result.md"), "Earlier successful report");
  await store.writeText(path.join(dir, "run.log"), "Old raw log must not appear as current work");
  await store.appendEvent(task.slug, { type: "progress", run: 1, text: "Earlier progress" });
  await store.appendEvent(task.slug, { type: "tool.started", run: 1, name: "shell", input: { command: "old-command" } });
  await store.appendEvent(task.slug, { type: "run.failed", run: 2, error: runs[1].error });
  const open = async (...args) => (await exec(process.execPath, [cli, "open", String(task.id), ...args], { cwd: base })).stdout;
  return { store, task, dir, open };
}

test("open: an eventless new run shows no old result or activity; current progress follows only its events", async t => {
  const { store, task, open } = await fixture(t);
  const quiet = await open();
  assert.match(quiet, /Status: working/);
  assert.match(quiet, /01\s+codex\s+\S+\s+READY/);
  assert.match(quiet, /02\s+gemini\s+\S+\s+FAILED/);
  assert.match(quiet, /03\s+opencode\s+—\s+WORKING/);
  assert.match(quiet, /No written result for this run\./);
  assert.match(quiet, /No activity reported for this run yet\./);
  assert.doesNotMatch(quiet, /Earlier successful report|Earlier progress|old-command|Old raw log|Intermediate provider failed/);

  await store.appendEvent(task.slug, { type: "progress", run: 3, text: "Checking the current change" });
  const active = await open();
  assert.match(active, /No written result for this run\./);
  assert.match(active, /Progress: Checking the current change/);
  assert.doesNotMatch(active, /Earlier successful report|Earlier progress|old-command|Old raw log/);

  await store.appendEvent(task.slug, { type: "tool.started", run: 3, name: "shell", input: { command: "current-command" } });
  const command = await open();
  assert.match(command, /Progress: SHELL current-command/);
  assert.doesNotMatch(command, /Checking the current change|old-command/);
  assert.match(await open("--run", "1"), /Earlier successful report/);
  assert.match(await open("--run", "3"), /No written result for this run\./);
});

test("open: a failed run after success shows its own error and leaves the old result accessible explicitly", async t => {
  const { store, task, open } = await fixture(t);
  await store.updateTask({ ...task, status: "failed", execution: { provider: "gemini" }, runs: task.runs.slice(0, 2), error: task.runs[1].error });
  const failed = await open();
  assert.match(failed, /Status: failed/);
  assert.match(failed, /No written result for this run\./);
  assert.match(failed, /Intermediate provider failed/);
  assert.doesNotMatch(failed, /Earlier successful report|Earlier progress|old-command|Old raw log/);
  assert.match(await open("--run", "1"), /Earlier successful report/);
  assert.match(await open("--run", "2"), /Intermediate provider failed/);
});

test("open: the current run's written result takes precedence over the task-level cached result", async t => {
  const { store, task, dir, open } = await fixture(t);
  await store.writeText(path.join(dir, "runs", "3", "result.md"), "Current run's saved result");
  await store.updateTask({ ...task, status: "ready", runs: task.runs.map(r => r.run === 3 ? { ...r, outcome: "ready" } : r) });
  const ready = await open();
  assert.match(ready, /Current run's saved result/);
  assert.doesNotMatch(ready, /Earlier successful report|No written result|Progress:/);
  assert.match(await open("--run", "3"), /Current run's saved result/);
});

test("open: legacy tasks still read their sole result and untagged progress", async t => {
  const { store, task, dir, open } = await fixture(t);
  const { runs, ...legacy } = task;
  await store.updateTask({ ...legacy, status: "ready" });
  assert.match(await open(), /Earlier successful report/);
  await store.writeText(path.join(dir, "result.md"), "");
  await store.updateTask({ ...legacy, status: "working" });
  await store.appendEvent(task.slug, { type: "progress", text: "Legacy current activity" });
  const active = await open();
  assert.match(active, /No written result for this run\./);
  assert.match(active, /Progress: Legacy current activity/);
});
