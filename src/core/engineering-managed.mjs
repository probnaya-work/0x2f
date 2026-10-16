// One foreground small-task attempt. The model never owns execution or retry.
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {withLock} from './lock.mjs';
import {readBounded,durableWrite} from './durable.mjs';
import {handoffHash as hash,engineeringIntent} from './engineering-handoff.mjs';
import {engineeringDirectory,assertEngineeringWorkspace} from './engineering-workspace.mjs';
import {mutateEngineering,engineeringInventory,freezeEngineering,engineeringRun,engineeringStop,verifyEngineeringArtifact} from './engineering.mjs';
import {saveEngineeringUsage,economicsPolicy} from './engineering-economics.mjs';
import {workEvent} from './events.mjs';
import {MANAGED_LIMITS,MANAGED_MODELS,selectManagedModel,managedForegroundPricing,managedGuard,managedTransport,managedInstructions,managedTools,managedCalls,ManagedStop,fail} from '../providers/managed-openai.mjs';

const now=()=>new Date().toISOString();
const int=n=>Number.isSafeInteger(n)&&n>=0;
export async function managedPacket(store,task,guard,limits=MANAGED_LIMITS) {
  const cwd=engineeringDirectory(store,task),c=task.engineering.config;
  if(c.files.length>limits.files)fail('managed_file_limit');
  let bytes=0;const manifest=[];
  for(const [i,file] of c.files.entries()){
    if(/(^|\/)(\.env[^/]*|\.git|\.work|\.codex|\.aws|credentials)(\/|$)/.test(file))fail('managed_private_file');
    let raw;try{raw=await readBounded(path.join(cwd,file),limits.sourceBytes);}catch{fail('managed_source_limit');}guard(raw);bytes+=raw.length;if(bytes>limits.sourceBytes||raw.includes(0))fail('managed_source_limit');
    manifest.push({id:'f'+(i+1),path:file,bytes:raw.length,sha256:hash(raw),writable:c.writePaths.includes(file)});
  }
  const names=new Set(['AGENTS.md']);for(const file of c.files){let dir=path.dirname(file);while(dir!=='.'){names.add(path.join(dir,'AGENTS.md'));dir=path.dirname(dir);}}
  const instructions=[];
  for(const file of names){try{const text=(await readBounded(path.join(cwd,file),8192)).toString();guard(text);instructions.push({path:file,text,digest:hash(text)});}catch(e){if(e.code!=='ENOENT')throw e;}}
  const packet=guard({schemaVersion:1,brief:task.brief,constraints:task.context?.notes??[],acceptance:{check:c.check,scope:c.writePaths},instructions,files:manifest,prohibited:['shell','network','tests','Git','commit','delivery'],loop:'read necessary IDs, then submit one patch; context expansion stops'});
  if(Buffer.byteLength(JSON.stringify(packet))>limits.packetBytes)fail('managed_packet_limit');
  return packet;
}

