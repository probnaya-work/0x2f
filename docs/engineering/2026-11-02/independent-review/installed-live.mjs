// Run only by an operator with existing authenticated harnesses. All product
// imports are from the explicitly installed canonical package, never source.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';
const [pkg, root, platform] = process.argv.slice(2);
const { values: options } = parseArgs({args:process.argv.slice(5),options:{
 'linux-provider':{type:'string',default:'opencode'},model:{type:'string'},
 unit:{type:'string',default:'0x2f-independent-review'},port:{type:'string',default:'46921'},
 tarball:{type:'string'},'timeout-ms':{type:'string',default:'180000'}
}});
const linuxProvider=options['linux-provider'];
assert.ok(['opencode','opencode-free','codex'].includes(linuxProvider),'unsupported qualification provider');
assert.match(options.unit,/^0x2f-(?:independent-review|qualification-[a-z0-9-]+)$/,'qualification-only unit required');
assert.ok(Number.isInteger(+options.port)&&+options.port>=1024&&+options.port<=65535,'invalid qualification port');
const timeoutMs=+options['timeout-ms'];
assert.ok(Number.isInteger(timeoutMs)&&timeoutMs>=30000&&timeoutMs<=600000,'bounded timeout required');
if(linuxProvider==='opencode-free')assert.match(options.model??'',/^opencode\/[a-z0-9.-]+-free$/,'explicit free model required');
if(linuxProvider==='codex')assert.ok(!process.env.OPENAI_API_KEY&&!process.env.CODEX_API_KEY,'API keys are forbidden for this ChatGPT qualification');
const provider=platform==='mac'?'cursor':linuxProvider==='opencode-free'?'qualification-free':linuxProvider;
const continuationProvider=platform==='mac'?'codex':provider;
if (!pkg || !root || !['mac','linux'].includes(platform)) throw Error('usage: installed-live.mjs ABS_PACKAGE ABS_NEW_PRIVATE_ROOT mac|linux');
const { createRuntime } = await import(pathToFileURL(path.join(pkg,'src/runtime.mjs')));
const { initProject } = await import(pathToFileURL(path.join(pkg,'src/project.mjs')));
const { backupWorkspace, restoreBackup } = await import(pathToFileURL(path.join(pkg,'src/backup.mjs')));
const { processIdentity } = await import(pathToFileURL(path.join(pkg,'src/core/execution.mjs')));
const base = path.join(root,'workspace');
const summary = { platform, package: pkg, node: process.version, phases: [] };
const save=async()=>fs.writeFile(path.join(root,'live-summary.json'),JSON.stringify(summary,null,2));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn, ms=timeoutMs) { const end=Date.now()+ms;while(Date.now()<end){const result=await fn();if(result)return result;await delay(200);}throw Error('qualification deadline exceeded'); }
const git=(cwd,...args)=>execFileSync('git',args,{cwd,encoding:'utf8'}).trim();
const system=(...args)=>execFileSync('systemctl',['--user',...args],{encoding:'utf8'}).trim();
const unit=options.unit+'.service';
async function stateFiles(directory, prefix='') {
 const entries=[];
 for(const item of (await fs.readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
  const relative=path.join(prefix,item.name), file=path.join(directory,item.name);
  if(item.isDirectory())entries.push(...await stateFiles(file,relative));
  else if(item.isSymbolicLink())entries.push([relative,'symlink',await fs.readlink(file)]);
  else if(item.isFile())entries.push([relative,(await fs.stat(file)).mode,createHash('sha256').update(await fs.readFile(file)).digest('hex')]);
 }
 return entries;
}
let rt, active, service=false;
assert.ok(path.isAbsolute(pkg)&&path.isAbsolute(root),'absolute installed package and new private root required');
await fs.mkdir(root,{mode:0o700});
try {
 await fs.mkdir(base,{mode:0o700});
 if(options.tarball){
  const canonical='4aa0dd547bf3245a78acca09133ecf070a48fc74e3cc5d5afff74e5270250626';
  assert.equal(createHash('sha256').update(await fs.readFile(options.tarball)).digest('hex'),canonical);
  const files=execFileSync('tar',['-tzf',options.tarball],{encoding:'utf8'}).trim().split('\n').filter(f=>!f.endsWith('/'));
  for(const file of files){
   assert.ok(file.startsWith('package/')&&!file.split('/').includes('..'));
   assert.deepEqual(await fs.readFile(path.join(pkg,file.slice(8))),execFileSync('tar',['-xOzf',options.tarball,file]));
  }
  summary.canonicalSHA256=canonical;summary.installedCanonicalFilesMatched=files.length;
 }
 if(platform==='linux'){
  summary.harness={provider:linuxProvider,requestedModel:options.model??'CLI default',version:execFileSync(linuxProvider==='codex'?'codex':'opencode',['--version'],{encoding:'utf8'}).trim(),auth:linuxProvider==='codex'?'ChatGPT login on Lenovo; no API key':'existing unauthenticated free access'};
  if(linuxProvider==='codex'){
   const auth=spawnSync('codex',['login','status'],{encoding:'utf8'});
   assert.equal(auth.status,0,'Codex login status failed');
   assert.match(auth.stdout+auth.stderr,/Logged in using ChatGPT/,'ChatGPT auth required');
  }
 }
 git(base,'init');await fs.writeFile(path.join(base,'.gitignore'),'.work/\n');await fs.writeFile(path.join(base,'README.md'),'# Independent installed-package qualification\n');git(base,'add','.');git(base,'-c','user.name=qualification','-c','user.email=qualification@example.invalid','commit','-m','qualification baseline');
 await initProject(base);
 await fs.writeFile(path.join(base,'.work/rules.md'),'Only words.mjs and words.test.mjs may change. No dependencies or external/network operations. Keep all original constraints.\n');
 if(platform==='mac') await fs.writeFile(path.join(base,'.work/providers/cursor.json'),JSON.stringify({id:'cursor',displayName:'Cursor',transport:'acp',command:['/Users/bogart/.local/bin/agent','acp']}));
 const assertions=`const {default:a}=await import('node:assert/strict');const {uniqueWords}=await import('./words.mjs');for(const [s,e] of [['',[]],['   ',[]],['A',['a']],['B a b',['a','b']],['one\\ntwo\\tone',['one','two']]])a.deepEqual(uniqueWords(s),e);for(const v of [null,undefined,0,[],{},true])a.throws(()=>uniqueWords(v),TypeError);console.log('11 independent base assertions passed');`;
 const plan={runOnReady:true,commands:[{id:'independent-words',argv:[process.execPath,'--input-type=module','-e',assertions],timeoutMs:15000}]};
 await fs.writeFile(path.join(base,'.work/acceptance.json'),JSON.stringify(plan));
 if(platform==='linux'&&linuxProvider==='opencode-free')await fs.writeFile(path.join(base,'.work/providers/qualification-free.json'),JSON.stringify({id:'qualification-free',displayName:'Explicit free OpenCode qualification',transport:'command',command:['opencode','run','--model',options.model,'--auto','{prompt}']}));
 rt=createRuntime(base);
 if(platform==='linux') {
  assert.equal(system('show',unit,'--property=LoadState','--value'),'not-found');
  execFileSync('systemd-run',['--user','--unit='+options.unit,'--property=KillMode=process','--property=Restart=always','--property=UMask=0077','--working-directory='+base,'--setenv=PATH='+process.env.PATH,'--setenv=WORK_SUPERVISED=1',process.execPath,path.join(pkg,'src/cli.mjs'),'serve',options.port],{stdio:'inherit'});service=true;
 }
 active=await rt.actions.createWork({provider,...(options.model&&linuxProvider==='codex'?{model:options.model}:{}),brief:'Implement words.mjs exporting uniqueWords(text). Require a string, otherwise throw TypeError. Split on any whitespace, lowercase each nonempty word, remove duplicates and return lexicographically sorted words. Empty or whitespace-only input returns []. Create words.test.mjs with node:test assertions. Edit only these two files. No dependencies, network, deployment, credentials or files outside this checkout. Run node --test words.test.mjs. Keep this small and bounded.'});
 await until(async()=>{const t=await rt.store.findTask(active.id);return t.runs[0].harnessProcess?.start && t.status==='working' && t;},30000);
 await rt.actions.noteWork(active.id,{note:'For the NEXT fresh run: extend uniqueWords(text, options = {}) with optional options.maxWords. When present require a positive safe integer (throw TypeError otherwise). Throw RangeError if normalized unique words exceed it. Default has no limit. Keep every earlier string rule. Still change only words.mjs and words.test.mjs. No dependencies/network/external writes.'});
 summary.noteDuringWorking=true;
 if(platform==='linux') {
  const before=await rt.store.findTask(active.id), runtimeBefore=system('show',unit,'--property=MainPID','--value');
  system('restart',unit);const after=await rt.store.findTask(active.id), runtimeAfter=system('show',unit,'--property=MainPID','--value');
  assert.equal(after.pid,before.pid);assert.notEqual(runtimeBefore,runtimeAfter);assert.ok(await processIdentity(before.pid));
  summary.runtimeRestart={workerPreserved:true,runtimePIDChanged:true,clients:'SSH launcher exited; detached qualification controller observes local files'};
 }
 async function done(id) {
  return until(async()=>{const t=await rt.store.findTask(id);if(t.blockedOn?.live)await rt.actions.rejectWork(id,{decisionId:t.blockedOn.decisionId});return ['ready','failed'].includes(t.status)&&t;});
 }
 let first=await done(active.id);assert.equal(first.status,'ready',first.error);
 let run=await rt.actions.getRun(first.id,1);assert.equal(run.checks[0]?.exitCode,0,JSON.stringify(run.checks));assert.equal(first.disposition,undefined);
 const immutable=await rt.actions.getRunChanges(first.id,1);assert.ok(immutable.available);
 assert.equal(createHash('sha256').update(run.deliveredInput).digest('hex'),run.input.sha256);
 summary.phases.push({run:1,provider:first.execution.provider,check:run.checks[0].status,checkExit:run.checks[0].exitCode,inputSHA:run.input.sha256,patchSHA:immutable.sha256,executionId:run.executionId,externalSessionId:run.externalSessionId??null});await save();
 plan.commands[0].argv[3]+=`a.deepEqual(uniqueWords('b a b',{maxWords:2}),['a','b']);for(const v of [0,-1,1.5,'2',Infinity])a.throws(()=>uniqueWords('a',{maxWords:v}),TypeError);a.throws(()=>uniqueWords('a b',{maxWords:1}),RangeError);console.log('7 independent continuation assertions passed');`;
 await fs.writeFile(path.join(base,'.work/acceptance.json'),JSON.stringify(plan));
 await fs.writeFile(path.join(base,'.work/rules.md'),'Only words.mjs and words.test.mjs may change. Preserve all early constraints and the next-run maxWords constraint. Current revision independent-review-v2.\n');
 active=await rt.actions.rerunWork(first.id,{provider:continuationProvider,...(options.model&&linuxProvider==='codex'?{model:options.model}:{})});
 let second=await done(active.id);assert.equal(second.status,'ready',second.error);
 run=await rt.actions.getRun(second.id,2);assert.equal(run.checks[0]?.exitCode,0,JSON.stringify(run.checks));
 assert.equal(createHash('sha256').update(run.deliveredInput).digest('hex'),run.input.sha256);
 assert.match(run.deliveredInput,/NEXT fresh run/);assert.match(run.deliveredInput,/independent-review-v2/);
 assert.equal((await rt.actions.getRunChanges(first.id,1)).patch,immutable.patch);
 summary.phases.push({run:2,provider:second.execution.provider,check:run.checks[0].status,checkExit:run.checks[0].exitCode,inputSHA:run.input.sha256,projectRevision:run.context.projectVersion,patchSHA:run.changes.sha256,executionId:run.executionId,externalSessionId:run.externalSessionId??null});
 summary.continuation={mode:'fresh-session',noteDelivered:true,currentRulesDelivered:true,modelUnderstandingClaimed:false};
 summary.task={id:second.id,slug:second.slug,checkout:second.checkout.path};
 if(platform==='mac') {
  await rt.actions.applyWork(second.id);
  execFileSync(process.execPath,['--test','words.test.mjs'],{cwd:base,stdio:'inherit'});
  execFileSync(process.execPath,plan.commands[0].argv.slice(1),{cwd:base,stdio:'inherit'});
  summary.applyAndIndependentSourceCheck=true;
  await fs.writeFile(path.join(base,'.work/rules.md'),'Cancellation qualification: only partial.txt may change; no external operations.\n');
  active=await rt.actions.createWork({provider:'codex',workspaceMode:'isolated',brief:'This is a bounded cancellation qualification. Create partial.txt containing exactly PARTIAL-CANCEL-ARTIFACT followed by newline. Then execute a foreground shell sleep for 90 seconds. Do not edit any other file, use network, read credentials, install dependencies or write outside this checkout. Do not complete before the sleep returns; the controller will deliberately cancel while waiting. In any output describe this as partial, never complete.'});
  await until(async()=>{const t=await rt.store.findTask(active.id);return t.status==='working'&&await fs.access(path.join(active.checkout.path,'partial.txt')).then(()=>true,()=>false);},120000);
  await rt.actions.cancelWork(active.id,{executionId:active.execution.id,reason:'Independent real installed-package cancellation'});
  const cancelled=await until(async()=>{const t=await rt.store.findTask(active.id);return t.failure?.kind==='cancelled'&&t;},15000);
  const partial=await rt.actions.getRunChanges(active.id,1);
  assert.match(partial.patch,/PARTIAL-CANCEL-ARTIFACT/);assert.equal(cancelled.runs[0].checks.length,0);
  await until(async()=>!await processIdentity(cancelled.pid),15000);
  summary.cancel={status:cancelled.status,kind:cancelled.failure.kind,reason:cancelled.runs[0].cancellation.reason,partialPatchSHA:partial.sha256,checks:0};
 } else {
  if(service){system('stop',unit);service=false;}
  await until(async()=>!await processIdentity(second.pid),15000);
  const original=await fs.readFile(path.join(base,'.work/tasks',second.slug,'task.json'));
  await fs.writeFile(path.join(base,'.work/hosts.json'),'[]');
  const originalState=await stateFiles(path.join(base,'.work'));
  await backupWorkspace(base,path.join(root,'backup'));
  await restoreBackup(path.join(root,'backup'),path.join(root,'restored'));
  const restored=createRuntime(path.join(root,'restored'));
  const history=await restored.actions.getWork(second.id);assert.equal(history.runs.length,2);assert.equal(history.pid,undefined);assert.equal(history.execution.id,undefined);
  assert.deepEqual(await fs.readFile(path.join(base,'.work/tasks',second.slug,'task.json')),original);
  await assert.rejects(fs.access(path.join(root,'restored/.work/hosts.json')));
  const restoredRun=await restored.actions.getRun(second.id,2);assert.equal(restoredRun.checks[0].exitCode,0);
  execFileSync(process.execPath,plan.commands[0].argv.slice(1),{cwd:history.checkout.path,stdio:'inherit'});
  const count=(await restored.store.readEvents(history.slug)).filter(e=>e.type==='run.started').length;
  await delay(1000);assert.equal((await restored.store.readEvents(history.slug)).filter(e=>e.type==='run.started').length,count);
  assert.deepEqual(await stateFiles(path.join(base,'.work')),originalState);
  summary.restore={runs:2,historyCheckExit:0,originalUnchanged:true,originalStateFilesCompared:originalState.length,originalStateDigest:createHash('sha256').update(JSON.stringify(originalState)).digest('hex'),executionReplayed:false,independentRestoredCheck:true};
  summary.productionService=system('is-active','0x2f-host.service');assert.equal(summary.productionService,'active');
 }
 summary.ok=true;await save();
} catch(e) {
 summary.ok=false;summary.error=e.stack;await save();
 if(rt&&active)await rt.actions.cancelWork(active.id,{executionId:active.execution.id,reason:'Qualification controller cleanup after error'}).catch(()=>{});
 if(service)system('stop',unit);
 throw e;
}
