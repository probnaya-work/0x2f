// Run from the repository root. No network, credentials, native agent or package install.
// All output timings are machine latency, never human active/comprehension time.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../../../');
const { createStore } = await import(path.join(repo, 'src/core/store.mjs'));
const cli = path.join(repo, 'src/cli.mjs');
const fixture = path.join(here, 'fixture-agent.mjs');
const root = await fs.mkdtemp(path.join(os.tmpdir(), '0x2f-attention-'));
const evidence = path.join(here, '../evidence');
await fs.mkdir(evidence, { recursive: true });
const transcript = [], cases = [];
const env = { ...process.env, CLAUDE_BIN: '/nonexistent/research/claude', CODEX_BIN: '/nonexistent/research/codex', GEMINI_BIN: '/nonexistent/research/gemini', DSH_BIN: '/nonexistent/research/dsh', OPENCODE_BIN: '/nonexistent/research/opencode' };
function exec(exe, args, cwd) {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const p = spawn(exe, args, { cwd, env, stdio: ['ignore','pipe','pipe'] });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => { p.kill(); reject(new Error('command deadline')); }, 15000);
    p.stdout.on('data', b => stdout += b); p.stderr.on('data', b => stderr += b);
    p.on('error', e => { clearTimeout(timer); reject(e); });
    p.on('close', code => { clearTimeout(timer); resolve({ code, stdout, stderr, machineMs: +(performance.now()-start).toFixed(2) }); });
  });
}
async function command(cwd, args, { expected = 0, poll = false } = {}) {
  const r = await exec(process.execPath, [cli, ...args], cwd);
  transcript.push({ workspace: path.basename(cwd), args, ...r, poll });
  assert.equal(r.code, expected, r.stderr);
  return r;
}
async function wait(cwd, status) {
  const store = createStore(cwd), start = performance.now();
  while (performance.now()-start < 15000) {
    const t = (await store.listTasks())[0];
    if (t?.status === status) {
      // Wait for this owned detached worker to exit before a new run.
      for (let i=0; i<100; i++) {
        try { process.kill(t.pid, 0); } catch { return t; }
        await new Promise(r => setTimeout(r, 20));
      }
      return t;
    }
    await new Promise(r => setTimeout(r, 25));
  }
  throw new Error(`state deadline ${status}`);
}
async function workspace(name, kind) {
  const cwd = path.join(root, name); await fs.mkdir(cwd);
  for (const args of [['init','-q'], ['config','user.email','fixture@invalid.test'], ['config','user.name','Research fixture']]) assert.equal((await exec('git', args, cwd)).code, 0);
  await fs.writeFile(path.join(cwd, 'clamp.mjs'), 'export const clamp = n => n;\n');
  await fs.writeFile(path.join(cwd, 'scenario.json'), JSON.stringify({kind}));
  await exec('git', ['add','.'], cwd); await exec('git', ['commit','-qm','disposable baseline'], cwd);
  await command(cwd, ['init']);
  for (const id of ['fixture-a','fixture-b']) await fs.writeFile(path.join(cwd,'.work/providers',id+'.json'), JSON.stringify({ id, displayName:id, transport:'command', command:[process.execPath,fixture,'{prompt}'] }));
  await fs.writeFile(path.join(cwd,'.work/routing.json'), JSON.stringify({default:'auto',prefer:['fixture-a']}));
  return cwd;
}
async function verify(cwd, negative = true) {
  const js = `import {clamp} from './clamp.mjs'; import assert from 'node:assert/strict'; assert.equal(clamp(11),10);${negative ? 'assert.equal(clamp(-1),0);' : ''} assert.equal(clamp(5),5);`;
  return exec(process.execPath, ['--input-type=module','-e',js], cwd);
}
let failure;
try {
  // Cold first contact: no .work state; help/status do not invoke a provider.
  const cold = path.join(root,'cold'); await fs.mkdir(cold);
  await command(cold, ['status'], {expected:1});
  await command(cold, ['--help']);
  const plan = [
    ['small','small','Bound clamp to [0, 10].'],
    ['investigation','investigation','Investigate the clamp boundary; report uncertainty without editing.'],
    ['multi','multi','Implement clamp and document its bounds.'],
    ['decision','decision','Implement clamp after the policy owner chooses the limit.'],
    ['failure','failure','Implement clamp; recover after a local dependency interruption.'],
    ['continuation','small','Implement clamp; preserve original intent across a new execution provider.'],
    ['return','small','Implement clamp; reopen saved work in a fresh CLI process.'],
    ['partial','partial','Implement clamp for positive and negative inputs.']
  ];
  for (const [name, kind, brief] of plan) {
    const cwd = await workspace(name,kind), startIndex = transcript.length;
    const submitted = await command(cwd,['new',brief]);
    let t = await wait(cwd, kind==='decision' ? 'needs_you' : kind==='failure' ? 'failed' : 'ready');
    const initial = structuredClone(t);
    await command(cwd,['open','1']);
    let interventions = 0, recoveryActions = 0;
    if (kind==='decision') {
      await command(cwd,['answer','1','DECISION: cap at 10']); interventions++;
      const afterAnswer = (await createStore(cwd).listTasks())[0];
      assert.equal(afterAnswer.status,'needs_you');
      await command(cwd,['rerun','1']); recoveryActions++;
      t=await wait(cwd,'ready');
      assert.ok((await fs.readFile(path.join(cwd,'.work/tasks',t.slug,'runs/2/prompt.md'),'utf8')).includes('DECISION: cap at 10'));
    }
    if (kind==='failure') {
      await fs.writeFile(path.join(cwd,'recovered'),'fixture recovery'); recoveryActions++;
      await command(cwd,['rerun','1']); recoveryActions++;
      t=await wait(cwd,'ready');
    }
    if (name==='continuation') {
      const old = await fs.readFile(path.join(cwd,'.work/tasks',t.slug,'runs/1/result.md'),'utf8');
      await command(cwd,['note','1','CONTINUITY-MARKER: retain the bounds']);
      await command(cwd,['rerun','1','--provider','fixture-b']);
      t=await wait(cwd,'ready');
      const prompt=await fs.readFile(path.join(cwd,'.work/tasks',t.slug,'runs/2/prompt.md'),'utf8');
      assert.ok(prompt.includes('CONTINUITY-MARKER')); assert.ok(prompt.includes(old.trim()));
      assert.equal(await fs.readFile(path.join(cwd,'.work/tasks',t.slug,'runs/1/result.md'),'utf8'),old);
    }
    if (name==='return') { await command(cwd,['status']); await command(cwd,['open','1']); }
    let independent = kind==='investigation' ? null : await verify(cwd);
    if (kind==='partial') {
      assert.equal(initial.status,'ready'); assert.equal(independent.code,1);
      await command(cwd,['note','1','CORRECTION: handle negative values']); interventions++;
      await command(cwd,['rerun','1']); recoveryActions+=2;
      t=await wait(cwd,'ready'); independent=await verify(cwd);
    }
    if (independent) assert.equal(independent.code,0, independent.stderr);
    if (kind==='multi') assert.match(await fs.readFile(path.join(cwd,'USAGE.md'),'utf8'), /\[0, 10\]/);
    const detail=await command(cwd,['open','1']);
    await command(cwd,['close','1']);
    const final=(await createStore(cwd).listTasks())[0]; assert.equal(final.status,'done');
    cases.push({name, fixtureKind:kind, brief, initialStatus:initial.status, finalStatus:final.status, runs:t.runs.length, scriptedInterventions:interventions, recoveryActions, submittedMachineMs:submitted.machineMs, resultOutputChars:detail.stdout.length, scriptedCliCommands:transcript.length-startIndex, independentlyChecked:!!independent, humanActiveMs:null, humanUnderstandingMs:null, initialPartialRejectedByIndependentCheck:kind==='partial'});
  }
  // Equal executable, equal prompt, fresh identical disposable repos: overhead only.
  const calibration=[];
  for(let i=0;i<5;i++) {
    const wrapped=await workspace('calibration-wrapped-'+i,'small');
    const wrappedStart = performance.now();
    const r=await command(wrapped,['new','Bound clamp to [0, 10].']);
    const t=await wait(wrapped,'ready');
    const wrappedCompletionMachineMs = +(performance.now()-wrappedStart).toFixed(2);
    const prompt=await fs.readFile(path.join(wrapped,'.work/tasks',t.slug,'runs/1/prompt.md'),'utf8');
    const direct=await workspace('calibration-direct-'+i,'small');
    const d=await exec(process.execPath,[fixture,prompt],direct); assert.equal(d.code,0);
    assert.equal((await verify(direct)).code,0);
    calibration.push({wrappedSubmissionMachineMs:r.machineMs,wrappedCompletionMachineMs,directWholeExecutionMachineMs:d.machineMs, wrappedObservationPollMs:25,wrappedIncludesWorkerExitWait:true});
  }
  await fs.writeFile(path.join(evidence,'calibration.json'),JSON.stringify({scope:'Executable fixture overhead only. Compare completion endpoints; wrapped completion includes disk polling and worker exit wait. Submission is separately reported. Fixed wrapped-first order, n=5, no UX superiority inference.',samples:calibration},null,2));
} catch(e) { failure=e.stack; }
await fs.writeFile(path.join(evidence,'benchmark-transcript.json'),JSON.stringify(transcript,null,2));
const revision=(await exec('git',['rev-parse','HEAD'],repo)).stdout.trim();
const dirtyState=(await exec('git',['status','--porcelain'],repo)).stdout.trim();
await fs.writeFile(path.join(evidence,'benchmark-results.json'),JSON.stringify({date:'2026-11-01',revision,dirtyState,node:process.version,root,mode:'deterministic real CLI/worker + command fixture; no model, human or elapsed-delay study',cases,failure:failure??null,retained:process.argv.includes('--keep')},null,2));
console.log(JSON.stringify({root,cases:cases.length,failure:failure??null}));
if (!process.argv.includes('--keep')) await fs.rm(root,{recursive:true,force:true});
if(failure) process.exitCode=1;
