// --mock never reads credentials. --live-approved uses only the human-approved
// existing Gemini key in gateway memory; no secret is passed to a harness.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { startGeminiBudgetGateway, MODEL } from './gemini-budget-gateway.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../../../../..');
const live = process.argv.includes('--live-approved');
if (!live && !process.argv.includes('--mock')) throw new Error('Choose --mock or --live-approved explicitly');
const out = live ? path.join(here, 'live-approved-20261101')
  : path.join(here, `live-runner-mock-${new Date().toISOString().replaceAll(':', '-')}`);
await fs.mkdir(out, { recursive: true });
if (live) {
  try { await fs.access(path.join(out, 'results.json')); throw new Error('Live series already attempted; inspect its persistent ledger before any continuation'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const scratch = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), '0x2f-approved-live-')));
const cwd = path.join(scratch, 'workspace'); const home = path.join(scratch, 'home');
await fs.mkdir(cwd); await fs.mkdir(path.join(home, '.gemini'), { recursive: true });
await fs.writeFile(path.join(home, '.gemini', 'settings.json'), JSON.stringify({
  security: { auth: { selectedType: 'gateway', useExternal: true } }, telemetry: { enabled: false },
  general: { disableAutoUpdate: true, enableAutoUpdate: false }
}, null, 2));
const writePath = path.join(cwd, 'permission-roundtrip.txt');
const question = '## Result\nLIVE_B_01\n## Evidence\nqualification\n## Changes\nNone\n## Verification\nchoice pending\n## Needs human decision\nREQUIRED: yes\nQUESTION: Choose amber or teal?';
const answer = '## Result\nteal LIVE_B_02\n## Evidence\nprior answer retained\n## Changes\nNone\n## Verification\nok\n## Needs human decision\nREQUIRED: no';
const resumed = '## Result\nteal LIVE_B_03\n## Evidence\nprior session retained\n## Changes\nNone\n## Verification\nok\n## Needs human decision\nREQUIRED: no';
let backend;
let mockUpstream = null;
if (!live) {
  let number = 0;
  backend = http.createServer(async (req, res) => {
    for await (const chunk of req) { /* no credentials; consume mock request */ }
    const part = number === 0 ? { text: question } : number === 1 ? { text: answer }
      : number === 2 ? { text: resumed } : number === 3 ? { functionCall: { name: 'write_file', args: { file_path: writePath, content: 'APPROVED_ONCE\n' } } }
      : { text: '## Result\npermission marker written\n## Evidence\nfile\n## Changes\npermission-roundtrip.txt\n## Verification\nok\n## Needs human decision\nREQUIRED: no' };
    number++;
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end(`data: ${JSON.stringify({ candidates: [{ content: { role: 'model', parts: [part] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, thoughtsTokenCount: 0, totalTokenCount: 15 } })}\n\n`);
  });
  await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve));
  mockUpstream = `http://127.0.0.1:${backend.address().port}/mock`;
}
let apiKey;
if (live) {
  try {
    const secret = execFileSync('/usr/bin/security', ['find-generic-password', '-s', 'gemini-cli-api-key', '-a', 'default-api-key', '-w'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 });
    apiKey = JSON.parse(secret).token?.accessToken;
    if (typeof apiKey !== 'string' || !apiKey) throw new Error();
  } catch { throw new Error('Approved existing Gemini API key unavailable; no credential changes attempted'); }
}
const gate = await startGeminiBudgetGateway({ ledgerPath: path.join(out, 'budget.json'), auditPath: path.join(out, 'audit.jsonl'),
  apiKey, liveApproved: live, mockUpstream });
