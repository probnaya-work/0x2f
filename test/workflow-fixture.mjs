import {assertNativeFixture} from './native-launchd-fixture.mjs';
import {readInstallation,listAttempts,jobState,supervisionPlist} from '../src/core/workflow-supervision.mjs';
import { manageSupervision } from '../src/core/workflow-supervision.mjs';
import { identityMatches } from "../src/core/process-identity.mjs";
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRuntime } from '../src/runtime.mjs';
import { createStore } from '../src/core/store.mjs';
import { dueSlot, readDefinition } from '../src/core/workflows.mjs';
import { withLock } from '../src/core/lock.mjs';
import { recoverInterruptedRuns } from '../src/recover.mjs';
const exec = promisify(execFile);
export const cli = new URL('../src/cli.mjs', import.meta.url).pathname;
export const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

// Optional private diagnostics captured before cleanup, without task contents,
// adapter stdout, environment values or broad process argv collection.
export async function captureFixtureEvidence(store, phase = 'fixture') {
  const destination = process.env.WORKFLOW_TEST_EVIDENCE_DIR;
  if (!destination) return;
  const files = [], receipts = [], locks = [], errors = [], pids = new Set();
  async function walk(dir) {
    for (const entry of await fs.readdir(dir, {withFileTypes:true})) {
      const file = path.join(dir, entry.name), stat = await fs.lstat(file);
      files.push({path:path.relative(store.base,file),type:entry.isDirectory()?'directory':entry.isSymbolicLink()?'symlink':'file',bytes:stat.size});
      if (entry.isDirectory()) await walk(file);
      else if (entry.isFile() && ['receipt.json','owner.json'].includes(entry.name)) {
        const value = await store.readJson(file);
        if (entry.name==='receipt.json' && value.request?.worker) {
          receipts.push({id:value.request.id,state:value.state,reason:value.reason,worker:value.request.worker,owner:value.owner,adapter:value.adapterIdentity,pgid:value.pgid});
          for (const identity of [value.request.worker,value.owner,value.adapterIdentity]) if(identity?.pid)pids.add(identity.pid);
        } else if (entry.name==='owner.json') {
          locks.push({path:path.relative(store.base,file),pid:value.pid,helperPid:value.helperPid});
          if(value.pid)pids.add(value.pid);if(value.helperPid)pids.add(value.helperPid);
        }
      }
    }
  }
  await walk(store.workDir()).catch(error=>errors.push({code:error.code,message:error.message}));
  const tasks = (await store.listTasks()).map(t=>({id:t.id,status:t.status,error:t.error,pid:t.pid,workerIdentity:t.workerIdentity}));
  for(const task of tasks)if(task.pid)pids.add(task.pid);
  const processes = pids.size ? await exec('/bin/ps',['-p',[...pids].join(','),'-o','pid=,pgid=,comm=']).then(r=>r.stdout,e=>e.stdout??'') : '';
  await fs.mkdir(destination,{recursive:true,mode:0o700});
  await fs.writeFile(path.join(destination,`${path.basename(store.base)}-${phase}.json`),JSON.stringify({tasks,receipts,locks,files,processes,errors},null,2),{mode:0o600});
}

