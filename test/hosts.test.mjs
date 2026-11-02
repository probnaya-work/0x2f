import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { shellQuote, loadHosts } from '../src/hosts.mjs';
test('SSH remote command quoting preserves apostrophes, newlines and shell metacharacters literally',()=>{
 const value="space ' quote\n$(touch /SHOULD-NOT-EXIST); `echo injected`";
 assert.equal(execFileSync('/bin/sh',['-c','printf %s '+shellQuote(value)],{encoding:'utf8'}),value);
});
test('host execution profiles require explicit absolute workspace and machine pin, refuse option injection',async t=>{
 const base=await fs.mkdtemp(path.join(os.tmpdir(),'2f-hosts-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));await fs.mkdir(path.join(base,'.work'));
 const h={id:'thinkcentre',target:'user@host',workspace:'/work/project',node:'/bin/node',cli:'/pkg/src/cli.mjs',machineId:'a'.repeat(64)};
 for(const bad of [{...h,target:'-oProxyCommand=evil'},{...h,machineId:null},{...h,workspace:'relative'}, {...h,id:'local'}]){
  await fs.writeFile(path.join(base,'.work/hosts.json'),JSON.stringify([bad]));await assert.rejects(()=>loadHosts(base));
 }
 await fs.writeFile(path.join(base,'.work/hosts.json'),JSON.stringify([h]));assert.equal((await loadHosts(base))[0].id,'thinkcentre');
});
