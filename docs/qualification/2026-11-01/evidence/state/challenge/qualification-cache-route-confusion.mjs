import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';
import {createRuntime} from '/Users/bogart/Dev/PROBNAYA/work-cli-qualification-20261101/src/runtime.mjs';
import {startServer} from '/Users/bogart/Dev/PROBNAYA/work-cli-qualification-20261101/src/server.mjs';
const base=await fs.mkdtemp(path.join(os.tmpdir(),'qualification-cache-route-'));
const node={id:'fixture',async startExecution(){return null;}};const runtime=createRuntime(base,{node});
const server=await startServer(base,0,{runtime,authToken:'local-fixture-token'});
const key='controlled-request-key';
try{
const first=await fetch(server.url+'/api/tasks',{method:'POST',headers:{'x-0x2f-auth':'local-fixture-token','x-0x2f-request-id':key,'content-type':'application/json'},body:JSON.stringify({brief:'Private task content in cache'})});
const original=await first.json();
for(const target of ['/','/api/health','/app/app.js']){
const replay=await fetch(server.url+target,{method:'POST',headers:{'x-0x2f-request-id':key}});
const data=await replay.json();console.log(JSON.stringify({case:'unauthenticated-cross-route-replay',originalStatus:first.status,target,authHeaderSent:false,status:replay.status,replayedPrivateBrief:data.brief,matchedOriginalId:data.id===original.id}));
}
}finally{await server.close();await fs.rm(base,{recursive:true,force:true});}
