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
import { ensureEngineeringWorkspace, assertEngineeringWorkspace, engineeringDirectory } from './engineering-workspace.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const hash = value => digest(JSON.stringify(value));
const now = () => new Date().toISOString();
const dimensions = ['moneyMicros', 'tokens', 'modelCalls', 'providerCalls'];
const POLICY = 'engineering-continuity-v1';
const zero = () => Object.fromEntries(dimensions.map(k => [k, 0]));
const relative = p => typeof p === 'string' && p && !path.isAbsolute(p) && !p.split(/[\\/]/).some(x => !x || x === '..' || x === '.') && !['.work', '.git', 'node_modules'].includes(p.split('/')[0]);

// Foreground subscription execution can reserve an explicitly unknown envelope.
// It never upgrades that estimate to a proven hard ceiling or zero usage.
export const engineeringQualified = (proof, foreground) => proof && typeof proof.execute === 'function' && (foreground && proof.trustClass === 'foreground-subscription' || dimensions.every(k => Number.isSafeInteger(proof.maximum?.[k]) && proof.maximum[k] >= 0));
export const engineeringReservationFits = (budget, maximum, limits) => dimensions.every(k => budget.confirmed[k] + budget.reservations.reduce((sum, r) => sum + (r.maximum?.[k] ?? 0), 0) + (maximum?.[k] ?? 0) <= limits[k]);
export function engineeringSettleUsage(budget, boundary, usage, maximum, foreground) {
  const confirmed = Object.fromEntries(dimensions.filter(k => Number.isSafeInteger(usage?.[k]) && usage[k] >= 0 && (foreground || usage[k] <= maximum[k])).map(k => [k, usage[k]]));
  const known = dimensions.every(k => confirmed[k] !== undefined);
  const accepted = foreground ? confirmed : known ? confirmed : {};
  return { known, confirmed: Object.keys(accepted).length ? accepted : null, budget: { ...budget, confirmed: Object.fromEntries(dimensions.map(k => [k, budget.confirmed[k] + (accepted[k] ?? 0)])), reservations: known ? budget.reservations.filter(r => r.boundary !== boundary) : budget.reservations, uncertain: known ? budget.uncertain : [...budget.uncertain, boundary] } };
}

export async function executeEngineeringCall(proof, input, timeout) {
  let timer;
  let abort;
  try {
    return await Promise.race([proof.execute(input), new Promise((_, reject) => {
      abort = () => { try { proof.cancel?.(); } catch {} reject(new Error('Executor interrupted; effect remains uncertain.')); };
      timer = setTimeout(abort, Math.max(1, timeout));
      input.signal?.addEventListener('abort', abort, { once: true });
      if (input.signal?.aborted) abort();
    })]);
  } finally { clearTimeout(timer); input.signal?.removeEventListener('abort', abort); }
}

