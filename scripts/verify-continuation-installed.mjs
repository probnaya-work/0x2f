// Verify the packed product through its installed CLI, TUI and worker.
// Deterministic agents, scratch state, no model account or network required.
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { makeWorkspace, startTui, waitForTask, waitForTaskState } from "../test/tui-pty/driver.mjs";

const root = process.argv[2] === "--package-root" && process.argv[3];
if (!root || process.argv.length !== 4) throw new Error("Usage: node scripts/verify-continuation-installed.mjs --package-root <installed 0x2f directory>");
const packageRoot = await fs.realpath(root);
const { createRuntime } = await import(pathToFileURL(path.join(packageRoot, "src/runtime.mjs")));
const cli = path.join(packageRoot, "src/cli.mjs");
const fixture = await makeWorkspace({ providerRoles: { alpha: "investigation", beta: "succeed" } });
const base = await fs.realpath(fixture.base);
const rt = createRuntime(base);
let session;
try {
  const task = await rt.actions.createWork({ brief: "Installed artifact continuation smoke." });
  await waitForTask(base, task.id, "ready");
  session = await startTui({ workspace: base, cli, cols: 80, rows: 24 });
  await session.waitForText(/ACCEPT/);
  session.press("x"); session.type("Installed draft must survive cancel."); session.press("enter");
  await session.waitForText(/CONTINUATION PREVIEW/);
  assert.equal((await rt.store.findTask(task.id)).runs.length, 1);
  session.press("escape"); await session.waitForText(/Installed draft must survive cancel/);
  session.press("escape");
  await session.waitFor(() => !/Installed draft must survive cancel/.test(session.text()) && /ACCEPT/.test(session.text()), { label: "task after cancelling the editor" });
  session.press("q"); await session.waitForExit();

  const reviewed = await rt.actions.previewRerunWork(task.id, { provider: "beta" });
  const exec = promisify(execFile);
  const { stdout } = await exec(process.execPath, [cli, "preview", String(task.id), "--provider", "beta"], { cwd: base });
  assert.ok(stdout.includes(reviewed.previewId));
  assert.ok(stdout.includes(reviewed.prompt));
  await exec(process.execPath, [cli, "rerun", String(task.id), "--provider", "beta", "--preview", reviewed.previewId], { cwd: base });
  const ready = await waitForTaskState(base, task.id, t => t.runs.length === 2 && t.status === "ready");
  assert.equal(await rt.store.readRunPrompt(ready, 2), reviewed.prompt);
  assert.equal(ready.context?.notes?.length ?? 0, 0, "the cancelled draft was not saved");
  assert.equal(ready.execution.provider, "beta");
  // READY can precede final worker writes. Drain before removing scratch state.
  await rt.actions.previewRerunWork(task.id);
  console.log(JSON.stringify({ installedPackage: true, tuiPreviewAndCancel: true, cliGuardedStart: true,
    exactPrompt: true, provider: "beta", promptSha256: reviewed.context.sha256, noCancelledDraftSaved: true }));
} finally {
  session?.kill();
  await fs.rm(fixture.base, { recursive: true, force: true });
}
