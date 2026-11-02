// Private local backups. Never restore over a workspace or replay execution.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createStore } from './core/store.mjs';
import { withFileLock } from './core/lock.mjs';
import { processGroupAlive } from './recover.mjs';
import { git } from './core/isolation.mjs';
import { WorkError } from './core/errors.mjs';
const inside=(base,p)=>p===base||p.startsWith(base+path.sep);
const hash=data=>createHash('sha256').update(data).digest('hex');
const ignored=p=>p==='.work/locks'||p.startsWith('.work/locks/');
async function inventory(root,rel='') {
 const records=[];
 for(const name of (await fs.readdir(path.join(root,rel))).sort()) {
  const p=rel?`${rel}/${name}`:name;if(ignored(p))continue;
  const full=path.join(root,p),s=await fs.lstat(full);
  if(s.isDirectory()) {records.push({path:p,type:'directory',mode:s.mode&0o777});records.push(...await inventory(root,p));}
  else if(s.isSymbolicLink()) records.push({path:p,type:'symlink',target:await fs.readlink(full)});
  else if(s.isFile()) records.push({path:p,type:'file',mode:s.mode&0o777,sha256:hash(await fs.readFile(full))});
  else throw new WorkError(`Backup refuses special filesystem entry: ${p}`);
 }
 return records;
}
async function copyPrivate(from,to) {
 await fs.mkdir(to,{mode:0o700});
 for(const name of await fs.readdir(from)) {
  const a=path.join(from,name),b=path.join(to,name),s=await fs.lstat(a);
  if(s.isDirectory()) await copyPrivate(a,b);
  else if(s.isSymbolicLink()) await fs.symlink(await fs.readlink(a),b);
  else if(s.isFile()) {await fs.copyFile(a,b,fs.constants.COPYFILE_EXCL);await fs.chmod(b,(s.mode&0o700)|0o600);}
  else throw new WorkError('Backup refuses special filesystem entries.');
 }
}
async function mustBeAbsent(p) {
 try {await fs.lstat(p);}catch(e){if(e.code==='ENOENT')return;throw e;}
 throw new WorkError('Destination already exists. Choose a new private directory; nothing was overwritten.',409);
}
async function selfContainedGit(base) {
 try {
  const common=path.resolve(base,(await git(base,['rev-parse','--git-common-dir'])).trim());
  if(!inside(base,common)) throw new WorkError('Backup requires the owning Git checkout; this worktree depends on an external Git directory.',409);
  try {if((await fs.readFile(path.join(common,'objects/info/alternates'),'utf8')).trim())throw new WorkError('Git object alternates require an explicit external backup.',409);}catch(e){if(e.code!=='ENOENT')throw e;}
 }catch(e){if(e instanceof WorkError && !e.message.startsWith('Git workspace operation failed'))throw e;}
}
async function requireQuiescent(base) {
 const store=createStore(base);
 for(const t of await store.listTasks()) {
  const r=t.runs?.at(-1);
  if(t.status==='working'||t.blockedOn?.live||r?.outcome==='working'||r?.blockedOn?.live||processGroupAlive(t.processGroupId))throw new WorkError('Backup requires all executions to finish or be explicitly cancelled and recovered. Nothing was stopped.',409);
 }
}
export async function backupWorkspace(base,destination) {
 const originalAlias=path.resolve(base);base=await fs.realpath(base);destination=path.resolve(destination);
 const parent=await fs.realpath(path.dirname(destination));destination=path.join(parent,path.basename(destination));
 if(inside(base,destination))throw new WorkError('Backup destination must be outside the source workspace.');
 await mustBeAbsent(destination);await selfContainedGit(base);
 return withFileLock(path.join(base,'.work/locks/execution-admission'),async()=>{
  await requireQuiescent(base);
  const staging=destination+'.partial-'+randomUUID();
  await fs.mkdir(staging,{mode:0o700});
  try {
   const before=await inventory(base);await copyPrivate(base,path.join(staging,'workspace'));
   // Locks are transient coordination state, never restored.
   await fs.rm(path.join(staging,'workspace/.work/locks'),{recursive:true,force:true});
   const after=await inventory(base),copied=await inventory(path.join(staging,'workspace'));
   const content=rows=>JSON.stringify(rows.map(({mode,...r})=>r));
   if(JSON.stringify(before)!==JSON.stringify(after)||content(before)!==content(copied))throw new WorkError('Workspace changed during backup. Stop external writers and retry; no final backup was published.',409);
   const receipt={version:1,originalBase:base,originalAlias,createdAt:new Date().toISOString(),files:copied,sourceModes:before};
   await fs.writeFile(path.join(staging,'receipt.json'),JSON.stringify(receipt,null,2),{mode:0o600});
   await fs.rename(staging,destination);return {directory:destination,entries:copied.length,private:true};
  }catch(e){await fs.rm(staging,{recursive:true,force:true});throw e;}
 });
}
export async function restoreBackup(backup,destination) {
 backup=await fs.realpath(backup);const parent=await fs.realpath(path.dirname(path.resolve(destination)));destination=path.join(parent,path.basename(destination));
 await mustBeAbsent(destination);
 const receipt=JSON.parse(await fs.readFile(path.join(backup,'receipt.json'),'utf8'));
 if(receipt.version!==1||typeof receipt.originalBase!=='string'||!Array.isArray(receipt.files)||!Array.isArray(receipt.sourceModes))throw new WorkError('Invalid backup receipt.');
 const source=path.join(backup,'workspace');
 if(JSON.stringify(await inventory(source))!==JSON.stringify(receipt.files))throw new WorkError('Backup content differs from its receipt; restore refused.',409);
 const staging=destination+'.partial-'+randomUUID();
 try {
  await copyPrivate(source,staging);
  // Retain historical receipts verbatim; only the current checkout locator moves.
  const store=createStore(staging);
  for(const t of await store.listTasks()) {
   const updated={...t};delete updated.pid;delete updated.processGroupId;delete updated.cancelRequested;
   if(updated.execution){updated.execution={...updated.execution};delete updated.execution.process;delete updated.execution.id;}
   if(updated.checkout?.path) {
    const oldBase=[receipt.originalBase,receipt.originalAlias].find(b=>typeof b==='string'&&inside(b,updated.checkout.path));
    if(!oldBase)throw new WorkError('Checkout locator is outside the backed-up workspace; restore refused.');
    updated.checkout={...updated.checkout,path:path.join(destination,path.relative(oldBase,updated.checkout.path))};
   }
   await store.updateTask(updated);
  }
  for(const name of ['relay.json','relay-acks.json','hosts.json'])await fs.rm(path.join(staging,'.work',name),{force:true});
  await fs.writeFile(path.join(staging,'.work/restored.json'),JSON.stringify({at:new Date().toISOString(),source:backup,executionReplayed:false,remoteAccess:'disabled; explicitly re-pair and configure hosts'}),{mode:0o600});
  await fs.rename(staging,destination);
  // Git repairs task worktree pointers in the copied common repository only.
  const tasks=await createStore(destination).listTasks();
  const paths=tasks.filter(t=>t.checkout?.mode==='isolated'&&!t.checkout.archivedAt).map(t=>t.checkout.path);
  if(paths.length) {
   // Rewrite copied links BEFORE repair, so Git never visits the original checkout.
   for(const checkout of paths) {
    if(!inside(destination,checkout))throw new WorkError('Restored checkout locator is outside destination.');
    const pointer=path.join(checkout,'.git');
    const old=await fs.readFile(pointer,'utf8');
    const target=old.trim().replace(/^gitdir: /,'');
    const oldBase=[receipt.originalBase,receipt.originalAlias].find(b=>typeof b==='string'&&inside(b,target));
    if(!oldBase)throw new WorkError('Restored worktree has an external Git dependency; inspect the new directory.');
    await fs.writeFile(pointer,'gitdir: '+path.join(destination,path.relative(oldBase,target))+'\n',{mode:0o600});
   }
   const metadata=path.join(destination,'.git/worktrees');
   for(const name of await fs.readdir(metadata)) {
    const pointer=path.join(metadata,name,'gitdir');
    const target=(await fs.readFile(pointer,'utf8')).trim();
    const oldBase=[receipt.originalBase,receipt.originalAlias].find(b=>typeof b==='string'&&inside(b,target));
    if(!oldBase)throw new WorkError('Backup contains an external worktree registration; inspect the restored copy.');
    await fs.writeFile(pointer,path.join(destination,path.relative(oldBase,target))+'\n',{mode:0o600});
   }
   await git(destination,['worktree','repair',...paths]);
  }
  return {directory:destination,remoteAccess:'disabled',executionReplayed:false};
 }catch(e){await fs.rm(staging,{recursive:true,force:true});throw e;}
}
