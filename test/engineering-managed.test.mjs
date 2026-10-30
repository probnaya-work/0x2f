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
import {runManagedForeground,managedCheck,managedOutlineResult,managedSearchResult,managedModelContext,managedWireInput} from '../src/core/engineering-managed.mjs';
import {runForegroundEngineering} from '../src/core/engineering-foreground.mjs';
import {credentialFreeEnvironment} from '../src/core/workflow-credentials.mjs';
import {renderTasks} from '../src/render.mjs';
import {MANAGED_LIMITS,MANAGED_SEARCH_BOUNDS,MANAGED_MODELS,managedTransport,managedGuard,managedCost,managedForegroundPricing,managedCalls,managedTools} from '../src/providers/managed-openai.mjs';
import {workflowLines} from '../src/web/workflow.mjs';
import {projectRow} from '../src/web/ledger.mjs';
import {snapshot} from '../src/tui/model.mjs';
import {recoverInterruptedRuns} from '../src/recover.mjs';
const key='sk-fake-managed-qualification-key';
const wireResult=item=>{const n=item.output.indexOf('\n');return n<0?JSON.parse(item.output):{...JSON.parse(item.output.slice(0,n)),content:item.output.slice(n+1)};};
const discoveries=body=>{const {discoveries,excerpts}=JSON.parse(body.input.find(i=>i.content?.startsWith('Completed discovery data')).content.split('\n')[1]);return discoveries.map(([id,args,r])=>[id,args,r.anchors?{...r,anchors:r.anchors.map(([line,n])=>[line,excerpts[n]])}:{...r,matches:r.matches.map(([line,column,n,context])=>[line,column,excerpts[n],context.map(([line,n])=>[line,excerpts[n]])])}]);};
const registry=MANAGED_MODELS;
const call=(name,args,id=name)=>({type:'function_call',call_id:id,name,arguments:JSON.stringify(args)});
const patch=()=>call('submit_patch',{edits:[{file_id:'f1',old_text:'() => null',new_text:'s => /^0*[1-9][0-9]*$/.test(s) ? Number(s) : null'}]});
const read=(id='read')=>call('read_task_file',{file_id:'f1',start_line:1,line_count:32},id);
const search=(query='parseTaskId',id='search',file_id='f1')=>call('search_task_file',{file_id,query,start_line:null},id);
test('wire context preserves every instruction, constraint and source byte without nested source JSON',()=>{
 const packet={brief:'Keep API "014"\nAdd regression',constraints:['No delivery','Keep checks'],files:[{id:'f1',path:'src/x.mjs',bytes:50,writable:true,sha256:'audit-only'}],instructions:[{path:'AGENTS.md',text:'Keep .work atomic\n```\n"quotes"\\slashes\n```'}]};
 const context=managedModelContext(packet);
 assert.ok(context.includes(packet.brief));assert.ok(context.includes(JSON.stringify(packet.constraints)));
 assert.ok(context.includes(packet.instructions[0].text));assert.ok(context.includes('src/x.mjs'));assert.ok(!context.includes('audit-only'));
 const content='const a = "\\\\";\n🚀\r\n{"error":"not metadata"}\n';
 const result={type:'function_call_output',call_id:'x',output:JSON.stringify({file_id:'f1',start_line:2,line_count:4,content,truncated:false})};
 const sourceCall={...call('read_task_file',{file_id:'f1',start_line:2,line_count:4},'x'),id:'provider-item-audit-id',status:'completed'};
 const denial={type:'function_call_output',call_id:'denied',output:'{"error":"managed_read_range"}'};
 const original=structuredClone([sourceCall,result,denial]),wire=managedWireInput(original);
 assert.deepEqual(original,[sourceCall,result,denial]);assert.deepEqual(wireResult(wire[1]),JSON.parse(result.output));
 assert.equal(wireResult(wire[1]).content,content);assert.deepEqual(wire[0],call('read_task_file',{file_id:'f1',start_line:2,line_count:4},'x'));assert.deepEqual(wire[2],denial);
 assert.ok(Buffer.byteLength(JSON.stringify(wire))<Buffer.byteLength(JSON.stringify(original)));
});
test('working discovery projection is reversible; pending, denied, assistant, instructions and exact reads stay intact',()=>{
 const result=managedSearchResult('f1','before\nquoted "🚀" needle\nafter','needle','s'),outline=managedOutlineResult('f1',Array.from({length:30},(_,n)=>'const x'+n+'="🚀";').join('\n'),1,'o');
 const pairs=[search('needle','s'),result,call('search_task_file',{file_id:'f1',query:null,start_line:1},'o'),outline,search('absent','miss'),managedSearchResult('f1','text','absent','miss')];
 const protectedItems=[{role:'user',content:'Intent\nConstraints\nAGENTS: authoritative'}, {role:'assistant',content:'Interpretation of previous result'},search('pending','pending'),call('read_task_file',{file_id:'f1',start_line:1,line_count:2},'r'),{type:'function_call_output',call_id:'r',output:JSON.stringify({file_id:'f1',content:'exact "🚀"\nsource',truncated:false})},search('denied','d'),{type:'function_call_output',call_id:'d',output:'{"error":"managed_batch_rejected"}'}];
 const history=[...protectedItems,...pairs],copy=structuredClone(history),wire=managedWireInput(history),records=discoveries({input:wire});
 assert.deepEqual(history,copy);assert.deepEqual(wire.slice(0,-1),managedWireInput(protectedItems));assert.equal(records.length,3);
 for(const [id,args,data] of records){const raw=JSON.parse(pairs.find(i=>i.type==='function_call_output'&&i.call_id===id).output);assert.deepEqual(args,JSON.parse(pairs.find(i=>i.type==='function_call'&&i.call_id===id).arguments));
  const restored=data.anchors?{file_id:args.file_id,anchors:data.anchors.map(([line,excerpt])=>({line,excerpt})),truncated:data.truncated,next_line:data.next_line}:{file_id:args.file_id,matches:data.matches.map(([line,column,excerpt,context])=>({line,column,excerpt,context:context.map(([line,excerpt])=>({line,excerpt}))})),truncated:data.truncated};assert.deepEqual(restored,raw);
 }
 assert.deepEqual(records.find(r=>r[0]==='miss')[2].matches,[]);assert.ok(Buffer.byteLength(JSON.stringify(wire))<Buffer.byteLength(JSON.stringify(history)));
});
async function fixture(t,{outputs=[[read()],[patch()]],count=100,hook,config={},transportFailure,limits=MANAGED_LIMITS,setup}={}){
 const f=await playbookFixture(t,{setup,config:{limits:{moneyMicros:30720,tokens:20480,modelCalls:6,providerCalls:13,wallClockMs:30000,implementationAttempts:1,agentRuns:1},...config}});
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
  assert.equal(task.status,'needs_you');assert.equal(task.blockedOn.code,limits.toolResultBytes===1?'managed_payload_limit':'managed_patch_slot_reserved');
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
  if(req.url==='/v1/responses'&&inf===2){assert.equal(discoveries(body)[0][2].matches[0][0],targetLine);}
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
 assert.equal(predicted.inferenceUpperUsd,0.030720);assert.equal(predicted.totalUpperUsd,null);
 assert.deepEqual([MANAGED_LIMITS.requestInputBytes,MANAGED_LIMITS.serializedInputBytes,MANAGED_LIMITS.inferenceRequests,MANAGED_LIMITS.countRequests,MANAGED_LIMITS.responsesRequests,MANAGED_LIMITS.tools,MANAGED_LIMITS.reads,MANAGED_LIMITS.patches],[16384,196608,6,6,12,10,4,1]);
 assert.deepEqual(predicted.controlRequests,{classification:'unpriced_control_request',maximum:7,tokenCountMaximum:6,availabilityMaximum:1,separatePublishedFee:false,contractualZeroFee:false,includedInInferenceMaximum:false});
 assert.throws(()=>managedForegroundPricing(predicted,{mode:'foreground'}),/managed_foreground_canary_required/);
 assert.throws(()=>managedForegroundPricing(predicted,{mode:'unattended',foregroundCanary:true}),/managed_unattended_unqualified/);
 assert.throws(()=>managedForegroundPricing(predicted,{mode:'unattended',foregroundAuthorized:true}),/managed_unattended_unqualified/);
 assert.equal(managedForegroundPricing(predicted,{mode:'foreground',foregroundAuthorized:true}).publishedBillableInferenceMaximumUsd,0.030720);
 assert.throws(()=>managedForegroundPricing({...predicted,inferenceUpperUsd:0.030721},{mode:'foreground',foregroundCanary:true}),/managed_cost_limit/);
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
 const preview=f.previews[0];assert.equal(preview.pricingPolicy.publishedBillableInferenceMaximumUsd,0.030720);
 assert.equal(preview.pricingPolicy.controlRequests.maximum,7);assert.equal(preview.model,MANAGED_MODELS[0].id);
 assert.equal(preview.pricingSource,MANAGED_MODELS[0].price.source);assert.ok(preview.pricingObservedAt);assert.match(preview.notice,/no separate published fee/);
 const saved=await f.runtime.store.readJson(path.join(f.runtime.store.taskDir(task.slug),'runs/1/managed/foreground-preview.json'));assert.deepEqual(saved,preview);
 assert.equal(f.requests.filter(r=>r.url.startsWith('/v1/models/')).length,1);assert.equal(f.requests.filter(r=>r.url.endsWith('/input_tokens')).length,2);assert.equal(f.requests.length,5);
 for(let i=1;i<=5;i++){
  const receipt=await f.runtime.store.readJson(path.join(f.runtime.store.taskDir(task.slug),`runs/1/managed/request-${i}-receipt.json`));
  assert.equal(receipt.requestType,receipt.kind==='inference'?'published_billable_inference':'unpriced_control_request');
 }
 const lines=workflowLines(task);assert.ok(lines.includes('PUBLISHED BILLABLE INFERENCE MAXIMUM: $0.030720'));
 assert.ok(lines.some(l=>l.startsWith('CONTROL REQUESTS: 7 maximum, no separate published fee')));
 assert.ok(lines.some(l=>l.startsWith('COST TOTAL UNKNOWN')));assert.ok(!lines.some(l=>l.includes('TOTAL COST 0.030720')));
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
 const f=await fixture(t,{outputs:[[read()],[call('request_context_expansion',{reason:'Truncated source'})]]});await fs.writeFile(path.join(f.workspace.path,'src/id.mjs'),'x'.repeat(50000));const task=await f.run();assert.equal(task.blockedOn.code,'context_expansion_required');const next=f.requests.filter(r=>r.url==='/v1/responses')[1].body;const out=next.input.find(i=>i.type==='function_call_output');assert.equal(wireResult(out).content.length,4096);assert.ok(Buffer.byteLength(JSON.stringify(out))<24576);assert.ok(!JSON.stringify(next).includes('x'.repeat(10000)));
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
  assert.equal(task.engineering.managed.actualUsage,null);assert.equal(task.engineering.economics.aggregate.metrics.total.value,null);assert.equal(task.engineering.managed.inputReserved,100);assert.equal(task.engineering.managed.outputReserved,2048);
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

test('Task 006-shaped retained discovery → targeted read → two-file patch → verifier → READY',async t=>{
 const sourcePath='src/cli.mjs',testPath='test/engineering-foreground-cli.test.mjs';
 const original='console.log(`Created #${String(task.id).padStart(3, "0")}: ${task.title}`);',replacement=original+'\nconsole.log(`Next: 2f-next open ${task.id}`);';
 const assertion="assert.match(output, new RegExp('Created #' + String(id).padStart(3,'0')));",regression=assertion+"\nassert.ok(output.includes('Next: 2f-next open '+id));";
 const source=Array.from({length:430},()=> '// '+'.'.repeat(55));
 for(let n=0;n<24;n++)source[n]='const a'+n+'="open '+'.'.repeat(95)+'";';
 source[40]='const runtime={actions:{createWork:async({id})=>({id,title:"Fixture"})}};';
 source[395]='const task = await runtime.actions.createWork({id:Number(process.argv[2])});';source[396]='';source[397]=original;
 const check=Array.from({length:38},()=> '// '+'.'.repeat(65));
 check[0]="import assert from 'node:assert/strict';";check[1]="import {execFileSync} from 'node:child_process';";
 for(let n=2;n<16;n++)check[n]='const c'+n+'="'+'.'.repeat(65)+'";';
 check[16]='for(const id of [7,14]) {';
 check[17]="const output=execFileSync(process.execPath,[new URL('../src/cli.mjs',import.meta.url).pathname,String(id)],{encoding:'utf8',env:{PATH:'/usr/bin:/bin'}});";
 check[18]=assertion;check[19]='}';
 const pad=(lines,size)=>{const text=lines.join('\n')+'\n';return text+'//'+'.'.repeat(size-Buffer.byteLength(text)-3)+'\n';};
 const outputs=[
  ['f1','f2'].map((file_id,i)=>call('search_task_file',{file_id,query:null,start_line:1},'outline-'+i)),
  [call('read_task_file',{file_id:'f1',start_line:100,line_count:32},'wrong-area'),call('read_task_file',{file_id:'f2',start_line:16,line_count:24},'test-read')],
  [search('createWork({','locator'),search('open','broad'),search('task.id','id')],
  [call('read_task_file',{file_id:'f1',start_line:396,line_count:4},'source-read')],
  [call('submit_patch',{edits:[{file_id:'f1',old_text:original,new_text:replacement},{file_id:'f2',old_text:assertion,new_text:regression}]})]
 ];
 const f=await fixture(t,{count:1031,outputs,config:{files:[sourcePath,testPath],writePaths:[sourcePath,testPath],check:[process.execPath,'--test',testPath]},setup:async({base})=>{
  await fs.writeFile(path.join(base,sourcePath),pad(source,31003));await fs.writeFile(path.join(base,testPath),pad(check,4000));
 },hook:({req,body,inf})=>{
  if(req.url!=='/v1/responses')return;
  if(inf>=4){const records=discoveries(body);assert.equal(records.length,5);assert.equal(records.find(r=>r[0]==='locator')[2].matches[0][0],396);assert.ok(body.input.some(i=>i.type==='function_call_output'&&wireResult(i).content?.includes(assertion)));}
  if(inf===5)assert.ok(body.input.some(i=>i.type==='function_call_output'&&wireResult(i).content?.includes(original)));
 }});
 await fs.writeFile(path.join(f.workspace.path,'AGENTS.md'),'# Fixture constraints\n'+'.'.repeat(2100));
 await f.runtime.store.updateTask({...await f.runtime.store.findTask(f.task.id),brief:'After creating a Task, print its actual ID and the exact command to open it, with a meaningful regression test.'});
 const task=await f.run(),m=task.engineering.managed;assert.equal(task.status,'ready',JSON.stringify({blocked:task.blockedOn,inputBytes:m.inputBytes}));
 assert.deepEqual([m.inferences,m.counts,m.modelQueries,m.searches,m.reads,m.patches,m.tools],[5,5,1,5,3,1,9]);
 assert.deepEqual(m.limits,MANAGED_LIMITS);assert.ok(m.actualUsage.total<=20480);assert.equal(m.predicted.inferenceUpperUsd,.030720);assert.equal(m.providerReportedCost,'unknown');
 const requests=f.requests.filter(r=>r.url.includes('/responses')),sizes=requests.map(r=>Buffer.byteLength(JSON.stringify(r.body)));
 assert.ok(sizes.every(n=>n<=16384));assert.equal(m.inputBytes,sizes.reduce((a,b)=>a+b,0));assert.ok(m.inputBytes<=196608);assert.ok(m.resultBytes<=24576);
 const root=f.runtime.store.taskDir(task.slug),receipts=[];for(let i=1;i<=9;i++)receipts.push(await f.runtime.store.readJson(path.join(root,`runs/1/managed/tool-${i}-receipt.json`)));
 assert.equal(receipts.slice(0,-1).reduce((n,r)=>n+r.bytes,0),m.resultBytes);assert.equal(JSON.parse(receipts[0].result.output).anchors[0].line,1);
 assert.equal(task.engineering.economics.attempts.length,1);assert.equal(task.engineering.verification.code,0);assert.equal(task.engineering.delivery,undefined);assert.equal(f.calls.length,0);
 assert.deepEqual((await f.runtime.actions.getTaskDiff(task.id)).map(d=>d.path).sort(),[sourcePath,testPath]);
 assert.deepEqual(projectRow(task,await f.runtime.store.readEvents(task.slug)).workflowLines,workflowLines(task));assert.deepEqual((await snapshot(f.runtime)).tasks[0].workflowLines,workflowLines(task));
 const before=f.requests.length;await f.run();assert.equal(f.requests.length,before);
 if(process.env.OX2F_MANAGED_EVIDENCE_DIR){const dir=process.env.OX2F_MANAGED_EVIDENCE_DIR;assert.match(dir,/^\/private\/tmp\/0x2f-managed-[a-z0-9-]+$/);await fs.mkdir(dir,{recursive:true});const journal={};for(const name of await fs.readdir(path.join(root,'runs/1/managed')))if(name.endsWith('.json'))journal[name]=await f.runtime.store.readJson(path.join(root,'runs/1/managed',name));await fs.writeFile(path.join(dir,'retention-flow.json'),JSON.stringify(managedGuard(key)({kind:'scripted offline; not model reliability',task,receipts,journal,sizes,verification:task.engineering.verification}),null,2)+'\n');}
});

test('Task 003 exact guessed-search batches still stop before an oversized second batch',async t=>{
 const outputs=[['After creating a Task','open it','Created Task'].map((q,i)=>search(q,'guess-'+i)).concat(search('Task','guess-3','f2')),['task id','task.json','print'].map((q,i)=>search(q,'guess-'+(i+4))).concat(search('open','guess-7','f2'))];
 const f=await fixture(t,{limits:{...MANAGED_LIMITS,tools:6,inferenceRequests:4,countRequests:4,responsesRequests:8},outputs,setup:({base})=>fs.writeFile(path.join(base,'test/id.test.mjs'),'// fixture test\n'),hook:({req,body,inf})=>{if(req.url==='/v1/responses'&&inf===2)assert.ok(body.instructions.endsWith('Left: 3 turns, 2 tools, 4 reads, 1 patch.'));}});
 const task=await f.run(),m=task.engineering.managed;
 assert.equal(task.status,'needs_you');assert.equal(task.blockedOn.code,'managed_tool_limit');
 assert.deepEqual([m.inferences,m.searches,m.reads,m.patches,m.tools],[2,4,0,0,4]);
 assert.equal(f.requests.length,5);assert.equal(task.engineering.delivery,undefined);assert.equal(task.engineering.verification,null);assert.equal(f.calls.length,0);
 const root=f.runtime.store.taskDir(task.slug);for(let i=1;i<=4;i++)assert.deepEqual(JSON.parse((await f.runtime.store.readJson(path.join(root,`runs/1/managed/tool-${i}-receipt.json`))).result.output).matches,[]);
 assert.equal(await f.runtime.store.exists(path.join(root,'runs/1/managed/tool-5-receipt.json')),false);
 const requests=f.requests.length;await f.run();assert.equal(f.requests.length,requests);
});

test('six requests share 16384 input + 4096 output tokens, reservations and $0.030720 maximum',async t=>{
 const outputs=Array.from({length:5},(_,i)=>[search('x','s'+i)]).concat([[patch()]]);
 const f=await fixture(t,{count:n=>n===6?2734:2730,outputs,hook:({req,result,inf})=>req.url==='/v1/responses'?{...result,usage:{...result.usage,output_tokens:inf===6?596:700,total_tokens:result.usage.input_tokens+(inf===6?596:700)}}:result});
 const task=await f.run(),m=task.engineering.managed;assert.equal(task.status,'ready',task.blockedOn?.text);
 assert.deepEqual([m.inferences,m.counts,m.modelQueries,m.requests,f.requests.length],[6,6,1,12,13]);
 assert.deepEqual(m.actualUsage,{input:16384,cachedInput:60,output:4096,total:20480});assert.equal(m.outputReserved,4096);assert.equal(m.inputReserved,16384);
 assert.deepEqual(f.requests.filter(r=>r.url==='/v1/responses').map(r=>r.body.max_output_tokens),[2048,2048,2048,1996,1296,596]);
 const root=f.runtime.store.taskDir(task.slug);
 for(const n of [1,3,5,7,9,11,13]){const r=await f.runtime.store.readJson(path.join(root,`runs/1/managed/request-${n}-intent.json`));assert.ok(r.remaining.publishedInferenceUsd>=0&&r.remaining.publishedInferenceUsd<=0.030720);}
 assert.equal((await f.runtime.store.readJson(path.join(root,'runs/1/managed/request-13-intent.json'))).remaining.publishedInferenceUsd,0);
 assert.equal(m.predicted.inferenceUpperUsd,0.030720);assert.ok(m.calculatedInferenceCostUsd<=0.030720);assert.equal(m.pricingPolicy.controlRequests.maximum,7);assert.equal(m.providerReportedCost,'unknown');
 assert.equal(task.engineering.economics.attempts.length,1);assert.equal(f.calls.length,0);assert.ok(workflowLines(task).some(l=>l.includes('13 HTTP')));
});

test('next cumulative input reservation over 16384 stops before inference dispatch',async t=>{
 const f=await fixture(t,{count:3000,outputs:Array.from({length:5},(_,i)=>[search('x','s'+i)]).concat([[patch()]])}),task=await f.run(),m=task.engineering.managed;
 assert.equal(task.blockedOn.code,'managed_token_limit');assert.deepEqual([m.inferences,m.counts,m.patches],[5,6,0]);assert.equal(m.actualUsage.input,15000);
 assert.equal(f.requests.length,12);const before=f.requests.length;await f.run();assert.equal(f.requests.length,before);assert.equal(f.calls.length,0);
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

test('simple one-response patch remains one response under the six-response allowance',async t=>{
 const f=await fixture(t,{outputs:[[patch()]]});
 // Request cardinality must not depend on wall time lost to other test files
 // or host suspension. The deadline boundary is exercised separately below;
 // the same real patch, persistence and credential-free verifier still run.
 t.mock.timers.enable({apis:['Date','setTimeout'],now:Date.now()});
 try{
  const task=await f.run(),m=task.engineering.managed;
  const diagnostic={status:task.status,blockedOn:task.blockedOn??null,managedState:m.state,limits:m.limits,projectDeadlineMs:f.task.engineering.config.limits.wallClockMs,inferences:m.inferences,counts:m.counts,requests:f.requests.length,patches:m.patches,attempts:task.engineering.economics.attempts.length,verification:task.engineering.verification};
  if(process.env.OX2F_MANAGED_EVIDENCE_DIR){const dir=process.env.OX2F_MANAGED_EVIDENCE_DIR;assert.match(dir,/^\/private\/tmp\/0x2f-managed-[a-z0-9-]+$/);await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'one-response.json'),JSON.stringify(diagnostic,null,2)+'\n');}
  assert.equal(task.status,'ready',JSON.stringify(diagnostic));assert.deepEqual([m.inferences,m.counts,f.requests.length],[1,1,3]);assert.equal(task.engineering.economics.attempts.length,1);assert.equal(task.engineering.verification.code,0);assert.equal(task.engineering.verification.groupClosed,true);
 }finally{t.mock.timers.reset();}
});

test('one-response patch at the unchanged deadline records managed_deadline without replay or READY',async t=>{
 const f=await fixture(t,{outputs:[[patch()]]});
 t.mock.timers.enable({apis:['Date','setTimeout'],now:Date.now()});
 try{
  let deadline;
  const task=await f.run({checkRunner:async({timeout,signal})=>{
   assert.ok(timeout>0&&timeout<=5000);assert.equal(signal.aborted,false);
   deadline=f.task.engineering.config.limits.wallClockMs;assert.equal(deadline,30000);
   t.mock.timers.tick(deadline);assert.equal(signal.aborted,true);
   return {code:0,error:null,output:'late verifier success\n',groupClosed:true};
  }}),m=task.engineering.managed;
  const diagnostic={status:task.status,blockedOn:task.blockedOn,managedState:m.state,limits:m.limits,advancedMs:deadline,projectDeadlineMs:f.task.engineering.config.limits.wallClockMs,inferences:m.inferences,counts:m.counts,requests:f.requests.length,patches:m.patches,attempts:task.engineering.economics.attempts.length,verification:task.engineering.verification};
  if(process.env.OX2F_MANAGED_EVIDENCE_DIR){const dir=process.env.OX2F_MANAGED_EVIDENCE_DIR;assert.match(dir,/^\/private\/tmp\/0x2f-managed-[a-z0-9-]+$/);await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'one-response-deadline.json'),JSON.stringify(diagnostic,null,2)+'\n');}
  assert.equal(task.status,'needs_you',JSON.stringify(diagnostic));assert.equal(task.blockedOn.code,'managed_deadline');assert.equal(m.state,'NEEDS YOU');
  assert.deepEqual([m.inferences,m.counts,f.requests.length,m.patches],[1,1,3,1]);assert.equal(task.engineering.economics.attempts.length,1);assert.equal(task.engineering.verification,null);assert.equal(task.engineering.delivery,undefined);assert.equal(f.calls.length,0);
  const root=f.runtime.store.taskDir(task.slug);assert.equal(await f.runtime.store.exists(path.join(root,'runs/2/verification.json')),false);
  const requests=f.requests.length;await f.run();assert.equal(f.requests.length,requests);
 }finally{t.mock.timers.reset();}
});

