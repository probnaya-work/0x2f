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
import {runManagedForeground,managedCheck,managedSearchResult} from '../src/core/engineering-managed.mjs';
import {runForegroundEngineering} from '../src/core/engineering-foreground.mjs';
import {credentialFreeEnvironment} from '../src/core/workflow-credentials.mjs';
import {renderTasks} from '../src/render.mjs';
import {MANAGED_LIMITS,MANAGED_SEARCH_BOUNDS,MANAGED_MODELS,managedTransport,managedGuard,managedCost,managedForegroundPricing,managedCalls,managedTools} from '../src/providers/managed-openai.mjs';
import {workflowLines} from '../src/web/workflow.mjs';
import {projectRow} from '../src/web/ledger.mjs';
import {snapshot} from '../src/tui/model.mjs';
import {recoverInterruptedRuns} from '../src/recover.mjs';
const key='sk-fake-managed-qualification-key';
const registry=MANAGED_MODELS;
const call=(name,args,id=name)=>({type:'function_call',call_id:id,name,arguments:JSON.stringify(args)});
const patch=()=>call('submit_patch',{edits:[{file_id:'f1',old_text:'() => null',new_text:'s => /^0*[1-9][0-9]*$/.test(s) ? Number(s) : null'}]});
const read=(id='read')=>call('read_task_file',{file_id:'f1',start_line:1,line_count:32},id);
const search=(query='parseTaskId',id='search',file_id='f1')=>call('search_task_file',{file_id,query},id);
async function fixture(t,{outputs=[[read()],[patch()]],count=100,hook,config={},transportFailure,limits=MANAGED_LIMITS,setup}={}){
 const f=await playbookFixture(t,{setup,config:{limits:{moneyMicros:24576,tokens:12288,modelCalls:4,providerCalls:9,wallClockMs:30000,implementationAttempts:1,agentRuns:1},...config}});
 const git=args=>execFileSync('/usr/bin/git',['-C',f.base,...args],{env:{PATH:'/usr/bin:/bin'},stdio:'pipe'});
 git(['init','-q']);git(['add','src','test']);git(['-c','user.name=Fixture','-c','user.email=fixture@localhost','commit','--no-gpg-sign','--no-verify','-qm','fixture base']);
 const spec={repository:f.base,ref:'HEAD'};let task=await f.runtime.store.findTask(f.task.id);const c={...task.engineering.config,workspace:spec};task=await f.runtime.store.updateTask({...task,engineering:{...task.engineering,config:c,configDigest:hash(c)}});
 const workspace=await ensureEngineeringWorkspace(f.runtime.store,task,spec);task=await mutateEngineering(f.runtime.store,task.slug,task.engineering.driver.token,t=>({...t,engineering:{...t.engineering,workspace,economics:{policy:economicsPolicy(t)}}}));
 const requests=[];let inf=0;const server=http.createServer(async(req,res)=>{let raw='';for await(const b of req)raw+=b;const body=raw?JSON.parse(raw):{};requests.push({url:req.url,body,hasAuth:req.headers.authorization==='Bearer '+key});
  if(transportFailure){res.writeHead(429);return res.end(JSON.stringify({error:key}));}
  let result;if(req.url.startsWith('/v1/models/'))result={id:registry[0].id};else if(req.url.endsWith('/input_tokens'))result={object:'response.input_tokens',input_tokens:typeof count==='function'?count(inf+1):count};else {inf++;result={id:'resp_'+inf,model:registry[0].id,status:'completed',output:outputs[inf-1]??[read('extra')],usage:{input_tokens:typeof count==='function'?count(inf):count,output_tokens:20,total_tokens:(typeof count==='function'?count(inf):count)+20,input_tokens_details:{cached_tokens:10}}};}
  if(hook)result=await hook({req,body,result,f,workspace,inf})??result;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));
 const transport=managedTransport(key,{fetchImpl:(url,init)=>fetch('http://127.0.0.1:'+server.address().port+new URL(url).pathname,init)});transport.live=false;
 const previews=[];const options={foregroundCanary:true,onPreview:preview=>{previews.push(preview);},env:{OPENAI_API_KEY:key},transport,registry,limits};
 return {...f,task,workspace,requests,previews,port:server.address().port,options,run:opts=>runManagedForeground({store:f.runtime.store},task,{...options,...opts})};
}
async function artifacts(root){let text='';async function walk(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())await walk(p);else if(e.isFile())text+=await fs.readFile(p,'utf8');}}await walk(root);return text;}

test('literal search and targeted reads validate IDs, queries and ranges before execution',()=>{
 const state={limits:MANAGED_LIMITS,callIds:[],tools:0,reads:0,patches:0},manifest=[{id:'f1'}];
 const validate=item=>managedCalls({status:'completed',output:[item]},state,manifest);
 for(const id of ['f99','../outside','.work/task.json','credentials'])assert.throws(()=>validate(search('x','s',id)),/managed_file_id/);
 for(const q of ['', 'x'.repeat(129),'🚀'.repeat(33),'x\ny','x\r','\0'])assert.throws(()=>validate(search(q)),/managed_search_query/);
 assert.equal(validate(search('.*[]$')).length,1);
 for(const args of [{start_line:0,line_count:1},{start_line:1,line_count:33},{start_line:1,line_count:0},{start_line:1,line_count:null},{start_line:1.5,line_count:1}])assert.throws(()=>validate(call('read_task_file',{file_id:'f1',...args})),/managed_read_range/);
 assert.equal(validate(call('read_task_file',{file_id:'f1',start_line:1,line_count:32})).length,1);
});

