// Bounded engineering economics, shared by the two existing drivers. No pricing
// guesses: only runtime qualification evidence can certify a model tier/ceiling.
import path from 'node:path';
import { withLock } from './lock.mjs';
import { handoffHash as hash } from './engineering-handoff.mjs';
export const tokenKeys=['input','cachedInput','output','reasoning','total'];
const names={input:'input_tokens',cachedInput:'cached_input_tokens',output:'output_tokens',reasoning:'reasoning_output_tokens',total:'total_tokens'};
const number=n=>Number.isSafeInteger(n)&&n>=0?n:null;
export function normalizeTokenEvents(events,semantics='attempt-cumulative') {
  const values=Object.fromEntries(tokenKeys.map(k=>[k,null]));let previous=null;const seen=new Set();let accepted=0;
  for(const e of events??[]) {
    const id=e.id??hash(e);if(seen.has(id))continue;seen.add(id);
    const raw=e.usage??e, current=Object.fromEntries(tokenKeys.map(k=>[k,number(raw[names[k]])]));
    // Cached input and reasoning are overlapping categories, never added to total.
    if(['attempt-cumulative','session-cumulative'].includes(semantics)) {
      if(previous&&tokenKeys.some(k=>current[k]!==null&&previous[k]!==null&&current[k]<previous[k]))return {values:Object.fromEntries(tokenKeys.map(k=>[k,null])),semantics:'incompatible-reset',compatible:false,acceptedEvents:accepted};
      Object.assign(values,current);previous=current;
    } else if(semantics==='delta') {
      if(!e.id)return {values:Object.fromEntries(tokenKeys.map(k=>[k,null])),semantics:'unknown',compatible:false,acceptedEvents:0};
      for(const k of tokenKeys)values[k]=current[k]===null?null:(accepted===0?0:values[k])===null?null:(values[k]??0)+current[k];
    } else return {values,semantics:'unknown',compatible:false,acceptedEvents:0};
    accepted++;
  }
  return {values,semantics,compatible:true,acceptedEvents:accepted};
}
export function aggregateAttempts(attempts) {
  const aggregate={attempts:attempts.length,metrics:{},money:{value:null,currency:'unknown'},partial:attempts.some(a=>!a.complete)};
  const groups=new Map();
  for(const attempt of attempts){
    const key=attempt.counterScope==='session'?`session:${attempt.counterId}`:`attempt:${attempt.boundary??groups.size}`;
    const previous=groups.get(key);
    if(previous&&(previous.tokens.compatible===false||tokenKeys.some(k=>previous.tokens.values[k]!==null&&attempt.tokens.values[k]!==null&&attempt.tokens.values[k]<previous.tokens.values[k])))groups.set(key,{...attempt,tokens:{...attempt.tokens,compatible:false}});else groups.set(key,attempt);
  }
  for(const key of tokenKeys){const reported=[...groups.values()].map(a=>a.tokens.compatible?a.tokens.values[key]:null);aggregate.metrics[key]={value:reported.length&&reported.every(v=>v!==null)?reported.reduce((a,b)=>a+b,0):null,observed:reported.reduce((a,b)=>a+(b??0),0),unknownAttempts:reported.filter(v=>v===null).length};}
  const currencies=new Set(attempts.map(a=>a.money.currency));
  if(attempts.length&&currencies.size===1&&!currencies.has('unknown')&&attempts.every(a=>a.money.value!==null))aggregate.money={value:attempts.reduce((n,a)=>n+a.money.value,0),currency:attempts[0].money.currency};
  return aggregate;
}
export function economicsPolicy(task) {
  const c=task.engineering.config,roots=new Set(c.writePaths.map(p=>path.posix.dirname(p))),sensitive=c.requireReview||c.writePaths.some(p=>/(^|\/)(auth|authentication|permissions?|secrets?|migrations?|privacy|deploy)(\/|[.-])/i.test(p));
  const classification=sensitive||c.writePaths.length>8||roots.size>2?'high-risk':c.writePaths.length<=2&&c.files.length<=4&&Buffer.byteLength(task.brief)<=4096?'small':'standard';
  const small=classification==='small';
  return {version:'engineering-economics-v1',classification,signals:{writeFiles:c.writePaths.length,relevantFiles:c.files.length,directories:roots.size,sensitive:Boolean(sensitive)},hard:{inputBytes:small?8192:16384,attempts:small?1:2,driverDeadlineMs:Math.min(c.limits.wallClockMs,small?120000:300000)},soft:{totalTokens:small?8000:32000,toolOutputBytes:4096},unknown:['providerMoney','internalCalls','harnessInjectedContext','agentToolOutputLimit','processTreeTermination']};
}
export function candidateTier(proof) {
  const observed=proof?.evidence?.costTier;
  if(observed?.source&&['small','standard','high-risk'].includes(observed.tier))return observed.tier;
  if(proof?.maximum&&Object.values(proof.maximum).length===4&&Object.values(proof.maximum).every(v=>v===0))return 'deterministic';
  return null;
}
export function rankEconomicCandidates(candidates,policy) {
  const rank={deterministic:0,small:1,standard:2,'high-risk':3},required={small:1,standard:2,'high-risk':3}[policy?.classification]??0;
  return candidates.filter(c=>!economicProviderBlock(c.provider,policy)).map((c,index)=>({...c,index,tier:candidateTier(c.proof)})).filter(c=>!policy||c.tier==='deterministic'||rank[c.tier]>=required).sort((a,b)=>(rank[a.tier]??99)-(rank[b.tier]??99)||a.index-b.index);
}
export const economicProviderBlock=(provider,policy)=>policy?.classification==='small'&&provider?.capabilities?.opaqueAgentLoop?'opaque_agent_loop':null;
export function economicDispatchBlock(task,proof,promptBytes) {
  const policy=task.engineering.economics?.policy;if(!policy)return null;
  if(policy.classification==='small'&&proof?.evidence?.opaqueAgentLoop)return 'opaque_agent_loop';
  const attempts=task.engineering.economics.attempts??[],aggregate=task.engineering.economics.aggregate;
  if(attempts.length>=policy.hard.attempts)return 'economic_attempt_limit';
  if(promptBytes>policy.hard.inputBytes)return 'context_limit';
  if(aggregate&&(aggregate.metrics.total.unknownAttempts||aggregate.partial||aggregate.metrics.total.observed>=policy.soft.totalTokens))return 'economic_usage_unknown_or_exhausted';
  // A small prompt does not bound autonomous internal turns/tool outputs. The
  // installed Codex CLI has no qualified total-token ceiling, so it stops here.
  const available=policy.soft.totalTokens-(aggregate?.metrics.total.observed??0);
  if(!Number.isSafeInteger(proof?.maximum?.tokens)||proof.maximum.tokens<0||proof.maximum.tokens>available)return 'token_ceiling_unproven';
  if(!candidateTier(proof))return 'capability_tier_unknown';
  if(candidateTier(proof)!=='deterministic'&&({small:1,standard:2,'high-risk':3}[candidateTier(proof)]??0)<({small:1,standard:2,'high-risk':3}[policy.classification]))return 'capability_tier_insufficient';
  return null;
}
// Post-call observation cannot undo spend; it prevents a false READY claim.
export function economicOutcomeBlock(task) {
  const e=task.engineering.economics,a=e?.aggregate;
  return e?.policy&&a&&(a.partial||a.metrics.total.unknownAttempts||a.metrics.total.observed>e.policy.soft.totalTokens)?'economic_usage_unknown_or_exhausted':null;
}
export async function saveEngineeringUsage(store,task,{run,boundary,provider,proof,outcome,handoff,reason}) {
  return withLock(path.join(store.taskDir(task.slug),'engineering-lock'),async()=>{
    const fresh=await store.findTask(task.id),record=fresh.runs.find(r=>r.run===run),file=`runs/${run}/usage.json`,target=path.join(store.taskDir(task.slug),file);
    if(await store.exists(target)){
      const old=await store.readJson(target);if(old.boundary!==boundary||hash(old)!==record?.usageLedger?.digest)throw new Error('Immutable usage ledger identity changed.');return fresh;
    }
    const details=outcome.usageDetails;
    const raw=details?.events??(outcome.usageEvidence?[{usage:outcome.usageEvidence}]:outcome.usage?.tokens!==undefined?[{usage:{total_tokens:outcome.usage.tokens}}]:[]);
    const tokens=normalizeTokenEvents(raw,details?.semantics??'attempt-cumulative');
    const source=details?.source??(outcome.usageEvidence?'provider.usageEvidence':outcome.usage?'provider.usage':'unknown');
    const model=details?.model??outcome.observedModel??proof?.evidence?.costTier?.model??null;
    const entry={schemaVersion:1,taskId:task.id,run,boundary,attempt:(fresh.engineering.economics?.attempts?.length??0)+1,harness:proof?.evidence?.version??provider,provider,model:model??'unknown',routingReason:reason,continuationReason:record?.predecessor?.reason??(run>1?reason:null),outcome:outcome.status,counterScope:details?.counterScope??'attempt',counterId:details?.counterId??boundary,complete:details?.complete??(outcome.status==='ready'||['moneyMicros','tokens','modelCalls','providerCalls'].every(k=>Number.isSafeInteger(outcome.usage?.[k]))),tokens,metricSources:Object.fromEntries(tokenKeys.map(k=>[k,tokens.values[k]===null?'unknown':source])),sourceEvidence:details?.sources??[],money:{value:number(outcome.usage?.moneyMicros),currency:Number.isSafeInteger(outcome.usage?.moneyMicros)?'USD':'unknown',unit:'micros',source:outcome.usageCostSource??(outcome.usage?.moneyMicros!==undefined?'provider.usage.moneyMicros':'unknown')},contextManifest:handoff?.metrics?.contextManifest??null,limits:{controller:fresh.engineering.economics?.policy??null,qualifiedMaximum:proof?.maximum??null,providerTotalTokenCeiling:Number.isSafeInteger(proof?.maximum?.tokens)?'hard-qualified':'unknown'},at:record?.completedAt??null};
    await store.writeJson(target,entry);
    const ref={run,path:file,digest:hash(entry)},attempts=[...(fresh.engineering.economics?.attempts??[]),ref],entries=[];
    for(const r of attempts){const a=await store.readJson(path.join(store.taskDir(task.slug),r.path));if(hash(a)!==r.digest)throw new Error('Usage archive changed.');entries.push(a);}
    const aggregate=aggregateAttempts(entries),summary={schemaVersion:1,taskId:task.id,afterRun:run,attempts,aggregate},summaryPath=`usage/task-after-${run}.json`;
    await store.writeJson(path.join(store.taskDir(task.slug),summaryPath),summary);
    return store.updateTask({...fresh,runs:fresh.runs.map(r=>r.run===run?{...r,usageLedger:ref}:r),engineering:{...fresh.engineering,revision:fresh.engineering.revision+1,economics:{...fresh.engineering.economics,attempts,aggregate,aggregateRef:{path:summaryPath,digest:hash(summary)}}}});
  });
}
