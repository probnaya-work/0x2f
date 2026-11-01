// Local version/help only. Empty homes, no credentials or inherited settings.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const output = path.dirname(fileURLToPath(import.meta.url));
const root = await fs.mkdtemp(path.join(os.tmpdir(), '0x2f-harness-inventory-'));
const binaries = {
  node: '/opt/homebrew/bin/node',
  codex: '/Users/bogart/.n/bin/codex',
  gemini: '/Users/bogart/.n/bin/gemini',
  claude: '/Users/bogart/.n/bin/claude',
  opencode: '/opt/homebrew/bin/opencode',
  dsh: '/Users/bogart/.n/bin/dsh'
};
const records = [];
try {
  for (const [name, binary] of Object.entries(binaries)) {
    const home = path.join(root, name);
    await fs.mkdir(path.join(home, 'codex'), { recursive: true });
    const env = {
      PATH: '/opt/homebrew/bin:/usr/bin:/bin:/Users/bogart/.n/bin', HOME: home, TMPDIR: home,
      XDG_CONFIG_HOME: path.join(home, 'config'), XDG_DATA_HOME: path.join(home, 'data'),
      XDG_CACHE_HOME: path.join(home, 'cache'), CODEX_HOME: path.join(home, 'codex'),
      GEMINI_CLI_HOME: home, CLAUDE_CONFIG_DIR: path.join(home, 'claude'),
      DSH_HOME: path.join(home, 'dsh'), GEMINI_TELEMETRY_ENABLED: 'false',
      CI: '1', NO_COLOR: '1'
    };
    for (const arg of name === 'node' ? ['--version'] : ['--version', '--help']) {
      const child = spawnSync(binary, [arg], { cwd: home, env, encoding: 'utf8', timeout: 30000 });
      const record = {
        name, binary, resolved: await fs.realpath(binary), command: [binary, arg],
        exitCode: child.status, signal: child.signal, stdout: child.stdout,
        stderr: child.stderr, error: child.error?.message
      };
      records.push(record);
      console.log(`${name} ${arg}: ${child.status} ${arg === '--version' ? child.stdout.trim() : ''}`);
    }
  }
  await fs.writeFile(path.join(output, 'inventory.json'), JSON.stringify({
    capturedAt: new Date().toISOString(), platform: process.platform, arch: process.arch,
    envKeys: ['PATH', 'HOME', 'TMPDIR', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME', 'XDG_CACHE_HOME',
      'CODEX_HOME', 'GEMINI_CLI_HOME', 'CLAUDE_CONFIG_DIR', 'DSH_HOME', 'GEMINI_TELEMETRY_ENABLED', 'CI', 'NO_COLOR'],
    records
  }, null, 2) + '\n');
} finally { await fs.rm(root, { recursive: true, force: true }); }
