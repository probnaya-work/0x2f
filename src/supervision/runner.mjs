import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createStore } from '../core/store.mjs';
import { verifyExecutable } from '../core/workflow-adapters.mjs';
import { loadedRuntimeFingerprint, runtimeFingerprint } from '../core/workflow-scheduler.mjs';
import { attemptDir, channelPath, readAttempt, readInstallation, jobState, groupMembers, attemptLock, writeAttempt, validateAttemptOutputs, digestAttempt, ensureChannel, observeAttemptIdentity, attemptIdentity as processIdentity, attemptIdentityMatches as identityMatches } from '../core/workflow-supervision.mjs';
const exec=promisify(execFile),[, ,base,id]=process.argv,store=createStore(base);
let receipt=await readAttempt(store,id);
if(receipt.state!=='prepared')process.exit(0); // restart is inspection, never another invocation
const request=receipt.request,installation=await readInstallation(store);
if(request.runtimeFingerprint!==loadedRuntimeFingerprint||installation.runtimeFingerprint!==loadedRuntimeFingerprint)process.exit(1);
const job=await jobState(request.label);
if(job.pid!==process.pid)process.exit(1);
const owner=await processIdentity(process.pid);if(!owner||owner.unknown)process.exit(1);
const {stdout}=await exec('/bin/ps',['-p',String(process.pid),'-o','pgid=']);const pgid=Number(stdout.trim());
if(pgid!==process.pid)process.exit(1); // require the dedicated launchd job group
const socketFile=await ensureChannel(store,id,{create:true});await fs.rm(socketFile,{force:true});
async function fault(name) {
  if(request.testCrashAt===`both:${name}`){if(await identityMatches(request.worker))process.kill(request.worker.pid,'SIGKILL');process.kill(process.pid,'SIGKILL');}
  if(request.testCrashAt===name)process.kill(process.pid,'SIGKILL');
}
await fault('before-owned');
let claimed=false,child=null,mainExit=null,bytes=0,streamFailure=false,credentials={},stopping=false;
async function stop(reason){if(stopping)return;stopping=true;await attemptLock(store,id,async()=>{const r=await readAttempt(store,id);await writeAttempt(store,r,{state:'cancelling',reason});});await exec('/bin/launchctl',['kill','SIGKILL',`gui/${process.getuid()}/${request.label}`]);}
process.on('SIGTERM',()=>{stop('supervisor_sigterm').catch(()=>process.exit(1));});
const server=net.createServer(socket=>{
  let packet=[],packetBytes=0;socket.on('error',()=>{});socket.on('data',b=>{packetBytes+=b.length;if(packetBytes>128000)socket.destroy();else packet.push(b);});
  socket.on('end',async()=>{
    if(claimed){socket.end();return;}claimed=true;
    try{
      const input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(packet)));packet=[];if(input.id!==id||!input.env||Object.keys(input.env).some(n=>!(request.policy.credentialEnv??[]).includes(n))||(request.policy.credentialEnv??[]).some(n=>typeof input.env[n]!=='string'||!input.env[n]))throw new Error('Invalid gate packet.');
      credentials=input.env;
      if(!await identityMatches(request.worker))throw new Error('Worker disappeared before gate.');
      const task=await store.findTask(request.taskId);
      if(request.runtimeFingerprint!==await runtimeFingerprint()||task.workflow?.definition.digest!==request.definitionDigest||task.workflow.runtimeFingerprint!==request.runtimeFingerprint||task.workflow.definition.permissions.unattendedAdapters!==true||task.workflow.definition.permissions.commandAdapters!==true||task.status!=='working'||task.runs?.at(-1)?.run!==request.run||task.execution.launchToken!==request.token||(await store.readCancelRequest(task))?.run===request.run)throw new Error('Worker/run is cancelled or stale before gate.');
      const executable=await verifyExecutable({...request.pin,command:request.pin.realPath});
      const directory=attemptDir(store,id),output=path.join(directory,'output');
      const argv=request.argv.map(a=>a.replaceAll('{outputDir}',output).replaceAll('{inputDir}',path.join(directory,'input')));
      if(Object.values(credentials).some(s=>argv.some(a=>a.includes(s))))throw new Error('Credential-bearing argv refused.');
      child=spawn(installation.python.realPath,[new URL('./adapter-gate.py',import.meta.url).pathname,String(request.maxBytes),String(Math.ceil(request.timeoutMs/1000)),executable,...argv.slice(1)],{cwd:output,detached:false,env:{PATH:'/usr/bin:/bin',LANG:'C.UTF-8',...credentials,WORKFLOW_OPERATION_ID:request.operationId},stdio:['pipe','pipe','pipe']});
      await fault('spawn-before-record');
      child.stdin.on('error',()=>{});child.on('error',()=>{streamFailure=true;});child.on('close',code=>{mainExit=code??125;});
      for(const stream of [child.stdout,child.stderr])stream.on('data',b=>{bytes+=b.length;if(bytes>500000){streamFailure=true;stop('output_limit').catch(()=>{});}}); // discard all raw output, including credentials
      await attemptLock(store,id,async()=>{
        let r=await readAttempt(store,id);const adapterIdentity=await processIdentity(child.pid);
        if(!adapterIdentity||adapterIdentity.unknown||r.state!=='owned')throw new Error('Incomplete child ownership.');
        r=await writeAttempt(store,r,{state:'running',adapterIdentity,startedAt:new Date().toISOString()});
      });
      await fault('record-before-go');
      child.stdin.end('GO\n');await fault('after-go');socket.end();
    }catch{socket.end();await stop('gate_or_executable_failure').catch(()=>process.exit(1));}
  });
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(socketFile,resolve);});await fs.chmod(socketFile,0o600);
await attemptLock(store,id,async()=>{receipt=await readAttempt(store,id);if(receipt.state!=='prepared')throw new Error('Attempt already owned.');await writeAttempt(store,receipt,{state:'owned',owner,pgid,ownedAt:new Date().toISOString()});});
await fault('after-owned');
const deadline=Date.now()+request.timeoutMs;
try{
 while(true){
   if(['gone','mismatch'].includes(await observeAttemptIdentity(request.worker))){await stop('worker_lost');break;}
   if(Date.now()>deadline){await stop('timeout');break;}
   const r=await readAttempt(store,id);if(r.state==='cancelling'){await stop(r.reason??'user_cancel');break;}
   if(mainExit!==null){
     const members=await groupMembers(pgid);
     if(members.some(pid=>pid!==process.pid)){await new Promise(r=>setTimeout(r,50));continue;}
     await attemptLock(store,id,async()=>{
       let fresh=await readAttempt(store,id);if(fresh.state!=='running')throw new Error('Attempt fenced.');
       await fault('before-validation');
       fresh=await writeAttempt(store,fresh,{state:'exited',exitCode:mainExit,groupClosed:true});
       if(mainExit!==0||streamFailure){await writeAttempt(store,fresh,{state:'failed',reason:'adapter_exit_or_output_failure'});return;}
       try{
         const manifest=await validateAttemptOutputs(store,fresh,Object.values(credentials),true);await store.writeJson(path.join(attemptDir(store,id),'manifest.json'),manifest);
         for(const f of manifest.files)await fs.chmod(path.join(attemptDir(store,id),'output',f.path),0o400);await fs.chmod(path.join(attemptDir(store,id),'output'),0o500);
         await writeAttempt(store,fresh,{state:'validated',manifestDigest:digestAttempt(manifest)});
       }catch{
         if(Object.keys(credentials).length)await fs.rm(path.join(attemptDir(store,id),'output'),{recursive:true,force:true});
         await writeAttempt(store,fresh,{state:'failed',reason:'output_validation_failed',credentialOutputsDiscarded:Object.keys(credentials).length>0});
       }
     });await fault('after-validation');break;
   }
   await new Promise(r=>setTimeout(r,50));
 }
}finally{server.close();await fs.rm(socketFile,{force:true});await fs.rmdir(path.dirname(socketFile)).catch(()=>{});}
