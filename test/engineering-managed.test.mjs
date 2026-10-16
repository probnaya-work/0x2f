import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {execFileSync,spawn} from 'node:child_process';
import {once} from 'node:events';
import {playbookFixture} from './engineering-playbook-fixture.mjs';
import {ensureEngineeringWorkspace} from '../src/core/engineering-workspace.mjs';
import {mutateEngineering,assertEngineeringAccepted} from '../src/core/engineering.mjs';
import {handoffHash as hash} from '../src/core/engineering-handoff.mjs';
import {economicsPolicy} from '../src/core/engineering-economics.mjs';
import {runManagedForeground,managedCheck} from '../src/core/engineering-managed.mjs';
import {runForegroundEngineering} from '../src/core/engineering-foreground.mjs';
import {credentialFreeEnvironment} from '../src/core/workflow-credentials.mjs';
import {renderTasks} from '../src/render.mjs';
import {MANAGED_LIMITS,MANAGED_MODELS,managedTransport,managedGuard,managedCost,managedForegroundPricing} from '../src/providers/managed-openai.mjs';
import {workflowLines} from '../src/web/workflow.mjs';
import {projectRow} from '../src/web/ledger.mjs';
import {snapshot} from '../src/tui/model.mjs';
import {recoverInterruptedRuns} from '../src/recover.mjs';
const key='sk-fake-managed-qualification-key';
const registry=MANAGED_MODELS;
const call=(name,args,id=name)=>({type:'function_call',call_id:id,name,arguments:JSON.stringify(args)});
const patch=()=>call('submit_patch',{edits:[{file_id:'f1',old_text:'() => null',new_text:'s => /^0*[1-9][0-9]*$/.test(s) ? Number(s) : null'}]});
const read=(id='read')=>call('read_task_file',{file_id:'f1'},id);
async function fixture(t,{outputs=[[read()],[patch()]],count=100,hook,config={},transportFailure,limits=MANAGED_LIMITS}={}){
 const f=await playbookFixture(t,{config:{limits:{moneyMicros:250000,tokens:20000,modelCalls:2,providerCalls:5,wallClockMs:30000,implementationAttempts:1,agentRuns:1},...config}});
 const git=args=>execFileSync('/usr/bin/git',['-C',f.base,...args],{env:{PATH:'/usr/bin:/bin'},stdio:'pipe'});
 git(['init','-q']);git(['add','src','test']);git(['-c','user.name=Fixture','-c','user.email=fixture@localhost','commit','--no-gpg-sign','--no-verify','-qm','fixture base']);
 const spec={repository:f.base,ref:'HEAD'};let task=await f.runtime.store.findTask(f.task.id);const c={...task.engineering.config,workspace:spec};task=await f.runtime.store.updateTask({...task,engineering:{...task.engineering,config:c,configDigest:hash(c)}});
 const workspace=await ensureEngineeringWorkspace(f.runtime.store,task,spec);task=await mutateEngineering(f.runtime.store,task.slug,task.engineering.driver.token,t=>({...t,engineering:{...t.engineering,workspace,economics:{policy:economicsPolicy(t)}}}));
 const requests=[];let inf=0;const server=http.createServer(async(req,res)=>{let raw='';for await(const b of req)raw+=b;const body=raw?JSON.parse(raw):{};requests.push({url:req.url,body,hasAuth:req.headers.authorization==='Bearer '+key});
  if(transportFailure){res.writeHead(429);return res.end(JSON.stringify({error:key}));}
  let result;if(req.url.startsWith('/v1/models/'))result={id:registry[0].id};else if(req.url.endsWith('/input_tokens'))result={object:'response.input_tokens',input_tokens:count};else {inf++;result={id:'resp_'+inf,model:registry[0].id,status:'completed',output:outputs[inf-1]??[read('extra')],usage:{input_tokens:count,output_tokens:20,total_tokens:count+20,input_tokens_details:{cached_tokens:10}}};}
  if(hook)result=await hook({req,body,result,f,workspace,inf})??result;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const transport=managedTransport(key,{fetchImpl:(url,init)=>fetch('http://127.0.0.1:'+server.address().port+new URL(url).pathname,init)});transport.live=false;
 const previews=[];const options={foregroundCanary:true,onPreview:preview=>{previews.push(preview);},env:{OPENAI_API_KEY:key},transport,registry,limits};
 return {...f,task,workspace,requests,previews,port:server.address().port,options,run:opts=>runManagedForeground({store:f.runtime.store},task,{...options,...opts})};
}
async function artifacts(root){let text='';async function walk(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())await walk(p);else if(e.isFile())text+=await fs.readFile(p,'utf8');}}await walk(root);return text;}

