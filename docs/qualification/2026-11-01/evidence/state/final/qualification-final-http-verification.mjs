import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
import {createRuntime} from '/Users/bogart/Dev/PROBNAYA/work-cli-qualification-20261101/src/runtime.mjs';
import {startServer} from '/Users/bogart/Dev/PROBNAYA/work-cli-qualification-20261101/src/server.mjs';
const base=await fs.mkdtemp(path.join(os.tmpdir(),'qualification-final-http-'));
const node={id:'fixture',async startExecution(){return null;}};
const runtime=createRuntime(base,{node});
const server=await startServer(base,0,{runtime,authToken:'local-fixture-token'});
const auth={'x-0x2f-auth':'local-fixture-token','content-type':'application/json'}, key='controlled-request-key';
const post=(target,body,headers={})=>fetch(server.url+target,{method:'POST',headers:{...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
try{
const first=await post('/api/tasks',{brief:'Private task content in cache'},{...auth,'x-0x2f-request-id':key});assert.equal(first.status,201);const original=await first.json();
for(const target of ['/','/api/health','/app/app.js']){
const response=await post(target,undefined,{'x-0x2f-request-id':key});const text=await response.text();assert.equal(response.status,404);assert.ok(!text.includes('Private task content in cache'));console.log(JSON.stringify({case:'cross-route-no-private-data',target,status:response.status,privateDataLeaked:false}));}
const unauth=await post('/api/tasks',undefined,{'x-0x2f-request-id':key});assert.equal(unauth.status,401);
const retry=await post('/api/tasks',{brief:'Original retry is authoritative'},{...auth,'x-0x2f-request-id':key});assert.equal(retry.status,201);assert.deepEqual(await retry.json(),original);console.log(JSON.stringify({case:'same-route-authenticated-replay',status:retry.status,sameTask:true,unauthenticatedSameRouteStatus:unauth.status}));
for(const action of ['allow','reject']){
let task=await runtime.actions.createWork({brief:'Controlled displayed nonce'});
const shown={type:'permission',live:true,requestId:100,decisionId:'shown-'+action,tool:'First operation'};
await runtime.store.updateTask({...task,status:'needs_you',pid:process.pid,blockedOn:shown});
const observed=await fetch(server.url+'/api/tasks/'+task.id,{headers:auth}).then(r=>r.json());
const current={...shown,decisionId:'new-current-'+action,tool:'Different operation'};
await runtime.store.updateTask({...task,status:'needs_you',pid:process.pid,blockedOn:current});
const decisionFile=path.join(runtime.store.taskDir(task.slug),'permission.json');
for(const body of [undefined,{}, {decisionId:observed.blockedOn.decisionId}]){
const response=await post('/api/tasks/'+task.id+'/'+action,body,auth);assert.equal(response.status,409);await assert.rejects(fs.access(decisionFile),{code:'ENOENT'});assert.equal((await runtime.store.findTask(task.id)).blockedOn.decisionId,current.decisionId);console.log(JSON.stringify({case:'stale-displayed-gesture',action,body:body??null,status:response.status,permissionFileCreated:false}));}
const accepted=await post('/api/tasks/'+task.id+'/'+action,{decisionId:current.decisionId},auth);assert.equal(accepted.status,202);const decision=JSON.parse(await fs.readFile(decisionFile,'utf8'));assert.equal(decision.decisionId,current.decisionId);assert.equal(decision.grant,action);console.log(JSON.stringify({case:'current-displayed-gesture',action,status:accepted.status,correctOccurrenceWritten:true}));
}
}finally{await server.close();await fs.rm(base,{recursive:true,force:true});}
