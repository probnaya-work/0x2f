// Local POSIX workers lead their own process group. A dead worker does not
// prove its provider exited; admission must inspect the recorded group too.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRuntime } from "../src/runtime.mjs";
import { pidAlive, processGroupAlive, recoverInterruptedRuns } from "../src/recover.mjs";

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function waitFor(fn, label) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const value = await fn();
    if (value) return value;
    await delay(10);
  }
  throw new Error(`timed out waiting for ${label}`);
}

function stop(pid, signal = "SIGTERM") {
  if (!Number.isInteger(pid) || pid <= 0 || pid === process.pid) return;
  try { process.kill(pid, signal); } catch { /* fixture already exited */ }
}

async function cleanup(workers, providers, readProviders = async () => {}) {
  for (const pid of workers) stop(pid);
  await delay(200);
  // A fixture provider may have started just before its worker stopped.
  await readProviders();
  for (const pid of providers) stop(pid);
  await delay(100);
  for (const pid of [...workers, ...providers]) if (pidAlive(pid)) stop(pid, "SIGKILL");
  await waitFor(() => [...workers, ...providers].every(pid => !pidAlive(pid)), "fixture process cleanup");
}

test("recovery refuses a rerun while an orphan command still writes, then allows it after the group exits", {
  skip: process.platform === "win32" ? "POSIX process-group qualification" : false
}, async t => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "work-orphan-process-"));
  const workers = new Set();
  const providers = new Set();
  const pidFile = path.join(base, "provider-pids.jsonl");
  const readProviders = async () => {
    const text = await fs.readFile(pidFile, "utf8").catch(() => "");
    for (const line of text.split("\n")) {
      const pid = Number(line);
      if (Number.isInteger(pid) && pid > 0) providers.add(pid);
    }
    return [...providers];
  };
  const heartbeat = async pid => Number(await fs.readFile(path.join(base, `heartbeat-${pid}`), "utf8").catch(() => "0"));
  t.after(async () => {
    await cleanup(workers, providers, readProviders);
    await fs.rm(base, { recursive: true, force: true });
  });

  const agent = path.join(base, "heartbeat-agent.mjs");
  await fs.writeFile(agent, `import fs from "node:fs";
fs.appendFileSync("provider-pids.jsonl", String(process.pid) + "\\n");
let counter = 0;
setInterval(() => fs.writeFileSync("heartbeat-" + process.pid, String(++counter)), 20);
`);
  await fs.mkdir(path.join(base, ".work", "providers"), { recursive: true });
  await fs.writeFile(path.join(base, ".work", "providers", "heartbeat.json"), JSON.stringify({
    id: "heartbeat", displayName: "Local heartbeat fixture", transport: "command",
    command: [process.execPath, agent, "{prompt}"]
  }));
  const runtime = createRuntime(base);
  const first = await runtime.actions.createWork({ brief: "Orphan process ownership", provider: "heartbeat" });
  workers.add(first.pid);
  assert.equal(first.processGroupId, first.pid);
  const firstProvider = await waitFor(async () => (await readProviders())[0], "first fixture provider");
  await waitFor(async () => await heartbeat(firstProvider) >= 2, "first heartbeat");
  stop(first.pid, "SIGKILL");
  await waitFor(() => !pidAlive(first.pid), "worker death");
  const before = await heartbeat(firstProvider);
  await waitFor(async () => await heartbeat(firstProvider) > before, "orphan heartbeat after worker death");
  assert.equal(processGroupAlive(first.processGroupId), true);

  const recovered = await recoverInterruptedRuns(base, { log() {} });
  assert.equal(recovered.length, 1);
  const failed = await runtime.store.findTask(first.id);
  assert.equal(failed.status, "failed");
  assert.equal(failed.failure.kind, "crashed");
  assert.equal(failed.processGroupId, first.processGroupId, "recovery must preserve process ownership evidence");
  let admitted;
  await assert.rejects(async () => {
    admitted = await runtime.actions.rerunWork(first.id);
    workers.add(admitted.pid);
  }, error => error.status === 409 && /process group/.test(error.message));
  assert.equal(admitted, undefined);
  await delay(100);
  assert.deepEqual(await readProviders(), [firstProvider], "refusal must not start another fixture provider");
  assert.equal((await runtime.store.findTask(first.id)).runs.length, 1);

  // Stop only the fixture PID we directly observed, never a saved group ID.
  stop(firstProvider);
  await waitFor(() => !pidAlive(firstProvider) && !processGroupAlive(first.processGroupId), "old execution group exit");
  const second = await runtime.actions.rerunWork(first.id);
  workers.add(second.pid);
  assert.equal(second.processGroupId, second.pid);
  assert.equal(second.runs.at(-1).run, 2);
  const secondProvider = await waitFor(async () => (await readProviders()).find(pid => pid !== firstProvider), "second fixture provider");
  await waitFor(async () => await heartbeat(secondProvider) >= 2, "second heartbeat");
  assert.equal(pidAlive(firstProvider), false);
  assert.equal(pidAlive(secondProvider), true);
});

