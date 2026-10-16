// Offline harness + real Git capability in one disposable task. No model calls.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {deliveryFixture,fixtureGit as git} from '../test/engineering-delivery-fixture.mjs';
const cleanup=[];
try{
 const f=await deliveryFixture({after:fn=>cleanup.push(fn)}),actions=f.runtime.actions;
 await actions.closeWork(f.task.id); // Acceptance is not permission.
 await assert.rejects(actions.executeCommit(f.task.id),/separate exact permission/);
 const denied=await actions.proposeCommit(f.task.id,{message:'fix: preserve task id API'});
 await actions.rejectWork(f.task.id,{scopeDigest:denied.engineering.delivery.scopeDigest});
 assert.equal(await git(f.workspace,['rev-parse','HEAD']),f.parent);
 const p=await actions.proposeCommit(f.task.id,{message:'fix: preserve task id API'}),scope={scopeDigest:p.engineering.delivery.scopeDigest};
 const done=await actions.allowWork(f.task.id,scope);assert.equal(done.engineering.delivery.state,'committed',done.blockedOn?.text);
 const duplicate=await actions.allowWork(f.task.id,scope);assert.equal(duplicate.engineering.delivery.commit,done.engineering.delivery.commit);
 const receipt=await f.runtime.store.readJson(path.join(f.runtime.store.taskDir(done.slug),done.engineering.delivery.receipt.path));
 const originalHead=await git(f.base,['rev-parse','HEAD']),originalBytes=await fs.readFile(path.join(f.base,'src/id.mjs'),'utf8');
 assert.equal(originalHead,f.parent);assert.equal(originalBytes,'USER DIRTY CONTENT\n');
 console.log(JSON.stringify({mode:'offline-harness-real-local-git',liveModelCalls:0,taskId:done.id,patchAcceptedBeforePermission:true,revokedProposalDigest:denied.engineering.delivery.scopeDigest,scopeDigest:scope.scopeDigest,artifactDigest:receipt.artifact.contentDigest,diffDigest:receipt.diffDigest,resultingCommit:receipt.commit,parent:receipt.parent,tree:receipt.tree,message:receipt.message,hookReceipts:receipt.hooks,duplicateReturnedSameCommit:true,totalCommits:Number(await git(f.workspace,['rev-list','--count','HEAD'])),sourceCheckoutHeadUnchanged:originalHead===f.parent,sourceDirtyBytesPreserved:originalBytes==='USER DIRTY CONTENT\n',worktreeClean:(await git(f.workspace,['status','--porcelain']))==='',receiptDigest:done.engineering.delivery.receipt.digest},null,2));
}finally{for(const fn of cleanup.reverse())await fn();}
