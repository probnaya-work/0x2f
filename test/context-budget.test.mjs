import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createRuntime } from '../src/runtime.mjs';
import { compileContinuation, digest } from '../src/core/context.mjs';
async function fixture(t) {
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'2f-budget-'));
 t.after(()=>fs.rm(base,{recursive:true,force:true}));
 const rt=createRuntime(base,{node:{id:'fixture',async startExecution(){return null;}}});
 return rt;
}
test('history is bounded, notes retain code formatting, original input and hashed full artifacts remain',async t=>{
 const rt=await fixture(t);
 const task=await rt.actions.createWork({brief:'Retain original intent'});
 const notes=[{at:'now',kind:'constraint',text:'Never deploy.\n\n```js\n  keepIndent();\n```'}];
 const runs=[];
 for(let n=1;n<=30;n++) {
  runs.push({run:n,provider:'fixture',outcome:n===2?'failed':'ready',error:n===2?'early critical failure':undefined});
  await rt.store.writeText(path.join(rt.store.taskDir(task.slug),'runs',String(n),'result.md'),`## Result\n${'evidence '.repeat(1500)}\n## Verification\ncheck-${n}\n## Unverified requirements\nrequirement-${n}`);
 }
 runs.push({run:31,provider:'fixture',outcome:'working'});
 await rt.store.writeJson(path.join(rt.base,'.work/context.json'),{maxChars:16000});
 const current={...task,runs,context:{notes}};
 const original=await rt.store.readText(path.join(rt.store.taskDir(task.slug),'prompt.md'));
 const prompt=await compileContinuation({task:current,base:rt.base,store:rt.store,originalPrompt:original});
 assert.ok(prompt.length<=16000);
 assert.ok(prompt.startsWith(original));
 assert.ok(prompt.includes(notes[0].text));
 assert.match(prompt,/early critical failure/);
 const receipt=await rt.store.readJson(path.join(rt.store.taskDir(task.slug),'runs/31/context.json'));
 assert.equal(receipt.sha256,digest(prompt));
 assert.ok(receipt.artifacts.some(a=>a.delivery!=='full'));
 assert.equal(receipt.artifacts.length,30);
 for(const ref of receipt.artifacts) assert.equal(digest(await fs.readFile(ref.artifact,'utf8')),ref.sha256);
});
test('binding constraints exceeding budget refuse without launching or changing original artifacts',async t=>{
 const rt=await fixture(t), task=await rt.actions.createWork({brief:'Keep intent'});
 await rt.store.updateTask({...task,status:'ready',runs:[{...task.runs[0],outcome:'ready'}]});
 await rt.store.writeJson(path.join(rt.base,'.work/context.json'),{maxChars:16000});
 for(let n=0;n<6;n++) await rt.actions.noteWork(task.id,{note:'constraint-'+n+' '+ 'x'.repeat(3000)});
 const original=await rt.store.readText(path.join(rt.store.taskDir(task.slug),'prompt.md'));
 await assert.rejects(()=>rt.actions.rerunWork(task.id),/exceed.*context budget/);
 assert.equal((await rt.store.findTask(task.id)).context.notes.length,6);
 assert.equal(await rt.store.readText(path.join(rt.store.taskDir(task.slug),'prompt.md')),original);
});
test('current rules are versioned on continuation and Verification is included once',async t=>{
 const rt=await fixture(t), task=await rt.actions.createWork({brief:'Rules change'});
 await rt.store.writeText(path.join(rt.base,'.work/rules.md'),'new rule: stay offline');
 await rt.store.writeText(path.join(rt.store.taskDir(task.slug),'runs/1/result.md'),'## Result\ndone\n## Verification\nunique-check-marker');
 await rt.store.updateTask({...task,status:'ready',runs:[{...task.runs[0],outcome:'ready'}]});
 const rerun=await rt.actions.rerunWork(task.id);
 const input=await rt.store.readRunPrompt(rerun,2);
 assert.match(input,/new rule: stay offline/);
 assert.equal(input.split('unique-check-marker').length-1,1);
 const details=await rt.actions.getRun(task.id,2);
 assert.ok(details.context.projectVersion);
 assert.equal(details.input.sha256,digest(input));
});
