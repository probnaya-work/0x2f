import fs from "node:fs/promises";

// One teardown hook, including agents created by the restart test. Always
// release network resources even if a producer fails to stop; retain its
// workspace on failure rather than deleting state that may still be live.
export async function closeSecurityStack({ base, agents, tailers, handle }) {
  const errors = [];
  for (const tailer of tailers) {
    try {
      tailer.stop();
    } catch (error) {
      errors.push(error);
    }
  }
  const stopped = await Promise.allSettled(agents.map(agent => Promise.resolve().then(() => agent.stop())));
  for (const result of stopped) {
    if (result.status === "rejected") errors.push(result.reason);
  }
  try {
    await handle?.close();
  } catch (error) {
    errors.push(error);
  }
  if (errors.length) throw new AggregateError(errors, `Security stack cleanup failed; retained ${base}`);
  await fs.rm(base, { recursive: true, force: true });
}
