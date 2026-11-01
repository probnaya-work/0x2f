// All requests target loopback. The private source is an address already
// assigned to this Mac; task reads/actions are synthetic in-memory stubs.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
const repo = fileURLToPath(new URL("../../../../../", import.meta.url));
const src = path.join(repo, "src");
const { detectLanAddress } = await import(pathToFileURL(path.join(src, "relay/lan.mjs")));
const { createRuntime } = await import(pathToFileURL(path.join(src, "runtime.mjs")));
const { startServer: fixedStartServer } = await import(pathToFileURL(path.join(src, "server.mjs")));
const localAddress = detectLanAddress();
if (!localAddress) throw new Error("No assigned private address for the loopback TCP source.");
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "0x2f-host-repro-"));
try {
  let original = execFileSync("git", ["show", "809e3ab158a7304c9e07e9c6d95ce30542987460:src/server.mjs"], {
    cwd: repo, encoding: "utf8"
  });
  original = original.replace(/from "(\.\/[^\"]+)"/g, (_, specifier) =>
    `from ${JSON.stringify(pathToFileURL(path.resolve(src, specifier)).href)}`);
  original = original.replace('new URL("./" + name, import.meta.url)',
    `new URL(name, ${JSON.stringify(pathToFileURL(src + path.sep).href)})`);
  const baselineFile = path.join(tmp, "baseline-server.mjs");
  await fs.writeFile(baselineFile, original);
  const { startServer: baselineStartServer } = await import(pathToFileURL(baselineFile));
  function request(port, pathname, { cookie, method = "GET", body } = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request({
        host: "127.0.0.1", port, localAddress, path: pathname, method, agent: false,
        headers: {
          host: `127.0.0.1:${port}`,
          ...(cookie ? { cookie } : {}),
          ...(body ? { "content-type": "application/json" } : {})
        }
      }, res => {
        let text = "";
        res.on("data", chunk => { text += chunk; });
        res.on("end", () => resolve({
          status: res.statusCode, cookie: res.headers["set-cookie"]?.[0]?.split(";")[0], body: text
        }));
      });
      req.on("error", reject);
      req.end(body);
    });
  }
  for (const [label, start] of [["baseline", baselineStartServer], ["fixed", fixedStartServer]]) {
    const base = path.join(tmp, label);
    await fs.mkdir(path.join(base, ".work"), { recursive: true });
    await fs.writeFile(path.join(base, ".work", "relay.json"), JSON.stringify({ enabled: true, transport: "lan" }));
    const runtime = createRuntime(base);
    let executed = 0;
    runtime.actions.listWork = async () => [{ brief: "private task sentinel" }];
    runtime.actions.createWork = async () => { executed++; return { id: 1 }; };
    const handle = await start(base, 0, { lan: true, runtime, relayLog: { log() {}, warn() {}, error() {} } });
    try {
      const shell = await request(handle.port, "/");
      const tasks = await request(handle.port, "/api/tasks", { cookie: shell.cookie });
      const mutation = await request(handle.port, "/api/tasks", {
        cookie: shell.cookie, method: "POST", body: JSON.stringify({ brief: "synthetic action" })
      });
      console.log(JSON.stringify({
        label, destination: "loopback", actualPrivateTcpSource: true,
        shell: shell.status, credentialIssued: Boolean(shell.cookie), tasks: tasks.status,
        privateTaskDisclosed: tasks.body.includes("private task sentinel"),
        mutation: mutation.status, actionInvoked: executed
      }));
    } finally { await handle.close(); }
  }
} finally { await fs.rm(tmp, { recursive: true, force: true }); }