// Credential-free pinned verifier; closes its owned group before publishing.
export function managedCheck({argv,cwd,timeout,signal}) {
  return new Promise(resolve=>{
    const child=spawn(argv[0],argv.slice(1),{cwd,detached:true,env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8'},stdio:['ignore','pipe','pipe']});
    let output='',bytes=0,closed=false,error=null;
    const kill=()=>{try{process.kill(-child.pid,'SIGKILL');}catch(e){if(e.code!=='ESRCH')error='check_group_uncertain';}};
    const abort=()=>{error='check_deadline';kill();};const timer=setTimeout(abort,Math.max(1,timeout));signal?.addEventListener('abort',abort,{once:true});
    const receive=b=>{bytes+=b.length;if(bytes<=65536)output+=b.toString();else {error='check_output_limit';kill();}};
    child.stdout.on('data',receive);child.stderr.on('data',receive);
    const finish=code=>{if(closed)return;closed=true;kill();clearTimeout(timer);signal?.removeEventListener('abort',abort);resolve({code,error,output,groupClosed:error!=='check_group_uncertain'});};
    child.on('error',()=>{error='check_spawn_failed';finish(null);});child.on('close',finish);if(signal?.aborted)abort();
  });
}

export async function runManagedForeground(ctx,initial,{env=process.env,transport,limits=MANAGED_LIMITS,registry=MANAGED_MODELS,foregroundCanary=false,onPreview=preview=>console.log(JSON.stringify(preview,null,2)),fault=()=>{},checkRunner=managedCheck}={}) {
  const store=ctx.store,slug=initial.slug,root=store.taskDir(slug),token=initial.engineering.driver.token,key=env.OPENAI_API_KEY;
  const guard=managedGuard(key),controller=new AbortController();const began=Date.now();
  if(Object.entries(MANAGED_LIMITS).some(([k,max])=>!Number.isFinite(limits[k])||limits[k]<0||limits[k]>max))fail('managed_limit_configuration');
  const timeout=Math.min(limits.deadlineMs,MANAGED_LIMITS.deadlineMs,initial.engineering.config.limits.wallClockMs);const timer=setTimeout(()=>controller.abort(),timeout);
  const aborted=()=>controller.abort();process.once('SIGINT',aborted);process.once('SIGTERM',aborted);
  const active=()=>{if(controller.signal.aborted||Date.now()-began>=timeout)fail('managed_deadline');};
  const network=fn=>Promise.race([fn(),new Promise((_,reject)=>{if(controller.signal.aborted)return reject(new ManagedStop('managed_deadline'));controller.signal.addEventListener('abort',()=>reject(new ManagedStop('managed_deadline')),{once:true});})]);
  try{return await withLock(path.join(root,'managed-lock'),async()=>{
    let task=await store.findTask(initial.id),claimed=false;
    const update=fn=>mutateEngineering(store,slug,token,t=>{const next=fn(t);guard(next);return next;});
    const event=(type,data)=>store.appendEvent(slug,guard(workEvent(type,task.id,data)));
    const write=async(file,value)=>{guard(value);const target=path.join(root,file);if(await store.exists(target))fail('managed_immutable_collision');await store.writeJson(target,value);};
    const stop=async(code)=>{
      task=await update(t=>({...engineeringStop(t,code,code==='managed_api_key_missing'?'Set OPENAI_API_KEY in the foreground process environment; opaque fallback is disabled.':code==='managed_uncertain'?'UNCERTAIN: reconcile durable intents/receipts before any explicit foreground decision; no replay.':code),engineering:{...engineeringStop(t,code,code).engineering,managed:{...t.engineering.managed,state:code==='managed_uncertain'?'UNCERTAIN':'NEEDS YOU',reason:code}}}));
      await event('needs_user',{run:task.runs.at(-1).run,blockedOn:task.blockedOn});return task;
    };
    if(task.engineering.managed?.attempt)return task.status==='working'?stop('managed_uncertain'):task;
    if(task.status!=='working'||task.engineering.driver.state!=='pending')return task;
    task=await update(t=>{claimed=true;return {...t,pid:process.pid,execution:{...t.execution,provider:'managed-openai'},engineering:{...t.engineering,driver:{token,pid:process.pid,state:'running'},managed:{lane:'managed-api',state:'PREFLIGHT',limits,attempt:randomUUID(),requests:0,inferences:0,tools:0,reads:0,patches:0,resultBytes:0,inputBytes:0},next:'implement'}};});
    if(!claimed)return task;
    const attempt=task.engineering.managed.attempt,run=task.runs.at(-1).run,dir=`runs/${run}/managed`,cwd=engineeringDirectory(store,task),intent=engineeringIntent(task);
    let state={limits,callIds:[],tools:0,reads:0,patches:0,resultBytes:0,inputBytes:0,inputTokens:0,inputReserved:0,outputTokens:0,outputReserved:0,requests:0,inferences:0,counts:0,modelQueries:0},usageEvents=[],knownUsage=true,model,predicted,packet,baseline,expected,patchSubmitted=false;
    const sync=async(extra={})=>{task=await update(t=>({...t,engineering:{...t.engineering,managed:{...t.engineering.managed,...state,callIds:undefined,limits,state:'RUNNING',...extra}}}));};
    let pendingRequest=false;
    async function rpc(kind,body){
      active();guard(body);const byteCount=Buffer.byteLength(JSON.stringify(body));
      if(kind!=='model'&&(state.requests>=limits.responsesRequests||state.inputBytes+byteCount>limits.serializedInputBytes))fail('managed_request_or_input_limit');
      if(kind==='count'&&state.counts>=limits.countRequests||kind==='inference'&&state.inferences>=limits.inferenceRequests)fail('managed_request_limit');
      if(kind==='model'&&state.modelQueries>=1)fail('managed_request_limit');
      const fresh=await store.findTask(task.id);if(engineeringIntent(fresh)!==intent||fresh.status!=='working')fail('managed_input_drift');
      if((await engineeringInventory(cwd)).digest!==expected)fail('managed_source_drift');
      const number=state.requests+state.modelQueries+1,requestId=randomUUID();
      const reservation={schemaVersion:1,taskId:task.id,run,attempt,requestId,number,kind,requestType:kind==='inference'?'published_billable_inference':'unpriced_control_request',model:model.id,inputDigest:hash(body),attemptInferenceReservationUsd:predicted.inferenceUpperUsd,attemptTotalCostReservationUsd:null,reservation:kind==='inference'?{inputTokens:state.pendingInputTokens,outputTokens:body.max_output_tokens,inferenceCostUpperUsd:predicted.inferenceUpperUsd,totalCostUpperUsd:predicted.totalUpperUsd}:null,remaining:{responses:limits.responsesRequests-state.requests,inputTokens:limits.inputTokens-state.inputReserved,outputTokens:limits.outputTokens-state.outputReserved,publishedInferenceUsd:limits.costUsd-predicted.inferenceUpperUsd,totalCostUsd:null,controlRequests:predicted.controlRequests.maximum-state.counts-state.modelQueries},allowedTools:managedTools.map(t=>t.name),body,at:now()};
      await write(`${dir}/request-${number}-intent.json`,reservation);fault('before-request',kind);active();pendingRequest=true;
      if(kind==='model')state.modelQueries++;else {state.requests++;state.inputBytes+=byteCount;if(kind==='count')state.counts++;else state.inferences++;}
      await sync({pendingRequest:requestId});
      active();const result=guard(await network(()=>transport.call(kind,body,controller.signal,model.id)));active();
      await write(`${dir}/request-${number}-receipt.json`,{schemaVersion:1,requestId,kind,requestType:kind==='inference'?'published_billable_inference':'unpriced_control_request',model:model.id,inputDigest:hash(body),response:result,at:now()});pendingRequest=false;
      fault('after-response',kind);await sync({pendingRequest:null});return result;
    }
    async function ledger(status) {
      if(!model||!state.inferences)return;
      const tokens=usageEvents.reduce((n,e)=>n+e.usage.total_tokens,0),input=usageEvents.reduce((n,e)=>n+e.usage.input_tokens,0),output=usageEvents.reduce((n,e)=>n+e.usage.output_tokens,0);
      const cached=usageEvents.every(e=>int(e.usage.cached_input_tokens))?usageEvents.reduce((n,e)=>n+e.usage.cached_input_tokens,0):null;
      const cost=cached===null||!knownUsage?null:((input-cached)*model.price.perMillion.input+cached*model.price.perMillion.cachedInput+output*model.price.perMillion.output)/1e6;
      const outcome={status,usageCostSource:'Calculated inference-only cost from versioned prices; other API fees unknown',usage:{tokens,modelCalls:state.inferences,providerCalls:state.requests+state.modelQueries,...(cost===null?{}:{moneyMicros:Math.ceil(cost*1e6)})},usageDetails:{events:usageEvents,semantics:'delta',model:model.id,complete:knownUsage,source:'OpenAI Responses usage; immutable managed request receipts',sources:usageEvents.map((e,i)=>({path:`${dir}/usage-${i+1}.json`,responseId:e.id}))}};
      task=await saveEngineeringUsage(store,task,{run,boundary:attempt,provider:'managed-openai',proof:{maximum:{tokens:limits.inputTokens+limits.outputTokens},evidence:{version:'managed-responses-v1'}},outcome,handoff:{metrics:{contextManifest:{totalBytes:Buffer.byteLength(JSON.stringify(packet)),parts:[{name:'task-packet',bytes:Buffer.byteLength(JSON.stringify(packet)),reason:'current approved small task'}]}}},reason:'minimum-qualified-managed-model'});
      await sync({actualUsage:knownUsage?{input,cachedInput:cached,output,total:tokens}:null,calculatedInferenceCostUsd:cost,providerReportedCost:'unknown',controlCost:'no separate published fee; actual billed amount unknown',predicted});
    }
    try{
      if(economicsPolicy(task).classification!=='small')fail('managed_small_only');
      const prior=task.engineering.budget;
      if(run!==1||task.engineering.economics?.attempts?.length||prior.uncertain.length||prior.reservations.length||Object.values(prior.confirmed).some(n=>n!==0))fail('managed_existing_usage');
      if(!task.engineering.workspace)fail('managed_workspace_required');
      await assertEngineeringWorkspace(store,task,run);packet=await managedPacket(store,task,guard,limits);baseline=guard(await engineeringInventory(cwd));expected=baseline.digest;
      for(const f of packet.files)if(baseline.files[f.path]?.sha256!==f.sha256)fail('managed_source_drift');
      for(const i of packet.instructions)if(baseline.files[i.path]?.sha256!==i.digest)fail('managed_source_drift');
      ({model,predicted}=selectManagedModel(limits,registry));
      await write(`${dir}/attempt.json`,{schemaVersion:1,taskId:task.id,run,attempt,model,limits,predicted,authorization:{mode:'foreground',foregroundCanary:foregroundCanary===true},packet,inputDigest:hash(packet),intent,at:now()});
      task=await update(t=>({...t,runs:t.runs.map(r=>r.run===run?{...r,purpose:'implement',provider:'managed-openai',executor:{kind:'managed',harness:'0x2f-responses-v1',requestedModel:model.id,observedModel:null},permissions:{tools:managedTools.map(t=>t.name),writePaths:t.engineering.config.writePaths,externalActions:false}}:r),engineering:{...t.engineering,decisions:[...t.engineering.decisions,{purpose:'implement',provider:'managed-openai',model:model.id,reason:'minimum-qualified-managed-model',lane:'managed-api',opaqueFallback:false}],managed:{...t.engineering.managed,model:model.id,predicted}}}));
      if(!key)fail('managed_api_key_missing');
      const configured=task.engineering.config.limits;
      if(predicted.inferenceUpperUsd>configured.moneyMicros/1e6||limits.inputTokens+limits.outputTokens>configured.tokens||limits.inferenceRequests>configured.modelCalls||limits.responsesRequests+1>configured.providerCalls)fail('managed_configured_budget');
      transport??=managedTransport(key);
      const pricingPolicy=managedForegroundPricing(predicted,{mode:'foreground',foregroundCanary});
      const preview=guard({schemaVersion:1,task:{id:task.id,brief:task.brief},model:model.id,hardLimits:limits,pricingPolicy,pricingSource:model.price.source,controlPricingSource:model.price.apiPricingSource,pricingObservedAt:model.price.observedAt,notice:'Control requests: no separate published fee; contractual zero fee and complete billed amount are not claimed.'});
      await write(`${dir}/foreground-preview.json`,preview);await sync({pricingPolicy});
      await network(()=>Promise.resolve(onPreview(preview)));
      if(transport.live&&Date.now()-Date.parse(model.price.observedAt)>86400000)fail('managed_pricing_stale');
      const available=await rpc('model',{});if(available.id!==model.id)fail('managed_model_unavailable');
      const source=await freezeEngineering(store,task,run,baseline,'inputs');await sync({baseline:source});await event('run.started',{run,provider:'managed-openai',purpose:'implement'});
      let conversation=[{role:'user',content:JSON.stringify(packet)}];
      while(!patchSubmitted){
        active();if(state.inferences>=limits.inferenceRequests)fail('managed_request_limit');
        const prompt={model:model.id,instructions:managedInstructions,input:conversation,tools:managedTools,tool_choice:'auto'};guard(prompt);
        // Reserve serialized bytes for BOTH count and inference before counting.
        const outputMax=Math.min(limits.outputTokensPerRequest,limits.outputTokens-state.outputReserved);
        if(outputMax<1)fail('managed_output_limit');
        const body={...prompt,store:false,max_output_tokens:outputMax,reasoning:{effort:model.reasoningEffort},service_tier:'default'};
        if(state.inputBytes+Buffer.byteLength(JSON.stringify(prompt))+Buffer.byteLength(JSON.stringify(body))>limits.serializedInputBytes)fail('managed_input_limit');
        const counted=await rpc('count',prompt);
        if(counted.object!=='response.input_tokens'||!int(counted.input_tokens)||counted.input_tokens>limits.inputTokensPerRequest||state.inputTokens+counted.input_tokens>limits.inputTokens)fail('managed_token_limit');
        state.outputReserved+=outputMax;state.inputReserved+=counted.input_tokens;state.pendingInputTokens=counted.input_tokens;
        const response=await rpc('inference',body),u=response.usage;
        if(response.model!==model.id||!u||!int(u.input_tokens)||!int(u.output_tokens)||u.input_tokens!==counted.input_tokens||u.output_tokens>outputMax||!int(u.total_tokens)||u.total_tokens!==u.input_tokens+u.output_tokens||typeof response.id!=='string'||!response.id||(u.input_tokens_details?.cached_tokens!==undefined&&(!int(u.input_tokens_details.cached_tokens)||u.input_tokens_details.cached_tokens>u.input_tokens))||(u.output_tokens_details?.reasoning_tokens!==undefined&&(!int(u.output_tokens_details.reasoning_tokens)||u.output_tokens_details.reasoning_tokens>u.output_tokens))||usageEvents.some(e=>e.id===response.id)){knownUsage=false;fail('managed_usage_uncertain');}
        state.pendingInputTokens=0;state.inputTokens+=u.input_tokens;state.outputTokens+=u.output_tokens;
        usageEvents.push({id:response.id,usage:{input_tokens:u.input_tokens,output_tokens:u.output_tokens,total_tokens:u.total_tokens,cached_input_tokens:u.input_tokens_details?.cached_tokens??null,reasoning_output_tokens:u.output_tokens_details?.reasoning_tokens??null}});
        await write(`${dir}/usage-${state.inferences}.json`,{responseId:response.id,usage:u,counterInput:counted.input_tokens,semantics:'response-delta'});task=await update(t=>({...t,runs:t.runs.map(r=>r.run===run?{...r,executor:{...r.executor,observedModel:response.model}}:r)}));await sync();
        const calls=managedCalls(response,state,packet.files);if(!calls.length)fail('managed_patch_missing');
        if(calls.some(c=>c.item.name==='request_context_expansion'))fail('context_expansion_required');
        conversation.push(...response.output);
        for(const {item,args} of calls){
          active();state.tools++;state.callIds.push(item.call_id);
          if(item.name==='read_task_file'){
            state.reads++;const file=packet.files.find(f=>f.id===args.file_id),bytes=await readBounded(path.join(cwd,file.path),65536);guard(bytes);if(hash(bytes)!==file.sha256)fail('managed_source_drift');
            // Slice whole Unicode codepoints, including JSON framing in total cap.
            let content='';for(const ch of bytes.toString()){if(Buffer.byteLength(content+ch)>limits.readResultBytes)break;content+=ch;}
            const result={type:'function_call_output',call_id:item.call_id,output:JSON.stringify({file_id:file.id,content,truncated:Buffer.byteLength(content)<bytes.length})};const size=Buffer.byteLength(JSON.stringify(result));if(state.resultBytes+size>limits.toolResultBytes)fail('managed_payload_limit');state.resultBytes+=size;conversation.push(result);
            await write(`${dir}/tool-${state.tools}-receipt.json`,{callId:item.call_id,tool:item.name,bytes:size,sourceDigest:file.sha256,result});await sync();
          }else{
            await assertEngineeringWorkspace(store,task,run);const fresh=await store.findTask(task.id);if(engineeringIntent(fresh)!==intent||fresh.status!=='working')fail('managed_input_drift');if((await engineeringInventory(cwd)).digest!==expected)fail('managed_source_drift');
            const updates=[];
            for(const edit of args.edits){const file=packet.files.find(f=>f.id===edit.file_id),bytes=await readBounded(path.join(cwd,file.path),65536);guard(bytes);const text=bytes.toString();if(hash(bytes)!==file.sha256||text.split(edit.old_text).length!==2)fail('managed_patch_drift');const replacement=text.replace(edit.old_text,edit.new_text);guard(replacement);if(Buffer.byteLength(replacement)>65536)fail('managed_patch_size');updates.push({file,before:file.sha256,after:hash(replacement),replacement});}
            await write(`${dir}/tool-${state.tools}-intent.json`,{callId:item.call_id,tool:item.name,edits:updates});fault('before-patch');active();
            for(const u of updates){active();if(hash(await readBounded(path.join(cwd,u.file.path),65536))!==u.before)fail('managed_patch_drift');await durableWrite(path.join(cwd,u.file.path),u.replacement);fault('after-file');}
            state.patches++;patchSubmitted=true;expected=(await engineeringInventory(cwd)).digest;
            await write(`${dir}/tool-${state.tools}-receipt.json`,{callId:item.call_id,tool:item.name,edits:updates.map(u=>({file_id:u.file.id,before:u.before,after:u.after}))});await sync();
          }
        }
      }
      await ledger('ready');active();
      const after=guard(await engineeringInventory(cwd));if([...new Set([...Object.keys(baseline.files),...Object.keys(after.files)])].some(p=>baseline.files[p]?.sha256!==after.files[p]?.sha256&&!task.engineering.config.writePaths.includes(p)))fail('managed_scope_drift');
      const artifact=await freezeEngineering(store,task,run,after,'artifacts');await verifyEngineeringArtifact(store,task,artifact);
      task=await update(t=>({...t,runs:t.runs.map(r=>r.run===run?{...r,outcome:'ready',completedAt:now(),artifact,input:source}:r),engineering:{...t.engineering,next:'verify',managed:{...t.engineering.managed,artifact,state:'VERIFYING'}}}));
      const vr=run+1,config=task.engineering.config;
      task=await update(t=>({...t,runs:[...t.runs,{...engineeringRun('local-checks'),run:vr,purpose:'verify',executor:{kind:'local'},input:artifact}]}));
      if(hash(await readBounded(config.check[0],256000000))!==config.checkDigest)fail('managed_check_drift');
      await assertEngineeringWorkspace(store,task,vr);active();
      const checked=guard(await checkRunner({argv:config.check,cwd,timeout:Math.min(5000,timeout-(Date.now()-began)),signal:controller.signal}));active();
      const verification={schemaVersion:1,run:vr,artifact,argv:config.check,executableDigest:config.checkDigest,cwd,...checked,sourceUnchanged:(await engineeringInventory(cwd)).digest===after.digest,outputDigest:hash(checked.output)};
      await write(`runs/${vr}/verification.json`,verification);await store.writeText(path.join(root,`runs/${vr}/result.md`),guard(checked.output));
      await verifyEngineeringArtifact(store,task,artifact);
      const review={schemaVersion:1,run:vr,artifact,verification:{path:`runs/${vr}/verification.json`,digest:hash(verification)},mode:'deterministic-policy',findings:[],reason:'Small scope; verifier outside model loop; no independent-review trigger.'},reviewRef={path:`runs/${vr}/review.json`,digest:hash(review)};
      await write(reviewRef.path,review);active();
      const success=checked.code===0&&!checked.error&&verification.sourceUnchanged;
      task=await update(t=>({...t,runs:t.runs.map(r=>r.run===vr?{...r,outcome:success?'ready':'failed',completedAt:now(),verification}:r),engineering:{...t.engineering,verification,review:reviewRef,...(t.engineering.playbook?{playbook:{...t.engineering.playbook,review:reviewRef}}:{})}}));
      if(!success)return stop('managed_verification_failed');
      await store.writeText(path.join(root,'result.md'),'Managed patch verified. Artifact '+artifact.contentDigest+'\n');
      active();task=await update(t=>{if(engineeringIntent(t)!==intent||t.status!=='working')fail('managed_input_drift');return {...t,status:'ready',blockedOn:undefined,engineering:{...t.engineering,next:'accept',driver:{...t.engineering.driver,state:'completed'},managed:{...t.engineering.managed,state:'READY'}}};});await event('task.updated',{status:'ready',run:vr});return task;
    }catch(error){
      if(error.simulatedCrash)throw error;
      if(pendingRequest)knownUsage=false;
      try{await ledger('failed');}catch{/* an existing immutable ledger remains authoritative */}
      return stop(pendingRequest?'managed_uncertain':error instanceof ManagedStop?error.code:'managed_uncertain');
    }
  });}finally{clearTimeout(timer);process.removeListener('SIGINT',aborted);process.removeListener('SIGTERM',aborted);}
}
