import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
const repo=fileURLToPath(new URL('../../../../../',import.meta.url));
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'0x2f-acp-permission-'));
let source=execFileSync('git',['show','809e3ab158a7304c9e07e9c6d95ce30542987460:src/providers/acp.mjs'],{cwd:repo,encoding:'utf8'});
source=source.replace(/from "(\.[^\"]+)"/g,(_,specifier)=>'from '+JSON.stringify(pathToFileURL(path.resolve(repo,'src/providers',specifier)).href));
const providerFile=path.join(dir,'baseline-acp.mjs');await fs.writeFile(providerFile,source);
const {createAcpProvider}=await import(pathToFileURL(providerFile));
const agent=path.join(dir,'fake.mjs');
await fs.writeFile(agent,`import fs from 'node:fs';
import readline from 'node:readline';
const logfile=process.argv[2];
const send=message=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',...message})+'\\n');
let promptId;const replied=new Set();
readline.createInterface({input:process.stdin}).on('line',line=>{
 const m=JSON.parse(line);
 if(m.method==='initialize')return send({id:m.id,result:{protocolVersion:1,agentCapabilities:{},agentInfo:{name:'local-fake'},authMethods:[]}});
 if(m.method==='session/new')return send({id:m.id,result:{sessionId:'fake-session'}});
 if(m.method==='session/cancel')return process.exit(0);
 if(m.method==='session/prompt'){
  promptId=m.id;
  for(const id of [100,101])send({id,method:'session/request_permission',params:{sessionId:'fake-session',toolCall:{toolCallId:'tool-'+id,title:'Synthetic operation '+id,kind:'edit'},options:[{optionId:'allow-'+id,kind:'allow_once',name:'Allow once'},{optionId:'reject-'+id,kind:'reject_once',name:'Reject'}]}});
  return;
 }
 if([100,101].includes(m.id)){
  fs.appendFileSync(logfile,JSON.stringify({id:m.id,result:m.result})+'\\n');replied.add(m.id);
  if(replied.size===2)send({id:promptId,result:{stopReason:'end_turn'}});
 }
});
`);
try {
 for(let trial=1;trial<=5;trial++){
  const log=path.join(dir,'log-'+trial);const decisionFile=path.join(dir,'decision-'+trial);
  const provider=createAcpProvider({id:'local-fake',displayName:'Local fake',command:[process.execPath,agent,log]});
  const events=[];
  const result=provider.start({cwd:dir,prompt:'synthetic',permission:{decisionFile},onEvent:event=>{events.push(event);}});
  const deadline=Date.now()+2000;
  while(events.filter(e=>e.type==='needs_user').length!==2){if(Date.now()>deadline)throw new Error('fake did not issue both requests');await new Promise(r=>setTimeout(r,5));}
  await fs.writeFile(decisionFile,JSON.stringify({grant:'allow',at:new Date().toISOString()}));
  let timer;const outcome=await Promise.race([result,new Promise(resolve=>{timer=setTimeout(()=>resolve(null),1200);})]);clearTimeout(timer);
  if(!outcome){provider.cancel();await result;}
  const responses=(await fs.readFile(log,'utf8').catch(()=>'' )).trim().split('\n').filter(Boolean).map(JSON.parse);
  console.log(JSON.stringify({trial,humanGrantsWritten:1,requestsShown:events.filter(e=>e.type==='needs_user').map(e=>e.blockedOn.requestId),allowedRequests:responses.filter(r=>r.result?.outcome?.optionId?.startsWith('allow-')).map(r=>r.id),outcome:outcome?.status??'timed-out'}));
 }
} finally {await fs.rm(dir,{recursive:true,force:true});}
