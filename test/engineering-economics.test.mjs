import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {normalizeTokenEvents,aggregateAttempts,economicsPolicy,economicDispatchBlock,saveEngineeringUsage} from '../src/core/engineering-economics.mjs';
import {parseCodexSessionUsage} from '../src/providers/codex-usage.mjs';
import {createHandoff,verifyHandoff,handoffHash as hash} from '../src/core/engineering-handoff.mjs';
import {runEngineeringTask,freezeEngineering,engineeringInventory,engineeringSettleUsage} from '../src/core/engineering.mjs';
import {prepareCapacityContinuation} from '../src/core/engineering-playbook.mjs';
import {playbookFixture,zeroUsage} from './engineering-playbook-fixture.mjs';
import {workflowLines} from '../src/web/workflow.mjs';
import {projectRow} from '../src/web/ledger.mjs';
import {snapshot} from '../src/tui/model.mjs';
const usage=(total,input=total)=>({input_tokens:input,output_tokens:total-input,total_tokens:total});
const record=(events,extra={})=>({boundary:Math.random().toString(),tokens:normalizeTokenEvents(events),money:{value:null,currency:'unknown'},complete:true,...extra});
async function economicFixture(t,options={}) {
 const f=await playbookFixture(t,options);const task=await f.runtime.store.findTask(f.task.id);
 task.engineering.economics={policy:economicsPolicy(task),attempts:[]};await f.runtime.store.updateTask(task);f.task=task;return f;
}
const qualified=p=>({trustClass:'foreground-subscription',maximum:zeroUsage,evidence:{version:'offline fixture',costTier:{tier:p.id==='primary'?'high-risk':'small',model:p.id+'-model',source:'deterministic fixture qualification'}},execute:input=>p.start(input)});

