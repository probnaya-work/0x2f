import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const evidence = path.join(path.dirname(fileURLToPath(import.meta.url)), 'evidence');
await fs.mkdir(evidence, { recursive: true });
const source = path.resolve(evidence, '../../../../..');
const root = await fs.mkdtemp(path.join(os.tmpdir(), '0x2f-codex-opencode-'));
const workspace = path.join(root, 'workspace');
const prefix = path.join(root, 'installed');
await fs.mkdir(workspace);
const commands = [];
function run(command, args, cwd = source) {
  const started = new Date().toISOString();
  try {
    const output = execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    commands.push({ started, command, args, cwd, status: 0, output });
    return output;
  } catch (error) {
    commands.push({ started, command, args, cwd, status: error.status, stdout: String(error.stdout), stderr: String(error.stderr) });
    throw error;
  }
}
const sourceSha = run('git', ['rev-parse', 'HEAD']).trim();
const packed = JSON.parse(run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', root]));
const archive = path.join(root, packed[0].filename);
run('npm', ['install', '--prefix', prefix, '--cache', path.join(root, 'npm-cache'), '--ignore-scripts', '--no-audit', '--no-fund', '--registry', 'https://registry.npmjs.org', archive]);
const cli = path.join(prefix, 'node_modules/.bin/2f');
run('git', ['init', '-q'], workspace);
run('git', ['config', 'user.name', '0x2F Qualification'], workspace);
run('git', ['config', 'user.email', 'qualification@example.invalid'], workspace);
await fs.writeFile(path.join(workspace, '.gitignore'), '.work/\n');
await fs.writeFile(path.join(workspace, 'README.md'), '# Disposable duration CLI qualification\n\nOnly task code and tests belong in this repository.\n');
run('git', ['add', '.'], workspace);
run('git', ['commit', '-qm', 'Disposable qualification baseline'], workspace);
run(cli, ['--version'], workspace);
run(cli, ['init'], workspace);
const metadata = { created: new Date().toISOString(), sourceSha, root, workspace, prefix, cli, archive,
  archiveSha256: crypto.createHash('sha256').update(await fs.readFile(archive)).digest('hex'),
  package: packed[0], node: process.version,
  environment: { HOME: process.env.HOME, inheritedCodexSandbox: process.env.CODEX_SANDBOX, scenarioCodexSandbox: 'workspace-write', ignoreUserConfig: false, apiKeyPresent: Boolean(process.env.OPENAI_API_KEY || process.env.CODEX_API_KEY) }, commands };
await fs.writeFile(path.join(evidence, 'installation.json'), JSON.stringify(metadata, null, 2) + '\n');
await fs.copyFile(archive, path.join(evidence, packed[0].filename));
console.log(JSON.stringify({ root, workspace, cli, sourceSha, archiveSha256: metadata.archiveSha256 }));
