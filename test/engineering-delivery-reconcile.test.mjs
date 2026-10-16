import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { deliveryFixture, fixtureGit as git } from './engineering-delivery-fixture.mjs';
import { handoffHash as hash } from '../src/core/engineering-handoff.mjs';
import { cleanupEngineeringWorkspace } from '../src/core/engineering-workspace.mjs';
import { workflowLines } from '../src/web/workflow.mjs';
const exec=promisify(execFile);
const scope=t=>({scopeDigest:t.engineering.delivery.scopeDigest});
const dir=(f,t=f.task)=>path.join(f.runtime.store.taskDir(t.slug),'delivery',t.engineering.delivery.scopeDigest);
async function prepare(f) {
  const p=await f.runtime.actions.proposeCommit(f.task.id,{message:'fix: exact local operation'});
  f.task=await f.runtime.actions.grantCommit(p.id,scope(p)); return f.task;
}
async function crash(f,point) {
  await prepare(f);
  await assert.rejects(exec(process.execPath,[new URL('./fixtures/delivery-crash-worker.mjs',import.meta.url).pathname,f.base,String(f.task.id),f.task.engineering.delivery.scopeDigest],{cwd:f.base,timeout:15000,env:{...process.env,WORKFLOW_TEST_MODE:'1',WORKFLOW_TEST_CRASH_AT:'local-commit.'+point}}),e=>e.signal==='SIGKILL');
  f.task=await f.runtime.store.findTask(f.task.id);
  assert.equal(f.task.engineering.delivery.state,'running');
  return f.runtime.store.readJson(path.join(dir(f),'intent.json'));
}
async function manifest(root) {
  const out={};
  async function walk(file,rel='') {
    const stat=await fs.lstat(file);
    if(stat.isDirectory()){for(const name of (await fs.readdir(file)).sort()){if(name!=='.work')await walk(path.join(file,name),rel+'/'+name);}}
    else out[rel]={mode:stat.mode,mtime:stat.mtimeMs,bytes:stat.isSymbolicLink()?await fs.readlink(file):hash(await fs.readFile(file))};
  }
  await walk(root);return out;
}
async function readOnly(f,fn=()=>f.runtime.actions.reconcileCommit(f.task.id)) {
  const before={repository:await manifest(f.base),worktree:await manifest(f.workspace)};
  const result=await fn();
  assert.deepEqual({repository:await manifest(f.base),worktree:await manifest(f.workspace)},before,'reconciliation must preserve objects, refs, reflog, config, hooks, working files, index and stale lock bytes');
  return result;
}
async function noReplay(f,t) {
  await assert.rejects(f.runtime.actions.executeCommit(t.id,scope(t)),/permission|replayed/);
  await assert.rejects(f.runtime.actions.allowWork(t.id,scope(t)),/No pending/);
}

test('1: actual worker SIGKILL before effect proves NOT_APPLIED; consumed grant cannot replay',async t=>{
  const f=await deliveryFixture(t),intent=await crash(f,'before-effect');
  const result=await readOnly(f);assert.equal(result.engineering.delivery.reconciliation.result,'NOT_APPLIED',result.blockedOn?.text);
  assert.equal(result.status,'needs_you');assert.equal(result.engineering.delivery.receipt,null);
  assert.equal(await git(f.workspace,['rev-parse','HEAD']),f.parent);await assert.rejects(git(f.workspace,['cat-file','-e',intent.expectedCommit]));
  await noReplay(f,result);
  await f.runtime.actions.closeWork(result.id);
  const fresh=await f.runtime.actions.proposeCommit(result.id,{message:'fix: exact local operation'});
  assert.notEqual(fresh.engineering.delivery.scopeDigest,result.engineering.delivery.scopeDigest);
  await assert.rejects(f.runtime.actions.executeCommit(fresh.id,scope(result)),/separate exact permission/);
});

for(const point of ['after-object','after-ref'])test(`2: actual SIGKILL ${point} finds exact object without another commit or repository repair`,async t=>{
  const f=await deliveryFixture(t),intent=await crash(f,point);
  const head=await git(f.workspace,['rev-parse','HEAD']),result=await readOnly(f),d=result.engineering.delivery;
  assert.equal(d.reconciliation.result,'APPLIED',result.blockedOn?.text);assert.equal(result.status,'ready');assert.equal(d.commit,intent.expectedCommit);
  assert.equal(d.reconciliation.reachableFromHead,point==='after-ref');assert.equal(await git(f.workspace,['rev-parse','HEAD']),head);
  const receipt=await f.runtime.store.readJson(path.join(f.runtime.store.taskDir(result.slug),d.receipt.path));assert.equal(receipt.commit,d.commit);assert.equal(receipt.operationId,intent.operationId);
  assert.match(await git(f.workspace,['cat-file','commit',d.commit]),new RegExp('0x2f-operation '+intent.operationId));await noReplay(f,result);
});