export async function fixture(t, { adapter = 'okay', duration = 30000, sleepMs = 5000, generated = false } = {}) {
  await assertNativeFixture();
  const base = await fs.mkdtemp(path.join(os.tmpdir(), '2f-workflow-'));
  t.after(async () => {
    const runtime = createRuntime(base);
    await captureFixtureEvidence(runtime.store);
    for (const task of await runtime.store.listTasks()) if (task.status === 'working') await runtime.actions.cancelWork(task.id).catch(() => {});
    for (const task of await runtime.store.listTasks()) {
      for (let n=0; n<300 && await identityMatches(task.workerIdentity); n++) await pause(25);
    }
    await assertNativeFixture(base);
    await manageSupervision(runtime.store,'uninstall');
    async function writable(dir){for(const e of await fs.readdir(dir,{withFileTypes:true})){if(e.isDirectory()){const d=path.join(dir,e.name);await fs.chmod(d,0o700);await writable(d);}}}
    await writable(base);
    await pause(100); await fs.rm(base, { recursive: true, force: true, maxRetries: 3 });
  });
  await exec('git', ['init', '-b', 'main', base]);
  await fs.writeFile(path.join(base, 'source.txt'), 'A real feature.\n');
  await exec('git', ['-C', base, 'add', 'source.txt']);
  await exec('git', ['-C', base, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'feat: preserve task history']);
  const configDir = path.join(base, '.work', 'workflows', 'probnaya-editorial');
  await fs.cp(new URL('../examples/workflows/probnaya-editorial/', import.meta.url).pathname, configDir, { recursive: true });
  const configPath = path.join(configDir, 'workflow.json');
  const cfg = JSON.parse(await fs.readFile(configPath, 'utf8'));
  const adapterFile = path.join(base, 'visual-adapter.mjs');
  await fs.writeFile(adapterFile, `#!${process.execPath}\nimport fs from 'node:fs';
import zlib from 'node:zlib';
function crc(b) { let c=0xffffffff; for(const v of b) { c^=v; for(let n=0;n<8;n++) c=(c>>>1)^((c&1)?0xedb88320:0); } return (c^0xffffffff)>>>0; }
function chunk(type,body) { const name=Buffer.from(type); const h=Buffer.alloc(4), tail=Buffer.alloc(4); h.writeUInt32BE(body.length); tail.writeUInt32BE(crc(Buffer.concat([name,body]))); return Buffer.concat([h,name,body,tail]); }
function png() { const h=Buffer.alloc(13);h.writeUInt32BE(1200,0);h.writeUInt32BE(630,4);h[8]=8;h[9]=2; const data=Buffer.alloc(630*(1+1200*3)); return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',h),chunk('IDAT',zlib.deflateSync(data)),chunk('IEND',Buffer.alloc(0))]); }
const args=process.argv.slice(2);
if(args[0]==='generate') { fs.appendFileSync(${JSON.stringify(path.join(base, 'calls'))}, 'call\\n'); fs.writeFileSync(args[1],png()); }
else { const spec=JSON.parse(fs.readFileSync(args.at(-1),'utf8')); ${adapter === 'fail' ? "process.exit(7);" : adapter === 'slow' ? `await new Promise(r=>setTimeout(r,${sleepMs}));` : ''} fs.writeFileSync(spec.output,png()); }
`);
  await fs.chmod(adapterFile, 0o700);
  cfg.adapters.python = adapterFile;
  cfg.adapters.supervision={processGroup:'inherit',daemonizes:false,unattended:true,network:false,paid:false};cfg.permissions.unattendedAdapters=true;
  cfg.maxDurationMs = duration; cfg.previewFirstTopic = true;
  cfg.visual.titleFont = 'unused'; cfg.visual.monoFont = 'unused';
  cfg.visual.width = 1200; cfg.visual.height = 630; delete cfg.visual.layout;
  cfg.sources = [{ id: 'fixture', repo: base, status: 'implemented_locally', repositoryUrl: 'https://example.invalid/source', files: ['source.txt'], topics: [] }];
  cfg.permissions.readSources = ['fixture'];
  if (generated) {
    cfg.sources[0].topics = [{ id: 'feature', match: 'preserve', title: 'Preserve task history', description: 'A real feature.', detail: 'Verified in a local commit.', visual: { kind: 'generated', prompt: 'A conceptual illustration, not a screenshot' } }];
    cfg.adapters.image = { argv: [adapterFile, 'generate', '{output}'] };
    cfg.permissions.imageGeneration = true; delete cfg.maxCostUsd;
  }
  await fs.writeFile(configPath, JSON.stringify(cfg));
  await fs.writeFile(path.join(base, '.work', 'project.md'), 'Fixture workspace');
  await manageSupervision(createStore(base),'install');
  return { base, runtime: createRuntime(base), cfg, configPath };
}
export async function settled(runtime, id, status) {
  for (let n=0; n<600; n++) {
    const task = await runtime.store.findTask(id);
    if(task.status!=='working'){if(status&&task.status!==status)throw new Error(`Expected ${status}, received ${task.status}: ${task.error??'no error'}`);return task;}
    await pause(40);
  }
  throw new Error('Worker did not settle.');
}
export const packDir = (store, task) => path.join(store.taskDir(task.slug), 'artifacts', 'editorial');

// Restart only a registration whose label, plist, runtime and temporary base
// match this fixture. Never bootstrap an existing job or touch a production job.
export async function restartFixtureJob(store, label) {
  await assertNativeFixture(store.base);
  const m=await readInstallation(store); label ??= m.label;
  const request=label===m.label?null:(await listAttempts(store)).find(r=>r.request.label===label)?.request;
  if(label!==m.label&&!request)throw new Error('Unknown fixture job label.');
  const plist=path.join(os.homedir(),'Library/LaunchAgents',label+'.plist');
  if(await store.readText(plist)!==supervisionPlist(m,request))throw new Error('Fixture plist ownership mismatch.');
  const job=await jobState(label);
  if(!job.loaded||job.program!==m.node.realPath||!job.argv.includes(m.base))throw new Error('Fixture registration ownership mismatch.');
  await exec('/bin/launchctl',['kickstart','-k',`gui/${process.getuid()}/${label}`]);
}
