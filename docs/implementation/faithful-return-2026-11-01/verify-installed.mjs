// Reproducible offline regression + installed tarball verification. No release,
// global user installation, live model request or inherited credential store.
// Requires the repository's dependencies and a populated public npm cache.
// Pass that cache explicitly (--cache PATH, --cache=PATH, or the sole positional
// argument); no historical receipt is consulted.
// Each verification prints a new evidence directory; historical evidence is kept.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(here,'../../..');
const scriptRel=path.relative(repo,fileURLToPath(import.meta.url));
const cacheGuidance='Pass a populated public npm cache explicitly: node '+scriptRel+' --cache /path/to/public-npm-cache (or the sole positional path). The cache must contain _cacache prepopulated with the public package dependencies; verification installs offline and cannot download missing entries.';

export function usage() {
  return [
    'Usage:',
    '  node '+scriptRel+' --cache /path/to/public-npm-cache',
    '  node '+scriptRel+' --cache=/path/to/public-npm-cache',
    '  node '+scriptRel+' /path/to/public-npm-cache',
    '',
    'Options:',
    '  --cache PATH, --cache=PATH   Required populated public npm cache (also accepted as the sole positional argument)',
    '  --help                       Show this help and exit',
    '',
    'The cache must contain _cacache prepopulated with public package dependencies.',
    'Verification installs offline and never downloads missing entries. Historical',
    'installation.json receipts and environment cache settings are not used.',
  ].join('\n');
}

// Parse argv before any evidence/temp work. Rejects unknown options and ambiguous cache forms.
export function parseVerifyInstalledArgs(argv=process.argv.slice(2)) {
  let help=false;
  let flagCache,positional;
  for(let i=0;i<argv.length;i++) {
    const arg=argv[i];
    if(arg==='--help'){help=true;continue;}
    if(arg==='--cache' || arg.startsWith('--cache=')) {
      if(flagCache!==undefined)throw new Error('Duplicate --cache option. Supply the public npm cache once. '+cacheGuidance);
      let value;
      if(arg==='--cache') {
        value=argv[++i];
        // A following option is not a path; use --cache=PATH for a leading dash.
        if(value===undefined || value.startsWith('-'))throw new Error('Missing value for --cache. '+cacheGuidance);
      }else value=arg.slice('--cache='.length);
      if(typeof value!=='string' || !value.trim())throw new Error('Empty value for --cache. '+cacheGuidance);
      flagCache=value;
      continue;
    }
    if(arg.startsWith('-'))throw new Error('Unknown option: '+arg+'.\n'+usage());
    if(positional!==undefined)throw new Error('Unexpected extra argument: '+arg+'. Supply one public npm cache path. '+cacheGuidance);
    positional=arg;
  }
  if(flagCache!==undefined && positional!==undefined) {
    throw new Error('Do not combine a positional cache path with --cache. Supply the public npm cache once. '+cacheGuidance);
  }
  const cache=flagCache??positional;
  if(help && cache===undefined)return {help:true};
  if(typeof cache!=='string' || !cache.trim()) {
    throw new Error('An explicit public npm cache path is required (a non-empty valid path). '+cacheGuidance);
  }
  return help?{help:true}:{help:false,cache};
}

// Resolve symlinks before putting npm on the isolated PATH. Executing a shell
// shim with Node, or copying npm-cli.js away from its package, does not work.
export async function discoverNpmCli({env=process.env,execPath=process.execPath}={}) {
  const candidates=[env.npm_execpath,...(env.PATH??'').split(path.delimiter).filter(Boolean).map(dir=>path.join(dir,'npm')),path.join(path.dirname(execPath),'npm')];
  for(const candidate of candidates.filter(Boolean)) {
    try {
      const cli=await fs.realpath(candidate);
      const pkg=JSON.parse(await fs.readFile(path.resolve(cli,'../../package.json'),'utf8'));
      if(path.basename(cli)==='npm-cli.js' && pkg.name==='npm') {
        await fs.access(cli,fs.constants.R_OK);return cli;
      }
    }catch{/* Try the next installed npm; never execute an unrecognized shim. */}
  }
  throw new Error('Cannot find the real npm-cli.js. Install Node.js with npm and put its npm executable on PATH, or run this verifier via npm (npm_execpath).');
}