test('managed read → patch → external deterministic verifier, durable usage and shared projection',async t=>{
 const f=await fixture(t),task=await f.run();assert.equal(task.status,'ready',task.blockedOn?.text);assert.equal(f.requests.filter(r=>r.url==='/v1/responses').length,2);assert.equal(task.engineering.managed.requests,4);assert.equal(task.engineering.managed.patches,1);assert.equal(task.engineering.managed.actualUsage.total,240);assert.equal(task.engineering.managed.actualUsage.cachedInput,20);assert.equal(task.engineering.managed.providerReportedCost,'unknown');assert.equal(task.runs.at(-1).purpose,'verify');assert.equal(task.engineering.verification.code,0);const diff=await f.runtime.actions.getTaskDiff(task.id);assert.equal(diff.length,1);assert.equal(diff[0].path,'src/id.mjs');await assertEngineeringAccepted(f.runtime.store,task);
 assert.deepEqual(projectRow(task,await f.runtime.store.readEvents(task.slug)).workflowLines,workflowLines(task));assert.deepEqual((await snapshot(f.runtime)).tasks[0].workflowLines,workflowLines(task));assert.ok(workflowLines(task).some(l=>l.includes('NO OPAQUE FALLBACK')));
 for(const line of workflowLines(task))assert.ok(renderTasks([task]).includes(line));
 const tree=await artifacts(f.runtime.store.taskDir(task.slug));assert.ok(!tree.includes(key));assert.ok(!tree.includes(Buffer.from(key).toString('base64')));assert.ok(tree.includes('request-')===false||tree.includes('inputDigest'));assert.equal(task.engineering.economics.aggregate.metrics.reasoning.value,null);
 if(process.env.OX2F_MANAGED_EVIDENCE_DIR){
  const dir=process.env.OX2F_MANAGED_EVIDENCE_DIR;
  assert.match(dir,/^\/private\/tmp\/0x2f-managed-[a-z0-9-]+$/);
  const root=f.runtime.store.taskDir(task.slug),journal={};
  for(const entry of await fs.readdir(path.join(root,'runs/1/managed'))){
   if(entry.endsWith('.json'))journal[entry]=await f.runtime.store.readJson(path.join(root,'runs/1/managed',entry));
  }
  const evidence=managedGuard(key)({kind:'offline mock only; native unpriced_control_request policy; explicit foreground canary authorization is synthetic',task,journal,projection:workflowLines(task),requests:f.requests.map(r=>({url:r.url,inputDigest:hash(r.body),serializedBytes:Buffer.byteLength(JSON.stringify(r.body))})),verification:task.engineering.verification});
  await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'normal-flow.json'),JSON.stringify(evidence,null,2)+'\n');
 }
});
for(const [name,output,code] of [
 ['unknown tool',[call('shell',{command:'npm test'})],'managed_unknown_tool_or_item'],
 ['unknown item',[{type:'new_effectful_item'}],'managed_unknown_tool_or_item'],
 ['malformed arguments',[{type:'function_call',call_id:'bad',name:'read_task_file',arguments:'{'}],'managed_malformed_arguments'],
 ['arbitrary path',[call('read_task_file',{path:'../../secret'})],'managed_file_id'],
 ['duplicate patch batch',[patch(),{...patch(),call_id:'second'}],'managed_patch_limit'],
 ['excessive reads',Array.from({length:5},(_,i)=>read('read'+i)),'managed_read_limit'],
 ['context expansion',[call('request_context_expansion',{reason:'Need more context'})],'context_expansion_required'],
 ['patch outside scope',[call('submit_patch',{edits:[{file_id:'f2',old_text:'x',new_text:'y'}]})],'managed_patch_scope']
])test('managed '+name+' stops without next inference or tool effect',async t=>{
 const f=await fixture(t,{outputs:[output]}),task=await f.run();assert.equal(task.status,'needs_you');assert.equal(task.blockedOn.code,code);assert.equal(f.requests.filter(r=>r.url==='/v1/responses').length,1);assert.equal(await fs.readFile(path.join(f.workspace.path,'src/id.mjs'),'utf8'),'export const parseTaskId = () => null;\n');
});
test('managed request ceiling stops after two inference requests without a third',async t=>{
 const f=await fixture(t,{outputs:[[read('a')],[read('b')]]}),task=await f.run();assert.equal(task.blockedOn.code,'managed_request_limit');assert.equal(f.requests.filter(r=>r.url==='/v1/responses').length,2);assert.equal(task.engineering.managed.requests,4);
});
test('managed provider counter blocks over-budget input before inference',async t=>{
 const f=await fixture(t,{count:5000}),task=await f.run();assert.equal(task.blockedOn.code,'managed_token_limit');assert.equal(f.requests.filter(r=>r.url==='/v1/responses').length,0);
});
test('managed serialized input and output reservations stop before inference',async t=>{
 for(const limits of [{...MANAGED_LIMITS,serializedInputBytes:1},{...MANAGED_LIMITS,outputTokensPerRequest:0}]){const f=await fixture(t,{limits}),task=await f.run();assert.equal(task.status,'needs_you');assert.ok(['managed_input_limit','managed_output_limit'].includes(task.blockedOn.code));assert.equal(f.requests.filter(r=>r.url==='/v1/responses').length,0);}
});
test('managed expensive worst-case and missing explicit foreground decision block all HTTP',async t=>{
 const f=await fixture(t);const expensive=registry.map(m=>({...m,price:{...m.price,perMillion:{input:100,cachedInput:100,output:100}}}));const a=await f.run({registry:expensive});assert.equal(a.blockedOn.code,'managed_cost_limit');assert.equal(f.requests.length,0);
 const g=await fixture(t);g.options.transport.live=true;const b=await g.run({registry:MANAGED_MODELS,foregroundCanary:false});assert.equal(b.blockedOn.code,'managed_foreground_canary_required');assert.equal(g.requests.length,0);
});

