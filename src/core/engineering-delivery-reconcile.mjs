// Reconcile one consumed local-commit operation. Only task evidence is written;
// the repository, including stale locks, refs, index and hooks, is read-only.
import path from 'node:path';
import { withEngineeringLock } from './engineering.mjs';
import { WorkError } from './errors.mjs';
import { crashPoint } from './faults.mjs';
import { handoffHash as hash } from './engineering-handoff.mjs';
import { readBounded } from './durable.mjs';
import { deliveryBinding, deliveryConfiguration, deliveryObservation, readDeliveryGit as git, localCommitBytes, localCommitOid } from './engineering-delivery-intent.mjs';

export async function reconcileLocalCommit(ctx, id) {
  const initial = await ctx.store.findTask(id);
  if (!initial.engineering?.delivery) throw new WorkError('No local commit operation to reconcile.');
  return withEngineeringLock(ctx.store,initial.slug,async()=>{
    const task = await ctx.store.findTask(id), d = task.engineering.delivery, p = d.preview;
    if (!['running','uncertain','failed','committed','reconciled'].includes(d.state)) throw new WorkError('Reconciliation requires an attempted local commit.');
    const root = ctx.store.taskDir(task.slug), dir = path.join(root,'delivery',d.scopeDigest);
    let intent, observed = null, commit = null, reachable = null, result = 'UNCERTAIN', receipt = d.receipt ?? null;
    const reasons = [];
    // The durable result is authoritative even when a crash prevented its
    // task pointer from being installed. Never rewrite an existing observation.
    if (d.reconciliation || await ctx.store.exists(path.join(dir,'reconciliation.json'))) {
      const saved = await ctx.store.readJson(path.join(dir,'reconciliation.json'));
      const { digest, ...body } = saved;
      if (digest!==hash(body) || d.reconciliation && hash(saved)!==d.reconciliation.digest || hash(p)!==d.scopeDigest || saved.taskId!==task.id || saved.slug!==task.slug || saved.run!==task.runs.at(-1).run || saved.operationId!==p.proposalId || saved.scopeDigest!==d.scopeDigest || saved.intentDigest!==(d.intentDigest??null) || !['APPLIED','NOT_APPLIED','UNCERTAIN'].includes(saved.result)) throw new WorkError('Reconciliation evidence changed; no new observation or retry allowed.');
      if (saved.result==='APPLIED') {
        const i = await ctx.store.readJson(path.join(dir,'intent.json'));
        const r = await ctx.store.readJson(path.join(root,`delivery/${d.scopeDigest}/receipt.json`));
        if (hash(i)!==d.intentDigest || saved.commit!==i.expectedCommit || saved.receipt?.path!==`delivery/${d.scopeDigest}/receipt.json` || hash(r)!==saved.receipt.digest || r.commit!==saved.commit || r.scopeDigest!==d.scopeDigest || r.operationId!==saved.operationId || r.intentDigest!==d.intentDigest) throw new WorkError('Saved reconciliation receipt/intent changed.');
      }
      return d.reconciliation ? task : projectResult(ctx,task,saved);
    }
    try {
      if (!/^[a-f0-9]{64}$/.test(d.scopeDigest) || hash(p)!==d.scopeDigest || p.taskId!==task.id || p.slug!==task.slug || hash(await ctx.store.readJson(path.join(dir,'preview.json')))!==d.scopeDigest) throw new Error('Commit preview identity changed.');
      intent = await ctx.store.readJson(path.join(dir,'intent.json'));
      if (intent.schemaVersion!==2 || hash(intent)!==d.intentDigest || intent.scopeDigest!==d.scopeDigest || intent.taskId!==task.id || intent.slug!==task.slug || intent.run!==task.runs.at(-1).run || intent.operationId!==p.proposalId || intent.operationId!==d.operationId || intent.workspaceIdentity!==p.workspaceIdentity || intent.parent!==p.parent || intent.tree!==p.tree || intent.diffDigest!==p.diffDigest || intent.messageDigest!==hash(p.message) || intent.grantDigest!==hash(d.grant)) throw new Error('Exact durable operation identity is missing or changed; legacy attempts cannot be inferred.');
      const bytes = localCommitBytes(p,intent.operationId,intent.stamp);
      if (hash(bytes)!==intent.commitBytesDigest || localCommitOid(bytes,intent.configuration.objectFormat)!==intent.expectedCommit) throw new Error('Intended commit bytes changed.');
      const w = await deliveryBinding(ctx.store,task,p);
      if (hash(w.physical)!==hash(intent.physical) || hash(await deliveryConfiguration(w))!==hash(intent.configuration)) throw new Error('Repository/worktree/configuration identity changed.');
      observed = await deliveryObservation(w);
      let actual;
      try { actual = await git(w.path,['cat-file','commit',intent.expectedCommit],true); }
      catch (e) {
        // Absence alone never proves no effect. Only the pre-dispatch boundary
        // (durable intent, no started marker, unchanged refs/reflog) can do so.
        if (e.code!==128 || !/bad file|could not get object info|Not a valid object name/i.test(e.stderr??'')) throw e;
        actual = null;
      }
      if (actual !== null) {
        if (actual!==bytes) throw new Error('Found commit does not carry the exact intended operation bytes.');
        const diff = await git(w.path,['diff-tree','--no-commit-id','-p','--binary','--full-index','--no-ext-diff','--no-textconv','--no-renames',p.parent,intent.expectedCommit,'--'],true);
        if (hash(diff)!==intent.diffDigest) throw new Error('Found commit diff differs from the approved artifact.');
        reachable = await git(w.path,['merge-base','--is-ancestor',intent.expectedCommit,observed.head]).then(()=>true,e=>{if(e.code===1)return false;throw e;});
        commit = intent.expectedCommit; result = 'APPLIED';
        reasons.push('Exact operation-bound commit object found. Reachability is a separate observation.');
      } else {
        const started = await ctx.store.exists(path.join(dir,'effect.json'));
        let dispatcherStopped = d.state==='failed';
        if (!dispatcherStopped && Number.isInteger(intent.workerPid) && intent.workerPid>0) {
          try { process.kill(intent.workerPid,0); } catch (e) { if(e.code==='ESRCH') dispatcherStopped=true; else throw e; }
        }
        if (dispatcherStopped && !started && !observed.truncated && observed.head===p.parent && observed.headRef===null && hash(observed)===hash(intent.before)) {
          result = 'NOT_APPLIED'; reasons.push('Stopped worker never crossed the durable effect-start boundary; intended object absent and refs/reflog unchanged.');
        } else reasons.push('Intended object absent, but effect-start or repository changes prevent proof of absence.');
      }
      if (hash(await deliveryObservation(w))!==hash(observed)) { result='UNCERTAIN'; commit=null; reachable=null; reasons.push('Repository refs/reflog changed during observation.'); }
      if (result==='APPLIED' && receipt) {
        const r = await ctx.store.readJson(path.join(root,receipt.path));
        if (hash(r)!==receipt.digest || r.scopeDigest!==d.scopeDigest || r.commit!==commit || r.operationId!==intent.operationId || r.intentDigest!==d.intentDigest) throw new Error('Existing receipt identity changed.');
      }
    } catch (e) { result='UNCERTAIN'; commit=null; reachable=null; receipt=null; reasons.push(e.message); }
    const evidence = { schemaVersion:1, taskId:task.id, slug:task.slug, run:task.runs.at(-1).run, operationId:p.proposalId, scopeDigest:d.scopeDigest, intentDigest:d.intentDigest??null, mode:'read-only', result, commit, reachableFromHead:reachable, observed, reasons, at:new Date().toISOString() };
    if (result==='APPLIED' && !receipt) {
      const r = { schemaVersion:1, capability:'git.localCommit', scopeDigest:d.scopeDigest, operationId:intent.operationId, intentDigest:d.intentDigest, grant:d.grant, consumedAt:d.consumedAt, taskId:task.id, artifact:p.artifact, repository:p.repository, worktree:p.worktree, parent:p.parent, tree:p.tree, diffDigest:p.diffDigest, message:p.message, commit, reconciled:true, at:evidence.at };
      receipt={path:`delivery/${d.scopeDigest}/receipt.json`,digest:hash(r)};
      await ctx.store.writeJson(path.join(root,receipt.path),r);
    }
    evidence.receipt = result==='APPLIED'?receipt:null;
    const saved = {...evidence,digest:hash(evidence)};
    await ctx.store.writeJson(path.join(dir,'reconciliation.json'),saved);
    crashPoint('local-commit.reconciliation-saved');
    return projectResult(ctx,task,saved);
  });
}

async function projectResult(ctx,task,evidence) {
  const d = task.engineering.delivery;
  const { result, commit, reachableFromHead, reasons, at, receipt } = evidence;
  const reconciliation = { result, digest:hash(evidence), operationId:evidence.operationId, path:`delivery/${d.scopeDigest}/reconciliation.json`, commit, reachableFromHead, head:evidence.observed?.head??null, reasons, at };
  await ctx.store.updateTask({...task,status:result==='APPLIED'?'ready':'needs_you',blockedOn:result==='APPLIED'?undefined:{type:'decision',code:'local_commit_'+result.toLowerCase(),text:reasons.join(' ')+' No automatic retry; a new attempt requires a fresh preview/grant.'},engineering:{...task.engineering,revision:task.engineering.revision+1,next:result==='APPLIED'?'accept':'user',delivery:{...d,state:result==='APPLIED' && d.state==='committed'?'committed':'reconciled',commit,receipt:result==='APPLIED'?receipt:null,reconciliation}}});
  return ctx.store.findTask(task.id);
}
