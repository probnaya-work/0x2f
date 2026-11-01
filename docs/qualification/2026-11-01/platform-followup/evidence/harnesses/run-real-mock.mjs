// Run the existing integration assertions in a temporary qualification copy.
// Only harness isolation/evidence capture differs. No paid or real credentials.
// Run under loopback-only.sb; never remove the Codex workspace-write sandbox.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../../../../..');
const commandOnly = process.argv.includes('--codex-command-only');
const resumeOnly = process.argv.includes('--codex-resume-only');
const root = await fs.mkdtemp(path.join(os.tmpdir(), '0x2f-real-mock-'));
const out = path.join(here, `run-${new Date().toISOString().replaceAll(':', '-')}`);
await fs.mkdir(out, { recursive: true });
await fs.mkdir(path.join(root, 'test', 'fixtures'), { recursive: true });
await fs.mkdir(path.join(root, 'home'), { recursive: true });
await fs.symlink(path.join(repo, 'src'), path.join(root, 'src'));
await fs.symlink(path.join(repo, 'node_modules'), path.join(root, 'node_modules'));
const artifactHelper = `
async function qualificationPreserve(target, options) {
  const dest = path.join(process.env.QUALIFICATION_ARTIFACTS, path.basename(target));
  try { await fs.cp(target, dest, { recursive: true, force: true }); } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return fs.rm(target, options);
}
`;
for (const harness of ['codex', 'gemini']) {
  const filename = `${harness}-integration.test.mjs`;
  let source = await fs.readFile(path.join(repo, 'test', filename), 'utf8');
  if (harness === 'codex') {
    if (!source.includes('CODEX_SANDBOX: "workspace-write"') && !source.includes('CODEX_SANDBOX: "bypass"')) {
      throw new Error('Expected sandbox seam changed');
    }
    source = source.replace('CODEX_SANDBOX: "bypass"', 'CODEX_SANDBOX: "workspace-write"');
    if (commandOnly) {
      // A stronger qualification assertion: the fixed local command really ran.
      source = source.replace('// Codex exec never emits file_change items',
        'assert.equal(await fs.readFile(path.join(base, "note.txt"), "utf8"), "x", "fixed local printf wrote exact marker");\n    // Codex exec never emits file_change items');
    }
  }
  // Preserve disposable test state before its original cleanup. Assertions unchanged.
  source = source.replaceAll('await fs.rm(', 'await qualificationPreserve(');
  source += artifactHelper;
  await fs.writeFile(path.join(root, 'test', filename), source);
}
for (const filename of ['codex-responses-mock.mjs', 'gemini-api-mock.mjs']) {
  let source = await fs.readFile(path.join(repo, 'test', 'fixtures', filename), 'utf8');
  source = 'import fs from "node:fs";\n' + source;
  // Every mock bind and provider request is captured before the socket closes.
  if (filename.startsWith('codex')) {
    source = source.replace('close: () => new Promise(r => server.close(r))',
      'close: () => { fs.appendFileSync(process.env.QUALIFICATION_REQUESTS, JSON.stringify({ harness: "codex", url: `http://127.0.0.1:${port}`, requests }) + "\\n"); return new Promise(r => server.close(r)); }');
  } else {
    source = source.replace('close: () => new Promise(resolve => server.close(resolve))',
      'close: () => { fs.appendFileSync(process.env.QUALIFICATION_REQUESTS, JSON.stringify({ harness: "gemini", url: `http://127.0.0.1:${port}`, requests: requestLog }) + "\\n"); return new Promise(resolve => server.close(resolve)); }');
  }
  await fs.writeFile(path.join(root, 'test', 'fixtures', filename), source);
}
// The trusted mock is the only source of model output, and has no live endpoint.
const env = {
  PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: path.join(root, 'home'), TMPDIR: root,
  XDG_CONFIG_HOME: path.join(root, 'home', 'config'),
  XDG_DATA_HOME: path.join(root, 'home', 'data'), XDG_CACHE_HOME: path.join(root, 'home', 'cache'),
  CODEX_BIN: '/Users/bogart/.n/bin/codex', GEMINI_BIN: '/Users/bogart/.n/bin/gemini',
  GEMINI_TELEMETRY_ENABLED: 'false', NO_COLOR: '1', CI: '1',
  QUALIFICATION_ARTIFACTS: out, QUALIFICATION_REQUESTS: path.join(out, 'mock-requests.jsonl')
};
await fs.writeFile(path.join(out, 'runner.json'), JSON.stringify({
  capturedAt: new Date().toISOString(), repo, root, node: process.execPath,
  environment: env, note: commandOnly
    ? 'Targeted normal Codex workspace-write sandbox; explicit local Responses mock, empty home, no real credentials. No added outer sandbox, which prevents nested seatbelt.'
    : 'Environment object constructed from scratch; only dummy test key; run under loopback-only.sb.',
  changes: ['CODEX_SANDBOX bypass -> workspace-write', 'Preserve temporary state before original cleanup', 'Log mock request bodies on close'],
  assertionsChanged: commandOnly ? 'Additional exact note.txt marker assertion; existing assertions unchanged' : false
}, null, 2) + '\n');
const log = await fs.open(path.join(out, 'tests.tap'), 'w');
console.log(`Evidence: ${out}`);
const testArgs = ['--test', '--test-reporter=tap', '--test-concurrency=1'];
if (commandOnly) testArgs.push('--test-name-pattern=command_execution');
if (resumeOnly) testArgs.push('--test-name-pattern=saved-session');
testArgs.push(path.join(root, 'test', 'codex-integration.test.mjs'));
if (!commandOnly && !resumeOnly) testArgs.push(path.join(root, 'test', 'gemini-integration.test.mjs'));
const child = spawn(process.execPath, testArgs,
{ cwd: root, env, stdio: ['ignore', log.fd, log.fd] });
const timeout = setTimeout(() => { child.kill('SIGTERM'); }, 180000);
const result = await new Promise(resolve => child.on('close', (exitCode, signal) => resolve({ exitCode, signal })));
clearTimeout(timeout);
await log.close();
await fs.cp(path.join(root, 'test'), path.join(out, 'qualified-test-copy'), { recursive: true });
await fs.writeFile(path.join(out, 'exit.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
console.log(await fs.readFile(path.join(out, 'tests.tap'), 'utf8'));
// Keep scratch state on failure for diagnosis; no unknown process group is killed.
if (result.exitCode === 0) await fs.rm(root, { recursive: true, force: true });
process.exitCode = result.exitCode ?? 1;