export async function resolvePublicCache(explicit) {
  if(typeof explicit!=='string' || !explicit.trim() || explicit.includes('\0')) {
    throw new Error('An explicit public npm cache path is required (a non-empty valid path). '+cacheGuidance);
  }
  const source=path.resolve(explicit);
  // Check for actual content, not just an empty directory tree. npm performs
  // the dependency/integrity checks later during the isolated offline install.
  async function hasContent(dir) {
    for(const entry of await fs.readdir(dir,{withFileTypes:true})) {
      const file=path.join(dir,entry.name);
      if(entry.isDirectory()) {if(await hasContent(file))return true;}
      else if(entry.isFile() && (await fs.stat(file)).size>0) {
        await fs.access(file,fs.constants.R_OK);return true;
      }
    }
    return false;
  }
  let populated;
  try {
    populated=await hasContent(path.join(source,'_cacache'));
  }catch{
    throw new Error('Public npm cache missing or unreadable: '+source+'. '+cacheGuidance);
  }
  if(!populated)throw new Error('Public npm cache is empty: '+source+'. '+cacheGuidance);
  return source;
}

export async function prepareIsolation(tmp,source,npm) {
  const cache=path.join(tmp,'public-npm-cache');
  // Copy only npm content, never the caller's HOME, npmrc, logs or credentials.
  await fs.mkdir(cache);
  await fs.cp(path.join(source,'_cacache'),path.join(cache,'_cacache'),{recursive:true});
  await fs.mkdir(path.join(tmp,'bin'));await fs.mkdir(path.join(tmp,'home'));
  await fs.symlink(process.execPath,path.join(tmp,'bin/node'));
  await fs.symlink(npm,path.join(tmp,'bin/npm'));
  return {PATH:`${tmp}/bin:/usr/bin:/bin:/usr/sbin:/sbin`,HOME:path.join(tmp,'home'),TMPDIR:os.tmpdir(),LANG:'en_US.UTF-8',TERM:'xterm-256color',TZ:'Europe/Lisbon',npm_config_cache:cache,WORK_TEST_NPM_CACHE:cache,npm_config_offline:'true',npm_config_audit:'false',npm_config_fund:'false',npm_config_userconfig:path.join(tmp,'home','.npmrc'),npm_config_globalconfig:path.join(tmp,'home','global.npmrc')};
}

