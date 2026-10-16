import { createRuntime } from '../../src/runtime.mjs';
const [base,id,digest,mode] = process.argv.slice(2);
const actions=createRuntime(base).actions;
if(mode==='reconcile')await actions.reconcileCommit(Number(id));
else await actions.executeCommit(Number(id),{scopeDigest:digest});
