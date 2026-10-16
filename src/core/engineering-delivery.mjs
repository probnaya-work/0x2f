// One local capability: commit an exact verified tree in an owned disposable
// worktree. Permission is separate from patch acceptance. No remote delivery.
import fs from 'node:fs/promises';
import { WorkError } from './errors.mjs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { withEngineeringLock, assertEngineeringAccepted } from './engineering.mjs';
import { engineeringIntent, handoffHash as hash } from './engineering-handoff.mjs';
import { readBounded } from './durable.mjs';
import { workEvent } from './events.mjs';
import { assertLockHeld } from './lock.mjs';
import { crashPoint } from './faults.mjs';
import { prepareDeliveryIntent, localCommitBytes, deliveryBinding, deliveryConfiguration } from './engineering-delivery-intent.mjs';
const exec = promisify(execFile);
const inside = (root, p) => p.startsWith(root + path.sep);
const now = () => new Date().toISOString();
const gitEnv = () => ({ PATH: process.env.PATH ?? '/usr/bin:/bin', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', LANG: 'C.UTF-8' });
async function git(cwd, args, env = {}, raw = false) {
  const out = (await exec('git', ['-c','core.hooksPath=/dev/null','-c','core.fsmonitor=false','-c','commit.gpgSign=false','-C',cwd,...args], { env: {...gitEnv(),...env}, timeout: 5000, maxBuffer: 8000000 })).stdout; return raw ? out : out.trimEnd();
}
async function locked(ctx, id, fn) {
  const t = await ctx.store.findTask(id);
  if (!t.engineering) throw new WorkError('Local commit requires an engineering task.');
  return withEngineeringLock(ctx.store, t.slug, async () => fn(await ctx.store.findTask(id)));
}
async function save(ctx, t, delivery, patch = {}) {
  const next=['proposed','granted'].includes(delivery.state)?'permission':delivery.state==='running'?'local_commit':['failed','uncertain'].includes(delivery.state)?'user':'accept';
  return ctx.store.updateTask({...t,...patch,engineering:{...t.engineering,revision:t.engineering.revision+1,next,delivery}});
}
async function event(ctx,t,data) { await ctx.store.appendEvent(t.slug,workEvent('permission.resolved',t.id,data)); }
async function identity(ctx, t) {
  if (hash(t.engineering.config)!==t.engineering.configDigest) throw new WorkError('Engineering policy changed.');
  const w=t.engineering.workspace;
  if (!w) throw new WorkError('Local commit requires a managed disposable worktree.');
  const roots=[await fs.realpath(os.tmpdir()),'/private/tmp'];
  if (!roots.some(r=>inside(r,w.repository)) || !roots.some(r=>inside(r,w.path)) || !inside(w.repository,w.commonDir)) throw new WorkError('Local commit currently supports self-contained disposable repositories only.');
  await assertEngineeringAccepted(ctx.store,t);
  const branch=await git(w.path,['symbolic-ref','-q','HEAD']).catch(e=>{if(e.code===1)return '';throw e;});
  if (branch) throw new WorkError('Local commit requires the managed detached HEAD.');
  const index=path.resolve(w.path,await git(w.path,['rev-parse','--git-path','index']));
  if (!inside(w.commonDir,index)) throw new WorkError('Worktree index is outside its repository.');
  const gitDir=await fs.realpath(await git(w.path,['rev-parse','--absolute-git-dir']));
  const backlink=await fs.realpath((await fs.readFile(path.join(gitDir,'gitdir'),'utf8')).trim());
  if(backlink!==path.join(w.path,'.git')||!inside(gitDir,index))throw new WorkError('Managed worktree Git backlink changed.');
  const customHooks=await git(w.path,['config','--local','--get','core.hooksPath']).catch(e=>{if(e.code===1)return '';throw e;});
  if(customHooks)throw new WorkError('Custom hooksPath is outside this narrow local capability.');
  return { ...w, gitDir, parent:await git(w.path,['rev-parse','HEAD']),index };
}
async function indexDigest(file) { return hash(await fs.readFile(file).catch(e=>{if(e.code==='ENOENT')return Buffer.alloc(0);throw e;})); }
async function hooks(w) {
  const dir=path.join(w.commonDir,'hooks'),out=[];
  for(const entry of await fs.readdir(dir,{withFileTypes:true}).catch(e=>{if(e.code==='ENOENT')return [];throw e;})) {
    if(entry.name.endsWith('.sample'))continue;
    const file=path.join(dir,entry.name),stat=await fs.lstat(file);
    if(!(stat.mode&0o111))continue;
    if(!stat.isFile()||!['pre-commit','prepare-commit-msg','commit-msg'].includes(entry.name))throw new WorkError('Unsupported or unsafe active Git hook: '+entry.name);
    out.push({name:entry.name,digest:hash(await readBounded(file,1000000))});
  }
  return out.sort((a,b)=>a.name.localeCompare(b.name));
}
async function build(ctx,t,message,proposalId) {
  const w=await identity(ctx,t),root=ctx.store.taskDir(t.slug),artifact=t.engineering.verification.artifact;
  if((await git(w.path,['diff','--cached','--name-only'])).trim())throw new WorkError('Foreign staged changes prevent local delivery.');
  const hs=await hooks(w),author={name:await git(w.path,['config','--local','--get','user.name']),email:await git(w.path,['config','--local','--get','user.email'])};
  if(!author.name||!author.email||/[\r\n<>]/.test(author.name+author.email))throw new WorkError('Disposable repository needs a local Git author identity.');
  const area=path.join(root,'delivery','preview-index');await fs.mkdir(path.dirname(area),{recursive:true});
  const env={GIT_INDEX_FILE:area};await fs.rm(area,{force:true});await git(w.path,['read-tree',w.parent],env);
  const manifest=await ctx.store.readJson(path.join(root,artifact.path));
  for(const file of t.engineering.config.writePaths){
    const m=manifest.files[file];
    if(!m){await git(w.path,['update-index','--force-remove','--',file],env);continue;}
    const archived=path.join(root,path.dirname(artifact.path),'files',file);
    const blob=await git(w.path,['hash-object','-w','--no-filters','--',archived]);
    const raw=await exec('git',['-C',w.path,'cat-file','blob',blob],{encoding:'buffer',env:gitEnv(),timeout:5000,maxBuffer:2000000});
    if(hash(raw.stdout)!==m.sha256)throw new WorkError('Archived bytes changed while creating the Git tree.');
    const baseline=await git(w.path,['ls-tree',w.parent,'--',file]);
    const mode=baseline.startsWith('100755 ')?'100755':'100644';
    await git(w.path,['update-index','--add','--cacheinfo',mode,blob,file],env);
  }
  const tree=await git(w.path,['write-tree'],env);
  const diff=await git(w.path,['diff','--cached','--binary','--full-index','--no-ext-diff','--no-textconv','--no-renames',w.parent,'--'],env,true);
  if(!diff)throw new WorkError('Verified artifact has no commit changes.');
  return {schemaVersion:1,proposalId,taskId:t.id,slug:t.slug,capability:'git.localCommit',intentDigest:engineeringIntent(t),artifact,verificationDigest:hash(t.engineering.verification),repository:w.repository,worktree:w.path,gitDirectory:w.gitDir,workspaceIdentity:w.identity,parent:w.parent,tree,diffDigest:hash(diff),message,author,hooks:hs,indexDigest:await indexDigest(w.index),scope:t.engineering.config.writePaths};
}
export async function proposeLocalCommit(ctx,id,{message}={}) {
  if(typeof message!=='string'||!message.trim()||message.length>500||/[\x00\r]/.test(message))throw new WorkError('A bounded commit message is required.');message=message.trim();
  return locked(ctx,id,async t=>{
    const old=t.engineering.delivery;
    if((['running','uncertain','committed'].includes(old?.state) || old?.reconciliation && old.reconciliation.result !== 'NOT_APPLIED'))throw new WorkError('Existing delivery cannot be replaced or replayed.');
    if(old&&['proposed','granted'].includes(old.state)){
      if(old.preview.message===message)return t;
      throw new WorkError('Reject the existing commit proposal before replacing it.');
    }
    if(!['ready','done'].includes(t.status))throw new WorkError('A verified patch is required before proposing a commit.');
    const preview=await build(ctx,t,message,randomUUID()),scopeDigest=hash(preview),dir=path.join(ctx.store.taskDir(t.slug),'delivery',scopeDigest);
    await ctx.store.writeJson(path.join(dir,'preview.json'),preview);
    const patch=await git(preview.worktree,['diff','--cached','--binary','--full-index','--no-ext-diff','--no-textconv','--no-renames',preview.parent,'--'],{GIT_INDEX_FILE:path.join(ctx.store.taskDir(t.slug),'delivery','preview-index')},true);
    if(hash(patch)!==preview.diffDigest)throw new WorkError('Commit preview changed while saving its diff.');
    await ctx.store.writeText(path.join(dir,'patch.diff'),patch);
    const d={state:'proposed',scopeDigest,preview,previous:old?{scopeDigest:old.scopeDigest,state:old.state}:null};
    const next=await save(ctx,t,d,{status:'needs_you',blockedOn:{type:'permission',capability:'git.localCommit',scopeDigest,tool:'git local commit',file:preview.worktree,description:'Commit the exact verified artifact locally.',plannedChange:`${message}\nRepository: ${preview.repository}\nWorktree: ${preview.worktree}\nDiff: ${preview.diffDigest}\nScope: ${scopeDigest}\nHooks: ${preview.hooks.map(h=>h.name).join(', ')||'none'}`} });
    await event(ctx,next,{capability:'git.localCommit',scopeDigest,grant:'required'});return next;
  });
}
async function validate(ctx,t,d,digest) {
  if(!d||digest!==d.scopeDigest)throw new WorkError('Exact commit preview digest is required.');
  try {
    const archived=await ctx.store.readJson(path.join(ctx.store.taskDir(t.slug),'delivery',digest,'preview.json'));
    const patch=await readBounded(path.join(ctx.store.taskDir(t.slug),'delivery',digest,'patch.diff'),8000000);
    if(hash(patch)!==d.preview.diffDigest||hash(archived)!==digest||hash(d.preview)!==digest||hash(await build(ctx,t,d.preview.message,d.preview.proposalId))!==digest)throw new WorkError('Commit scope/diff/identity changed.');
  } catch(e) {
    await save(ctx,t,{...d,state:'invalidated',grant:null},{status:'ready',blockedOn:undefined});
    await event(ctx,t,{capability:'git.localCommit',scopeDigest:digest,grant:'invalidated',reason:e.message});
    throw new WorkError('Commit permission invalidated: '+e.message);
  }
}
export async function grantLocalCommit(ctx,id,{scopeDigest}={}) {
  return locked(ctx,id,async t=>{
    const d=t.engineering.delivery;
    if(d?.state==='committed'&&d.scopeDigest===scopeDigest)return t;
    if(!['proposed','granted'].includes(d?.state))throw new WorkError('No pending local commit permission.');
    await validate(ctx,t,d,scopeDigest);
    const grant={scopeDigest,at:now(),author:'user'};
    await ctx.store.writeJson(path.join(ctx.store.taskDir(t.slug),'delivery',scopeDigest,'permission.json'),{...grant,state:'granted'});
    const next=await save(ctx,t,{...d,state:'granted',grant});
    await event(ctx,next,{capability:'git.localCommit',scopeDigest,grant:'allow'});return next;
  });
}
export async function revokeLocalCommit(ctx,id,{scopeDigest}={}) {
  return locked(ctx,id,async t=>{
    const d=t.engineering.delivery;
    if(!d||d.scopeDigest!==scopeDigest||!['proposed','granted'].includes(d.state))throw new WorkError('No matching revocable commit permission.');
    const next=await save(ctx,t,{...d,state:'revoked',revokedAt:now()},{status:'ready',blockedOn:undefined});
    await ctx.store.writeJson(path.join(ctx.store.taskDir(t.slug),'delivery',scopeDigest,'permission.json'),{scopeDigest,state:'revoked',grant:d.grant??null,revokedAt:next.engineering.delivery.revokedAt});
    await event(ctx,next,{capability:'git.localCommit',scopeDigest,grant:'reject'});return next;
  });
}
export async function executeLocalCommit(ctx,id,{scopeDigest,faultAt}={}) {
  return locked(ctx,id,async t=>{
    let d=t.engineering.delivery;
    if(d?.state==='committed'&&d.scopeDigest===scopeDigest)return t;
    if(d?.state==='running'||d?.state==='uncertain')throw new WorkError('Uncertain local commit cannot be replayed automatically.');
    if(d?.state!=='granted'||d.grant?.scopeDigest!==scopeDigest)throw new WorkError('Local commit needs its separate exact permission.');
    await validate(ctx,t,d,scopeDigest);
    const w=await identity(ctx,t),p=d.preview,dir=path.join(ctx.store.taskDir(t.slug),'delivery',scopeDigest),privateIndex=path.join(ctx.store.taskDir(t.slug),'delivery','preview-index');
    let lockFile, lockInode;
    const receipts=[];let commit=null,effect=false;
    try{
      lockFile=await fs.open(w.index+'.lock','wx',0o600);
      lockInode=(await lockFile.stat()).ino;
      if(await indexDigest(w.index)!==p.indexDigest)throw new WorkError('Git index changed before delivery.');
      d={...d,state:'running',consumedAt:now()};t=await save(ctx,t,d);
      const intent=await prepareDeliveryIntent(ctx.store,t,d);
      await ctx.store.writeJson(path.join(dir,'intent.json'),intent);
      d={...d,operationId:intent.operationId,intentDigest:hash(intent)};t=await save(ctx,t,d);
      crashPoint('local-commit.before-effect');
      await ctx.store.writeJson(path.join(dir,'permission.json'),{...d.grant,state:'consumed',consumedAt:d.consumedAt});
      const messageFile=path.join(dir,'message.txt');await ctx.store.writeText(messageFile,p.message+'\n');
      const env={...gitEnv(),GIT_INDEX_FILE:privateIndex,GIT_DIR:await git(w.path,['rev-parse','--absolute-git-dir']),GIT_WORK_TREE:w.path};
      for(const name of ['pre-commit','prepare-commit-msg','commit-msg'])if(p.hooks.some(h=>h.name===name)){
        assertLockHeld();
        const argv=name==='pre-commit'?[]:name==='prepare-commit-msg'?[messageFile,'message']:[messageFile];
        let r;try{const out=await exec(path.join(w.commonDir,'hooks',name),argv,{cwd:w.path,env,timeout:5000,maxBuffer:65536});r={name,exit:0,output:out.stdout+out.stderr};}catch(e){r={name,exit:typeof e.code==='number'?e.code:null,error:String(e.code),output:String(e.stdout??'')+String(e.stderr??'')};}
        receipts.push(r);await ctx.store.writeJson(path.join(dir,'hooks.json'),receipts);
        if(r.exit!==0)throw new WorkError('Git hook failed: '+name);
      }
      await assertEngineeringAccepted(ctx.store,t);
      if(hash(await hooks(w))!==hash(p.hooks)||await git(w.path,['write-tree'],{GIT_INDEX_FILE:privateIndex})!==p.tree||await fs.readFile(messageFile,'utf8')!==p.message+'\n'||await indexDigest(w.index)!==p.indexDigest||(await fs.lstat(w.index+'.lock')).ino!==lockInode)throw new WorkError('Hooks changed the approved tree/message/scope/index.');
      const currentBinding=await deliveryBinding(ctx.store,t,p);
      if(hash(currentBinding.physical)!==hash(intent.physical)||hash(await deliveryConfiguration(currentBinding))!==hash(intent.configuration))throw new WorkError('Git identity/configuration changed before commit.');
      const commitFile=path.join(dir,'commit.txt');
      await ctx.store.writeText(commitFile,localCommitBytes(p,intent.operationId,intent.stamp));
      await ctx.store.writeJson(path.join(dir,'effect.json'),{operationId:intent.operationId,intentDigest:hash(intent),phase:'started'});
      assertLockHeld();
      effect=true;
      crashPoint('local-commit.effect-started');
      commit=await git(w.path,['hash-object','-t','commit','-w','--no-filters','--',commitFile]);
      if(commit!==intent.expectedCommit)throw new WorkError('Git produced a different commit object.');
      crashPoint('local-commit.after-object');
      if(faultAt==='after-object'&&process.env.WORKFLOW_TEST_MODE==='1')throw new WorkError('Injected lost delivery outcome.');
      await ctx.store.writeJson(path.join(dir,'candidate.json'),{commit,parent:p.parent,tree:p.tree});
      assertLockHeld();
      await git(w.path,['update-ref','--no-deref','HEAD',commit,p.parent]);
      crashPoint('local-commit.after-ref');
      if(faultAt==='after-ref'&&process.env.WORKFLOW_TEST_MODE==='1')throw new WorkError('Injected lost delivery receipt.');
      assertLockHeld();
      await lockFile.writeFile(await fs.readFile(privateIndex));await lockFile.sync();await lockFile.close();lockFile=null;await fs.rename(w.index+'.lock',w.index);
      const workspaceFile=path.join(ctx.store.taskDir(t.slug),'workspace.json');
      await ctx.store.writeJson(workspaceFile,{...await ctx.store.readJson(workspaceFile),deliveredCommit:commit});
      const receipt={schemaVersion:1,capability:'git.localCommit',scopeDigest,operationId:intent.operationId,intentDigest:hash(intent),grant:d.grant,consumedAt:d.consumedAt,taskId:t.id,artifact:p.artifact,repository:p.repository,worktree:p.worktree,parent:p.parent,tree:p.tree,diffDigest:p.diffDigest,message:p.message,hooks:receipts,commit,at:now()};
      const ref={path:`delivery/${scopeDigest}/receipt.json`,digest:hash(receipt)};await ctx.store.writeJson(path.join(ctx.store.taskDir(t.slug),ref.path),receipt);
      t=await save(ctx,t,{...d,state:'committed',commit,receipt:ref},{status:'ready',blockedOn:undefined});
      await event(ctx,t,{capability:'git.localCommit',scopeDigest,grant:'consumed',commit});return t;
    }catch(e){
      const failure={state:effect?'uncertain':'failed',scopeDigest,grant:d.grant,consumedAt:d.consumedAt??null,error:e.message,hooks:receipts,candidateCommit:commit,at:now()};
      await ctx.store.writeJson(path.join(dir,'failure.json'),failure);
      t=await save(ctx,t,{...d,...failure},{status:'needs_you',blockedOn:{type:'decision',code:'local_commit_'+failure.state,text:e.message+' No automatic retry.'}});return t;
    }finally{if(lockFile){await lockFile.close();const s=await fs.lstat(w.index+'.lock').catch(e=>{if(e.code==='ENOENT')return null;throw e;});if(s?.ino===lockInode)await fs.rm(w.index+'.lock');}}
  });
}
