import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { ensureRuntime } from '/Users/bogart/Dev/PROBNAYA/work-cli-qualification-20261101/src/ui.mjs';
const base=await fs.mkdtemp(path.join(os.tmpdir(),'qualification-ui-error-'));
try {
 await ensureRuntime({base,waitMs:50,intervalMs:5,probe:async()=>({ok:false,kind:'down'}),spawnImpl(){
  const child=new EventEmitter();child.unref=()=>{};
  queueMicrotask(()=>child.emit('error',Object.assign(new Error('controlled local spawn EAGAIN'),{code:'EAGAIN'})));
  return child;
 }});
} catch(error) {
 console.log(JSON.stringify({caughtByEnsureRuntime:true,name:error.name,message:error.message}));
} finally {await fs.rm(base,{recursive:true,force:true});}
