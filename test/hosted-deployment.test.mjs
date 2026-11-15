// A custom fixture server can hide broken static-host rewrites. Exercise the
// shipped Caddyfile, built assets and actual encrypted transport through Caddy.
// Optional external tool: CADDY_BIN=/path/to/caddy node --test this-file.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { buildClient, CLIENT_ASSETS } from "../deploy/client/build.mjs";
import { createRelayServer } from "../relay/server.mjs";
import { createRelayAgent } from "../src/relay/agent.mjs";
import { createRuntime } from "../src/runtime.mjs";
import { createTailer } from "../src/core/events.mjs";
import { createRemoteClient } from "../src/web/remote.mjs";
import { pairPhone } from "./e2e-phone.mjs";

const caddy = process.env.CADDY_BIN || "caddy";
const available = spawnSync(caddy, ["version"], { encoding: "utf8" });
const quiet = { log() {}, warn() {}, error() {} };

async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function waitFor(fn) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (await fn()) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error("Timed out waiting for the deployment fixture");
}

test("shipped Caddy deployment serves pairing and modules, then proxies encrypted commands and SSE", {
  skip: available.status !== 0 && !process.env.CADDY_BIN ? "Caddy not installed; set CADDY_BIN to run the deployment integration" : false,
  timeout: 30_000
}, async t => {
  assert.equal(available.status, 0, available.error?.message || available.stderr);
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "0x2f-caddy-"));
  let child, agent, relay, stream, tailer;
  const controller = new AbortController();
  let output = "";
  t.after(async () => {
    controller.abort();
    await stream?.catch(() => {});
    tailer?.stop();
    await agent?.stop();
    if (child && child.exitCode === null) {
      const exited = once(child, "exit");
      child.kill("SIGTERM");
      await exited;
    }
    await relay?.close();
    await fs.rm(base, { recursive: true, force: true });
  });
  const out = await buildClient(path.join(base, "client"));
  relay = await createRelayServer({ dataFile: path.join(base, "state.json"), log: quiet }).start();
  const clientPort = await freePort();
  let relayPort;
  do { relayPort = await freePort(); } while (relayPort === clientPort);
  const clientUrl = `http://127.0.0.1:${clientPort}`;
  const relayUrl = `http://127.0.0.1:${relayPort}`;
  const template = await fs.readFile(new URL("../deploy/Caddyfile", import.meta.url), "utf8");
  const config = "{\n admin off\n auto_https off\n}\n" + template
    .replace("app.0x2f.dev {", `${clientUrl} {`)
    .replace("relay.0x2f.dev {", `${relayUrl} {`)
    .replace("/srv/0x2f/client", JSON.stringify(out))
    .replace("127.0.0.1:8080", `127.0.0.1:${relay.port}`);
  const configPath = path.join(base, "Caddyfile");
  await fs.writeFile(configPath, config);
  child = spawn(caddy, ["run", "--config", configPath, "--adapter", "caddyfile"], {
    env: { ...process.env, XDG_CONFIG_HOME: base, XDG_DATA_HOME: base }, stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.on("data", chunk => { output += chunk; });
  child.stderr.on("data", chunk => { output += chunk; });
  await waitFor(async () => {
    assert.equal(child.exitCode, null, output);
    return fetch(clientUrl).then(r => r.ok).catch(() => false);
  });
  for (const [source, route, mime] of CLIENT_ASSETS) {
    const suffix = route === "/pair" ? "?token=synthetic&relay=https%3A%2F%2Frelay.example" : "";
    const response = await fetch(clientUrl + route + suffix, { redirect: "error" });
    assert.equal(response.status, 200, route);
    assert.equal(response.headers.get("content-type"), mime, route);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("referrer-policy"), "no-referrer");
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), await fs.readFile(new URL("../" + source, import.meta.url)), route);
  }
  assert.equal((await fetch(clientUrl + "/api/tasks")).status, 404);
  assert.equal((await fetch(relayUrl + "/pair")).status, 401);
  const preflight = await fetch(relayUrl + "/api/pair/claim", { method: "OPTIONS", headers: { origin: clientUrl } });
  assert.equal(preflight.headers.get("access-control-allow-origin"), "*");

  const deviceId = crypto.randomUUID(), token = crypto.randomUUID(), code = "ABCDE12345FGHJ";
  const configFile = path.join(base, ".work", "relay.json");
  await fs.mkdir(path.dirname(configFile), { recursive: true });
  await fs.writeFile(configFile, JSON.stringify({ url: relayUrl, enabled: true, deviceId, deviceSecret: crypto.randomUUID(), token,
    tokenExpiresAt: new Date(Date.now() + 600_000).toISOString(), code, pairing: "pending" }), { mode: 0o600 });
  // Synthetic execution isolates the deployment contract from model accounts.
  const node = { id: "fixture", resolveWorkspace: () => base, async startExecution() { return null; } };
  const runtime = createRuntime(base, { node });
  tailer = createTailer({ interval: 20, emit: event => runtime.events.emit(event), readLines: async () => {
    const tasks = await runtime.store.listTasks();
    return Promise.all(tasks.map(async task => ({ slug: task.slug,
      text: await fs.readFile(path.join(runtime.store.taskDir(task.slug), "events.jsonl"), "utf8").catch(() => "") })));
  } });
  tailer.start();
  agent = createRelayAgent({ runtime, configPath: configFile, log: quiet, configPollMs: 30 });
  agent.start();
  try { await waitFor(() => relay.state.devices.get(deviceId)?.online); }
  catch (error) { throw new Error(`${error.message}: ${JSON.stringify(agent.status())}\n${output}`); }
  const phone = await pairPhone({ relayUrl, token, deviceId, code });
  const client = await createRemoteClient({ relayUrl, session: phone.session, phoneId: phone.phoneId, deviceId, key: phone.keyB64 });
  let opened;
  const subscribed = new Promise(resolve => { opened = resolve; });
  const received = [];
  stream = client.events(event => received.push(event), { signal: controller.signal, onOpen: opened });
  await subscribed;
  const task = await client.api("/api/tasks", { method: "POST", body: JSON.stringify({ brief: "Caddy deployment fixture" }) });
  await waitFor(() => received.some(e => e.cmd === "event" && e.event?.taskId === task.id));
  assert.equal((await runtime.store.findTask(task.id)).title, "Caddy deployment fixture");
  assert.ok((await client.snapshot()).tasks.some(t => t.id === task.id));
});