test('foreground pricing permits unpriced controls only for an explicit canary, never unattended',()=>{
 const predicted=managedCost(MANAGED_MODELS[0]);
 assert.equal(predicted.inferenceUpperUsd,0.024576);assert.equal(predicted.totalUpperUsd,null);
 assert.deepEqual(predicted.controlRequests,{classification:'unpriced_control_request',maximum:3,tokenCountMaximum:2,availabilityMaximum:1,separatePublishedFee:false,contractualZeroFee:false,includedInInferenceMaximum:false});
 assert.throws(()=>managedForegroundPricing(predicted,{mode:'foreground'}),/managed_foreground_canary_required/);
 assert.throws(()=>managedForegroundPricing(predicted,{mode:'unattended',foregroundCanary:true}),/managed_unattended_unqualified/);
 assert.throws(()=>managedForegroundPricing({...predicted,inferenceUpperUsd:0.024577},{mode:'foreground',foregroundCanary:true}),/managed_cost_limit/);
 const policy=managedForegroundPricing(predicted,{mode:'foreground',foregroundCanary:true});
 assert.equal(policy.totalBilledAmount,'unknown');assert.equal(policy.retry,false);assert.equal(policy.opaqueFallback,false);
});

test('foreground pricing saves and shows the preview before HTTP; controls remain separately bounded',async t=>{
 const f=await fixture(t,{hook:({req})=>{
  if(req.url==='/v1/responses')assert.equal(f.previews.length,1);
 }});
 // Exercise the native policy gate with the same local transport. No live call.
 f.options.transport.live=true;
 // Freshness is a clock fixture; this does not refresh official price evidence.
 const freshRegistry=MANAGED_MODELS.map(m=>({...m,price:{...m.price,observedAt:new Date().toISOString()}}));
 const task=await f.run({registry:freshRegistry});assert.equal(task.status,'ready');assert.equal(f.previews.length,1);
 const preview=f.previews[0];assert.equal(preview.pricingPolicy.publishedBillableInferenceMaximumUsd,0.024576);
 assert.equal(preview.pricingPolicy.controlRequests.maximum,3);assert.equal(preview.model,MANAGED_MODELS[0].id);
 assert.equal(preview.pricingSource,MANAGED_MODELS[0].price.source);assert.ok(preview.pricingObservedAt);assert.match(preview.notice,/no separate published fee/);
 const saved=await f.runtime.store.readJson(path.join(f.runtime.store.taskDir(task.slug),'runs/1/managed/foreground-preview.json'));assert.deepEqual(saved,preview);
 assert.equal(f.requests.filter(r=>r.url.startsWith('/v1/models/')).length,1);assert.equal(f.requests.filter(r=>r.url.endsWith('/input_tokens')).length,2);assert.equal(f.requests.length,5);
 for(let i=1;i<=5;i++){
  const receipt=await f.runtime.store.readJson(path.join(f.runtime.store.taskDir(task.slug),`runs/1/managed/request-${i}-receipt.json`));
  assert.equal(receipt.requestType,receipt.kind==='inference'?'published_billable_inference':'unpriced_control_request');
 }
 const lines=workflowLines(task);assert.ok(lines.includes('PUBLISHED BILLABLE INFERENCE MAXIMUM: $0.024576'));
 assert.ok(lines.some(l=>l.startsWith('CONTROL REQUESTS: 3 maximum, no separate published fee')));
 assert.ok(lines.some(l=>l.startsWith('COST TOTAL UNKNOWN')));assert.ok(!lines.some(l=>l.includes('TOTAL COST 0.024576')));
 assert.deepEqual(projectRow(task,await f.runtime.store.readEvents(task.slug)).workflowLines,lines);assert.deepEqual((await snapshot(f.runtime)).tasks[0].workflowLines,lines);
 await f.run();assert.equal(f.requests.length,5);assert.equal(f.calls.length,0);
});

