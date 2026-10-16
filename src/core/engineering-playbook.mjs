// The engineering default, expressed as purposes and bounded decisions. This
// is intentionally not a user-defined stage graph or an unattended rollout.
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readBounded } from './durable.mjs';
import { workEvent } from './events.mjs';
import { createHandoff, verifyHandoff, handoffHash as hash, engineeringIntent } from './engineering-handoff.mjs';
import { engineeringDirectory, assertEngineeringWorkspace } from './engineering-workspace.mjs';
import { engineeringInventory as inventory, freezeEngineering as freeze, verifyEngineeringArtifact as verifyArtifact, mutateEngineering as mutate, engineeringRun as makeRun, engineeringStop as stopped } from './engineering.mjs';
import { confirmEngineeringReview } from './engineering-review.mjs';

const dimensions = ['moneyMicros', 'tokens', 'modelCalls', 'providerCalls'];
const zero = () => Object.fromEntries(dimensions.map(k => [k, 0]));
const changed = (a, b) => [...new Set([...Object.keys(a.files), ...Object.keys(b.files)])].filter(p => a.files[p]?.sha256 !== b.files[p]?.sha256);
const risk = files => files.some(p => /(^|\/)(auth|authentication|permissions?|secrets?|migrations?|privacy|deploy)(\/|[.-])/i.test(p));
function metadata(outcome) {
  if (outcome.engineering) return outcome.engineering;
  try { return JSON.parse(outcome.result); } catch { return {}; }
}

