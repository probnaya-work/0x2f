import fs from 'node:fs/promises';
import {realpathSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { randomUUID, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { durableWrite, readBounded, safePath, syncDirectory } from './durable.mjs';
import { withLock } from './lock.mjs';
import { executableIdentity, verifyExecutable } from './workflow-adapters.mjs';
import { processIdentity as fallbackIdentity } from './process-identity.mjs';
import { runtimeFingerprint, loadedRuntimeFingerprint, stopLaunchAgent } from './workflow-scheduler.mjs';
import { validateSnapshot } from './workflow-schema.mjs';
import { currentRunNumber } from './runs.mjs';
import { workflowLock } from './workflows.mjs';
import { crashPoint } from './faults.mjs';
const exec = promisify(execFile);
const root = new URL('../../',import.meta.url).pathname;
export const supervisionDir = store => path.join(store.workDir(),'supervision');
export const digestAttempt = v => createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:JSON.stringify(v)).digest('hex');
export const attemptDir = (store,id) => { if(!/^[a-f0-9]{64}$/.test(id))throw new Error('Invalid attempt ID.');return path.join(supervisionDir(store),'attempts',id); };
export const channelPath = (store,id) => path.join('/private/tmp',`2f-supervision-${digestAttempt({base:realpathSync(store.base),id}).slice(0,24)}`,'channel.sock');
export const attemptLock = (store,id,fn) => withLock(path.join(attemptDir(store,id),'lock'),fn);
const configFile = store => path.join(supervisionDir(store),'installation.json');
const xml = s => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function supervisionPlist(m,request) {
  const label=request?.label??m.label, script=request?'runner.mjs':'service.mjs';
  const args=[m.node.realPath,path.join(m.runtimeRoot??root,'src/supervision',script),m.base,...(request?[request.id]:[])];
  return `<?xml version="1.0"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>${xml(label)}</string><key>ProgramArguments</key><array>${args.map(a=>`<string>${xml(a)}</string>`).join('')}</array><key>WorkingDirectory</key><string>${xml(m.base)}</string><key>EnvironmentVariables</key><dict><key>PATH</key><string>/usr/bin:/bin</string><key>WORKFLOW_LOCK_PYTHON</key><string>${xml(m.python.realPath)}</string></dict><key>RunAtLoad</key><true/><key>KeepAlive</key><${request?'false':'true'}/><key>AbandonProcessGroup</key><false/><key>ThrottleInterval</key><integer>2</integer><key>StandardOutPath</key><string>/dev/null</string><key>StandardErrorPath</key><string>/dev/null</string></dict></plist>\n`;
}
// macOS ps lstart is only second precision. Supervision requires libproc birth microseconds.
export async function attemptIdentity(pid) {
  if (process.platform !== 'darwin') return fallbackIdentity(pid);
  if (!Number.isInteger(pid) || pid < 1) return null;
  try {
    const { stdout } = await exec(process.env.WORKFLOW_LOCK_PYTHON ?? '/usr/bin/python3',
      [path.join(root, 'src/supervision/process-identity.py'), String(pid)],
      { timeout: 2000, maxBuffer: 4096, env: { PATH: '/usr/bin:/bin', LC_ALL: 'C', TZ: 'UTC' } });
    const value = JSON.parse(stdout);
    if (value.pid !== pid || value.native !== true || !/^\d+:\d+$/.test(value.birth)) throw new Error('Unknown birth');
    return value;
  } catch {
    // A failed inspector is not evidence of process death. ESRCH proves absence;
    // a live or inaccessible PID remains unknown and cannot authorize a signal.
    try { process.kill(pid, 0); }
    catch (error) { if (error.code === 'ESRCH') return null; }
    return { pid, unknown: true };
  }
}
export async function observeAttemptIdentity(expected) {
  if (!expected || expected.unknown) return 'unknown';
  const actual = await attemptIdentity(expected.pid);
  if (!actual) return 'gone';
  if (actual.unknown) return 'unknown';
  const matching = actual.birth === expected.birth && actual.boot === expected.boot &&
    (process.platform === 'darwin' ? actual.native === true : actual.commandHash === expected.commandHash);
  return matching ? 'alive' : 'mismatch';
}
export async function attemptIdentityMatches(expected) {
  return await observeAttemptIdentity(expected) === 'alive';
}
const integrity = r => { const { integrity: ignored, ...body } = r; return digestAttempt(body); };
const transitions = {
  prepared: ['owned','cancelling','uncertain','needs_reconciliation','reconciled'],
  owned: ['running','cancelling','uncertain','needs_reconciliation','reconciled'],
  running: ['exited','cancelling','uncertain','needs_reconciliation','reconciled'],
  exited: ['validated','failed','uncertain','needs_reconciliation','reconciled'],
  validated: ['promoted','uncertain','needs_reconciliation','reconciled'],
  cancelling: ['cancelled','uncertain','needs_reconciliation','reconciled'],
  failed: ['reconciled'], cancelled: ['reconciled'], uncertain: ['reconciled'],
  needs_reconciliation: ['reconciled'], reconciled: [], promoted: []
};
const agentPath = label => path.join(os.homedir(),'Library/LaunchAgents',`${label}.plist`);
function jobMatches(m,job,request) {
  const expected=[m.node.realPath,path.join(m.runtimeRoot??root,'src/supervision',request?'runner.mjs':'service.mjs'),m.base,...(request?[request.id]:[])];
  return job.loaded&&job.program===m.node.realPath&&JSON.stringify(job.argv)===JSON.stringify(expected);
}
async function closeService(m) {
  const prior=await jobState(m.label);
  if(prior.loaded&&!jobMatches(m,prior))throw new Error('Native supervisor belongs to a different workspace/runtime; no signal allowed.');
  if(!prior.loaded){const disk=await readBounded(agentPath(m.label),128000).then(b=>b.toString(),e=>{if(e.code==='ENOENT')return null;throw e;});if(disk!==null&&disk!==supervisionPlist(m))throw new Error('Unloaded supervisor plist binding is ambiguous; no deletion allowed.');}
  const birth=prior.pid?await attemptIdentity(prior.pid):null;
  if(prior.pid&&birth?.unknown)throw new Error('Supervisor identity unavailable: lifecycle mutation refused.');
  await stopLaunchAgent(m.label);
  for(let n=0;n<100;n++){
    if(!(await jobState(m.label)).loaded&&(!birth||!await attemptIdentityMatches(birth)))return;
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  throw new Error('Previous supervisor has not fully closed.');
}
async function bootstrapService(m) {
  // bootout can return before launchd finishes reaping a KeepAlive service.
  // Re-delivery is limited to this inspection service, never an adapter job.
  for(let n=0;n<20;n++){
    try { await exec('/bin/launchctl',['bootstrap',`gui/${process.getuid()}`,agentPath(m.label)]);return; }
    catch(error){if(error.code!==5||(await jobState(m.label)).loaded)throw new Error('Supervisor bootstrap failed; inspect native state.');await new Promise(resolve=>setTimeout(resolve,100));}
  }
  throw new Error('Supervisor bootstrap did not complete.');
}
export async function ensureChannel(store,id,{create=false}={}) {
  const file=channelPath(store,id),dir=path.dirname(file);await safePath(dir);
  if(create)await fs.mkdir(dir,{recursive:true,mode:0o700});
  const stat=await fs.lstat(dir);
  if(!stat.isDirectory()||stat.uid!==process.getuid()||(stat.mode&0o777)!==0o700)throw new Error('Ownership channel directory is unsafe.');
  if(!create){const socket=await fs.lstat(file);if(!socket.isSocket()||socket.uid!==process.getuid()||(socket.mode&0o777)!==0o600)throw new Error('Ownership channel is unsafe.');}
  return file;
}
async function removeChannel(store,id) {
  const dir=path.dirname(channelPath(store,id));await safePath(dir);
  const stat=await fs.lstat(dir).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
  if(!stat)return;
  if(!stat.isDirectory()||stat.uid!==process.getuid()||(stat.mode&0o777)!==0o700)throw new Error('Unsafe channel cleanup refused.');
  await fs.rm(dir,{recursive:true});
}
function validateOutputRules(rules,outputs) {
  if(!rules||typeof rules!=='object'||Array.isArray(rules))throw new Error('Invalid output rules.');
  for(const [name,r] of Object.entries(rules)){
    if(!outputs.includes(name)||!r||r.kind!=='png'||Object.keys(r).some(k=>!['kind','width','height'].includes(k))||['width','height'].some(k=>r[k]!==undefined&&(!Number.isInteger(r[k])||r[k]<1||r[k]>8192)))throw new Error('Invalid output rule.');
  }
}
export async function jobState(label) {
  if(!/^work\.0x2f\.supervision\.[a-f0-9-]{36}(\.attempt\.[a-f0-9]{64})?$/.test(label))throw new Error('Invalid supervision label.');
  try { const {stdout}=await exec('/bin/launchctl',['print',`gui/${process.getuid()}/${label}`],{timeout:3000,maxBuffer:128000});const block=stdout.match(/arguments = \{\n([\s\S]*?)\n[ \t]*\}/)?.[1];return {loaded:true,pid:Number(stdout.match(/^\s*pid = (\d+)/m)?.[1])||null,program:stdout.match(/^\s*program = (.+)$/m)?.[1]??null,argv:block?.split('\n').map(line=>line.trim())??null}; }
  catch(e){if(e.code===113&&e.stderr?.includes('Could not find service'))return {loaded:false,pid:null};throw new Error('Launchd job state cannot be established.');}
}
export async function groupMembers(pgid) {
  if(!Number.isInteger(pgid)||pgid<2)throw new Error('Unknown process group.');
  // The inspecting ps inherits the runner group. Exclude precisely that child, never a command name.
  let inspector;
  const stdout=await new Promise((resolve,reject)=>{
    const child=execFile('/bin/ps',['-axo','pid=,pgid='],{timeout:3000,maxBuffer:1000000},(error,out)=>error?reject(error):resolve(out));
    inspector=child.pid;
  });
  return stdout.trim().split('\n').map(x=>x.trim().split(/\s+/).map(Number)).filter(x=>x[1]===pgid&&x[0]!==inspector).map(x=>x[0]);
}
export async function readInstallation(store) {
  const m=await store.readJson(configFile(store));
  if(m.schemaVersion!==1||m.base!==await fs.realpath(store.base)||!/^[a-f0-9-]{36}$/.test(m.workspaceId)||m.label!==`work.0x2f.supervision.${m.workspaceId}`)throw new Error('Invalid supervisor installation binding.');
  return m;
}
export async function supervisionStatus(store) {
  if(!await store.exists(configFile(store)))return {installed:false,running:false,matching:false,healthy:false};
  const m=await readInstallation(store);if(m.disabled)return {installed:false,running:false,matching:false,healthy:false,retained:true};const job=await jobState(m.label);
  let pinsMatch = true;
  for (const pin of [m.node,m.python]) try { await verifyExecutable({...pin,command:pin.realPath}); } catch { pinsMatch=false; }
  const matching=pinsMatch && jobMatches(m,job) && m.runtimeFingerprint===await runtimeFingerprint() && await store.readText(agentPath(m.label),null)===supervisionPlist(m);
  const health=await store.readJson(path.join(supervisionDir(store),'health.json')).catch(()=>null);
  const alive=job.pid&&await attemptIdentityMatches(health?.identity);
  return {installed:true,running:Boolean(alive&&job.pid===health.identity.pid),matching,healthy:Boolean(alive&&matching&&health?.runtimeFingerprint===m.runtimeFingerprint&&Date.now()-Date.parse(health.at)<5000),label:m.label};
}
async function closeAttempt(store,id,reason) {
  for(let n=0;n<100;n++){
    const closed=await attemptLock(store,id,async()=>{
      const r=await readAttempt(store,id),job=await jobState(r.request.label);
      if(!job.pid)return !r.pgid||!(await groupMembers(r.pgid)).length;
      await stopAttemptJob(store,r,reason);return false;
    });
    if(closed)return;
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  throw new Error('Ambiguous or surviving attempt owner: lifecycle mutation blocked without signalling foreign processes.');
}
export async function manageSupervision(store,operation) {
  if(operation==='status')return supervisionStatus(store);
  if(process.platform!=='darwin')throw new Error('Supervision currently requires macOS launchd.');
  if(loadedRuntimeFingerprint!==await runtimeFingerprint())throw new Error('Runtime changed; restart CLI/UI before supervisor lifecycle changes.');
  if(!['install','repair','uninstall'].includes(operation))throw new Error('Use supervisor install|repair|status|uninstall.');
  const prior=await store.exists(configFile(store))?await readInstallation(store):null;
  if(operation==='uninstall'){
    if(!prior)return {uninstalled:false};
    for(const r of await listAttempts(store)) {await closeAttempt(store,r.request.id,'supervisor_uninstall');await stopLaunchAgent(r.request.label);await fs.rm(agentPath(r.request.label),{force:true});
      for(let n=0;n<100&&(await jobState(r.request.label)).pid;n++)await new Promise(resolve=>setTimeout(resolve,50));
      if(!(await jobState(r.request.label)).pid&&(!r.pgid||!(await groupMembers(r.pgid)).length))await removeChannel(store,r.request.id);
    }
    await closeService(prior);await fs.rm(agentPath(prior.label),{force:true});await store.writeJson(configFile(store),{...prior,disabled:true});await syncDirectory(supervisionDir(store));return {uninstalled:true,attemptsRetained:true};
  }
  const id=prior?.workspaceId??randomUUID();
  const m={schemaVersion:1,workspaceId:id,label:`work.0x2f.supervision.${id}`,base:await fs.realpath(store.base),runtimeRoot:root,runtimeFingerprint:await runtimeFingerprint(),node:await executableIdentity(process.execPath),python:await executableIdentity(process.env.WORKFLOW_LOCK_PYTHON??'/usr/bin/python3')};
  if(prior){for(const r of await listAttempts(store))await closeAttempt(store,r.request.id,'runtime_repair');await closeService(prior);}
  await store.writeJson(configFile(store),m);await durableWrite(agentPath(m.label),supervisionPlist(m));await exec('/usr/bin/plutil',['-lint',agentPath(m.label)]);await bootstrapService(m);
  for(let n=0;n<100;n++){const s=await supervisionStatus(store);if(s.healthy)return s;await new Promise(r=>setTimeout(r,50));}throw new Error('Supervisor did not become healthy.');
}
export function validateAdapterPolicy(p) {
  if(!p||p.processGroup!=='inherit'||p.daemonizes!==false||p.unattended!==true||p.network!==false||p.paid!==false)throw new Error('Unattended adapter requires reviewed inherited-group, no-daemonize, local/unpaid policy. Network/paid providers remain NO-GO.');
  if(Object.keys(p).some(n=>!['processGroup','daemonizes','unattended','network','paid','credentialEnv'].includes(n)))throw new Error('Unknown supervision policy field.');
  if(!Array.isArray(p.credentialEnv??[])||(p.credentialEnv??[]).length>32||new Set(p.credentialEnv??[]).size!==(p.credentialEnv??[]).length||(p.credentialEnv??[]).some(n=>!(/^[A-Z][A-Z0-9_]{0,100}$/.test(n))))throw new Error('Invalid credential names.');
  if((p.credentialEnv??[]).some(n=>/^(PATH|HOME|SHELL|TMPDIR|LANG|LC_|TZ|NODE_|DYLD_|LD_|PYTHON|WORKFLOW_)/.test(n)))throw new Error('Credential name can alter execution environment.');
  return p;
}
export function externalDefinition(d) { return Boolean(d.adapters?.image)||d.previewFirstTopic===true; }
export async function assertDefinitionSupervised(store,d) {
  if(!externalDefinition(d))return;
  validateAdapterPolicy(d.adapters.supervision);
  if(d.adapters.image)validateAdapterPolicy({...d.adapters.supervision,credentialEnv:d.adapters.image.credentialEnv??[]});
  if(d.permissions.commandAdapters!==true)throw new Error('Explicit commandAdapters permission is required.');
  if([...(d.adapters.supervision.credentialEnv??[]),...(d.adapters.image?.credentialEnv??[])].some(n=>!process.env[n]))throw new Error('Declared adapter credential is absent.');
  if(d.permissions.unattendedAdapters!==true)throw new Error('Explicit unattendedAdapters permission is required.');
  if(!(await supervisionStatus(store)).healthy)throw new Error('Unattended workflow is blocked: supervisor absent, unhealthy or drifted.');
}
export async function readAttempt(store,id) {
  const r=await store.readJson(path.join(attemptDir(store,id),'receipt.json'));
  const req=r.request;
  if(r.schemaVersion!==1||req?.schemaVersion!==1||req.id!==id||digestAttempt(req)!==r.requestDigest||integrity(r)!==r.integrity||!['prepared','owned','running','exited','validated','promoted','cancelling','cancelled','failed','uncertain','needs_reconciliation','reconciled'].includes(r.state))throw new Error('Corrupt attempt receipt; no signal or promotion is allowed.');
  if(!Number.isSafeInteger(req.taskId)||!Number.isSafeInteger(req.run)||req.run<1||typeof req.slug!=='string'||!/^[-a-zA-Z0-9]{1,128}$/.test(req.operationId)||!req.worker?.native||!Number.isInteger(req.worker.pid)||!Array.isArray(req.outputs)||req.outputs.some(n=>!/^[-a-zA-Z0-9_.]+$/.test(n)||n.startsWith('.'))||!Number.isInteger(req.maxBytes)||req.maxBytes<1||req.maxBytes>64000000||!Number.isInteger(req.timeoutMs)||req.timeoutMs<100||req.timeoutMs>3600000)throw new Error('Invalid attempt request binding.');
  validateAdapterPolicy(req.policy);
  const m=await readInstallation(store);
  if(req.label!==`${m.label}.attempt.${id}`||req.workspaceId!==m.workspaceId)throw new Error('Attempt installation identity mismatch.');
  return r;
}
export async function listAttempts(store) {
  const dir=path.join(supervisionDir(store),'attempts');await safePath(dir);
  const entries=await fs.readdir(dir).catch(e=>{if(e.code==='ENOENT')return [];throw e;});
  const out=[];for(const id of entries){if(!/^[a-f0-9]{64}$/.test(id))throw new Error('Invalid attempt directory.');if(await store.exists(path.join(attemptDir(store,id),'receipt.json')))out.push(await readAttempt(store,id));}return out;
}
export async function writeAttempt(store,r,patch) {
  const current=await readAttempt(store,r.request.id);if(current.integrity!==r.integrity)throw new Error('Concurrent/stale receipt writer.');
  if(patch.state&&patch.state!==r.state&&!transitions[r.state].includes(patch.state))throw new Error('Non-monotonic attempt transition.');
  const next={...r,...patch,at:new Date().toISOString()};next.integrity=integrity(next);await store.writeJson(path.join(attemptDir(store,r.request.id),'receipt.json'),next);return next;
}
export async function stopAttemptJob(store,r,reason) {
  const job=await jobState(r.request.label);
  if(!job.pid)return true;
  if(['promoted','reconciled','failed','cancelled','uncertain','needs_reconciliation'].includes(r.state))return false;
  const installation=await readInstallation(store);
  if(job.pid&&(!jobMatches(installation,job,r.request)||!r.owner||job.pid!==r.owner.pid||!await attemptIdentityMatches(r.owner))) {await writeAttempt(store,r,{state:'uncertain',reason:'owner_identity_mismatch'});return false;}
  if(!job.pid)return true;
  await writeAttempt(store,r,{state:'cancelling',reason});
  // Unique validated launchd job identity is authority; never signal a PID/PGID.
  await exec('/bin/launchctl',['kill','SIGKILL',`gui/${process.getuid()}/${r.request.label}`]);return true;
}
export async function reconcileAttempt(store,id,decision) {
  return attemptLock(store,id,async()=>{
    let r=await readAttempt(store,id);const job=await jobState(r.request.label);
    if(job.pid)throw new Error('Attempt is still managed/running; cancel and wait before reconciliation.');
    if(r.pgid&&(await groupMembers(r.pgid)).length)throw new Error('Surviving or reused group: no promotion/cleanup/signalling is safe.');
    if(!['confirmed-effect','confirmed-no-effect','abandon'].includes(decision))throw new Error('Reconcile with confirmed-effect|confirmed-no-effect|abandon; this never retries a call.');
    if(!['uncertain','needs_reconciliation','cancelled','failed','exited','validated','prepared','owned','running','cancelling'].includes(r.state))throw new Error('Attempt does not need reconciliation.');
    return writeAttempt(store,r,{state:'reconciled',resolution:decision});
  });
}
export async function cleanupAttempt(store,id) {
  return attemptLock(store,id,async()=>{
    const r=await readAttempt(store,id);if(r.state!=='reconciled')throw new Error('Explicit reconciliation is required before staging cleanup.');
    if((await jobState(r.request.label)).pid||r.pgid&&(await groupMembers(r.pgid)).length)throw new Error('Owned/surviving processes prevent cleanup.');
    await stopLaunchAgent(r.request.label);await fs.rm(agentPath(r.request.label),{force:true});await fs.chmod(path.join(attemptDir(store,id),'output'),0o700).catch(e=>{if(e.code!=='ENOENT')throw e;});await fs.rm(path.join(attemptDir(store,id),'output'),{recursive:true,force:true});await removeChannel(store,id);await syncDirectory(attemptDir(store,id));return writeAttempt(store,r,{cleaned:true});
  });
}
export async function prepareAttempt(store,task,{operationId,argv,pin,policy,outputs,outputRules={},inputs={},timeoutMs=30000,maxBytes=64000000,provider={},testCrashAt}) {
  validateAdapterPolicy(policy);
  if(task.workflow?.definition.permissions.commandAdapters!==true||task.workflow?.definition.permissions.unattendedAdapters!==true)throw new Error('External command/unattended adapter permission is absent.');
  if(task.workflow.runtimeFingerprint!==loadedRuntimeFingerprint)throw new Error('Worker runtime is stale.');
  if(!(await supervisionStatus(store)).healthy)throw new Error('Supervisor is unavailable/unhealthy/drifted.');
  if(typeof operationId!=='string'||!/^[-a-zA-Z0-9]{1,128}$/.test(operationId)||!Array.isArray(argv)||argv.length<1||argv.length>100||argv.some(a=>typeof a!=='string'||a.length>8000))throw new Error('Invalid adapter operation.');
  if(!Array.isArray(outputs)||!outputs.length||outputs.length>32||outputs.some(f=>!/^[-a-zA-Z0-9_.]+$/.test(f)||f.startsWith('.'))||new Set(outputs).size!==outputs.length||!Number.isInteger(maxBytes)||maxBytes<1||maxBytes>64000000||!Number.isInteger(timeoutMs)||timeoutMs<100||timeoutMs>3600000)throw new Error('Invalid output/time/resource limits.');
  validateOutputRules(outputRules,outputs);
  if(!inputs||typeof inputs!=='object')throw new Error('Invalid inputs.');
  const inputValues=Object.values(inputs);
  if(!inputs||typeof inputs!=='object'||Array.isArray(inputs)||inputValues.length>32||inputValues.some(b=>typeof b!=='string'&&!Buffer.isBuffer(b))||inputValues.reduce((n,b)=>n+Buffer.byteLength(b),0)>maxBytes)throw new Error('Input limits exceeded.');
  if(!provider||typeof provider!=='object'||Array.isArray(provider)||Object.keys(provider).some(n=>!['requestIdentity','idempotencyKey','statusLookup'].includes(n))||Object.values(provider).some(v=>typeof v!=='string'||v.length>8000))throw new Error('Invalid credential-free provider request identity.');
  const names=policy.credentialEnv??[],values=Object.fromEntries(names.map(n=>{if(!process.env[n])throw new Error('Declared credential is absent.');return [n,process.env[n]];}));
  if(Object.values(values).some(v=>Buffer.byteLength(v)>8192)||Object.values(values).reduce((n,v)=>n+Buffer.byteLength(v),0)>64000)throw new Error('Credential packet size limit.');
  if(Object.values(values).some(v=>JSON.stringify({argv,pin,policy,provider,outputRules,operationId,outputs,inputNames:Object.keys(inputs)}).includes(v)||Object.values(inputs).some(b=>Buffer.from(b).includes(Buffer.from(v)))))throw new Error('Credential-bearing request refused.');
  if(argv[0]!==pin?.command&&argv[0]!==pin?.realPath)throw new Error('Argv executable differs from pin.');
  await verifyExecutable(pin);const m=await readInstallation(store), run=currentRunNumber(task),id=digestAttempt({task:task.slug,run,operationId});
  return workflowLock(store,()=>withLock(path.join(supervisionDir(store),'intent-lock'),()=>attemptLock(store,id,async()=>{
    if(await store.exists(path.join(attemptDir(store,id),'receipt.json'))){const r=await readAttempt(store,id);if(digestAttempt({argv,pin,policy,outputs,outputRules,timeoutMs,maxBytes,inputs,provider})!==r.request.payloadDigest)throw new Error('Operation ID payload conflict.');return r;}
    const fresh=await store.findTask(task.id);
    if(fresh.status!=='working'||currentRunNumber(fresh)!==run||fresh.execution.launchToken!==task.execution.launchToken||(await store.readCancelRequest(fresh))?.run===run)throw new Error('Run is no longer authorized for an external attempt.');
    const earlier=await listAttempts(store);
    if(earlier.some(r=>r.request.taskId===task.id&&r.request.operationId===operationId&&r.request.id!==id))throw new Error('A conscious retry requires a new operation ID.');
    const pending=earlier.filter(r=>r.request.taskId===task.id&&!['promoted','reconciled'].includes(r.state));if(pending.length)throw new Error('Another attempt needs completion/reconciliation before a new external intent.');
    if(Object.keys(inputs).some(name=>Object.values(values).some(v=>name.includes(v))))throw new Error('Credential-bearing input filename refused.');
    const dir=attemptDir(store,id);await fs.mkdir(path.join(dir,'output'),{recursive:true,mode:0o700});
    for(const [name,bytes] of Object.entries(inputs)){if(!/^[-a-zA-Z0-9_.]+$/.test(name)||name.startsWith('.'))throw new Error('Invalid input filename.');const b=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes);if(b.length>maxBytes)throw new Error('Input size limit.');await durableWrite(path.join(dir,'input',name),typeof bytes==='string'?bytes.replaceAll('{outputDir}',path.join(dir,'output')).replaceAll('{inputDir}',path.join(dir,'input')):bytes);}
    const worker=await attemptIdentity(process.pid);if(!worker||worker.unknown)throw new Error('Worker identity cannot be established.');
    const request={schemaVersion:1,id,operationId,workspaceId:m.workspaceId,label:`${m.label}.attempt.${id}`,taskId:task.id,slug:task.slug,run,token:task.execution.launchToken,definitionDigest:task.workflow.definition.digest,runtimeFingerprint:loadedRuntimeFingerprint,worker,argv,pin,policy,outputs,outputRules,timeoutMs,maxBytes,provider,payloadDigest:digestAttempt({argv,pin,policy,outputs,outputRules,timeoutMs,maxBytes,inputs,provider}),...(process.env.WORKFLOW_TEST_MODE==='1'&&testCrashAt?{testCrashAt}: {})};
    if(Object.values(values).some(v=>JSON.stringify(request).includes(v)))throw new Error('Credential-bearing request metadata refused.');
    const r={schemaVersion:1,request,requestDigest:digestAttempt(request),state:'prepared',at:new Date().toISOString()};r.integrity=integrity(r);await store.writeJson(path.join(dir,'receipt.json'),r);crashPoint('attempt.prepared');
    await durableWrite(agentPath(request.label),supervisionPlist(m,request));crashPoint('attempt.plist-durable');await exec('/bin/launchctl',['bootstrap',`gui/${process.getuid()}`,agentPath(request.label)]);return r;
  })));
}
export async function validateAttemptOutputs(store,r,secrets=[],scrubSecrets=false) {
  const dir=path.join(attemptDir(store,r.request.id),'output');await safePath(dir);const names=await fs.readdir(dir);
  if(names.some(n=>!r.request.outputs.includes(n))||r.request.outputs.some(n=>!names.includes(n)))throw new Error('Unexpected or missing adapter output.');
  let total=0;const files=[];for(const name of names.sort()){const bytes=await readBounded(path.join(dir,name),r.request.maxBytes);total+=bytes.length;if(secrets.some(s=>bytes.includes(Buffer.from(s)))){if(scrubSecrets)await fs.rm(path.join(dir,name));throw new Error('Credential-bearing output refused.');}if(total>r.request.maxBytes)throw new Error('Output size limit.');const rule=r.request.outputRules?.[name];
    if(rule){const png=bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&bytes.toString('ascii',12,16)==='IHDR';if(!png||bytes.readUInt32BE(16)<1||bytes.readUInt32BE(20)<1||bytes.readUInt32BE(16)>8192||bytes.readUInt32BE(20)>8192||(rule.width&&bytes.readUInt32BE(16)!==rule.width)||(rule.height&&bytes.readUInt32BE(20)!==rule.height))throw new Error('Invalid PNG output header/dimensions.');}
    files.push({path:name,bytes:bytes.length,sha256:digestAttempt(bytes)});}
  return {schemaVersion:1,attemptId:r.request.id,requestDigest:r.requestDigest,files};
}
export async function verifyAttemptManifest(store,r) {
  const manifest=await store.readJson(path.join(attemptDir(store,r.request.id),'manifest.json'));
  if(manifest.schemaVersion!==1||digestAttempt(manifest)!==r.manifestDigest||manifest.requestDigest!==r.requestDigest||manifest.attemptId!==r.request.id||!Array.isArray(manifest.files)||manifest.files.length!==r.request.outputs.length||new Set(manifest.files.map(f=>f.path)).size!==manifest.files.length||manifest.files.some(f=>!r.request.outputs.includes(f.path)||!Number.isSafeInteger(f.bytes)||f.bytes<0||f.bytes>r.request.maxBytes||!/^[a-f0-9]{64}$/.test(f.sha256))||manifest.files.reduce((n,f)=>n+f.bytes,0)>r.request.maxBytes)throw new Error('Corrupt attempt manifest.');
  return manifest;
}
export async function verifyAttemptArchive(store,r) {
  const manifest=await verifyAttemptManifest(store,r),dir=attemptDir(store,r.request.id);
  const archive=path.join(dir,'archive'),directory=await store.exists(archive)?archive:path.join(dir,'output');
  await safePath(directory);const names=await fs.readdir(directory);
  if(names.length!==manifest.files.length||names.some(n=>!r.request.outputs.includes(n)))throw new Error('Unexpected archived file.');
  for(const f of manifest.files){const b=await readBounded(path.join(directory,f.path),r.request.maxBytes);if(b.length!==f.bytes||digestAttempt(b)!==f.sha256)throw new Error('Archived output integrity failed.');}
  return manifest;
}
export async function promoteAttempt(store,id) {
  return workflowLock(store,()=>attemptLock(store,id,async()=>{
    const r=await readAttempt(store,id);if(!['validated','promoted'].includes(r.state))throw new Error('Only validated attempts can be promoted.');
    const task=await store.findTask(r.request.taskId);validateSnapshot(task.workflow.definition);
    if(r.request.runtimeFingerprint!==loadedRuntimeFingerprint||r.request.runtimeFingerprint!==await runtimeFingerprint())throw new Error('Runtime drift blocks promotion.');
    if(task.status!=='working'||currentRunNumber(task)!==r.request.run||task.execution.launchToken!==r.request.token||task.workflow.definition.digest!==r.request.definitionDigest||task.workflow.runtimeFingerprint!==r.request.runtimeFingerprint||!await attemptIdentityMatches(r.request.worker)||(await store.readCancelRequest(task))?.run===r.request.run)throw new Error('Stale/cancelled worker/run cannot promote an attempt.');
    if((await jobState(r.request.label)).pid||!r.pgid||(await groupMembers(r.pgid)).length)throw new Error('Attempt process group is not closed.');
    const dir=attemptDir(store,id),destination=path.join(dir,'archive');
    const manifest=await verifyAttemptManifest(store,r);
    if(!await store.exists(destination)){const actual=await validateAttemptOutputs(store,r);if(digestAttempt(actual)!==r.manifestDigest)throw new Error('Outputs changed since validation.');await fs.rename(path.join(dir,'output'),destination);await syncDirectory(dir);crashPoint('attempt.archive-renamed');}
    await verifyAttemptArchive(store,r);
    if(r.state!=='promoted')await writeAttempt(store,r,{state:'promoted'});return {id,state:'promoted',directory:destination,manifest};
  }));
}
export async function supervisedRun(store,task,options,{signal,onState}={}) {
  signal?.throwIfAborted();const receipt=await prepareAttempt(store,task,options),id=receipt.request.id;
  let sent=false,lastState;
  for(let n=0;n<Math.ceil(receipt.request.timeoutMs/50)+300;n++){
    let r=await readAttempt(store,id);
    if(r.state!==lastState){lastState=r.state;await onState?.({id,state:r.state});}
    if(signal?.aborted){await attemptLock(store,id,async()=>stopAttemptJob(store,await readAttempt(store,id),'user_cancel'));throw new Error('Adapter cancelled.');}
    if(r.state==='owned'&&!sent){
      const env=Object.fromEntries((r.request.policy.credentialEnv??[]).map(name=>[name,process.env[name]]));
      const channel=await ensureChannel(store,id);
      await new Promise((resolve,reject)=>{const socket=net.createConnection(channel);socket.setTimeout(2000);socket.on('connect',()=>socket.end(JSON.stringify({id,env})));socket.on('timeout',()=>{socket.destroy();reject(new Error('Ownership gate unavailable.'));});socket.on('error',()=>reject(new Error('Ownership gate unavailable.')));socket.on('close',resolve);});sent=true;
    }
    if(r.state==='validated'||r.state==='promoted'){
      if(!(await jobState(r.request.label)).pid)return promoteAttempt(store,id);
    }
    if(['failed','cancelled','uncertain','needs_reconciliation','reconciled'].includes(r.state))throw new Error(`Adapter failed: external attempt ${id} is ${r.state}; reconcile explicitly. No automatic retry.`);
    await new Promise(r=>setTimeout(r,50));
  }throw new Error('Supervised attempt requires reconciliation; no automatic retry.');
}

export async function attemptProjection(store, task) {
  try {
    return (await listAttempts(store)).filter(r=>r.request.taskId===task.id).map(r=>({
      id:r.request.id,run:r.request.run,operationId:r.request.operationId,state:r.state,
      supervised:Boolean(r.owner)&&!['uncertain','needs_reconciliation'].includes(r.state),reason:r.reason??null,worker:r.request.worker.pid,supervisor:r.owner?.pid??null,
      groupClosed:r.groupClosed===true,reconciliation:r.resolution??null
    }));
  } catch { return [{state:'uncertain',reason:'corrupt_or_uninspectable_receipt'}]; }
}
export async function attemptAction(store, action, id, decision) {
  if(action==='status')return id?readAttempt(store,id):listAttempts(store);
  if(action==='reconcile')return reconcileAttempt(store,id,decision);
  if(action==='cleanup')return cleanupAttempt(store,id);
  if(action==='cancel')return attemptLock(store,id,async()=>({stopped:await stopAttemptJob(store,await readAttempt(store,id),'user_cancel')}));
  throw new Error('Use attempt status [id] | cancel id | reconcile id confirmed-effect|confirmed-no-effect|abandon | cleanup id. Retry requires explicit reconciliation and a new operation ID.');
}