test('foreground pricing control-count ceiling stops without retry or fallback',async t=>{
 const f=await fixture(t,{limits:{...MANAGED_LIMITS,countRequests:1}}),task=await f.run();
 assert.equal(task.blockedOn.code,'managed_request_limit');assert.equal(f.requests.filter(r=>r.url.endsWith('/input_tokens')).length,1);
 assert.equal(f.requests.filter(r=>r.url.startsWith('/v1/models/')).length,1);assert.equal(f.requests.filter(r=>r.url==='/v1/responses').length,1);
 await f.run();assert.equal(f.requests.length,3);assert.equal(f.calls.length,0);
});

test('managed existing or uncertain Task budget cannot obtain a fresh attempt',async t=>{
 for(const kind of ['confirmed','reserved','uncertain','ledger','prior-run']){
  const f=await fixture(t);let task=await f.runtime.store.findTask(f.task.id),e=task.engineering;
  if(kind==='confirmed')e={...e,budget:{...e.budget,confirmed:{...e.budget.confirmed,tokens:1}}};
  if(kind==='reserved')e={...e,budget:{...e.budget,reservations:[{boundary:'prior',maximum:{tokens:null}}]}};
  if(kind==='uncertain')e={...e,budget:{...e.budget,uncertain:['prior']}};
  if(kind==='ledger')e={...e,economics:{...e.economics,attempts:[{boundary:'prior'}]}};
  if(kind==='prior-run')task={...task,runs:[{...task.runs[0],outcome:'failed'},{...task.runs[0],run:2}]};
  await f.runtime.store.updateTask({...task,engineering:e});
  const stopped=await f.run();assert.equal(stopped.blockedOn.code,'managed_existing_usage');assert.equal(f.requests.length,0);assert.equal(f.calls.length,0);
 }
});
test('managed API key absent stops offline without reading harness authentication',async t=>{
 const f=await fixture(t),task=await f.run({env:{}});assert.equal(task.blockedOn.code,'managed_api_key_missing');assert.equal(f.requests.length,0);assert.match(task.blockedOn.text,/OPENAI_API_KEY/);
});
test('managed provider rate limit has no retry or opaque fallback',async t=>{
 const f=await fixture(t,{transportFailure:true}),task=await f.run();assert.equal(task.status,'needs_you');assert.equal(task.engineering.managed.state,'UNCERTAIN');assert.equal(f.requests.length,1);assert.equal(f.calls.length,0);
});
test('managed oversized read result is truncated before model input and counted with wrapping',async t=>{
 const f=await fixture(t,{outputs:[[read()],[call('request_context_expansion',{reason:'Truncated source'})]]});await fs.writeFile(path.join(f.workspace.path,'src/id.mjs'),'x'.repeat(50000));const task=await f.run();assert.equal(task.blockedOn.code,'context_expansion_required');const next=f.requests.filter(r=>r.url==='/v1/responses')[1].body;const out=next.input.find(i=>i.type==='function_call_output');assert.equal(JSON.parse(out.output).content.length,4096);assert.ok(Buffer.byteLength(JSON.stringify(out))<24576);assert.ok(!JSON.stringify(next).includes('x'.repeat(10000)));
});
test('managed concurrent duplicate driver cannot dispatch or patch twice',async t=>{
 const f=await fixture(t),tasks=await Promise.all([f.run(),f.run()]);assert.ok(tasks.every(t=>t.status==='ready'));assert.equal(f.requests.filter(r=>r.url==='/v1/responses').length,2);assert.equal(tasks[1].engineering.managed.patches,1);
});
for(const point of ['before-request','after-response','after-file'])test('managed crash at '+point+' cannot replay on restart',async t=>{
 const f=await fixture(t);let crashed=false;
 await assert.rejects(f.run({fault:p=>{if(!crashed&&p===point){crashed=true;throw Object.assign(new Error('simulated crash'),{simulatedCrash:true});}}}),/simulated crash/);const before=f.requests.length;
 const task=await f.run();assert.equal(task.status,'needs_you');assert.equal(task.engineering.managed.state,'UNCERTAIN');assert.equal(f.requests.length,before);
});
test('managed startup recovery marks unresolved attempt NEEDS YOU instead of replay',async t=>{
 const f=await fixture(t);await assert.rejects(f.run({fault:p=>{if(p==='before-request')throw Object.assign(new Error('crash'),{simulatedCrash:true});}}));let task=await f.runtime.store.findTask(f.task.id);await f.runtime.store.updateTask({...task,pid:987654321});await recoverInterruptedRuns(f.base,{kill:()=>{throw Object.assign(new Error(),{code:'ESRCH'});},log:()=>{}});task=await f.runtime.store.findTask(f.task.id);assert.equal(task.status,'needs_you');assert.equal(task.blockedOn.code,'managed_uncertain');assert.equal(f.requests.length,0);
});
test('managed response credential echo is never persisted anywhere in artifact tree',async t=>{
 const f=await fixture(t,{hook:({result,req})=>req.url==='/v1/responses'?{...result,deep:{nested:JSON.stringify({credential:key})}}:result}),task=await f.run();assert.equal(task.status,'needs_you');assert.ok(!(await artifacts(f.runtime.store.taskDir(task.slug))).includes(key));assert.equal(f.requests.filter(r=>r.url==='/v1/responses').length,1);
 for(const value of [{[key]:'x'},JSON.stringify({a:Buffer.from(key)}),{a:{b:Buffer.from(key).toString('base64')}}])assert.throws(()=>managedGuard(key)(value),/managed_credential_guard/);
});
test('managed source drift and stale patch stop without applying bytes',async t=>{
 for(const drift of ['source','patch']){const f=await fixture(t,{outputs:[[patch()]],hook:async({req,workspace})=>{if(drift==='source'&&req.url==='/v1/responses')await fs.writeFile(path.join(workspace.path,'src/id.mjs'),'user edit');}});if(drift==='patch')f.options.transport.call=((base)=>async(...args)=>{const r=await base(...args);if(args[0]==='inference')r.output[0].arguments=JSON.stringify({edits:[{file_id:'f1',old_text:'absent text',new_text:'bad'}]});return r;})(f.options.transport.call);const task=await f.run();assert.equal(task.status,'needs_you');assert.ok(['managed_source_drift','managed_patch_drift'].includes(task.blockedOn.code));}
});
test('managed verifier failure saves full artifact and never creates a fix request',async t=>{
 const f=await fixture(t),task=await f.run({checkRunner:async()=>({code:1,error:null,output:'targeted failure\n'+'log\n'.repeat(10000)})});assert.equal(task.blockedOn.code,'managed_verification_failed');assert.equal(f.requests.filter(r=>r.url==='/v1/responses').length,2);const result=await f.runtime.store.readText(path.join(f.runtime.store.taskDir(task.slug),'runs/2/result.md'));assert.ok(result.length>10000);assert.ok(!f.requests.some(r=>JSON.stringify(r.body).includes('targeted failure')));
});

