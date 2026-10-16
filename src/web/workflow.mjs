// DOM-free projection shared by all three local surfaces.
// Engineering shares the existing detail projection; no new browser module or
// static route is needed. Missing usage is never rendered as free execution.
export function engineeringLines(task) {
  if (!task.engineering) return [];
  const run = task.runs?.at(-1);
  const e = task.engineering;
  const b = e.budget;
  const reason = task.blockedOn?.code ?? e.playbook?.reason ?? e.decisions.at(-1)?.reason;
  const review = e.playbook?.review ?? e.review;
  const unknown = b.uncertain.length || b.reservations.some(r => Object.values(r.maximum ?? {}).some(v => v === null));
  return [
    `PURPOSE ${(run?.purpose ?? 'unknown').toUpperCase()} · EXECUTOR ${run?.provider ?? 'unknown'} · RUN ${run?.run ?? 1}`,
    `NEXT ${e.next.toUpperCase()}${reason ? ' · REASON ' + reason.toUpperCase() : ''}`,
    `COST ${unknown ? 'UNKNOWN · reservation retained' : 'USD ' + (b.confirmed.moneyMicros / 1000000).toFixed(6) + ' confirmed'} · ${b.reservations.length} reserved`,
    ...(e.verification ? [`RESULT ${e.verification.code === 0 && !e.verification.error && e.verification.sourceUnchanged ? e.outcome?.kind === 'no_change' ? 'NO CHANGE REQUIRED' : 'PATCH VERIFIED' : 'CHECK FAILED'} · ${e.verification.artifact.contentDigest}`, `ARTIFACT ${e.verification.artifact.path}`] : []),
    ...(review ? [`REVIEW ${review.path} · ${review.digest}`] : []),
    ...task.runs.filter(r => r.review?.findings?.length).flatMap(r => r.review.findings.map(f => `FINDING ${f.severity.toUpperCase()} · ${f.confirmed ? 'CONFIRMED' : 'NEEDS DECISION'} · ${f.message}`)),
    ...(run?.handoff ? [`HANDOFF ${run.handoff.metrics.bytes} bytes · history ${run.handoff.metrics.fullHistoryBytes} bytes`] : []),
    ...(e.workspace ? [`WORKSPACE ${e.workspace.path} · ref ${e.workspace.commit} · task-owned worktree`] : []),
    ...e.decisions.map(d => `ROUTING ${d.purpose} → ${d.provider} · ${d.reason}`),
    ...(e.delivery ? [`LOCAL COMMIT ${e.delivery.state.toUpperCase()} · ${e.delivery.scopeDigest}`, `REPOSITORY ${e.delivery.preview.repository} · WORKTREE ${e.delivery.preview.worktree} · PARENT ${e.delivery.preview.parent}`, `MESSAGE ${e.delivery.preview.message}`, `DIFF ${e.delivery.preview.diffDigest}`, ...(e.delivery.commit ? [`COMMIT ${e.delivery.commit} · RECEIPT ${e.delivery.receipt.path}`] : [])] : [])
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
