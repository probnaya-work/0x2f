import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createRuntime } from "../src/runtime.mjs";
import { createCommandProvider } from "../src/providers/command.mjs";
import { digest } from "../src/core/context.mjs";
import { startServer } from "../src/server.mjs";
import { authHeaders, TEST_AUTH_TOKEN } from "./helpers.mjs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createApp } from "../src/tui/app.mjs";
import { buildContinuation } from "../src/tui/view.mjs";

async function fixture(t) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "2f-preview-"));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const launches = [];
  const providers = ["alpha", "beta"].map(id => createCommandProvider({
    id, displayName: id, transport: "command", command: [process.execPath, "-e", ""]
  }));
  const rt = createRuntime(base, { providerId: "alpha", providers,
    node: { id: "fixture", async startExecution({ task }) { launches.push(task); return null; } } });
  let task = await rt.actions.createWork({ brief: "Preserve the original request\n  and its formatting." });
  task = { ...task, status: "ready", runs: [{ ...task.runs[0], outcome: "ready" }] };
  await rt.store.updateTask(task);
  await rt.store.writeText(path.join(rt.store.taskDir(task.slug), "runs/1/result.md"),
    "## Result\nFIRST_RESULT\n## Verification\nNot run\n## Limitations\nKeep the offline path.");
  return { rt, task, launches };
}

async function filesUnder(dir) {
  const found = {};
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) Object.assign(found, await filesUnder(file));
    else found[file] = digest(await fs.readFile(file));
  }
  return found;
}

test("preview is read-only, includes the last result and unsaved correction; start delivers exactly the reviewed text", async t => {
  const { rt, task, launches } = await fixture(t);
  await rt.actions.noteWork(task.id, { note: "Never deploy.\n  Keep this indentation." });
  const before = await filesUnder(rt.store.taskDir(task.slug));
  const preview = await rt.actions.previewRerunWork(task.id, { provider: "beta",
    input: { kind: "correction", text: "Fix the regression, preserving offline reading." } });
  assert.deepEqual(await filesUnder(rt.store.taskDir(task.slug)), before);
  assert.equal(launches.length, 1);
  assert.equal(preview.run, 2);
  assert.equal(preview.provider, "beta");
  assert.match(preview.prompt, /FIRST_RESULT/);
  assert.match(preview.prompt, /Keep the offline path/);
  assert.match(preview.prompt, /Never deploy\.\n  Keep this indentation\./);
  assert.match(preview.prompt, /Fix the regression/);
  assert.equal(preview.context.userInputs, 2);
  assert.equal(preview.context.sha256, digest(preview.prompt));
  const rows = buildContinuation({ continuation: preview }, 100, {}, t => ({ t }));
  assert.ok(rows.some(row => row.cells[0].t === "   Keep this indentation."), "the exact-input reader preserves leading spaces");
  const started = await rt.actions.rerunWork(task.id, { ...preview.options, previewId: preview.previewId });
  assert.equal(launches.length, 2);
  assert.equal(await rt.store.readRunPrompt(started, 2), preview.prompt);
  assert.equal(started.context.notes.at(-1).text, preview.options.input.text);
  assert.equal(started.execution.provider, "beta");
  const events = await rt.store.readEvents(task.slug);
  assert.equal(events.filter(e => e.type === "task.corrected").length, 1);
  assert.equal(await rt.store.readRunResult(started, started.runs[0]),
    "## Result\nFIRST_RESULT\n## Verification\nNot run\n## Limitations\nKeep the offline path.");
});

for (const change of ["note", "rules", "result", "budget", "provider"]) {
  test(`stale ${change} preview refuses before task/run mutation or launch`, async t => {
    const { rt, task, launches } = await fixture(t);
    const preview = await rt.actions.previewRerunWork(task.id);
    if (change === "note") await rt.actions.noteWork(task.id, { note: "A new requirement" });
    if (change === "rules") await rt.store.writeText(path.join(rt.base, ".work/rules.md"), "Stay offline");
    if (change === "result") await rt.store.writeText(path.join(rt.store.taskDir(task.slug), "runs/1/result.md"), "Updated result");
    if (change === "budget") await rt.store.writeJson(path.join(rt.base, ".work/context.json"), { maxChars: 16000 });
    const before = await filesUnder(rt.store.taskDir(task.slug));
    await assert.rejects(() => rt.actions.rerunWork(task.id, { ...preview.options,
      ...(change === "provider" ? { provider: "beta" } : {}), previewId: preview.previewId }), /changed since this preview/);
    assert.deepEqual(await filesUnder(rt.store.taskDir(task.slug)), before);
    assert.equal(launches.length, 1);
  });
}