test('managed batch tool/result/patch ceilings block before another request',async t=>{
 for(const [limits,outputs,code] of [
  [{...MANAGED_LIMITS,tools:1},[[read('a'),read('b')]],'managed_tool_limit'],
  [{...MANAGED_LIMITS,toolResultBytes:1},[[read()]],'managed_payload_limit'],
  [{...MANAGED_LIMITS,patches:0},[[patch()]],'managed_patch_limit'],
  [MANAGED_LIMITS,[[read('same')],[read('same')]],'managed_duplicate_or_malformed_call']
 ]){
  const f=await fixture(t,{limits,outputs}),task=await f.run();
  assert.equal(task.blockedOn.code,code);assert.equal(task.engineering.managed.patches,0);
  assert.ok(f.requests.filter(r=>r.url==='/v1/responses').length<=2);
 }
});

test('managed invalid or missing usage is unknown and prevents patch effects',async t=>{
 for(const change of [r=>({...r,model:'unexpected-model'}),r=>({...r,usage:null}),r=>({...r,usage:{...r.usage,output_tokens:2049,total_tokens:2149}}),r=>({...r,usage:{...r.usage,input_tokens_details:{cached_tokens:101}}})]){
  const f=await fixture(t,{outputs:[[patch()]],hook:({req,result})=>req.url==='/v1/responses'?change(result):result});
  const task=await f.run();assert.equal(task.blockedOn.code,'managed_usage_uncertain');
  assert.equal(task.engineering.managed.actualUsage,null);assert.equal(task.engineering.economics.aggregate.metrics.total.value,null);
  assert.equal(task.engineering.managed.patches,0);assert.equal(f.requests.filter(r=>r.url==='/v1/responses').length,1);
 }
});

