import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { assertNativeFixture } from './native-launchd-fixture.mjs';

test('ordinary suite refuses native fixture before registration or workspace creation', async () => {
  const old=process.env.OX2F_NATIVE_LAUNCHD;delete process.env.OX2F_NATIVE_LAUNCHD;
  try {
    await assert.rejects(assertNativeFixture(), /explicit/);
    const {fixture}=await import('./workflow-fixture.mjs');
    await assert.rejects(fixture({after(){throw new Error('cleanup registered before gate');}}), /explicit/);
    const childEnv={...process.env,OX2F_NATIVE_LAUNCHD:'0'};delete childEnv.NODE_TEST_CONTEXT;
    const result=spawnSync(process.execPath,['--test','--test-reporter=tap','--test-name-pattern=successful real launchd','test/workflow-supervision.test.mjs'],{encoding:'utf8',env:childEnv});
    assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/skip(?:ped)? [1-9]/i);
    const helper=await fs.readFile(new URL('./workflow-fixture.mjs',import.meta.url),'utf8');
    const restart=helper.slice(helper.indexOf('export async function restartFixtureJob'));
    assert.match(restart,/'kickstart','-k'/);assert.doesNotMatch(restart,/'bootstrap'|'bootout'/);
  } finally {if(old===undefined)delete process.env.OX2F_NATIVE_LAUNCHD;else process.env.OX2F_NATIVE_LAUNCHD=old;}
});
