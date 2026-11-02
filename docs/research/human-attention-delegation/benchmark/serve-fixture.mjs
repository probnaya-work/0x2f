// Disposable loopback-only Web audit. Never run against a real project.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(here,'../../../../');
const {initProject}=await import(path.join(repo,'src/project.mjs'));
const {createRuntime}=await import(path.join(repo,'src/runtime.mjs'));
const {startServer}=await import(path.join(repo,'src/server.mjs'));
const base=await fs.mkdtemp(path.join(os.tmpdir(),'0x2f-web-attention-'));
await initProject(base);
for (const id of ['fixture-a','fixture-b']) await fs.writeFile(path.join(base,'.work/providers',id+'.json'),JSON.stringify({id,displayName:id,transport:'command',command:[process.execPath,path.join(here,'fixture-agent.mjs'),'{prompt}']}));
await fs.writeFile(path.join(base,'.work/routing.json'),JSON.stringify({default:'fixture-a'}));
await fs.writeFile(path.join(base,'scenario.json'),JSON.stringify({kind:'small'}));
const runtime=createRuntime(base);
for (const kind of ['small','partial','decision','failure']) {
  await fs.writeFile(path.join(base,'scenario.json'),JSON.stringify({kind}));
  const task=await runtime.actions.createWork({brief:`${kind.toUpperCase()}: Bound clamp to [0, 10]. Verify negative inputs. Preserve the public API. This is a disposable research fixture.`,provider:'fixture-a'});
  for(let i=0;i<200;i++) { const t=await runtime.actions.getWork(task.id); if(t.status!=='working') break; await new Promise(r=>setTimeout(r,25)); }
}
// No native harness may run. Expose only the two fixture providers to the UI.
runtime.providers.listProviders=()=>['fixture-a','fixture-b'].map(id=>runtime.providers.getProvider(id));
const server=await startServer(base,0,{runtime});
console.log(JSON.stringify({base,port:server.port,url:`http://127.0.0.1:${server.port}`}));
process.on('SIGTERM',async()=>{await server.close();await fs.rm(base,{recursive:true,force:true});process.exit(0);});
