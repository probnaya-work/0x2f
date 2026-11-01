import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createStore } from "../src/core/store.mjs";

const exec = promisify(execFile);
const cli = fileURLToPath(new URL("../src/cli.mjs", import.meta.url));

test("incomplete selectors refuse before creating work, rerunning, pairing or launching UI", async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "work-flags-"));
  try {
    await exec(process.execPath, [cli, "init"], { cwd: base });
    const store = createStore(base);
    for (const args of [
      ["new", "Task", "--provider"], ["new", "Task", "--provider="],
      ["new", "Task", "--provider", "--no-browser"],
      ["rerun", "1", "--provider"], ["pair", "--relay"],
      ["pair", "--client="], ["ui", "--port"], ["open", "1", "--run"]
    ]) {
      await assert.rejects(exec(process.execPath, [cli, ...args], { cwd: base }), error => {
        assert.match(error.stderr, /requires a value|Usage: 2f open/);
        return true;
      });
      assert.equal((await store.listTasks()).length, 0);
    }
    await assert.rejects(fs.access(path.join(base, ".work", "relay.json")));
    await assert.rejects(fs.access(path.join(base, ".work", "ui.log")));
  } finally {
    await fs.rm(base, { recursive: true, force: true });
  }
});
