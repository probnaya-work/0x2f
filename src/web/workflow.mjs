// DOM-free projection shared by all three local surfaces.
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
  const v = workflowView(task); if (!v) return [];
  return [`WORKFLOW ${v.id} v${v.version} · run ${v.run} · ${v.origin} · ${v.triggerKey}`,
    `STATE ${v.status} · worker ${v.worker??'unrecorded'}${v.waitingForDecision ? ' · waiting for decision' : ''} · topic ${v.selected ?? 'pending'} · review ${v.review}`,
    `ACCEPTANCE ${v.acceptance} · PUBLICATION ${v.publication ?? 'unrecorded'}`,
    `ARTIFACTS ${v.artifactManifest ?? 'legacy path in result; no integrity manifest'}`,
    ...(task.workflow.definition?.permissions.unattendedAdapters ? ['ADAPTER TRUST trusted local executable · inherited group · attempt outputs only · no OS sandbox'] : []),
    ...v.externalAttempts.map(a=>`EXTERNAL ${a.id?.slice(0,12)??'unknown'} · run ${a.run??'?'} · ${a.state}${a.supervised?' · supervised':''} · worker ${a.worker??'?'} · supervisor ${a.supervisor??'?'}${a.reason?' · '+a.reason:''}`),
    ...(v.error ? [`ERROR ${v.error}`, `RECOVERY ${v.recovery}`] : [])];
}
export const decisionNeedsRun = task => Boolean(task.workflow && ['selected','changes_requested'].includes(task.workflow.review));
