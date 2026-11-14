import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createKeyDecoder } from "../src/tui/keys.mjs";
import { initialState, apply } from "../src/tui/state.mjs";
import { startTui, makeWorkspace, storeOf, sleep } from "./tui-pty/driver.mjs";

const START = "\x1b[200~";
const END = "\x1b[201~";
const brief = "Perform a security audit.\n\nRead AGENTS.md first.\n- Review pairing.\nDo not change source code.\n";

test("bracketed paste preserves the whole brief across every marker/chunk boundary", () => {
  const wire = START + brief + END;
  for (let split = 1; split < wire.length; split++) {
    const decoder = createKeyDecoder();
    assert.deepEqual([
      ...decoder.push(wire.slice(0, split)),
      ...decoder.push(wire.slice(split))
    ], [{ name: "paste", text: brief }], `split at ${split}`);
  }
  const decoder = createKeyDecoder();
  assert.deepEqual([...wire].flatMap(ch => decoder.push(ch)), [{ name: "paste", text: brief }]);
});

test("paste cannot turn control bytes, shortcut letters or line breaks into commands", () => {
  const decoder = createKeyDecoder();
  const text = "n\rq\r\nx\ns\tpermission\x03\x1b[A";
  assert.deepEqual(decoder.push(START + text + END), [
    { name: "paste", text: "n\nq\nx\ns\tpermission[A" }
  ]);
  assert.deepEqual(decoder.push("first\nsecond\n"), [{ name: "paste", text: "first\nsecond\n" }],
    "an unframed multiline chunk is text too");
  assert.deepEqual(decoder.push("\r"), [{ name: "enter" }]);
});

test("Escape is flushable but a partial paste never leaks into shortcuts", () => {
  const decoder = createKeyDecoder();
  assert.deepEqual(decoder.push("\x1b"), []);
  assert.deepEqual(decoder.flush(), [{ name: "escape" }]);
  assert.deepEqual(decoder.push(START + "n\rq\nx"), []);
  assert.deepEqual(decoder.flush(), []);
  assert.deepEqual(decoder.push(END + "\r"), [{ name: "paste", text: "n\nq\nx" }, { name: "enter" }]);
});

test("Escape followed quickly by a plain key is not misread as an Alt chord", () => {
  const decoder = createKeyDecoder();
  assert.deepEqual(decoder.push("\x1b"), []);
  assert.deepEqual(decoder.push("q"), [{ name: "escape" }, { name: "char", ch: "q" }]);
  assert.deepEqual(decoder.push("\x1b\r"), [{ name: "enter", alt: true }]);
});

test("navigation keys coalesced by the tty are all delivered in order", () => {
  const decoder = createKeyDecoder();
  assert.deepEqual(decoder.push("\x1b[5~".repeat(5) + "\x1bOP"), [
    ...Array.from({ length: 5 }, () => ({ name: "page-up" })), { name: "help" }
  ]);
});

test("paste changes only the focused text field and requires a separate Enter", () => {
  const paste = { name: "paste", text: brief };
  const ctx = { tasks: [{ id: 3, state: "needs", halt: { kind: "decision" } }] };
  const idle = initialState();
  assert.deepEqual(apply(idle, paste, ctx), { state: idle, intent: null },
    "pasting over an old selected task must not answer, run or modify it");
  const composing = { ...idle, mode: "composer" };
  const inserted = apply(composing, paste, ctx);
  assert.equal(inserted.intent, null);
  assert.equal(inserted.state.composer.text, brief);
  assert.equal(apply(inserted.state, { name: "enter" }, ctx).intent.brief, brief.trim());
  const answering = apply({ ...idle, input: "answer" }, paste, ctx);
  assert.equal(answering.intent, null);
  assert.equal(answering.state.draft, brief);
});

test("PTY: a long split multiline paste creates exactly one task after explicit Enter", async () => {
  const { base } = await makeWorkspace();
  const session = await startTui({ workspace: base, cols: 120, rows: 36,
    ...(process.env.TUI_PASTE_TEST_CLI ? { cli: process.env.TUI_PASTE_TEST_CLI } : {}) });
  const store = storeOf(base);
  const request = brief + "Check the permission boundary.\n".repeat(170) + "END OF AUDIT REQUEST";
  try {
    await session.waitForText(/no task selected/, { timeout: 15000 });
    assert.ok(session.rawTail(100000).includes("\x1b[?2004h"), "the terminal is told to frame paste");
    await session.press("n");
    await session.waitForText(/NEW TASK/);
    // Split both delimiters and a body longer than a typical tty read.
    for (const part of [START.slice(0, 2), START.slice(2), request.slice(0, 1000), request.slice(1000), END.slice(0, 4), END.slice(4)]) {
      await session.write(part);
    }
    await session.waitForText(/END OF AUDIT REQUEST/);
    assert.equal((await store.listTasks()).length, 0, "paste alone never submits a line");
    await session.press("enter");
    await session.waitForText(/#001 opened/);
    const tasks = await store.listTasks();
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].brief, request);
    await sleep(150);
    assert.equal((await store.listTasks()).length, 1, "no trailing paste becomes extra tasks");
    await session.press("q");
    await session.waitForExit({ timeout: 5000 });
    assert.ok(session.rawTail(10000).includes("\x1b[?2004l"), "paste mode is restored on detach");
  } finally {
    session.kill();
    for (const task of await store.listTasks()) {
      if (task.processGroupId && task.processGroupId === task.pid) {
        try { process.kill(-task.processGroupId, "SIGKILL"); } catch { /* exited */ }
      }
    }
    await fs.rm(base, { recursive: true, force: true });
  }
});
