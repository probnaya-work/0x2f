import fs from 'node:fs/promises';import path from 'node:path';import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';import assert from 'node:assert/strict';
const dir=path.join(path.dirname(fileURLToPath(import.meta.url)),'evidence');const meta=JSON.parse(await fs.readFile(path.join(dir,'installation.json'),'utf8'));
const npm=await fs.realpath('/Users/bogart/.n/bin/npm');const home=path.join(meta.root,'setup-npm-home');
const env={PATH:process.env.PATH,HOME:home,TMPDIR:process.env.TMPDIR??'/tmp',npm_config_cache:path.join(meta.root,'public-npm-cache'),npm_config_userconfig:path.join(home,'empty-user.npmrc'),npm_config_globalconfig:path.join(home,'empty-global.npmrc'),npm_config_audit:'false',npm_config_fund:'false'};
const calls=[];
function run(args){const r=spawnSync(process.execPath,[npm,...args],{cwd:meta.workspace,env,encoding:'utf8',timeout:60000});calls.push({at:new Date().toISOString(),command:[process.execPath,npm,...args],environmentKeys:Object.keys(env),exitCode:r.status,stdout:r.stdout,stderr:r.stderr});assert.equal(r.status,0,r.stderr);}
run(['cache','add','ws@8.21.3','ws@8.22.1','@noble/ciphers@1.3.0','@noble/hashes@1.8.0','--registry','https://registry.npmjs.org','--ignore-scripts']);
run(['install','--global','--prefix',path.join(meta.root,'offline-pack-probe'),'--offline','--ignore-scripts','--no-audit','--no-fund',path.join(dir,'0x2f-0.1.4.tgz')]);
await fs.writeFile(path.join(dir,'cache-pack-probe.json'),JSON.stringify({publicRegistryOnly:true,existingDependenciesOnly:true,inheritedCredentials:false,calls},null,2));console.log('Public cache provisioned; offline package install passed.');
