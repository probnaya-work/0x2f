import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {EventEmitter} from 'node:events';
const root=process.env.QUALIFICATION_ROOT ?? process.cwd();
const {createStore}=await import(root+'/src/core/store.mjs');
const {createLocalNode}=await import(root+'/src/nodes/local.mjs');
const scratch=await fs.mkdtemp(path.join(os.tmpdir(),'qualify-product-'));
const cli=root+'/src/cli.mjs';
const env={...process.env,CLAUDE_BIN:'/missing/claude',CODEX_BIN:'/missing/codex',DSH_BIN:'/missing/dsh',GEMINI_BIN:'/missing/gemini'};
async function run(args,cwd,extra={}) { return await new Promise((resolve,reject)=> { const c=spawn(process.execPath,[cli,...args],{cwd,env:{...env,...extra},stdio:['ignore','pipe','pipe']});let out='',err='';c.stdout.on('data',x=>out+=x);c.stderr.on('data',x=>err+=x);c.on('error',reject);c.on('close',code=>resolve({code,out,err})); }); }
await fs.writeFile(scratch+'/fake.mjs',"console.log('## Result\\nlocal fixture completed\\n## Needs human decision\\nREQUIRED: no');\n");
for (const same of [false,true]) {
 const workspace=scratch+(same?'/same':'/distinct');await fs.mkdir(workspace);await run(['init'],workspace);
 await fs.writeFile(workspace+'/.work/providers/fake.json',JSON.stringify({id:'fake',transport:'command',displayName:'Fake',command:[process.execPath,scratch+'/fake.mjs','{prompt}']}));
 const n=20;const results=await Promise.all(Array.from({length:n},(_,i)=>run(['new',same?'Same task fixture':'Distinct task '+i,'--provider','fake'],workspace)));
 await new Promise(r=>setTimeout(r,1800));
 const tasks=await createStore(workspace).listTasks();
 console.log(JSON.stringify({scenario:same?'same brief':'distinct briefs',workspace,invocations:n,successful:results.filter(r=>r.code===0).length,persisted:tasks.length,ids:tasks.map(t=>t.id),slugs:tasks.map(t=>t.slug),stderr:results.filter(r=>r.err).map(r=>r.err)}));
}
const fds=[];const node=createLocalNode({workspace:scratch,spawn:(exe,args,opts)=>{fds.push(opts.stdio[1]);const child=Object.assign(new EventEmitter(),{pid:12345,unref(){}});queueMicrotask(()=>child.emit('spawn'));return child}});
for(let i=0;i<64;i++) await node.startExecution({task:{slug:'fd-test',execution:{workspace:'local'}}});
console.log(JSON.stringify({fdLeak:{launches:64,openParentDescriptors:fds.filter(fd=>{try {fsSync.fstatSync(fd);return true;}catch{return false;}}).length}}));
for(const fd of fds){try{fsSync.closeSync(fd);}catch{}}
console.log(JSON.stringify({scratch}));