test('existing stricter project request caps remain a pre-credential gate and are never rewritten',async t=>{
 const limits={moneyMicros:24576,tokens:12288,modelCalls:2,providerCalls:5,wallClockMs:120000,implementationAttempts:1,agentRuns:1,reviewCycles:0};
 const f=await fixture(t,{config:{limits}}),file=path.join(f.base,'.work/engineering.json'),before=await fs.readFile(file);let credentials=0;
 const task=await f.run({credential:async()=>{credentials++;return key;}});assert.equal(task.blockedOn.code,'managed_configured_budget');assert.equal(credentials,0);assert.equal(f.requests.length,0);assert.deepEqual(await fs.readFile(file),before);
});


test('six responses cannot dispatch a seventh or start a fresh attempt',async t=>{
 const f=await fixture(t,{outputs:[1,2,3,4,5,6].map(n=>[search('absent','s'+n)])}),task=await f.run(),m=task.engineering.managed;
 assert.equal(task.blockedOn.code,'managed_request_limit');assert.deepEqual([m.inferences,m.counts,m.searches,m.patches],[6,6,6,0]);assert.equal(f.requests.length,13);
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
  if(req.url==='/v1/responses'&&inf===3)assert.ok(discoveries(body).some(r=>r[2].matches));
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

for(const [name,limits,code] of [
 ['per-body',{requestInputBytes:1},'managed_input_limit'],
 ['cumulative',{serializedInputBytes:1},'managed_input_limit']
])test(`${name} byte guard rejects both exact bodies before the count dispatch`,async t=>{
 const f=await fixture(t,{limits:{...MANAGED_LIMITS,...limits}}),task=await f.run();
 assert.equal(task.blockedOn.code,code);assert.deepEqual([task.engineering.managed.counts,task.engineering.managed.inferences],[0,0]);assert.equal(f.requests.length,1);
 assert.equal(task.engineering.managed.inputBytes,0);await f.run();assert.equal(f.requests.length,1);
});


test('outline is query-free, byte bounded and paginates declarations/branches monotonically',()=>{
 const text=Array.from({length:70},(_,i)=>i%2?`if (x === ${i}) { // ${'"\\🚀'.repeat(100)}`:`export const symbol${i} = 0;`).join('\r\n');
 let start=1,seen=[];
 do {
  const result=managedOutlineResult('f1',text,start,'o'),out=JSON.parse(result.output);
  assert.ok(Buffer.byteLength(JSON.stringify(result))<=2048);assert.ok(out.anchors.length<=24);
  for(const a of out.anchors){assert.ok(a.line>=start);assert.ok(Buffer.byteLength(a.excerpt)<=160);seen.push(a.line);}
  assert.equal(out.truncated,out.next_line!==null);
  if(out.next_line!==null)assert.ok(out.next_line>start);
  start=out.next_line;
 }while(start!==null);
 assert.deepEqual(seen,Array.from({length:70},(_,i)=>i+1));
 const out=JSON.parse(managedOutlineResult('f1',Array.from({length:40},()=> 'const a=1;').join('\n'),1,'o').output);
 assert.equal(out.anchors.length,24);assert.equal(out.next_line,25);
 assert.deepEqual(JSON.parse(managedOutlineResult('f1','// none',1,'o').output).anchors,[]);
});

test('outline schema/runtime, manifest scope and reserved patch slot agree before effects',()=>{
 const parameters=managedTools.find(t=>t.name==='search_task_file').parameters;
 assert.deepEqual(parameters.required.sort(),Object.keys(parameters.properties).sort());
 assert.deepEqual(parameters.properties.query.type,['string','null']);assert.equal(parameters.properties.start_line.minimum,1);
 const state={limits:MANAGED_LIMITS,callIds:[],tools:0,reads:0,patches:0},manifest=[{id:'f1',writable:true}];
 const validate=(args,s=state)=>managedCalls({status:'completed',output:[call('search_task_file',args)]},s,manifest);
 for(const start_line of [0,1,Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER+1,null,1.5]){
  const run=()=>validate({file_id:'f1',query:null,start_line});
  if(Number.isSafeInteger(start_line)&&start_line>=1)assert.equal(run().length,1);else assert.throws(run,/managed_search_query/);
 }
 assert.throws(()=>validate({file_id:'f1',query:'x',start_line:1}),/managed_search_query/);
 for(const file_id of ['f99','../outside','.work/task.json'])assert.throws(()=>validate({file_id,query:null,start_line:1}),/managed_file_id/);
 assert.throws(()=>validate({file_id:'f1',query:null,start_line:1},{...state,tools:9}),/managed_patch_slot_reserved/);
 assert.equal(managedCalls({status:'completed',output:[patch()]},{...state,tools:9},manifest).length,1);
 const bad=call('read_task_file',{file_id:'f1',start_line:1,line_count:220});
 assert.throws(()=>managedCalls({status:'completed',output:[bad,patch()]},{...state,tools:8},manifest,{rangeErrors:true}),/managed_patch_slot_reserved/);
});

for(const change of ['symlink','identity','bytes'])test(`outline shares the ${change} source fence`,async t=>{
 const f=await fixture(t,{outputs:[[call('search_task_file',{file_id:'f1',query:null,start_line:1})]],hook:async({req,workspace})=>{
  if(req.url!=='/v1/responses')return;
  const p=path.join(workspace.path,'src/id.mjs');
  if(change==='bytes')await fs.writeFile(p,'changed');else{const q=p+'.replacement';await fs.writeFile(q,await fs.readFile(p));if(change==='identity')await fs.rename(q,p);else{await fs.unlink(p);await fs.symlink(q,p);}}
 }}),task=await f.run();assert.equal(task.status,'needs_you');assert.equal(task.engineering.managed.inferences,1);assert.equal(task.engineering.managed.patches,0);assert.equal(task.engineering.managed.resultBytes,0);assert.equal(f.requests.length,3);
});

test('outline bytes use existing ledger and result ceiling; background never retrieves a key',async t=>{
 const outputs=[[call('search_task_file',{file_id:'f1',query:null,start_line:1})],[patch()]];
 for(const background of [false,true]){
  const f=await fixture(t,{outputs,limits:{...MANAGED_LIMITS,toolResultBytes:1}});let keys=0;
  const task=await f.run({foregroundCanary:!background,credential:async()=>{keys++;return key;}});
  assert.equal(task.status,'needs_you');assert.equal(task.engineering.managed.patches,0);
  assert.equal(keys,background?0:1);assert.equal(f.requests.length,background?0:3);
  if(!background){assert.equal(task.blockedOn.code,'managed_payload_limit');assert.equal(task.engineering.managed.searches,1);}
 }
});

test('retained necessary source can still overflow: stop before the next count, no clipping',async t=>{
 const f=await fixture(t,{outputs:[[read('r1'),read('r2')],[read('r3'),read('r4')],[patch()]],setup:({base})=>fs.writeFile(path.join(base,'src/id.mjs'),'// '+ 'x'.repeat(50000))}),task=await f.run(),m=task.engineering.managed;
 assert.equal(task.blockedOn.code,'managed_input_limit');assert.deepEqual([m.inferences,m.counts,m.tools,m.reads,m.patches],[2,2,4,4,0]);assert.equal(f.requests.length,5);assert.ok(m.resultBytes>16384&&m.resultBytes<24576);
 const root=f.runtime.store.taskDir(task.slug);assert.equal(await f.runtime.store.exists(path.join(root,'runs/1/managed/request-6-intent.json')),false);assert.equal(task.engineering.verification,null);assert.equal(task.engineering.economics.attempts.length,1);assert.equal(f.calls.length,0);
});

test('both exact request bodies are charged, including at the pre-count boundary',async t=>{
 const probe=await fixture(t,{outputs:[[patch()]]}),ready=await probe.run();assert.equal(ready.status,'ready');
 const bodies=probe.requests.filter(r=>r.url!=='/v1/models/'+registry[0].id).map(r=>Buffer.byteLength(JSON.stringify(r.body)));
 assert.equal(bodies.length,2);assert.equal(ready.engineering.managed.inputBytes,bodies[0]+bodies[1]);assert.ok(bodies[1]>bodies[0]);
 for(const kind of ['requestInputBytes','serializedInputBytes'])for(const delta of [-1,0]){
  const maximum=kind==='requestInputBytes'?Math.max(...bodies):bodies[0]+bodies[1];
  const f=await fixture(t,{outputs:[[patch()]],limits:{...MANAGED_LIMITS,[kind]:maximum+delta}}),task=await f.run();
  assert.equal(task.status,delta<0?'needs_you':'ready',task.blockedOn?.text);assert.equal(f.requests.length,delta<0?1:3);
  assert.equal(task.engineering.managed.inputBytes,delta<0?0:bodies[0]+bodies[1]);
 }
});
