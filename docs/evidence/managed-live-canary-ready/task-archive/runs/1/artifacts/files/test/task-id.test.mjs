import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTaskId} from '../src/task-id.mjs';
test('positive decimal IDs, leading zeros and safe integer boundary',()=>{
  for(const [s,n] of [['1',1],['14',14],['014',14],['00014',14],['9007199254740991',Number.MAX_SAFE_INTEGER]])assert.equal(parseTaskId(s),n,s);
});
test('reject partial, signed, padded, fractional and non-decimal strings',()=>{
  for(const s of ['14junk','1e3','1.5','0x10','+14','-1',' 14','14 ','','0','000','9007199254740992'])assert.equal(parseTaskId(s),null,JSON.stringify(s));
});
test('API accepts strings only',()=>{
  for(const x of [14,null,undefined,{},['14']])assert.equal(parseTaskId(x),null);
});
