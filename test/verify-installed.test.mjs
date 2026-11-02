import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {discoverNpmCli,resolvePublicCache,prepareIsolation,parseVerifyInstalledArgs,usage} from '../docs/implementation/faithful-return-2026-11-01/verify-installed.mjs';

async function scratch(t) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'verify-installed-test-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;
}

async function copyVerifier(t) {
  const base=await scratch(t),dir=path.join(base,'docs/implementation/faithful-return-2026-11-01');
  await fs.mkdir(dir,{recursive:true});
  const verifier=path.join(dir,'verify-installed.mjs');
  await fs.copyFile(new URL('../docs/implementation/faithful-return-2026-11-01/verify-installed.mjs',import.meta.url),verifier);
  return {base,dir,verifier};
}

for(const layout of ['lib/node_modules/npm','share/nodejs/npm']) {
  test('resolves the real npm CLI through symlinks: '+layout,async t=>{
    const base=await scratch(t),bin=path.join(base,'bin'),pkg=path.join(base,layout);
    await fs.mkdir(bin);await fs.mkdir(path.join(pkg,'bin'),{recursive:true});
    const cli=path.join(pkg,'bin/npm-cli.js');
    await fs.writeFile(cli,'// fixture: discovery must not execute npm\n');
    await fs.writeFile(path.join(pkg,'package.json'),'{"name":"npm"}');
    await fs.symlink(path.relative(bin,cli),path.join(bin,'npm'));
    assert.equal(await discoverNpmCli({env:{PATH:bin},execPath:path.join(base,'missing/node')}),await fs.realpath(cli));
    assert.equal(await discoverNpmCli({env:{npm_execpath:path.join(bin,'npm')},execPath:path.join(base,'missing/node')}),await fs.realpath(cli));
    assert.equal(await discoverNpmCli({env:{},execPath:path.join(bin,'node')}),await fs.realpath(cli));
  });
}

test('unrecognized npm wrappers and absent npm give actionable errors',async t=>{
  const base=await scratch(t);
  await fs.writeFile(path.join(base,'npm'),'#!/bin/sh\nexit 99\n');
  await assert.rejects(discoverNpmCli({env:{PATH:base,npm_execpath:path.join(base,'npm')},execPath:path.join(base,'node')}),/Cannot find the real npm-cli.js.*Install Node.js with npm/);
});

test('explicit populated public cache needs no historical files',async t=>{
  const base=await scratch(t),cache=path.join(base,'npm-cache');
  await fs.mkdir(path.join(cache,'_cacache'),{recursive:true});
  await fs.writeFile(path.join(cache,'_cacache','public-entry'),'public data');
  assert.equal(await resolvePublicCache(cache),cache);
  assert.equal(await resolvePublicCache(path.relative(process.cwd(),cache)),cache);
});

test('absent, blank and invalid cache arguments require an explicit path',async()=>{
  for(const input of [undefined,null,'',' \t ',42,{},'invalid\0path']) {
    await assert.rejects(resolvePublicCache(input),/An explicit public npm cache path is required.*Pass a populated public npm cache explicitly: node .*verify-installed\.mjs --cache \/path\/to\/public-npm-cache.*verification installs offline/);
  }
});

test('missing, invalid and empty public caches give actionable offline guidance',async t=>{
  const base=await scratch(t),cache=path.join(base,'npm-cache');
  const missing=/Public npm cache missing or unreadable:.*_cacache.*verification installs offline and cannot download missing entries/;
  const empty=/Public npm cache is empty:.*Pass a populated public npm cache explicitly.*verification installs offline/;
  await assert.rejects(resolvePublicCache(cache),missing);
  await fs.writeFile(cache,'not a cache directory');
  await assert.rejects(resolvePublicCache(cache),missing);
  await fs.rm(cache);await fs.mkdir(cache);
  await assert.rejects(resolvePublicCache(cache),missing);
  await fs.writeFile(path.join(cache,'_cacache'),'not a directory');
  await assert.rejects(resolvePublicCache(cache),missing);
  await fs.rm(path.join(cache,'_cacache'));
  await fs.mkdir(path.join(cache,'_cacache'));
  await assert.rejects(resolvePublicCache(cache),empty);
  const nested=path.join(cache,'_cacache','content-v2','sha512','ab');
  await fs.mkdir(nested,{recursive:true});
  await assert.rejects(resolvePublicCache(cache),empty);
  await fs.writeFile(path.join(nested,'entry'),'');
  await assert.rejects(resolvePublicCache(cache),empty);
  await fs.writeFile(path.join(nested,'entry'),'public data');
  assert.equal(await resolvePublicCache(cache),cache);
});

