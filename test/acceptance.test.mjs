import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { processIdentity } from '../src/core/execution.mjs';
import { createRuntime } from '../src/runtime.mjs';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
test('configured checks freeze before agent execution and retain actual outputs/exits without accepting intent',async t=>{
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'2f-acceptance-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
 await fs.mkdir(path.join(base,'.work/providers'),{recursive:true});
 const script=path.join(base,'.work/agent.mjs');
 await fs.writeFile(script,`import fs from 'node:fs';fs.writeFileSync('.work/acceptance.json',JSON.stringify({runOnReady:true,commands:[{id:'injected',argv:[process.execPath,'-e',"throw Error('wrong plan')"]}]}));console.log('provider claims success');`);
 await fs.writeFile(path.join(base,'.work/providers/fixture.json'),JSON.stringify({id:'fixture',displayName:'fixture',transport:'command',command:[process.execPath,script,'{prompt}']}));
 await fs.writeFile(path.join(base,'.work/acceptance.json'),JSON.stringify({runOnReady:true,commands:[{id:'failing-check',argv:[process.execPath,'-e',"console.log('actual output');console.error('actual error');process.exit(7)"]}]}));
 const rt=createRuntime(base),task=await rt.actions.createWork({brief:'bounded configured check',provider:'fixture'});
 const deadline=Date.now()+10000;
 let done;
 while(Date.now()<deadline){done=await rt.store.findTask(task.id);if(done.status!=='working')break;await delay(30);}
 assert.equal(done.status,'ready','READY remains a review boundary, not test/intent acceptance');
 const run=await rt.actions.getRun(task.id,1);
 assert.equal(run.checks.length,1);assert.equal(run.checks[0].id,'failing-check');assert.equal(run.checks[0].exitCode,7);
 assert.equal(run.checks[0].stdout,'actual output\n');assert.equal(run.checks[0].stderr,'actual error\n');
 assert.equal(run.checks[0].status,'failed');assert.equal(done.disposition,undefined);
});

test('a timed-out project check cannot strand a resistant descendant after its owning worker exits',async t=>{
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'2f-check-timeout-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
 await fs.mkdir(path.join(base,'.work/providers'),{recursive:true});
 await fs.writeFile(path.join(base,'.work/providers/fixture.json'),JSON.stringify({id:'fixture',displayName:'fixture',transport:'command',command:[process.execPath,'-e',"console.log('ready')",'{prompt}']}));
 const pidFile=path.join(base,'check-child.pid');
 const command=`const fs=require('node:fs');const {spawn}=require('node:child_process');const c=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{stdio:'ignore'});fs.writeFileSync(${JSON.stringify(pidFile)},String(c.pid));setInterval(()=>{},1000);`;
 await fs.writeFile(path.join(base,'.work/acceptance.json'),JSON.stringify({runOnReady:true,commands:[{id:'timeout',argv:[process.execPath,'-e',command],timeoutMs:200}]}));
 const rt=createRuntime(base),task=await rt.actions.createWork({brief:'check timeout ownership',provider:'fixture'});
 let done;const deadline=Date.now()+10000;while(Date.now()<deadline){done=await rt.store.findTask(task.id);if(done.status==='ready')break;await delay(50);}
 assert.equal(done.status,'ready');assert.match(done.runs[0].checks[0].status,/^timeout/);
 const pid=Number(await fs.readFile(pidFile,'utf8'));
 while(Date.now()<deadline&&await processIdentity(pid))await delay(50);
 assert.equal(await processIdentity(pid),null,'owning worker drained its timed-out check group');
});
