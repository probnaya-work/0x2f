import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { createRuntime } from "../src/runtime.mjs";
import { applyOutcome } from "../src/core/lifecycle.mjs";
import { createApp } from "../src/tui/app.mjs";
import { initialState, apply } from "../src/tui/state.mjs";
import { editText } from "../src/tui/editor.mjs";
import { renderFrame } from "../src/tui/screen.mjs";
import { palette } from "../src/tui/theme.mjs";
import { frame } from "../src/tui/view.mjs";
import { runTui } from "../src/tui/index.mjs";
import { startTui, makeWorkspace, sleep } from "./tui-pty/driver.mjs";

const char = ch => ({ name: "char", ch });
const paste = text => ({ name: "paste", text });

async function fixture() {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "work-tui-release-"));
  const node = { id: "fake", resolveWorkspace: () => base, startExecution: async () => 4242 };
  const runtime = createRuntime(base, { node, env: { ...process.env, CLAUDE_BIN: process.execPath } });
  const app = createApp(runtime);
  return { runtime, app, base, async dispose() { app.dispose(); await fs.rm(base, { recursive: true, force: true }); } };
}

test("selection and a note's target survive incoming tasks and status-driven reordering", async () => {
  const f = await fixture();
  try {
    const a = await f.runtime.actions.createWork({ brief: "Original task" });
    const b = await f.runtime.actions.createWork({ brief: "Incoming task" });
    await f.app.refresh();
    assert.equal(f.app.selected().id, b.id);
    await f.app.key(char("c"));
    await f.app.key(paste("Keep this on the incoming task"));
    await f.runtime.store.updateTask(applyOutcome(a, { status: "needs_you", blockedOn: { type: "decision", text: "Which option?" } }));
    await f.app.refresh();
    assert.equal(f.app.selected().id, b.id, "selection follows ID, not a row position");
    await f.app.key({ name: "enter" });
    assert.equal((await f.runtime.actions.getWork(b.id)).context.notes.at(-1).text, "Keep this on the incoming task");
    assert.equal((await f.runtime.actions.getWork(a.id)).context?.notes?.length ?? 0, 0);
    const state = { ...initialState(), input: "note", inputTaskId: b.id, draft: "bound text", sel: 0 };
    const intent = apply(state, { name: "enter" }, { tasks: [{ id: a.id }, { id: b.id }] }).intent;
    assert.equal(intent.id, b.id, "the edit remains bound even if selection changes");
  } finally { await f.dispose(); }
});

test("newly created work gets focus even when an older task needs a decision", async () => {
  const f = await fixture();
  try {
    const old = await f.runtime.actions.createWork({ brief: "Old decision" });
    await f.runtime.store.updateTask(applyOutcome(old, { status: "needs_you", blockedOn: { type: "decision", text: "Publish?" } }));
    await f.app.refresh();
    await f.app.key(char("n"));
    await f.app.key(paste("New audit"));
    await f.app.key({ name: "enter" });
    assert.equal(f.app.selected().brief, "New audit");
  } finally { await f.dispose(); }
});

test("failed saves retain the draft and target; F1 shows the complete error and restores editing", async () => {
  const f = await fixture();
  try {
    await f.runtime.actions.createWork({ brief: "Do not lose my note" });
    await f.app.refresh();
    const target = f.app.selected().id;
    const message = "Cannot save this note.\nThe destination is unavailable.\nRetry after restoring access.";
    f.runtime.actions.noteWork = async () => { throw new Error(message); };
    await f.app.key(char("c"));
    await f.app.key(paste("Draft that must survive"));
    await f.app.key({ name: "enter" });
    assert.equal(f.app.state.draft, "Draft that must survive");
    await f.app.key({ name: "char", ch: "n", ctrl: true });
    await f.app.key(paste("A second line"));
    await f.app.key({ name: "help" });
    const draftScreen = renderFrame(f.app.frame({ cols: 120, rows: 36 }).lines, 120, 36, { support: "none" }).join("\n");
    assert.match(draftScreen, /DRAFT · review only/);
    assert.match(draftScreen, /A second line/);
    await f.app.key({ name: "escape" });
    assert.equal(f.app.state.inputTaskId, target);
    assert.equal(f.app.state.lastError, message);
    await f.app.key({ name: "help" });
    const screen = renderFrame(f.app.frame({ cols: 120, rows: 36 }).lines, 120, 36, { support: "none" }).join("\n");
    assert.match(screen, /LAST ERROR/);
    assert.match(screen, /Retry after restoring access/);
    await f.app.key({ name: "escape" });
    assert.equal(f.app.state.input, "note");
    assert.equal(f.app.state.draft, "Draft that must survive\nA second line");
    await sleep(3500);
    assert.equal(f.app.state.flash.tone, "warn", "a failed action is not a disappearing toast");
  } finally { await f.dispose(); }
});

test("muted text retains readable contrast on the normal and selected backgrounds", () => {
  const luminance = hex => {
    const rgb = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255)
      .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  for (const theme of ["dark", "light"]) {
    const p = palette(theme);
    for (const bg of [p.bg, p.sel]) {
      const light = luminance(p.ghost), ground = luminance(bg);
      assert.ok((Math.max(light, ground) + 0.05) / (Math.min(light, ground) + 0.05) >= 4.5, `${theme} secondary labels`);
    }
  }
});