test("a terminal worker can drain its POSIX group before normal rerun admission", {
  skip: process.platform === "win32" ? "POSIX process-group qualification" : false
}, async t => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "work-process-drain-"));
  const workers = new Set();
  t.after(async () => {
    await cleanup(workers, new Set());
    await fs.rm(base, { recursive: true, force: true });
  });
  const drainWorker = path.join(base, "drain-worker.mjs");
  await fs.writeFile(drainWorker, `import fs from "node:fs";
const release = process.argv[2];
fs.writeFileSync(release + ".started", "");
const timer = setInterval(() => {
  if (!fs.existsSync(release)) return;
  clearInterval(timer);
  setTimeout(() => process.exit(0), 80);
}, 5);
`);
  let launches = 0;
  const node = { id: "local", async startExecution() {
    if (launches > 0) {
      const previousPid = [...workers].at(-1);
      assert.equal(pidAlive(previousPid), false, "old worker must exit before the next launch");
      assert.equal(processGroupAlive(previousPid), false, "old group must exit before the next launch");
    }
    const release = path.join(base, `release-${++launches}`);
    const child = spawn(process.execPath, [drainWorker, release], { detached: true, stdio: "ignore" });
    await new Promise((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
    child.unref();
    workers.add(child.pid);
    return child.pid;
  } };
  const runtime = createRuntime(base, { node, providers: [{
    id: "drain-fixture", displayName: "Local drain fixture", integrationType: "command",
    command: [process.execPath], capabilities: {},
    async start() { throw new Error("the injected node owns this fixture execution"); }
  }] });
  const first = await runtime.actions.createWork({ brief: "Normal terminal worker drain", provider: "drain-fixture" });
  await waitFor(() => fs.access(path.join(base, "release-1.started")).then(() => true, () => false), "drain fixture startup");
  // Simulate the small interval between final state publication and worker
  // exit using a real, owned POSIX process group with a bounded drain time.
  await runtime.store.updateTask({ ...first, status: "ready", runs: first.runs.map(run => ({ ...run, outcome: "ready" })) });
  await fs.writeFile(path.join(base, "release-1"), "");
  const second = await runtime.actions.rerunWork(first.id);
  assert.equal(pidAlive(first.pid), false);
  assert.equal(processGroupAlive(first.processGroupId), false);
  assert.equal(second.runs.at(-1).run, 2);
  assert.equal(launches, 2);
});

test("a saved-session permission cannot resume while the previous group still owns a descendant", {
  skip: process.platform === "win32" ? "POSIX process-group qualification" : false
}, async t => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "work-orphan-resume-"));
  const workers = new Set();
  const providers = new Set();
  const previousBin = process.env.CLAUDE_BIN;
  const readProviders = async () => {
    const text = await fs.readFile(path.join(base, "provider-pids.jsonl"), "utf8").catch(() => "");
    for (const line of text.split("\n")) {
      const pid = Number(line);
      if (Number.isInteger(pid) && pid > 0) providers.add(pid);
    }
    return [...providers];
  };
  t.after(async () => {
    try {
      await cleanup(workers, providers, readProviders);
      await fs.rm(base, { recursive: true, force: true });
    } finally {
      if (previousBin === undefined) delete process.env.CLAUDE_BIN;
      else process.env.CLAUDE_BIN = previousBin;
    }
  });
  const heartbeat = path.join(base, "heartbeat.mjs");
  await fs.writeFile(heartbeat, `import fs from "node:fs";
fs.appendFileSync("provider-pids.jsonl", String(process.pid) + "\\n");
setInterval(() => fs.writeFileSync("heartbeat-" + process.pid, String(Date.now())), 20);
`);
  const bin = path.join(base, "fake-claude.mjs");
  await fs.writeFile(bin, `#!/usr/bin/env node
import { spawn } from "node:child_process";
const child = spawn(process.execPath, [${JSON.stringify(heartbeat)}], { stdio: "ignore" });
child.unref();
const resumed = process.argv.includes("--resume");
for (const event of [
  { type: "system", subtype: "init", session_id: "local-fixture-session" },
  { type: "result", is_error: false, session_id: "local-fixture-session",
    result: resumed ? "Local fixture resumed" : "",
    ...(resumed ? {} : { permission_denials: [{ tool_name: "Edit", tool_input: { file_path: "fixture.txt" } }] }) }
]) process.stdout.write(JSON.stringify(event) + "\\n");
`);
  await fs.chmod(bin, 0o755);
  process.env.CLAUDE_BIN = bin;
  const runtime = createRuntime(base);
  const first = await runtime.actions.createWork({ brief: "Saved local fixture permission", provider: "claude-code" });
  workers.add(first.pid);
  const paused = await waitFor(async () => {
    const task = await runtime.store.findTask(first.id);
    return task.status === "needs_you" && task;
  }, "saved-session permission");
  assert.equal(paused.blockedOn.type, "permission");
  assert.notEqual(paused.blockedOn.live, true);
  const firstProvider = await waitFor(async () => (await readProviders())[0], "old fixture descendant");
  await waitFor(() => !pidAlive(first.pid), "old permission worker exit");
  assert.equal(processGroupAlive(paused.processGroupId), true);
  await assert.rejects(async () => {
    const unexpected = await runtime.actions.allowWork(first.id);
    workers.add(unexpected.pid);
  }, error => error.status === 409 && /process group/.test(error.message));
  await delay(100);
  assert.deepEqual(await readProviders(), [firstProvider], "refused resume must not spawn another session");
  assert.equal((await runtime.store.findTask(first.id)).status, "needs_you");

  stop(firstProvider);
  await waitFor(() => !pidAlive(firstProvider) && !processGroupAlive(paused.processGroupId), "old permission group exit");
  const resumed = await runtime.actions.allowWork(first.id);
  workers.add(resumed.pid);
  const secondProvider = await waitFor(async () => (await readProviders()).find(pid => pid !== firstProvider), "resumed fixture descendant");
  assert.equal(pidAlive(firstProvider), false);
  assert.equal(pidAlive(secondProvider), true);
  assert.equal(resumed.execution.attempts, 2);
  assert.equal(resumed.processGroupId, resumed.pid);
});