export async function main(cacheArgument) {
  if(arguments.length===0)throw new Error('main(cache) requires an explicit cache path argument; use parseVerifyInstalledArgs for CLI argv.');
// Keep new receipts separate from the original qualification evidence.
await fs.mkdir(path.join(here,'evidence'),{recursive:true});
const out=await fs.mkdtemp(path.join(here,'evidence/portable-verification-'));
console.log('Verification evidence: '+out);
const tmp=await fs.mkdtemp(path.join(os.tmpdir(),'0x2f-faithful-installed-'));
let env;
const results=[];
async function run(label,exe,args,extra={}) {
  const start=new Date().toISOString();const log=await fs.open(path.join(out,label+'.log'),'w');let text='';
  const child=spawn(exe,args,{cwd:repo,env:{...env,...extra},stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',b=>{text+=b;log.write(b);});child.stderr.on('data',b=>log.write(b));
  // Close the retained log and record the stage even when the process never starts.
  let code=null,error=null;
  try{code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});}
  catch(failed){error=failed;}
  await log.close();
  results.push(error
    ?{label,start,end:new Date().toISOString(),code,error:error.message??String(error)}
    :{label,start,end:new Date().toISOString(),code});
  console.log(JSON.stringify(results.at(-1)));
  if(error)throw error;
  if(code!==0)throw new Error(label+' failed; see '+path.join(out,label+'.log')+'. For ENOTCACHED, supply a public npm cache populated with all package dependencies; this verifier never downloads them.');return text;
}
async function files(dir){let out=[];for(const e of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,e.name);out.push(...(e.isDirectory()?await files(p):[p]));}return out;}
let receipt={node:process.version,inheritedCredentials:false,offline:true,results};
try {
  const source=await resolvePublicCache(cacheArgument);
  const npm=await discoverNpmCli();
  env=await prepareIsolation(tmp,source,npm);
  receipt={...receipt,platform:process.platform,npm};
  for(const command of ['git','python3']) {
    const probe=spawnSync(command,['--version'],{env,encoding:'utf8'});
    if(probe.error || probe.status!==0)throw new Error(command+' is required on the isolated system PATH (/usr/bin:/bin:/usr/sbin:/sbin). Install it there before running verification.');
  }
  for(const dependency of ['ws','@noble/ciphers','@noble/hashes']) {
    try{await fs.access(path.join(repo,'node_modules',dependency,'package.json'));}
    catch{throw new Error('Missing repository dependency '+dependency+'. Install repository dependencies from a public npm cache with npm ci --offline --cache /path/to/public-npm-cache before running verification.');}
  }
  await run('final-check',process.execPath,[npm,'run','check']);
  await run('isolated-regression',process.execPath,[npm,'test']);
  const packed=JSON.parse(await run('pack',process.execPath,[npm,'pack','--json','--pack-destination',tmp]));
  const archive=path.join(tmp,packed[0].filename),prefix=path.join(tmp,'install');
  await run('install-tarball',process.execPath,[npm,'install','-g','--prefix',prefix,'--offline','--no-audit','--no-fund',archive]);
  const installed=path.join(prefix,'lib/node_modules/0x2f');
  const pkg=JSON.parse(await fs.readFile(path.join(installed,'package.json'),'utf8'));
  const sourcePackage=JSON.parse(await fs.readFile(path.join(repo,'package.json'),'utf8'));
  if(pkg.version!==sourcePackage.version)throw new Error('Installed version differs from source package');
  const cli=path.join(installed,'src/cli.mjs');
  const version=await run('installed-version',process.execPath,[cli,'version']);
  if(version.trim()!==pkg.version)throw new Error('Installed CLI version mismatch: '+version.trim());
  const sourceFiles=await files(path.join(repo,'src'));
  for(const file of sourceFiles){const rel=path.relative(repo,file);if(!Buffer.from(await fs.readFile(file)).equals(await fs.readFile(path.join(installed,rel))))throw new Error('Installed source mismatch '+rel);}
  const archiveBytes=await fs.readFile(archive);
  await fs.writeFile(path.join(out,packed[0].filename),archiveBytes);
  await run('installed-pty',process.execPath,['--test','test/faithful-return-pty.test.mjs'],{WORK_RETURN_CLI:cli,WORK_RETURN_EVIDENCE:path.join(out,'installed-tui')});
  receipt={...receipt,version:pkg.version,sourceFilesMatched:sourceFiles.length,tarball:packed[0].filename,sha256:crypto.createHash('sha256').update(archiveBytes).digest('hex'),status:'passed'};
}catch(error){receipt={...receipt,status:'failed',error:error.stack};console.error(error.message);process.exitCode=1;}
finally{
  try{await fs.writeFile(path.join(out,'installed-verification.json'),JSON.stringify(receipt,null,2)+'\n');}
  finally{await fs.rm(tmp,{recursive:true,force:true});}
}

}

export async function runCli(argv=process.argv.slice(2)) {
  let parsed;
  try{parsed=parseVerifyInstalledArgs(argv);}
  catch(error){console.error(error.message);process.exitCode=1;return;}
  if(parsed.help){console.log(usage());return;}
  await main(parsed.cache);
}

// Stdin uses '-' and eval callers may have no file entry point. Importing must
// stay silent in both cases; realpath still recognizes direct CLI path aliases.
const entry=process.argv[1];
const entryPath=entry && entry!=='-'?await fs.realpath(entry).catch(()=>undefined):undefined;
if(entryPath===fileURLToPath(import.meta.url))await runCli();
