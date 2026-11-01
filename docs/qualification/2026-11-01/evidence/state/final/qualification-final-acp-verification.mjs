import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { createAcpProvider } from '/Users/bogart/Dev/PROBNAYA/work-cli-qualification-20261101/src/providers/acp.mjs';
const base=await fs.mkdtemp(path.join(os.tmpdir(),'qualification-acp-reuse-'));
const agent=path.join(base,'reused-id-agent.mjs'), decisionFile=path.join(base,'decision.json'), logFile=path.join(base,'responses.jsonl');
await fs.writeFile(agent,`import fs from 'node:fs';import readline from 'node:readline';const send=o=>process.stdout.write(JSON.stringify(o)+'\\n');let promptId,stage=0;const input=readline.createInterface({input:process.stdin});input.on('line',line=>{const m=JSON.parse(line);if(m.method==='initialize')send({jsonrpc:'2.0',id:m.id,result:{protocolVersion:1,agentCapabilities:{},authMethods:[]}});if(m.method==='session/new')send({jsonrpc:'2.0',id:m.id,result:{sessionId:'local-reuse'}});if(m.method==='session/prompt'){promptId=m.id;request();}if(m.id===100){fs.appendFileSync(${JSON.stringify(logFile)},JSON.stringify({stage,response:m.result})+'\\n');if(++stage===1)request();else send({jsonrpc:'2.0',id:promptId,result:{stopReason:'end_turn'}});}});function request(){send({jsonrpc:'2.0',id:100,method:'session/request_permission',params:{sessionId:'local-reuse',toolCall:{toolCallId:'tool-'+stage,title:stage===0?'First operation':'Different second operation',kind:'execute'},options:[{optionId:'allow',name:'Allow once',kind:'allow_once'},{optionId:'reject',name:'Reject once',kind:'reject_once'}]}});}`);
const events=[];const provider=createAcpProvider({id:'local-reuse',displayName:'Local reuse',command:[process.execPath,agent]});
const wait=async(fn)=>{for(let i=0;i<100;i++){const r=await fn();if(r)return r;await new Promise(r=>setTimeout(r,20));}throw Error('timeout');};
try{
 const result=provider.start({cwd:base,prompt:'Local fixture',onEvent:e=>events.push(e),permission:{decisionFile}});
 await wait(()=>events.filter(e=>e.type==='needs_user').length===1);
 const first=events.find(e=>e.type==='needs_user');const oldDecision={grant:'allow',requestId:first.blockedOn.requestId,decisionId:first.blockedOn.decisionId};
 await fs.writeFile(decisionFile,JSON.stringify(oldDecision));
 await wait(()=>events.filter(e=>e.type==='needs_user').length===2);
 // Replay a delayed copy of the first operation's saved decision.
 await fs.writeFile(decisionFile,JSON.stringify(oldDecision));
 const second=events.filter(e=>e.type==='needs_user')[1];
 assert.equal(first.blockedOn.requestId,second.blockedOn.requestId);
 assert.notEqual(first.blockedOn.decisionId,second.blockedOn.decisionId);
 await new Promise(r=>setTimeout(r,650));
 const afterReplay=(await fs.readFile(logFile,'utf8')).trim().split('\n').map(JSON.parse);
 assert.equal(afterReplay.length,1,'stale nonce must not authorize second operation');
 console.log(JSON.stringify({case:'same-rpc-id-stale-nonce',rpcRequestId:100,occurrenceChanged:true,responsesAfterOldNonce:afterReplay.length,secondAuthorized:false}));
 await fs.writeFile(decisionFile,JSON.stringify({grant:'reject',requestId:100,decisionId:second.blockedOn.decisionId}));
 const outcome=await result;
 assert.equal(outcome.status,'ready');
 const allResponses=(await fs.readFile(logFile,'utf8')).trim().split('\n').map(JSON.parse);
 assert.deepEqual(allResponses.map(r=>r.response.outcome.optionId),['allow','reject']);
 console.log(JSON.stringify({case:'sequential-request-id-reuse',permissionTools:events.filter(e=>e.type==='needs_user').map(e=>e.blockedOn.tool),sameRequestId:events.filter(e=>e.type==='needs_user').every(e=>e.blockedOn.requestId===100),outcome:outcome.status,responses:(await fs.readFile(logFile,'utf8')).trim().split('\n').map(JSON.parse),base}));
}finally{provider.cancel();}
