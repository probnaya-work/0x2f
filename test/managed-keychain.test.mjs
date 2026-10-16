import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { managedCredential, MANAGED_KEYCHAIN } from '../src/core/managed-keychain.mjs';
const exec=promisify(execFile);

test('dedicated Keychain returns only safe status; retrieval is memory-only and foreground-gated',async()=>{
  assert.deepEqual(MANAGED_KEYCHAIN,{service:'space.0x2f.managed-openai.foreground',account:'openai-api-key'});
  let calls=0;const run=async op=>{calls++;return {code:0,bytes:Buffer.from(op==='retrieve'?'FAKE_IN_MEMORY_ONLY':'configured')};};
  for(const operation of ['import','status','retrieve'])await assert.rejects(managedCredential(operation,{run,platform:'darwin'}),/managed_foreground_required/);
  assert.equal(calls,0,'background/scheduled callers cannot even inspect credential presence');
  for(const operation of ['import','status'])assert.equal(await managedCredential(operation,{run,platform:'darwin',foreground:true}),'configured');
  assert.equal(await managedCredential('retrieve',{run,platform:'darwin',foreground:true}),'FAKE_IN_MEMORY_ONLY');
  assert.equal(await managedCredential('retrieve',{foreground:true,platform:'darwin',run:async()=>({code:44,bytes:Buffer.alloc(0)})}),null);
  assert.equal(await managedCredential('status',{foreground:true,platform:'darwin',run:async()=>({code:0,bytes:Buffer.from('missing')})}),'missing');
  await assert.rejects(managedCredential('status',{foreground:true,platform:'darwin',run:async()=>({code:0,bytes:Buffer.from('FAKE_SECRET')})}),/^Error: managed_keychain_unavailable$/);
  await assert.rejects(managedCredential('retrieve',{foreground:true,platform:'linux',run}),/managed_keychain_unavailable/);
  await assert.rejects(managedCredential('retrieve',{foreground:true,platform:'darwin',run:()=>{throw new Error('FAKE_SECRET');}}),/^Error: managed_keychain_unavailable$/);
});

test('import verifies a private regular owned source and exact retrieval BEFORE unlink; failure preserves source',async()=>{
  const {stdout}=await exec('/usr/bin/python3',['-I','test/fixtures/managed-keychain-import.py'],{cwd:new URL('..',import.meta.url),env:{PATH:'/usr/bin:/bin'}});
  assert.equal(stdout.trim(),'passed');
});
