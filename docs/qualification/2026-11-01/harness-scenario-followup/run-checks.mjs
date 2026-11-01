// Required repository regression checks; native live runs are recorded separately.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const evidence = path.join(path.dirname(fileURLToPath(import.meta.url)), 'evidence');
const source = path.resolve(evidence, '../../../../..');
const { root } = JSON.parse(await fs.readFile(path.join(evidence, 'installation.json')));
const safe = await fs.mkdtemp(path.join(os.tmpdir(), '0x2f-targeted-regressions-'));
for (const dir of ['bin', 'home']) await fs.mkdir(path.join(safe, dir));
await fs.symlink(process.execPath, path.join(safe, 'bin/node'));
const npm = '/opt/homebrew/lib/node_modules/npm/bin/npm-cli.js';
await fs.symlink(npm, path.join(safe, 'bin/npm'));
const env = { PATH: `${safe}/bin:/usr/bin:/bin:/usr/sbin:/sbin`, HOME: path.join(safe, 'home'),
  LANG: 'en_US.UTF-8', TERM: 'xterm-256color', TZ: 'Europe/Lisbon', TMPDIR: os.tmpdir(),
  WORK_TEST_NPM_CACHE: path.join(root, 'npm-cache'), npm_config_cache: path.join(safe, 'npm-cache'),
  npm_config_offline: 'true', npm_config_audit: 'false', npm_config_fund: 'false' };
const results = [];
for (const [label, args] of [['check', ['run', 'check']], ['test', ['test']]]) {
  const log = await fs.open(path.join(evidence, `repository-${label}.log`), 'w');
  const start = new Date().toISOString();
  const child = spawn(process.execPath, [npm, ...args], { cwd: source, env, stdio: ['ignore', log.fd, log.fd] });
  const code = await new Promise(resolve => child.once('close', resolve));
  await log.close();
  results.push({ label, command: [process.execPath, npm, ...args], start, end: new Date().toISOString(), code });
  console.log(JSON.stringify(results.at(-1)));
}
await fs.writeFile(path.join(evidence, 'repository-checks.json'), JSON.stringify({ node: process.version, source, isolatedHome: env.HOME, path: env.PATH, inheritedCredentials: false, results }, null, 2) + '\n');
if (results.some(r => r.code !== 0)) process.exitCode = 1;
