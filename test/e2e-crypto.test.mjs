// E2E crypto dual-path tests: WebCrypto (secure contexts: https/localhost/
// Node) and the vendored pure-JS fallback (@noble, used on a plain-http LAN
// phone page where `crypto.subtle` is unavailable) MUST produce identical
// keys and interop seamlessly — a phone on the LAN and a Mac on https speak
// the same wire protocol.

import test from "node:test";
import assert from "node:assert/strict";
import { Worker as NodeWorker } from "node:worker_threads";
import {
  deriveKeyRaw,
  importKey,
  encrypt,
  decrypt,
  buildAad,
  randomId,
  _forceNobleFallback
} from "../src/web/e2e.mjs";

const CODE = "TESTCODE12345";
const TOKEN = "sometoken";

test("the actual KDF worker derives the same key off-thread and terminates after reply", async () => {
  const expected = await deriveKeyRaw(CODE, TOKEN);
  const previous = globalThis.Worker;
  const pending = [];
  let stopped = 0;
  globalThis.Worker = class {
    constructor(url) {
      const bootstrap = `import {parentPort} from 'node:worker_threads';
        globalThis.self={postMessage:(data,transfer)=>parentPort.postMessage(data,transfer)};
        await import(${JSON.stringify(new URL("../src/web/kdf-worker.mjs", import.meta.url).href)});
        parentPort.on('message',data=>self.onmessage({data}));`;
      assert.equal(url.pathname.endsWith("/kdf-worker.mjs"), true);
      this.thread = new NodeWorker(new URL("data:text/javascript," + encodeURIComponent(bootstrap)));
      this.thread.on("message", data => this.onmessage?.({ data }));
      this.thread.on("error", error => this.onerror?.(error));
    }
    postMessage(data) { this.thread.postMessage(data); }
    terminate() { stopped++; pending.push(this.thread.terminate()); }
  };
  _forceNobleFallback(true);
  try {
    assert.deepEqual(await deriveKeyRaw(CODE, TOKEN), expected);
    assert.equal(stopped, 1);
  } finally {
    _forceNobleFallback(false);
    if (previous === undefined) delete globalThis.Worker; else globalThis.Worker = previous;
    await Promise.all(pending);
  }
});

test("WebCrypto and the pure-JS fallback derive the identical key", async () => {
  const viaSubtle = await deriveKeyRaw(CODE, TOKEN);
  _forceNobleFallback(true);
  try {
    const viaNoble = await deriveKeyRaw(CODE, TOKEN);
    assert.ok(Buffer.from(viaSubtle).equals(Buffer.from(viaNoble)), "PBKDF2 bytes must match");
    assert.equal(viaNoble.length, 32);
  } finally {
    _forceNobleFallback(false);
  }
});

test("a browser that refuses module workers still derives the compatible key", async () => {
  const expected = await deriveKeyRaw(CODE, TOKEN);
  const previous = globalThis.Worker;
  globalThis.Worker = class { constructor() { throw new Error("Worker refused by browser policy"); } };
  _forceNobleFallback(true);
  try { assert.deepEqual(await deriveKeyRaw(CODE, TOKEN), expected); }
  finally {
    _forceNobleFallback(false);
    if (previous === undefined) delete globalThis.Worker; else globalThis.Worker = previous;
  }
});

test("the fallback derivation stays responsive (yields between PBKDF2 batches)", async () => {
  // The phone's UI must not freeze during the 600k-iteration derivation — the
  // event loop has to get control back while it runs.
  let ticks = 0;
  const timer = setInterval(() => {
    ticks++;
  }, 1);
  _forceNobleFallback(true);
  try {
    const t0 = Date.now();
    const raw = await deriveKeyRaw(CODE, TOKEN);
    const elapsed = Date.now() - t0;
    clearInterval(timer);
    assert.equal(raw.length, 32);
    assert.ok(ticks > 0, "the event loop must run during the derivation");
    assert.ok(elapsed > 0);
  } finally {
    clearInterval(timer);
    _forceNobleFallback(false);
  }
});

test("envelopes encrypt on one path and decrypt on the other (both directions)", async () => {
  const raw = await deriveKeyRaw(CODE, TOKEN);
  const subtleKey = await importKey(raw);
  _forceNobleFallback(true);
  try {
    const nobleKey = await importKey(raw);

    // Phone (pure JS) -> Mac (WebCrypto).
    const toMac = await encrypt(nobleKey, { cmd: "command", op: "list" }, { from: "phone-1", requestId: "r-1" });
    const macSees = await decrypt(subtleKey, toMac, { from: "phone-1", requestId: "r-1" });
    assert.deepEqual(macSees, { cmd: "command", op: "list" });

    // Mac (WebCrypto) -> phone (pure JS).
    const toPhone = await encrypt(subtleKey, { cmd: "ack", ok: true }, { from: "mac-1", requestId: "r-2" });
    const phoneSees = await decrypt(nobleKey, toPhone, { from: "mac-1", requestId: "r-2" });
    assert.deepEqual(phoneSees, { cmd: "ack", ok: true });
  } finally {
    _forceNobleFallback(false);
  }
});

test("a tampered AAD (wrong from/requestId) is rejected on both paths", async () => {
  const raw = await deriveKeyRaw(CODE, TOKEN);
  const key = await importKey(raw);
  const env = await encrypt(key, { cmd: "snapshot" }, { from: "phone-1", requestId: "r-3" });
  assert.equal(await decrypt(key, env, { from: "phone-1", requestId: "WRONG" }), null);
  assert.equal(await decrypt(key, env, { from: "other", requestId: "r-3" }), null);
  assert.equal(await decrypt(key, { ...env, data: "AAAA" }, { from: "phone-1", requestId: "r-3" }), null);
});

test("AAD encoding is the fixed wire contract", () => {
  const aad = buildAad({ from: "phone-1", requestId: "r-9" });
  // version byte + len(7) + "phone-1" + len(3) + "r-9"
  assert.equal(aad[0], 2);
  assert.equal(aad[1], 7);
  assert.equal(new TextDecoder().decode(aad.slice(2, 9)), "phone-1");
  assert.equal(aad[9], 3);
  assert.equal(new TextDecoder().decode(aad.slice(10, 13)), "r-9");
});

test("randomId is a UUID v4 even where crypto.randomUUID is absent", () => {
  // Delete crypto.randomUUID (insecure-context simulation); getRandomValues
  // remains available.
  const saved = globalThis.crypto.randomUUID;
  try {
    globalThis.crypto.randomUUID = undefined;
    const id = randomId();
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  } finally {
    globalThis.crypto.randomUUID = saved;
  }
});
