import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRuntime } from '/Users/bogart/Dev/PROBNAYA/work-cli-qualification-20261101/src/runtime.mjs';
import { createLocalNode } from '/Users/bogart/Dev/PROBNAYA/work-cli-qualification-20261101/src/nodes/local.mjs';
const base=await fs.mkdtemp(path.join(os.tmpdir(),'qualification-resume-'));
const script=path.join(base,'fake-acp.mjs');
await fs.writeFile(script, `import fs from 'node:fs'; import readline from 'node:readline'; const send=o=>process.stdout.write(JSON.stringify(o)+'\\n'); const rl=readline.createInterface({input:process.stdin});let p;const t=setInterval(()=>{if(p&&fs.existsSync('release')){send({jsonrpc:'2.0',id:p,result:{stopReason:'end_turn'}});p=null;}},20);rl.on('close',()=>{clearInterval(t);process.exit(0);});rl.on('line',line=>{const m=JSON.parse(line);if(m.method==='initialize')send({jsonrpc:'2.0',id:m.id,result:{protocolVersion:1,agentCapabilities:{loadSession:true},authMethods:[]}});if(m.method==='session/load')send({jsonrpc:'2.0',id:m.id,result:{}});if(m.method==='session/prompt'){p=m.id;fs.writeFileSync('resumed-'+process.pid,'');}});`);
await fs.mkdir(path.join(base,'.work/providers'),{recursive:true});
await fs.writeFile(path.join(base,'.work/providers/localacp.json'),JSON.stringify({id:'localacp',displayName:'Local ACP fixture',transport:'acp',command:[process.execPath,script]}));
const realNode=createLocalNode({workspace:base});const pids=[];
const node={...realNode,async resumeExecution(args){const pid=await realNode.resumeExecution(args);pids.push(pid);return pid;}};
const rt=createRuntime(base,{node});
let task=await rt.store.createTask({title:'Local paused fixture',brief:'Local paused fixture',prompt:'Local prompt'},{provider:'localacp',runs:[{run:1,provider:'localacp',node:'local',workspace:'local',startedAt:new Date().toISOString(),outcome:'needs_you',attempts:1,externalSessionId:'fixture-session'}]});
task={...task,status:'needs_you',blockedOn:{type:'permission',tool:'Local fixture edit'},execution:{...task.execution,externalSessionId:'fixture-session'}};await rt.store.updateTask(task);
try {
 const results=await Promise.allSettled([rt.actions.allowWork(task.id),rt.actions.allowWork(task.id)]);
 for(let i=0;i<100;i++){const ready=(await fs.readdir(base)).filter(f=>f.startsWith('resumed-'));if(ready.length===2)break;await new Promise(r=>setTimeout(r,30));}
 const executing=(await fs.readdir(base)).filter(f=>f.startsWith('resumed-'));
 console.log(JSON.stringify({case:'concurrent-nonlive-resume',actionStatuses:results.map(r=>r.status),workerPids:pids,providerInstancesExecuting:executing.length,expectedProviderInstances:1,base}));
 assert.equal(executing.length,2);
 await fs.writeFile(path.join(base,'release'),'');
 await new Promise(r=>setTimeout(r,200));
}finally{for(const pid of pids){try{process.kill(pid,'SIGKILL');}catch{}}}
