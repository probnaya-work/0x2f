import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {appFixture,tools,toolStep,pause,addUsage} from './fixtures/codex-app-server-qualification.mjs';
import {messageStream} from './fixtures/codex-responses-mock.mjs';
const toolCall=m=>m.method==='item/tool/call';
const completed=m=>m.method==='turn/completed';

test('app-server stable lifecycle and experimental tool registration gate',async t=>{
 const f=await appFixture(t,[],{experimental:false});if(!f)return;const s=f.session;
 const denied=await s.request('thread/start',{cwd:f.root,dynamicTools:tools});assert.match(denied.error?.message??'',/requires experimentalApi/);assert.equal(f.posts().length,0);
 const r=await f.thread(s);assert.ok(r.result?.thread.id);await f.turn(s,r.result.thread.id);const end=await s.wait(completed);assert.equal(end.params.turn.status,'completed');await f.evidence(s,{stableDynamicToolsError:denied.error,qualification:'NO-GO: client tools require experimental surface'});
});
test('app-server registered tool waits for client and receives bounded read result',async t=>{
 const f=await appFixture(t,[toolStep('read_task_file',{path:'a.mjs'})]);if(!f)return;const s=f.session,r=await f.thread(s);await f.turn(s,r.result.thread.id);const call=await s.wait(toolCall);
 await pause(100);assert.equal(f.posts().length,1);assert.equal(call.params.tool,'read_task_file');
 const full=Buffer.alloc(64000,120),limited=full.subarray(0,4096).toString();f.reply(s,call,limited);await s.wait(completed);
 const output=f.posts().at(-1).body.input.find(i=>i.type==='function_call_output');assert.ok(output.output.includes(limited));assert.ok(Buffer.byteLength(output.output)<24*1024);assert.ok(!output.output.includes(full.toString()));
 await f.evidence(s,{beforeReplyModelRequests:1,sourceBytes:full.length,clientContentBytes:4096,wireOutputBytes:Buffer.byteLength(output.output),qualification:'partial: registered calls only; not an adapter'});
});
test('app-server client denial has no tool side effect and duplicate reply does not replay turn',async t=>{
 const f=await appFixture(t,[toolStep('submit_patch',{path:'a.mjs'})]);if(!f)return;const s=f.session,r=await f.thread(s);await f.turn(s,r.result.thread.id);const call=await s.wait(toolCall);
 f.reply(s,call,'Denied by client before side effect.',false);f.reply(s,call,'Duplicate reply ignored.',false);await s.wait(completed);await pause(100);
 assert.equal(f.posts().length,2);assert.equal(await fs.access(f.root+'/a.mjs').then(()=>true,()=>false),false);assert.equal(s.history.filter(toolCall).length,1);await f.evidence(s,{sideEffects:0,duplicateReplies:1});
});
test('app-server seventh registered call is stopped before another result or effect',async t=>{
 const f=await appFixture(t,Array.from({length:7},(_,i)=>toolStep('submit_patch',{path:'a.mjs'},i)));if(!f)return;const s=f.session,r=await f.thread(s);const tr=await f.turn(s,r.result.thread.id);let calls=0,bytes=0;
 while(calls<7){const call=await s.wait(m=>toolCall(m)&&m.params.callId==='call_'+calls);calls++;if(calls===7)break;const text='No effect in qualification';bytes+=Buffer.byteLength(text);f.reply(s,call,text,false);}
 const interrupted=await s.request('turn/interrupt',{threadId:r.result.thread.id,turnId:tr.result.turn.id});assert.ok(!interrupted.error);const end=await s.wait(completed);assert.equal(end.params.turn.status,'interrupted');assert.equal(f.posts().length,7);assert.ok(bytes<24*1024);await f.evidence(s,{seenRegisteredCalls:calls,resultsReturned:6,sideEffects:0});
});
test('app-server unknown tools bypass client request and exceed result budget invisibly',async t=>{
 const f=await appFixture(t,[toolStep('unknown_'+'x'.repeat(26000),{})]);if(!f)return;const s=f.session,r=await f.thread(s);await f.turn(s,r.result.thread.id);const end=await s.wait(completed);
 assert.equal(end.params.turn.status,'completed');assert.equal(s.history.filter(toolCall).length,0);const output=f.posts().at(-1).body.input.find(i=>i.type==='function_call_output');assert.equal(Buffer.byteLength(output.output),26026);assert.ok(!s.history.some(m=>m.params?.item?.type==='dynamicToolCall'));assert.equal(f.posts().length,2);
 await f.evidence(s,{unknownToolDeliveredToClient:false,returnedPayloadBytes:26026,qualification:'NO-GO: automatic rejection and next model request without client gate'});
});
test('app-server context expansion interrupts without another model request',async t=>{
 const f=await appFixture(t,[toolStep('request_context_expansion',{})]);if(!f)return;const s=f.session,r=await f.thread(s),tr=await f.turn(s,r.result.thread.id);await s.wait(toolCall);
 await s.request('turn/interrupt',{threadId:r.result.thread.id,turnId:tr.result.turn.id});assert.equal((await s.wait(completed)).params.turn.status,'interrupted');await pause(100);assert.equal(f.posts().length,1);await f.evidence(s,{next:'NEEDS YOU/context_expansion_required',automaticRetry:false});
});
test('app-server interrupt then process-group closure prevents late result consumption',async t=>{
 const f=await appFixture(t,[toolStep('submit_patch',{path:'late.mjs'})]);if(!f)return;const s=f.session,r=await f.thread(s),tr=await f.turn(s,r.result.thread.id);const call=await s.wait(toolCall);
 // Short deterministic fixture deadline, same interrupt/closure sequence.
 await new Promise(resolve=>setTimeout(resolve,50));await s.request('turn/interrupt',{threadId:r.result.thread.id,turnId:tr.result.turn.id});assert.equal((await s.wait(completed)).params.turn.status,'interrupted');
 f.reply(s,call,'Late result must not reach the model.');await pause(100);assert.equal(f.posts().length,1);await s.kill();
 let live=true;for(let i=0;i<30&&live;i++){try{process.kill(-s.child.pid,0);}catch(e){if(e.code==='ESRCH')live=false;else throw e;}if(live)await pause(20);}assert.equal(live,false);assert.equal(await fs.access(f.root+'/late.mjs').then(()=>true,()=>false),false);
 await f.evidence(s,{lateResultForwarded:false,sideEffects:0,ownedGroupClosed:true,fixtureDeadlineMs:50,production120SecondDeadlineQualified:false});
});
test('app-server usage exposes cumulative total and last response separately',async t=>{
 const f=await appFixture(t,[toolStep('read_task_file',{path:'a.mjs'},0,10),addUsage({events:messageStream('Done')},20)]);if(!f)return;const s=f.session,r=await f.thread(s);await f.turn(s,r.result.thread.id);const call=await s.wait(toolCall);f.reply(s,call,'file');await s.wait(completed);
 const usage=s.history.filter(m=>m.method==='thread/tokenUsage/updated').map(m=>m.params.tokenUsage);assert.ok(usage.length>=2);assert.equal(usage.at(-1).total.totalTokens,30);assert.equal(usage.at(-1).last.totalTokens,20);await f.evidence(s,{semantics:'thread cumulative total; last response separate; synthetic fixture counters',money:'unknown'});
});
test('app-server crash restart and thread resume do not replay an unresolved client effect',async t=>{
 const f=await appFixture(t,[toolStep('submit_patch',{path:'a.mjs'})]);if(!f)return;const s=f.session,r=await f.thread(s);await f.turn(s,r.result.thread.id);await s.wait(toolCall);await s.kill();
 const restarted=await f.start();const resumed=await restarted.request('thread/resume',{threadId:r.result.thread.id,excludeTurns:true});assert.ok(resumed.result,resumed.error?.message);await pause(150);assert.equal(f.posts().length,1);assert.equal(restarted.history.filter(toolCall).length,0);assert.equal(await fs.access(f.root+'/a.mjs').then(()=>true,()=>false),false);await f.evidence(restarted,{automaticTurnReplay:false,automaticToolReplay:false,originalUnresolvedCallPreservedAsUncertain:true});
});