test('parseVerifyInstalledArgs accepts positional, --cache PATH and --cache=PATH',()=>{
  assert.deepEqual(parseVerifyInstalledArgs(['/tmp/public cache']),{help:false,cache:'/tmp/public cache'});
  assert.deepEqual(parseVerifyInstalledArgs(['--cache','/tmp/public cache']),{help:false,cache:'/tmp/public cache'});
  assert.deepEqual(parseVerifyInstalledArgs(['--cache=/tmp/public cache']),{help:false,cache:'/tmp/public cache'});
  assert.deepEqual(parseVerifyInstalledArgs(['--help']),{help:true});
  assert.deepEqual(parseVerifyInstalledArgs(['--help','--cache','/ignored']),{help:true});
  assert.match(usage(),/--cache PATH, --cache=PATH/);
});

test('parseVerifyInstalledArgs rejects unknown, empty, duplicate and mixed cache forms',()=>{
  assert.throws(()=>parseVerifyInstalledArgs([]),/An explicit public npm cache path is required.*--cache/);
  assert.throws(()=>parseVerifyInstalledArgs(['--cache']),/Missing value for --cache/);
  assert.throws(()=>parseVerifyInstalledArgs(['--cache','--verbose']),/Missing value for --cache/);
  assert.throws(()=>parseVerifyInstalledArgs(['--cache=']),/Empty value for --cache/);
  assert.throws(()=>parseVerifyInstalledArgs(['--cache','  ']),/Empty value for --cache/);
  assert.throws(()=>parseVerifyInstalledArgs(['--cache','/a','--cache','/b']),/Duplicate --cache/);
  assert.throws(()=>parseVerifyInstalledArgs(['--cache=/a','--cache=/b']),/Duplicate --cache/);
  assert.throws(()=>parseVerifyInstalledArgs(['/a','--cache','/b']),/Do not combine a positional cache path with --cache/);
  assert.throws(()=>parseVerifyInstalledArgs(['--cache','/a','/b']),/Do not combine a positional cache path with --cache/);
  assert.throws(()=>parseVerifyInstalledArgs(['/a','/b']),/Unexpected extra argument/);
  assert.throws(()=>parseVerifyInstalledArgs(['--unknown']),/Unknown option: --unknown/);
  assert.throws(()=>parseVerifyInstalledArgs(['-h']),/Unknown option: -h/);
});

test('help does not bypass validation of malformed cache arguments or unknown options',()=>{
  for(const args of [
    ['--unknown'],['-h'],['--cache'],['--cache='],['--cache','  '],
    ['--cache=/a','--cache=/b'],['/a','--cache=/b'],['--cache=/a','/b'],
    ['/a','/b'],[''],
  ]) {
    for(const withHelp of [['--help',...args],[...args,'--help']]) {
      assert.throws(()=>parseVerifyInstalledArgs(withHelp),Error,JSON.stringify(withHelp));
    }
  }
  assert.deepEqual(parseVerifyInstalledArgs(['--cache','/tmp/public cache','--help']),{help:true});
  assert.deepEqual(parseVerifyInstalledArgs(['/tmp/public cache','--help']),{help:true});
});

