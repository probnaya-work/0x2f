// An opt-in, sequential engineering task. No stage language or provider retry
// daemon. Existing harnesses are unqualified until their hard limits are proven.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { withLock } from './lock.mjs';
import { readBounded } from './durable.mjs';
import { makeRunRecord } from './runs.mjs';
import { workEvent } from './events.mjs';
import { createHandoff, verifyHandoff } from './engineering-handoff.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const hash = value => digest(JSON.stringify(value));
const now = () => new Date().toISOString();
const dimensions = ['moneyMicros', 'tokens', 'modelCalls', 'providerCalls'];
const POLICY = 'engineering-continuity-v1';
const zero = () => Object.fromEntries(dimensions.map(k => [k, 0]));
const relative = p => typeof p === 'string' && p && !path.isAbsolute(p) && !p.split(/[\\/]/).some(x => !x || x === '..' || x === '.') && !['.work', '.git', 'node_modules'].includes(p.split('/')[0]);

export async function engineeringConfig(store) {
  const file = path.join(store.workDir(), 'engineering.json');
  if (!await store.exists(file)) return null;
  const c = await store.readJson(file);
  if (Object.keys(c).some(k => !['schemaVersion', 'enabled', 'currency', 'providers', 'files', 'writePaths', 'check', 'limits'].includes(k))) throw new Error('Unknown engineering policy field.');
  if (c.enabled === false) return null;
  if (c.schemaVersion !== 1 || c.enabled !== true || !Array.isArray(c.providers) || !c.providers.length || c.providers.some(p => typeof p !== 'string' || !p) || new Set(c.providers).size !== c.providers.length) throw new Error('Invalid engineering provider policy.');
  if (!Array.isArray(c.files) || !c.files.length || c.files.some(p => !relative(p)) || !Array.isArray(c.writePaths) || !c.writePaths.length || c.writePaths.some(p => !c.files.includes(p))) throw new Error('Engineering requires explicit relative input and write paths.');
  if (!Array.isArray(c.check) || c.check.length < 1 || c.check.some(a => typeof a !== 'string' || !a) || !path.isAbsolute(c.check[0])) throw new Error('Engineering check requires a pinned absolute executable argv.');
  const limits = c.limits;
  if (limits && Object.keys(limits).some(k => ![...dimensions, 'wallClockMs', 'implementationAttempts'].includes(k))) throw new Error('Unknown engineering hard ceiling.');
  if (!limits || [...dimensions, 'wallClockMs', 'implementationAttempts'].some(k => !Number.isSafeInteger(limits[k]) || limits[k] < 0) || limits.wallClockMs < 1 || limits.wallClockMs > 120000 || limits.implementationAttempts < 1 || limits.implementationAttempts > 2) throw new Error('Invalid engineering hard ceilings (maximum two implementation attempts / 120 seconds).');
  if (c.currency !== 'USD') throw new Error('Engineering money is integer USD micros; no implicit currency conversion.');
  if (c.files.some(p => /(^|\/)(auth|permissions?|secrets?|migrations?)(\/|[.-])/i.test(p))) throw new Error('Sensitive engineering paths require independent review; this slice cannot execute them.');
  const checkBytes = await readBounded(c.check[0], 256000000);
  return { ...c, policy: POLICY, checkDigest: digest(checkBytes) };
}

function initialRun(provider) {
  return { ...makeRunRecord({ run: 1, provider, node: 'local', workspace: 'local', startedAt: now(), requestedProvider: 'auto' }), purpose: 'implement', executor: { kind: 'agent', harness: provider, backend: null, requestedModel: null, observedModel: null }, usage: { confirmed: null, estimated: null, uncertainty: 'not_started' } };
}

export async function createEngineeringTask(ctx, { title, brief, prompt }, config) {
  const candidates = config.providers.filter(id => ctx.providers.available(id));
  const provider = candidates[0] ?? config.providers[0];
  const token = randomUUID();
  const engineering = { schemaVersion: 1, revision: 1, config, configDigest: hash(config), driver: { token, state: 'pending' }, decisions: [], budget: { limits: config.limits, confirmed: zero(), reservations: [], uncertain: [] }, verification: null, next: 'automatic' };
  const task = await ctx.store.createTask({ title, brief, prompt }, { provider, runs: [initialRun(provider)], engineering, launchToken: token });
  await ctx.store.appendEvent(task.slug, workEvent('task.created', task.id, { status: task.status }));
  const pid = await ctx.node.startExecution({ task });
  // A synchronous test node may have already finished. Never overwrite it.
  if (pid) await mutate(ctx.store, task.slug, token, t => ({ ...t, pid }));
  return ctx.store.findTask(task.id);
}