test('3: existing normal receipt and repeated reconciliation are idempotent',async t=>{
  const f=await deliveryFixture(t),p=await prepare(f),done=await f.runtime.actions.executeCommit(p.id,scope(p));
  const originalReceipt=done.engineering.delivery.receipt;
  const first=await readOnly(f);assert.equal(first.engineering.delivery.reconciliation.result,'APPLIED');assert.deepEqual(first.engineering.delivery.receipt,originalReceipt);
  const second=await readOnly(f);assert.deepEqual(second,first);
  assert.equal(await git(f.workspace,['rev-list','--count','HEAD']),'2');
  assert.equal((await f.runtime.actions.closeWork(first.id)).status,'done');
});

test('4: unrelated successor preserves intended operation and HEAD',async t=>{
  const f=await deliveryFixture(t),intent=await crash(f,'after-ref');
  const next=await git(f.workspace,['commit-tree',intent.tree,'-p',intent.expectedCommit,'-m','unrelated successor']);
  await git(f.workspace,['update-ref','HEAD',next,intent.expectedCommit]);
  const result=await readOnly(f);assert.equal(result.engineering.delivery.reconciliation.result,'APPLIED');assert.equal(result.engineering.delivery.commit,intent.expectedCommit);assert.equal(result.engineering.delivery.reconciliation.reachableFromHead,true);
  assert.equal(await git(f.workspace,['rev-parse','HEAD']),next);
});

for(const similarity of ['different-tree','same-tree'])test(`5/6/7: changed HEAD with similar message/${similarity} has no operation proof and stays UNCERTAIN`,async t=>{
  const f=await deliveryFixture(t),intent=await crash(f,'before-effect');
  const tree=similarity==='same-tree'?intent.tree:await git(f.workspace,['rev-parse',f.parent+'^{tree}']);
  const other=await git(f.workspace,['commit-tree',tree,'-p',f.parent,'-m',f.task.engineering.delivery.preview.message]);await git(f.workspace,['update-ref','HEAD',other,f.parent]);
  const result=await readOnly(f),d=result.engineering.delivery;
  assert.equal(d.reconciliation.result,'UNCERTAIN');assert.equal(result.status,'needs_you');assert.equal(d.commit,null);assert.equal(d.receipt,null);
  assert.match((await f.runtime.store.readJson(path.join(dir(f),'reconciliation.json'))).observed.reflog,new RegExp(other));await noReplay(f,result);
});

test('5: changed symbolic ref is observed conservatively without altering refs',async t=>{
  const f=await deliveryFixture(t);await crash(f,'before-effect');await git(f.workspace,['symbolic-ref','HEAD','refs/heads/master']);
  const result=await readOnly(f);assert.equal(result.engineering.delivery.reconciliation.result,'UNCERTAIN');
});

for(const field of ['repository','worktree'])test(`8: ${field} identity mismatch blocks adoption`,async t=>{
  const f=await deliveryFixture(t);await crash(f,'after-ref');
  const task=await f.runtime.store.findTask(f.task.id),w={...task.engineering.workspace};w[field==='worktree'?'path':'repository']=f.base+'/wrong-identity';
  await f.runtime.store.updateTask({...task,engineering:{...task.engineering,workspace:w}});
  const result=await readOnly(f);assert.equal(result.engineering.delivery.reconciliation.result,'UNCERTAIN');assert.match(result.blockedOn.text,/identity mismatch/);assert.equal(result.engineering.delivery.receipt,null);
});

test('9: concurrent reconciliation persists one result and one revision',async t=>{
  const f=await deliveryFixture(t);await crash(f,'after-ref');const revision=f.task.engineering.revision;
  const results=await readOnly(f,()=>Promise.all([f.runtime.actions.reconcileCommit(f.task.id),f.runtime.actions.reconcileCommit(f.task.id)]));
  assert.deepEqual(results[0],results[1]);assert.equal(results[0].engineering.revision,revision+1);
});

test('10: failed hook records NOT_APPLIED without running hook again',async t=>{
  const f=await deliveryFixture(t),hook=path.join(f.hooks,'pre-commit'),counter=path.join(f.base,'hook-count');
  await fs.writeFile(hook,`#!/bin/sh\necho called >> '${counter}'\nexit 1\n`);await fs.chmod(hook,0o755);
  const p=await prepare(f),failed=await f.runtime.actions.executeCommit(p.id,scope(p));assert.equal(failed.engineering.delivery.state,'failed');
  const result=await readOnly(f);assert.equal(result.engineering.delivery.reconciliation.result,'NOT_APPLIED',result.blockedOn?.text);
  assert.equal(await fs.readFile(counter,'utf8'),'called\n');await noReplay(f,result);
});