test('a short option cannot be consumed as a separate --cache value',()=>{
  for(const option of ['-h','-x','-']) {
    assert.throws(()=>parseVerifyInstalledArgs(['--cache',option]),/Missing value for --cache/);
  }
  // A literal path beginning with a dash remains expressible without ambiguity.
  assert.deepEqual(parseVerifyInstalledArgs(['--cache=-public cache']),{help:false,cache:'-public cache'});
  assert.deepEqual(parseVerifyInstalledArgs(['--cache','./-public cache']),{help:false,cache:'./-public cache'});
});

test('isolation runs real npm with fresh HOME, fixed PATH, copied content only and no inherited credentials',async t=>{
  const base=await scratch(t),cache=path.join(base,'cache'),tmp=path.join(base,'isolated');
  await fs.mkdir(path.join(cache,'_cacache'),{recursive:true});await fs.mkdir(tmp);
  await fs.writeFile(path.join(cache,'_cacache','public-entry'),'public data');
  await fs.writeFile(path.join(cache,'.npmrc'),'//registry.npmjs.org/:_authToken=DO_NOT_COPY');
  await fs.mkdir(path.join(cache,'.aws'));await fs.writeFile(path.join(cache,'.aws/credentials'),'DO_NOT_COPY');
  const npm=await discoverNpmCli();
  const poisoned={OPENAI_API_KEY:'DO_NOT_INHERIT',AWS_SECRET_ACCESS_KEY:'DO_NOT_INHERIT',NODE_OPTIONS:'--bad-option',npm_config_registry:'https://invalid.example',npm_config_userconfig:'/private/user/npmrc',PATH:'/untrusted/user/bin'};
  const saved=Object.fromEntries(Object.keys(poisoned).map(key=>[key,process.env[key]]));
  let env;
  try {
    Object.assign(process.env,poisoned);
    env=await prepareIsolation(tmp,cache,npm);
  }finally{
    // Reassigning process.env wholesale does NOT restore the real environment
    // for later child spawns, so restore key by key.
    for(const [key,value] of Object.entries(saved)) {
      if(value===undefined)delete process.env[key];
      else process.env[key]=value;
    }
  }
  for(const key of ['PATH','NODE_OPTIONS','npm_config_registry'])assert.deepEqual(process.env[key],saved[key]);
  // Check native environment restoration too: Node 26 can expose a clean JS
  // object while a default spawn still inherits the poisoned NODE_OPTIONS.
  const restored=spawnSync(process.execPath,['-e','console.log("restored")'],{encoding:'utf8'});
  assert.equal(restored.status,0,restored.stderr);
  assert.equal(restored.stdout.trim(),'restored');
  assert.deepEqual((await fs.readdir(env.npm_config_cache)).sort(),['_cacache']);
  assert.equal(await fs.readFile(path.join(env.npm_config_cache,'_cacache/public-entry'),'utf8'),'public data');
  assert.deepEqual(await fs.readdir(env.HOME),[]);
  assert.equal(env.PATH,`${tmp}/bin:/usr/bin:/bin:/usr/sbin:/sbin`);
  assert.equal(env.npm_config_offline,'true');assert.equal(env.WORK_TEST_NPM_CACHE,env.npm_config_cache);
  const probe=spawnSync(process.execPath,['-e','console.log(JSON.stringify(process.env))'],{env,encoding:'utf8'});
  assert.equal(probe.status,0,probe.stderr);
  const observed=JSON.parse(probe.stdout);
  // libuv adds this macOS text-encoding variable even with an explicit env.
  if(process.platform==='darwin')delete observed.__CF_USER_TEXT_ENCODING;
  assert.deepEqual(observed,env);
  for(const key of ['OPENAI_API_KEY','AWS_SECRET_ACCESS_KEY','NODE_OPTIONS','npm_config_registry'])assert.equal(env[key],undefined);
  const version=spawnSync(path.join(tmp,'bin/npm'),['--version'],{env,encoding:'utf8'});
  assert.equal(version.status,0,version.stderr);assert.match(version.stdout,/^\d+\.\d+\.\d+/);
  // npm writes only to its isolated cache/HOME and cannot mutate the input.
  assert.equal(await fs.readFile(path.join(cache,'.npmrc'),'utf8'),'//registry.npmjs.org/:_authToken=DO_NOT_COPY');
});

