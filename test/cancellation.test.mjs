import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRuntime } from '../src/runtime.mjs';
import { pidAlive } from '../src/recover.mjs';
import { executionAlive } from '../src/core/execution.mjs';
const delay = ms => new Promise(r => setTimeout(r, ms));
async function until(fn) {
  const end = Date.now() + 12000;
  while (Date.now() < end) { const v = await fn(); if (v) return v; await delay(30); }
  throw new Error('timeout');
}
for (const permission of [false, true]) {
  test(`owned cancellation stops descendants, preserves partial text and permits retry (permission=${permission})`, async t => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), '2f-cancel-'));
    const script = path.join(base, 'agent.mjs');
    await fs.mkdir(path.join(base, '.work/providers'), { recursive: true });
    await fs.writeFile(script, permission ? `
      import readline from 'node:readline';
      const send = m => console.log(JSON.stringify({jsonrpc:'2.0',...m}));
      readline.createInterface({input:process.stdin}).on('line', line => {
        const m=JSON.parse(line);
        if(m.method==='initialize') send({id:m.id,result:{protocolVersion:1}});
        if(m.method==='session/new') send({id:m.id,result:{sessionId:'cancel-test'}});
        if(m.method==='session/prompt') {
          send({method:'session/update',params:{update:{sessionUpdate:'agent_message_chunk',content:{text:'partial result'}}}});
          send({id:77,method:'session/request_permission',params:{toolCall:{title:'fixture edit',kind:'edit'},options:[{optionId:'yes',kind:'allow_once'}]}});
        }
      });` : `
      import fs from 'node:fs';
      import {spawn} from 'node:child_process';
      const child=spawn(process.execPath,['-e', 'process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'],{stdio:'ignore'});
      fs.writeFileSync('descendant',String(child.pid));
      console.log('partial result');
      setInterval(()=>{},1000);`);
    await fs.writeFile(path.join(base,'.work/providers/fixture.json'),JSON.stringify({id:'fixture',displayName:'fixture',transport:permission?'acp':'command',command:[process.execPath,script,...(permission?[]:["{prompt}"])]}));
    const rt=createRuntime(base);
    let task;
    t.after(async () => { if(task && pidAlive(task.pid)) await rt.actions.cancelWork(task.id).catch(()=>{}); await delay(700); await fs.rm(base,{recursive:true,force:true}); });
    task=await rt.actions.createWork({brief:'bounded local cancellation',provider:'fixture'});
    await until(async()=> (await rt.store.readEvents(task.slug)).some(e=>permission?e.type==='needs_user':e.type==='progress'));
    const requested=await rt.actions.cancelWork(task.id,{reason:'Fixture user stop'});
    assert.equal(requested.cancelRequested.executionId,task.execution.id);
    const stopped=await until(async()=>{const t=await rt.store.findTask(task.id);return t.failure?.kind==='cancelled'&&t;});
    assert.equal(stopped.runs[0].stopReason,'cancelled');
    assert.match(await rt.store.readTaskResult(stopped),/partial result/);
    await assert.rejects(()=>rt.actions.allowWork(task.id),/Cancellation|not needs_you/);
    await until(()=>!pidAlive(task.pid));
    if(!permission){
      const pid=Number(await fs.readFile(path.join(base,'descendant'),'utf8'));
      await until(()=>!pidAlive(pid));
    }
    await fs.writeFile(script,`console.log('retry complete')`);
    await fs.writeFile(path.join(base,'.work/providers/fixture.json'),JSON.stringify({id:'fixture',displayName:'fixture',transport:'command',command:[process.execPath,script,'{prompt}']}));
    const retried=await createRuntime(base).actions.rerunWork(task.id);
    assert.notEqual(retried.execution.id,task.execution.id);
    assert.equal(retried.runs.length,2);
    await until(async()=> (await rt.store.findTask(task.id)).status==='ready');
  });
}
test('PID reuse identity mismatch is not a living execution', async () => {
  assert.equal(await executionAlive({pid:process.pid,execution:{process:{start:'wrong-generation'}}},pidAlive),false);
});
test('accept, drop and close are explicit history dispositions', async t => {
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'2f-disposition-'));
  t.after(()=>fs.rm(base,{recursive:true,force:true}));
  const rt=createRuntime(base,{node:{id:'fixture',async startExecution(){return null;}}});
  for(const disposition of ['accept','drop','close']) {
    const task=await rt.actions.createWork({brief:'Review disposition'});
    if(disposition==='accept') await rt.store.updateTask({...task,status:'ready'});
    const closed=await rt.actions.closeWork(task.id,{disposition});
    assert.equal(closed.disposition,disposition);
    assert.equal((await rt.store.readEvents(task.slug)).at(-1).disposition,disposition);
  }
});
