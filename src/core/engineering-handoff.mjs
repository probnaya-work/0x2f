// Purpose-specific engineering inputs. Audit history is measured, never fed
// wholesale to the next executor. References stay inside this durable task.
import path from 'node:path';
import { createHash } from 'node:crypto';
import { readBounded } from './durable.mjs';

export const handoffHash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const purposes = ['investigate', 'implement', 'fix', 'verify', 'review'];
const relative = p => typeof p === 'string' && p && !path.isAbsolute(p) && !p.split(/[\\/]/).some(x => !x || x === '.' || x === '..');

export function engineeringIntent(task) {
  return handoffHash({ id: task.id, slug: task.slug, brief: task.brief, context: task.context ?? null, config: task.engineering.configDigest, workspace: task.engineering.workspace ?? null });
}

async function refBytes(store, task, ref) {
  if (!relative(ref?.path) || !/^[a-f0-9]{64}$/.test(ref.digest ?? '')) throw new Error('Invalid engineering handoff reference.');
  const file = path.join(store.taskDir(task.slug), ref.path);
  const bytes = await readBounded(file, 8000000);
  if (ref.encoding === 'json' ? handoffHash(JSON.parse(bytes.toString())) !== ref.digest : handoffHash(bytes) !== ref.digest) throw new Error('Handoff evidence changed.');
  if (ref.manifest) {
    const m = JSON.parse(bytes.toString());
    for (const p of ref.files ?? []) {
      if (!relative(p) || !m.files?.[p]) throw new Error('Invalid handoff source file.');
      const source = await readBounded(path.join(path.dirname(file), 'files', p), 2000000);
      if (handoffHash(source) !== m.files[p].sha256) throw new Error('Handoff source snapshot changed.');
    }
  }
}

