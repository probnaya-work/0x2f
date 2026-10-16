import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {deliveryFixture,fixtureGit as git} from './engineering-delivery-fixture.mjs';
import {engineeringWorkspaceStatus,cleanupEngineeringWorkspace} from '../src/core/engineering-workspace.mjs';
const exec=promisify(execFile);
async function propose(f){return f.runtime.actions.proposeCommit(f.task.id,{message:'fix: preserve task id API'});}
const scope=t=>({scopeDigest:t.engineering.delivery.scopeDigest});

test('verified patch acceptance grants nothing; exact preview + permission creates one real local commit and receipt',async t=>{
 const f=await deliveryFixture(t);await f.runtime.actions.closeWork(f.task.id);
 await assert.rejects(f.runtime.actions.executeCommit(f.task.id),/separate exact permission/);
 const p=await propose(f);assert.equal(p.blockedOn.type,'permission');assert.equal(p.engineering.delivery.preview.repository,f.base);
 assert.equal(await git(f.workspace,['rev-parse','HEAD']),f.parent);
 await assert.rejects(f.runtime.actions.allowWork(p.id),/Exact commit preview digest/);
 const done=await f.runtime.actions.allowWork(p.id,scope(p));assert.equal(done.engineering.delivery.state,'committed',done.blockedOn?.text);
 const commit=done.engineering.delivery.commit;assert.equal(await git(f.workspace,['rev-parse','HEAD']),commit);
 assert.equal(await git(f.base,['rev-parse','HEAD']),f.parent);assert.equal(await fs.readFile(path.join(f.base,'src/id.mjs'),'utf8'),'USER DIRTY CONTENT\n');
 assert.equal(await git(f.workspace,['status','--porcelain']),'');assert.equal(await git(f.workspace,['rev-list','--count','HEAD']),'2');
 const receipt=await f.runtime.store.readJson(path.join(f.runtime.store.taskDir(done.slug),done.engineering.delivery.receipt.path));assert.equal(receipt.commit,commit);assert.equal(receipt.parent,f.parent);assert.equal(receipt.diffDigest,p.engineering.delivery.preview.diffDigest);
 assert.equal((await f.runtime.actions.allowWork(p.id,scope(p))).engineering.delivery.commit,commit);
 assert.equal((await f.runtime.actions.closeWork(p.id)).status,'done');assert.equal((await engineeringWorkspaceStatus(f.runtime.store,done)).dirty,false);
 assert.equal((await cleanupEngineeringWorkspace(f.runtime.store,done)).removed,true);
});

test('duplicate concurrent permission execution creates no second commit',async t=>{
 const f=await deliveryFixture(t),p=await propose(f);
 const out=await Promise.all([f.runtime.actions.allowWork(p.id,scope(p)),f.runtime.actions.allowWork(p.id,scope(p))]);
 assert.ok(out.every(x=>x.engineering.delivery.state==='committed'));assert.equal(out[0].engineering.delivery.commit,out[1].engineering.delivery.commit);
 assert.equal(await git(f.workspace,['rev-list','--count','HEAD']),'2');
});

test('revocation preserves verified patch and cannot execute consumed/revoked permission',async t=>{
 const f=await deliveryFixture(t),p=await propose(f);await f.runtime.actions.grantCommit(p.id,scope(p));
 await assert.rejects(f.runtime.actions.closeWork(p.id),/Reject the pending/);
 const denied=await f.runtime.actions.rejectWork(p.id,scope(p));assert.equal(denied.status,'ready');
 await assert.rejects(f.runtime.actions.executeCommit(p.id,scope(p)),/separate exact permission/);
 assert.equal(await git(f.workspace,['rev-parse','HEAD']),f.parent);assert.equal((await f.runtime.actions.getTaskDiff(p.id)).length,1);
});

