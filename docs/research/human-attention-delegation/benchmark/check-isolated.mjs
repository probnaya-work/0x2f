// Existing regression suite with native harnesses absent and no inherited credentials.
// Complements, never replaces, the recorded current-host failures.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
const here=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(here,'../../../../');
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'0x2f-attention-check-'));
await fs.mkdir(path.join(temp,'bin')); await fs.mkdir(path.join(temp,'home'));
await fs.symlink(process.execPath,path.join(temp,'bin/node'));
const npm='/opt/homebrew/lib/node_modules/npm/bin/npm-cli.js';
await fs.access(npm); await fs.symlink(npm,path.join(temp,'bin/npm'));
const env={PATH:`${temp}/bin:/usr/bin:/bin:/usr/sbin:/sbin`,HOME:path.join(temp,'home'),TMPDIR:os.tmpdir(),LANG:'en_US.UTF-8',TERM:'xterm-256color',TZ:'Europe/Lisbon',npm_config_cache:path.join(temp,'npm-cache'),npm_config_offline:'true',npm_config_audit:'false',npm_config_fund:'false'};
// Optional public-package cache is copied; caller-owned contents are never changed.
if(process.argv[2]) {
  await fs.cp(path.resolve(process.argv[2]),path.join(temp,'distribution-cache'),{recursive:true});
  env.WORK_TEST_NPM_CACHE=path.join(temp,'distribution-cache');
}
const results=[];
try {
  for(const [label,args] of [['check',['run','check']],['test',['test']]]) {
    const handle=await fs.open(path.join(here,'../evidence',`isolated-${label}.log`),'w');
    const started=new Date().toISOString();
    const p=spawn(process.execPath,[npm,...args],{cwd:repo,env,stdio:['ignore',handle.fd,handle.fd]});
    const code=await new Promise((resolve,reject)=>{p.once('error',reject);p.once('close',resolve);});
    await handle.close(); results.push({label,code,started,ended:new Date().toISOString()});
  }
} finally { await fs.rm(temp,{recursive:true,force:true}); }
await fs.writeFile(path.join(here,'../evidence/isolated-checks.json'),JSON.stringify({inheritedCredentials:false,nativeHarnessesOnPath:false,preseededPublicPackageCache:!!process.argv[2],node:process.version,results},null,2));
console.log(JSON.stringify(results)); if(results.some(r=>r.code!==0)) process.exitCode=1;
