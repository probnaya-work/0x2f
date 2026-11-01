// Independent admission challenge: a stale worker must publish nothing and
// must not erase the current execution's permission channel.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
const repo = fileURLToPath(new URL("../../../../../", import.meta.url));
const { createStore } = await import(pathToFileURL(path.join(repo, "src/core/store.mjs")));
const { makeRunRecord } = await import(pathToFileURL(path.join(repo, "src/core/runs.mjs")));
const exec = promisify(execFile);
const present = p => fs.access(p).then(() => true, () => false);
for (const scenario of ["reserved-by-another-pid", "superseded-run"]) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "0x2f-worker-admission-"));
  try {
    const store = createStore(base);
    const manifests = path.join(base, ".work", "providers");
    await fs.mkdir(manifests, { recursive: true });
    const agent = path.join(base, "local-fixture.mjs");
    await fs.writeFile(agent, 'import fs from "node:fs";fs.writeFileSync("provider-invoked", "");process.stdout.write("Synthetic result");');
    await fs.writeFile(path.join(manifests, "fixture.json"), JSON.stringify({
      id: "fixture", displayName: "Local fixture", transport: "command",
      command: [process.execPath, agent, "{prompt}"]
    }));
    const runs = [makeRunRecord({ run: 1, provider: "fixture", startedAt: new Date().toISOString() })];
    if (scenario === "superseded-run") runs.push(makeRunRecord({ run: 2, provider: "fixture", startedAt: new Date().toISOString() }));
    const task = await store.createTask({ title: "Synthetic task", brief: "Synthetic task", prompt: "Synthetic" }, {
      provider: "fixture", runs, ...(scenario === "reserved-by-another-pid" ? { pid: process.pid } : {})
    });
    const meta = path.join(store.taskDir(task.slug), "task.json");
    const permission = path.join(store.taskDir(task.slug), "permission.json");
    const initialState = await fs.readFile(meta, "utf8");
    const decision = JSON.stringify({ grant: "allow", requestId: 100, decisionId: "current-execution-sentinel" });
    await fs.writeFile(permission, decision);
    const result = await exec(process.execPath, [path.join(repo, "src/worker.mjs"), base, task.slug, "1"]);
    const observed = {
      scenario,
      skipped: result.stdout.includes("skipped"),
      stateUnchanged: (await fs.readFile(meta, "utf8")) === initialState,
      permissionUnchanged: (await fs.readFile(permission, "utf8")) === decision,
      providerInvoked: await present(path.join(base, "provider-invoked")),
      eventsWritten: Boolean((await store.readEventLog(task.slug)).trim()),
      resultWritten: await present(path.join(store.taskDir(task.slug), "result.md"))
    };
    console.log(JSON.stringify(observed));
    if (!observed.skipped || !observed.stateUnchanged || !observed.permissionUnchanged ||
      observed.providerInvoked || observed.eventsWritten || observed.resultWritten) {
      throw new Error(`Worker admitted a stale execution: ${scenario}`);
    }
  } finally { await fs.rm(base, { recursive: true, force: true }); }
}
