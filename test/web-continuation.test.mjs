import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";

// Exercise the shipped dialog's asynchronous state transitions. Native
// modality/layout are checked separately in the browser; this small DOM
// stand-in keeps connection-loss and response-order cases deterministic.
const app = await fs.readFile(new URL("../src/web/app.js", import.meta.url), "utf8");
const reconcileSource = app.slice(app.indexOf("const pendingContinuationStarts ="), app.indexOf("const sendBack ="));
const source = app.slice(app.indexOf("function previewContinuation("), app.indexOf("// CLOSE tells 0x2F"));
const tick = () => new Promise(resolve => setImmediate(resolve));
const packet = (run = 2, options = {}) => ({
  run, provider: "alpha", previewId: "review-" + run, prompt: "Exact input for run " + run,
  context: { characters: 21, maxChars: 128000, artifacts: [] }, userInputs: [], options
});

function harness(post, reloadTasks = async () => {}) {
  const nodes = [];
  class Element {
    constructor(tag, attrs = {}, children = []) {
      this.tag = tag; this.attrs = attrs; this.textContent = attrs.text ?? "";
      this.disabled = attrs.disabled ?? false; this.listeners = new Map(); this.children = [];
      this.append(...children); nodes.push(this);
    }
    append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
    replaceChildren(...children) { for (const child of this.children) child.parent = null; this.children = []; this.append(...children); }
    setAttribute(name, value) { this.attrs[name] = value; }
    addEventListener(name, listener) { this.listeners.set(name, listener); }
    get isConnected() { return this.tag === "body" || !!this.parent?.isConnected; }
    showModal() { this.open = true; }
    close(value = "") { this.returnValue = value; this.open = false; this.listeners.get("close")?.(); }
    remove() { this.parent.children = this.parent.children.filter(n => n !== this); this.parent = null; }
    async click() { if (!this.disabled) await this.listeners.get("click")?.(); }
  }
  const noteInputs = new Map([[1, "unsaved correction"]]);
  const state = { providers: [{ id: "alpha", available: true }], tasks: [{ id: 1, execution: { provider: "alpha" } }], answers: new Map([[1, "unsaved answer"]]) };
  const document = { body: new Element("body"), activeElement: null };
  const { open, reconcile } = vm.runInNewContext("let continuationDialog = null;\n" + reconcileSource + source + "\n({open: previewContinuation, reconcile: reconcileContinuationDrafts})", {
    document, state, noteInputs, nextProviders: new Map(), post, reloadTasks,
    AbortSignal,
    el: (tag, attrs, children) => new Element(tag, attrs, children)
  });
  return { open, reconcile, state, noteInputs, nodes,
    button: text => nodes.find(node => node.tag === "button" && node.textContent === text),
    dialog: () => nodes.find(node => node.tag === "dialog") };
}

test("Web cancel during a pending preview preserves drafts and ignores its late response", async () => {
  let finish; let requests = 0;
  const h = harness(() => { requests++; return new Promise(resolve => { finish = resolve; }); });
  const result = h.open(1, {});
  assert.equal(h.button("START NEXT RUN").disabled, true);
  await h.button("BACK TO TASK").click();
  assert.equal(await result, false);
  finish(packet()); await tick();
  assert.equal(h.dialog().isConnected, false);
  assert.equal(h.noteInputs.get(1), "unsaved correction");
  assert.equal(requests, 1);
});

test("Web preview failure is recoverable, and stale start disables confirmation until refresh", async () => {
  let reads = 0, starts = 0;
  const h = harness(async url => {
    if (url.endsWith("/preview")) { if (++reads === 1) throw Error("Connection lost"); return packet(); }
    starts++; throw Error("Context changed since this preview");
  });
  const result = h.open(1, {}); await tick();
  assert.equal(h.button("START NEXT RUN").disabled, true);
  assert.ok(h.nodes.some(n => n.textContent === "Connection lost"));
  await h.button("REFRESH PREVIEW").click();
  assert.equal(h.button("START NEXT RUN").disabled, false);
  await h.button("START NEXT RUN").click();
  assert.equal(starts, 1);
  assert.equal(h.button("START NEXT RUN").disabled, true);
  await h.button("START NEXT RUN").click();
  assert.equal(starts, 1, "no automatic or disabled-button retry");
  await h.button("REFRESH PREVIEW").click();
  assert.equal(h.button("START NEXT RUN").disabled, false);
  await h.button("BACK TO TASK").click(); assert.equal(await result, false);
});

test("Web lost start response cannot turn refresh into a new run; authoritative state consumes the draft", async () => {
  let nextRun = 2, starts = 0;
  const options = { input: { kind: "correction", text: "unsaved correction", at: "2026-11-15T12:00:00.000Z" } };
  const h = harness(async url => {
    if (url.endsWith("/preview")) return packet(nextRun, options);
    starts++; nextRun++; throw Error("Response lost after server accepted the run");
  });
  const result = h.open(1, options); await tick();
  await h.button("START NEXT RUN").click();
  await h.button("REFRESH PREVIEW").click();
  assert.equal(h.button("START NEXT RUN").disabled, true);
  assert.ok(h.nodes.some(n => /advanced to another run/.test(n.textContent)));
  assert.equal(h.noteInputs.get(1), "unsaved correction");
  assert.equal(starts, 1);
  h.reconcile([{ id: 1, runs: [{ run: 2 }], context: { notes: [options.input] } }]);
  assert.equal(h.noteInputs.has(1), false, "a saved correction must not be offered again after returning to the task");
  await h.button("BACK TO TASK").click(); assert.equal(await result, false);
});

test("Web reconciliation preserves a newer edit and does not confuse the same text with a different saved note", async () => {
  const input = { kind: "correction", text: "unsaved correction", at: "2026-11-15T12:00:00.000Z" };
  for (const edited of [true, false]) {
    const h = harness(async url => {
      if (url.endsWith("/preview")) return packet(2, { input });
      throw Error("Start response unavailable");
    });
    const result = h.open(1, { input }); await tick();
    await h.button("START NEXT RUN").click();
    if (edited) h.noteInputs.set(1, "a newer correction");
    h.reconcile([{ id: 1, runs: [{ run: 2 }], context: { notes: [{ ...input, ...(edited ? {} : { at: "another timestamp" }) }] } }]);
    assert.equal(h.noteInputs.get(1), edited ? "a newer correction" : "unsaved correction");
    await h.button("BACK TO TASK").click(); await result;
  }
});

test("Web confirmed answer clears only that draft even if reloading the ledger fails", async () => {
  let starts = 0;
  const options = { input: { kind: "answer", text: "unsaved answer" } };
  const h = harness(async (url, body) => {
    if (url.endsWith("/preview")) return packet(2, options);
    starts++;
    assert.equal(body.previewId, "review-2"); assert.equal(body.input.text, "unsaved answer");
  }, async () => { throw Error("Ledger unavailable"); });
  const result = h.open(1, options); await tick();
  await h.button("START NEXT RUN").click(); await tick();
  assert.equal(await result, true);
  assert.equal(h.state.answers.has(1), false);
  assert.equal(h.noteInputs.get(1), "unsaved correction", "an unrelated correction draft survives");
  assert.equal(starts, 1);
});
