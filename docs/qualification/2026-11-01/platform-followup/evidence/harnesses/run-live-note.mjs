// One explicitly authorized note/rerun extension. Reopens the SAME persistent
// approval ledger; never resets counts or overwrites the original run report.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { startGeminiBudgetGateway, MODEL } from './gemini-budget-gateway.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../../../../..');
const out = path.join(here, 'live-approved-20261101');
const resultPath = path.join(out, 'note-results.json');
try { await fs.access(resultPath); throw new Error('Note extension already attempted; inspect ledger'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const original = JSON.parse(await fs.readFile(path.join(out, 'results.json'), 'utf8'));
const scratch = await fs.realpath(original.scratch); const cwd = path.join(scratch, 'workspace');
const home = path.join(scratch, 'home'); const wrapper = path.join(scratch, 'gemini-qualification');
let apiKey;
try {
  apiKey = JSON.parse(execFileSync('/usr/bin/security', ['find-generic-password', '-s', 'gemini-cli-api-key', '-a', 'default-api-key', '-w'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 })).token?.accessToken;
  if (!apiKey) throw new Error();
} catch { throw new Error('Approved existing Gemini API key unavailable'); }
const gate = await startGeminiBudgetGateway({ ledgerPath: path.join(out, 'budget.json'), auditPath: path.join(out, 'audit.jsonl'), apiKey, liveApproved: true });
const before = gate.snapshot();
for (const key of Object.keys(process.env)) delete process.env[key];
Object.assign(process.env, { PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: home, TMPDIR: scratch,
  XDG_CONFIG_HOME: path.join(home, 'config'), XDG_CACHE_HOME: path.join(home, 'cache'), XDG_DATA_HOME: path.join(home, 'data'),
  GEMINI_BIN: wrapper, GEMINI_CLI_HOME: home, GEMINI_API_KEY: gate.token, GOOGLE_GEMINI_BASE_URL: gate.url,
  GEMINI_FORCE_FILE_STORAGE: 'true', GEMINI_TELEMETRY_ENABLED: 'false', GEMINI_CLI_NO_RELAUNCH: '1',
  GEMINI_APPROVAL_MODE: 'default', CI: '1', NO_COLOR: '1' });
const { createStore } = await import(pathToFileURL(path.join(repo, 'src/core/store.mjs')));
const store = createStore(cwd); const results = [];
async function cli(args) {
  const child = spawn(process.execPath, [path.join(repo, 'src/cli.mjs'), ...args], { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = ''; let stderr = ''; child.stdout.on('data', value => stdout += value); child.stderr.on('data', value => stderr += value);
  const timer = setTimeout(() => child.kill('SIGTERM'), 90000);
  const code = await new Promise(resolve => child.once('close', resolve)); clearTimeout(timer);
  await fs.appendFile(path.join(out, 'note-cli.jsonl'), JSON.stringify({ args, code, stdout, stderr }) + '\n');
  assert.equal(code, 0, stderr || stdout);
}
try {
  const first = await store.findTask(1); assert.equal(first.status, 'done');
  const note = 'Keep the chosen colour teal; include exact marker NOTE_ROUNDTRIP_01 in Result.';
  await cli(['note', '1', note]);
  const noted = await store.findTask(1); assert.equal(noted.status, 'done');
  assert.ok(noted.context.notes.some(item => item.text === note));
  gate.beginTurn('gemini-explicit-note-rerun');
  await cli(['rerun', '1', '--provider', 'gemini']);
  let ready; const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    const task = await store.findTask(1);
    if (task.status === 'ready') { ready = task; break; }
    if (task.status !== 'working') throw new Error(`Note rerun ended ${task.status}: ${task.error ?? ''}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, 'Note rerun completed before deadline');
  assert.equal(ready.id, first.id); assert.equal(ready.slug, first.slug);
  assert.equal(ready.runs.length, first.runs.length + 1);
  const text = await fs.readFile(path.join(cwd, '.work/tasks', ready.slug, 'result.md'), 'utf8');
  assert.match(text, /teal/i); assert.match(text, /NOTE_ROUNDTRIP_01/);
  const prompt = await fs.readFile(path.join(cwd, '.work/tasks', ready.slug, 'runs', String(ready.runs.at(-1).run), 'prompt.md'), 'utf8');
  assert.ok(prompt.includes(note));
  assert.ok((await store.readEvents(ready.slug)).some(event => event.type === 'task.note' && event.note === note));
  await cli(['close', '1']); await cli(['open', '1']);
  results.push({ passed: true, step: 'explicit-note-and-same-task-rerun', taskId: first.id, slug: first.slug,
    previousRuns: first.runs.length, currentRuns: ready.runs.length, note, result: text,
    finalStatus: (await store.findTask(1)).status, sameTaskIdentity: true, noteInPersistedPrompt: true });
} catch (error) { results.push({ passed: false, error: error.stack }); process.exitCode = 1; }
finally {
  await fs.writeFile(resultPath, JSON.stringify({ model: MODEL, before, after: gate.snapshot(), results }, null, 2) + '\n');
  await fs.cp(path.join(cwd, '.work'), path.join(out, 'note-work-state'), { recursive: true });
  await gate.close(); apiKey = undefined;
  console.log(JSON.stringify({ results, budget: gate.snapshot() }, null, 2));
}
