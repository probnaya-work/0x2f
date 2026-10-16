import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {initProject} from '../src/project.mjs';
import {createRuntime} from '../src/runtime.mjs';
import {runEngineeringTask} from '../src/core/engineering.mjs';
const exec=promisify(execFile);
export const fixtureGit=async(base,args)=>(await exec('git',['-c','core.hooksPath=/dev/null','-c','commit.gpgSign=false','-C',base,...args],{env:{...process.env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:'/dev/null'}})).stdout.trim();
export async function deliveryFixture(t){
 const base=await fs.mkdtemp('/private/tmp/0x2f-delivery-');let workspace;
 t.after(async()=>{if(workspace)await fixtureGit(base,['worktree','remove','--force',workspace]).catch(()=>{});await fs.rm(base,{recursive:true,force:true});});
 await initProject(base);await fs.mkdir(path.join(base,'src'));await fs.mkdir(path.join(base,'test'));
 await fs.writeFile(path.join(base,'.gitignore'),'.work/\n');await fs.writeFile(path.join(base,'src/id.mjs'),'export const id = null;\n');
 await fs.writeFile(path.join(base,'test/id.test.mjs'),"import assert from 'node:assert/strict';import {id} from '../src/id.mjs';assert.equal(id,14);\n");
 await fixtureGit(base,['init']);await fixtureGit(base,['config','user.name','Fixture']);await fixtureGit(base,['config','user.email','fixture@example.invalid']);
 await fixtureGit(base,['add','.gitignore','src','test']);await fixtureGit(base,['commit','-m','fixture baseline']);const parent=await fixtureGit(base,['rev-parse','HEAD']);
 await fs.writeFile(path.join(base,'src/id.mjs'),'USER DIRTY CONTENT\n');
 const zero={moneyMicros:0,tokens:0,modelCalls:0,providerCalls:0};
 await fs.writeFile(path.join(base,'.work/engineering.json'),JSON.stringify({schemaVersion:1,enabled:true,currency:'USD',providers:['fixture'],files:['src/id.mjs','test/id.test.mjs'],writePaths:['src/id.mjs'],check:[process.execPath,'--test','test/id.test.mjs'],limits:{...zero,wallClockMs:30000,implementationAttempts:2},workspace:{repository:base,ref:parent}}));
 const provider={id:'fixture',integrationType:'command',command:[process.execPath],capabilities:{},async start({cwd}){await fs.writeFile(path.join(cwd,'src/id.mjs'),'export const id = 14;\n');return{status:'ready',result:'offline fixture',usage:zero};}};
 const runtime=createRuntime(base,{providers:[provider],node:{id:'local',startExecution:async()=>null}});
 let task=await runtime.actions.createWork({brief:'Fix id without changing public API.'});workspace=task.engineering.workspace.path;
 task=await runEngineeringTask({store:runtime.store,slug:task.slug,token:task.engineering.driver.token,providers:runtime.providers,qualify:p=>({maximum:zero,execute:input=>p.start(input)})});
 if(task.status!=='ready')throw new Error(task.blockedOn?.text);
 return{base,workspace,parent,runtime,task,source:path.join(workspace,'src/id.mjs'),hooks:path.join(base,'.git/hooks')};
}