const wrapper = path.join(scratch, 'gemini-qualification');
await fs.writeFile(wrapper, `#!${process.execPath}
const { spawn } = require('node:child_process');
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (args[i] === '-m' || args[i] === '--model') { if (args[i + 1] !== ${JSON.stringify(MODEL)}) process.exit(90); }
  if (args[i] === '--approval-mode') args[i + 1] = 'default';
}
if (!args.includes('-m') && !args.includes('--model')) args.push('-m', ${JSON.stringify(MODEL)});
const child = spawn('/usr/bin/sandbox-exec', ['-f', ${JSON.stringify(path.join(here, 'loopback-only.sb'))}, '/Users/bogart/.n/bin/gemini', ...args], { stdio: 'inherit', env: process.env });
for (const signal of ['SIGTERM','SIGINT','SIGHUP']) process.on(signal, () => child.kill(signal));
child.on('error', () => process.exit(91)); child.on('close', code => process.exit(code ?? 92));
`);
await fs.chmod(wrapper, 0o755);
for (const key of Object.keys(process.env)) delete process.env[key];
Object.assign(process.env, { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: home, TMPDIR: scratch,
  XDG_CONFIG_HOME: path.join(home, 'config'), XDG_CACHE_HOME: path.join(home, 'cache'), XDG_DATA_HOME: path.join(home, 'data'),
  GEMINI_BIN: wrapper, GEMINI_CLI_HOME: home, GEMINI_API_KEY: gate.token, GOOGLE_GEMINI_BASE_URL: gate.url,
  GEMINI_FORCE_FILE_STORAGE: 'true', GEMINI_TELEMETRY_ENABLED: 'false', GEMINI_CLI_NO_RELAUNCH: '1',
  GEMINI_APPROVAL_MODE: 'default', CI: '1', NO_COLOR: '1' });