test('managed intent change during inference invalidates patch authorization',async t=>{
 const f=await fixture(t,{outputs:[[patch()]],hook:async({req,f})=>{
  if(req.url==='/v1/responses'){const task=await f.runtime.store.findTask(f.task.id);await f.runtime.store.updateTask({...task,brief:'Changed approved intent'});}
 }});
 const task=await f.run();assert.equal(task.blockedOn.code,'managed_input_drift');
 assert.equal(await fs.readFile(path.join(f.workspace.path,'src/id.mjs'),'utf8'),'export const parseTaskId = () => null;\n');
});

test('managed intent change during verifier prevents READY publication',async t=>{
 const f=await fixture(t),task=await f.run({checkRunner:async()=>{
  const task=await f.runtime.store.findTask(f.task.id);await f.runtime.store.updateTask({...task,brief:'Changed during verification'});
  return {code:0,error:null,output:'check passed for old intent'};
 }});
 assert.equal(task.status,'needs_you');assert.equal(task.blockedOn.code,'managed_input_drift');
 assert.equal(f.requests.filter(r=>r.url==='/v1/responses').length,2);
});

test('managed source and patch credentials never enter Task artifacts',async t=>{
 for(const where of ['source','filename','patch','verifier']){
  const f=await fixture(t,{outputs:where==='patch'?[[call('submit_patch',{edits:[{file_id:'f1',old_text:'() => null',new_text:key}]})]]:undefined});
  if(where==='source')await fs.writeFile(path.join(f.workspace.path,'src/id.mjs'),key);
  if(where==='filename')await fs.writeFile(path.join(f.workspace.path,key),'unrelated file');
  const task=await f.run(where==='verifier'?{checkRunner:async()=>({code:0,output:key})}:{});
  assert.equal(task.status,'needs_you');assert.ok(!(await artifacts(f.runtime.store.taskDir(task.slug))).includes(key));
  assert.equal(['source','filename'].includes(where)?f.requests.length:task.engineering.managed.inferences,['source','filename'].includes(where)?0:where==='patch'?1:2);
 }
});

