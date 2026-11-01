import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRuntime } from '/Users/bogart/Dev/PROBNAYA/work-cli-qualification-20261101/src/runtime.mjs';
import { recoverInterruptedRuns, pidAlive } from '/Users/bogart/Dev/PROBNAYA/work-cli-qualification-20261101/src/recover.mjs';
const root = await fs.mkdtemp(path.join(os.tmpdir(),'qualification-state-'));
const workers = new Set();
const pause = ms => new Promise(r=>setTimeout(r,ms));
async function wait(fn, label) { for(let i=0;i<250;i++) { const x=await fn(); if(x) return x; await pause(40); } throw new Error('Timeout '+label); }
const cmd = path.join(root,'gated-command.mjs');
await fs.writeFile(cmd, `import fs from 'node:fs'; const base=process.cwd(); fs.writeFileSync(base+'/command-started',''); const t=setInterval(()=>{if(fs.existsSync(base+'/release')){clearInterval(t);process.stdout.write('Completed controlled local work');}},20);`);
const acp = path.join(root,'controlled-acp.mjs');
await fs.writeFile(acp, `import fs from 'node:fs'; import readline from 'node:readline'; const send=o=>process.stdout.write(JSON.stringify(o)+'\\n'); const rl=readline.createInterface({input:process.stdin}); let promptId; const timer=setInterval(()=>{if(fs.existsSync(process.cwd()+'/crash-agent')) process.exit(7);},20); rl.on('close',()=>{clearInterval(timer);process.exit(0);}); rl.on('line',line=>{const m=JSON.parse(line); if(m.method==='initialize') send({jsonrpc:'2.0',id:m.id,result:{protocolVersion:1,agentCapabilities:{loadSession:true},authMethods:[]}}); if(m.method==='session/new') send({jsonrpc:'2.0',id:m.id,result:{sessionId:'local-fixture-session'}}); if(m.method==='session/prompt'){promptId=m.id; send({jsonrpc:'2.0',id:100,method:'session/request_permission',params:{sessionId:'local-fixture-session',toolCall:{toolCallId:'c',title:'Local fixture edit',kind:'edit'},options:[{optionId:'allow',kind:'allow_once',name:'Allow once'},{optionId:'reject',kind:'reject_once',name:'Reject'}]}});} if(m.id===100) {send({jsonrpc:'2.0',method:'session/update',params:{sessionId:'local-fixture-session',update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'Local fixture completed'}}}});send({jsonrpc:'2.0',id:promptId,result:{stopReason:'end_turn'}});} });`);
async function project(name) { const base=path.join(root,name); await fs.mkdir(path.join(base,'.work/providers'),{recursive:true}); for(const [id,transport,script] of [['gate','command',cmd],['fixtureacp','acp',acp]]) await fs.writeFile(path.join(base,'.work/providers',id+'.json'),JSON.stringify({id,displayName:id,transport,command:[process.execPath,script,...(transport==='command'?['{prompt}']:[])]})); return createRuntime(base); }
async function create(rt,provider) { const task=await rt.actions.createWork({brief:'Controlled local qualification',provider}); if(task.pid) workers.add(task.pid); return task; }
async function getStatus(rt,id,status) {return wait(async()=>{const t=await rt.store.findTask(id);return t.status===status && t;},status);}
try {
  {
    const rt=await project('note'); const task=await create(rt,'gate'); await wait(async()=>fs.access(path.join(rt.base,'command-started')).then(()=>true,()=>false),'command-started');
    await rt.actions.noteWork(task.id,{note:'Persist this human constraint'}); assert.equal((await rt.store.findTask(task.id)).context.notes.length,1);
    await fs.writeFile(path.join(rt.base,'release'),''); const finished=await getStatus(rt,task.id,'ready');
    console.log(JSON.stringify({case:'note-during-working',expectedNotes:1,actualNotes:finished.context?.notes??null,eventRetainsNote:(await rt.store.readEvents(task.slug)).some(e=>e.type==='task.note')}));
  }
  {
    const rt=await project('close'); const task=await create(rt,'gate'); await wait(async()=>fs.access(path.join(rt.base,'command-started')).then(()=>true,()=>false),'command-started');
    const closed=await rt.actions.closeWork(task.id); assert.equal(closed.status,'done');
    await fs.writeFile(path.join(rt.base,'release'),''); const finished=await getStatus(rt,task.id,'ready');
    console.log(JSON.stringify({case:'close-during-working',expectedStatus:'done',actualStatus:finished.status,eventRetainsClose:(await rt.store.readEvents(task.slug)).some(e=>e.type==='task.closed')}));
  }
  {
    const rt=await project('live-rerun'); const task=await create(rt,'fixtureacp'); const paused=await getStatus(rt,task.id,'needs_you'); assert.equal(paused.blockedOn.live,true);
    const next=await rt.actions.rerunWork(task.id,{provider:'gate'}); workers.add(next.pid); await wait(async()=>fs.access(path.join(rt.base,'command-started')).then(()=>true,()=>false),'second command-started');
    console.log(JSON.stringify({case:'rerun-live-permission',expected:'refusal or old worker stopped',actual:'second worker executing while first worker still alive',oldWorkerAlive:pidAlive(task.pid),newWorkerAlive:pidAlive(next.pid),runCount:(await rt.store.findTask(task.id)).runs.length}));
    await fs.writeFile(path.join(rt.base,'release'),''); await getStatus(rt,task.id,'ready'); await fs.writeFile(path.join(rt.base,'crash-agent'),''); const overwritten=await getStatus(rt,task.id,'failed');
    console.log(JSON.stringify({case:'old-worker-clobbers-rerun',expectedRuns:2,actualRuns:overwritten.runs.length,expectedProvider:'gate',actualProvider:overwritten.execution.provider,actualStatus:overwritten.status,eventRuns:[...new Set((await rt.store.readEvents(task.slug)).map(e=>e.run).filter(Boolean))]}));
  }
  {
    const rt=await project('live-dead'); const task=await create(rt,'fixtureacp'); await getStatus(rt,task.id,'needs_you'); process.kill(task.pid,'SIGKILL'); await wait(()=>!pidAlive(task.pid),'worker dead');
    const recovered=await recoverInterruptedRuns(rt.base,{log(){}}); const action=await rt.actions.allowWork(task.id); const persisted=await rt.store.findTask(task.id);
    console.log(JSON.stringify({case:'dead-live-permission-recovery',workerAlive:pidAlive(task.pid),expected:'failed/crashed and rerunnable',recoveredCount:recovered.length,actualPersistedStatus:persisted.status,actualBlockedLive:persisted.blockedOn.live,allowReturnStatus:action.status,permissionFileExists:await fs.access(path.join(rt.store.taskDir(task.slug),'permission.json')).then(()=>true,()=>false)}));
  }
  console.log(JSON.stringify({fixtureRoot:root}));
} finally {
  for(const pid of workers) { try {process.kill(pid,'SIGKILL');} catch{} }
}