export async function engineeringConfig(store) {
  const file = path.join(store.workDir(), 'engineering.json');
  if (!await store.exists(file)) return null;
  const c = await store.readJson(file);
  if (Object.keys(c).some(k => !['schemaVersion', 'enabled', 'currency', 'providers', 'files', 'writePaths', 'check', 'limits', 'workspace', 'playbook', 'requireReview', 'reviewProviders', 'reviewChecks'].includes(k))) throw new Error('Unknown engineering policy field.');
  if (c.enabled === false) return null;
  if (c.schemaVersion !== 1 || c.enabled !== true || !Array.isArray(c.providers) || !c.providers.length || c.providers.some(p => typeof p !== 'string' || !p) || new Set(c.providers).size !== c.providers.length) throw new Error('Invalid engineering provider policy.');
  if (!Array.isArray(c.files) || !c.files.length || c.files.some(p => !relative(p)) || !Array.isArray(c.writePaths) || !c.writePaths.length || c.writePaths.some(p => !c.files.includes(p))) throw new Error('Engineering requires explicit relative input and write paths.');
  if (!Array.isArray(c.check) || c.check.length < 1 || c.check.some(a => typeof a !== 'string' || !a) || !path.isAbsolute(c.check[0])) throw new Error('Engineering check requires a pinned absolute executable argv.');
  const limits = c.limits;
  if (limits && Object.keys(limits).some(k => ![...dimensions, 'wallClockMs', 'implementationAttempts', 'investigationAttempts', 'reviewCycles', 'agentRuns'].includes(k))) throw new Error('Unknown engineering hard ceiling.');
  if (!limits || [...dimensions, 'wallClockMs', 'implementationAttempts'].some(k => !Number.isSafeInteger(limits[k]) || limits[k] < 0) || limits.wallClockMs < 1 || limits.wallClockMs > 600000 || limits.implementationAttempts < 1 || limits.implementationAttempts > (c.playbook ? 3 : 2)) throw new Error('Invalid bounded engineering execution limits.');
  for (const [key, maximum] of [['investigationAttempts', 2], ['reviewCycles', 2], ['agentRuns', 10]]) if (limits[key] !== undefined && (!Number.isSafeInteger(limits[key]) || limits[key] < (key === 'reviewCycles' ? 0 : 1) || limits[key] > maximum)) throw new Error(`Invalid ${key} limit.`);
  if (c.currency !== 'USD') throw new Error('Engineering money is integer USD micros; no implicit currency conversion.');
  if (c.workspace && (typeof c.workspace.repository !== 'string' || !path.isAbsolute(c.workspace.repository) || typeof c.workspace.ref !== 'string' || !c.workspace.ref || c.workspace.ref.length > 200)) throw new Error('Engineering workspace requires an absolute repository and explicit Git ref.');
  if (c.reviewProviders && (!Array.isArray(c.reviewProviders) || !c.reviewProviders.length || c.reviewProviders.some(p => typeof p !== 'string' || !p))) throw new Error('Invalid engineering reviewer policy.');
  const reviewCheckPins = {};
  if (c.reviewChecks && (typeof c.reviewChecks !== 'object' || Array.isArray(c.reviewChecks) || Object.keys(c.reviewChecks).length > 8)) throw new Error('Invalid preapproved review checks.');
  for (const [id, argv] of Object.entries(c.reviewChecks ?? {})) {
    if (!/^[a-z][a-z0-9-]{0,40}$/.test(id) || !Array.isArray(argv) || !path.isAbsolute(argv[0] ?? '') || argv.some(a => typeof a !== 'string' || !a)) throw new Error('Invalid preapproved review check argv.');
    reviewCheckPins[id] = { argv, executableDigest: digest(await readBounded(argv[0], 256000000)) };
  }
  if (!c.playbook && c.files.some(p => /(^|\/)(auth|permissions?|secrets?|migrations?)(\/|[.-])/i.test(p))) throw new Error('Sensitive engineering paths require the reviewed engineering playbook.');
  const checkBytes = await readBounded(c.check[0], 256000000);
  return { ...c, policy: POLICY, checkDigest: digest(checkBytes), reviewCheckPins };
}

function initialRun(provider) {
  return { ...makeRunRecord({ run: 1, provider, node: 'local', workspace: 'local', startedAt: now(), requestedProvider: 'auto' }), purpose: 'implement', executor: { kind: 'agent', harness: provider, backend: null, requestedModel: null, observedModel: null }, usage: { confirmed: null, estimated: null, uncertainty: 'not_started' } };
}

export async function createEngineeringTask(ctx, { title, brief, prompt, foreground }, config) {
  const candidates = config.providers.filter(id => ctx.providers.available(id));
  const provider = candidates[0] ?? config.providers[0];
  const token = randomUUID();
  const engineering = { schemaVersion: 1, revision: 1, config, configDigest: hash(config), driver: { token, state: 'pending' }, decisions: [], budget: { limits: config.limits, confirmed: zero(), reservations: [], uncertain: [] }, verification: null, next: 'automatic', ...(config.playbook ? { playbook: { nextPurpose: 'investigate', reason: 'initial_executor', agentRuns: 0, implementationAttempts: 0, investigationAttempts: 0, reviewCycles: 0, dispatch: null } } : {}) };
  let task = await ctx.store.createTask({ title, brief, prompt }, { provider, runs: [{ ...initialRun(provider), purpose: config.playbook ? 'investigate' : 'implement' }], engineering, launchToken: token });
  await ctx.store.appendEvent(task.slug, workEvent('task.created', task.id, { status: task.status }));
  if (config.workspace) {
    try {
      const workspace = await ensureEngineeringWorkspace(ctx.store, task, config.workspace);
      task = await mutate(ctx.store, task.slug, token, t => ({ ...t, engineering: { ...t.engineering, workspace } }));
    } catch (error) {
      return mutate(ctx.store, task.slug, token, t => stopPatch(t, 'workspace_setup', error.message));
    }
  }
  if (foreground) return (await import('./engineering-foreground.mjs')).runForegroundEngineering(ctx, task);
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
    const bytes = await readBounded(path.join(engineeringDirectory(store, task), file), 2000000);
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
  const delivery = task.engineering.delivery;
  if (delivery?.state === 'committed') {
    const r = await store.readJson(path.join(store.taskDir(task.slug), delivery.receipt.path));
    if (hash(r) !== delivery.receipt.digest || r.commit !== delivery.commit || r.scopeDigest !== delivery.scopeDigest) throw new Error('Local commit receipt changed.');
  }
  const v = task.engineering.verification;
  if (!v || v.code !== 0 || v.error || !v.sourceUnchanged) throw new Error('No verified engineering artifact is available for acceptance.');
  await verifyFrozen(store, task, v.artifact);
  const receipt = await store.readJson(path.join(store.taskDir(task.slug), 'runs', String(v.run), 'verification.json'));
  await assertEngineeringWorkspace(store, task, task.runs.at(-1).run);
  if (hash(receipt) !== hash(v) || (await inventory(engineeringDirectory(store, task))).digest !== v.artifact.contentDigest) throw new Error('Verified artifact/check changed; acceptance refused.');
  if (task.engineering.playbook) {
    const ref = task.engineering.playbook.review;
    if (!ref) throw new Error('Engineering review is missing.');
    const review = await store.readJson(path.join(store.taskDir(task.slug), ref.path));
    const independent = task.engineering.config.requireReview || task.engineering.config.writePaths.some(p => /(^|\/)(auth|authentication|permissions?|secrets?|migrations?|privacy|deploy)(\/|[.-])/i.test(p));
    if (hash(review) !== ref.digest || hash(review.artifact) !== hash(v.artifact) || review.verification?.digest !== hash(v) || !Array.isArray(review.findings) || review.findings.length || independent && review.mode !== 'independent-fresh-context') throw new Error('Engineering review changed or does not approve the verified artifact.');
  }
}

