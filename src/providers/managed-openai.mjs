// One small-task Responses lane. No SDK retries, hosted tools or OAuth access.
import {rejectCredentialValues} from '../core/workflow-credentials.mjs';
export const MANAGED_LIMITS=Object.freeze({attempts:1,packetBytes:8192,files:4,sourceBytes:65536,reads:4,patches:1,tools:6,toolResultBytes:24576,readResultBytes:4096,serializedInputBytes:32768,inferenceRequests:2,countRequests:2,responsesRequests:4,inputTokens:8192,inputTokensPerRequest:4096,outputTokens:4096,outputTokensPerRequest:2048,deadlineMs:120000,costUsd:0.25});
export const MANAGED_FOREGROUND_INFERENCE_MAX_USD=0.024576;
export const MANAGED_MODELS=Object.freeze([Object.freeze({id:'gpt-5.4-mini-2026-03-17',capabilities:['responses','function-calling','small-code-patch'],reasoningEffort:'none',price:{currency:'USD',perMillion:{input:0.75,cachedInput:0.075,output:4.5},observedAt:'2026-10-16T15:54:35Z',source:'https://developers.openai.com/api/docs/models/gpt-5.4-mini',apiPricingSource:'https://developers.openai.com/api/docs/pricing',controlRequestPolicy:'unpriced_control_request'},capabilitySource:'https://developers.openai.com/api/docs/models/gpt-5.4-mini'})]);
export class ManagedStop extends Error {constructor(code){super(code);this.code=code;}}
export const fail=code=>{throw new ManagedStop(code);};
export function managedGuard(key) {
  return value=>{try{return rejectCredentialValues(value,key?[key,Buffer.from(key).toString('base64'),encodeURIComponent(key)]:[]);}catch{fail('managed_credential_guard');}};
}
export function managedCost(model,limits=MANAGED_LIMITS) {
  const p=model.price?.perMillion;
  if(!p||model.price.currency!=='USD'||['input','cachedInput','output'].some(k=>!Number.isFinite(p[k])||p[k]<0))fail('managed_pricing_unproven');
  return {currency:'USD',inferenceUpperUsd:(limits.inputTokens*Math.max(p.input,p.cachedInput)+limits.outputTokens*p.output)/1e6,totalUpperUsd:null,controlRequests:{classification:model.price.controlRequestPolicy,maximum:limits.countRequests+1,tokenCountMaximum:limits.countRequests,availabilityMaximum:1,separatePublishedFee:false,contractualZeroFee:false,includedInInferenceMaximum:false},inputTokens:limits.inputTokens,outputTokens:limits.outputTokens,totalInferenceTokens:limits.inputTokens+limits.outputTokens,pricing:model.price};
}
// A trusted foreground caller supplies the explicit canary decision; workspace
// configuration and API-key presence cannot grant it. No unattended exception.
export function managedForegroundPricing(predicted,{mode='unattended',foregroundCanary=false}={}) {
  if(mode!=='foreground')fail('managed_unattended_unqualified');
  if(foregroundCanary!==true)fail('managed_foreground_canary_required');
  if(predicted.controlRequests?.classification!=='unpriced_control_request')fail('managed_pricing_unproven');
  if(!Number.isFinite(predicted.inferenceUpperUsd)||predicted.inferenceUpperUsd>MANAGED_FOREGROUND_INFERENCE_MAX_USD)fail('managed_cost_limit');
  return {version:'managed-foreground-pricing-v2',mode,foregroundCanary:true,publishedBillableInferenceMaximumUsd:predicted.inferenceUpperUsd,controlRequests:predicted.controlRequests,totalBilledAmount:'unknown',retry:false,opaqueFallback:false};
}
export function selectManagedModel(limits=MANAGED_LIMITS,registry=MANAGED_MODELS) {
  const ranked=registry.filter(m=>m.capabilities.includes('function-calling')&&m.capabilities.includes('small-code-patch')).map(model=>({model,predicted:managedCost(model,limits)})).sort((a,b)=>a.predicted.inferenceUpperUsd-b.predicted.inferenceUpperUsd);
  if(!ranked.length)fail('managed_model_unqualified');
  if(ranked[0].predicted.inferenceUpperUsd>limits.costUsd)fail('managed_cost_limit');
  return ranked[0];
}
export const managedTools=[
  {type:'function',name:'read_task_file',description:'Read only an approved logical file ID. No paths or commands.',strict:true,parameters:{type:'object',properties:{file_id:{type:'string'}},required:['file_id'],additionalProperties:false}},
  {type:'function',name:'submit_patch',description:'Submit one scoped replacement patch, then stop. Each old_text must match exactly once.',strict:true,parameters:{type:'object',properties:{edits:{type:'array',items:{type:'object',properties:{file_id:{type:'string'},old_text:{type:'string'},new_text:{type:'string'}},required:['file_id','old_text','new_text'],additionalProperties:false}}},required:['edits'],additionalProperties:false}},
  {type:'function',name:'request_context_expansion',description:'Stop for a user decision. No automatic context expansion or retry.',strict:true,parameters:{type:'object',properties:{reason:{type:'string'}},required:['reason'],additionalProperties:false}}
];
export const managedInstructions='Make only the requested small patch using the approved logical file IDs. Read necessary files in parallel, then submit_patch. At most two inference responses. Never request shell, tests, network, Git or delivery. Deterministic verification belongs to 0x2F. If context is insufficient, request_context_expansion. Return a short result.';