test('literal search bounds matching lines, UTF-8 excerpts, context and entire serialized result',()=>{
 const b=MANAGED_SEARCH_BOUNDS,text=Array.from({length:20},(_,i)=>`${i}: ${'🚀'.repeat(45)} literal.*[] ${'x'.repeat(300)}`).join('\r\n');
 const result=managedSearchResult('f1',text,'literal.*[]','s'),out=JSON.parse(result.output);
 assert.ok(out.matches.length>0&&out.matches.length<=6);assert.equal(out.truncated,true);
 assert.equal(out.matches[0].line,1);assert.ok(Buffer.byteLength(JSON.stringify(result))<=4096);
 for(const m of out.matches){assert.ok(Buffer.byteLength(m.excerpt)<=160);assert.ok(m.context.length<=2);for(const c of m.context){assert.equal(Math.abs(c.line-m.line),1);assert.ok(Buffer.byteLength(c.excerpt)<=160);}}
 assert.equal(JSON.parse(managedSearchResult('f1','literalxxxx\n.*[]','.*[]','s').output).matches[0].line,2);
 const escaped=managedSearchResult('f1',('"\\\t'.repeat(300)+' needle\n').repeat(10),'needle','s');
 assert.ok(Buffer.byteLength(JSON.stringify(escaped))<=b.resultBytes);
});

for(const change of ['symlink','identity','bytes'])test(`search rejects ${change} after manifest capture without another inference`,async t=>{
 const f=await fixture(t,{outputs:[[search()]],hook:async({req,workspace})=>{
  if(req.url!=='/v1/responses')return;
  const source=path.join(workspace.path,'src/id.mjs');
  if(change==='bytes')await fs.writeFile(source,'changed');
  else {const tmp=source+'.replacement';await fs.writeFile(tmp,await fs.readFile(source));if(change==='identity')await fs.rename(tmp,source);else {await fs.unlink(source);await fs.symlink(tmp,source);}}
 }}),task=await f.run();
 assert.equal(task.status,'needs_you');if(change==='identity')assert.equal(task.blockedOn.code,'managed_source_identity');
 assert.equal(task.engineering.managed.inferences,1);assert.equal(task.engineering.managed.patches,0);
 assert.equal(f.requests.length,3);assert.equal(f.calls.length,0);
 assert.equal(await f.runtime.store.exists(path.join(f.runtime.store.taskDir(task.slug),'runs/1/managed/tool-1-receipt.json')),false);
});

test('ignored/untracked approved source is rejected at preflight before credential or requests',async t=>{
 const f=await fixture(t,{config:{files:['src/id.mjs','test/id.test.mjs','src/ignored.mjs']}});
 await fs.writeFile(path.join(f.workspace.path,'.gitignore'),'src/ignored.mjs\n');await fs.writeFile(path.join(f.workspace.path,'src/ignored.mjs'),'ignored');
 assert.equal(execFileSync('/usr/bin/git',['-C',f.workspace.path,'check-ignore','src/ignored.mjs'],{env:{PATH:'/usr/bin:/bin'}}).toString().trim(),'src/ignored.mjs');
 let credentials=0;const task=await f.run({credential:async()=>{credentials++;return key;}});
 assert.equal(task.blockedOn.code,'managed_untracked_source');assert.equal(credentials,0);assert.equal(f.requests.length,0);
});

test('search shares tool/result ceilings and stops safely without continuation, retry or fallback',async t=>{
 for(const limits of [{...MANAGED_LIMITS,toolResultBytes:1},{...MANAGED_LIMITS,tools:1}]){
  const f=await fixture(t,{limits,outputs:[[search()],[read(),patch()]]}),task=await f.run();
  assert.equal(task.status,'needs_you');assert.equal(task.blockedOn.code,limits.toolResultBytes===1?'managed_payload_limit':'managed_tool_limit');
  assert.equal(task.engineering.managed.patches,0);assert.ok(task.engineering.managed.resultBytes<=limits.toolResultBytes);
  const before=f.requests.length;await f.run();assert.equal(f.requests.length,before);assert.equal(f.calls.length,0);
 }
});

test('search bytes contribute to exhaustion of the unchanged 24 KiB result ceiling',async t=>{
 const f=await fixture(t,{outputs:[[search('needle'),read('r1'),read('r2'),read('r3')]]});
 const source='a'.repeat(3000)+'"'.repeat(1096)+'\n'+Array.from({length:12},()=> 'needle '+'.'.repeat(200)).join('\n');
 await fs.writeFile(path.join(f.workspace.path,'src/id.mjs'),source);
 const task=await f.run(),m=task.engineering.managed;
 assert.equal(task.blockedOn.code,'managed_payload_limit');assert.equal(m.inferences,1);assert.equal(m.searches,1);assert.equal(m.reads,3);assert.equal(m.patches,0);
 const root=f.runtime.store.taskDir(task.slug),receipts=await Promise.all([1,2,3].map(i=>f.runtime.store.readJson(path.join(root,`runs/1/managed/tool-${i}-receipt.json`))));
 assert.equal(m.resultBytes,receipts.reduce((n,r)=>n+r.bytes,0));assert.ok(m.resultBytes<=24576);
 const readBytes=receipts[1].bytes;assert.ok(3*readBytes<24576);assert.ok(m.resultBytes+readBytes>24576,'search result uses the same ceiling');
 assert.equal(await f.runtime.store.exists(path.join(root,'runs/1/managed/tool-4-receipt.json')),false);
 const before=f.requests.length;await f.run();assert.equal(f.requests.length,before);
});

test('scheduled/unattended managed search cannot retrieve a credential or dispatch a tool',async t=>{
 const f=await fixture(t,{outputs:[[search()]]});let credentials=0;
 const task=await f.run({foregroundCanary:false,foregroundAuthorized:false,credential:async()=>{credentials++;throw new Error('must not retrieve');}});
 assert.equal(task.status,'needs_you');assert.equal(credentials,0);assert.equal(f.requests.length,0);assert.equal(task.engineering.managed.tools,0);assert.equal(task.engineering.managed.searches,0);
});