for(const mode of ['bytes','constraint','hook'])test(`changed ${mode} invalidates exact permission permanently`,async t=>{
 const f=await deliveryFixture(t),p=await propose(f);await f.runtime.actions.grantCommit(p.id,scope(p));
 if(mode==='bytes')await fs.writeFile(f.source,'export const id = 99;\n');
 if(mode==='constraint')await f.runtime.actions.noteWork(p.id,{note:'New constraint.'});
 if(mode==='hook'){await fs.writeFile(path.join(f.hooks,'pre-commit'),'#!/bin/sh\nexit 1\n');await fs.chmod(path.join(f.hooks,'pre-commit'),0o755);}
 await assert.rejects(f.runtime.actions.executeCommit(p.id,scope(p)),/permission invalidated/);
 assert.equal((await f.runtime.store.findTask(p.id)).engineering.delivery.state,'invalidated');
 if(mode==='bytes')await fs.writeFile(f.source,'export const id = 14;\n');
 await assert.rejects(f.runtime.actions.executeCommit(p.id,scope(p)),/separate exact permission/);
 assert.equal(await git(f.workspace,['rev-parse','HEAD']),f.parent);
});

for(const mode of ['fail','bytes','message'])test(`Git hook ${mode} is preserved and cannot commit or replay`,async t=>{
 const f=await deliveryFixture(t),name=mode==='message'?'commit-msg':'pre-commit';
 const body=mode==='fail'?'echo fixture-hook-rejected; exit 1':mode==='bytes'?"echo 'export const id = 99;' > src/id.mjs":"echo changed > \"$1\"";
 await fs.writeFile(path.join(f.hooks,name),'#!/bin/sh\n'+body+'\n');await fs.chmod(path.join(f.hooks,name),0o755);
 const p=await propose(f),done=await f.runtime.actions.allowWork(p.id,scope(p));
 assert.equal(done.engineering.delivery.state,'failed',done.blockedOn?.text);assert.equal(done.engineering.delivery.hooks.length,1);
 if(mode==='fail')assert.match(done.engineering.delivery.hooks[0].output,/fixture-hook-rejected/);
 assert.equal(await git(f.workspace,['rev-parse','HEAD']),f.parent);await assert.rejects(f.runtime.actions.allowWork(p.id,scope(p)),/No pending/);
});

for(const faultAt of ['after-object','after-ref'])test(`uncertain outcome ${faultAt} never repeats effect`,async t=>{
 const prior=process.env.WORKFLOW_TEST_MODE;process.env.WORKFLOW_TEST_MODE='1';t.after(()=>{if(prior===undefined)delete process.env.WORKFLOW_TEST_MODE;else process.env.WORKFLOW_TEST_MODE=prior;});
 const f=await deliveryFixture(t),p=await propose(f);await f.runtime.actions.grantCommit(p.id,scope(p));
 const done=await f.runtime.actions.executeCommit(p.id,{...scope(p),faultAt});assert.equal(done.engineering.delivery.state,'uncertain');
 const head=await git(f.workspace,['rev-parse','HEAD']);assert.equal(head===f.parent,faultAt==='after-object');
 await assert.rejects(f.runtime.actions.executeCommit(p.id,scope(p)),/cannot be replayed/);assert.equal(await git(f.workspace,['rev-parse','HEAD']),head);
});

test('foreign staged bytes and unsupported hooks are never overwritten or executed',async t=>{
 const f=await deliveryFixture(t);await git(f.workspace,['add','src/id.mjs']);
 await assert.rejects(propose(f),/Foreign staged/);assert.equal(await git(f.workspace,['diff','--cached','--name-only']),'src/id.mjs');
 await git(f.workspace,['reset','--','src/id.mjs']);
 await fs.writeFile(path.join(f.hooks,'post-commit'),'#!/bin/sh\nexit 0\n');await fs.chmod(path.join(f.hooks,'post-commit'),0o755);
 await assert.rejects(propose(f),/Unsupported or unsafe/);
});