test('paths with spaces work end to end for the explicit cache and the isolation tree',async t=>{
  const base=await scratch(t),root=path.join(base,'probe root with spaces');
  await fs.mkdir(root);
  const cache=path.join(root,'public cache area','npm-cache');
  await fs.mkdir(path.join(cache,'_cacache'),{recursive:true});
  await fs.writeFile(path.join(cache,'_cacache','entry'),'public data');
  assert.equal(await resolvePublicCache(cache),cache);
  const tmp=path.join(root,'isolated tmp');
  await fs.mkdir(tmp);
  const npm=await discoverNpmCli();
  const env=await prepareIsolation(tmp,cache,npm);
  for(const value of [env.HOME,env.npm_config_cache,env.npm_config_userconfig,env.PATH.split(path.delimiter)[0]])assert.match(value,/ /);
  const version=spawnSync(path.join(tmp,'bin/npm'),['--version'],{env,encoding:'utf8'});
  assert.equal(version.status,0,version.stderr);assert.match(version.stdout,/^\d+\.\d+\.\d+/);
  // npm itself resolves through the spaced names to the copied public cache.
  const config=spawnSync(process.execPath,[npm,'config','get','cache'],{env,encoding:'utf8'});
  assert.equal(config.status,0,config.stderr);
  assert.equal(config.stdout.trim(),env.npm_config_cache);
  const pkg=path.join(root,'local public package');
  await fs.mkdir(pkg);
  await fs.writeFile(path.join(pkg,'package.json'),JSON.stringify({name:'verify-spaced-paths',version:'1.0.0'}));
  const prefix=path.join(tmp,'install prefix with spaces');
  const install=spawnSync(process.execPath,[npm,'install','--global','--prefix',prefix,'--offline','--ignore-scripts','--no-audit','--no-fund',pkg],{env,encoding:'utf8'});
  assert.equal(install.status,0,install.stderr);
  const installed=JSON.parse(await fs.readFile(path.join(prefix,'lib/node_modules/verify-spaced-paths/package.json'),'utf8'));
  assert.equal(installed.version,'1.0.0');
  await fs.rm(tmp,{recursive:true,force:true});
});

test('importing the verifier is silent and creates no evidence or temp trees',async t=>{
  const base=await scratch(t);
  const probe=path.join(base,'import-probe.mjs');
  const verifierUrl=pathToFileURL(path.resolve('docs/implementation/faithful-return-2026-11-01/verify-installed.mjs')).href;
  await fs.writeFile(probe,`
    import ${JSON.stringify(verifierUrl)};
    console.log('imported-ok');
  `);
  const result=spawnSync(process.execPath,[probe],{encoding:'utf8',env:{...process.env,TMPDIR:base}});
  assert.equal(result.status,0,result.stderr);
  assert.equal(result.stdout.trim(),'imported-ok');
  assert.equal(result.stderr,'');
  assert.deepEqual((await fs.readdir(base)).filter(name=>name.startsWith('0x2f-faithful-installed-')||name==='docs'),[]);
});

test('stdin imports are silent even when the stdin marker names a verifier symlink',async t=>{
  const {base,verifier}=await copyVerifier(t);
  const input=`import ${JSON.stringify(pathToFileURL(verifier).href)}; console.log('IMPORT_OK');`;
  for(const withDashAlias of [false,true]) {
    if(withDashAlias)await fs.symlink(path.relative(base,verifier),path.join(base,'-'));
    const before=(await fs.readdir(base,{recursive:true})).sort();
    const result=spawnSync(process.execPath,['--input-type=module','-'],{
      cwd:base,input,encoding:'utf8',env:{PATH:'/usr/bin:/bin:/usr/sbin:/sbin',HOME:base,TMPDIR:base},
    });
    assert.equal(result.status,0,result.stderr);
    assert.equal(result.stdout,'IMPORT_OK\n');
    assert.equal(result.stderr,'');
    assert.deepEqual((await fs.readdir(base,{recursive:true})).sort(),before);
  }
});

