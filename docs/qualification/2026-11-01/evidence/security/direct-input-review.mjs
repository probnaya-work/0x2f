// Local API field validation with a synthetic execution node. No provider
// process is started, even if a malformed model incorrectly gets accepted.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const repo = fileURLToPath(new URL("../../../../../", import.meta.url));
const { createRuntime } = await import(pathToFileURL(path.join(repo, "src/runtime.mjs")));
const { startServer } = await import(pathToFileURL(path.join(repo, "src/server.mjs")));
const base = await fs.mkdtemp(path.join(os.tmpdir(), "0x2f-input-review-"));
let launches = 0;
const node = {
  id: "fake", resolveWorkspace: () => base,
  startExecution: async () => { launches++; return process.pid; },
  resumeExecution: async () => process.pid
};
const runtime = createRuntime(base, { node });
const noteTask = await runtime.store.createTask({ title: "fixture", prompt: "fixture" });
const decisionTask = await runtime.store.createTask({ title: "decision fixture", prompt: "fixture" });
await runtime.store.updateTask({ ...decisionTask, status: "needs_you", blockedOn: { type: "decision", text: "synthetic" } });
const handle = await startServer(base, 0, { runtime, authToken: "synthetic-token" });
const rows = [];
try {
  for (const [label, payload, route] of [
    ["object brief", { brief: {} }, "/api/tasks"],
    ["number brief", { brief: 1 }, "/api/tasks"],
    ["object provider", { brief: "synthetic", provider: {} }, "/api/tasks"],
    ["object model", { brief: "synthetic", model: {} }, "/api/tasks"],
    ["object note", { note: {} }, `/api/tasks/${noteTask.id}/note`],
    ["object answer", { answer: {} }, `/api/tasks/${decisionTask.id}/answer`]
  ]) {
    const res = await fetch(handle.url + route, {
      method: "POST", headers: { "content-type": "application/json", "x-0x2f-auth": "synthetic-token" },
      body: JSON.stringify(payload)
    });
    const body = await res.json();
    rows.push({ label, status: res.status, error: body.error ?? null });
  }
  console.log(JSON.stringify({ rows, syntheticActionLaunches: launches }, null, 2));
  if (rows.some(row => row.status !== 400) || launches !== 0) throw new Error("Malformed input was not refused before execution.");
} finally { await handle.close(); await fs.rm(base, { recursive: true, force: true }); }
