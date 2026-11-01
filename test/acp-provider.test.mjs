// ACP Provider — the generic Agent Client Protocol (v1) adapter, driven
// through a FAKE ACP agent: a real stdio subprocess that speaks JSON-RPC
// lines exactly as the protocol defines (initialize / session/new /
// session/load / session/prompt / session/update / session/request_permission
// / session/cancel), with behaviors selected by FAKE_ACP_BEHAVIOR.
//
// These tests prove the provider is a faithful ACP v1 CLIENT and that every
// reliable protocol concept maps to a normalized Work outcome/event — and
// that nothing raw leaks out.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createAcpProvider } from "../src/providers/acp.mjs";
import { EVENT_TYPES } from "../src/core/events.mjs";

// --- the fake ACP agent -----------------------------------------------------

const FAKE_AGENT = `#!/usr/bin/env node
import fs from "node:fs";
import readline from "node:readline";

const behavior = process.env.FAKE_ACP_BEHAVIOR ?? "complete";
const logPath = process.env.FAKE_ACP_LOG;
const logLine = obj => {
  if (logPath) fs.appendFileSync(logPath, JSON.stringify(obj) + "\\n");
};

const send = obj => process.stdout.write(JSON.stringify(obj) + "\\n");

let pendingPromptId = null;
let requestedPermission = false;
const permissionReplies = new Set();
let repeatedRequestSent = false;

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", line => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }

  // Response to our server-initiated permission request.
  if (msg.id === 100 || msg.id === 101) {
    logLine({ requestId: msg.id, permissionResponse: msg.result });
    permissionReplies.add(msg.id);
    if (behavior === "two-permissions" && permissionReplies.size < 2) return;
    if (behavior === "reused-id" && !repeatedRequestSent) {
      repeatedRequestSent = true;
      send({ jsonrpc: "2.0", id: 100, method: "session/request_permission", params: {
        sessionId: "sess-fake",
        toolCall: { toolCallId: "different-call", title: "A different operation with reused RPC id", kind: "execute" },
        options: [
          { optionId: "allow-reused", name: "Allow once", kind: "allow_once" },
          { optionId: "reject-reused", name: "Reject", kind: "reject_once" }
        ]
      }});
      return;
    }
    requestedPermission = false;
    send({ jsonrpc: "2.0", method: "session/update", params: {
      sessionId: "sess-fake",
      update: { sessionUpdate: "agent_message_chunk", messageId: "msg-2",
        content: { type: "text", text: "completed after permission exchange" } }
    }});
    send({ jsonrpc: "2.0", id: pendingPromptId, result: { stopReason: "end_turn" } });
    return;
  }
  if (msg.id === 200) {
    logLine({ permissionCancelled: msg.result });
    return;
  }
  if (msg.method === "session/cancel") {
    logLine({ cancel: msg.params });
    process.exit(0);
  }
  if (msg.method === "initialize") {
    if (behavior === "malformed-init") {
      send({ jsonrpc: "2.0", id: msg.id, error: { code: -32600, message: "initialize rejected" } });
      return;
    }
    if (behavior === "garbage-init") {
      process.stdout.write("this is not json\\n");
      process.exit(1);
      return;
    }
    send({ jsonrpc: "2.0", id: msg.id, result: {
      protocolVersion: 1,
      agentCapabilities: { loadSession: behavior !== "load-unsupported" },
      agentInfo: { name: "fake-acp", title: "Fake ACP Agent", version: "1.0.0" },
      authMethods: []
    }});
    return;
  }
  if (msg.method === "session/new" || msg.method === "session/load") {
    logLine({ [msg.method]: msg.params });
    if (behavior === "no-session-id") {
      send({ jsonrpc: "2.0", id: msg.id, result: {} });
      return;
    }
    send({ jsonrpc: "2.0", id: msg.id, result: { sessionId: "sess-fake" } });
    return;
  }
  if (msg.method === "session/prompt") {
    pendingPromptId = msg.id;
    logLine({ prompt: { sessionId: msg.params.sessionId, text: msg.params.prompt?.[0]?.text } });
    if (behavior === "exit-early") { process.exit(1); }
    if (behavior === "hang") { return; } // never answer
    if (["permission", "approve", "die-on-permission", "two-permissions", "allow-only", "reused-id"].includes(behavior)) {
      requestedPermission = true;
      send({ jsonrpc: "2.0", id: 100, method: "session/request_permission", params: {
        sessionId: "sess-fake",
        toolCall: { toolCallId: "call-1", title: "Edit file", kind: "edit" },
        options: behavior === "allow-only" ? [
          { optionId: "allow-once", name: "Allow once", kind: "allow_once" }
        ] : [
          { optionId: "allow-once", name: "Allow once", kind: "allow_once" },
          { optionId: "allow-always", name: "Allow always", kind: "allow_always" },
          { optionId: "reject-once", name: "Reject", kind: "reject_once" }
        ]
      }});
      if (behavior === "two-permissions") send({ jsonrpc: "2.0", id: 101, method: "session/request_permission", params: {
        sessionId: "sess-fake",
        toolCall: { toolCallId: "call-2", title: "Run another command", kind: "execute" },
        options: [
          { optionId: "allow-second", name: "Allow once", kind: "allow_once" },
          { optionId: "reject-second", name: "Reject", kind: "reject_once" }
        ]
      }});
      if (behavior === "die-on-permission") process.exit(1); // die while the human decides
      return;
    }
    const chunks = behavior === "decision"
      ? ["## Result\\ninvestigated\\n", "\\n## Needs human decision\\nREQUIRED: yes\\nQUESTION: Which backend?"]
      : ["The root cause is ", "a reset of the retry window."];
    for (const text of chunks) {
      send({ jsonrpc: "2.0", method: "session/update", params: {
        sessionId: "sess-fake",
        update: { sessionUpdate: "agent_message_chunk", messageId: "msg-1",
          content: { type: "text", text } }
      }});
    }
    if (behavior === "notifications") {
      // Unknown notifications + non-mappable updates must not break the run.
      send({ jsonrpc: "2.0", method: "session/update", params: {
        sessionId: "sess-fake", update: { sessionUpdate: "usage_update", used: 1, size: 2 } }});
      send({ jsonrpc: "2.0", method: "unknown/thing", params: { x: 1 } });
      send({ jsonrpc: "2.0", method: "session/update", params: {
        sessionId: "sess-fake", update: { sessionUpdate: "tool_call",
          toolCallId: "call-x", title: "Grep", kind: "search", status: "pending",
          locations: [{ path: "/w/src/a.ts", line: 3 }] } }});
    }
    const stopReason = behavior === "max_tokens" ? "max_tokens" : "end_turn";
    send({ jsonrpc: "2.0", id: msg.id, result: { stopReason } });
    return;
  }
  if (msg.method === "session/request_permission" && requestedPermission) {
    logLine({ permissionRequest: msg.params });
    return;
  }
});
`;