export const withEngineeringLock = (store, slug, fn) => withLock(path.join(store.taskDir(slug), 'engineering-lock'), fn);

async function mutate(store, slug, token, fn) {
  return withEngineeringLock(store, slug, async () => {
    const t = await store.readJson(path.join(store.taskDir(slug), 'task.json'));
    if (t.engineering?.driver.token !== token || hash(t.engineering.config) !== t.engineering.configDigest) throw new Error('Stale engineering task or changed execution policy.');
    const next = await fn(t);
    if (!next) return t;
    next.engineering = { ...next.engineering, revision: t.engineering.revision + 1 };
    return store.updateTask(next);
  });
}

async function inventory(base) {
  const files = {};
  let total = 0;
  async function walk(dir, prefix = '') {
    for (const e of (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (['.work', '.git', 'node_modules'].includes(e.name)) continue;
      const rel = prefix + e.name;
      if (e.isSymbolicLink()) throw new Error('Engineering inventory refuses symlinks.');
      if (e.isDirectory()) await walk(path.join(dir, e.name), rel + '/');
      else {
        const bytes = await readBounded(path.join(dir, e.name), 2000000);
        total += bytes.length;
        if (Object.keys(files).length >= 512 || total > 8000000) throw new Error('Engineering slice requires a small disposable repository.');
        files[rel] = { bytes: bytes.length, sha256: digest(bytes) };
      }
    }
  }
  await walk(base);
  return { files, digest: hash(files) };
}

const changed = (a, b) => [...new Set([...Object.keys(a.files), ...Object.keys(b.files)])].filter(p => a.files[p]?.sha256 !== b.files[p]?.sha256);

async function freeze(store, task, run, manifest, label) {
  const root = path.join(store.taskDir(task.slug), 'runs', String(run), label);
  for (const file of task.engineering.config.files) {
    if (!manifest.files[file]) continue;
    const bytes = await readBounded(path.join(store.base, file), 2000000);
    if (digest(bytes) !== manifest.files[file].sha256) throw new Error('Input changed while snapshotting.');
    await store.writeText(path.join(root, 'files', file), bytes);
  }
  const value = { schemaVersion: 1, taskId: task.id, run, ...manifest };
  await store.writeJson(path.join(root, 'manifest.json'), value);
  return { path: path.relative(store.taskDir(task.slug), path.join(root, 'manifest.json')), digest: hash(value), contentDigest: manifest.digest };
}

async function verifyFrozen(store, task, ref) {
  const file = path.join(store.taskDir(task.slug), ref.path);
  const value = await store.readJson(file);
  if (hash(value) !== ref.digest) throw new Error('Archived artifact manifest changed.');
  for (const p of task.engineering.config.files) {
    if (value.files[p] && digest(await readBounded(path.join(path.dirname(file), 'files', p), 2000000)) !== value.files[p].sha256) throw new Error('Archived artifact bytes changed.');
  }
}

export async function assertEngineeringAccepted(store, task) {
  const v = task.engineering.verification;
  if (!v || v.code !== 0 || v.error || !v.sourceUnchanged) throw new Error('No verified engineering artifact is available for acceptance.');
  await verifyFrozen(store, task, v.artifact);
  const receipt = await store.readJson(path.join(store.taskDir(task.slug), 'runs', String(v.run), 'verification.json'));
  if (hash(receipt) !== hash(v) || (await inventory(store.base)).digest !== v.artifact.contentDigest) throw new Error('Verified artifact/check changed; acceptance refused.');
}

function stopPatch(t, code, text) {
  const runs = t.runs.map((r, i) => i === t.runs.length - 1 && r.outcome === 'working' ? { ...r, outcome: 'needs_you', completedAt: now() } : r);
  return { ...t, runs, status: 'needs_you', blockedOn: { type: 'decision', code, text }, engineering: { ...t.engineering, driver: { ...t.engineering.driver, state: 'stopped' }, next: 'user' } };
}

// Qualification is an in-process dependency seam for controlled fixtures, not
// a user-authored assertion in engineering.json. Production has no qualified
// paid executor in this version. Availability/usage reporting cannot prove caps.
export async function runEngineeringTask({ store, slug, token, providers, qualify = () => null, signal = new AbortController().signal, checkRunner = runCheck }) {
  let claimed = false;
  let task = await mutate(store, slug, token, t => {
    if (t.status !== 'working' || t.engineering.driver.state !== 'pending') return null;
    claimed = true;
    return { ...t, engineering: { ...t.engineering, driver: { token, state: 'running', pid: process.pid } } };
  });
  if (!claimed) return task;
  const start = Date.now();
  const config = task.engineering.config;
  const noteDigest = hash(task.context ?? null);
  const stop = async (code, text) => {
    task = await mutate(store, slug, token, t => t.status === 'working' ? stopPatch(t, code, text) : null);
    if (task.status === 'needs_you') await store.appendEvent(slug, workEvent('needs_user', task.id, { run: task.runs.at(-1).run, blockedOn: task.blockedOn }));
    return task;
  };
  const deadline = () => signal.aborted || Date.now() - start >= config.limits.wallClockMs;
  const update = fn => mutate(store, slug, token, t => {
    if (t.status !== 'working' || t.engineering.driver.state !== 'running') throw new Error('Engineering owner no longer has an active task.');
    return fn(t);
  });
  const cancelled = async () => {
    const fresh = await store.findTask(task.id);
    return fresh.status !== 'working' || Boolean(await store.readCancelRequest(fresh)) || signal.aborted;
  };
  let prior = null;
  let previous = null;
  let executorFailure = null;
  let preferred = config.providers;
  try {
    const baseline = await inventory(store.base);
    for (const f of config.files) if (!baseline.files[f]) return stop('missing_input', `Required input is absent: ${f}`);
    for (let attempt = 1; attempt <= config.limits.implementationAttempts; attempt++) {
      if (deadline() || await cancelled()) return stop('deadline', 'Execution stopped at its wall-clock/cancellation boundary.');
      let selected = null;
      const considered = [];
      for (const id of preferred) {
        const p = providers.getProvider(id);
        const proof = p && providers.available(id) ? await qualify(p, config) : null;
        const valid = proof && dimensions.every(k => Number.isSafeInteger(proof.maximum?.[k]) && proof.maximum[k] >= 0) && typeof proof.execute === 'function';
        considered.push({ provider: id, reason: !p || !providers.available(id) ? 'unavailable' : !valid ? 'hard_ceiling_unqualified' : 'qualified' });
        if (valid && !selected) selected = { provider: p, proof };
      }
      if (!selected) return stop('execution_unqualified', 'No executor proves the required money/token/model-call/provider-call hard ceilings. No provider was called.');
      const { provider, proof } = selected;
      const before = await inventory(store.base);
      const purpose = prior ? 'fix' : 'implement';
      let run = task.runs.at(-1).run;
      if (task.runs.at(-1).outcome !== 'working') run++;
      const input = { schemaVersion: 1, taskId: task.id, purpose, brief: task.brief, scope: config.writePaths, prohibited: ['commit', 'push', 'PR', 'merge', 'deploy', 'publication', 'new account/provider'], constraints: task.context?.notes ?? [], files: config.files, sourceDigest: before.digest, ...(prior ? { failedCheck: prior, previousArtifact: previous } : {}), ...(executorFailure ? { executorFailure } : {}) };
      const inputDigest = hash(input);
      const boundary = hash({ policy: POLICY, taskId: task.id, run, purpose, inputDigest });
      const maximum = { ...proof.maximum };
      let reserved = false;
      task = await update(t => {
        if (t.status !== 'working' || t.engineering.driver.state !== 'running' || deadline()) return null;
        if (t.engineering.decisions.some(d => d.boundary === boundary)) return null;
        const budget = t.engineering.budget;
        if (budget.uncertain.length || dimensions.some(k => budget.confirmed[k] + budget.reservations.reduce((sum, r) => sum + r.maximum[k], 0) + maximum[k] > config.limits[k])) return null;
        reserved = true;
        const record = { ...initialRun(provider.id), run, purpose, predecessor: run > 1 ? { run: run - 1, boundary, reason: prior ? 'verification_failed' : 'executor_unavailable' } : null, input: { path: `runs/${run}/input.json`, digest: inputDigest }, permissions: { writePaths: config.writePaths, externalActions: false }, reservation: boundary };
        const runs = t.runs.at(-1).outcome === 'working' ? [...t.runs.slice(0, -1), record] : [...t.runs, record];
        return { ...t, runs, execution: { ...t.execution, provider: provider.id }, engineering: { ...t.engineering, next: purpose, decisions: [...t.engineering.decisions, { boundary, policy: POLICY, considered, provider: provider.id, purpose, reason: prior ? 'verification_failed' : attempt > 1 ? 'executor_unavailable' : 'initial_executor', maximum }], budget: { ...budget, reservations: [...budget.reservations, { boundary, maximum }] } } };
      });
      if (!reserved) return stop('budget_limit', 'Next run cannot reserve its hard envelope, or its boundary was already consumed. Existing uncertainty/reservations are retained.');
      const dir = path.join(store.taskDir(slug), 'runs', String(run));
      await store.writeJson(path.join(dir, 'input.json'), input);
      const source = await freeze(store, task, run, before, 'inputs');
      const handoff = await createHandoff(store, task, { run, purpose, source, artifact: previous, failedCheck: prior, executorFailure,
        verification: prior && { path: prior.path, digest: prior.digest } });
      await store.writeJson(path.join(dir, 'handoff.json'), handoff);
      await store.writeRunPrompt(task, run, JSON.stringify(handoff.content, null, 2));
      task = await update(t => ({ ...t, runs: t.runs.map(r => r.run === run ? { ...r, handoff: { path: `runs/${run}/handoff.json`, digest: handoff.digest, metrics: handoff.metrics } } : r) }));
      await verifyHandoff(store, await store.findTask(task.id), handoff, { run, sourceDigest: (await inventory(store.base)).digest });
      await store.appendEvent(slug, workEvent('run.started', task.id, { run, purpose, provider: provider.id }));
      let outcome;
      const timer = setTimeout(() => proof.cancel?.(), Math.max(1, config.limits.wallClockMs - (Date.now() - start)));
      const abort = () => proof.cancel?.();
      signal.addEventListener('abort', abort, { once: true });
      try { outcome = await proof.execute({ cwd: store.base, prompt: JSON.stringify(handoff.content), purpose, signal }); }
      finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
      if (!['ready', 'failed', 'needs_you'].includes(outcome?.status)) throw new Error('Executor returned an invalid outcome.');
      const usage = outcome.usage;
      const known = usage && dimensions.every(k => Number.isSafeInteger(usage[k]) && usage[k] >= 0 && usage[k] <= maximum[k]);
      const result = outcome.result ?? outcome.error ?? '';
      await store.writeText(path.join(dir, 'result.md'), result);
      const after = await inventory(store.base);
      previous = await freeze(store, task, run, after, 'artifacts');
      task = await update(t => {
        const budget = t.engineering.budget;
        return { ...t, runs: t.runs.map(r => r.run === run ? { ...r, outcome: outcome.status, completedAt: now(), artifact: previous, usage: { confirmed: known ? usage : null, uncertainty: known ? null : 'unconfirmed' }, ...(outcome.error ? { error: outcome.error } : {}) } : r), engineering: { ...t.engineering, budget: { ...budget, confirmed: Object.fromEntries(dimensions.map(k => [k, budget.confirmed[k] + (known ? usage[k] : 0)])), reservations: known ? budget.reservations.filter(r => r.boundary !== boundary) : budget.reservations, uncertain: known ? budget.uncertain : [...budget.uncertain, boundary] } } };
      });
      await store.appendEvent(slug, workEvent(outcome.status === 'ready' ? 'run.completed' : 'run.failed', task.id, { run, artifact: previous, purpose }));
      for (const file of changed(before, after)) await store.appendEvent(slug, workEvent('file.changed', task.id, { run, path: file, source: 'snapshot' }));
      if (!known) return stop('usage_unknown', 'Usage is unconfirmed or exceeded its reservation; no further executor call is allowed.');
      if (deadline() || await cancelled()) return stop('deadline', 'Cancellation/deadline reached; no verification or further call was started.');
      if (changed(baseline, after).some(f => !config.writePaths.includes(f))) return stop('scope_changed', 'Changes exceed approved paths; independent decision/review is required.');
      if (hash(task.context ?? null) !== noteDigest) return stop('input_changed', 'Task constraints changed during execution; a new input snapshot is required.');
      if (outcome.status !== 'ready') {
        if (outcome.failure?.kind === 'unavailable' && attempt < config.limits.implementationAttempts) {
          executorFailure = { run, provider: provider.id, reason: 'unavailable', resultRef: `runs/${run}/result.md`, resultDigest: digest(result) };
          preferred = preferred.filter(id => id !== provider.id); continue;
        }
        return stop('executor_failed', 'Executor failed or requested a decision. Inspect its preserved result before continuing.');
      }
      const verifyRun = run + 1;
      task = await update(t => ({ ...t, runs: [...t.runs, { ...makeRunRecord({ run: verifyRun, provider: 'local-checks', node: 'local', workspace: 'local', startedAt: now() }), purpose: 'verify', executor: { kind: 'local' }, input: previous }], execution: { ...t.execution, provider: 'local-checks' }, engineering: { ...t.engineering, next: 'verify' } }));
      const verificationHandoff = await createHandoff(store, task, { run: verifyRun, purpose: 'verify', artifact: previous });
      await store.writeJson(path.join(store.taskDir(slug), 'runs', String(verifyRun), 'handoff.json'), verificationHandoff);
      await verifyHandoff(store, task, verificationHandoff, { run: verifyRun });
      if (digest(await readBounded(config.check[0], 256000000)) !== config.checkDigest) return stop('check_drift', 'Verification executable changed.');
      await verifyFrozen(store, task, previous);
      await store.appendEvent(slug, workEvent('run.started', task.id, { run: verifyRun, purpose: 'verify', provider: 'local-checks' }));
      const receipt = await checkRunner({ argv: config.check, cwd: store.base, timeout: Math.min(5000, config.limits.wallClockMs - (Date.now() - start)), signal });
      const checked = await inventory(store.base);
      await verifyFrozen(store, task, previous);
      const verification = { schemaVersion: 1, run: verifyRun, artifact: previous, argv: config.check, executableDigest: config.checkDigest, cwd: store.base, ...receipt, sourceUnchanged: checked.digest === after.digest, outputDigest: digest(receipt.output) };
      await store.writeJson(path.join(store.taskDir(slug), 'runs', String(verifyRun), 'verification.json'), verification);
      await store.writeText(path.join(store.taskDir(slug), 'runs', String(verifyRun), 'result.md'), receipt.output);
      task = await update(t => ({ ...t, runs: t.runs.map(r => r.run === verifyRun ? { ...r, outcome: receipt.code === 0 && verification.sourceUnchanged ? 'ready' : 'failed', completedAt: now(), verification, usage: { confirmed: zero(), uncertainty: null } } : r), engineering: { ...t.engineering, verification } }));
      await store.appendEvent(slug, workEvent(receipt.code === 0 ? 'run.completed' : 'run.failed', task.id, { run: verifyRun, verification }));
      if (!verification.sourceUnchanged) return stop('artifact_changed', 'Verification changed the artifact; its result cannot be accepted.');
      if (receipt.error || deadline() || await cancelled()) return stop('check_environment', 'Check could not complete reliably; do not spend another implementation attempt.');
      if (receipt.code === 0) {
        await store.writeText(path.join(store.taskDir(slug), 'result.md'), result + '\n\nVerified artifact: ' + previous.contentDigest + '\n');
        const ready = await update(t => ({ ...t, status: 'ready', blockedOn: undefined, engineering: { ...t.engineering, next: 'accept', driver: { ...t.engineering.driver, state: 'completed' } } }));
        await store.appendEvent(slug, workEvent('task.updated', ready.id, { status: 'ready', run: verifyRun }));
        return ready;
      }
      prior = { path: `runs/${verifyRun}/verification.json`, digest: hash(verification), artifact: previous.contentDigest, code: receipt.code, output: receipt.output.slice(-16000) };
      preferred = [provider.id, ...config.providers.filter(id => id !== provider.id)];
    }
    return stop('attempt_limit', `${config.limits.implementationAttempts} permitted implementation attempts did not establish a passing result. Inspect the preserved checks and choose a new scope or stop.`);
  } catch (error) { return stop('execution_uncertain', `Engineering execution stopped: ${error.message}. No automatic retry.`); }
}

function runCheck({ argv, cwd, timeout, signal }) {
  return new Promise(resolve => {
    execFile(argv[0], argv.slice(1), { cwd, timeout: Math.max(1, timeout), maxBuffer: 65536, signal, env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' } }, (error, stdout, stderr) => resolve({ code: error ? typeof error.code === 'number' ? error.code : null : 0, output: String(stdout) + String(stderr), error: error && typeof error.code !== 'number' ? error.code ?? 'check_failed' : null }));
  });
}