function stopPatch(t, code, text) {
  const runs = t.runs.map((r, i) => i === t.runs.length - 1 && r.outcome === 'working' ? { ...r, outcome: 'needs_you', completedAt: now() } : r);
  return { ...t, runs, status: 'needs_you', blockedOn: { type: 'decision', code, text }, engineering: { ...t.engineering, driver: { ...t.engineering.driver, state: 'stopped' }, next: 'user' } };
}

// Qualification is an in-process dependency seam for controlled fixtures, not
// a user-authored assertion in engineering.json. Production has no qualified
// paid executor in this version. Availability/usage reporting cannot prove caps.
export async function runEngineeringTask(args) {
  const { store, slug, token, providers, qualify = () => null, signal = new AbortController().signal, checkRunner = runCheck } = args;
  if ((await store.readJson(path.join(store.taskDir(slug), 'task.json'))).engineering?.config.playbook) return (await import('./engineering-playbook.mjs')).runEngineeringPlaybook({ ...args, qualify, signal, checkRunner });
  let claimed = false;
  let task = await mutate(store, slug, token, t => {
    if (t.status !== 'working' || t.engineering.driver.state !== 'pending') return null;
    claimed = true;
    return { ...t, engineering: { ...t.engineering, driver: { token, state: 'running', pid: process.pid } } };
  });
  if (!claimed) return task;
  const foreground = args.trustClass === 'foreground-subscription';
  if (foreground) task = await mutate(store, slug, token, t => ({ ...t, pid: process.pid, engineering: { ...t.engineering, trustClass: args.trustClass } }));
  const start = Date.now();
  const config = task.engineering.config;
  const executionDirectory = engineeringDirectory(store, task);
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
    await assertEngineeringWorkspace(store, task, task.runs.at(-1).run);
    const baseline = await inventory(executionDirectory);
    for (const f of config.files) if (!baseline.files[f]) return stop('missing_input', `Required input is absent: ${f}`);
    for (let attempt = 1; attempt <= config.limits.implementationAttempts; attempt++) {
      if (deadline() || await cancelled()) return stop('deadline', 'Execution stopped at its wall-clock/cancellation boundary.');
      let selected = null;
      const considered = [];
      for (const id of preferred) {
        const p = providers.getProvider(id);
        const proof = p && providers.available(id) ? await qualify(p, config) : null;
        const valid = engineeringQualified(proof, foreground);
        considered.push({ provider: id, reason: !p || !providers.available(id) ? 'unavailable' : !valid ? 'hard_ceiling_unqualified' : 'qualified' });
        if (valid && !selected) selected = { provider: p, proof };
      }
      if (!selected) return stop('execution_unqualified', 'No executor proves the required money/token/model-call/provider-call hard ceilings. No provider was called.');
      const { provider, proof } = selected;
      const before = await inventory(executionDirectory);
      const purpose = prior ? 'fix' : 'implement';
      let run = task.runs.at(-1).run;
      if (task.runs.at(-1).outcome !== 'working') run++;
      const input = { schemaVersion: 1, taskId: task.id, purpose, brief: task.brief, scope: config.writePaths, prohibited: ['commit', 'push', 'PR', 'merge', 'deploy', 'publication', 'new account/provider'], constraints: task.context?.notes ?? [], files: config.files, sourceDigest: before.digest, ...(prior ? { failedCheck: prior, previousArtifact: previous } : {}), ...(executorFailure ? { executorFailure } : {}) };
      const inputDigest = hash(input);
      const boundary = hash({ policy: POLICY, taskId: task.id, run, purpose, inputDigest });
      const maximum = proof.maximum ?? Object.fromEntries(dimensions.map(k => [k, null]));
      let reserved = false;
      task = await update(t => {
        if (t.status !== 'working' || t.engineering.driver.state !== 'running' || deadline()) return null;
        if (t.engineering.decisions.some(d => d.boundary === boundary)) return null;
        const budget = t.engineering.budget;
        if ((!foreground && budget.uncertain.length) || !engineeringReservationFits(budget, maximum, config.limits)) return null;
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
      await assertEngineeringWorkspace(store, task, run);
      await verifyHandoff(store, await store.findTask(task.id), handoff, { run, sourceDigest: (await inventory(executionDirectory)).digest });
      await store.appendEvent(slug, workEvent('run.started', task.id, { run, purpose, provider: provider.id }));
      const fresh = await store.findTask(task.id);
      if (deadline() || await cancelled()) return stop('deadline', 'Dispatch preparation exhausted its deadline or was cancelled.');
      await verifyHandoff(store, fresh, handoff, { run, sourceDigest: (await inventory(executionDirectory)).digest });
      if (deadline() || signal.aborted) return stop('deadline', 'Dispatch preparation exhausted its deadline.');
      let outcome;
      outcome = await executeEngineeringCall(proof, { cwd: executionDirectory, prompt: JSON.stringify(handoff.content), purpose, signal }, config.limits.wallClockMs - (Date.now() - start));
      if (!['ready', 'failed', 'needs_you'].includes(outcome?.status)) throw new Error('Executor returned an invalid outcome.');
      const usage = outcome.usage;
      const settled = engineeringSettleUsage(task.engineering.budget, boundary, usage, maximum, foreground);
      const known = settled.known;
      const result = outcome.result ?? outcome.error ?? '';
      await store.writeText(path.join(dir, 'result.md'), result);
      const after = await inventory(executionDirectory);
      previous = await freeze(store, task, run, after, 'artifacts');
      task = await update(t => {
        return { ...t, runs: t.runs.map(r => r.run === run ? { ...r, outcome: outcome.status, completedAt: now(), artifact: previous, qualification: proof.evidence ?? null, externalSessionId: outcome.externalSessionId ?? null, usage: { confirmed: settled.confirmed, estimated: maximum, reported: outcome.usageEvidence ?? null, uncertainty: known ? null : 'unconfirmed' }, ...(outcome.error ? { error: outcome.error } : {}) } : r), engineering: { ...t.engineering, budget: settled.budget } };
      });
      await store.appendEvent(slug, workEvent(outcome.status === 'ready' ? 'run.completed' : 'run.failed', task.id, { run, artifact: previous, purpose }));
      for (const file of changed(before, after)) await store.appendEvent(slug, workEvent('file.changed', task.id, { run, path: file, source: 'snapshot' }));
      if (!known && !foreground) return stop('usage_unknown', 'Usage is unconfirmed or exceeded its reservation; no further executor call is allowed.');
      if (!engineeringReservationFits(task.engineering.budget, null, config.limits)) return stop('budget_limit', 'Reported usage exceeds the configured foreground limit.');
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
      await assertEngineeringWorkspace(store, task, verifyRun);
      const receipt = await checkRunner({ argv: config.check, cwd: executionDirectory, timeout: Math.min(5000, config.limits.wallClockMs - (Date.now() - start)), signal });
      const checked = await inventory(executionDirectory);
      await verifyFrozen(store, task, previous);
      const verification = { schemaVersion: 1, run: verifyRun, artifact: previous, argv: config.check, executableDigest: config.checkDigest, cwd: executionDirectory, ...receipt, sourceUnchanged: checked.digest === after.digest, outputDigest: digest(receipt.output) };
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

export { inventory as engineeringInventory, freeze as freezeEngineering, verifyFrozen as verifyEngineeringArtifact, mutate as mutateEngineering, initialRun as engineeringRun, stopPatch as engineeringStop, runCheck as runEngineeringCheck };
