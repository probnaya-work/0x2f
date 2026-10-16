// Optional local telemetry. Session totals are cumulative within one CLI
// invocation, including repeated cached context. Never sum total + last usage.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
export function parseCodexSessionUsage(text,{sessionId,cwd,complete=false,source='session.jsonl'}={}) {
  let identity=false,model=null;const events=[],lines=[];
  for(const [index,line] of text.split('\n').entries()){
    let e;try{e=JSON.parse(line);}catch{continue;}const p=e.payload??{};
    if(e.type==='session_meta')identity=(p.id??p.session_id)===sessionId&&p.cwd===cwd;
    if(e.type==='turn_context'&&typeof p.model==='string')model=p.model;
    if(e.type==='event_msg'&&p.type==='token_count'&&p.info?.total_token_usage){events.push({id:createHash('sha256').update(JSON.stringify(p.info.total_token_usage)).digest('hex'),usage:p.info.total_token_usage});lines.push(index+1);}
  }
  if(!identity)return null;
  return {semantics:'session-cumulative',counterScope:'session',counterId:sessionId,complete,model,events,source:'codex.session.total_token_usage',sources:[{path:source,sha256:createHash('sha256').update(text).digest('hex'),lines}]};
}
export async function readCodexSessionUsage({root,sessionId,cwd,complete}) {
  if(!/^[a-f0-9-]{36}$/.test(sessionId??''))return null;
  let visited=0,found;
  async function walk(dir,depth=0){if(depth>5||found)return;for(const e of await fs.readdir(dir,{withFileTypes:true})){if(++visited>10000)throw new Error('Telemetry search bound reached.');const file=path.join(dir,e.name);if(e.isDirectory())await walk(file,depth+1);else if(e.isFile()&&e.name.endsWith(sessionId+'.jsonl')){const stat=await fs.stat(file);if(stat.size>8000000)throw new Error('Telemetry too large.');found={file,text:await fs.readFile(file,'utf8')};return;}}}
  try {await walk(path.join(root,'sessions'));return found?parseCodexSessionUsage(found.text,{sessionId,cwd,complete,source:found.file}):null;}catch{return null;}
}