export async function createHandoff(store, task, { run, purpose, source, artifact, verification, diagnosis, failedCheck, executorFailure, questions = [] }) {
  if (!purposes.includes(purpose)) throw new Error('Unsupported engineering purpose.');
  const original = await store.readText(path.join(store.taskDir(task.slug), 'prompt.md'), '');
  const events = await store.readEvents(task.slug);
  const refs = {};
  const add = (key, ref) => { if (ref) refs[key] = { ...ref, encoding: ref.encoding ?? 'json' }; };
  add('original', { path: 'prompt.md', digest: handoffHash(original), encoding: 'text' });
  const snapshot = ref => ref && ({ ...ref, manifest: true, files: task.engineering.config.files });
  if (purpose !== 'verify') add('source', snapshot(source));
  if (executorFailure) add('priorFailure', { path: executorFailure.resultRef, digest: executorFailure.resultDigest, encoding: 'text' });
  if (purpose === 'investigate') add('priorDiagnosis', task.engineering.playbook?.unconfirmedDiagnosis);
  if (['implement', 'fix'].includes(purpose)) add('diagnosis', diagnosis);
  if (['fix', 'verify', 'review'].includes(purpose)) add('artifact', snapshot(artifact));
  if (['fix', 'review'].includes(purpose)) add('verification', verification);
  if (purpose === 'fix') add('review', task.engineering.playbook?.review);
  if (purpose === 'review') add('diagnosis', diagnosis);
  if (purpose === 'review') add('baseline', snapshot(task.engineering.playbook?.baseline));
  const content = {
    schemaVersion: 1, taskId: task.id, slug: task.slug, run, purpose,
    intentDigest: engineeringIntent(task), brief: task.brief,
    scope: task.engineering.config.writePaths,
    constraints: task.context?.notes ?? [],
    decisions: events.filter(e => e.type === 'task.answered').map(e => ({ at: e.at, answer: e.answer })),
    prohibited: ['commit', 'push', 'PR', 'merge', 'deploy', 'publication', 'new credentials/provider'],
    taskDirectory: store.taskDir(task.slug), workspace: task.engineering.workspace?.path ?? store.base,
    refs,
    ...(purpose === 'investigate' ? { symptoms: task.brief, question: 'Read only. Establish a diagnosis supported by concrete evidence, or explain why no change is required. Return JSON matching outputContract; do not change files.', outputContract: { diagnosis: { confirmed: 'boolean', noChange: 'boolean', evidence: [{ path: 'relative source path', sha256: 'exact source hash' }] } } } : {}),
    ...(['implement', 'fix'].includes(purpose) ? { files: task.engineering.config.files, ...(failedCheck ? { failedCheck, previousArtifact: artifact } : {}), ...(task.engineering.playbook?.fixFindings ? { confirmedReviewFindings: task.engineering.playbook.fixFindings } : {}), ...(executorFailure ? { executorFailure } : {}) } : {}),
    ...(purpose === 'verify' ? { check: task.engineering.config.check, claimedOutcome: 'Check the exact saved artifact.' } : {}),
    ...(purpose === 'review' ? { freshContext: true, questions, permittedChecks: Object.keys(task.engineering.config.reviewChecks ?? {}), outputContract: { review: { findings: [{ severity: 'low|medium|high|critical', message: 'concrete defect', evidence: { path: 'affected path', sha256: 'exact artifact file hash', artifactDigest: 'exact artifact content digest' }, checkId: 'preapproved reproduction check, if available' }] } }, instruction: 'Review only the approved changes and receipts. Return JSON matching outputContract. Do not implement or change files.' } : {})
  };
  let auditRefs;
  if(task.engineering.economics?.policy) {
    delete refs.original;
    auditRefs=structuredClone(refs);
    const lean={};
    for(const [key,ref] of Object.entries(refs)) {
      const reason=key==='source'?'current approved inputs':key==='priorFailure'?'observable predecessor failure':key==='baseline'?'exact review comparison':key==='artifact'?'verify or correct exact artifact':'required '+purpose+' evidence';
      if(ref.manifest) {
        const manifest=await store.readJson(path.join(store.taskDir(task.slug),ref.path));
        lean[key]={reason,contentDigest:ref.contentDigest,files:(ref.files??[]).filter(p=>manifest.files[p]).map(p=>({path:p,...manifest.files[p],snapshotPath:path.join(path.dirname(ref.path),'files',p)}))};
      } else {
        lean[key]={reason,archive:{path:ref.path,digest:ref.digest}};
        if(key==='priorFailure')lean[key].summary=(await store.readText(path.join(store.taskDir(task.slug),ref.path),'')).slice(-512);
      }
    }
    content.schemaVersion=2;content.refs=lean;content.evidenceDigest=handoffHash(auditRefs);
    delete content.files;delete content.previousArtifact;delete content.executorFailure;
    const cwd=task.engineering.workspace?.path??store.base;
    const instructionFiles=new Set(['AGENTS.md']);
    for(const file of task.engineering.config.files){let dir=path.dirname(file);while(dir!=='.'){instructionFiles.add(path.join(dir,'AGENTS.md'));dir=path.dirname(dir);}}
    content.instructions=[];
    for(const file of instructionFiles){const target=path.join(cwd,file);try{const bytes=await readBounded(target,8192);content.instructions.push({path:file,digest:handoffHash(bytes),text:bytes.toString(),reason:'applicable repository instructions'});}catch(e){if(e.code!=='ENOENT')throw Object.assign(e,{code:'context_limit'});}}
    if(content.failedCheck?.output){
      const output=String(content.failedCheck.output),file=`runs/${run}/context/failed-check-output.txt`;
      await store.writeText(path.join(store.taskDir(task.slug),file),output);
      auditRefs.failedCheckOutput={path:file,digest:handoffHash(output),encoding:'text'};
      content.evidenceDigest=handoffHash(auditRefs);
      content.failedCheck={...content.failedCheck,output:Buffer.from(output).subarray(-1024).toString(),fullOutput:{path:file,digest:handoffHash(output)},inclusionReason:'exact failing check for focused correction'};
    }
    content.contextPolicy={toolOutputBytes:task.engineering.economics.policy.soft.toolOutputBytes,instruction:'Read only approved source/snapshots and necessary instructions. Save full tool/test output as a local artifact; return at most this many bytes and a concise failure. No broad repository dump or full previous reports.',harnessEnforcement:'unknown'};
  }
  let fullHistoryBytes = Buffer.byteLength(original) + Buffer.byteLength(JSON.stringify(events));
  for (const r of task.runs) fullHistoryBytes += Buffer.byteLength(await store.readRunResult(task, r));
  const bytes = Buffer.byteLength(JSON.stringify(content));
  const parts=Object.entries(content).map(([name,value])=>({name,bytes:Buffer.byteLength(JSON.stringify(value)),reason:name==='refs'?'purpose-specific evidence':name==='instructions'?'repository contract':'current task contract'}));
  const contextManifest={totalBytes:bytes,parts,overheadBytes:bytes-parts.reduce((n,p)=>n+p.bytes,0),harnessInjectedContext:'unknown'};
  if(task.engineering.economics?.policy&&bytes>task.engineering.economics.policy.hard.inputBytes)throw Object.assign(new Error('Controller input exceeds hard byte budget; no provider call.'),{code:'context_limit'});
  return { content, ...(auditRefs?{auditRefs}:{}), digest: handoffHash(content), metrics: { bytes, fullHistoryBytes, smallerThanHistory: bytes < fullHistoryBytes,contextManifest } };
}

export async function verifyHandoff(store, task, handoff, { run, sourceDigest } = {}) {
  const c = handoff.content;
  if (handoffHash(c) !== handoff.digest || c.taskId !== task.id || c.slug !== task.slug || c.intentDigest !== engineeringIntent(task) || c.run !== (run ?? task.runs.at(-1).run)) throw new Error('Stale engineering handoff; task intent or run changed.');
  const refs=handoff.auditRefs??c.refs;
  if(handoff.auditRefs&&handoffHash(handoff.auditRefs)!==c.evidenceDigest)throw new Error('Handoff audit references changed.');
  if (sourceDigest && refs.source?.contentDigest !== sourceDigest) throw new Error('Stale engineering handoff; workspace bytes changed.');
  for (const ref of Object.values(refs)) await refBytes(store, task, ref);
  for(const instruction of c.instructions??[]){const bytes=await readBounded(path.join(task.engineering.workspace?.path??store.base,instruction.path),8192);if(handoffHash(bytes)!==instruction.digest)throw new Error('Repository instructions changed before dispatch.');}
  return c;
}
