// DOM-free projection shared by all three local surfaces.
// Engineering shares the existing detail projection; no new browser module or
// static route is needed. Missing usage is never rendered as free execution.
export function engineeringLines(task) {
  if (!task.engineering) return [];
  const run = task.runs?.at(-1);
  const e = task.engineering;
  if (e.delivery?.reconciliation) return [`TASK ${String(task.id).padStart(3,'0')}`, 'ACTION LOCAL COMMIT', `STATE ${e.delivery.reconciliation.result === 'UNCERTAIN' ? 'UNCERTAIN' : 'RECONCILED'}`, 'RECONCILE READ ONLY', `RESULT ${e.delivery.reconciliation.result.replaceAll('_',' ')}`, `COMMIT ${e.delivery.reconciliation.commit ?? '—'}`, `REACHABLE ${e.delivery.reconciliation.reachableFromHead === null ? 'UNKNOWN' : e.delivery.reconciliation.reachableFromHead ? 'YES' : 'NO'} · observed ${e.delivery.reconciliation.at}`, `NEXT ${e.delivery.reconciliation.result === 'APPLIED' ? 'READY' : 'NEEDS YOU'}`, ...e.delivery.reconciliation.reasons.map(r=>`EVIDENCE ${r}`)];
  const b = e.budget;
  const economics=e.economics,usage=economics?.aggregate;
  const metric=k=>usage?.metrics[k]?.value??'?';
  const reason = task.blockedOn?.code ?? e.playbook?.reason ?? e.decisions.at(-1)?.reason;
  const review = e.playbook?.review ?? e.review;
  const unknown = Boolean(economics?.policy&&!usage)||usage?.money.value===null||b.uncertain.length || b.reservations.some(r => Object.values(r.maximum ?? {}).some(v => v === null));
  return [
    `PURPOSE ${(run?.purpose ?? 'unknown').toUpperCase()} · EXECUTOR ${run?.provider ?? 'unknown'} · RUN ${run?.run ?? 1}`,
    `NEXT ${e.next.toUpperCase()}${reason ? ' · REASON ' + reason.toUpperCase() : ''}`,
    `COST ${unknown ? 'UNKNOWN · reservation retained' : 'USD ' + (b.confirmed.moneyMicros / 1000000).toFixed(6) + ' confirmed'} · ${b.reservations.length} reserved`,
    ...(economics?.policy&&!usage?['USAGE NOT DISPATCHED · PROVIDER ATTEMPTS 0 · COST UNKNOWN']:[]),
    ...(usage?[`USAGE ${usage.partial?'PARTIAL ':''}TOTAL ${metric('total')} · INPUT ${metric('input')} · CACHED ${metric('cachedInput')} · OUTPUT ${metric('output')} · REASONING ${metric('reasoning')} · ATTEMPTS ${usage.attempts}`,`USAGE COST ${usage.money.value===null?'UNKNOWN':usage.money.currency+' '+usage.money.value+' micros'}`]:[]),
    ...(economics?.policy?[`AUTO ${economics.policy.classification.toUpperCase()} · INPUT ≤${economics.policy.hard.inputBytes} bytes hard · TOKENS ${economics.policy.soft.totalTokens} soft · ${task.blockedOn?.code??'bounded'}`]:[]),
    ...(e.verification ? [`RESULT ${e.verification.code === 0 && !e.verification.error && e.verification.sourceUnchanged ? e.outcome?.kind === 'no_change' ? 'NO CHANGE REQUIRED' : 'PATCH VERIFIED' : 'CHECK FAILED'} · ${e.verification.artifact.contentDigest}`, `ARTIFACT ${e.verification.artifact.path}`] : []),
    ...(review ? [`REVIEW ${review.path} · ${review.digest}`] : []),
    ...task.runs.filter(r => r.review?.findings?.length).flatMap(r => r.review.findings.map(f => `FINDING ${f.severity.toUpperCase()} · ${f.confirmed ? 'CONFIRMED' : 'NEEDS DECISION'} · ${f.message}`)),
    ...(run?.handoff ? [`HANDOFF ${run.handoff.metrics.bytes} bytes · history ${run.handoff.metrics.fullHistoryBytes} bytes`] : []),
    ...(e.workspace ? [`WORKSPACE ${e.workspace.path} · ref ${e.workspace.commit} · task-owned worktree`] : []),
    ...e.decisions.map(d => `ROUTING ${d.purpose} → ${d.provider} · ${d.reason}`),
    ...(['running','uncertain','failed'].includes(e.delivery?.state) ? [`RECONCILE READ ONLY · 2f reconcile ${task.id}`] : []),
    ...(e.delivery ? [`LOCAL COMMIT ${e.delivery.state.toUpperCase()} · ${e.delivery.scopeDigest}`, `REPOSITORY ${e.delivery.preview.repository} · WORKTREE ${e.delivery.preview.worktree} · PARENT ${e.delivery.preview.parent}`, `MESSAGE ${e.delivery.preview.message}`, `DIFF ${e.delivery.preview.diffDigest}`, ...(e.delivery.commit ? [`COMMIT ${e.delivery.commit} · RECEIPT ${e.delivery.receipt?.path ?? 'unrecorded'}`] : [])] : [])
  ];
}
export function workflowView(task) {
  const w = task.workflow; if (!w) return null;
  const run = task.runs?.at(-1)?.run ?? 1;
  const publication = w.publication?.url ?? null;
  return { id: w.id, version: w.version, schemaVersion: w.schemaVersion ?? 0, run,
    origin: w.trigger ?? 'manual', triggerKey: w.triggerKey ?? '', status: task.status,
    waitingForDecision: task.status === 'needs_you' && task.blockedOn?.type === 'decision', selected: w.selected ?? null,
    acceptance: w.acceptedDigest === w.packageDigest && Boolean(w.packageDigest) ? 'accepted' : 'pending',
    externalAttempts:task.externalAttempts??[], worker:task.pid??null, review: w.review ?? 'pending', publication, artifactManifest: w.manifest ?? null, error: task.error ?? null,
    recovery: task.status === 'failed' ? `2f workflow doctor · 2f workflow recover ${task.id}` : null };
}
export function workflowLines(task) {
  if (task.engineering) return engineeringLines(task);
  const v = workflowView(task); if (!v) return [];
  return [`WORKFLOW ${v.id} v${v.version} · run ${v.run} · ${v.origin} · ${v.triggerKey}`,
    `STATE ${v.status} · worker ${v.worker??'unrecorded'}${v.waitingForDecision ? ' · waiting for decision' : ''} · topic ${v.selected ?? 'pending'} · review ${v.review}`,
    `ACCEPTANCE ${v.acceptance} · PUBLICATION ${v.publication ?? 'unrecorded'}`,
    `ARTIFACTS ${v.artifactManifest ?? 'legacy path in result; no integrity manifest'}`,
    ...(task.workflow.definition?.permissions.unattendedAdapters ? ['ADAPTER TRUST trusted local executable · inherited group · attempt outputs only · no OS sandbox'] : []),
    ...v.externalAttempts.map(a=>`EXTERNAL ${a.id?.slice(0,12)??'unknown'} · run ${a.run??'?'} · ${a.state}${a.supervised?' · supervised':''}${a.restrictedOutput?' · restricted output · reconcile before safe cleanup':''} · worker ${a.worker??'?'} · supervisor ${a.supervisor??'?'}${a.reason?' · '+a.reason:''}`),
    ...(v.error ? [`ERROR ${v.error}`, `RECOVERY ${v.recovery}`] : [])];
}
export const decisionNeedsRun = task => Boolean(task.workflow && ['selected','changes_requested'].includes(task.workflow.review));
