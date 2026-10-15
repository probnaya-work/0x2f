import { supervisionStatus, supervisionDir, readAttempt, jobState, groupMembers, attemptIdentityMatches, externalDefinition, assertDefinitionSupervised, verifyAttemptArchive, restrictedAttemptOutput } from './workflow-supervision.mjs';
import { workflowKind } from '../workflows/registry.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { readDefinition, dueSlot, workflowLock } from './workflows.mjs';
import { validateSchedule, validateTaskWorkflow, validateSnapshot, parseWorkflowJson, schema } from './workflow-schema.mjs';
import { readSourceFile } from './workflow-sources.mjs';
import { schedulerStatus } from './workflow-scheduler.mjs';
import { probeLock } from './lock.mjs';
import { identityMatches, processIdentity } from './process-identity.mjs';
import { verifyExecutable } from './workflow-adapters.mjs';
import { verifyArtifacts } from './workflow-artifacts.mjs';
import { replayWorkflowOperation } from './workflow-transaction.mjs';
import { backupFile, syncDirectory } from './durable.mjs';
import { failInterruptedRun, pidAlive } from '../recover.mjs';
const entries = dir => fs.readdir(dir,{withFileTypes:true}).catch(e=>{if(e.code==='ENOENT')return [];throw e;});
async function tempFiles(root) {
  const out=[];
  async function walk(dir) {
    for(const entry of await entries(dir)) {
      if(entry.name==='.backups'||entry.isSymbolicLink())continue;
      const file=path.join(dir,entry.name);
      if(entry.isDirectory())await walk(file);
      else if(entry.isFile()&&entry.name.startsWith('.')&&entry.name.endsWith('.tmp'))out.push(file);
      if(out.length>1000)throw new Error('Too many temporary files; inspect manually.');
    }
  }
  await walk(root);return out;
}
// Read-only, including lock probes: no runtime startup recovery, no mkdir.
export async function workflowDoctor(store, { now = new Date() } = {}) {
  const issues = [], definitions = [], schedules = [], tasks = [], ids = new Set();
  const problem = (severity, code, target, error, recovery) => issues.push({severity,code,target,message:String(error?.message ?? error),recovery});
  for (const entry of await entries(path.join(store.workDir(),'workflows'))) {
    if (!entry.isDirectory()) { if (entry.isSymbolicLink()) problem('HIGH','SYMLINK',entry.name,'Symlink definition directory','Restore a regular directory from trusted backup.'); continue; }
    try {
      const d = await readDefinition(store,entry.name); const safety={external:externalDefinition(d),unattended:true};
      try{await assertDefinitionSupervised(store,d);}catch{safety.unattended=false;safety.reason='External adapter requires reviewed policy, explicit permission and healthy matching supervisor.';}
      definitions.push({id:d.id,version:d.version,schemaVersion:d.schemaVersion,safety});
      if(!safety.unattended)problem('HIGH','UNATTENDED_ADAPTER',d.id,safety.reason,'workflow supervisor install|repair; review permissions/policy. Network/paid adapters remain blocked.');
      for (const source of d.sources) {
        for (const file of source.files) {
          await readSourceFile(source.sourcePin, file);
        }
      }
    } catch (error) { problem('HIGH','DEFINITION_OR_SOURCE',entry.name,error,'Correct the definition/source explicitly; refresh existing tasks only after review.'); }
  }
  for (const entry of await entries(path.join(store.workDir(),'schedules'))) {
    if (!entry.name.endsWith('.json')) continue;
    try { const s = validateSchedule(await store.readJson(path.join(store.workDir(),'schedules',entry.name))); if (entry.name !== `${s.id}.json`) throw new Error('Schedule filename/id mismatch.'); schedules.push({...s,dueSlot:dueSlot(s,now)}); }
    catch(error) { problem('HIGH','SCHEDULE',entry.name,error,'Restore this file from .backups or correct JSON explicitly; keep it paused until verified.'); }
  }
  for (const entry of await entries(store.tasksDir())) {
    if (entry.name.startsWith('.creating-')) { problem('MEDIUM','STAGED_CREATE',entry.name,'Task allocation interrupted before visibility','workflow repair staging: removes hidden staging only; IDs remain reserved.'); continue; }
    if (!entry.isDirectory()) { if(entry.isSymbolicLink()) problem('HIGH','SYMLINK',entry.name,'Symlink task directory','Restore a regular directory from trusted backup.'); continue; }
    let task;
    try {
      task = await store.readJson(path.join(store.taskDir(entry.name),'task.json'));
      if (!Number.isSafeInteger(task.id) || task.id < 1 || task.slug !== entry.name) throw new Error('Invalid task identity.');
      if(ids.has(task.id))problem('HIGH','DUPLICATE_TASK_ID',task.id,'More than one visible task has this ID','Restore the conflicting task metadata from trusted backups before any mutation.');
      ids.add(task.id);
      if (!task.workflow) continue;
      validateTaskWorkflow(task.workflow); validateSnapshot(task.workflow.definition);
      const isAlive = task.workerIdentity ? await identityMatches(task.workerIdentity) : pidAlive(task.pid);
      tasks.push({id:task.id,workflow:task.workflow.id,version:task.workflow.version,status:task.status,run:task.runs?.at(-1)?.run,trigger:task.workflow.trigger,triggerKey:task.workflow.triggerKey,review:task.workflow.review ?? 'pending',selected:task.workflow.selected ?? null,publication:task.workflow.publication ?? null,waitingForDecision:task.status==='needs_you',workerVerified:isAlive && Boolean(task.workerIdentity)});
      if (task.status==='working' && !isAlive) problem('HIGH','ORPHANED_RUN',task.id,'Worker identity is gone or changed','workflow recover <task-id>; then rerun explicitly.');
      if (task.status==='working' && !task.workerIdentity) problem('HIGH','LEGACY_WORKER',task.id,'Live PID without birth identity','Stop the known legacy worker externally; recover refuses a live unknown PID.');
      try { await store.readEvents(task.slug); } catch(error) { problem('HIGH','EVENT_LOG',task.id,error,'workflow repair events <task-id>: only truncates an invalid final line, with backup. Interior damage needs manual restoration.'); }
      for (const [name,pin] of Object.entries(task.workflow.definition.adapterPins ?? {})) { try { await verifyExecutable(pin); } catch(error) { problem('HIGH','ADAPTER_DRIFT',`${task.id}:${name}`,error,'Inspect executable, then workflow refresh <task-id>.'); } }
      if (task.workflow.manifest) { try { await verifyArtifacts(store,task); } catch(error) { problem('HIGH','ARTIFACT',task.id,error,'Restore archived bytes from backup; or select/changes and rerun to prepare a new package.'); } }
      for (const binding of workflowKind(task.workflow.definition.kind).checkpoints ?? []) {
        const checkpoint = path.join(store.taskDir(task.slug), binding.path);
        if (await store.exists(checkpoint)) {
          try { binding.validate(await store.readJson(checkpoint)); }
          catch (error) { problem('HIGH','SOURCE_CHECKPOINT',task.id,error,'Restore the exact frozen evidence from a trusted backup; do not silently recollect sources.'); }
        }
      }
      for (const opEntry of await entries(path.join(store.taskDir(task.slug),'operations'))) {
        if (!opEntry.name.endsWith('.json')) continue;
        const op = schema(await store.readJson(path.join(store.taskDir(task.slug),'operations',opEntry.name)),'operation');
        if (op.state!=='complete') problem('HIGH','PENDING_OPERATION',`${task.id}:${op.operationId}`,'Durable local intent was not fully committed','workflow recover <task-id>: replays only matching local journal; never retries external calls.');
      }
      const temporary=await tempFiles(store.taskDir(task.slug));
      if(temporary.length)problem('LOW','TEMPORARY_FILES',task.id,`${temporary.length} uncommitted temporary files`,'workflow repair temps <task-id>: backs up and removes only hidden .tmp files of an inactive workflow.');
      for (const receiptFile of workflowKind(task.workflow.definition.kind).receiptFiles ?? []) {
      const attempt = path.join(store.taskDir(task.slug),receiptFile);
      if (await store.exists(attempt)) { const receipt=schema(await store.readJson(attempt),'external receipt'); if(receipt.state!=='complete') problem('HIGH','UNCERTAIN_EXTERNAL',task.id,`External attempt is ${receipt.state}`,'Inspect provider account/output manually. This receipt is never deleted or automatically retried.'); }
      }
    } catch(error) { problem('HIGH','TASK_STATE',task?.id ?? entry.name,error,'Restore affected file from a trusted backup; future schemas require a compatible runtime.'); }
  }
  const locks = [];
  for (const name of ['workflow-lock','task-create-lock']) {
    try {
    const root=path.join(store.workDir(),name), probe=await probeLock(root); locks.push({name,...probe});
    const owner=await store.readText(path.join(root,'owner.json'),null);
    if(probe.error)problem('HIGH','LOCK_HELPER',name,probe.error,'Install Python 3 with POSIX fcntl, or set WORKFLOW_LOCK_PYTHON.');
    if(!probe.locked && owner) problem('LOW','STALE_LOCK_DIAGNOSTIC',name,'No kernel holder; owner.json is diagnostic residue','workflow repair locks: removes diagnostics only when the kernel lock can be acquired.');
    const legacy=await fs.readlink(path.join(root,'active')).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
    if(legacy) problem('MEDIUM','LEGACY_LOCK',name,`Legacy owner ${legacy}; PID alone cannot establish identity`,'workflow repair locks only removes dead legacy owners. Live/unknown owners require stopping the legacy runtime.');
    } catch (error) { problem('HIGH','LEGACY_LOCK',name,error,'Inspect and explicitly restore the malformed lock path; no lock is removed by doctor.'); }
  }
  let scheduler; try { scheduler=await schedulerStatus(store); if((scheduler.configured||scheduler.installed)&&!scheduler.matching) problem('HIGH','SCHEDULER_DRIFT','LaunchAgent',scheduler.drift.join('; '),'workflow agent repair after compatibility checks.'); }
  catch(error) { problem('HIGH','SCHEDULER_STATE','LaunchAgent',error,'Restore installation record from backup or explicit reinstall.'); }
  let supervisor;
  try{supervisor=await supervisionStatus(store);}catch{supervisor={installed:true,healthy:false,error:'INVALID_SUPERVISOR_STATE'};problem('HIGH','SUPERVISOR_STATE','supervision','Supervisor cannot be inspected','Restore trusted installation state explicitly.');}
  const attempts=[];
  for(const entry of await entries(path.join(supervisionDir(store),'attempts'))) {
    if(!entry.isDirectory())continue;
    try {
      const r=await readAttempt(store,entry.name), job=await jobState(r.request.label);
      const members=r.pgid?await groupMembers(r.pgid):[];
      const mismatch=Boolean(job.pid&&r.owner&&(job.pid!==r.owner.pid||!await attemptIdentityMatches(r.owner)));
      if(['validated','promoted'].includes(r.state))await verifyAttemptArchive(store,r);
      const staging=await store.exists(path.join(supervisionDir(store),'attempts',entry.name,'output'));
      attempts.push({id:entry.name,taskId:r.request.taskId,run:r.request.run,state:r.state,reason:r.reason??null,active:Boolean(job.pid),identityMismatch:mismatch,survivingGroup:!job.pid&&members.length>0,incompleteHandshake:['prepared','owned'].includes(r.state),unpromotedStaging:staging,pendingReconciliation:!job.pid&&!['promoted','reconciled'].includes(r.state),restrictedOutput:restrictedAttemptOutput(r),cleanupRequired:restrictedAttemptOutput(r)});
      if(mismatch||(!job.pid&&members.length)||['uncertain','needs_reconciliation'].includes(r.state)||!job.pid&&!['promoted','reconciled','validated','cancelled','failed'].includes(r.state))problem('HIGH','ATTEMPT_UNCERTAIN',entry.name,'External ownership/outcome requires reconciliation','workflow attempt status <id>; cancel only verified native job; reconcile <id> <decision>; cleanup <id>. No automatic retry.');
      else if(staging&&!job.pid&&r.state!=='reconciled')problem('MEDIUM','UNPROMOTED_STAGING',entry.name,r.state,'Reconcile explicitly before cleanup.');
    }catch{problem('HIGH','ATTEMPT_RECEIPT',entry.name,'Corrupt/incomplete attempt; no signal or promotion allowed','Restore exact receipt from trusted backup; never fabricate ownership.');}
  }
  return {schemaVersion:1,supervisor,attempts,checkedAt:now.toISOString(),healthy:!issues.some(i=>['BLOCKER','HIGH'].includes(i.severity)),definitions,schedules,tasks,locks,scheduler,issues};
}
export async function recoverWorkflow(store,id) {
  return workflowLock(store,async()=>{
    let task=await store.findTask(id); if(!task.workflow) throw new Error('This is not a workflow task.');
    schema(task.workflow,'task workflow');
    const actual=await processIdentity(task.pid);
    if(task.status==='working' && (await identityMatches(task.workerIdentity) || (!task.workerIdentity && actual))) throw new Error('Worker may still be live; stop it before recovery.');
    for(const entry of await entries(path.join(store.taskDir(task.slug),'operations'))) {
      if(!entry.name.endsWith('.json'))continue;
      const file=path.join(store.taskDir(task.slug),'operations',entry.name), op=schema(await store.readJson(file),'operation');
      if(op.state!=='complete') await replayWorkflowOperation(store,task,op,file);
    }
    task=await store.findTask(id);
    if(task.status==='working') task=await failInterruptedRun(store,task,{log:()=>{}});
    return task;
  });
}
export async function repairWorkflow(store,kind,id) {
  return workflowLock(store,async()=>{
    if(kind==='temps') {
      const task=await store.findTask(id);if(!task.workflow||task.status==='working'||task.blockedOn?.live)throw new Error('Only inactive workflow temporary files can be repaired.');
      const files=await tempFiles(store.taskDir(task.slug)),backups=[];
      for(const file of files){backups.push(await backupFile(file));await fs.rm(file);await syncDirectory(path.dirname(file));}return {removed:files,backups};
    }
    if(kind==='events') {
      const task=await store.findTask(id); if(task.status==='working')throw new Error('Stop worker before repairing event log.');
      const file=store.eventLogPath(task.slug), text=await store.readText(file);
      const lines=text.split('\n'); if(lines.at(-1)==='')lines.pop();
      const tail=lines.pop(); if(!tail)throw new Error('No damaged tail.');
      const parse = line => { const event = parseWorkflowJson(line, 'Event log'); if (!event || typeof event.type !== 'string') throw new Error('Missing event type.'); };
      let validTail = false; try { parse(tail); validTail = true; } catch {}
      if (validTail && text.endsWith('\n')) throw new Error('Final line is valid; no repair necessary.');
      for(const line of lines)if(line.trim())parse(line);
      const backup=await backupFile(file);
      await store.writeText(file, validTail ? text + '\n' : lines.length ? lines.join('\n')+'\n' : ''); return {repaired:file,backup};
    }
    if(kind==='locks') {
      const cleaned=[];
      for(const name of ['workflow-lock','task-create-lock']) {
        const root=path.join(store.workDir(),name);
        // Acquire the actual mutex before editing diagnostics; do not delete .mutex.
        const legacy=await fs.readlink(path.join(root,'active')).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
        if(legacy) { if(!/^\d+-[a-zA-Z0-9-]+$/.test(legacy)||pidAlive(Number(legacy.split('-')[0]))) throw new Error('Legacy owner is live/unknown. Refusing PID-based lock stealing.'); await fs.unlink(path.join(root,'active')); }
        if(!(await probeLock(root)).locked && name!=='workflow-lock') { const {withLock}=await import('./lock.mjs'); await withLock(root,()=>{}); }
        cleaned.push(name);
      }
      return {cleaned};
    }
    if(kind==='staging') {
      const { withLock } = await import('./lock.mjs');
      return withLock(path.join(store.workDir(),'task-create-lock'), async () => {
      const removed=[];
      for(const entry of await entries(store.tasksDir())) if(entry.isDirectory()&&entry.name.startsWith('.creating-')) { await fs.rm(path.join(store.tasksDir(),entry.name),{recursive:true});removed.push(entry.name); }
      if(removed.length)await syncDirectory(store.tasksDir());return {removed,idsRetained:true};
      });
    }
    throw new Error('Use workflow repair events <task-id> | locks | staging.');
  });
}
