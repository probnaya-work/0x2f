import { WorkError } from '../core/errors.mjs';
import { https } from '../core/workflow-schema.mjs';
// Decisions are content judgments, never permissions for outside actions.
export function editorialDecision(task, answer) {
  const parts = answer.match(/^(select|accept|changes|defer|reject|published)\b\s*([\s\S]*)$/i);
  if (!parts) throw new WorkError('Use select N, accept, changes N <replacement post>, defer, reject, or published <https URL>.');
  const action = parts[1].toLowerCase(), value = parts[2].trim();
  if (['accept','defer','reject'].includes(action) && value) throw new WorkError('This decision takes no additional value.');
  if (action === 'accept' && task.workflow.acceptedDigest === task.workflow.packageDigest && ['accepted','published'].includes(task.workflow.review)) return task;
  if (action === 'published' && task.workflow.publication?.url === value && task.workflow.publication?.packageDigest === task.workflow.packageDigest) return task;
  const w = { ...task.workflow, decisions: [...(task.workflow.decisions ?? []), { schemaVersion: 1, action, value, at: new Date().toISOString() }] };
  if (action === 'select' || action === 'changes') {
    const match = value.match(/^(\d+)(?:\s+([\s\S]+))?$/);
    if (!match || Number(match[1]) < 1 || Number(match[1]) > 3 || (action === 'changes' && !match[2])) throw new WorkError('Specify topic 1..3 and, for changes, the full replacement post.');
    if (Number(match[1]) > (w.topicKeys?.length ?? 0)) throw new WorkError("This topic is absent from the package.");
    w.selected = Number(match[1]);
    w.review = action === 'changes' ? 'changes_requested' : 'selected';
    if (action === 'changes') w.corrections = { ...(w.corrections ?? {}), [w.selected]: match[2] };
    delete w.acceptedDigest;
    w.packageComplete = false;
  } else if (action === 'accept') {
    if (!w.packageDigest || !w.packageComplete) throw new WorkError('Select a topic and rerun to create the complete review package before accepting.');
    w.review = 'accepted'; w.acceptedDigest = w.packageDigest;
  } else if (action === 'published') {
    if (w.review !== 'accepted' || w.acceptedDigest !== w.packageDigest) throw new WorkError('Accept the current package before recording publication.');
    let url; try { url = new URL(value); } catch { throw new WorkError('Publication needs an https link.'); }
    https(value);
    if (url.protocol !== 'https:') throw new WorkError('Publication needs an https link.');
    w.review = 'published'; w.publication = { url: value, at: new Date().toISOString(), packageDigest: w.packageDigest };
    w.publications = [...(w.publications ?? []), w.publication];
  } else { w.review = action === 'defer' ? 'deferred' : 'rejected'; }
  return { ...task, workflow: w,
    ...(['select', 'changes'].includes(action) ? {
      status: 'needs_you', blockedOn: { type: 'decision', text: 'Selection or correction saved. Rerun to prepare its package, then review.' }
    } : {})
  };
}
