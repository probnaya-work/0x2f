// Explicit SSH control of host-owned workspaces. No task/file/credential
// migration and no failover: the remote CLI performs the actual execution.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { WorkError } from './core/errors.mjs';
const exec = promisify(execFile);
export async function hostIdentity() {
  let raw, source;
  if (process.platform === 'linux') {
    try { raw=(await fs.readFile('/etc/machine-id','utf8')).trim(); source='linux machine-id'; } catch {}
  } else if (process.platform === 'darwin') {
    try { const {stdout}=await exec('/usr/sbin/ioreg',['-rd1','-c','IOPlatformExpertDevice'],{timeout:3000}); raw=/"IOPlatformUUID"\s*=\s*"([^"]+)"/.exec(stdout)?.[1]; source='platform UUID'; } catch {}
  }
  return { id:raw?createHash('sha256').update(raw).digest('hex'):null, identitySource:raw?source:'unavailable', label:os.hostname(), platform:process.platform, arch:process.arch };
}
export function shellQuote(text) { return "'"+String(text).replaceAll("'", "'\\''")+"'"; }
export async function loadHosts(base) {
  let config;
  try { config=JSON.parse(await fs.readFile(path.join(base,'.work/hosts.json'),'utf8')); }
  catch(e) { if(e.code==='ENOENT') return []; throw new WorkError(`Invalid hosts config: ${e.message}`); }
  if(!Array.isArray(config)) throw new WorkError('hosts.json must contain an array of explicit SSH host profiles.');
  const ids=new Set();
  for(const h of config) {
    if(!h || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(h.id) || ids.has(h.id) || h.id==='local') throw new WorkError('Host profile ids must be unique lowercase names, excluding local.');
    ids.add(h.id);
    if(typeof h.target!=='string'||!/^[a-zA-Z0-9_][a-zA-Z0-9_.@:-]*$/.test(h.target)) throw new WorkError('Host target must be a trusted SSH target, never options or a shell command.');
    for(const key of ['workspace','node','cli']) if(typeof h[key]!=='string'||!h[key].startsWith('/')||h[key].includes('\0')) throw new WorkError(`Host ${key} must be an absolute remote path.`);
    if(typeof h.machineId!=='string'||!/^[a-f0-9]{64}$/.test(h.machineId)) throw new WorkError('Pin the actual remote machineId before enabling host execution.');
  }
  return config;
}
const sshArgs=h=>['-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10','-o','ControlMaster=no','-o','ControlPath=none','-o','ServerAliveInterval=5','-o','ServerAliveCountMax=1','--',h.target];
export async function inspectHost(h) {
  // This dependency-free probe also works before installing the candidate.
  const script=`const fs=require('node:fs'),os=require('node:os'),c=require('node:crypto');const raw=fs.readFileSync('/etc/machine-id','utf8').trim();console.log(JSON.stringify({id:c.createHash('sha256').update(raw).digest('hex'),platform:process.platform,label:os.hostname()}));`;
  const {stdout}=await exec('ssh',[...sshArgs(h),`${shellQuote(h.node)} -e ${shellQuote(script)}`],{timeout:15000,maxBuffer:8192});
  const actual=JSON.parse(stdout);
  if(actual.id!==h.machineId) throw new WorkError('SSH target machine identity changed. No execution was sent; inspect the host and explicitly update its pin.',409);
  return actual;
}
export async function runOnHost(base,id,args,{stdio='inherit'}={}) {
  const h=(await loadHosts(base)).find(h=>h.id===id);
  if(!h) throw new WorkError(`Unknown host ${id}; configure .work/hosts.json explicitly.`);
  const actual=await inspectHost(h);
  if(!args.length) args=['status'];
  const command=`cd ${shellQuote(h.workspace)} && exec ${[h.node,h.cli,...args].map(shellQuote).join(' ')}`;
  if(stdio==='inherit') process.stdout.write(`Host ${h.id} · ${actual.label} · ${actual.id.slice(0,12)} · ${h.workspace}\n`);
  return new Promise((resolve,reject)=>{
    const child=spawn('ssh',[...sshArgs(h),command],{stdio});
    child.once('error',reject);child.once('close',(code,signal)=>resolve({code:code??1,signal,host:actual}));
  });
}