// Test seam is fetch, not a user-configurable API endpoint/provider gateway.
export function managedTransport(key,{fetchImpl=fetch}={}) {
  const guard=managedGuard(key);
  async function call(kind,body,signal,model) {
    guard(body);const endpoint=kind==='model'?`models/${encodeURIComponent(model)}`:kind==='count'?'responses/input_tokens':'responses';
    let response;
    try{response=await fetchImpl('https://api.openai.com/v1/'+endpoint,{method:kind==='model'?'GET':'POST',redirect:'error',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},...(kind==='model'?{}:{body:JSON.stringify(body)}),signal});}
    catch{fail('managed_provider_uncertain');}
    if(!response.ok)fail('managed_provider_failure');
    let size=0,parts=[];
    try{for await(const chunk of response.body){size+=chunk.length;if(size>262144){await response.body.cancel?.().catch(()=>{});fail('managed_response_size');}parts.push(Buffer.from(chunk));}}
    catch(e){if(e instanceof ManagedStop)throw e;fail('managed_provider_uncertain');}
    const text=Buffer.concat(parts).toString();guard(text);
    try{return guard(JSON.parse(text));}catch(e){if(e instanceof ManagedStop)throw e;fail('managed_response_malformed');}
  }
  return {call,live:true};
}

// Validate the complete batch BEFORE any tool effect or synthesized result.
export function managedCalls(response,state,manifest) {
  if(response.status!=='completed'||!Array.isArray(response.output))fail('managed_response_incomplete');
  const calls=[],ids=new Set(state.callIds);
  for(const item of response.output){
    if(item?.type==='message'){
      if(item.role!=='assistant'||!Array.isArray(item.content)||item.content.some(c=>c.type!=='output_text'||typeof c.text!=='string'))fail('managed_unexpected_item');continue;
    }
    if(item?.type==='reasoning'){if(!Array.isArray(item.summary)||item.summary.some(s=>s.type!=='summary_text'||typeof s.text!=='string'))fail('managed_unexpected_item');continue;}
    if(item?.type!=='function_call'||!managedTools.some(t=>t.name===item.name))fail('managed_unknown_tool_or_item');
    if(typeof item.call_id!=='string'||!item.call_id||ids.has(item.call_id)||typeof item.arguments!=='string')fail('managed_duplicate_or_malformed_call');ids.add(item.call_id);
    let args;try{args=JSON.parse(item.arguments);}catch{fail('managed_malformed_arguments');}
    if(!args||typeof args!=='object'||Array.isArray(args))fail('managed_malformed_arguments');
    const keys=Object.keys(args).sort().join(',');
    if(item.name==='read_task_file'&&(keys!=='file_id'||!manifest.some(f=>f.id===args.file_id)))fail('managed_file_id');
    if(item.name==='submit_patch'){
      if(keys!=='edits'||!Array.isArray(args.edits)||!args.edits.length||args.edits.length>4)fail('managed_malformed_patch');
      const files=new Set();for(const edit of args.edits){if(!edit||Object.keys(edit).sort().join(',')!=='file_id,new_text,old_text'||typeof edit.old_text!=='string'||!edit.old_text||typeof edit.new_text!=='string'||!manifest.some(f=>f.id===edit.file_id&&f.writable)||files.has(edit.file_id))fail('managed_patch_scope');files.add(edit.file_id);}
    }
    if(item.name==='request_context_expansion'&&(keys!=='reason'||typeof args.reason!=='string'||args.reason.length>1024))fail('managed_malformed_arguments');
    calls.push({item,args});
  }
  if(state.tools+calls.length>state.limits.tools)fail('managed_tool_limit');
  if(state.reads+calls.filter(c=>c.item.name==='read_task_file').length>state.limits.reads)fail('managed_read_limit');
  if(state.patches+calls.filter(c=>c.item.name==='submit_patch').length>state.limits.patches)fail('managed_patch_limit');
  return calls;
}
