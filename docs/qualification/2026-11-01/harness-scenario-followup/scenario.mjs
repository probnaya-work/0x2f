import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const evidence = path.join(path.dirname(fileURLToPath(import.meta.url)), 'evidence');
const meta = JSON.parse(await fs.readFile(path.join(evidence, 'installation.json')));
const { workspace, cli } = meta;
const env = { ...process.env, CODEX_SANDBOX: 'workspace-write' };
const action = process.argv[2];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function record(file, value) { await fs.appendFile(path.join(evidence, file), JSON.stringify({ at: new Date().toISOString(), ...value }) + '\n'); }
function command(args, { expectFailure = false } = {}) {
  const at = new Date().toISOString();
  let result;
  try { result = { status: 0, stdout: execFileSync(cli, args, { cwd: workspace, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), stderr: '' }; }
  catch (error) { result = { status: error.status, stdout: String(error.stdout), stderr: String(error.stderr) }; }
  return record('commands.jsonl', { started: at, command: [cli, ...args], cwd: workspace, ...result }).then(() => {
    if (expectFailure) assert.notEqual(result.status, 0, 'overlapping action must be refused');
    else assert.equal(result.status, 0, result.stderr);
    console.log(JSON.stringify({ command: args[0], ...result }));
    return result;
  });
}
async function readTask() {
  const dirs = await fs.readdir(path.join(workspace, '.work/tasks'));
  assert.equal(dirs.length, 1, 'one persistent task');
  const dir = path.join(workspace, '.work/tasks', dirs[0]);
  return { dir, task: JSON.parse(await fs.readFile(path.join(dir, 'task.json'))) };
}
async function snapshot(label) {
  const { dir, task } = await readTask();
  const dest = path.join(evidence, label);
  await fs.mkdir(dest, { recursive: true });
  await fs.cp(dir, path.join(dest, 'task-state'), { recursive: true });
  const files = await fs.readdir(workspace);
  await fs.mkdir(path.join(dest, 'program'), { recursive: true });
  for (const file of files) if (!file.startsWith('.')) await fs.cp(path.join(workspace, file), path.join(dest, 'program', file), { recursive: true });
  await record('checkpoints.jsonl', { label, taskId: task.id, slug: task.slug, status: task.status, runs: task.runs, blockedOn: task.blockedOn });
  console.log(JSON.stringify({ label, taskId: task.id, slug: task.slug, status: task.status, runs: task.runs?.length, blockedOn: task.blockedOn }));
  return task;
}
function sampleProcesses(groups) {
  const lines = execFileSync('ps', ['-A', '-o', 'pid=,ppid=,pgid=,state=,comm='], { encoding: 'utf8' }).trim().split('\n');
  return lines.map(line => {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/);
    return m && { pid: +m[1], ppid: +m[2], pgid: +m[3], state: m[4], executable: m[5] };
  }).filter(row => row && groups.has(row.pgid) && !row.state.startsWith('Z'));
}
async function quiescent() {
  const { task } = await readTask();
  const groups = new Set(task.runs.map(run => run.processGroupId).filter(Boolean));
  if (task.processGroupId) groups.add(task.processGroupId);
  for (let i = 0; i < 100; i++) {
    const processes = sampleProcesses(groups);
    await record('processes.jsonl', { phase: 'quiescence', groups: [...groups], processes });
    if (!processes.length) return;
    await delay(200);
  }
  throw new Error('Prior execution group is still live; next run not started');
}
const brief = `Implement a small dependency-free Node.js duration formatter in this temporary repository. Create executable duration.mjs (with a shebang and executable permission) exporting formatDuration(seconds), and duration.test.mjs using node:test. formatDuration accepts non-negative safe integer seconds and returns H:MM:SS with unbounded hours and two-digit minutes/seconds. The CLI accepts exactly one canonical non-negative decimal integer argument (0 or a nonzero digit followed by digits), prints the formatted duration plus newline, and exits nonzero with stderr and no stdout for invalid input/argument count. Cover actual behavior and boundaries in meaningful tests including CLI execution, not only file existence. Run node --test duration.test.mjs and record concrete results. Keep scope to this tiny tool, no dependencies, network, commits or changes outside this workspace. Do not modify .work task state. Before implementation inspect current files. If prior runs already implemented it, preserve and inspect them; the latest recorded user notes control continuation. Complete only this bounded stage and report what was implemented and tested.`;
const constraint = `USER CONSTRAINT SUM_CONTRACT_01: Continue the existing duration formatter rather than replacing its files/tests. Add CLI --sum followed by one or more canonical non-negative decimal integer seconds; add them exactly, reject any invalid token or a total exceeding Number.MAX_SAFE_INTEGER before producing stdout. Example: ./duration.mjs --sum 0 59 1 must print 0:01:00\\n. Preserve existing one-argument CLI and exported formatDuration behavior. Add tests exercising sums across minute/hour boundaries, zero, missing operands, a malformed operand (e.g. 1e2), and safe-integer overflow. Independent qualification also found a real entry-point bug: executing the absolute duration.mjs path via macOS /var/folders/... (an alias of /private/var/folders/...) exits 0 with empty stdout even for 0, because import.meta.url is canonical but argv[1] is not. Reproduce, minimally fix this path-alias invocation, and add a regression without weakening silent-import behavior. Run the complete existing and new test suite. No dependency installation, network or commits. In your result explicitly identify prior implementation/tests you read and this constraint marker.`;
if (action === 'start') {
  await fs.writeFile(path.join(evidence, 'brief.txt'), brief + '\n');
  await command(['new', brief, '--provider', 'codex']);
  const { task } = await readTask();
  assert.equal(task.runs.length, 1);
  await command(['rerun', String(task.id), '--provider', 'opencode'], { expectFailure: true });
  await snapshot('01-codex-started');
} else if (action === 'note-opencode') {
  await quiescent();
  const before = await snapshot('02-codex-ready');
  assert.equal(before.status, 'ready');
  await command(['note', String(before.id), constraint]);
  const after = await snapshot('03-note-only');
  assert.equal(after.id, before.id); assert.equal(after.slug, before.slug);
  assert.equal(after.runs.length, before.runs.length); assert.equal(after.status, before.status);
  await fs.writeFile(path.join(evidence, 'user-constraint.txt'), constraint + '\n');
  await command(['rerun', String(before.id), '--provider', 'opencode']);
  await command(['rerun', String(before.id), '--provider', 'codex'], { expectFailure: true });
  const { dir } = await readTask();
  assert.ok((await fs.readFile(path.join(dir, 'runs/2/prompt.md'), 'utf8')).includes(constraint));
  await snapshot('04-opencode-started');
} else if (action === 'restart-codex') {
  await quiescent();
  const before = await snapshot('05-opencode-ready');
  assert.equal(before.status, 'ready');
  async function boot(label) {
    const child = spawn(cli, ['serve', '--port', '0'], { cwd: workspace, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', stderr = '';
    child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
    for (let i = 0; i < 100 && !output.includes('0x2F UI:'); i++) { assert.equal(child.exitCode, null, stderr); await delay(100); }
    assert.ok(output.includes('0x2F UI:'), 'foreground runtime started');
    await record('runtime-restarts.jsonl', { label, event: 'started', pid: child.pid, output: output.replace(/([?&]token=)[^\s&]+/g, '$1[REDACTED]'), stderr });
    return child;
  }
  async function stop(child, label) {
    const exit = new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })));
    child.kill('SIGTERM');
    const result = await exit;
    assert.equal(result.code, 0);
    await record('runtime-restarts.jsonl', { label, event: 'stopped', pid: child.pid, ...result });
  }
  const first = await boot('before-restart');
  await command(['open', String(before.id)]);
  await stop(first, 'before-restart');
  const second = await boot('after-restart');
  try {
    const after = await snapshot('06-runtime-reopened');
    assert.deepEqual(after, before);
    await command(['open', String(before.id), '--run', '1']);
    await command(['open', String(before.id), '--run', '2']);
    await command(['note', String(before.id), 'FINAL_REVIEW_01: Return as final verifier after OpenCode. Read actual current duration.mjs and duration.test.mjs, the previous results and SUM_CONTRACT_01. Execute all tests and additional independent edge-case CLI checks, inspect preservation of the original API and new exact-sum contract, fix only a concrete defect if found, and finish with evidence. Do not redo implementation, remove tests, add dependencies or change .work.']);
    await command(['rerun', String(before.id), '--provider', 'codex']);
    await command(['rerun', String(before.id), '--provider', 'opencode'], { expectFailure: true });
    await snapshot('07-codex-return-started');
  } finally { await stop(second, 'after-restart'); }
} else if (action === 'watch') {
  const initial = (await readTask()).task;
  const groups = new Set([initial.processGroupId, ...initial.runs.map(run => run.processGroupId)].filter(Boolean));
  for (let i = 0; i < 900; i++) {
    const { task } = await readTask();
    if (task.processGroupId) groups.add(task.processGroupId);
    await record('processes.jsonl', { phase: 'watch', taskId: task.id, run: task.runs.at(-1).run, status: task.status, groups: [...groups], processes: sampleProcesses(groups) });
    if (task.status !== 'working') { await snapshot(`watch-run-${task.runs.length}-${task.status}`); break; }
    if (i % 15 === 0) console.log(JSON.stringify({ status: task.status, run: task.runs.length, provider: task.execution?.provider, elapsedSeconds: i }));
    if (i === 899) throw new Error('Watch timeout; worker intentionally retained for inspection');
    await delay(1000);
  }
} else if (action === 'allow') {
  const { task } = await readTask();
  assert.equal(task.blockedOn?.live, true);
  await snapshot(`permission-before-${task.runs.length}-${Date.now()}`);
  await command(['allow', String(task.id)]);
} else if (action === 'close-reopen') {
  await quiescent();
  const before = await snapshot('08-final-ready');
  assert.equal(before.status, 'ready');
  assert.deepEqual(before.runs.map(run => run.provider), ['codex', 'opencode', 'codex']);
  await command(['close', String(before.id)]);
  const done = await snapshot('09-closed');
  assert.equal(done.status, 'done');
  await command(['status']);
  await command(['open', String(before.id)]);
  for (let n = 1; n <= 3; n++) await command(['open', String(before.id), '--run', String(n)]);
  const reopened = await snapshot('10-reopened-done');
  assert.deepEqual(reopened, done);
} else if (action === 'reopen-done-runtime') {
  const before = (await readTask()).task;
  assert.equal(before.status, 'done');
  const child = spawn(cli, ['serve', '--port', '0'], { cwd: workspace, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '', stderr = '';
  child.stdout.on('data', chunk => { output += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
  try {
    for (let i = 0; i < 100 && !output.includes('0x2F UI:'); i++) { assert.equal(child.exitCode, null, stderr); await delay(100); }
    assert.ok(output.includes('0x2F UI:'));
    await command(['status']);
    await command(['open', String(before.id)]);
    const after = await snapshot('11-done-after-runtime-restart');
    assert.deepEqual(after, before);
  } finally {
    const exit = new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })));
    child.kill('SIGTERM');
    const result = await exit;
    assert.equal(result.code, 0);
    await record('runtime-restarts.jsonl', { label: 'reopened-done', pid: child.pid, output, stderr, ...result });
  }
} else throw new Error('Choose start, note-opencode, restart-codex, watch, allow, close-reopen, reopen-done-runtime');
