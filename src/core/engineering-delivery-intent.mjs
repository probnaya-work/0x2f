// Exact local commit identity, shared with the read-only reconciler. No Git
// writer is imported here. These commands never refresh the index or fetch.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { readBounded } from './durable.mjs';
import { handoffHash as hash } from './engineering-handoff.mjs';
const exec = promisify(execFile);
const inside = (root, file) => file.startsWith(root + path.sep);
export async function readDeliveryGit(cwd, args, raw = false) {
  if (!['rev-parse','symbolic-ref','config','cat-file','diff-tree','for-each-ref','reflog','merge-base'].includes(args[0])) throw new Error('Unsupported reconciliation read.');
  const { stdout } = await exec('git', ['--no-optional-locks','--no-replace-objects','-c','core.hooksPath=/dev/null','-c','core.fsmonitor=false','-c','maintenance.auto=false','-c','log.showSignature=false','-C',cwd,...args], {
    env: { PATH: process.env.PATH ?? '/usr/bin:/bin', LANG:'C.UTF-8', GIT_CONFIG_NOSYSTEM:'1', GIT_CONFIG_GLOBAL:'/dev/null', GIT_NO_LAZY_FETCH:'1', GIT_TERMINAL_PROMPT:'0' }, timeout:5000, maxBuffer:8000000
  });
  return raw ? stdout : stdout.trimEnd();
}
export async function deliveryBinding(store, task, preview) {
  const w = task.engineering.workspace;
  if (!w || w.identity !== preview.workspaceIdentity || w.repository !== preview.repository || w.path !== preview.worktree || w.path !== path.join(store.workDir(),'worktrees',task.slug)) throw new Error('Managed repository/worktree identity mismatch.');
  const r = await store.readJson(path.join(store.taskDir(task.slug),'workspace.json'));
  if (r.state !== 'ready' || r.taskId !== task.id || r.slug !== task.slug || ['identity','repository','path','commonDir','commit'].some(k => r[k] !== w[k])) throw new Error('Managed workspace receipt mismatch.');
  const roots = [await fs.realpath(os.tmpdir()),'/private/tmp'];
  if (!roots.some(root => inside(root,w.repository)) || !inside(w.repository,w.commonDir) || !inside(w.repository,w.path)) throw new Error('Only self-contained disposable repositories are supported.');
  const directories = { repository:w.repository, worktree:w.path, commonDir:w.commonDir, gitDirectory:preview.gitDirectory };
  const physical = {};
  for (const [key,file] of Object.entries(directories)) {
    if (await fs.realpath(file) !== file) throw new Error('Repository/worktree path identity changed.');
    const stat = await fs.lstat(file);
    if (!stat.isDirectory()) throw new Error('Repository/worktree directory missing.');
    physical[key] = { device:stat.dev, inode:stat.ino };
  }
  if (!inside(w.commonDir,preview.gitDirectory)) throw new Error('Git directory is outside the managed repository.');
  const dotGit = (await readBounded(path.join(w.path,'.git'),4096)).toString().trim();
  if (dotGit !== 'gitdir: '+preview.gitDirectory || await fs.realpath((await readBounded(path.join(preview.gitDirectory,'gitdir'),4096)).toString().trim()) !== path.join(w.path,'.git') || await fs.realpath(path.resolve(preview.gitDirectory,(await readBounded(path.join(preview.gitDirectory,'commondir'),4096)).toString().trim())) !== w.commonDir) throw new Error('Managed worktree Git links changed.');
  if (await readDeliveryGit(w.path,['rev-parse','--absolute-git-dir']) !== preview.gitDirectory || await readDeliveryGit(w.path,['rev-parse','--path-format=absolute','--git-common-dir']) !== w.commonDir) throw new Error('Git repository binding changed.');
  return { ...w, gitDirectory:preview.gitDirectory, physical };
}
export async function deliveryConfiguration(w) {
  const config = await readDeliveryGit(w.path,['config','--no-includes','--list']);
  if (/^(include\.|includeif\.|extensions\.partialclone=|remote\..*\.promisor=true)/mi.test(config)) throw new Error('Included configuration or partial clones are unsupported.');
  if (await fs.lstat(path.join(w.commonDir,'objects/info/alternates')).then(()=>true,e=>{if(e.code==='ENOENT')return false;throw e;})) throw new Error('Alternate object stores are unsupported.');
  const digest = async file => hash(await readBounded(file,1000000).catch(e=>{if(e.code==='ENOENT')return Buffer.alloc(0);throw e;}));
  const objectFormat = await readDeliveryGit(w.path,['rev-parse','--show-object-format']);
  if (!['sha1','sha256'].includes(objectFormat)) throw new Error('Unsupported Git object format.');
  return { objectFormat, local:await digest(path.join(w.commonDir,'config')), worktree:await digest(path.join(w.gitDirectory,'config.worktree')) };
}
export async function deliveryObservation(w) {
  const head = await readDeliveryGit(w.path,['rev-parse','--verify','HEAD^{commit}']);
  const headRef = await readDeliveryGit(w.path,['symbolic-ref','-q','HEAD']).catch(e=>{if(e.code===1)return null;throw e;});
  const refs = await readDeliveryGit(w.path,['for-each-ref','--count=65','--format=%(refname) %(objectname)']);
  const reflog = await readDeliveryGit(w.path,['reflog','show','--no-show-signature','-n','65','--format=%H %gD %gs','HEAD']);
  return { head, headRef, refs, reflog, truncated:refs.split('\n').length>64 || reflog.split('\n').length>64 };
}
export function localCommitBytes(p, operationId, stamp) {
  const author = `${p.author.name} <${p.author.email}> ${stamp}`;
  return `tree ${p.tree}\nparent ${p.parent}\nauthor ${author}\ncommitter ${author}\n0x2f-operation ${operationId}\n\n${p.message}\n`;
}
export function localCommitOid(bytes, format) {
  return createHash(format).update(`commit ${Buffer.byteLength(bytes)}\0`).update(bytes).digest('hex');
}
export async function prepareDeliveryIntent(store, task, delivery) {
  const p = delivery.preview, w = await deliveryBinding(store,task,p), configuration = await deliveryConfiguration(w);
  const operationId = p.proposalId, stamp = `${Math.floor(Date.now()/1000)} +0000`, bytes = localCommitBytes(p,operationId,stamp);
  return { schemaVersion:2, workerPid:process.pid, taskId:task.id, slug:task.slug, run:task.runs.at(-1).run, operationId, scopeDigest:delivery.scopeDigest,
    workspaceIdentity:w.identity, physical:w.physical, configuration, parent:p.parent, tree:p.tree, diffDigest:p.diffDigest,
    messageDigest:hash(p.message), grantDigest:hash(delivery.grant), consumedAt:delivery.consumedAt, stamp,
    commitBytesDigest:hash(bytes), expectedCommit:localCommitOid(bytes,configuration.objectFormat), before:await deliveryObservation(w) };
}