test('real CLI preview and digest-bound ALLOW perform only the authorized local commit',async t=>{
 const f=await deliveryFixture(t),cli=new URL('../src/cli.mjs',import.meta.url).pathname;
 const p=await exec(process.execPath,[cli,'commit',String(f.task.id),'fix: CLI local delivery'],{cwd:f.base});assert.match(p.stdout,/LOCAL COMMIT PROPOSED/);
 const current=await f.runtime.store.findTask(f.task.id);
 const result=await exec(process.execPath,[cli,'allow',String(f.task.id),'--digest',current.engineering.delivery.scopeDigest],{cwd:f.base});assert.match(result.stdout,/LOCAL COMMIT COMMITTED/);
 assert.equal(await git(f.workspace,['rev-list','--count','HEAD']),'2');
});

test('new proposal never revives a revoked grant even for identical content',async t=>{
 const f=await deliveryFixture(t),first=await propose(f);await f.runtime.actions.grantCommit(first.id,scope(first));await f.runtime.actions.revokeCommit(first.id,scope(first));
 const second=await propose(f);assert.notEqual(second.engineering.delivery.scopeDigest,first.engineering.delivery.scopeDigest);
 await assert.rejects(f.runtime.actions.grantCommit(second.id,scope(first)),/Exact commit preview/);
 const done=await f.runtime.actions.allowWork(second.id,scope(second));assert.equal(done.engineering.delivery.state,'committed');
});

test('foreign Git lock is preserved and no commit effect starts',async t=>{
 const f=await deliveryFixture(t),p=await propose(f),index=await git(f.workspace,['rev-parse','--git-path','index']);
 await fs.writeFile(index+'.lock','FOREIGN LOCK');
 const done=await f.runtime.actions.allowWork(p.id,scope(p));assert.equal(done.engineering.delivery.state,'failed');
 assert.equal(await fs.readFile(index+'.lock','utf8'),'FOREIGN LOCK');assert.equal(await git(f.workspace,['rev-parse','HEAD']),f.parent);
 await fs.rm(index+'.lock');
});

test('local Web permission body and TUI intent carry the exact preview digest',async t=>{
 const f=await deliveryFixture(t),p=await propose(f);
 const {snapshot}=await import('../src/tui/model.mjs'),{primaryAction,initialState}=await import('../src/tui/state.mjs');
 const row=(await snapshot(f.runtime)).tasks[0],action=primaryAction(row,initialState());
 assert.equal(action.label,'ALLOW');assert.equal(action.intent.scopeDigest,p.engineering.delivery.scopeDigest);
 const {startServer}=await import('../src/server.mjs');const {TEST_AUTH_TOKEN,authHeaders}=await import('./helpers.mjs');
 const handle=await startServer(f.base,0,{runtime:f.runtime,authToken:TEST_AUTH_TOKEN});
 try{
  const result=await fetch(`http://127.0.0.1:${handle.port}/api/tasks/${p.id}/allow`,{method:'POST',headers:{'content-type':'application/json',...authHeaders()},body:JSON.stringify(scope(p))});
  assert.equal(result.status,202,await result.clone().text());assert.equal((await result.json()).engineering.delivery.state,'committed');
 }finally{await handle.close();}
});

test('unmanaged or non-disposable bindings cannot obtain commit permission',async t=>{
 const f=await deliveryFixture(t),original=await f.runtime.store.findTask(f.task.id);
 await f.runtime.store.updateTask({...original,engineering:{...original.engineering,workspace:null}});
 await assert.rejects(propose(f),/managed disposable/);
 await f.runtime.store.updateTask({...original,engineering:{...original.engineering,workspace:{...original.engineering.workspace,repository:'/non-disposable-placeholder'}}});
 await assert.rejects(propose(f),/disposable repositories only/);
 await f.runtime.store.updateTask(original);assert.equal(await git(f.workspace,['rev-parse','HEAD']),f.parent);
});
