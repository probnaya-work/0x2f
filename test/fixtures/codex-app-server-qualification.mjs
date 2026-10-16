// Test-only stdio peer. It is deliberately not an execution provider.
import fs from 'node:fs/promises';
import readline from 'node:readline';
import {spawn,execFileSync} from 'node:child_process';
import {executableAvailable} from '../../src/providers/index.mjs';
import {startCodexResponsesMock,messageStream,commandExecutionStream} from './codex-responses-mock.mjs';

export function toolStep(name,args,index=0,usage) {
  const text=JSON.stringify(args);
  const events=commandExecutionStream({command:'unused',responseId:`resp_${index}`}).map(e=>{
    const data=structuredClone(e.data);
    function visit(v){if(!v||typeof v!=='object')return;if(v.type==='function_call'){v.name=name;v.arguments=v.status==='in_progress'?'':text;v.call_id=`call_${index}`;}if(v.id==='fc_tool')v.id=`fc_${index}`;if(v.item_id==='fc_tool')v.item_id=`fc_${index}`;for(const x of Object.values(v))if(typeof x==='object')visit(x);}
    visit(data);if(e.event==='response.function_call_arguments.delta')data.delta=text;if(e.event==='response.function_call_arguments.done')data.arguments=text;
    return {event:e.event,data};
  });return addUsage({events},usage);
}
export function addUsage(step,total) {
  if(total!==undefined){const e=step.events.find(e=>e.event==='response.completed');e.data.response.usage={input_tokens:total-2,output_tokens:2,total_tokens:total,input_tokens_details:{cached_tokens:3},output_tokens_details:{reasoning_tokens:1}};}
  return step;
}
export const tools=['read_task_file','submit_patch','request_context_expansion'].map(name=>({type:'function',name,description:'Client-owned qualification fixture '+name,inputSchema:{type:'object',properties:{path:{type:'string'}},additionalProperties:true}}));
export const pause=ms=>new Promise(r=>setTimeout(r,ms));

export async function appFixture(t,steps=[],{experimental=true}={}) {
  const binary=process.env.CODEX_BIN??'codex';
  if(!executableAvailable(binary,process.env)){t.skip('Codex unavailable; app-server unqualified');return null;}
  const version=execFileSync(binary,['--version'],{encoding:'utf8',timeout:5000}).trim();
  if(version!=='codex-cli 0.149.1'){t.skip('Requalify app-server version '+version);return null;}
  const root=await fs.mkdtemp('/private/tmp/0x2f-appserver-qualification-');
  const mock=await startCodexResponsesMock([...steps,{events:messageStream('Fixture complete.')}]);
  await fs.writeFile(root+'/config.toml',`model="gpt-5.6-sol"\nmodel_provider="mock"\n[model_providers.mock]\nname="Mock"\nbase_url="${mock.url}/v1"\nwire_api="responses"\n`);
  const flags=['shell_tool','multi_agent','multi_agent_v2','plugins','apps','tool_suggest','skill_search','image_generation','in_app_browser','view_image','goals','browser_use','computer_use','code_mode_host','hooks','enable_request_compression','shell_snapshot','workspace_dependencies'];
  const env={...process.env,CODEX_HOME:root};for(const k of ['OPENAI_API_KEY','OPENAI_BASE_URL','CODEX_API_KEY','CODEX_ACCESS_TOKEN'])delete env[k];
  const sessions=[];
  async function start(){
    const child=spawn(binary,['app-server','--listen','stdio://',...flags.flatMap(f=>['--disable',f]),'-c','web_search="disabled"','-c','analytics.enabled=false'],{cwd:root,env,detached:true,stdio:['pipe','pipe','pipe']});
    const history=[],sent=[],pending=new Map(),waiters=new Set();let next=0,closed=false,stderr='';
    const exited=new Promise(resolve=>child.once('close',code=>{closed=true;for(const p of pending.values())p.reject(new Error('app-server exited'));resolve(code);}));
    child.stderr.on('data',b=>stderr+=b);const lines=readline.createInterface({input:child.stdout});
    const send=message=>{if(closed)throw new Error('Closed app-server');sent.push(message);child.stdin.write(JSON.stringify(message)+'\n');};
    const request=(method,params)=>{const id=++next;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(new Error('RPC timeout: '+method+' '+stderr.slice(-300)));},10000);pending.set(id,{resolve:m=>{clearTimeout(timer);resolve(m);},reject:e=>{clearTimeout(timer);reject(e);}});send({id,method,params});});};
    lines.on('line',line=>{const m=JSON.parse(line);history.push(m);if(!m.method&&pending.has(m.id)){pending.get(m.id).resolve(m);pending.delete(m.id);}for(const w of [...waiters])if(w.test(m)){clearTimeout(w.timer);waiters.delete(w);w.resolve(m);}});
    const wait=test=>{const old=history.find(test);if(old)return Promise.resolve(old);return new Promise((resolve,reject)=>{const w={test,resolve};w.timer=setTimeout(()=>{waiters.delete(w);reject(new Error('Notification timeout '+stderr.slice(-300)));},10000);waiters.add(w);});};
    const kill=async()=>{try{process.kill(-child.pid,'SIGKILL');}catch(e){if(e.code!=='ESRCH')throw e;}await exited;lines.close();for(const w of waiters)clearTimeout(w.timer);};
    const session={child,history,sent,request,wait,send,kill,exited,get stderr(){return stderr;}};sessions.push(session);
    const init=await request('initialize',{clientInfo:{name:'ox2f_qualification',version:'0.1.0'},capabilities:{experimentalApi:experimental}});if(init.error)throw new Error(init.error.message);send({method:'initialized',params:{}});
    return session;
  }
  t.after(async()=>{for(const s of sessions)await s.kill();await mock.close();await fs.rm(root,{recursive:true,force:true});});
  const posts=()=>mock.requests.filter(r=>r.method==='POST'&&r.url.startsWith('/v1/responses'));
  const thread=s=>s.request('thread/start',{cwd:root,model:'gpt-5.6-sol',modelProvider:'mock',sandbox:'read-only',approvalPolicy:'never',...(experimental?{dynamicTools:tools}:{})});
  const turn=(s,threadId)=>s.request('turn/start',{threadId,input:[{type:'text',text:'Use only client-owned tools. No shell, tests or delivery.'}]});
  const reply=(s,call,text,success=true)=>s.send({id:call.id,result:{success,contentItems:[{type:'inputText',text}]}});
  const evidence=async(s,extra={})=>{if(!process.env.OX2F_APPSERVER_EVIDENCE)return;const dir=process.env.OX2F_APPSERVER_EVIDENCE;await fs.mkdir(dir,{recursive:true});const rows=s.history.map(m=>m.method?{method:m.method,...(m.id!==undefined?{request:true}:{}),...(m.params?.item?{itemType:m.params.item.type}:{}),...(m.method==='turn/completed'?{status:m.params.turn.status}:{}),...(m.method==='thread/tokenUsage/updated'?{usage:m.params.tokenUsage}:{})}:{responseId:m.id,...(m.error?{error:m.error}:{})});await fs.writeFile(dir+'/'+t.name.replace(/[^a-z0-9]+/gi,'-')+'.json',JSON.stringify({version,experimental,disabledFeatures:flags,mockModelRequests:posts().length,liveProviderCalls:0,events:rows,...extra},null,2)+'\n');};
  return {root,mock,posts,start,thread,turn,reply,evidence,session:await start()};
}