export async function runEngineeringPlaybook({ store, slug, token, providers, qualify, signal, checkRunner, pauseAfterPurpose }) {
  let claimed = false;
  let task = await mutate(store, slug, token, t => {
    if (t.status !== 'working' || t.engineering.driver.state !== 'pending') return null;
    claimed = true;
    return { ...t, pid: process.pid, engineering: { ...t.engineering, driver: { token, state: 'running', pid: process.pid } } };
  });
  if (!claimed) return task;
  const config = task.engineering.config;
  const cwd = engineeringDirectory(store, task);
  const started = Date.now();
  const spentBefore = task.engineering.playbook.activeMs ?? 0;
  const limit = { investigationAttempts: 2, reviewCycles: 2, agentRuns: 10, ...config.limits };
  const originalIntent = engineeringIntent(task);
  let initial;
  const remaining = () => config.limits.wallClockMs - spentBefore - (Date.now() - started);
  const update = fn => mutate(store, slug, token, t => {
    if (t.status !== 'working' || t.engineering.driver.state !== 'running') throw new Error('Engineering owner lost its active task.');
    return fn(t);
  });
  const stop = async (code, text) => {
    task = await mutate(store, slug, token, t => t.status === 'working' ? stopped({ ...t, engineering: { ...t.engineering, playbook: { ...t.engineering.playbook, activeMs: spentBefore + Date.now() - started } } }, code, text) : null);
    if (task.status === 'needs_you') await store.appendEvent(slug, workEvent('needs_user', task.id, { run: task.runs.at(-1).run, blockedOn: task.blockedOn }));
    return task;
  };
  const record = (type, data) => store.appendEvent(slug, workEvent(type, task.id, data));
  const nextRun = () => task.runs.length === 1 && !task.runs[0].input && task.runs[0].outcome === 'working' ? 1 : task.runs.at(-1).run + 1;
  async function checkpoint(nextPurpose, reason, patch = {}) {
    task = await update(t => ({ ...t, engineering: { ...t.engineering, next: nextPurpose, playbook: { ...t.engineering.playbook, ...patch, nextPurpose, reason, dispatch: null, checkpointRun: t.runs.at(-1).run, activeMs: spentBefore + Date.now() - started } } }));
    await record('task.updated', { status: task.status, run: task.runs.at(-1).run, next: nextPurpose, reason });
  }
  async function prepare(purpose, provider, before, extra = {}) {
    const run = nextRun();
    const state = task.engineering.playbook;
    task = await update(t => ({ ...t, runs: [...t.runs.filter(r => r.run !== run), { ...makeRun(provider), run, purpose, executor: { kind: provider === 'local-checks' ? 'local' : 'agent', harness: provider, observedModel: null } }], execution: { ...t.execution, provider }, engineering: { ...t.engineering, next: purpose } }));
    const source = await freeze(store, task, run, before, 'inputs');
    const h = await createHandoff(store, task, { run, purpose, source, artifact: state.artifact, diagnosis: state.diagnosis, verification: state.verification, failedCheck: state.failedCheck, executorFailure: state.executorFailure, questions: ['Does this exact change satisfy the brief and preserve the relevant boundaries?'] });
    const file = path.join(store.taskDir(slug), 'runs', String(run), 'handoff.json');
    await store.writeJson(file, h);
    await store.writeRunPrompt(task, run, JSON.stringify(h.content, null, 2));
    task = await update(t => ({ ...t, runs: t.runs.map(r => r.run === run ? { ...r, input: { path: `runs/${run}/handoff.json`, digest: h.digest }, handoff: { path: `runs/${run}/handoff.json`, digest: h.digest, metrics: h.metrics }, ...extra } : r), engineering: { ...t.engineering, playbook: { ...t.engineering.playbook, baseline: t.engineering.playbook.baseline ?? source } } }));
    await assertEngineeringWorkspace(store, task, run);
    await verifyHandoff(store, await store.findTask(task.id), h, { run, ...(purpose !== 'verify' ? { sourceDigest: (await inventory(cwd)).digest } : {}) });
    return { run, source, handoff: h };
  }
  async function finish(run, outcome, patch = {}) {
    task = await update(t => ({ ...t, runs: t.runs.map(r => r.run === run ? { ...r, outcome, completedAt: new Date().toISOString(), ...patch } : r) }));
    await record(outcome === 'ready' ? 'run.completed' : 'run.failed', { run, purpose: task.runs.at(-1).purpose });
  }
  async function agentCall(purpose, before, preferredCandidates) {
    const s = task.engineering.playbook;
    if (s.agentRuns >= limit.agentRuns) return stop('agent_run_limit', 'Configured executor-run limit reached.');
    if (purpose === 'investigate' && s.investigationAttempts >= limit.investigationAttempts) return stop('diagnosis_unconfirmed', 'Diagnosis remains unsupported after bounded investigation.');
    if (['implement', 'fix'].includes(purpose) && s.implementationAttempts >= limit.implementationAttempts) return stop('attempt_limit', 'Implementation attempts exhausted.');
    if (task.engineering.budget.uncertain.length) return stop('usage_unknown', 'Unconfirmed usage reservation blocks another executor call.');
    const considered = [];
    let selected;
    const candidates = preferredCandidates ?? (s.primary ? [s.primary, ...config.providers.filter(id => id !== s.primary)] : config.providers);
    for (const id of candidates.filter(id => !(s.unavailable ?? []).includes(id))) {
      const p = providers.getProvider(id);
      const capable = p && (!p.capabilities?.engineeringPurposes || p.capabilities.engineeringPurposes.includes(purpose));
      const proof = capable && providers.available(id) ? await qualify(p, config, { purpose }) : null;
      const valid = proof && typeof proof.execute === 'function' && dimensions.every(k => Number.isSafeInteger(proof.maximum?.[k]) && proof.maximum[k] >= 0);
      considered.push({ provider: id, reason: !capable ? 'capability_mismatch' : !providers.available(id) ? 'unavailable' : !valid ? 'execution_unqualified' : 'qualified' });
      if (!selected && valid) selected = { provider: p, proof };
    }
    if (!selected) return stop('execution_unqualified', 'No executor is qualified for this trust class and purpose; unattended remains blocked.');
    const { provider, proof } = selected;
    const maximum = { ...proof.maximum };
    const budget = task.engineering.budget;
    if (dimensions.some(k => budget.confirmed[k] + budget.reservations.reduce((sum, r) => sum + r.maximum[k], 0) + maximum[k] > limit[k])) return stop('budget_limit', 'Next executor reservation exceeds its available envelope.');
    const { run, handoff } = await prepare(purpose, provider.id, before);
    const boundary = hash({ taskId: task.id, run, purpose, input: handoff.digest });
    task = await update(t => ({ ...t, engineering: { ...t.engineering, decisions: [...t.engineering.decisions, { boundary, purpose, provider: provider.id, reason: purpose === 'review' ? 'risk_policy' : s.reason, considered }], budget: { ...t.engineering.budget, reservations: [...t.engineering.budget.reservations, { boundary, maximum }] }, playbook: { ...t.engineering.playbook, dispatch: { run, boundary, input: handoff.digest }, agentRuns: s.agentRuns + 1, implementationAttempts: s.implementationAttempts + (purpose === 'implement' || purpose === 'fix' ? 1 : 0), investigationAttempts: s.investigationAttempts + (purpose === 'investigate' ? 1 : 0), primary: purpose === 'review' ? s.primary : provider.id } } }));
    await record('run.started', { run, purpose, provider: provider.id });
    let timer;
    let outcome;
    try {
      outcome = await Promise.race([proof.execute({ cwd, prompt: JSON.stringify(handoff.content), purpose, signal }), new Promise((_, reject) => { timer = setTimeout(() => { try { proof.cancel?.(); } catch {} reject(new Error('Executor timed out; effect remains uncertain.')); }, Math.max(1, remaining())); })]);
    } finally { clearTimeout(timer); }
    if (!['ready', 'failed', 'needs_you'].includes(outcome?.status)) throw new Error('Invalid executor outcome.');
    const result = String(outcome.result ?? outcome.error ?? '');
    await store.writeText(path.join(store.taskDir(slug), 'runs', String(run), 'result.md'), result);
    const after = await inventory(cwd);
    const artifact = await freeze(store, task, run, after, 'artifacts');
    const outcomeRef = { path: `runs/${run}/outcome.json`, digest: hash({ status: outcome.status, metadata: metadata(outcome), artifact }) };
    await store.writeJson(path.join(store.taskDir(slug), outcomeRef.path), { status: outcome.status, metadata: metadata(outcome), artifact });
    const usage = outcome.usage;
    const known = usage && dimensions.every(k => Number.isSafeInteger(usage[k]) && usage[k] >= 0 && usage[k] <= maximum[k]);
    task = await update(t => ({ ...t, engineering: { ...t.engineering, budget: { ...t.engineering.budget, confirmed: Object.fromEntries(dimensions.map(k => [k, t.engineering.budget.confirmed[k] + (known ? usage[k] : 0)])), reservations: known ? t.engineering.budget.reservations.filter(r => r.boundary !== boundary) : t.engineering.budget.reservations, uncertain: known ? t.engineering.budget.uncertain : [...t.engineering.budget.uncertain, boundary] } } }));
    await finish(run, outcome.status, { artifact, outcomeRef, usage: { confirmed: known ? usage : null, estimated: maximum, uncertainty: known ? null : 'unconfirmed' } });
    if (!known) return stop('usage_unknown', 'Completed call has unconfirmed usage; preserved reservation prevents further model calls.');
    if (['investigate', 'review'].includes(purpose) && before.digest !== after.digest) return stop('read_only_violation', 'A read-only purpose changed workspace bytes.');
    if (changed(initial, after).some(f => !config.writePaths.includes(f))) return stop('scope_changed', 'Changes exceed the approved task scope.');
    for (const file of changed(before, after)) await record('file.changed', { run, path: file, source: 'snapshot' });
    if (outcome.status !== 'ready') {
      if (outcome.failure?.kind === 'unavailable') { await checkpoint(purpose, 'executor_unavailable', { unavailable: [...(s.unavailable ?? []), provider.id], executorFailure: { run, provider: provider.id, reason: 'unavailable', resultRef: `runs/${run}/result.md`, resultDigest: hash(result) }, sourceDigest: after.digest }); return { retry: true }; }
      return stop('executor_failed', 'Executor failure/decision is preserved; no automatic replay.');
    }
    return { outcome, run, artifact, after, outcomeRef };
  }
  try {
    await assertEngineeringWorkspace(store, task, task.runs.at(-1).run);
    initial = await inventory(cwd);
    if (task.engineering.playbook.sourceDigest && initial.digest !== task.engineering.playbook.sourceDigest) return stop('stale_workspace', 'Workspace changed since its saved engineering checkpoint.');
    if (task.engineering.playbook.dispatch) return stop('uncertain_call', 'A previous executor call has no committed outcome; it will not be replayed.');
    for (;;) {
      task = await store.findTask(task.id);
      if (remaining() <= 0 || signal.aborted || await store.readCancelRequest(task)) return stop('deadline', 'Engineering deadline/cancellation reached. No further call.');
      if (engineeringIntent(task) !== originalIntent) return stop('input_changed', 'Constraints or human decisions changed during the run.');
      const s = task.engineering.playbook;
      const purpose = s.nextPurpose;
      const before = await inventory(cwd);
      if (s.sourceDigest && s.sourceDigest !== before.digest) return stop('stale_workspace', 'Workspace no longer matches the last saved artifact.');
      if (purpose === 'decide') {
        await store.writeText(path.join(store.taskDir(slug), 'result.md'), `${s.noChange ? 'NO CHANGE REQUIRED' : 'PATCH VERIFIED'}\nArtifact: ${s.artifact.path}\nReview: ${s.review.path}\nAwaiting user acceptance.\n`);
        task = await update(t => ({ ...t, status: 'ready', blockedOn: undefined, engineering: { ...t.engineering, next: 'accept', outcome: { kind: s.noChange ? 'no_change' : 'patch_verified', artifact: s.artifact, review: s.review }, driver: { ...t.engineering.driver, state: 'completed' } } }));
        await record('task.updated', { status: 'ready', next: 'accept' });
        return task;
      }
      if (purpose === 'verify') {
        await verifyArtifact(store, task, s.artifact);
        const { run } = await prepare('verify', 'local-checks', before);
        if (hash(await readBounded(config.check[0], 256000000)) !== config.checkDigest) return stop('check_drift', 'Verification executable changed.');
        await record('run.started', { run, purpose, provider: 'local-checks' });
        const receipt = await checkRunner({ argv: config.check, cwd, timeout: Math.max(1, Math.min(5000, remaining())), signal });
        const after = await inventory(cwd);
        await verifyArtifact(store, task, s.artifact);
        const verification = { schemaVersion: 1, run, artifact: s.artifact, argv: config.check, executableDigest: config.checkDigest, cwd, ...receipt, outputDigest: hash(receipt.output), sourceUnchanged: before.digest === after.digest };
        const ref = { path: `runs/${run}/verification.json`, digest: hash(verification) };
        await store.writeJson(path.join(store.taskDir(slug), ref.path), verification);
        await store.writeText(path.join(store.taskDir(slug), 'runs', String(run), 'result.md'), receipt.output);
        task = await update(t => ({ ...t, engineering: { ...t.engineering, verification } }));
        await finish(run, receipt.code === 0 && !receipt.error && verification.sourceUnchanged ? 'ready' : 'failed', { verification, usage: { confirmed: zero(), uncertainty: null } });
        if (!verification.sourceUnchanged) return stop('artifact_changed', 'Verification changed the artifact.');
        if (receipt.error) return stop('check_environment', 'Verification environment failed; no blind fix call.');
        if (receipt.code !== 0) {
          if (s.implementationAttempts >= limit.implementationAttempts) return stop('attempt_limit', 'Implementation attempts exhausted; inspect the saved verification.');
          await checkpoint('fix', 'verification_failed', { verification: ref, failedCheck: { ...ref, code: receipt.code, output: receipt.output.slice(-16000) }, sourceDigest: after.digest });
        } else await checkpoint('review', 'verification_passed', { verification: ref, sourceDigest: after.digest });
      } else if (purpose === 'review') {
        const needsIndependent = config.requireReview || risk(config.writePaths);
        if (needsIndependent) {
          const call = await agentCall('review', before, config.reviewProviders ?? [s.primary, ...config.providers.filter(id => id !== s.primary)].filter(Boolean));
          if (call.retry) continue;
          if (call.status) return call;
          await verifyArtifact(store, task, s.artifact);
          const reviewed = await confirmEngineeringReview({ store, task, run: call.run, review: metadata(call.outcome).review, artifact: s.artifact, verification: s.verification, cwd, checkRunner, signal, timeout: remaining, inventory });
          task = await update(t => ({ ...t, runs: t.runs.map(r => r.run === call.run ? { ...r, review: reviewed.data } : r), engineering: { ...t.engineering, review: reviewed.ref } }));
          if (reviewed.data.findings.some(f => !f.confirmed)) return stop('review_decision', 'Review findings lack deterministic confirmation. Inspect evidence before any fix.');
          if (reviewed.data.findings.length) {
            if (s.reviewCycles >= limit.reviewCycles) return stop('review_cycle_limit', 'Two permitted review/fix cycles are exhausted.');
            if (s.implementationAttempts >= limit.implementationAttempts) return stop('attempt_limit', 'Confirmed findings remain, but implementation attempts are exhausted.');
            await checkpoint('fix', 'confirmed_review_finding', { review: reviewed.ref, reviewCycles: s.reviewCycles + 1, fixFindings: reviewed.data.findings, sourceDigest: call.after.digest });
          } else await checkpoint('decide', 'independent_review_clear', { review: reviewed.ref, fixFindings: null, sourceDigest: call.after.digest });
        } else {
        const { run } = await prepare('review', 'local-checks', before);
        await verifyArtifact(store, task, s.artifact);
        const review = { schemaVersion: 1, run, artifact: s.artifact, verification: s.verification, mode: 'deterministic-policy', findings: [], reason: 'Approved paths and exact verification passed; no independent-review trigger.' };
        const ref = { path: `runs/${run}/review.json`, digest: hash(review) };
        await store.writeJson(path.join(store.taskDir(slug), ref.path), review);
        await store.writeText(path.join(store.taskDir(slug), 'runs', String(run), 'result.md'), review.reason);
        await record('run.started', { run, purpose, provider: 'local-checks' });
        await finish(run, 'ready', { review, usage: { confirmed: zero(), uncertainty: null } });
        await checkpoint('decide', 'local_review_clear', { review: ref, sourceDigest: before.digest });
        }
      } else {
        const call = await agentCall(purpose, before);
        if (call.retry) continue;
        if (call.status) return call;
        const { outcome, run, artifact, after, outcomeRef } = call;
        if (purpose === 'investigate') {
          const diagnosis = metadata(outcome).diagnosis;
          const confirmed = diagnosis?.confirmed === true && diagnosis.evidence?.length && diagnosis.evidence.every(e => before.files[e.path]?.sha256 === e.sha256);
          if (!confirmed) { await checkpoint('investigate', 'unconfirmed_diagnosis', { unconfirmedDiagnosis: outcomeRef, sourceDigest: after.digest }); }
          else {
            const ref = { path: `runs/${run}/diagnosis.json`, digest: hash(diagnosis) };
            await store.writeJson(path.join(store.taskDir(slug), ref.path), diagnosis);
            await checkpoint(diagnosis.noChange ? 'verify' : 'implement', 'diagnosis_confirmed', { diagnosis: ref, noChange: Boolean(diagnosis.noChange), artifact, sourceDigest: after.digest });
          }
        } else await checkpoint('verify', 'implementation_completed', { artifact, sourceDigest: after.digest });
      }
      if (pauseAfterPurpose && await pauseAfterPurpose(purpose, task)) return stop('paused_boundary', 'Paused at a committed purpose boundary; explicit continuation is safe.');
    }
  } catch (error) { return stop('execution_uncertain', `${error.message} No automatic replay.`); }
}

export async function resumeEngineeringPlaybook(ctx, task) {
  const s = task.engineering.playbook;
  if (!s || !['paused_boundary', 'review_required'].includes(task.blockedOn?.code) || s.dispatch) throw new Error('Engineering task has no safe completed boundary to resume; uncertain calls and exhausted limits cannot be replayed.');
  const token = randomUUID();
  const next = await mutate(ctx.store, task.slug, task.engineering.driver.token, t => {
    if (t.status !== 'needs_you' || t.engineering.playbook.dispatch) throw new Error('Engineering task changed before continuation.');
    return { ...t, status: 'working', blockedOn: undefined, execution: { ...t.execution, launchToken: token }, engineering: { ...t.engineering, driver: { token, state: 'pending' } } };
  });
  const pid = await ctx.node.startExecution({ task: next });
  if (pid) await mutate(ctx.store, task.slug, token, t => ({ ...t, pid }));
  return ctx.store.findTask(task.id);
}