test("draft editing inserts in place and deletes complete graphemes", () => {
  let draft = { text: "Audit logs", cursor: 6 };
  draft = editText(draft.text, draft.cursor, paste("all "));
  assert.equal(draft.text, "Audit all logs");
  draft = editText(draft.text, draft.cursor, { name: "home" });
  assert.equal(draft.cursor, 0);
  draft = editText(draft.text, draft.cursor, { name: "delete" });
  assert.equal(draft.text, "udit all logs");
  assert.equal(editText("a👩‍💻é", undefined, { name: "backspace" }).text, "a👩‍💻");
  assert.equal(editText("a👩‍💻", undefined, { name: "backspace" }).text, "a");
  assert.equal(editText("\nabc", 0, { name: "home" }).cursor, 0);
});

test("context help restores a long result's reading position", () => {
  const before = { ...initialState(), mode: "result", dscroll: 45 };
  const help = apply(before, { name: "char", ch: "g", ctrl: true }).state;
  const scrolled = apply(help, { name: "page-down" }).state;
  const after = apply(scrolled, { name: "escape" }).state;
  assert.equal(after.mode, "result");
  assert.equal(after.dscroll, 45);
});

test("both themes keep a long draft, current provider and START visible at 80×24", async () => {
  const f = await fixture();
  try {
    await f.app.refresh();
    await f.app.key(char("n"));
    const request = "FIRST AUDIT REQUIREMENT\n" + "Check permissions.\n".repeat(50) + "FINAL AUDIT REQUIREMENT";
    await f.app.key(paste(request));
    for (const theme of ["dark", "light"]) for (const [cols, rows] of [[80, 24], [60, 18]]) {
      const built = frame(f.app.model, f.app.state, { cols, rows, palette: palette(theme) });
      const screen = renderFrame(built.lines, cols, rows, { support: "none" }).join("\n");
      assert.match(screen, /FINAL AUDIT REQUIREMENT/);
      assert.match(screen, /↵ START/);
      assert.match(screen, /CLAUDE CODE/);
      assert.match(screen, /PgUp\/PgDn/);
    }
    for (let i = 0; i < 8; i++) await f.app.key({ name: "page-up" });
    const screen = renderFrame(f.app.frame({ cols: 80, rows: 24 }).lines, 80, 24, { support: "none" }).join("\n");
    assert.match(screen, /FIRST AUDIT REQUIREMENT/);
    assert.match(screen, /↵ START/);
    await f.app.key({ name: "help" });
    await f.app.key(char("G"));
    const help = renderFrame(f.app.frame({ cols: 80, rows: 24 }).lines, 80, 24, { support: "none" }).join("\n");
    assert.match(help, /a TASK is permanent/);
    await f.app.key({ name: "escape" });
    assert.equal(f.app.state.mode, "composer");
    assert.equal(f.app.state.composer.text, request);
  } finally { await f.dispose(); }
});

test("startup failure restores raw mode, cursor, paste and alternate screen", async () => {
  const f = await fixture();
  const input = new EventEmitter();
  const output = new EventEmitter();
  const modes = [];
  let wire = "";
  input.isTTY = output.isTTY = true;
  input.setRawMode = value => modes.push(value);
  input.resume = input.pause = input.setEncoding = () => {};
  output.write = value => { wire += value; };
  f.runtime.actions.listWork = async () => { throw new Error("workspace unavailable"); };
  try {
    await assert.rejects(runTui({ runtime: f.runtime, input, output }), /workspace unavailable/);
    assert.deepEqual(modes, [true, false]);
    for (const code of ["\x1b[?2004l", "\x1b[?25h", "\x1b[?1049l"]) assert.ok(wire.includes(code));
    assert.equal(input.listenerCount("data"), 0);
  } finally { await f.dispose(); }
});

test("PTY: provider selection, long draft review, help return and tiny-window recovery", async () => {
  const { base } = await makeWorkspace();
  const session = await startTui({ workspace: base, cols: 80, rows: 24,
    ...(process.env.TUI_RELEASE_TEST_CLI ? { cli: process.env.TUI_RELEASE_TEST_CLI } : {}) });
  try {
    await session.waitForText(/no task selected/, { timeout: 15000 });
    await session.press("n");
    await session.waitForText(/ALPHA/);
    await session.press("tab");
    await session.waitForText(/BRAVO/);
    const request = "FIRST REQUIREMENT\n" + "Review authentication.\n".repeat(30) + "FINAL REQUIREMENT";
    await session.write("\x1b[200~" + request + "\x1b[201~");
    // A PTY can deliver the editor rows before the footer of the same paint.
    await session.waitFor(s => /FINAL REQUIREMENT/.test(s.text()) && /↵ START/.test(s.text()),
      { label: "complete composer with visible Start action" });
    assert.match(session.text(), /↵ START/);
    await session.write("\x1bOP");
    await session.waitForText(/KEYS/);
    await session.key("G");
    await session.waitForText(/a TASK is permanent/);
    await session.press("escape");
    await session.waitForText(/FINAL REQUIREMENT/);
    await session.resize(10, 40);
    await session.waitForText(/terminal too small/);
    await session.press("enter");
    await sleep(100);
    assert.equal((await fs.readdir(path.join(base, ".work", "tasks"))).length, 0, "a hidden submit is disabled");
    await session.resize(24, 80);
    await session.waitForText(/FINAL REQUIREMENT/);
    await session.press("escape");
    await session.press("q");
    await session.waitForExit({ timeout: 5000 });
  } finally {
    session.kill();
    await fs.rm(base, { recursive: true, force: true });
  }
});
