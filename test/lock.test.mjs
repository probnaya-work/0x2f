import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fork } from "node:child_process";
import { once } from "node:events";
import { withFileLock } from "../src/core/lock.mjs";

test("contenders serialize, release on throw, and recover a killed owner", async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "work-lock-"));
  const lock = path.join(base, "mutex");
  let child;
  try {
    let active = 0;
    let maxActive = 0;
    await Promise.all(Array.from({ length: 20 }, () => withFileLock(lock, async () => {
      maxActive = Math.max(maxActive, ++active);
      await new Promise(resolve => setTimeout(resolve, 2));
      --active;
    })));
    assert.equal(maxActive, 1);
    await assert.rejects(withFileLock(lock, () => { throw new Error("fixture"); }), /fixture/);
    await withFileLock(lock, () => {});

    const fixture = path.join(base, "owner.mjs");
    await fs.writeFile(fixture, `import {withFileLock} from ${JSON.stringify(new URL("../src/core/lock.mjs", import.meta.url).href)};
      await withFileLock(process.argv[2], async () => {
        process.send('acquired'); await new Promise(() => { setInterval(()=>{},1000); });
      });`);
    child = fork(fixture, [lock], { stdio: ["ignore", "ignore", "ignore", "ipc"] });
    const [message] = await once(child, "message");
    assert.equal(message, "acquired");
    const exit = once(child, "exit");
    child.kill("SIGKILL");
    await exit;
    // Race multiple stale reclaimers. None may remove a new owner's marker.
    active = 0;
    await Promise.all(Array.from({ length: 20 }, () => withFileLock(lock, async () => {
      assert.equal(++active, 1);
      await new Promise(resolve => setTimeout(resolve, 2));
      --active;
    })));
    assert.deepEqual((await fs.readdir(base)).sort(), ["owner.mjs"]);
  } finally {
    child?.kill("SIGKILL");
    await fs.rm(base, { recursive: true, force: true });
  }
});

test("a live owner times out without being stolen; empty released directories are replaceable", async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "work-lock-timeout-"));
  const lock = path.join(base, "mutex");
  try {
    await withFileLock(lock, async () => {
      await assert.rejects(withFileLock(lock, () => assert.fail("lock stolen"), { timeoutMs: 20 }), /busy/);
    });
    await fs.mkdir(lock);
    await withFileLock(lock, () => {});
    assert.deepEqual(await fs.readdir(base), []);
  } finally {
    await fs.rm(base, { recursive: true, force: true });
  }
});
