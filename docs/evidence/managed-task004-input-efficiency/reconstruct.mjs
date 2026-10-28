// Read-only audit of retained native Task 004; never constructs/runs a transport.
// Run from any cwd: node docs/evidence/managed-task004-input-efficiency/reconstruct.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {managedModelContext,managedWireInput} from '../../../src/core/engineering-managed.mjs';
import {managedInstructions,managedTools} from '../../../src/providers/managed-openai.mjs';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const dir='.work/tasks/004-after-creating-a-task-print-one-concise-next-act/runs/1/managed/';
const refs={},bytes=v=>Buffer.byteLength(JSON.stringify(v));
const load=name=>{const raw=fs.readFileSync(root+dir+name);refs[dir+name]=createHash('sha256').update(raw).digest('hex');return JSON.parse(raw);};
const first=load('request-2-intent.json').body,second=load('request-4-intent.json').body,third=structuredClone(second),packet=load('attempt.json').packet;
third.instructions=third.instructions.replace('3 turns, 4 tools','2 turns, 3 tools');
third.input.push(...load('request-5-receipt.json').response.output,load('tool-3-receipt.json').result);
function breakdown(prompt){
 const work=structuredClone(prompt),parts={};
 const delta=(name,fn)=>{const n=bytes(work);fn();parts[name]=(parts[name]??0)+n-bytes(work);};
 delta('runtimeInstructions',()=>{work.instructions='';});delta('toolSchemas',()=>{work.tools=[];});
 for(let i=0;i<work.input.length;i++){
  const item=work.input[i];
  if(item.role==='user'){
   const data=JSON.parse(item.content);
   for(const key of ['brief','constraints','instructions','files'])delta('packet_'+key,()=>{data[key]=typeof data[key]==='string'?'':[];item.content=JSON.stringify(data);});
  }else{
   if(item.type==='function_call_output'){
    const data=JSON.parse(item.output);
    if(typeof data.content==='string')delta('sourceContent',()=>{data.content='';item.output=JSON.stringify(data);});
    else if(Array.isArray(data.matches))delta('searchExcerpts',()=>{data.matches=[];item.output=JSON.stringify(data);});
   }else if(item.type==='function_call')delta('toolCallArguments',()=>{item.arguments='';});
   delta(item.type==='function_call'?'assistantCallMetadata':'toolResultMetadata',()=>{work.input[i]={};});
  }
 }
 parts.framing=bytes(work);assert.equal(Object.values(parts).reduce((a,b)=>a+b,0),bytes(prompt));return parts;
}
let oldTotal=0,newTotal=0;
const rows=[first,second,third].map((prompt,i)=>{
 const oldBody=i<2?load(`request-${i*2+3}-intent.json`).body:{...prompt,store:false,max_output_tokens:2048,reasoning:{effort:'none'},service_tier:'default'};
 assert.equal(bytes(oldBody)-bytes(prompt),94);
 oldTotal+=bytes(prompt)+bytes(oldBody);
 const compact=structuredClone(prompt);compact.instructions=managedInstructions+prompt.instructions.slice(prompt.instructions.indexOf(' Left:'));compact.tools=managedTools;
 compact.input[0].content=managedModelContext(packet);compact.input=managedWireInput(compact.input);
 const body={...compact,store:false,max_output_tokens:2048,reasoning:{effort:'none'},service_tier:'default'};
 newTotal+=bytes(compact)+bytes(body);
 return {turn:i+1,original:{count:bytes(prompt),inference:bytes(oldBody),cumulative:oldTotal,countParts:breakdown(prompt)},compactSameSequence:{count:bytes(compact),inference:bytes(body),cumulative:newTotal},projectedNotDispatched:i===2};
});
assert.deepEqual(rows.map(r=>r.original.cumulative),[9324,29212,49848]);
const sourceBytes=[1,2].map(i=>Buffer.byteLength(JSON.parse(load(`tool-${i}-receipt.json`).result.output).content));
console.log(JSON.stringify({kind:'read-only native evidence reconstruction; no Task replay or API requests',accounting:'UTF-8 JSON.stringify bytes, count AND inference; GET has no body and is excluded',rows,decodedReadSourceBytes:sourceBytes,liveResultBytes:[1686,3108,140],sameBadSequenceStillBlocked:rows[2].compactSameSequence.cumulative>32768,refs},null,2));