test("shortening is visible and a budget failure leaves the next run and draft unpersisted", async t => {
  const { rt, task } = await fixture(t);
  const runs = [];
  for (let n = 1; n <= 18; n++) {
    runs.push({ ...task.runs[0], run: n, outcome: "ready" });
    await rt.store.writeText(path.join(rt.store.taskDir(task.slug), `runs/${n}/result.md`), "## Result\n" + "evidence ".repeat(1600));
  }
  await rt.store.updateTask({ ...task, runs });
  await rt.store.writeJson(path.join(rt.base, ".work/context.json"), { maxChars: 16000 });
  const preview = await rt.actions.previewRerunWork(task.id);
  assert.equal(preview.context.artifacts.length, 18);
  assert.ok(preview.context.artifacts.some(a => a.delivery !== "full"));
  assert.ok(preview.prompt.length <= 16000);
  for (let n = 0; n < 5; n++) await rt.actions.noteWork(task.id, { note: "x".repeat(3000) });
  const before = await filesUnder(rt.store.taskDir(task.slug));
  await assert.rejects(() => rt.actions.previewRerunWork(task.id, {
    input: { kind: "correction", text: "Unsaved correction" }
  }), /exceed.*context budget/);
  assert.deepEqual(await filesUnder(rt.store.taskDir(task.slug)), before);
});

