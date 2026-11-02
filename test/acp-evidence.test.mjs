import test from 'node:test';
import assert from 'node:assert/strict';
import { createToolTracker } from '../src/providers/acp.mjs';
import { toSteps } from '../src/web/ledger.mjs';
import { resultEvidence } from '../src/web/result-evidence.mjs';

test('ACP incremental raw inputs, completion-only updates and every edit location survive normalization and ledger',()=>{
 const events=[], tools=createToolTracker(e=>events.push({...e,at:'2026-11-02T10:00:00Z'}));
 tools.update({toolCallId:'cmd',sessionUpdate:'tool_call',title:'Run command',kind:'execute'});
 tools.update({toolCallId:'cmd',sessionUpdate:'tool_call_update',rawInput:{command:'node --test test/quoted-name.test.mjs'}});
 tools.update({toolCallId:'cmd',status:'completed',rawOutput:{stdout:'3 passed\n',exitCode:0}});
 tools.update({toolCallId:'edit',title:'Edit files',kind:'edit',locations:[{path:'a.mjs'},{path:'b.mjs'}]});
 tools.update({toolCallId:'edit',status:'completed'});
 assert.deepEqual(events.filter(e=>e.type==='file.changed').map(e=>e.path),['a.mjs','b.mjs']);
 const steps=toSteps({createdAt:'2026-11-02T10:00:00Z'},events);
 assert.deepEqual(steps.commands,['node --test test/quoted-name.test.mjs']);
 const receipt=resultEvidence('',events).receipts[0];
 assert.equal(receipt.exitCode,0);
 assert.equal(receipt.output,'3 passed\n');
 assert.equal(receipt.command,'node --test test/quoted-name.test.mjs');
 assert.equal(tools.get('cmd').kind,'execute');
});
test('ACP v1 null/omitted raw fields retain observed identity and never invent an exit code',()=>{
 const events=[], tools=createToolTracker(e=>events.push(e));
 tools.update({toolCallId:'a',title:'Read',kind:'read',rawInput:{path:'real.txt'}});
 tools.update({toolCallId:'a',rawInput:null,status:'completed'});
 assert.equal(events[0].input.file_path,'real.txt');
 assert.equal(events.at(-1).exitCode,undefined);
 assert.equal(resultEvidence('',events).receipts.length,0);
});