test('cumulative counters and overlapping cached/reasoning categories never double count',()=>{
 const e=[{usage:{...usage(10,8),cached_input_tokens:6,reasoning_output_tokens:1}},{usage:{...usage(30,25),cached_input_tokens:20,reasoning_output_tokens:2}},{usage:{...usage(30,25),cached_input_tokens:20,reasoning_output_tokens:2}}];
 const n=normalizeTokenEvents(e);assert.equal(n.values.total,30);assert.equal(n.acceptedEvents,2);assert.equal(n.values.cachedInput,20);assert.equal(n.values.reasoning,2);
 const a=aggregateAttempts([record(e)]);assert.equal(a.metrics.total.value,30);assert.equal(a.metrics.input.value,25);
 assert.equal(normalizeTokenEvents([{usage:usage(20)},{usage:usage(5)}]).compatible,false);
});
test('delta counters require unique identity; unknown categories and money remain unknown',()=>{
 const n=normalizeTokenEvents([{id:'a',usage:usage(10)},{id:'a',usage:usage(10)},{id:'b',usage:usage(3)}],'delta');assert.equal(n.values.total,13);assert.equal(n.values.cachedInput,null);
 assert.equal(normalizeTokenEvents([{usage:usage(10)}],'unknown').values.total,null);
 assert.equal(normalizeTokenEvents([{usage:usage(10)}],'delta').compatible,false);
 const a=aggregateAttempts([record([{usage:usage(10)}])]);assert.equal(a.metrics.reasoning.value,null);assert.equal(a.money.value,null);assert.equal(a.money.currency,'unknown');
});
test('failed and successful attempts stay separate; partial totals are not final billing',()=>{
 const failed=record([{usage:usage(10)}],{complete:false}),success=record([{usage:usage(30)}]);const a=aggregateAttempts([failed,success]);assert.equal(a.attempts,2);assert.equal(a.metrics.total.value,40);assert.equal(a.partial,true);assert.equal(a.money.value,null);
 const missing=aggregateAttempts([record([],{complete:false}),success]);assert.equal(missing.metrics.total.value,null);assert.equal(missing.metrics.total.observed,30);assert.equal(missing.metrics.total.unknownAttempts,1);
});
test('resumed session cumulative counter is aggregated once across attempts',()=>{
 const a=record([{usage:usage(10)}],{counterScope:'session',counterId:'same'}),b=record([{usage:usage(25)}],{counterScope:'session',counterId:'same'});
 assert.equal(aggregateAttempts([a,b]).metrics.total.value,25);
 assert.equal(aggregateAttempts([a,{...b,counterId:'different'}]).metrics.total.value,35);
});
test('Codex local telemetry identity, model, partial failure and source lines are explicit',()=>{
 const sessionId='00000000-0000-0000-0000-000000000001';const text=[{type:'session_meta',payload:{id:sessionId,cwd:'/fixture'}},{type:'turn_context',payload:{model:'observed-fixture-model'}},...Array.from({length:3},()=>({type:'event_msg',payload:{type:'token_count',info:{total_token_usage:usage(11)}}}))].map(JSON.stringify).join('\n');
 const d=parseCodexSessionUsage(text,{sessionId,cwd:'/fixture',complete:false});assert.equal(d.model,'observed-fixture-model');assert.equal(d.complete,false);assert.deepEqual(d.sources[0].lines,[3,4,5]);assert.equal(normalizeTokenEvents(d.events,d.semantics).values.total,11);
 assert.equal(parseCodexSessionUsage(text,{sessionId,cwd:'/wrong'}),null);
});
test('settling the same attempt boundary twice is idempotent',()=>{
 const budget={confirmed:zeroUsage,reservations:[],uncertain:[]},u={moneyMicros:0,tokens:10,modelCalls:1,providerCalls:1};const first=engineeringSettleUsage(budget,'a',u,u,true),second=engineeringSettleUsage(first.budget,'a',u,u,true);assert.deepEqual(second.budget,first.budget);assert.equal(second.budget.confirmed.tokens,10);
});
test('observable scope distinguishes small, standard, sensitive and cross-cutting',()=>{
 const task={brief:'Fix parser',engineering:{config:{files:['a'],writePaths:['a'],limits:{wallClockMs:600000}}}};
 assert.equal(economicsPolicy(task).classification,'small');
 task.engineering.config.files=['a','b','c','d','e'];assert.equal(economicsPolicy(task).classification,'standard');
 task.engineering.config.writePaths=['src/auth.mjs'];assert.equal(economicsPolicy(task).classification,'high-risk');
 task.engineering.config.writePaths=['src/a/x','src/b/y','src/c/z'];assert.equal(economicsPolicy(task).classification,'high-risk');
});
test('small task routes to least sufficient observed tier, saves immutable ledger and narrow context',async t=>{
 const f=await economicFixture(t);const task=await runEngineeringTask({...f.args,trustClass:'foreground-subscription',qualify:qualified});assert.equal(task.status,'ready',task.blockedOn?.text);
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].id,'secondary');assert.equal(f.calls[0].purpose,'implement');
 assert.equal(task.engineering.decisions[0].economics.tier,'small');assert.equal(task.engineering.decisions[0].economics.classification,'small');
 const ref=task.runs[0].usageLedger,root=f.runtime.store.taskDir(task.slug),entry=await f.runtime.store.readJson(path.join(root,ref.path)),before=await fs.readFile(path.join(root,ref.path));assert.equal(hash(entry),ref.digest);assert.equal(entry.model,'secondary-model');assert.equal(entry.tokens.values.total,0);assert.equal(entry.tokens.values.input,null);assert.ok(entry.contextManifest.totalBytes<=8192);
 const again=await saveEngineeringUsage(f.runtime.store,task,{run:1,boundary:entry.boundary,provider:'secondary',proof:{},outcome:{status:'failed'}});assert.deepEqual(await fs.readFile(path.join(root,ref.path)),before);assert.equal(again.engineering.economics.attempts.length,1);
 const summary=await f.runtime.store.readJson(path.join(root,task.engineering.economics.aggregateRef.path));assert.equal(hash(summary),task.engineering.economics.aggregateRef.digest);
 const lines=workflowLines(task),events=await f.runtime.store.readEvents(task.slug);assert.deepEqual(projectRow(task,events).workflowLines,lines);assert.deepEqual((await snapshot(f.runtime)).tasks[0].workflowLines,lines);assert.ok(lines.some(l=>l.startsWith('USAGE ')));
});
test('unproven hard ceiling blocks provider dispatch and saves AUTO explanation',async t=>{
 const f=await economicFixture(t);const task=await runEngineeringTask({...f.args,trustClass:'foreground-subscription',qualify:p=>({trustClass:'foreground-subscription',execute:input=>p.start(input)})});assert.equal(task.status,'needs_you');assert.equal(task.blockedOn.code,'token_ceiling_unproven');assert.equal(f.calls.length,0);assert.equal(task.engineering.decisions.at(-1).reason,'token_ceiling_unproven');
});
test('capacity failure retains one ledger entry and never grants an expensive retry',async t=>{
 const f=await economicFixture(t,{execute:async()=>({status:'failed',error:'Selected model is at capacity. Please try a different model.'})});const task=await runEngineeringTask({...f.args,trustClass:'foreground-subscription',qualify:qualified});assert.equal(f.calls.length,1);assert.equal(task.status,'needs_you');assert.equal(task.engineering.economics.aggregate.partial,true);assert.equal(task.engineering.economics.aggregate.metrics.total.value,null);
 await assert.rejects(prepareCapacityContinuation({store:f.runtime.store},task,{foreground:true,retryRun:1}),/Economic continuation budget/);assert.equal(f.calls.length,1);
});
test('failed check cannot spend a second small-task attempt',async t=>{
 const f=await economicFixture(t,{setup:async({base})=>{await fs.writeFile(path.join(base,'test/id.test.mjs'),"process.exitCode=1;\n");}});const task=await runEngineeringTask({...f.args,trustClass:'foreground-subscription',qualify:qualified});assert.equal(task.status,'needs_you');assert.equal(task.blockedOn.code,'economic_attempt_limit');assert.equal(f.calls.length,1);
});
test('new context omits full prior prose/reports, saves large logs and verifies exact selected evidence',async t=>{
 const f=await economicFixture(t),root=f.runtime.store.taskDir(f.task.slug),large='UNRELATED_PREVIOUS_PROSE'.repeat(5000),log='very large check output\n'.repeat(5000);
 await f.runtime.store.writeText(path.join(root,'runs/0/result.md'),large);
 const source=await freezeEngineering(f.runtime.store,f.task,1,await engineeringInventory(f.base),'inputs');
 const h=await createHandoff(f.runtime.store,f.task,{run:1,purpose:'fix',source,executorFailure:{run:0,provider:'primary',reason:'capacity',resultRef:'runs/0/result.md',resultDigest:hash(large)},failedCheck:{code:1,output:log}});
 const payload=JSON.stringify(h.content);assert.ok(Buffer.byteLength(payload)<=8192);assert.ok(!payload.includes(large));assert.ok(!payload.includes(log));assert.equal(h.content.refs.original,undefined);assert.equal(h.content.refs.priorFailure.summary.length,512);assert.ok(h.content.refs.priorFailure.reason);assert.equal(h.content.failedCheck.inclusionReason,'exact failing check for focused correction');
 assert.equal(await f.runtime.store.readText(path.join(root,h.content.failedCheck.fullOutput.path)),log);
 assert.equal(h.metrics.contextManifest.totalBytes,Buffer.byteLength(payload));assert.ok(h.auditRefs.source);assert.ok(h.content.refs.source.files.every(f=>f.sha256&&f.bytes!==undefined));await verifyHandoff(f.runtime.store,f.task,h,{run:1,sourceDigest:source.contentDigest});
 h.auditRefs.source.digest='changed';await assert.rejects(verifyHandoff(f.runtime.store,f.task,h),/audit references/);
});
test('oversized required brief or instructions stops rather than silently dropping constraints',async t=>{
 const f=await economicFixture(t);const task={...f.task,brief:'x'.repeat(20000)};await assert.rejects(createHandoff(f.runtime.store,task,{run:1,purpose:'implement'}),/hard byte budget/);
});
test('legacy engineering tasks without ledger/policy still project normally',async t=>{
 const f=await playbookFixture(t);assert.equal(f.task.engineering.economics,undefined);assert.ok(workflowLines(f.task).length);assert.ok(!workflowLines(f.task).some(l=>l.startsWith('USAGE ')));
 const task={...f.task,engineering:{...f.task.engineering,economics:{policy:economicsPolicy(f.task),attempts:[],aggregate:{metrics:{total:{observed:9000,unknownAttempts:0}},partial:false}}}};assert.equal(economicDispatchBlock(task,{maximum:zeroUsage},0),'economic_usage_unknown_or_exhausted');
});

