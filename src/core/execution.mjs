// Execution identity is an attempt nonce, not a PID. Only the owning worker
// consumes its cancellation request and signals its own process group.
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";

export function reserveExecution(task) {
  return { ...task, execution: { ...task.execution, id: randomUUID() }, cancelRequested: undefined };
}

export async function processIdentity(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return null;
  if (process.platform === "linux") {
    try {
      const [stat, boot] = await Promise.all([
        fs.readFile(`/proc/${pid}/stat`, "utf8"),
        fs.readFile("/proc/sys/kernel/random/boot_id", "utf8")
      ]);
      const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ");
      if (fields[0] === "Z") return null;
      return { pid, start: fields[19], boot: boot.trim(), platform: process.platform };
    } catch { return null; }
  }
  if (process.platform === "darwin") {
    return new Promise(resolve => execFile("/bin/ps", ["-p", String(pid), "-o", "lstart=", "-o", "stat="],
      { timeout: 3000 }, (error, stdout) => {
        const text = stdout?.trim();
        if (error || !text || /\sZ\S*$/.test(text)) return resolve(null);
        resolve({ pid, start: text.slice(0, 24), platform: process.platform });
      }));
  }
  return null;
}

export async function executionAlive(task, fallback) {
  const expected = task.execution?.process;
  if (!expected) return fallback(task.pid); // legacy observation; never authority to signal
  const actual = await processIdentity(task.pid);
  // An unavailable process table is not evidence of death.
  if (!actual) return fallback(task.pid);
  return actual.start === expected.start && actual.boot === expected.boot && actual.platform === expected.platform;
}
