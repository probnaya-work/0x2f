// DOM-free projection shared by all three local surfaces.
export function workflowView(task) {
  const w = task.workflow; if (!w) return null;
  const run = task.runs?.at(-1)?.run ?? 1;
  const publication = w.publication?.url ?? null;
  return { id: w.id, version: w.version, schemaVersion: w.schemaVersion ?? 0, run,
    origin: w.trigger ?? 'manual', triggerKey: w.triggerKey ?? '', status: task.status,
    waitingForDecision: task.status === 'needs_you' && task.blockedOn?.type === 'decision', selected: w.selected ?? null,
    acceptance: w.acceptedDigest === w.packageDigest && Boolean(w.packageDigest) ? 'accepted' : 'pending',
    review: w.review ?? 'pending', publication, artifactManifest: w.manifest ?? null, error: task.error ?? null,
    recovery: task.status === 'failed' ? `2f workflow doctor · 2f workflow recover ${task.id}` : null };
}
export function workflowLines(task) {
  const v = workflowView(task); if (!v) return [];
  return [`WORKFLOW ${v.id} v${v.version} · run ${v.run} · ${v.origin} · ${v.triggerKey}`,
    `STATE ${v.status}${v.waitingForDecision ? ' · waiting for decision' : ''} · topic ${v.selected ?? 'pending'} · review ${v.review}`,
    `ACCEPTANCE ${v.acceptance} · PUBLICATION ${v.publication ?? 'unrecorded'}`,
    `ARTIFACTS ${v.artifactManifest ?? 'legacy path in result; no integrity manifest'}`,
    ...(v.error ? [`ERROR ${v.error}`, `RECOVERY ${v.recovery}`] : [])];
}
export const decisionNeedsRun = task => Boolean(task.workflow && ['selected','changes_requested'].includes(task.workflow.review));