const { createStore } = await import(pathToFileURL(path.join(repo, 'src/core/store.mjs')));
const { geminiProvider } = await import(pathToFileURL(path.join(repo, 'src/providers/gemini.mjs')));
const store = createStore(cwd); const results = [];
async function cli(args) {
  const child = spawn(process.execPath, [path.join(repo, 'src/cli.mjs'), ...args], { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = ''; let stderr = ''; child.stdout.on('data', chunk => stdout += chunk); child.stderr.on('data', chunk => stderr += chunk);
  const timer = setTimeout(() => child.kill('SIGTERM'), 90000);
  const code = await new Promise(resolve => child.once('close', resolve)); clearTimeout(timer);
  await fs.appendFile(path.join(out, 'cli.jsonl'), JSON.stringify({ args, code, stdout, stderr }) + '\n');
  assert.equal(code, 0, stderr || stdout); return { stdout, stderr };
}
async function status(id, expected) {
  const end = Date.now() + 90000;
  while (Date.now() < end) {
    const task = await store.findTask(id);
    if (task.status === expected) return task;
    if (!['working', 'needs_you'].includes(task.status)) throw new Error(`Task ${id}: expected ${expected}, got ${task.status}: ${task.error ?? ''}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for task ${id}: ${expected}`);
}
async function drain(task) {
  const until = Date.now() + 5000;
  while (task.processGroupId && Date.now() < until) {
    try { process.kill(-task.processGroupId, 0); } catch { return; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
const brief = 'Qualify a human choice. Do not use tools. If task context has no recorded colour answer, return marker LIVE_B_01 and ask exactly "Choose amber or teal?" using REQUIRED: yes. If context includes the answer teal, report teal and marker LIVE_B_02 with REQUIRED: no. Keep every section very brief.';
try {
  await cli(['init']);
  gate.beginTurn('retry-controlled-local-failure', { failLocally: true });
  await cli(['new', brief, '--provider', 'gemini']);
  const failed = await status(1, 'failed'); assert.equal(failed.failure.kind, 'auth');
  results.push({ step: 'controlled-local-failure', passed: true, modelRequests: 0, kind: failed.failure.kind });
  await drain(failed);
  gate.beginTurn('gemini-live-retry-decision');
  await cli(['rerun', '1', '--provider', 'gemini']);
  const decision = await status(1, 'needs_you'); assert.equal(decision.blockedOn.type, 'decision');
  assert.match(decision.blockedOn.text, /amber.*teal/i);
  results.push({ step: 'live-retry-and-decision', passed: true, sessionId: decision.execution.externalSessionId });
  await drain(decision);
  await cli(['answer', '1', 'teal']);
  gate.beginTurn('gemini-answer-rerun');
  await cli(['rerun', '1', '--provider', 'gemini']);
  const ready = await status(1, 'ready');
  assert.match(await fs.readFile(path.join(cwd, '.work/tasks', ready.slug, 'result.md'), 'utf8'), /teal/i);
  assert.ok(ready.context.notes.some(note => /teal/.test(note.text)));
  results.push({ step: 'answer-and-rerun', passed: true, taskId: 1, runs: ready.runs.length });
  await drain(ready);
  gate.beginTurn('gemini-saved-session-resume');
  const continued = await geminiProvider.resume({ cwd, externalSessionId: ready.execution.externalSessionId, model: MODEL });
  assert.equal(continued.status, 'ready', continued.error); assert.equal(continued.externalSessionId, ready.execution.externalSessionId);
  assert.match(continued.result, /teal/i);
  results.push({ step: 'saved-session-resume', passed: true, sessionId: continued.externalSessionId, result: continued.result });
  const providers = path.join(cwd, '.work/providers'); await fs.mkdir(providers, { recursive: true });
  await fs.writeFile(path.join(providers, 'gemini-acp.json'), JSON.stringify({ id: 'gemini-acp', displayName: 'Gemini ACP qualification',
    transport: 'acp', command: [wrapper, '--acp', '--skip-trust', '--approval-mode', 'default', '-m', MODEL], permissions: 'interactive' }));
  gate.beginTurn('gemini-acp-permission', { writePath });
  await cli(['new', `Call write_file exactly once to write ${writePath} with exact content APPROVED_ONCE followed by one newline. Use no other tool. This is an explicitly requested scratch qualification write. Wait for the real ACP permission approval. After the write, return the standard brief result sections and REQUIRED: no.`, '--provider', 'gemini-acp']);
  const permission = await status(2, 'needs_you'); assert.equal(permission.blockedOn.type, 'permission'); assert.equal(permission.blockedOn.live, true);
  assert.equal(permission.blockedOn.file, writePath);
  const firstSession = permission.execution.externalSessionId;
  results.push({ step: 'actual-acp-permission-visible', passed: true, blockedOn: permission.blockedOn, sessionId: firstSession });
  await cli(['allow', '2']);
  const completed = await status(2, 'ready'); assert.equal(completed.execution.externalSessionId, firstSession);
  assert.equal(await fs.readFile(writePath, 'utf8'), 'APPROVED_ONCE\n');
  const events = await store.readEvents(completed.slug);
  assert.equal(events.filter(event => event.type === 'permission.resolved').length, 1);
  results.push({ step: 'actual-acp-permission-completed-once', passed: true, sessionId: firstSession,
    runs: completed.runs.length, resolvedOccurrences: 1, exactFileBytes: 'APPROVED_ONCE\n' });
  await drain(completed);
  await cli(['close', '1']); await cli(['open', '1']); await cli(['close', '2']);
} catch (error) {
  results.push({ step: 'stopped', passed: false, error: error.stack });
  process.exitCode = 1;
} finally {
  await fs.writeFile(path.join(out, 'results.json'), JSON.stringify({ live, model: MODEL, scratch, results, budget: gate.snapshot(),
    blockedBranches: { codex: 'Only ChatGPT OAuth found; no approved API-key billing path.',
      claude: 'OAuth scopes metadata found, but no usable API key/access token in the inspected configured credential entry; no unrestricted subscription fallback.' } }, null, 2) + '\n');
  await fs.cp(path.join(cwd, '.work'), path.join(out, 'work-state'), { recursive: true });
  await fs.copyFile(path.join(home, '.gemini/settings.json'), path.join(out, 'isolated-gemini-settings.json'));
  await gate.close();
  if (backend) await new Promise(resolve => backend.close(resolve));
  apiKey = undefined;
  console.log(`Evidence: ${out}`);
  console.log(JSON.stringify({ live, results: results.map(item => ({ step: item.step, passed: item.passed, error: item.error })),
    requests: gate.snapshot().requests, reservedUsd: gate.snapshot().reservedUsd, usageEstimateUsd: gate.snapshot().usageEstimateUsd }, null, 2));
}