test('managed source/packet budgets stop before HTTP',async t=>{
 for(const kind of ['source','packet']){
  const f=await fixture(t);
  if(kind==='source')await fs.writeFile(path.join(f.workspace.path,'src/id.mjs'),'x'.repeat(65537));
  else await fs.writeFile(path.join(f.workspace.path,'AGENTS.md'),'x'.repeat(8000));
  const task=await f.run();assert.equal(task.status,'needs_you');assert.equal(f.requests.length,0);
 }
});

test('managed foreground AUTO stops without key and never enters opaque preflight',async t=>{
 assert.equal(Boolean(process.env.OPENAI_API_KEY),false,'test runner must unset real credentials');
 const f=await fixture(t),task=await runForegroundEngineering({store:f.runtime.store},f.task);
 assert.equal(task.blockedOn.code,'managed_api_key_missing');assert.equal(task.execution.provider,'managed-openai');
 assert.equal(task.runs[0].executor.observedModel,null);assert.equal(f.calls.length,0);assert.equal(f.requests.length,0);
});

test('managed artifact CHANGES also works for the existing minimal engineering config',async t=>{
 const f=await fixture(t,{config:{playbook:false}}),task=await f.run();
 assert.equal(task.status,'ready');assert.equal((await f.runtime.actions.getTaskDiff(task.id)).length,1);
 await f.runtime.actions.closeWork(task.id);assert.equal((await f.runtime.store.findTask(task.id)).status,'done');
});

test('managed foreground refuses credential-bearing brief before creating a Task',async t=>{
 const f=await fixture(t),before=(await f.runtime.store.listTasks()).length;
 process.env.OPENAI_API_KEY=key;
 try{await assert.rejects(f.runtime.actions.createWork({brief:'Do not save '+key,foreground:true}),/managed_credential_guard/);}
 finally{delete process.env.OPENAI_API_KEY;}
 assert.equal((await f.runtime.store.listTasks()).length,before);
});