test('imports from eval and non-file callers are silent without filesystem changes',async t=>{
  const {base,verifier}=await copyVerifier(t);
  const input=`import ${JSON.stringify(pathToFileURL(verifier).href)}; console.log('IMPORT_OK');`;
  const before=(await fs.readdir(base,{recursive:true})).sort();
  for(const args of [
    ['--input-type=module'],
    ['--input-type=module','--eval',input],
    ['--input-type=module','--eval',input,'missing-entry.mjs'],
    ['--input-type=module','--eval',input,'data:text/javascript,'],
  ]) {
    const result=spawnSync(process.execPath,args,{
      cwd:base,input,encoding:'utf8',env:{PATH:'/usr/bin:/bin:/usr/sbin:/sbin',HOME:base,TMPDIR:base},
    });
    assert.equal(result.status,0,JSON.stringify(args)+'\n'+result.stderr);
    assert.equal(result.stdout,'IMPORT_OK\n');
    assert.equal(result.stderr,'');
    assert.deepEqual((await fs.readdir(base,{recursive:true})).sort(),before);
  }
});

test('direct CLI execution through symlinks and path aliases still handles help and errors',async t=>{
  const {base,dir,verifier}=await copyVerifier(t);
  await fs.symlink(path.relative(base,verifier),path.join(base,'verifier alias.mjs'));
  await fs.symlink(path.relative(base,dir),path.join(base,'directory alias'));
  const relative=path.relative(base,verifier);
  const before=(await fs.readdir(base,{recursive:true})).sort();
  for(const entry of [verifier,relative,'./docs/../'+relative,'verifier alias.mjs','directory alias/verify-installed.mjs']) {
    for(const [args,status] of [[['--help'],0],[['--unknown'],1]]) {
      const result=spawnSync(process.execPath,[entry,...args],{
        cwd:base,encoding:'utf8',env:{PATH:'/usr/bin:/bin:/usr/sbin:/sbin',HOME:base,TMPDIR:base},
      });
      assert.equal(result.status,status,entry+'\n'+result.stderr);
      if(status===0) {
        assert.match(result.stdout,/^Usage:/);
        assert.equal(result.stderr,'');
      }else {
        assert.equal(result.stdout,'');
        assert.match(result.stderr,/Unknown option: --unknown/);
      }
      assert.deepEqual((await fs.readdir(base,{recursive:true})).sort(),before);
    }
  }
});

test('CLI --help prints usage on stdout with exit 0 and no evidence or temp side effects',async t=>{
  const {base,dir,verifier}=await copyVerifier(t);
  const result=spawnSync(process.execPath,[verifier,'--help'],{encoding:'utf8',env:{...process.env,TMPDIR:base}});
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/Usage:/);
  assert.match(result.stdout,/--cache PATH, --cache=PATH/);
  assert.match(result.stdout,/sole positional/);
  assert.equal(result.stderr,'');
  await assert.rejects(fs.access(path.join(dir,'evidence')),/ENOENT/);
  assert.deepEqual((await fs.readdir(base)).filter(name=>name.startsWith('0x2f-faithful-installed-')),[]);
});

test('CLI help accepts well-formed cache arguments without checking paths or creating files',async t=>{
  const {base,verifier}=await copyVerifier(t);
  const cache=path.join(base,'absent public cache');
  const before=(await fs.readdir(base,{recursive:true})).sort();
  for(const cacheArgs of [[cache],['--cache',cache],['--cache='+cache]]) {
    for(const args of [['--help',...cacheArgs],[...cacheArgs,'--help']]) {
      const result=spawnSync(process.execPath,[verifier,...args],{
        cwd:base,encoding:'utf8',env:{PATH:'/usr/bin:/bin:/usr/sbin:/sbin',HOME:base,TMPDIR:base},
      });
      assert.equal(result.status,0,result.stderr);
      assert.match(result.stdout,/^Usage:/);
      assert.equal(result.stderr,'');
      assert.deepEqual((await fs.readdir(base,{recursive:true})).sort(),before);
    }
  }
});

