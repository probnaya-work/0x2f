import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { foregroundPreflight } from '../src/core/engineering-foreground.mjs';
import { runEngineeringTask, engineeringQualified } from '../src/core/engineering.mjs';
import { playbookFixture, validParser } from './engineering-playbook-fixture.mjs';

test('foreground rerun refuses ordinary task before any detached launch', async t => {
  const f=await playbookFixture(t);await fs.rm(path.join(f.base,'.work/engineering.json'));
  const ordinary=await f.runtime.actions.createWork({brief:'Ordinary task',provider:'primary'});
  await f.runtime.store.updateTask({...ordinary,status:'ready'});
  let calls=0;f.runtime.node.startExecution=async()=>{calls++;return null;};
  await assert.rejects(f.runtime.actions.rerunWork(ordinary.id,{foreground:true}),/requires an engineering task/);
  assert.equal(calls,0);assert.equal((await f.runtime.store.findTask(ordinary.id)).runs.length,1);
});

test('foreground auth gate accepts existing ChatGPT metadata and refuses API/custom endpoints without calls', async t => {
  const home = await fs.mkdtemp('/private/tmp/0x2f-foreground-auth-'); t.after(() => fs.rm(home, {recursive:true,force:true}));
  await fs.mkdir(path.join(home, '.codex'));
  const authFile = path.join(home, '.codex/auth.json');
  await fs.writeFile(authFile, JSON.stringify({ auth_mode: 'chatgpt', tokens: { access_token: 'FAKE_TEST_TOKEN' } }));
  const old = await fs.readFile(authFile); let calls = 0;
  const run = async (_binary, argv) => { calls++; return { stdout: argv[0] === '--version' ? 'codex-cli fixture' : argv[0] === 'exec' ? '--ignore-user-config' : 'Logged in using ChatGPT', stderr: '' }; };
  const env = { CODEX_BIN: process.execPath };
  const ok = await foregroundPreflight({home, env, run});
  assert.equal(ok.eligible, true); assert.equal(ok.evidence.hardSpendingCeilings, false);
  assert.doesNotMatch(JSON.stringify(ok), /FAKE_TEST_TOKEN/);
  assert.deepEqual(await fs.readFile(authFile), old);
  const before = calls;
  assert.equal((await foregroundPreflight({home, env:{...env,OPENAI_API_KEY:'fake'}, run})).eligible,false);
  await fs.writeFile(path.join(home, '.codex/config.toml'), '[model_providers.custom]\nbase_url="https://example.invalid"\n');
  assert.equal((await foregroundPreflight({home, env, run})).eligible,false); assert.equal(calls,before);
});

test('foreground completed calls can continue with unknown money while deterministic result and bounded runs persist', async t => {
  const f = await playbookFixture(t);
  const task = await runEngineeringTask({ ...f.args, trustClass: 'foreground-subscription', qualify: p => ({ trustClass: 'foreground-subscription', execute: async input => {
    const outcome = await p.start(input); return { ...outcome, usage: { tokens: 0 } };
  } }) });
  assert.equal(task.status, 'ready', task.blockedOn?.text);
  assert.equal(task.engineering.budget.uncertain.length, 2);
  assert.equal(task.engineering.budget.reservations[0].maximum.moneyMicros, null);
  assert.equal(task.runs[0].usage.confirmed.moneyMicros, undefined);
  assert.equal(task.engineering.playbook.agentRuns, 2);
  assert.equal(engineeringQualified({ trustClass:'foreground-subscription',execute(){} }, false), false);
});

test('confirmed foreground token overrun stops without another model call', async t => {
  const f = await playbookFixture(t);
  let calls = 0;
  const task = await runEngineeringTask({ ...f.args, trustClass: 'foreground-subscription', qualify: p => ({ trustClass:'foreground-subscription', execute: async input => { calls++; return { ...await p.start(input), usage: { tokens: 1 } }; } }) });
  assert.equal(task.blockedOn.code, 'budget_limit'); assert.equal(calls, 1);
});

test('single-attempt foreground implementation verifies without requiring complete spend telemetry', async t => {
  const f = await playbookFixture(t, { config: { playbook: false } });
  const task = await runEngineeringTask({ ...f.args, trustClass: 'foreground-subscription', qualify: () => ({ trustClass:'foreground-subscription', execute: async ({cwd}) => { await fs.writeFile(path.join(cwd,f.source),validParser); return {status:'ready',result:'Completed fixture',usage:{tokens:0}}; } }) });
  assert.equal(task.status,'ready',task.blockedOn?.text); assert.deepEqual(task.runs.map(r=>r.purpose),['implement','verify']);
  assert.equal(task.engineering.budget.reservations[0].maximum.moneyMicros,null);
});