test('Task 001-shaped large source: search → targeted read → patch → verifier → READY, one bounded attempt',async t=>{
 const targetLine=301,outputs=[[search()],[call('read_task_file',{file_id:'f1',start_line:targetLine,line_count:1},'targeted'),patch()]];
 const f=await fixture(t,{count:1031,outputs,hook:({req,body,inf})=>{
  if(req.url==='/v1/responses'&&inf===2){const result=body.input.find(i=>i.type==='function_call_output');assert.equal(JSON.parse(result.output).matches[0].line,targetLine);}
 }});
 const large='// filler '+ 'x'.repeat(90)+'\n',prefix=large.repeat(300),source=prefix+'export const parseTaskId = () => null;\n';
 await fs.writeFile(path.join(f.workspace.path,'src/id.mjs'),source+'//'+'.'.repeat(31003-Buffer.byteLength(source)-3)+'\n');
 const testFile=path.join(f.workspace.path,'test/id.test.mjs'),check=await fs.readFile(testFile,'utf8');await fs.writeFile(testFile,check+'//'+'.'.repeat(3046-Buffer.byteLength(check)-3)+'\n');
 await fs.writeFile(path.join(f.workspace.path,'AGENTS.md'),'# Fixture constraints\n'+'.'.repeat(2100));
 const task=await f.run();assert.equal(task.status,'ready',task.blockedOn?.text);const m=task.engineering.managed;
 assert.equal(m.searches,1);assert.equal(m.reads,1);assert.equal(m.tools,3);assert.equal(m.patches,1);assert.equal(m.inferences,2);assert.equal(m.counts,2);assert.equal(m.modelQueries,1);
 assert.ok(m.resultBytes<1024);assert.ok(m.inputBytes<=MANAGED_LIMITS.serializedInputBytes);assert.ok(m.actualUsage.total<=MANAGED_LIMITS.inputTokens+MANAGED_LIMITS.outputTokens);
 const root=f.runtime.store.taskDir(task.slug),attempt=await f.runtime.store.readJson(path.join(root,'runs/1/managed/attempt.json'));
 assert.ok(Buffer.byteLength(JSON.stringify(attempt.packet))<=8192);assert.deepEqual(attempt.limits,MANAGED_LIMITS);
 const receipts=await Promise.all([1,2].map(i=>f.runtime.store.readJson(path.join(root,`runs/1/managed/tool-${i}-receipt.json`))));
 assert.deepEqual(receipts.map(r=>r.tool),['search_task_file','read_task_file']);assert.equal(receipts.reduce((n,r)=>n+r.bytes,0),m.resultBytes);
 assert.equal(JSON.parse(receipts[1].result.output).start_line,targetLine);
 const usage=await f.runtime.store.readJson(path.join(root,'runs/1/usage.json'));assert.equal(usage.sourceEvidence.find(e=>e.tool==='search_task_file').bytes,receipts[0].bytes);
 assert.ok(workflowLines(task).some(l=>l.includes('1 searches')));assert.deepEqual(projectRow(task,await f.runtime.store.readEvents(task.slug)).workflowLines,workflowLines(task));assert.deepEqual((await snapshot(f.runtime)).tasks[0].workflowLines,workflowLines(task));
 assert.equal(task.engineering.economics.attempts.length,1);assert.equal(task.engineering.verification.code,0);assert.equal(task.engineering.delivery,undefined);assert.equal(f.calls.length,0);
 const before=f.requests.length;await f.run();assert.equal(f.requests.length,before);
 if(process.env.OX2F_MANAGED_EVIDENCE_DIR){const dir=process.env.OX2F_MANAGED_EVIDENCE_DIR;assert.match(dir,/^\/private\/tmp\/0x2f-managed-[a-z0-9-]+$/);await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'source-search.json'),JSON.stringify(managedGuard(key)({kind:'deterministic fake Responses fixture; no provider or Keychain calls',task,attempt,receipts,usage,projection:workflowLines(task),requests:f.requests.map(r=>({url:r.url,bytes:Buffer.byteLength(JSON.stringify(r.body))}))}),null,2)+'\n');}
});

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
 ['search outside scope',[search('x','s','f99')],'managed_file_id'],
 ['duplicate patch batch',[patch(),{...patch(),call_id:'second'}],'managed_patch_limit'],
 ['excessive reads',Array.from({length:5},(_,i)=>read('read'+i)),'managed_read_limit'],
 ['context expansion',[call('request_context_expansion',{reason:'Need more context'})],'context_expansion_required'],
 ['patch outside scope',[call('submit_patch',{edits:[{file_id:'f2',old_text:'x',new_text:'y'}]})],'managed_patch_scope']
])test('managed '+name+' stops without next inference or tool effect',async t=>{
 const f=await fixture(t,{outputs:[output]}),task=await f.run();assert.equal(task.status,'needs_you');assert.equal(task.blockedOn.code,code);assert.equal(f.requests.filter(r=>r.url==='/v1/responses').length,1);assert.equal(await fs.readFile(path.join(f.workspace.path,'src/id.mjs'),'utf8'),'export const parseTaskId = () => null;\n');
});
test('managed request ceiling stops after two inference requests without a third',async t=>{
 const f=await fixture(t,{limits:{...MANAGED_LIMITS,inferenceRequests:2,countRequests:2,responsesRequests:4},outputs:[[read('a')],[read('b')]]}),task=await f.run();assert.equal(task.blockedOn.code,'managed_request_limit');assert.equal(f.requests.filter(r=>r.url==='/v1/responses').length,2);assert.equal(task.engineering.managed.requests,4);
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

test('foreground pricing permits unpriced controls only with explicit foreground authorization, never unattended',()=>{
 const predicted=managedCost(MANAGED_MODELS[0]);
 assert.equal(predicted.inferenceUpperUsd,0.024576);assert.equal(predicted.totalUpperUsd,null);
 assert.deepEqual(predicted.controlRequests,{classification:'unpriced_control_request',maximum:5,tokenCountMaximum:4,availabilityMaximum:1,separatePublishedFee:false,contractualZeroFee:false,includedInInferenceMaximum:false});
 assert.throws(()=>managedForegroundPricing(predicted,{mode:'foreground'}),/managed_foreground_canary_required/);
 assert.throws(()=>managedForegroundPricing(predicted,{mode:'unattended',foregroundCanary:true}),/managed_unattended_unqualified/);
 assert.throws(()=>managedForegroundPricing(predicted,{mode:'unattended',foregroundAuthorized:true}),/managed_unattended_unqualified/);
 assert.equal(managedForegroundPricing(predicted,{mode:'foreground',foregroundAuthorized:true}).publishedBillableInferenceMaximumUsd,0.024576);
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
 assert.equal(preview.pricingPolicy.controlRequests.maximum,5);assert.equal(preview.model,MANAGED_MODELS[0].id);
 assert.equal(preview.pricingSource,MANAGED_MODELS[0].price.source);assert.ok(preview.pricingObservedAt);assert.match(preview.notice,/no separate published fee/);
 const saved=await f.runtime.store.readJson(path.join(f.runtime.store.taskDir(task.slug),'runs/1/managed/foreground-preview.json'));assert.deepEqual(saved,preview);
 assert.equal(f.requests.filter(r=>r.url.startsWith('/v1/models/')).length,1);assert.equal(f.requests.filter(r=>r.url.endsWith('/input_tokens')).length,2);assert.equal(f.requests.length,5);
 for(let i=1;i<=5;i++){
  const receipt=await f.runtime.store.readJson(path.join(f.runtime.store.taskDir(task.slug),`runs/1/managed/request-${i}-receipt.json`));
  assert.equal(receipt.requestType,receipt.kind==='inference'?'published_billable_inference':'unpriced_control_request');
 }
 const lines=workflowLines(task);assert.ok(lines.includes('PUBLISHED BILLABLE INFERENCE MAXIMUM: $0.024576'));
 assert.ok(lines.some(l=>l.startsWith('CONTROL REQUESTS: 5 maximum, no separate published fee')));
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
 const f=await fixture(t),task=await f.run({env:{}});assert.equal(task.blockedOn.code,'managed_api_key_missing');assert.equal(f.requests.length,0);assert.match(task.blockedOn.text,/2f-next auth import/);
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
 // Credential-path regression uses a fresh clock fixture, not refreshed prices.
 t.mock.method(Date,'now',()=>Date.parse(MANAGED_MODELS[0].price.observedAt)+1000);
 const f=await fixture(t),task=await runForegroundEngineering({store:f.runtime.store,managedCredential:async()=>null},f.task);
 assert.equal(task.blockedOn.code,'managed_api_key_missing');assert.equal(task.execution.provider,'managed-openai');
 assert.equal(task.runs[0].executor.observedModel,null);assert.equal(f.calls.length,0);assert.equal(f.requests.length,0);
});

test('managed artifact CHANGES also works for the existing minimal engineering config',async t=>{
 const f=await fixture(t,{config:{playbook:false}}),task=await f.run();
 assert.equal(task.status,'ready');assert.equal((await f.runtime.actions.getTaskDiff(task.id)).length,1);
 await f.runtime.actions.closeWork(task.id);assert.equal((await f.runtime.store.findTask(task.id)).status,'done');
});

test('managed credential is accessed once immediately before authorized dispatch, never on duplicate boundary',async t=>{
 const f=await fixture(t);let reads=0;
 const credential=async()=>{reads++;assert.equal(f.requests.length,0);return key;};
 const task=await f.run({env:{},credential,foregroundCanary:false,foregroundAuthorized:true});
 assert.equal(task.status,'ready');assert.equal(reads,1);
 await f.run({env:{},credential,foregroundCanary:false,foregroundAuthorized:true});
 assert.equal(reads,1);assert.equal(f.requests.length,5);
});

test('ineligible foreground Task stops before credential, opaque harness or detached dispatch',async t=>{
 const f=await fixture(t,{config:{requireReview:true}});let credentials=0;
 const task=await runForegroundEngineering({store:f.runtime.store,managedCredential:async()=>{credentials++;throw new Error('must not retrieve');}},f.task);
 assert.equal(task.status,'needs_you');assert.equal(task.blockedOn.code,'managed_small_only');
 assert.equal(credentials,0);assert.equal(f.requests.length,0);assert.equal(f.calls.length,0);
});

test('authorization and configured budget failures happen before any credential access',async t=>{
 for(const opts of [{foregroundCanary:false},{limits:{...MANAGED_LIMITS,inputTokens:MANAGED_LIMITS.inputTokens}}]){
  const f=await fixture(t,opts.limits?{config:{limits:{moneyMicros:0,tokens:20000,modelCalls:2,providerCalls:5,wallClockMs:30000,implementationAttempts:1}}}:{});
  let reads=0;const task=await f.run({...opts,credential:async()=>{reads++;return key;}});
  assert.equal(task.status,'needs_you');assert.equal(reads,0);assert.equal(f.requests.length,0);
 }
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


test('read range schema and runtime agree at every advertised boundary',()=>{
 const properties=managedTools.find(t=>t.name==='read_task_file').parameters.properties;
 assert.deepEqual(properties.start_line,{type:'integer',minimum:1,maximum:Number.MAX_SAFE_INTEGER});
 assert.deepEqual(properties.line_count,{type:'integer',minimum:1,maximum:32});
 for(const start_line of [null,0,1,Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER+1,1.5])for(const line_count of [null,0,1,32,33,1.5]){
  const valid=Number.isSafeInteger(start_line)&&start_line>=1&&Number.isSafeInteger(line_count)&&line_count>=1&&line_count<=32;
  const run=()=>managedCalls({status:'completed',output:[call('read_task_file',{file_id:'f1',start_line,line_count})]},{limits:MANAGED_LIMITS,callIds:[],tools:0,reads:0,patches:0},[{id:'f1'}]);
  if(valid)assert.equal(run().length,1);else assert.throws(run,/managed_read_range/);
 }
});

test('Task 002-shaped two-file searches → targeted reads → one multi-file patch → verifier → READY',async t=>{
 const sourcePath='src/cli.mjs',testPath='test/engineering-foreground-cli.test.mjs';
 const original='console.log(`Created #${String(task.id).padStart(3, "0")}: ${task.title}`);';
 const replacement=original+'\nconsole.log(`Next #${String(task.id).padStart(3, "0")}: 2f-next open ${task.id}`);';
 const testOriginal="assert.match(output, /^Created #001: Fixture/m); // foreground";
 const testReplacement=testOriginal+"\nassert.ok(output.includes('Next #001: 2f-next open 1'));";
 const source=('// filler '+'.'.repeat(60)+'\n').repeat(395)+"const task = {id:1,title:'Fixture'};\n\n"+original+'\n';
 const check='// fixture\n'.repeat(16)+"import assert from 'node:assert/strict';\nimport {execFileSync} from 'node:child_process';\nconst output=execFileSync(process.execPath,[new URL('../src/cli.mjs',import.meta.url).pathname],{encoding:'utf8',env:{PATH:'/usr/bin:/bin'}});\n"+testOriginal+'\n';
 const pad=(text,size)=>text+'//'+'.'.repeat(size-Buffer.byteLength(text)-3)+'\n';
 const outputs=[[search('Created #','source-search'),search('foreground','test-search','f2')],[call('read_task_file',{file_id:'f1',start_line:396,line_count:3},'source-read'),call('read_task_file',{file_id:'f2',start_line:17,line_count:4},'test-read')],[call('submit_patch',{edits:[{file_id:'f1',old_text:original,new_text:replacement},{file_id:'f2',old_text:testOriginal,new_text:testReplacement}]})]];
 const f=await fixture(t,{count:1031,config:{files:[sourcePath,testPath],writePaths:[sourcePath,testPath],check:[process.execPath,'--test',testPath]},outputs,setup:async({base})=>{
  await fs.writeFile(path.join(base,sourcePath),pad(source,31003));await fs.writeFile(path.join(base,testPath),pad(check,3046));
 },hook:({req,body,inf})=>{
  if(req.url!=='/v1/responses')return;
  if(inf===2)assert.equal(body.input.filter(i=>i.type==='function_call_output').length,2);
  if(inf===3){const results=body.input.filter(i=>i.type==='function_call_output').map(i=>JSON.parse(i.output));assert.equal(results.filter(r=>r.content!==undefined).length,2);assert.ok(results.every(r=>!r.matches),'targeted bytes supersede locator context only; exact searches remain durable');}
 }});
 await fs.writeFile(path.join(f.workspace.path,'AGENTS.md'),'# Fixture constraints\n'+'.'.repeat(2100));
 const before=await f.runtime.store.findTask(f.task.id);await f.runtime.store.updateTask({...before,brief:'After creating a Task, print one concise next-action line containing the created Task ID and the exact command to open it. Reuse the existing CLI projection and style. Do not add flags, concepts, routing behavior, or another interface. Preserve existing output compatibility and add deterministic CLI regression tests.'});
 const task=await f.run(),m=task.engineering.managed;assert.equal(task.status,'ready',JSON.stringify({blocked:task.blockedOn,inputBytes:m.inputBytes}));
 assert.deepEqual([m.inferences,m.counts,m.modelQueries,m.searches,m.reads,m.patches,m.tools],[3,3,1,2,2,1,5]);
 assert.ok(m.actualUsage.total<=12288);assert.equal(m.predicted.inferenceUpperUsd,0.024576);assert.equal(m.predicted.totalUpperUsd,null);
 assert.ok(m.resultBytes<8192);assert.ok(m.inputBytes<=32768);assert.equal(m.limits.toolResultBytes,24576);assert.equal(m.limits.readResultBytes,4096);
 const root=f.runtime.store.taskDir(task.slug),attempt=await f.runtime.store.readJson(path.join(root,'runs/1/managed/attempt.json'));
 assert.ok(Buffer.byteLength(JSON.stringify(attempt.packet))<8192);assert.deepEqual(attempt.packet.files.map(f=>f.bytes),[31003,3046]);
 assert.equal(task.engineering.economics.attempts.length,1);assert.equal(task.engineering.verification.code,0);assert.equal(task.engineering.delivery,undefined);assert.equal(f.calls.length,0);
 const diff=await f.runtime.actions.getTaskDiff(task.id);assert.deepEqual(diff.map(d=>d.path).sort(),[sourcePath,testPath]);
 assert.deepEqual(projectRow(task,await f.runtime.store.readEvents(task.slug)).workflowLines,workflowLines(task));assert.deepEqual((await snapshot(f.runtime)).tasks[0].workflowLines,workflowLines(task));
 assert.ok(workflowLines(task).some(l=>l.includes('4 inference + 4 count')));assert.ok(workflowLines(task).some(l=>l.includes('5 maximum, no separate published fee')));
 assert.ok(workflowLines(task).some(l=>l.includes('7 HTTP')));
 const requests=f.requests.length;await f.run();assert.equal(f.requests.length,requests);assert.equal(task.engineering.managed.attempt,(await f.runtime.store.findTask(task.id)).engineering.managed.attempt);
 if(process.env.OX2F_MANAGED_EVIDENCE_DIR){const dir=process.env.OX2F_MANAGED_EVIDENCE_DIR;assert.match(dir,/^\/private\/tmp\/0x2f-managed-[a-z0-9-]+$/);await fs.mkdir(dir,{recursive:true});const receipts=[];for(let i=1;i<=5;i++)receipts.push(await f.runtime.store.readJson(path.join(root,`runs/1/managed/tool-${i}-receipt.json`)));await fs.writeFile(path.join(dir,'task002-shape.json'),JSON.stringify(managedGuard(key)({kind:'offline fake Responses only; no provider or Keychain calls',task,attempt,receipts,projection:workflowLines(task),requests:f.requests.map(r=>({url:r.url,bytes:Buffer.byteLength(JSON.stringify(r.body))})),verification:task.engineering.verification}),null,2)+'\n');}
});

test('Task 003-shaped discovery: targeted test read + code locator → targeted source read → patch → READY',async t=>{
 const sourcePath='src/cli.mjs',testPath='test/engineering-foreground-cli.test.mjs';
 const original='console.log(`Created #${String(task.id).padStart(3, "0")}: ${task.title}`);';
 const replacement=original+'\nconsole.log(`Next #${String(task.id).padStart(3, "0")}: 2f-next open ${task.id}`);';
 const testOriginal='assert.match(output, /^Created #001: Fixture/m);';
 const testReplacement=testOriginal+"\nassert.ok(output.includes('Next #001: 2f-next open 1'));";
 const source=('// filler '+'.'.repeat(60)+'\n').repeat(394)+'if ((process.argv[2] ?? "new") === "new") {\n'+"const task = {id:1,title:'Fixture'};\n\n"+original+'\n}\n';
 const check='// fixture\n'.repeat(16)+"import assert from 'node:assert/strict';\nimport {execFileSync} from 'node:child_process';\nconst output=execFileSync(process.execPath,[new URL('../src/cli.mjs',import.meta.url).pathname,'new'],{encoding:'utf8',env:{PATH:'/usr/bin:/bin'}});\n"+testOriginal+'\n';
 const pad=(text,size)=>text+('// pad\n'.repeat(Math.floor((size-Buffer.byteLength(text)-3)/7)))+'//'+'.'.repeat((size-Buffer.byteLength(text)-3)%7)+'\n';
 const outputs=[
  [call('read_task_file',{file_id:'f2',start_line:17,line_count:4},'small-test'),search('"new"','code-locator')],
  [call('read_task_file',{file_id:'f1',start_line:395,line_count:4},'source-read')],
  [call('submit_patch',{edits:[{file_id:'f1',old_text:original,new_text:replacement},{file_id:'f2',old_text:testOriginal,new_text:testReplacement}]})]
 ];
 const f=await fixture(t,{count:1031,outputs,config:{files:[sourcePath,testPath],writePaths:[sourcePath,testPath],check:[process.execPath,'--test',testPath]},setup:async({base})=>{
  await fs.writeFile(path.join(base,sourcePath),pad(source,31003));await fs.writeFile(path.join(base,testPath),pad(check,3046));
 },hook:({req,body,inf})=>{
  if(req.url!=='/v1/responses')return;
  assert.match(body.instructions,/Read small tests before guessed UI searches/);
  assert.match(body.instructions,/one search\/file\/batch/);assert.match(body.instructions,/No hits: read, not synonyms/);
  const remaining=['4 turns, 6 tools, 4 reads, 1 patch.','3 turns, 4 tools, 3 reads, 1 patch.','2 turns, 3 tools, 2 reads, 1 patch.'];
  assert.ok(body.instructions.endsWith('Left: '+remaining[inf-1]));
  if(inf===2){const results=body.input.filter(i=>i.type==='function_call_output').map(i=>JSON.parse(i.output));assert.ok(results.some(r=>r.content?.includes("'new'")));assert.equal(results.find(r=>r.matches).matches[0].line,395);}
  if(inf===3){const results=body.input.filter(i=>i.type==='function_call_output').map(i=>JSON.parse(i.output));assert.ok(results.some(r=>r.content?.includes(original)));}
 }});
 await fs.writeFile(path.join(f.workspace.path,'AGENTS.md'),'# Fixture constraints\n'+'.'.repeat(2100));
 const before=await f.runtime.store.findTask(f.task.id);await f.runtime.store.updateTask({...before,brief:'After creating a Task, print one concise next-action line containing the created Task ID and the exact command to open it. Reuse the existing CLI projection and style. Do not add flags, concepts, routing behavior, or another interface. Preserve existing output compatibility and add deterministic CLI regression tests.'});
 const task=await f.run(),m=task.engineering.managed;
 assert.equal(task.status,'ready',JSON.stringify({blocked:task.blockedOn,inputBytes:m.inputBytes}));
 assert.deepEqual([m.inferences,m.counts,m.modelQueries,m.tools,m.searches,m.reads,m.patches],[3,3,1,4,1,2,1]);
 assert.ok(m.actualUsage.total<=12288);assert.equal(m.predicted.inferenceUpperUsd,0.024576);assert.equal(m.providerReportedCost,'unknown');
 assert.ok(m.inputBytes<=32768);assert.ok(m.resultBytes<8192);assert.deepEqual(m.limits,MANAGED_LIMITS);
 assert.equal(task.engineering.economics.attempts.length,1);assert.equal(task.engineering.verification.code,0);assert.equal(task.engineering.delivery,undefined);assert.equal(f.calls.length,0);
 assert.deepEqual((await f.runtime.actions.getTaskDiff(task.id)).map(d=>d.path).sort(),[sourcePath,testPath]);
 const root=f.runtime.store.taskDir(task.slug),attempt=await f.runtime.store.readJson(path.join(root,'runs/1/managed/attempt.json'));
 assert.deepEqual(attempt.packet.files.map(f=>f.bytes),[31003,3046]);assert.ok(Buffer.byteLength(JSON.stringify(attempt.packet))<8192);
 const receipts=await Promise.all([1,2,3,4].map(i=>f.runtime.store.readJson(path.join(root,`runs/1/managed/tool-${i}-receipt.json`))));
 assert.deepEqual(receipts.map(r=>r.tool),['read_task_file','search_task_file','read_task_file','submit_patch']);
 assert.equal(receipts.slice(0,3).reduce((n,r)=>n+r.bytes,0),m.resultBytes);
 assert.deepEqual(projectRow(task,await f.runtime.store.readEvents(task.slug)).workflowLines,workflowLines(task));assert.deepEqual((await snapshot(f.runtime)).tasks[0].workflowLines,workflowLines(task));
 const requests=f.requests.length;await f.run();assert.equal(f.requests.length,requests);assert.equal(requests,7);
 if(process.env.OX2F_MANAGED_EVIDENCE_DIR){const dir=process.env.OX2F_MANAGED_EVIDENCE_DIR;assert.match(dir,/^\/private\/tmp\/0x2f-managed-[a-z0-9-]+$/);await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'task003-search-economy.json'),JSON.stringify(managedGuard(key)({kind:'offline scripted Responses; exercises instructions and budgets, not real model compliance',task,attempt,receipts,projection:workflowLines(task),requests:f.requests.map(r=>({url:r.url,instructions:r.body.instructions,bytes:Buffer.byteLength(JSON.stringify(r.body))})),verification:task.engineering.verification}),null,2)+'\n');}
});

test('Task 003 exact guessed-search batches still stop before an oversized second batch',async t=>{
 const outputs=[['After creating a Task','open it','Created Task'].map((q,i)=>search(q,'guess-'+i)).concat(search('Task','guess-3','f2')),['task id','task.json','print'].map((q,i)=>search(q,'guess-'+(i+4))).concat(search('open','guess-7','f2'))];
 const f=await fixture(t,{outputs,setup:({base})=>fs.writeFile(path.join(base,'test/id.test.mjs'),'// fixture test\n'),hook:({req,body,inf})=>{if(req.url==='/v1/responses'&&inf===2)assert.ok(body.instructions.endsWith('Left: 3 turns, 2 tools, 4 reads, 1 patch.'));}});
 const task=await f.run(),m=task.engineering.managed;
 assert.equal(task.status,'needs_you');assert.equal(task.blockedOn.code,'managed_tool_limit');
 assert.deepEqual([m.inferences,m.searches,m.reads,m.patches,m.tools],[2,4,0,0,4]);
 assert.equal(f.requests.length,5);assert.equal(task.engineering.delivery,undefined);assert.equal(task.engineering.verification,null);assert.equal(f.calls.length,0);
 const root=f.runtime.store.taskDir(task.slug);for(let i=1;i<=4;i++)assert.deepEqual(JSON.parse((await f.runtime.store.readJson(path.join(root,`runs/1/managed/tool-${i}-receipt.json`))).result.output).matches,[]);
 assert.equal(await f.runtime.store.exists(path.join(root,'runs/1/managed/tool-5-receipt.json')),false);
 const requests=f.requests.length;await f.run();assert.equal(f.requests.length,requests);
});

test('four inference requests share the unchanged 8192 input + 4096 output ceiling and cost maximum',async t=>{
 const f=await fixture(t,{count:2048,outputs:[[search('parseTaskId','s1')],[search('014','s2','f2')],[read('r')],[patch()]],hook:({req,result})=>req.url==='/v1/responses'?{...result,usage:{...result.usage,output_tokens:1024,total_tokens:3072}}:result});
 const task=await f.run(),m=task.engineering.managed;assert.equal(task.status,'ready',task.blockedOn?.text);
 assert.deepEqual([m.inferences,m.counts,m.modelQueries,m.requests],[4,4,1,8]);assert.equal(f.requests.length,9);
 assert.deepEqual(m.actualUsage,{input:8192,cachedInput:40,output:4096,total:12288});assert.equal(m.outputReserved,4096);assert.equal(m.inputReserved,8192);
 assert.deepEqual(f.requests.filter(r=>r.url==='/v1/responses').map(r=>r.body.max_output_tokens),[2048,2048,2048,1024]);
 const root=f.runtime.store.taskDir(task.slug);
 for(const n of [1,3,5,7,9]){const intent=await f.runtime.store.readJson(path.join(root,`runs/1/managed/request-${n}-intent.json`));assert.ok(intent.remaining.publishedInferenceUsd>=0&&intent.remaining.publishedInferenceUsd<=0.024576);}
 assert.equal((await f.runtime.store.readJson(path.join(root,'runs/1/managed/request-9-intent.json'))).remaining.publishedInferenceUsd,0);
 assert.equal(m.predicted.inferenceUpperUsd,0.024576);assert.ok(m.calculatedInferenceCostUsd<=0.024576);assert.equal(m.pricingPolicy.controlRequests.maximum,5);assert.equal(m.providerReportedCost,'unknown');
 assert.equal(task.engineering.economics.attempts.length,1);assert.equal(f.calls.length,0);
 const lines=workflowLines(task);assert.ok(lines.some(l=>l.includes('9 HTTP')));assert.ok(lines.some(l=>l.includes('5 dispatched')));
});

test('next cumulative input reservation over 8192 stops before its inference dispatch',async t=>{
 const f=await fixture(t,{count:2731,outputs:[[search('x','s1')],[search('y','s2')],[patch()]]}),task=await f.run(),m=task.engineering.managed;
 assert.equal(task.blockedOn.code,'managed_token_limit');assert.deepEqual([m.inferences,m.counts,m.patches],[2,3,0]);assert.equal(m.actualUsage.input,5462);assert.equal(m.actualUsage.total,5502);
 assert.equal(f.requests.length,6);const before=f.requests.length;await f.run();assert.equal(f.requests.length,before);assert.equal(f.calls.length,0);
});

test('exhausted cumulative output stops before another count or inference',async t=>{
 const f=await fixture(t,{outputs:[[search('x','s1')],[search('y','s2')],[read('r')],[patch()]],hook:({req,result,inf})=>req.url==='/v1/responses'?{...result,usage:{...result.usage,output_tokens:inf<3?2000:96,total_tokens:100+(inf<3?2000:96)}}:result});
 const task=await f.run(),m=task.engineering.managed;assert.equal(task.blockedOn.code,'managed_output_limit');assert.deepEqual([m.inferences,m.counts,m.actualUsage.output,m.patches],[3,3,4096,0]);
});

test('invalid 220-line read is bounded, recorded and corrected within the same attempt',async t=>{
 const bad=call('read_task_file',{file_id:'f1',start_line:1,line_count:220},'bad');
 const f=await fixture(t,{outputs:[[bad],[read('corrected')],[patch()]],hook:({req,body,inf})=>{
  if(req.url==='/v1/responses'&&inf===2){const out=body.input.find(i=>i.type==='function_call_output');assert.equal(JSON.parse(out.output).error,'managed_read_range');assert.ok(Buffer.byteLength(out.output)<256);}
 }}),task=await f.run(),m=task.engineering.managed;
 assert.equal(task.status,'ready',task.blockedOn?.text);assert.deepEqual([m.inferences,m.tools,m.reads,m.patches],[3,3,1,1]);
 const receipt=await f.runtime.store.readJson(path.join(f.runtime.store.taskDir(task.slug),'runs/1/managed/tool-1-receipt.json'));assert.equal(receipt.status,'rejected');assert.equal(receipt.code,'managed_read_range');assert.equal(receipt.sourceDigest,undefined);assert.ok(receipt.bytes<512);
 assert.equal(task.engineering.economics.attempts.length,1);assert.equal(f.calls.length,0);
});

test('invalid read in the last turn denies the whole batch without patch effect or another call',async t=>{
 const bad=call('read_task_file',{file_id:'f2',start_line:1,line_count:220},'bad');
 const f=await fixture(t,{limits:{...MANAGED_LIMITS,inferenceRequests:2,countRequests:2,responsesRequests:4},outputs:[[search()],[bad,patch()]]}),task=await f.run(),m=task.engineering.managed;
 assert.equal(task.status,'needs_you');assert.equal(task.blockedOn.code,'managed_read_range');assert.deepEqual([m.inferences,m.reads,m.patches,m.tools],[2,0,0,3]);assert.equal(f.requests.length,5);
 assert.equal(await fs.readFile(path.join(f.workspace.path,'src/id.mjs'),'utf8'),'export const parseTaskId = () => null;\n');
 const root=f.runtime.store.taskDir(task.slug);for(const [n,code] of [[2,'managed_read_range'],[3,'managed_batch_rejected']])assert.equal((await f.runtime.store.readJson(path.join(root,`runs/1/managed/tool-${n}-receipt.json`))).code,code);
 const before=f.requests.length;await f.run();assert.equal(f.requests.length,before);assert.equal(f.calls.length,0);
});

test('simple one-response patch remains one response under the four-response allowance',async t=>{
 const f=await fixture(t,{outputs:[[patch()]]}),task=await f.run();assert.equal(task.status,'ready');assert.deepEqual([task.engineering.managed.inferences,task.engineering.managed.counts,f.requests.length],[1,1,3]);assert.equal(task.engineering.economics.attempts.length,1);
});

test('existing stricter project request caps remain a pre-credential gate and are never rewritten',async t=>{
 const limits={moneyMicros:24576,tokens:12288,modelCalls:2,providerCalls:5,wallClockMs:120000,implementationAttempts:1,agentRuns:1,reviewCycles:0};
 const f=await fixture(t,{config:{limits}}),file=path.join(f.base,'.work/engineering.json'),before=await fs.readFile(file);let credentials=0;
 const task=await f.run({credential:async()=>{credentials++;return key;}});assert.equal(task.blockedOn.code,'managed_configured_budget');assert.equal(credentials,0);assert.equal(f.requests.length,0);assert.deepEqual(await fs.readFile(file),before);
});


test('four responses cannot dispatch a fifth or start a fresh attempt',async t=>{
 const f=await fixture(t,{outputs:[1,2,3,4].map(n=>[read('r'+n)])}),task=await f.run(),m=task.engineering.managed;
 assert.equal(task.blockedOn.code,'managed_request_limit');assert.deepEqual([m.inferences,m.counts,m.reads,m.patches],[4,4,4,0]);assert.equal(f.requests.length,9);
 const before=f.requests.length;await f.run();assert.equal(f.requests.length,before);assert.equal(task.engineering.economics.attempts.length,1);assert.equal(f.calls.length,0);
});

test('range denials use the result ceiling and never mask an unknown tool',async t=>{
 const bad=call('read_task_file',{file_id:'f1',start_line:1,line_count:220},'bad');
 const f=await fixture(t,{limits:{...MANAGED_LIMITS,toolResultBytes:1},outputs:[[bad],[patch()]]}),task=await f.run();
 assert.equal(task.blockedOn.code,'managed_payload_limit');assert.equal(task.engineering.managed.inferences,1);assert.equal(task.engineering.managed.resultBytes,0);assert.equal(task.engineering.managed.patches,0);
 assert.throws(()=>managedCalls({status:'completed',output:[bad,call('shell',{command:'forbidden'})]},{limits:MANAGED_LIMITS,callIds:[],tools:0,reads:0,patches:0},[{id:'f1'}],{rangeErrors:true}),/managed_unknown_tool_or_item/);
});

test('a targeted read retains search locations it has not covered',async t=>{
 const f=await fixture(t,{outputs:[[search('export','locator')],[call('read_task_file',{file_id:'f1',start_line:2,line_count:1},'targeted')],[patch()]],hook:({req,body,inf})=>{
  if(req.url==='/v1/responses'&&inf===3)assert.ok(body.input.some(i=>i.type==='function_call_output'&&JSON.parse(i.output).matches));
 }}),task=await f.run();assert.equal(task.status,'ready',task.blockedOn?.text);
});

test('stale real-price preflight remains before credential access and all requests',async t=>{
 const f=await fixture(t);f.options.transport.live=true;let credentials=0;
 const registry=MANAGED_MODELS.map(m=>({...m,price:{...m.price,observedAt:new Date(Date.now()-86401000).toISOString()}}));
 const task=await f.run({registry,credential:async()=>{credentials++;return key;}});assert.equal(task.blockedOn.code,'managed_pricing_stale');assert.equal(credentials,0);assert.equal(f.requests.length,0);
});


test('a rejected search sibling remains a denial when a later targeted read succeeds',async t=>{
 const f=await fixture(t,{outputs:[[call('read_task_file',{file_id:'f1',start_line:1,line_count:220},'bad'),search('export','denied-search')],[read('corrected')],[patch()]]}),task=await f.run();
 assert.equal(task.status,'ready',task.blockedOn?.text);assert.deepEqual([task.engineering.managed.tools,task.engineering.managed.searches,task.engineering.managed.reads,task.engineering.managed.patches],[4,0,1,1]);
 const root=f.runtime.store.taskDir(task.slug);assert.equal((await f.runtime.store.readJson(path.join(root,'runs/1/managed/tool-2-receipt.json'))).code,'managed_batch_rejected');
});
