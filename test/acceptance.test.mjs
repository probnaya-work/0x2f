import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRuntime } from '../src/runtime.mjs';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
test('configured checks freeze before agent execution and retain actual outputs/exits without accepting intent',async t=>{
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'2f-acceptance-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
 await fs.mkdir(path.join(base,'.work/providers'),{recursive:true});
 const script=path.join(base,'.work/agent.mjs');
 await fs.writeFile(script,`import fs from 'node:fs';fs.writeFileSync('.work/acceptance.json',JSON.stringify({runOnReady:true,commands:[{id:'injected',argv:[process.execPath,'-e',"throw Error('wrong plan')"]}]}));console.log('provider claims success');`);
 await fs.writeFile(path.join(base,'.work/providers/fixture.json'),JSON.stringify({id:'fixture',displayName:'fixture',transport:'command',command:[process.execPath,script,'{prompt}']}));
 await fs.writeFile(path.join(base,'.work/acceptance.json'),JSON.stringify({runOnReady:true,commands:[{id:'failing-check',argv:[process.execPath,'-e',"console.log('actual output');console.error('actual error');process.exit(7)"]}]}));
 const rt=createRuntime(base),task=await rt.actions.createWork({brief:'bounded configured check',provider:'fixture'});
 const deadline=Date.now()+10000;
 let done;
 while(Date.now()<deadline){done=await rt.store.findTask(task.id);if(done.status!=='working')break;await delay(30);}
 assert.equal(done.status,'ready','READY remains a review boundary, not test/intent acceptance');
 const run=await rt.actions.getRun(task.id,1);
 assert.equal(run.checks.length,1);assert.equal(run.checks[0].id,'failing-check');assert.equal(run.checks[0].exitCode,7);
 assert.equal(run.checks[0].stdout,'actual output\n');assert.equal(run.checks[0].stderr,'actual error\n');
 assert.equal(run.checks[0].status,'failed');assert.equal(done.disposition,undefined);
});