test('minimal driver uses the same cost gate, tier selection, ledger and bounded input',async t=>{
 const f=await economicFixture(t,{config:{playbook:false}});const task=await runEngineeringTask({...f.args,trustClass:'foreground-subscription',qualify:qualified});assert.equal(task.status,'ready',task.blockedOn?.text);assert.equal(f.calls.length,1);assert.equal(f.calls[0].id,'secondary');assert.equal(task.engineering.decisions[0].economics.tier,'small');assert.equal(task.engineering.economics.aggregate.attempts,1);assert.equal(task.runs[0].usageLedger.run,1);
});
test('required instruction drift invalidates the bounded handoff before dispatch',async t=>{
 const f=await economicFixture(t);await fs.writeFile(path.join(f.base,'AGENTS.md'),'Keep the public API.');const source=await freezeEngineering(f.runtime.store,f.task,1,await engineeringInventory(f.base),'inputs');const h=await createHandoff(f.runtime.store,f.task,{run:1,purpose:'implement',source});assert.equal(h.content.instructions[0].text,'Keep the public API.');await fs.writeFile(path.join(f.base,'AGENTS.md'),'New constraint.');await assert.rejects(verifyHandoff(f.runtime.store,f.task,h),/instructions changed/);
});

for(const failure of ['unavailable','subjective'])test(`standard routing changes executor only on observable ${failure} trigger and remaining known budget`,async t=>{
 const f=await economicFixture(t,{config:{files:['src/id.mjs','test/id.test.mjs','a.txt','b.txt','c.txt']},setup:async({base})=>{for(const p of ['a.txt','b.txt','c.txt'])await fs.writeFile(path.join(base,p),'context');},execute:async({calls})=>calls.length===1?{status:'failed',error:'fixture failure',usage:zeroUsage,...(failure==='unavailable'?{failure:{kind:'unavailable'}}:{})}:null});
 const q=p=>({...qualified(p),evidence:{version:'fixture',costTier:{tier:'standard',source:'offline fixture capability qualification'}}});
 const task=await runEngineeringTask({...f.args,trustClass:'foreground-subscription',qualify:q});
 if(failure==='unavailable'){assert.equal(task.status,'ready',task.blockedOn?.text);assert.deepEqual(f.calls.map(c=>c.id),['primary','secondary']);assert.equal(task.engineering.decisions[1].reason,'executor_unavailable');assert.equal(task.engineering.economics.attempts.length,2);}else {assert.equal(task.status,'needs_you');assert.equal(f.calls.length,1);}
});

