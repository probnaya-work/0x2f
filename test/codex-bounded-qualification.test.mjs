// Negative qualification of the installed CLI, using only a loopback model.
// These passing tests prove a missing boundary, never foreground eligibility.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {executableAvailable} from '../src/providers/index.mjs';
import {startCodexResponsesMock,messageStream,commandExecutionStream} from './fixtures/codex-responses-mock.mjs';

const disabled=['shell_tool','multi_agent','multi_agent_v2','plugins','skill_search','tool_suggest','image_generation','in_app_browser','workspace_dependencies','shell_snapshot','view_image','goals','apps','browser_use','browser_use_external','computer_use','code_mode_host','enable_request_compression'];
const sha=value=>createHash('sha256').update(value).digest('hex');
function call(name,args,index=0) {
  const argumentsText=JSON.stringify(args);
  return {events:commandExecutionStream({command:'unused',responseId:`resp_${index}`}).map(e=>{
    const data=structuredClone(e.data);
    function visit(value){
      if(!value||typeof value!=='object')return;
      if(value.type==='function_call'){value.name=name;value.arguments=value.status==='in_progress'?'':argumentsText;value.call_id=`call_${index}`;}
      if(value.id==='fc_tool')value.id=`fc_${index}`;
      if(value.item_id==='fc_tool')value.item_id=`fc_${index}`;
      for(const nested of Object.values(value))if(typeof nested==='object')visit(nested);
    }
    visit(data);
    if(e.event==='response.function_call_arguments.delta')data.delta=argumentsText;
    if(e.event==='response.function_call_arguments.done')data.arguments=argumentsText;
    return {event:e.event,data};
  })};
}

async function probe(t,{model='gpt-5.6-sol',steps}) {
  const binary=process.env.CODEX_BIN??'codex';
  if(!executableAvailable(binary,process.env)){t.skip('Codex unavailable: no native qualification');return null;}
  const version=execFileSync(binary,['--version'],{encoding:'utf8',timeout:5000}).trim();
  if(version!=='codex-cli 0.149.1'){t.skip(`Negative qualification is pinned to 0.149.1; found ${version}`);return null;}
  const root=await fs.mkdtemp('/private/tmp/0x2f-bounded-qualification-');
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const hook=path.join(root,'hook.py'),audit=path.join(root,'hook.jsonl'),sentinel=path.join(root,'TEST_COMMAND_EXECUTED');
  await fs.writeFile(hook,`import sys,json\ne=json.load(sys.stdin)\nwith open(${JSON.stringify(audit)},'a') as f:f.write(json.dumps(e)+'\\n')\nprint(json.dumps({'hookSpecificOutput':{'hookEventName':'PreToolUse','permissionDecision':'deny','permissionDecisionReason':'bounded fixture denial'}}))\n`);
  const mock=await startCodexResponsesMock([...steps({sentinel}),{events:messageStream('Fixture completed without a real model.')}]);
  t.after(()=>mock.close());
  const args=['exec','--ignore-user-config','--json','--skip-git-repo-check','--sandbox','read-only',...disabled.flatMap(f=>['--disable',f]),
    // Only the disposable test hook is trusted here. No production proposal.
    '--dangerously-bypass-hook-trust','-c',`hooks.PreToolUse=[{matcher=".*",hooks=[{type="command",command="/usr/bin/python3 ${hook}"}]}]`,
    '-c','tools.view_image=false','-c','web_search="disabled"','-c','analytics.enabled=false',
    '-c','model_provider="mock"','-c','model_providers.mock.name="Mock"','-c',`model_providers.mock.base_url="${mock.url}/v1"`,'-c','model_providers.mock.wire_api="responses"',
    '-m',model,'Return a short result; tests belong to the controller.'];
  const env={...process.env,CODEX_HOME:root};
  for(const key of ['OPENAI_API_KEY','OPENAI_BASE_URL','CODEX_API_KEY','CODEX_ACCESS_TOKEN'])delete env[key];
  const child=spawn(binary,args,{cwd:root,env,detached:true,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
  const timer=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}},15000);
  const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);}).finally(()=>clearTimeout(timer));
  assert.equal(code,0,stderr.slice(-1000));
  const requests=mock.requests.filter(r=>r.method==='POST'&&r.url.startsWith('/v1/responses'));
  assert.ok(requests.every(r=>r.body),'Mock request compression must remain disabled for inspection');
  const hooks=(await fs.readFile(audit,'utf8').catch(e=>{if(e.code==='ENOENT')return '';throw e;})).trim().split('\n').filter(Boolean).map(JSON.parse);
  const events=stdout.trim().split('\n').filter(Boolean).map(JSON.parse);
  const outputs=requests.at(-1).body.input.filter(i=>i.type==='function_call_output');
  const evidence={version,model,modelSource:'explicit fixture model; no entitlement/economic qualification',disabledFeatures:disabled,
    mockModelRequests:requests.length,hookTools:hooks.map(h=>h.tool_name),returnedToolPayloads:outputs.map(o=>({bytes:Buffer.byteLength(o.output),sha256:sha(o.output),prefix:o.output.slice(0,70)})),
    jsonlItemTypes:events.filter(e=>e.item).map(e=>e.item.type),jsonlEventTypes:events.map(e=>e.type),
    commandExecuted:await fs.access(sentinel).then(()=>true,()=>false),foregroundEligible:false,liveProviderCalls:0};
  if(process.env.OX2F_BOUNDED_EVIDENCE){await fs.mkdir(process.env.OX2F_BOUNDED_EVIDENCE,{recursive:true});await fs.writeFile(path.join(process.env.OX2F_BOUNDED_EVIDENCE,t.name.replace(/[^a-z0-9]+/gi,'-')+'.json'),JSON.stringify(evidence,null,2)+'\n');}
  return {requests,hooks,events,outputs,evidence};
}

