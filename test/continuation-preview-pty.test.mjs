import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { makeWorkspace, startTui, waitForTask, waitForTaskState, storeOf } from "./tui-pty/driver.mjs";
import { createRuntime } from "../src/runtime.mjs";

test("PTY: review next input, cancel without a run, reject stale review, refresh then start", async () => {
  const { base } = await makeWorkspace({ providerRoles: { alpha: "succeed" } });
  const rt = createRuntime(base);
  const task = await rt.actions.createWork({ brief: "PREVIEW_ORIGINAL_SENTINEL" });
  await waitForTask(base, task.id, "ready");
  const s = await startTui({ workspace: base, cols: 100, rows: 30 });
  try {
    await s.waitForText(/ACCEPT/);
    s.press("v");
    await s.waitForText(/CONTINUATION PREVIEW/);
    await s.waitForText(/No run started/);
    assert.equal((await storeOf(base).findTask(task.id)).runs.length, 1);
    s.press("escape");
    await s.waitForText(/ACCEPT/);
    s.press("v");
    await s.waitForText(/CONTINUATION PREVIEW/);
    await rt.actions.noteWork(task.id, { note: "PREVIEW_NEW_NOTE_SENTINEL" });
    s.press("enter");
    await s.waitForText(/changed since this preview/);
    assert.equal((await storeOf(base).findTask(task.id)).runs.length, 1);
    s.press("u");
    await s.waitForText(/1 user inputs in full/);
    s.press("G");
    await s.waitForText(/Full artifact/);
    const bottom = s.text();
    s.write("\x1b[5~");
    await s.waitFor(() => s.text() !== bottom, { label: "previous preview page" });
    s.press("g");
    await s.waitForText(/PREVIEW_NEW_NOTE_SENTINEL/);
    s.press("enter");
    const started = await waitForTaskState(base, task.id, task => task.runs.length === 2 && task.status === "ready", { label: "second run ready" });
    assert.equal(started.runs.length, 2);
    assert.match(await storeOf(base).readRunPrompt(started, 2), /PREVIEW_NEW_NOTE_SENTINEL/);
    s.press("q"); await s.waitForExit();
  } finally {
    s.kill();
    await fs.rm(base, { recursive: true, force: true });
  }
});
