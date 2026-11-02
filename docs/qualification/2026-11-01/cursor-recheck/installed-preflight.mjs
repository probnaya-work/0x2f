// Install this checkout in a separate prefix, then exercise the real public CLI.
// This deliberately stops at the unavailable-provider gate. No fixture harness.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=process.cwd();
const evidence=path.join(path.dirname(fileURLToPath(import.meta.url)),'evidence');
const trial=process.env.CURSOR_QUALIFICATION_DIR??path.resolve(root,'../cursor-compatibility-20261101');
const npmHome=path.join(trial,'npm-home');
const prefix=path.join(trial,'installed');
const artifacts=path.join(trial,'artifacts');
const workspace=path.join(trial,'workspace');
for(const dir of [npmHome,prefix,artifacts,workspace])await fs.mkdir(dir,{recursive:true});
const userConfig=path.join(npmHome,'empty-user.npmrc'),globalConfig=path.join(npmHome,'empty-global.npmrc');
await fs.writeFile(userConfig,'');await fs.writeFile(globalConfig,'');
const npmEnv={PATH:process.env.PATH,HOME:npmHome,TMPDIR:os.tmpdir(),NPM_CONFIG_USERCONFIG:userConfig,NPM_CONFIG_GLOBALCONFIG:globalConfig,
  NPM_CONFIG_CACHE:path.resolve(root,'../faithful-portability-use-20261101/public-npm-cache'),NPM_CONFIG_UPDATE_NOTIFIER:'false'};
const hash=data=>crypto.createHash('sha256').update(data).digest('hex');
const calls=[];
function run(label,command,args,cwd,env=process.env,expected=0){
 const r=spawnSync(command,args,{cwd,env,encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024});
 const record={label,command:[command,...args],cwd,exitCode:r.status,error:r.error?{code:r.error.code,message:r.error.message}:null,stdout:r.stdout??'',stderr:r.stderr??''};
 calls.push(record);assert.equal(r.error,undefined, label);assert.equal(r.status,expected,`${label}: ${record.stderr}`);return record;
}
const globalCLI=await fs.realpath(path.join(os.homedir(),'.n/bin/2f'));
const globalHashBefore=hash(await fs.readFile(globalCLI));
const pack=run('pack','npm',['pack','--json','--ignore-scripts','--offline','--pack-destination',artifacts],root,npmEnv);
const pkg=JSON.parse(pack.stdout)[0];assert.equal(pkg.version,'0.1.4');
const archive=path.join(artifacts,pkg.filename);
run('install','npm',['install','--global','--prefix',prefix,'--offline','--ignore-scripts','--no-audit','--no-fund',archive],root,npmEnv);
const installed=path.join(prefix,'lib/node_modules/0x2f');
const cli=path.join(prefix,'bin/2f');
const files=[];
async function compare(dir='src'){
 for(const entry of await fs.readdir(path.join(root,dir),{withFileTypes:true})){
  const relative=path.join(dir,entry.name);
  if(entry.isDirectory())await compare(relative);
  else{const source=await fs.readFile(path.join(root,relative)),copy=await fs.readFile(path.join(installed,relative));assert.deepEqual(copy,source,relative);files.push({path:relative,sha256:hash(copy)});}
 }
}
await compare();
run('version',cli,['--version'],workspace);
run('init',cli,['init'],workspace);
const readme=await fs.readFile(path.join(workspace,'.work/providers/README.md'),'utf8');
const example=[...readme.matchAll(/^  \{[\s\S]*?^  \}/gm)].map(m=>JSON.parse(m[0])).find(p=>p.id==='cursor');
const manifest=JSON.parse(await fs.readFile(path.join(root,'examples/providers/cursor.json'),'utf8'));
assert.deepEqual(example,manifest);
await fs.writeFile(path.join(workspace,'.work/providers/cursor.json'),JSON.stringify(manifest,null,2));
run('providers',cli,['providers'],workspace);
const tasksBefore=await fs.readdir(path.join(workspace,'.work/tasks'));
// Refuse to turn this negative probe into an unexpected real request if a CLI
// was installed concurrently after inventory collection.
const missing=spawnSync('agent',['--version'],{encoding:'utf8'});
assert.equal(missing.error?.code,'ENOENT','agent became available: run the real chain instead of the negative gate');
const negative=run('cursor-unavailable',cli,['new','Cursor compatibility preflight: missing executable must refuse before task creation.','--provider','cursor'],workspace,process.env,1);
assert.match(negative.stderr,/unavailable|not available|not installed/i);
const tasksAfter=await fs.readdir(path.join(workspace,'.work/tasks'));
assert.deepEqual(tasksAfter,tasksBefore);assert.equal(tasksAfter.length,0);
const globalHashAfter=hash(await fs.readFile(globalCLI));assert.equal(globalHashAfter,globalHashBefore);
const sourcePatch=run('source-patch','git',['diff','--','src','package.json'],root).stdout;
await fs.writeFile(path.join(evidence,'source.patch'),sourcePatch);
const result={sourcePatchSha256:hash(sourcePatch),observedAt:new Date().toISOString(),sourceRoot:root,sourceBase:run('git-base','git',['rev-parse','HEAD'],root).stdout.trim(),packageVersion:pkg.version,
 archive:{path:archive,sha256:hash(await fs.readFile(archive))},installedRoot:installed,cli,workspace,
 npmIsolation:{home:npmHome,environmentKeys:Object.keys(npmEnv),offline:true,ignoreScripts:true,inheritedCredentials:false},
 sourceFilesCompared:files.length,sourceFiles:files,authoritativeManifest:manifest,
 taskCountBefore:tasksBefore.length,taskCountAfter:tasksAfter.length,modelsInvoked:0,
 globalInstallation:{cli:globalCLI,before:globalHashBefore,after:globalHashAfter,unchanged:true},commands:calls};
await fs.writeFile(path.join(evidence,'installed-preflight.json'),JSON.stringify(result,null,2));
await fs.copyFile(archive,path.join(evidence,pkg.filename));
console.log(JSON.stringify({version:pkg.version,sourceFilesCompared:files.length,archiveSha256:result.archive.sha256,cli,workspace,negative:negative.stderr.trim(),taskCount:tasksAfter.length,globalUnchanged:true},null,2));