test('CLI rejects unknown options, empty --cache, duplicates and mixed forms before verification',async t=>{
  const {base,dir,verifier}=await copyVerifier(t);
  const cases=[
    [['--nope'],/Unknown option: --nope/],
    [['--cache'],/Missing value for --cache/],
    [['--cache='],/Empty value for --cache/],
    [['--cache','/a','--cache','/b'],/Duplicate --cache/],
    [['/a','--cache','/b'],/Do not combine a positional cache path with --cache/],
    [[],/An explicit public npm cache path is required/],
  ];
  for(const [args,pattern] of cases) {
    const result=spawnSync(process.execPath,[verifier,...args],{encoding:'utf8',env:{...process.env,TMPDIR:base}});
    assert.equal(result.status,1,args.join(' ')+'\n'+result.stderr);
    assert.match(result.stderr,pattern);
    assert.doesNotMatch(result.stdout,/Verification evidence/);
  }
  await assert.rejects(fs.access(path.join(dir,'evidence')),/ENOENT/);
  assert.deepEqual((await fs.readdir(base)).filter(name=>name.startsWith('0x2f-faithful-installed-')),[]);
});

test('CLI rejects malformed help combinations and short cache options without filesystem changes',async t=>{
  const {base,verifier}=await copyVerifier(t);
  const before=(await fs.readdir(base,{recursive:true})).sort();
  const cases=[
    [['--help','--nope'],/Unknown option: --nope/],
    [['--nope','--help'],/Unknown option: --nope/],
    [['--help','--cache'],/Missing value for --cache/],
    [['--cache','--help'],/Missing value for --cache/],
    [['--cache=','--help'],/Empty value for --cache/],
    [['--help','--cache','  '],/Empty value for --cache/],
    [['--cache=/a','--cache=/b','--help'],/Duplicate --cache/],
    [['--help','/a','--cache=/b'],/Do not combine a positional cache path with --cache/],
    [['--cache=/a','/b','--help'],/Do not combine a positional cache path with --cache/],
    [['--help','/a','/b'],/Unexpected extra argument/],
    [['--help',''],/An explicit public npm cache path is required/],
    [['--help','--cache','-h'],/Missing value for --cache/],
    [['--cache','-h'],/Missing value for --cache/],
    [['--cache','-x'],/Missing value for --cache/],
  ];
  for(const [args,pattern] of cases) {
    const result=spawnSync(process.execPath,[verifier,...args],{cwd:base,encoding:'utf8',env:{PATH:'/usr/bin:/bin:/usr/sbin:/sbin',HOME:base,TMPDIR:base}});
    assert.equal(result.status,1,JSON.stringify(args)+'\n'+result.stderr);
    assert.match(result.stderr,pattern);
    assert.equal(result.stdout,'');
    assert.deepEqual((await fs.readdir(base,{recursive:true})).sort(),before,JSON.stringify(args));
  }
});

test('CLI prerequisite errors retain a new failed receipt without historical evidence',async t=>{
  const {base,dir,verifier}=await copyVerifier(t);
  const result=spawnSync(process.execPath,[verifier,path.join(base,'missing-cache')],{encoding:'utf8'});
  assert.equal(result.status,1,result.stderr);
  assert.match(result.stderr,/Public npm cache missing or unreadable:.*missing-cache/);
  assert.doesNotMatch(result.stderr,/ENOENT|installation.json/);
  const [run]=await fs.readdir(path.join(dir,'evidence'));
  const receipt=JSON.parse(await fs.readFile(path.join(dir,'evidence',run,'installed-verification.json'),'utf8'));
  assert.equal(receipt.status,'failed');assert.deepEqual(receipt.results,[]);
  const cache=path.join(base,'public-cache');
  await fs.mkdir(path.join(cache,'_cacache'),{recursive:true});
  await fs.writeFile(path.join(cache,'_cacache','public-entry'),'public data');
  for(const args of [[cache],['--cache',cache],['--cache='+cache]]) {
    const explicit=spawnSync(process.execPath,[verifier,...args],{encoding:'utf8'});
    assert.equal(explicit.status,1,args.join(' '));
    assert.match(explicit.stderr,/Missing repository dependency|is required on the isolated system PATH/);
    assert.doesNotMatch(explicit.stderr,/historical|installation.json|Public npm cache missing/);
  }
  assert.equal((await fs.readdir(path.join(dir,'evidence'))).length,4,'each attempt retains separate evidence');
});

