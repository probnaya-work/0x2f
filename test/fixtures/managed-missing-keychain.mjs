// Isolated CLI rehearsal only: emulate the native helper's missing-entry exit.
// No production environment switch, endpoint override or alternate credential.
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { MANAGED_MODELS } from '../../src/providers/managed-openai.mjs';
// Isolate missing-credential behavior from the real 24-hour price gate.
// Tests do not refresh production prices or perform a price/provider lookup.
Date.now=()=>Date.parse(MANAGED_MODELS[0].price.observedAt)+1000;
const original=childProcess.spawn;
childProcess.spawn=function(executable,args,options) {
  if(executable==='/usr/bin/python3'&&args?.[1]?.endsWith('/core/managed-keychain.py')) {
    return original(process.execPath,['-e',args[2]==='retrieve'?'process.exit(44)':'process.stdout.write("missing")'],{...options,env:{PATH:'/usr/bin:/bin'}});
  }
  return original.call(this,executable,args,options);
};
syncBuiltinESMExports();
// Any mistaken dispatch fails locally before network access.
globalThis.fetch=()=>{throw new Error('rehearsal_provider_call_forbidden');};
