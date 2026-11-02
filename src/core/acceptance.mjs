// Explicit project checks have their own local-user authority, outside the
// provider's permission system. The plan is frozen BEFORE agent execution.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { WorkError } from './errors.mjs';
export async function acceptancePlan(base) {
  let raw;
  try { raw=JSON.parse(await fs.readFile(path.join(base,'.work/acceptance.json'),'utf8')); }
  catch(e) { if(e.code==='ENOENT') return null; throw new WorkError(`Invalid acceptance configuration: ${e.message}`); }
  if(raw.runOnReady!==true) return null;
  if(!Array.isArray(raw.commands)||raw.commands.length<1||raw.commands.length>8) throw new WorkError('Acceptance checks require 1–8 explicitly configured commands.');
  const seen=new Set();
  return {version:1,authority:'explicit project configuration; local OS user; not provider sandbox',commands:raw.commands.map(c=>{
    if(!c||!/^[a-z0-9-]{1,40}$/.test(c.id)||seen.has(c.id)) throw new WorkError('Acceptance check ids must be unique lowercase names.');
    seen.add(c.id);
    if(!Array.isArray(c.argv)||!c.argv.length||c.argv.length>32||c.argv.some(a=>typeof a!=='string'||a.length>4096||a.includes('\0'))) throw new WorkError('Acceptance commands must be bounded argv arrays, never interpolated shell strings.');
    const timeoutMs=c.timeoutMs??60000;
    if(!Number.isSafeInteger(timeoutMs)||timeoutMs<100||timeoutMs>300000) throw new WorkError('Acceptance timeout must be 100–300000 ms.');
    return {id:c.id,argv:c.argv,timeoutMs};
  })};
}
export async function runAcceptance({plan,cwd,directory,writeJson,writeText,signal}) {
  if(!plan) return [];
  const home=path.join(directory,'check-home');
  await fs.mkdir(home,{recursive:true,mode:0o700});
  const receipts=[];
  for(const command of plan.commands) {
    if(signal?.aborted) break;
    const started=Date.now();
    const receipt=await new Promise(resolve=>{
      let stdout='',stderr='',truncated=false,finished=false,timer;
      const child=spawn(command.argv[0],command.argv.slice(1),{cwd,env:{PATH:process.env.PATH,HOME:home,LANG:'C.UTF-8',TMPDIR:os.tmpdir()},stdio:['ignore','pipe','pipe']});
      const append=(key,chunk)=>{const s=chunk.toString();if(key==='out'){stdout+=s; if(stdout.length>1000000){stdout=stdout.slice(0,1000000);truncated=true;}}else{stderr+=s;if(stderr.length>1000000){stderr=stderr.slice(0,1000000);truncated=true;}}};
      const complete=(extra)=>{if(finished)return;finished=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);resolve({id:command.id,argv:command.argv,cwd,startedAt:new Date(started).toISOString(),durationMs:Date.now()-started,environment:{platform:process.platform,node:process.version,keys:['PATH','HOME','LANG','TMPDIR'],home:'private empty check home'},stdout,stderr,truncated,...extra});};
      const abort=()=>{child.kill('SIGTERM');complete({status:'cancelled',exitCode:null});};
      child.stdout.on('data',c=>append('out',c));child.stderr.on('data',c=>append('err',c));
      child.once('error',e=>complete({status:'launch-failed',error:e.message,exitCode:null}));
      child.once('close',(code,sig)=>complete({status:code===0?'passed':'failed',exitCode:Number.isInteger(code)?code:null,signal:sig}));
      timer=setTimeout(()=>{child.kill('SIGKILL');child.stdout.destroy();child.stderr.destroy();complete({status:'timeout; descendants may require cancellation',exitCode:null});},command.timeoutMs);
      signal?.addEventListener('abort',abort,{once:true});
      if(signal?.aborted) abort();
    });
    const dir=path.join(directory,'checks',command.id);
    await writeText(path.join(dir,'stdout.txt'),receipt.stdout);await writeText(path.join(dir,'stderr.txt'),receipt.stderr);
    const summary={...receipt,stdout:undefined,stderr:undefined,stdoutSha256:createHash('sha256').update(receipt.stdout).digest('hex'),stderrSha256:createHash('sha256').update(receipt.stderr).digest('hex'),artifacts:`checks/${command.id}/`,authority:plan.authority};
    await writeJson(path.join(dir,'receipt.json'),summary);receipts.push(summary);
    if(receipt.status.startsWith('timeout')||receipt.status==='cancelled') break;
  }
  return receipts;
}