test('process start marker without an object is UNCERTAIN even when HEAD is unchanged',async t=>{
  const f=await deliveryFixture(t);await crash(f,'effect-started');
  const result=await readOnly(f);assert.equal(result.engineering.delivery.reconciliation.result,'UNCERTAIN');assert.equal(result.engineering.delivery.receipt,null);
  await assert.rejects(cleanupEngineeringWorkspace(f.runtime.store,result),/evidence must be preserved/);
});

test('configuration drift and missing legacy identity cannot yield success',async t=>{
  for(const mode of ['config','legacy']) {
    const f=await deliveryFixture(t);await crash(f,'after-ref');
    if(mode==='config')await git(f.workspace,['config','user.email','changed@example.invalid']);else await f.runtime.store.writeJson(path.join(dir(f),'intent.json'),{phase:'local-commit'});
    const result=await readOnly(f);assert.equal(result.engineering.delivery.reconciliation.result,'UNCERTAIN');assert.equal(result.engineering.delivery.receipt,null);
  }
});

test('CLI reconciliation and CLI/TUI/Web use the same read-only result projection',async t=>{
  const f=await deliveryFixture(t);await crash(f,'after-ref');
  const cli=new URL('../src/cli.mjs',import.meta.url).pathname;
  const out=await readOnly(f,()=>exec(process.execPath,[cli,'reconcile',String(f.task.id)],{cwd:f.base}));
  const task=await f.runtime.store.findTask(f.task.id),lines=workflowLines(task);
  assert.equal(out.stdout.trim(),lines.join('\n'));assert.match(out.stdout,/ACTION LOCAL COMMIT\nSTATE RECONCILED\nRECONCILE READ ONLY\nRESULT APPLIED/);assert.match(out.stdout,/NEXT READY/);
  const {snapshot}=await import('../src/tui/model.mjs');const row=(await snapshot(f.runtime)).tasks[0];assert.deepEqual(row.workflowLines,lines);
});

test('review P1: signed reflog never invokes repository-configured signature program',async t=>{
  const f=await deliveryFixture(t),counter=path.join(f.base,'signature-count'),program=path.join(f.base,'fixture-gpg');
  await fs.writeFile(program,`#!/bin/sh\necho called >> '${counter}'\nexit 1\n`);await fs.chmod(program,0o755);
  await git(f.workspace,['config','gpg.program',program]);await git(f.workspace,['config','log.showSignature','true']);
  await crash(f,'after-ref');const intent=await f.runtime.store.readJson(path.join(dir(f),'intent.json'));
  const body=`tree ${intent.tree}\nparent ${intent.expectedCommit}\nauthor Fixture <fixture@example.invalid> 1600000000 +0000\ncommitter Fixture <fixture@example.invalid> 1600000000 +0000\ngpgsig -----BEGIN PGP SIGNATURE-----\n fixture\n -----END PGP SIGNATURE-----\n\nsigned-looking successor\n`;
  const object=path.join(f.base,'signed-commit.txt');await fs.writeFile(object,body);
  const successor=await git(f.workspace,['hash-object','-t','commit','-w','--',object]);await git(f.workspace,['update-ref','HEAD',successor,intent.expectedCommit]);
  const result=await readOnly(f);assert.equal(result.engineering.delivery.reconciliation.result,'APPLIED');assert.equal(await f.runtime.store.exists(counter),false);
});

test('review P2: reconciler SIGKILL after durable result completes projection without rewriting observation',async t=>{
  const f=await deliveryFixture(t),intent=await crash(f,'after-ref');
  await assert.rejects(exec(process.execPath,[new URL('./fixtures/delivery-crash-worker.mjs',import.meta.url).pathname,f.base,String(f.task.id),f.task.engineering.delivery.scopeDigest,'reconcile'],{cwd:f.base,timeout:15000,env:{...process.env,WORKFLOW_TEST_MODE:'1',WORKFLOW_TEST_CRASH_AT:'local-commit.reconciliation-saved'}}),e=>e.signal==='SIGKILL');
  const savedFile=path.join(dir(f),'reconciliation.json'),receiptFile=path.join(dir(f),'receipt.json');
  const saved=await fs.readFile(savedFile),receipt=await fs.readFile(receiptFile);
  assert.equal((await f.runtime.store.findTask(f.task.id)).engineering.delivery.reconciliation,undefined);
  const next=await git(f.workspace,['commit-tree',intent.tree,'-p',intent.expectedCommit,'-m','successor after reconciliation crash']);await git(f.workspace,['update-ref','HEAD',next,intent.expectedCommit]);
  const result=await readOnly(f);assert.equal(result.engineering.delivery.reconciliation.result,'APPLIED');assert.equal(result.engineering.delivery.reconciliation.head,intent.expectedCommit);
  assert.deepEqual(await fs.readFile(savedFile),saved);assert.deepEqual(await fs.readFile(receiptFile),receipt);assert.equal(await git(f.workspace,['rev-parse','HEAD']),next);
  assert.deepEqual(await f.runtime.actions.reconcileCommit(f.task.id),result);
});
