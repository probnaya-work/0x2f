import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createStore} from '../src/core/store.mjs';
import {rejectCredentialValues} from '../src/core/workflow-credentials.mjs';
import {pinAdapters,writeCredentialJson} from '../src/core/workflow-adapters.mjs';
import {commitWorkflow} from '../src/core/workflow-transaction.mjs';
import {freezeEditorialSnapshot,validateEditorialDefinition} from '../src/workflows/editorial-schema.mjs';

const cases = [
  ['newline','fixture\ncredential-51',s=>({value:s})],
  ['quote','fixture"credential-52',s=>({value:s})],
  ['backslash','fixture\\credential-53',s=>({value:s})],
  ['combined','fixture"\n\\credential-54',s=>({value:s})],
  ['Buffer','fixture-buffer-55',s=>Buffer.from(s)],
  ['Uint8Array','fixture-bytes-56',s=>new Uint8Array(Buffer.from(s))],
  ['ArrayBuffer','fixture-bytes-57',s=>Uint8Array.from(Buffer.from(s)).buffer],
  ['Buffer JSON','fixture-buffer-json-58',s=>Buffer.from(s).toJSON()],
  ['object key','fixture"\n\\key-59',s=>({[s]:'safe'})],
  ['nested array/object','fixture"\n\\nested-60',s=>({outer:[{inner:[s]}]})],
  ['serialized material','fixture"\n\\material-61',s=>JSON.stringify({outer:[{inner:s}]})]
];

async function cleanTree(dir,secret){
  for(const entry of await fs.readdir(dir,{withFileTypes:true})){
    assert.doesNotThrow(()=>rejectCredentialValues(entry.name,[secret]));const file=path.join(dir,entry.name);
    if(entry.isDirectory())await cleanTree(file,secret);
    else if(entry.isFile()){const bytes=await fs.readFile(file);assert.doesNotThrow(()=>rejectCredentialValues(bytes,[secret]));}
  }
}

for(const [label,secret,make] of cases)test(`recursive credential guard rejects ${label} before persistent writes`,async t=>{
  const base=await fs.mkdtemp(path.join(os.tmpdir(),'2f-credential-guard-'));t.after(()=>fs.rm(base,{recursive:true,force:true}));
  process.env.FIXTURE_GUARD_KEY=secret;t.after(()=>delete process.env.FIXTURE_GUARD_KEY);
  const store=createStore(base),def={adapters:{python:'unused',supervision:{credentialEnv:['FIXTURE_GUARD_KEY']}}},value=make(secret);
  assert.throws(()=>rejectCredentialValues(value,[secret]),error=>error.message==='Credential-bearing workflow data refused: credential values are not permitted.');
  await assert.rejects(writeCredentialJson(store,path.join(base,'receipt.json'),value,def),/Credential-bearing/);
  await assert.rejects(pinAdapters({...def,extra:value}),/Credential-bearing/);
  await assert.rejects(freezeEditorialSnapshot({store,definition:def,materials:{'template.md':value}}),/Credential-bearing/);
  const before={id:1,slug:'fixture',workflow:{definition:def}};
  await assert.rejects(commitWorkflow(store,before,{...before,result:value},{kind:'result',payload:value}),/Credential-bearing/);
  await writeCredentialJson(store,path.join(base,'safe.json'),{state:'refused'},def);
  await cleanTree(base,secret);assert.deepEqual(await fs.readdir(base),['safe.json']);
});

test('unattended raw definition requires explicit true, collection permission is not widened',async()=>{
  const raw=JSON.parse(await fs.readFile(new URL('../examples/workflows/probnaya-editorial/workflow.json',import.meta.url),'utf8'));
  raw.permissions.unattendedAdapters=true;raw.adapters.supervision={processGroup:'inherit',daemonizes:false,unattended:true,network:false,paid:false};
  delete raw.permissions.commandAdapters;assert.throws(()=>validateEditorialDefinition(raw),/Explicit source commandAdapters/);
  raw.permissions.commandAdapters=false;assert.throws(()=>validateEditorialDefinition(raw),/Explicit source commandAdapters/);
  raw.permissions.commandAdapters=true;assert.doesNotThrow(()=>validateEditorialDefinition(raw));
  delete raw.permissions.unattendedAdapters;delete raw.permissions.commandAdapters;raw.previewFirstTopic=false;
  assert.doesNotThrow(()=>validateEditorialDefinition(raw));assert.equal(Object.hasOwn(raw.permissions,'commandAdapters'),false);
});