test("a pending decision answer is saved only on the reviewed start; duplicate start is refused", async t => {
  const { rt, task, launches } = await fixture(t);
  await rt.store.updateTask({ ...task, status: "needs_you", blockedOn: { type: "decision", text: "Which scope?" } });
  const preview = await rt.actions.previewRerunWork(task.id, { input: { kind: "answer", text: "Local only." } });
  assert.equal((await rt.store.findTask(task.id)).context?.notes?.length ?? 0, 0);
  assert.match(preview.prompt, /Local only\./);
  const start = () => rt.actions.rerunWork(task.id, { ...preview.options, previewId: preview.previewId });
  const results = await Promise.allSettled([start(), start()]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(launches.length, 2);
  assert.equal((await rt.store.readJson(path.join(rt.store.taskDir(task.slug), "answer.json"))).answer, "Local only.");
});

test("preview validates active runs, provider and draft without effects", async t => {
  const { rt, task } = await fixture(t);
  await assert.rejects(() => rt.actions.previewRerunWork(task.id, { provider: "missing" }), /Unknown execution provider/);
  await assert.rejects(() => rt.actions.previewRerunWork(task.id, { input: { kind: "answer", text: "no" } }), /not waiting/);
  await assert.rejects(() => rt.actions.previewRerunWork(task.id, { input: { kind: "correction", text: " " } }), /required/);
  await assert.rejects(() => rt.actions.rerunWork(task.id, { previewId: "invalid" }), /Invalid continuation preview/);
  await assert.rejects(() => rt.actions.rerunWork(task.id, { input: { kind: "correction", text: "fix" } }), /Preview.*before/);
  await rt.store.updateTask({ ...task, status: "working" });
  await assert.rejects(() => rt.actions.previewRerunWork(task.id), /still executing/);
});

test("local API preview is authenticated, read-only and its guarded rerun uses the reviewed input", async t => {
  const { rt, task, launches } = await fixture(t);
  const handle = await startServer(rt.base, 0, { runtime: rt, authToken: TEST_AUTH_TOKEN });
  t.after(() => handle.close());
  const url = `${handle.url}/api/tasks/${task.id}`;
  assert.equal((await fetch(url + "/preview", { method: "POST" })).status, 401);
  const post = (suffix, body) => fetch(url + suffix, { method: "POST",
    headers: { ...authHeaders(), "content-type": "application/json", "x-0x2f-request-id": "preview-refresh" }, body: JSON.stringify(body) });
  const response = await post("/preview", { provider: "beta", input: { kind: "correction", text: "Keep the API." } });
  assert.equal(response.status, 200);
  let preview = await response.json();
  assert.equal(launches.length, 1);
  await rt.actions.noteWork(task.id, { note: "Updated while reviewing" });
  const refreshed = await post("/preview", { provider: "beta", input: { kind: "correction", text: "Keep the API." } });
  const latest = await refreshed.json();
  assert.notEqual(latest.previewId, preview.previewId, "read-only refresh bypasses the mutation replay cache");
  assert.match(latest.prompt, /Updated while reviewing/);
  preview = latest;
  const run = await post("/rerun", { ...preview.options, previewId: preview.previewId });
  assert.equal(run.status, 201);
  const started = await run.json();
  assert.equal(await rt.store.readRunPrompt(started, 2), preview.prompt);
});

test("CLI preview reads exact input without launching and prints a guarded continuation command", async t => {
  const { rt, task } = await fixture(t);
  await rt.store.writeJson(path.join(rt.base, ".work/providers/beta.json"), {
    id: "beta", displayName: "Beta", transport: "command", command: [process.execPath, "-e", "void 0", "{prompt}"]
  });
  const cli = fileURLToPath(new URL("../src/cli.mjs", import.meta.url));
  const before = await filesUnder(rt.store.taskDir(task.slug));
  const { stdout } = await promisify(execFile)(process.execPath, [cli, "preview", String(task.id), "--provider", "beta"], { cwd: rt.base });
  assert.match(stdout, /CONTINUATION PREVIEW · no run started/);
  assert.match(stdout, /FIRST_RESULT/);
  assert.match(stdout, /2f rerun 1 --provider beta --preview [a-f0-9]{64}/);
  assert.deepEqual(await filesUnder(rt.store.taskDir(task.slug)), before);
});

test("TUI preview keeps an unsaved correction on cancel; refresh and explicit start carry it exactly once", async t => {
  const { rt, task, launches } = await fixture(t);
  const app = createApp(rt);
  t.after(() => app.dispose());
  await app.refresh();
  await app.key({ name: "char", ch: "x" });
  await app.key({ name: "paste", text: "Keep the offline path." });
  await app.key({ name: "enter" });
  assert.equal(app.state.mode, "continuation");
  assert.match(app.state.continuation.prompt, /Keep the offline path\./);
  assert.equal(launches.length, 1);
  assert.equal((await rt.store.findTask(task.id)).context?.notes?.length ?? 0, 0);
  await app.key({ name: "escape" });
  assert.equal(app.state.input, "sendback");
  assert.equal(app.state.draft, "Keep the offline path.");
  await app.key({ name: "enter" });
  await rt.actions.noteWork(task.id, { note: "An intervening note" });
  await app.key({ name: "enter" });
  assert.equal(launches.length, 1);
  assert.match(app.state.lastError, /changed since this preview/);
  assert.equal(app.state.continuationInvalid, true);
  assert.equal(await app.key({ name: "enter" }), null, "an invalid review cannot be retried with Enter");
  await app.key({ name: "char", ch: "u" });
  assert.equal(app.state.continuationInvalid, false);
  const prompt = app.state.continuation.prompt;
  assert.match(prompt, /An intervening note/);
  await app.key({ name: "enter" });
  assert.equal(launches.length, 2);
  assert.equal(app.state.mode, "work");
  assert.equal(await rt.store.readRunPrompt(await rt.store.findTask(task.id), 2), prompt);
});

test("TUI refresh cannot silently review a different run after another client starts", async t => {
  const { rt, task, launches } = await fixture(t);
  const app = createApp(rt);
  t.after(() => app.dispose());
  await app.refresh();
  await app.key({ name: "char", ch: "v" });
  const other = await rt.actions.rerunWork(task.id);
  await rt.store.updateTask({ ...other, status: "ready", runs: other.runs.map(r => ({ ...r, outcome: "ready" })) });
  await app.key({ name: "char", ch: "u" });
  assert.match(app.state.lastError, /advanced to another run/);
  assert.equal(app.state.continuation.run, 2);
  assert.equal(app.state.continuationInvalid, true);
  await app.key({ name: "enter" });
  assert.equal(launches.length, 2);
  await app.key({ name: "escape" });
  await app.key({ name: "char", ch: "v" });
  assert.equal(app.state.continuation.run, 3, "a new review requires returning to the task");
});

test("TUI launch failure keeps the saved correction on the task without reoffering it as a draft", async t => {
  const { rt, task } = await fixture(t);
  const app = createApp(rt);
  t.after(() => app.dispose());
  await app.refresh();
  await app.key({ name: "char", ch: "x" });
  await app.key({ name: "paste", text: "Keep the offline path." });
  await app.key({ name: "enter" });
  rt.node.startExecution = async () => { throw Error("Worker unavailable"); };
  await app.key({ name: "enter" });
  assert.match(app.state.lastError, /Worker unavailable/);
  const stored = await rt.store.findTask(task.id);
  assert.equal(stored.status, "failed");
  assert.equal(stored.context.notes.length, 1);
  assert.equal(app.state.draft, "");
  assert.equal(app.state.input, null);
  assert.equal(app.state.continuationInvalid, true);
});