test('CLI requires an explicit cache even with a usable historical receipt or cache environment',async t=>{
  const {base,dir,verifier}=await copyVerifier(t);
  const cache=path.join(base,'npm-cache');
  await fs.mkdir(path.join(cache,'_cacache'),{recursive:true});
  await fs.writeFile(path.join(cache,'_cacache','public-entry'),'public data');
  const historical=path.join(base,'docs/qualification/2026-11-01/harness-scenario-followup/evidence/installation.json');
  const before=JSON.stringify({root:base});
  for(const withReceipt of [false,true]) {
    if(withReceipt) {
      await fs.mkdir(path.dirname(historical),{recursive:true});
      await fs.writeFile(historical,before);
    }
    const result=spawnSync(process.execPath,[verifier],{encoding:'utf8',env:{...process.env,TMPDIR:base,npm_config_cache:cache,WORK_TEST_NPM_CACHE:cache}});
    assert.equal(result.status,1,result.stderr);
    assert.match(result.stderr,/An explicit public npm cache path is required.*Pass a populated public npm cache explicitly: node .*verify-installed\.mjs --cache \/path\/to\/public-npm-cache/);
    assert.doesNotMatch(result.stderr,/ENOENT|installation\.json|Missing repository dependency/);
    assert.doesNotMatch(result.stdout,/Verification evidence/);
  }
  // CLI parse failures happen before verification: no evidence directories or isolation trees.
  await assert.rejects(fs.access(path.join(dir,'evidence')),/ENOENT/);
  assert.deepEqual((await fs.readdir(base)).filter(name=>name.startsWith('0x2f-faithful-installed-')),[]);
  assert.equal(await fs.readFile(historical,'utf8'),before);
});

test('CLI --cache forms accept spaced paths without deriving cache from HOME or npmrc',async t=>{
  const {base,dir,verifier}=await copyVerifier(t);
  const cache=path.join(base,'public cache with spaces');
  await fs.mkdir(path.join(cache,'_cacache'),{recursive:true});
  await fs.writeFile(path.join(cache,'_cacache','public-entry'),'public data');
  const home=path.join(base,'poisoned home');
  await fs.mkdir(home);
  await fs.writeFile(path.join(home,'.npmrc'),'cache=/should-never-use\n//registry.npmjs.org/:_authToken=DO_NOT_USE');
  for(const args of [['--cache',cache],['--cache='+cache],[cache]]) {
    const result=spawnSync(process.execPath,[verifier,...args],{encoding:'utf8',env:{...process.env,HOME:home,TMPDIR:base,npm_config_cache:path.join(base,'env-cache')}});
    assert.equal(result.status,1,args.join(' ')+'\n'+result.stderr);
    assert.match(result.stderr,/Missing repository dependency|is required on the isolated system PATH/);
    assert.doesNotMatch(result.stderr,/Public npm cache missing|historical|installation\.json|should-never-use/);
  }
  assert.equal((await fs.readdir(path.join(dir,'evidence'))).length,3);
  assert.equal(await fs.readFile(path.join(home,'.npmrc'),'utf8'),'cache=/should-never-use\n//registry.npmjs.org/:_authToken=DO_NOT_USE');
});

