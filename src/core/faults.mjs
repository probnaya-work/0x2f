// Process-death seam enabled only by explicit adversarial fixtures.
export function crashPoint(name) {
  if (process.env.WORKFLOW_TEST_MODE === '1' && process.env.WORKFLOW_TEST_CRASH_AT === name) process.kill(process.pid, 'SIGKILL');
}
