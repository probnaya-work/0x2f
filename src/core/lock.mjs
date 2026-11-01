// Cross-process filesystem mutex. Publish a fully initialized, nonempty
// directory with rename: contenders cannot replace a live nonempty directory.
// A dead owner's UNIQUE marker can be removed safely; rmdir is deliberately
// nonrecursive so it cannot remove a replacement owner's nonempty directory.
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { WorkError } from "./errors.mjs";

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== "ESRCH";
  }
}

async function removeMarker(lock, marker) {
  await fs.unlink(path.join(lock, marker)).catch(error => {
    if (error.code !== "ENOENT") throw error;
  });
  await fs.rmdir(lock).catch(error => {
    if (!["ENOENT", "ENOTEMPTY", "EEXIST"].includes(error.code)) throw error;
  });
}

export async function withFileLock(lock, fn, { timeoutMs = 30000 } = {}) {
  const parent = path.dirname(lock);
  await fs.mkdir(parent, { recursive: true, mode: 0o700 });
  const marker = `${process.pid}-${randomUUID()}.owner`;
  const candidate = path.join(parent, `.candidate-${marker}`);
  await fs.mkdir(candidate, { mode: 0o700 });
  let acquired = false;
  try {
    await fs.writeFile(path.join(candidate, marker), "", { mode: 0o600, flag: "wx" });
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      try {
        await fs.rename(candidate, lock);
        acquired = true;
        break;
      } catch (error) {
        if (!["EEXIST", "ENOTEMPTY", "EPERM"].includes(error.code)) throw error;
      }
      let entries;
      try {
        entries = await fs.readdir(lock);
      } catch (error) {
        if (error.code === "ENOENT") continue;
        throw error;
      }
      for (const owner of entries) {
        const match = /^(\d+)-[a-f0-9-]+\.owner$/.exec(owner);
        if (match && Number(match[1]) > 0 && !alive(Number(match[1]))) {
          await removeMarker(lock, owner);
        }
      }
      if (Date.now() >= deadline) {
        throw new WorkError("Workspace state is busy in another process; retry the command.", 409);
      }
      await new Promise(resolve => setTimeout(resolve, 5 + Math.floor(Math.random() * 15)));
    }
    return await fn();
  } finally {
    if (acquired) await removeMarker(lock, marker);
    else await fs.rm(candidate, { recursive: true, force: true });
  }
}