test('managed deadline closes loop; late ignored response cannot apply a patch',async t=>{
 const f=await fixture(t);let release,entered;
 const reached=new Promise(r=>entered=r),delayed=new Promise(r=>release=r);
 const callBase=f.options.transport.call;
 const transport={live:false,call:async(kind,...args)=>{
  if(kind==='inference'){entered();await delayed;return {id:'late',model:registry[0].id,status:'completed',output:[patch()],usage:{input_tokens:100,output_tokens:20,total_tokens:120}};}
  return callBase(kind,...args);
 }};
 const result=f.run({transport,limits:{...MANAGED_LIMITS,deadlineMs:15000}});
 await Promise.race([reached,result.then(()=>assert.fail('deadline elapsed before inference fixture reached its pause'))]);const task=await result;assert.equal(task.status,'needs_you');assert.equal(task.engineering.managed.state,'UNCERTAIN');
 const before=await artifacts(f.runtime.store.taskDir(task.slug));release();await new Promise(r=>setTimeout(r,100));
 assert.equal(await artifacts(f.runtime.store.taskDir(task.slug)),before);assert.equal(task.engineering.managed.patches,0);
});

test('managed verifier receives no credential and deadline kills owned descendants',async t=>{
 const f=await fixture(t);
 assert.deepEqual(credentialFreeEnvironment({OPENAI_API_KEY:key,PATH:'fixture'}),{PATH:'fixture'});
 const checked=await managedCheck({argv:[process.execPath,'-e',"console.log(process.env.OPENAI_API_KEY ? 'LEAK' : 'CLEAN')"],cwd:f.base,timeout:3000});
 assert.equal(checked.code,0);assert.equal(checked.output,'CLEAN\n');
 const late=path.join(f.base,'late-effect'),childPid=path.join(f.base,'child-pid');
 const code=`const{spawn}=require('node:child_process');const fs=require('node:fs');const child=spawn(process.execPath,['-e',${JSON.stringify("setTimeout(()=>require('node:fs').writeFileSync("+JSON.stringify(late)+",'late'),700)")}],{stdio:'ignore'});fs.writeFileSync(${JSON.stringify(childPid)},String(child.pid));setInterval(()=>{},1000);`;
 const timed=await managedCheck({argv:[process.execPath,'-e',code],cwd:f.base,timeout:300});
 assert.equal(timed.error,'check_deadline');assert.equal(timed.groupClosed,true);
 assert.ok(Number(await fs.readFile(childPid,'utf8'))>0);await new Promise(r=>setTimeout(r,800));
 await assert.rejects(fs.stat(late),{code:'ENOENT'});
});

for(const point of ['before-request','in-flight','after-response'])test('managed SIGKILL '+point+' inference cannot replay after process restart',async t=>{
 const f=await fixture(t,{hook:async({req})=>{if(point==='in-flight'&&req.url==='/v1/responses')await new Promise(r=>setTimeout(r,500));}}),worker=new URL('./fixtures/managed-crash-worker.mjs',import.meta.url);
 const child=spawn(process.execPath,[worker.pathname,f.base,String(f.task.id),String(f.port),point],{env:{PATH:process.env.PATH,OPENAI_API_KEY:key},stdio:['ignore','pipe','pipe']});
 const timer=setTimeout(()=>child.kill('SIGKILL'),30000);t.after(()=>clearTimeout(timer));
 const [code,signal]=await once(child,'exit');assert.equal(code,null);assert.equal(signal,'SIGKILL');
 const before=f.requests.length,task=await f.run();assert.equal(task.engineering.managed.state,'UNCERTAIN');assert.equal(f.requests.length,before);
 assert.equal(f.requests.filter(r=>r.url==='/v1/responses').length,point==='before-request'?0:1);
 assert.equal(await fs.readFile(path.join(f.workspace.path,'src/id.mjs'),'utf8'),'export const parseTaskId = () => null;\n');
});