async function writeFakeAgent() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "work-fake-acp-"));
  const bin = path.join(dir, "fake-acp-agent.mjs");
  await fs.writeFile(bin, FAKE_AGENT);
  await fs.chmod(bin, 0o755);
  return { bin, dir };
}

function providerFor(bin, over = {}) {
  return createAcpProvider({
    id: "fake-acp",
    displayName: "Fake ACP Agent",
    transport: "acp",
    command: [bin, "--acp"],
    ...over
  });
}

async function runBehavior(behavior, manifestOver = {}, { resume } = {}) {
  const { bin, dir } = await writeFakeAgent();
  const logPath = path.join(dir, "agent.log");
  try {
    const provider = providerFor(bin, manifestOver);
    const events = [];
    const env = { ...process.env, FAKE_ACP_BEHAVIOR: behavior, FAKE_ACP_LOG: logPath };
    const previous = { ...env };
    // The provider spawns the fake agent, which must see the behavior env.
    const withEnv = Object.fromEntries(Object.entries(env));
    const saved = {};
    for (const key of Object.keys(withEnv)) saved[key] = process.env[key];
    Object.assign(process.env, withEnv);
    let outcome;
    try {
      outcome = resume
        ? await provider.resume({ cwd: dir, externalSessionId: "sess-fake", grant: "allow", onEvent: e => events.push(e) })
        : await provider.start({ cwd: dir, prompt: "Investigate the retry window", onEvent: e => events.push(e) });
    } finally {
      for (const key of Object.keys(withEnv)) {
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
      }
    }
    let logText = "";
    try {
      logText = await fs.readFile(logPath, "utf8");
    } catch {
      /* no log */
    }
    return { outcome, events, log: logText, dir };
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

// --- tests ------------------------------------------------------------------

// Wait (up to timeout) for an event matching a predicate — the interactive
// tests must not race the provider's handshake under parallel load.
async function waitForEvent(events, predicate, timeout = 5000) {
  const start = Date.now();
  while (true) {
    const found = events.find(predicate);
    if (found) return found;
    if (Date.now() - start > timeout) throw new Error("timed out waiting for event");
    await new Promise(r => setTimeout(r, 20));
  }
}

async function withInteractiveAgent(behavior, fn, onEvent = () => {}) {
  const { bin, dir } = await writeFakeAgent();
  const logPath = path.join(dir, "agent.log");
  const decisionFile = path.join(dir, "decision.json");
  const previous = { behavior: process.env.FAKE_ACP_BEHAVIOR, log: process.env.FAKE_ACP_LOG };
  process.env.FAKE_ACP_BEHAVIOR = behavior;
  process.env.FAKE_ACP_LOG = logPath;
  const provider = providerFor(bin);
  const events = [];
  const result = provider.start({
    cwd: dir, prompt: "synthetic permission test", permission: { decisionFile },
    onEvent: async event => { events.push(event); await onEvent(event); }
  });
  try {
    await fn({ events, result, logPath, decisionFile });
  } finally {
    provider.cancel();
    await result;
    if (previous.behavior === undefined) delete process.env.FAKE_ACP_BEHAVIOR;
    else process.env.FAKE_ACP_BEHAVIOR = previous.behavior;
    if (previous.log === undefined) delete process.env.FAKE_ACP_LOG;
    else process.env.FAKE_ACP_LOG = previous.log;
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test("ACP: a completed turn maps to ready with the session id, result and progress events", async () => {
  const { outcome, events } = await runBehavior("complete");

  assert.equal(outcome.status, "ready");
  assert.equal(outcome.result, "The root cause is a reset of the retry window.");
  assert.equal(outcome.externalSessionId, "sess-fake"); // session id persists

  // run.started carries the real session id; message chunks become progress.
  const started = events.find(e => e.type === "run.started");
  assert.equal(started.sessionId, "sess-fake");
  assert.deepEqual(
    events.filter(e => e.type === "progress").map(e => e.text),
    ["The root cause is ", "a reset of the retry window."]
  );
  for (const event of events) {
    assert.ok(EVENT_TYPES.includes(event.type), `event ${event.type} is Work vocabulary`);
  }
});

test("ACP: a decision block maps to needs_you/decision via the Work convention", async () => {
  const { outcome } = await runBehavior("decision");
  assert.equal(outcome.status, "needs_you");
  assert.equal(outcome.reason, "decision");
  assert.equal(outcome.blockedOn.type, "decision");
  assert.match(outcome.blockedOn.text, /Which backend/);
  assert.equal(outcome.externalSessionId, "sess-fake");
});

test("ACP: an early stop reason maps to failed", async () => {
  const { outcome } = await runBehavior("max_tokens");
  assert.equal(outcome.status, "failed");
  assert.match(outcome.error, /max_tokens/);
});

test("ACP: the agent exiting before completing maps to failed", async () => {
  const { outcome } = await runBehavior("exit-early");
  assert.equal(outcome.status, "failed");
});

test("ACP: a malformed initialize response fails clearly", async () => {
  const { outcome } = await runBehavior("malformed-init");
  assert.equal(outcome.status, "failed");
  assert.match(outcome.error, /initialize rejected/);
});

test("ACP: a missing session id fails clearly instead of inventing one", async () => {
  const { outcome } = await runBehavior("no-session-id");
  assert.equal(outcome.status, "failed");
  assert.match(outcome.error, /did not return a session id/);
});

test("ACP: permission requests are auto-declined with the explicit deny policy (headless)", async () => {
  const { outcome, events, log } = await runBehavior("permission", { permissions: "deny" });

  // The provider answered with the reject option (never approves silently).
  assert.match(log, /"reject-once"/);
  // The agent continued and the run completed normally.
  assert.equal(outcome.status, "ready");
  assert.equal(outcome.result, "completed after permission exchange");
  // The choice is observable as narration, never as a fake needs_you halt.
  const notice = events.find(e => e.type === "progress" && /permission/.test(e.text ?? ""));
  assert.ok(notice, "permission handling is recorded");
  assert.match(notice.text, /declined by headless policy/);
  assert.ok(!events.some(e => e.type === "needs_user"), "no fake needs_user halt");
});

test("ACP: permission requests are auto-approved with the approve policy", async () => {
  const { outcome, log } = await runBehavior("permission", { permissions: "approve" });
  assert.match(log, /"allow-once"/);
  assert.equal(outcome.status, "ready");
});

test("ACP: one bound decision resolves only one queued permission request", async () => {
  await withInteractiveAgent("two-permissions", async ({ events, result, logPath, decisionFile }) => {
    const first = await waitForEvent(events, e => e.type === "needs_user");
    assert.equal(first.blockedOn.requestId, 100);
    assert.equal(events.filter(e => e.type === "needs_user").length, 1);
    const firstGrant = { grant: "allow", requestId: 100, decisionId: first.blockedOn.decisionId };
    await fs.writeFile(decisionFile, JSON.stringify(firstGrant));
    const second = await waitForEvent(events, e => e.type === "needs_user" && e.blockedOn.requestId === 101);
    assert.equal(second.blockedOn.tool, "Run another command");
    await assert.rejects(fs.access(decisionFile), { code: "ENOENT" });

    const responses = async () => (await fs.readFile(logPath, "utf8")).trim().split("\n")
      .map(JSON.parse).filter(line => line.permissionResponse);
    await new Promise(r => setTimeout(r, 350));
    assert.deepEqual((await responses()).map(line => line.requestId), [100]);
    assert.equal(events.filter(e => e.type === "permission.resolved").length, 1);
    // A delayed decision for the previous request cannot answer the next.
    await fs.writeFile(decisionFile, JSON.stringify(firstGrant));
    await new Promise(r => setTimeout(r, 350));
    assert.deepEqual((await responses()).map(line => line.requestId), [100]);
    await fs.writeFile(decisionFile, JSON.stringify({ grant: "reject", requestId: 101, decisionId: second.blockedOn.decisionId }));
    assert.equal((await result).status, "ready");
    assert.deepEqual((await responses()).map(line => [line.requestId, line.permissionResponse.outcome.optionId]), [
      [100, "allow-once"], [101, "reject-second"]
    ]);
  }, async event => {
    // Keep request publication pending across several polling ticks. A
    // single poll may read/consume it; overlapping async ticks must not.
    if (event.type === "needs_user" && event.blockedOn.requestId === 100) {
      await new Promise(r => setTimeout(r, 650));
    }
    if (event.type === "permission.resolved") await new Promise(r => setTimeout(r, 350));
  });
});

test("ACP: unbound, mismatched, and unknown grants leave the active request pending", async () => {
  await withInteractiveAgent("permission", async ({ events, result, logPath, decisionFile }) => {
    const pause = await waitForEvent(events, e => e.type === "needs_user");
    const decisionId = pause.blockedOn.decisionId;
    for (const decision of [
      { grant: "allow" },
      { grant: "allow", requestId: 100 },
      { grant: "allow", requestId: 999, decisionId },
      { grant: "allow", requestId: "100", decisionId },
      { grant: "unknown", requestId: 100, decisionId }
    ]) {
      await fs.writeFile(decisionFile, JSON.stringify(decision));
      await new Promise(r => setTimeout(r, 300));
      assert.ok(!(await fs.readFile(logPath, "utf8")).includes("permissionResponse"));
      assert.equal(events.filter(e => e.type === "permission.resolved").length, 0);
    }
    await fs.writeFile(decisionFile, JSON.stringify({ grant: "reject", requestId: 100, decisionId }));
    assert.equal((await result).status, "ready");
    assert.match(await fs.readFile(logPath, "utf8"), /"reject-once"/);
  });
});

test("ACP: an allow-only request without a decision channel is cancelled", async () => {
  const { log } = await runBehavior("allow-only");
  const response = log.trim().split("\n").map(JSON.parse).find(line => line.permissionResponse);
  assert.deepEqual(response.permissionResponse, { outcome: { outcome: "cancelled" } });
});

test("ACP: reusing a native RPC id cannot replay a previous occurrence's grant", async () => {
  await withInteractiveAgent("reused-id", async ({ events, result, logPath, decisionFile }) => {
    const first = await waitForEvent(events, e => e.type === "needs_user");
    const firstGrant = JSON.stringify({
      grant: "allow", requestId: first.blockedOn.requestId, decisionId: first.blockedOn.decisionId
    });
    await fs.writeFile(decisionFile, firstGrant);
    const second = await waitForEvent(events, e =>
      e.type === "needs_user" && e.blockedOn.decisionId !== first.blockedOn.decisionId);
    assert.equal(second.blockedOn.requestId, first.blockedOn.requestId);
    assert.notEqual(second.blockedOn.decisionId, first.blockedOn.decisionId);
    await fs.writeFile(decisionFile, firstGrant);
    await new Promise(r => setTimeout(r, 350));
    const responses = async () => (await fs.readFile(logPath, "utf8")).trim().split("\n")
      .map(JSON.parse).filter(line => line.permissionResponse);
    assert.equal((await responses()).length, 1);
    await fs.writeFile(decisionFile, JSON.stringify({
      grant: "reject", requestId: second.blockedOn.requestId, decisionId: second.blockedOn.decisionId
    }));
    assert.equal((await result).status, "ready");
    assert.deepEqual((await responses()).map(line => line.permissionResponse.outcome.optionId), ["allow-once", "reject-reused"]);
  });
});

test("ACP: interactive permission requests pause for the human and answer in place", async () => {
  const { bin, dir } = await writeFakeAgent();
  const logPath = path.join(dir, "agent.log");
  const decisionFile = path.join(dir, "decision.json");
  try {
    const provider = providerFor(bin); // default policy = interactive
    const events = [];
    const saved = {};
    const env = { FAKE_ACP_BEHAVIOR: "permission", FAKE_ACP_LOG: logPath };
    for (const key of Object.keys(env)) saved[key] = process.env[key];
    Object.assign(process.env, env);

    let outcomePromise;
    try {
      outcomePromise = provider.start({
        cwd: dir,
        prompt: "x",
        onEvent: e => events.push(e),
        permission: { decisionFile }
      });
      // The run pauses: needs_user with a LIVE permission request, and no
      // answer sent yet (the fake agent is still waiting).
      const pause = await waitForEvent(events, e => e.type === "needs_user");
      assert.ok(pause, "permission surfaces as needs_user");
      assert.equal(pause.reason, "permission");
      assert.equal(pause.blockedOn.live, true);
      assert.equal(pause.blockedOn.type, "permission");
      assert.equal(pause.blockedOn.tool, "Edit file");
      assert.equal(pause.blockedOn.canAllow, true);
      assert.equal(pause.blockedOn.canReject, true);
      assert.deepEqual(
        pause.blockedOn.options.map(o => o.kind),
        ["allow_once", "allow_always", "reject_once"]
      );
      // The fake agent has NOT received a response yet.
      let logText = await fs.readFile(logPath, "utf8");
      assert.ok(!logText.includes("permissionResponse"), "no response before the human decides");

      // The human ALLOWS; the SAME run continues and completes.
      await fs.writeFile(decisionFile, JSON.stringify({ grant: "allow", requestId: pause.blockedOn.requestId, decisionId: pause.blockedOn.decisionId, at: new Date().toISOString() }));
      const outcome = await outcomePromise;
      logText = await fs.readFile(logPath, "utf8");
      assert.match(logText, /"allow-once"/); // answered with the allow option
      assert.equal(outcome.status, "ready");
      assert.equal(outcome.externalSessionId, "sess-fake"); // same session
      const resolved = events.find(e => e.type === "permission.resolved");
      assert.equal(resolved.grant, "allow");
    } finally {
      for (const key of Object.keys(env)) {
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
      }
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("ACP: interactive reject answers with the reject option and the run continues", async () => {
  const { bin, dir } = await writeFakeAgent();
  const logPath = path.join(dir, "agent.log");
  const decisionFile = path.join(dir, "decision.json");
  try {
    const provider = providerFor(bin);
    const events = [];
    const saved = {};
    const env = { FAKE_ACP_BEHAVIOR: "permission", FAKE_ACP_LOG: logPath };
    for (const key of Object.keys(env)) saved[key] = process.env[key];
    Object.assign(process.env, env);
    try {
      const outcomePromise = provider.start({
        cwd: dir,
        prompt: "x",
        onEvent: e => events.push(e),
        permission: { decisionFile }
      });
      const pause = await waitForEvent(events, e => e.type === "needs_user");
      await fs.writeFile(decisionFile, JSON.stringify({ grant: "reject", requestId: pause.blockedOn.requestId, decisionId: pause.blockedOn.decisionId }));
      const outcome = await outcomePromise;
      const logText = await fs.readFile(logPath, "utf8");
      assert.match(logText, /"reject-once"/);
      assert.equal(outcome.status, "ready");
      const resolved = events.find(e => e.type === "permission.resolved");
      assert.equal(resolved.grant, "reject");
    } finally {
      for (const key of Object.keys(env)) {
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
      }
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("ACP: interactive ambiguous options are never guessed — only mappable actions are offered", async () => {
  const { bin, dir } = await writeFakeAgent();
  const logPath = path.join(dir, "agent.log");
  const decisionFile = path.join(dir, "decision.json");
  try {
    const provider = providerFor(bin);
    const events = [];
    const saved = {};
    const env = { FAKE_ACP_BEHAVIOR: "permission", FAKE_ACP_LOG: logPath };
    for (const key of Object.keys(env)) saved[key] = process.env[key];
    Object.assign(process.env, env);
    try {
      const outcomePromise = provider.start({
        cwd: dir,
        prompt: "x",
        onEvent: e => events.push(e),
        permission: { decisionFile }
      });
      const pause = await waitForEvent(events, e => e.type === "needs_user");
      assert.equal(pause.blockedOn.canAllow, true);
      assert.equal(pause.blockedOn.canReject, true);
      // No auto-answer happened while the human decides.
      let logText = await fs.readFile(logPath, "utf8");
      assert.ok(!logText.includes("permissionResponse"));
      // REJECT with no reject option present is impossible — the agent here
      // offers one, but the persistence keeps the raw options for inspection.
      assert.ok(pause.blockedOn.options.length >= 2);
      await fs.writeFile(decisionFile, JSON.stringify({ grant: "allow", requestId: pause.blockedOn.requestId, decisionId: pause.blockedOn.decisionId }));
      await outcomePromise;
    } finally {
      for (const key of Object.keys(env)) {
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
      }
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("ACP: the agent dying while an interactive permission waits fails the run", async () => {
  const { bin, dir } = await writeFakeAgent();
  const logPath = path.join(dir, "agent.log");
  const decisionFile = path.join(dir, "decision.json");
  try {
    const provider = providerFor(bin);
    const events = [];
    const saved = {};
    const env = { FAKE_ACP_BEHAVIOR: "die-on-permission", FAKE_ACP_LOG: logPath };
    for (const key of Object.keys(env)) saved[key] = process.env[key];
    Object.assign(process.env, env);
    try {
      const outcomePromise = provider.start({
        cwd: dir,
        prompt: "x",
        onEvent: e => events.push(e),
        permission: { decisionFile }
      });
      // The permission request surfaces, then the agent process dies while
      // the human is still deciding — the run must fail, not hang forever.
      const outcome = await outcomePromise;
      assert.equal(outcome.status, "failed");
      assert.match(outcome.error, /exited/);
    } finally {
      for (const key of Object.keys(env)) {
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
      }
    }
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("ACP: resume loads the session and prompts it", async () => {
  const { outcome, log } = await runBehavior("complete", {}, { resume: true });
  assert.equal(outcome.status, "ready");
  assert.equal(outcome.externalSessionId, "sess-fake");
  assert.match(log, /session\/load/);
  assert.match(log, /"sessionId":"sess-fake"/);
});

test("ACP: resume fails clearly when the agent lacks the loadSession capability", async () => {
  const { outcome } = await runBehavior("complete", {}, { resume: true });
  assert.equal(outcome.status, "ready"); // (loadSession advertised here)
  const unsupported = await runBehavior("load-unsupported", {}, { resume: true });
  assert.equal(unsupported.outcome.status, "failed");
  assert.match(unsupported.outcome.error, /loadSession/);
});

test("ACP: unknown notifications and non-mappable updates never break the run", async () => {
  const { outcome, events } = await runBehavior("notifications");
  assert.equal(outcome.status, "ready");
  // A structured tool_call with locations IS reported (honestly).
  const tool = events.find(e => e.type === "tool.started");
  assert.ok(tool, "tool_call update maps to a tool event");
  assert.equal(tool.name, "Grep");
});

test("ACP: cancel sends session/cancel and the run ends failed", async () => {
  const { bin, dir } = await writeFakeAgent();
  const logPath = path.join(dir, "agent.log");
  try {
    const provider = providerFor(bin);
    const events = [];
    const saved = {};
    const env = { FAKE_ACP_BEHAVIOR: "hang", FAKE_ACP_LOG: logPath };
    for (const key of Object.keys(env)) saved[key] = process.env[key];
    Object.assign(process.env, env);
    let outcome;
    try {
      const run = provider.start({ cwd: dir, prompt: "x", onEvent: e => events.push(e) });
      // Wait for the session to actually exist before cancelling — a fixed
      // sleep races the handshake under load and would cancel with no
      // session id (and no cancel to assert on).
      await waitForEvent(events, e => e.type === "run.started");
      provider.cancel();
      outcome = await run;
    } finally {
      for (const key of Object.keys(env)) {
        if (saved[key] === undefined) delete process.env[key];
        else process.env[key] = saved[key];
      }
    }
    const logText = await fs.readFile(logPath, "utf8");
    assert.match(logText, /"cancel"/);
    assert.match(logText, /"sessionId":"sess-fake"/);
    assert.equal(outcome.status, "failed");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
