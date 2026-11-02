import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setImmediate } from "node:timers/promises";
import { createBus } from "../src/core/events.mjs";
import { createRelayAgent } from "../src/relay/agent.mjs";
import { createRelayServer } from "../src/relay/server.mjs";
import { closeSecurityStack } from "./e2e-security-cleanup.mjs";

const quiet = { log() {}, warn() {}, error() {} };
function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

test("agent stop awaits its replay-cache write and is an idempotent barrier", { timeout: 5000 }, async t => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "work-agent-stop-"));
  const configPath = path.join(base, ".work", "relay.json");
  const cachePath = path.join(base, ".work", "relay-acks.json");
  const cached = { command1: { at: Date.now(), ack: { ok: true, status: 200, body: "once" } } };
  await fs.mkdir(path.dirname(cachePath));
  await fs.writeFile(cachePath, JSON.stringify(cached));
  const loaded = deferred();
  const entered = deferred();
  const release = deferred();
  const finished = deferred();
  const readFile = fs.readFile;
  const writeFile = fs.writeFile;
  t.mock.method(fs, "readFile", async (...args) => {
    const result = await readFile(...args);
    if (args[0] === cachePath) loaded.resolve();
    return result;
  });
  t.mock.method(fs, "writeFile", async (...args) => {
    if (args[0] !== cachePath) return writeFile(...args);
    entered.resolve();
    await release.promise;
    try {
      return await writeFile(...args);
    } finally {
      finished.resolve();
    }
  });
  const runtime = { events: createBus(), store: { base } };
  const agent = createRelayAgent({ runtime, configPath, log: quiet });
  let stopped;
  try {
    agent.start(); // No relay config: exercises persistence without opening a socket.
    await loaded.promise;
    await setImmediate();
    assert.equal(runtime.events.listenerCount(), 1);
    stopped = agent.stop();
    await entered.promise;
    assert.ok(stopped instanceof Promise, "stop must return the completion of the write");
    assert.equal(agent.stop(), stopped, "repeated stops share the same completion");
    let done = false;
    stopped.then(() => { done = true; });
    await setImmediate();
    assert.equal(done, false, "shutdown cannot finish while the cache write is held");
    assert.equal(runtime.events.listenerCount(), 0);
    release.resolve();
    await stopped;
    assert.deepEqual(JSON.parse(await readFile(cachePath, "utf8")), cached);
    assert.equal((await fs.stat(cachePath)).mode & 0o777, 0o600);
  } finally {
    release.resolve();
    await agent.stop();
    await finished.promise;
    t.mock.restoreAll();
    await fs.rm(base, { recursive: true, force: true });
  }
});

test("relay close drains an in-flight state save before its final flush", { timeout: 5000 }, async t => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "work-relay-stop-"));
  const dataFile = path.join(base, "state.json");
  // Mount mode exercises the real persistence/shutdown without binding localhost.
  const handle = await createRelayServer({ dataFile, mount: true, log: quiet }).start();
  const entered = deferred();
  const release = deferred();
  const writeFile = fs.writeFile;
  const mkdir = fs.mkdir;
  let writes = 0;
  let writersStarted = 0;
  t.mock.method(fs, "mkdir", (...args) => {
    if (args[0] === base) writersStarted++;
    return mkdir(...args);
  });
  t.mock.method(fs, "writeFile", async (...args) => {
    if (args[0] === dataFile && ++writes === 1) {
      entered.resolve();
      await release.promise;
    }
    return writeFile(...args);
  });
  const saving = handle.state.flushSave();
  let closed;
  try {
    await entered.promise;
    closed = handle.close();
    let done = false;
    closed.then(() => { done = true; });
    await setImmediate();
    assert.equal(writersStarted, 1, "the final flush must not start alongside the held writer");
    assert.equal(writes, 1, "the final flush must queue behind the existing writer");
    assert.equal(done, false, "close must wait for the outstanding state write");
    assert.equal(handle.close(), closed);
    release.resolve();
    await Promise.all([saving, closed]);
    assert.equal(writes, 2);
    assert.equal(JSON.parse(await fs.readFile(dataFile, "utf8")).version, 3);
  } finally {
    release.resolve();
    await saving;
    await handle.close();
    t.mock.restoreAll();
    await fs.rm(base, { recursive: true, force: true });
  }
});

test("security stack teardown waits for original and restarted agents before closing relay and deleting state", async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "work-stack-stop-"));
  const release = deferred();
  const entered = deferred();
  const order = [];
  const makeAgent = name => ({ async stop() {
    order.push(name);
    entered.resolve();
    await release.promise;
    await fs.writeFile(path.join(base, name), "final write");
  } });
  const closing = closeSecurityStack({
    base,
    agents: [makeAgent("agent"), makeAgent("agent2")],
    tailers: [{ stop() { order.push("tailer"); } }, { stop() { order.push("tailer2"); } }],
    handle: { async close() {
      order.push("relay");
      assert.equal(await fs.readFile(path.join(base, "agent"), "utf8"), "final write");
      assert.equal(await fs.readFile(path.join(base, "agent2"), "utf8"), "final write");
      await fs.writeFile(path.join(base, "relay"), "flushed");
    } }
  });
  try {
    await entered.promise;
    assert.deepEqual(order, ["tailer", "tailer2", "agent", "agent2"]);
    assert.ok((await fs.stat(base)).isDirectory(), "live state must remain until both agents stop");
    release.resolve();
    await closing;
    assert.deepEqual(order, ["tailer", "tailer2", "agent", "agent2", "relay"]);
    await assert.rejects(fs.stat(base), { code: "ENOENT" });
  } finally {
    release.resolve();
    await closing.catch(() => {});
    await fs.rm(base, { recursive: true, force: true });
  }
});

test("security stack still closes relay on producer failure and retains live state", async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "work-stack-error-"));
  const failure = new Error("producer did not stop");
  let relayClosed = false;
  let restartedStopped = false;
  try {
    await assert.rejects(closeSecurityStack({
      base,
      agents: [{ stop() { throw failure; } }, { async stop() { restartedStopped = true; } }],
      tailers: [],
      handle: { async close() { relayClosed = true; } }
    }), error => error instanceof AggregateError && error.errors.includes(failure));
    assert.equal(relayClosed, true);
    assert.equal(restartedStopped, true);
    assert.ok((await fs.stat(base)).isDirectory());
  } finally {
    await fs.rm(base, { recursive: true, force: true });
  }
});

test("security stack releases relay before a filesystem deletion failure", async t => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "work-stack-rm-error-"));
  const failure = Object.assign(new Error("simulated deletion failure"), { code: "ENOTEMPTY" });
  const rm = fs.rm;
  let relayClosed = false;
  t.mock.method(fs, "rm", async target => {
    assert.equal(target, base);
    assert.equal(relayClosed, true, "a deletion error must never prevent network cleanup");
    throw failure;
  });
  try {
    await assert.rejects(closeSecurityStack({
      base, agents: [], tailers: [], handle: { async close() { relayClosed = true; } }
    }), error => error === failure);
    assert.equal(relayClosed, true);
  } finally {
    t.mock.restoreAll();
    await rm(base, { recursive: true, force: true });
  }
});