test('bounded qualification: disabled shell rejects model test command before execution',async t=>{
  const p=await probe(t,{steps:({sentinel})=>[call('exec_command',{cmd:`/usr/bin/touch ${sentinel}`})]});if(!p)return;
  assert.equal(p.evidence.commandExecuted,false);assert.equal(p.requests.length,2);assert.equal(p.hooks.length,0);
  assert.match(p.outputs[0].output,/unsupported call: exec_command/);
  assert.ok(!p.events.some(e=>e.item?.type==='command_execution'));
});
test('bounded qualification: positive control hook denies a registered tool',async t=>{
  const p=await probe(t,{model:'gpt-5.1-codex',steps:()=>[call('update_plan',{plan:[]})]});if(!p)return;
  assert.equal(p.hooks.length,1);assert.equal(p.hooks[0].tool_name,'update_plan');assert.match(p.outputs[0].output,/bounded fixture denial/);
});
test('bounded qualification: seven unsupported tool turns bypass hook and JSONL action accounting',async t=>{
  const p=await probe(t,{steps:()=>Array.from({length:7},(_,i)=>call('unknown_tool_'+i,{},i))});if(!p)return;
  assert.equal(p.requests.length,8);assert.equal(p.hooks.length,0);assert.equal(p.outputs.length,7);
  assert.ok(!p.events.some(e=>e.item?.type==='command_execution'||e.type==='tool.started'));
  assert.equal(p.evidence.foregroundEligible,false);
});
test('bounded qualification: unsupported tool output exceeds 24 KiB before controller can intercept',async t=>{
  const p=await probe(t,{steps:()=>[call('unknown_'+'x'.repeat(26000),{})]});if(!p)return;
  assert.equal(p.hooks.length,0);assert.equal(p.requests.length,2);assert.equal(Buffer.byteLength(p.outputs[0].output),26026);
  assert.ok(Buffer.byteLength(p.outputs[0].output)>24*1024);assert.equal(p.evidence.foregroundEligible,false);
});