for(const playbook of [true,false])test(`uncertain ${playbook?'playbook':'minimal'} execution preserves an unknown attempt without replay`,async t=>{
 const f=await economicFixture(t,{config:{playbook},execute:async()=>{throw new Error('fixture process lost');}});
 const task=await runEngineeringTask({...f.args,trustClass:'foreground-subscription',qualify:qualified});assert.equal(task.status,'needs_you');assert.equal(task.blockedOn.code,'execution_uncertain');assert.equal(f.calls.length,1);assert.equal(task.engineering.economics.aggregate.metrics.total.value,null);assert.equal(task.engineering.economics.aggregate.partial,true);
 const ref=task.runs[0].usageLedger,entry=await f.runtime.store.readJson(path.join(f.runtime.store.taskDir(task.slug),ref.path));assert.equal(entry.outcome,'uncertain');assert.equal(entry.complete,false);
});

for(const playbook of [true,false])test(`observed token overrun blocks READY in ${playbook?'playbook':'minimal'} driver`,async t=>{
 const f=await economicFixture(t,{config:{playbook},execute:async()=>({status:'ready',result:'Claimed completion',usage:{...zeroUsage,tokens:9000}})});
 const task=await runEngineeringTask({...f.args,trustClass:'foreground-subscription',qualify:qualified});assert.equal(task.status,'needs_you');assert.equal(task.blockedOn.code,'economic_usage_unknown_or_exhausted');assert.equal(f.calls.length,1);assert.equal(task.engineering.economics.aggregate.metrics.total.value,9000);
});
