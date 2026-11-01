// Fixed local command only. No model/API invocation, network or credentials.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = await fs.mkdtemp(path.join(os.tmpdir(), '0x2f-sandbox-probe-'));
await fs.mkdir(path.join(root, 'codex'));
try {
  const command = ['/Users/bogart/.n/bin/codex', 'sandbox', '--', '/usr/bin/printf', 'fixed-local-command-ok\n'];
  const env = { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: root,
    CODEX_HOME: path.join(root, 'codex'), TMPDIR: root };
  const result = spawnSync(command[0], command.slice(1), {
    cwd: root, env, encoding: 'utf8', timeout: 15000
  });
  const record = { capturedAt: new Date().toISOString(), command,
    environment: env, exitCode: result.status, signal: result.signal,
    stdout: result.stdout, stderr: result.stderr, error: result.error?.message };
  await fs.writeFile(path.join(here, 'sandbox-probe.json'), JSON.stringify(record, null, 2) + '\n');
  console.log(JSON.stringify(record, null, 2));
} finally { await fs.rm(root, { recursive: true, force: true }); }