test('a spaced output directory and cache keep failed runs separate, cleaned and historical evidence intact',async t=>{
  const base=await scratch(t),repo=path.join(base,'checkout with spaces'),dir=path.join(repo,'docs/implementation/faithful-return-2026-11-01');
  await fs.mkdir(dir,{recursive:true});
  const verifier=path.join(dir,'verify-installed.mjs');
  await fs.copyFile(new URL('../docs/implementation/faithful-return-2026-11-01/verify-installed.mjs',import.meta.url),verifier);
  const cache=path.join(base,'public npm cache');
  await fs.mkdir(path.join(cache,'_cacache'),{recursive:true});
  await fs.writeFile(path.join(cache,'_cacache','public-entry'),'public data');
  const historical=path.join(repo,'docs/qualification/2026-11-01/harness-scenario-followup/evidence/installation.json');
  await fs.mkdir(path.dirname(historical),{recursive:true});
  await fs.writeFile(historical,'{"root":"/never-touch-historical"}');
  const historicalBefore=await fs.readFile(historical,'utf8');
  const evidence=path.join(dir,'evidence');
  const attempt=()=>spawnSync(process.execPath,[verifier,'--cache',cache],{encoding:'utf8',env:{...process.env,TMPDIR:base}});
  const first=attempt();
  assert.equal(first.status,1,first.stderr);
  assert.match(first.stderr,/Missing repository dependency ws|is required on the isolated system PATH/);
  assert.doesNotMatch(first.stderr,/historical \/qualification|installation\.json|ENOENT/);
  const runs=async()=>(await fs.readdir(evidence)).sort();
  let [runOne]=await runs();
  const firstReceipt=path.join(evidence,runOne,'installed-verification.json');
  const beforeRunTwo=await fs.readFile(firstReceipt,'utf8');
  const second=attempt();
  assert.equal(second.status,1,second.stderr);
  // Every run gets its own evidence directory; earlier receipts are never rewritten.
  const [one,two]=await runs();
  assert.equal(one.length>0&&two.length>0&&one!==two,true);
  assert.equal((await runs()).length,2);
  assert.equal(await fs.readFile(firstReceipt,'utf8'),beforeRunTwo);
  // Failure cleans the whole isolation tree, including the copied _cacache.
  assert.deepEqual((await fs.readdir(base)).filter(name=>name.startsWith('0x2f-faithful-installed-')),[]);
  for(const run of [one,two]) {
    const receipt=JSON.parse(await fs.readFile(path.join(evidence,run,'installed-verification.json'),'utf8'));
    assert.equal(receipt.status,'failed');assert.equal(receipt.platform,process.platform);
  }
  // An explicit public cache means the historical receipt is never read or written.
  assert.equal(await fs.readFile(historical,'utf8'),historicalBefore);
});

test('a receipt write failure still removes the isolated HOME and cache',async t=>{
  const base=await scratch(t),dir=path.join(base,'docs/implementation/faithful-return-2026-11-01');
  await fs.mkdir(dir,{recursive:true});
  const verifier=path.join(dir,'verify-installed.mjs');
  await fs.copyFile(new URL('../docs/implementation/faithful-return-2026-11-01/verify-installed.mjs',import.meta.url),verifier);
  const cache=path.join(base,'public cache');
  await fs.mkdir(path.join(cache,'_cacache'),{recursive:true});
  await fs.writeFile(path.join(cache,'_cacache','public-entry'),'public data');
  const driver=path.join(base,'fail-receipt.mjs');
  // Inject only the evidence-write failure in a separate child. No user files
  // or settings are touched, and all verification children retain the allowlist.
  await fs.writeFile(driver,`
    import fs from 'node:fs/promises';
    import {main} from ${JSON.stringify(pathToFileURL(verifier).href)};
    const writeFile=fs.writeFile;
    fs.writeFile=(file,...args)=>{
      if(String(file).endsWith('/installed-verification.json'))throw new Error('injected receipt write failure');
      return writeFile(file,...args);
    };
    await main(${JSON.stringify(cache)});
  `);
  const result=spawnSync(process.execPath,[driver],{encoding:'utf8',env:{...process.env,TMPDIR:base}});
  assert.equal(result.status,1,result.stderr);
  assert.match(result.stderr,/injected receipt write failure/);
  assert.deepEqual((await fs.readdir(base)).filter(name=>name.startsWith('0x2f-faithful-installed-')),[]);
});
