// Persist only the user's scope and deterministic acceptance check. The lane,
// model and fixed envelope are implementation choices, never user profiles.
import path from 'node:path';
import fs from 'node:fs/promises';
import { engineeringConfig } from './engineering.mjs';
import { MANAGED_LIMITS, MANAGED_FOREGROUND_INFERENCE_MAX_USD } from '../providers/managed-openai.mjs';

export async function configureForegroundEngineering(store,{files,write,check}) {
  const target=path.join(store.workDir(),'engineering.json');
  if(await store.exists(target))throw new Error('Engineering constraints already exist; review .work/engineering.json before changing them.');
  let argv;try{argv=JSON.parse(check);}catch{throw new Error('Check must be a JSON argv array with an absolute executable.');}
  const c={schemaVersion:1,enabled:true,currency:'USD',providers:['managed-openai'],files:files.split(','),writePaths:write.split(','),check:argv,
    limits:{moneyMicros:Math.ceil(MANAGED_FOREGROUND_INFERENCE_MAX_USD*1e6),tokens:MANAGED_LIMITS.inputTokens+MANAGED_LIMITS.outputTokens,modelCalls:2,providerCalls:5,wallClockMs:120000,implementationAttempts:1,agentRuns:1,reviewCycles:0},workspace:{repository:store.base,ref:'HEAD'}};
  // Validate with the existing parser before writing the real policy. The
  // temporary store is an in-memory view, not a second persistence mechanism.
  await engineeringConfig({workDir:()=>store.workDir(),exists:async()=>true,readJson:async()=>c});
  await fs.writeFile(target,JSON.stringify(c,null,2)+'\n',{flag:'wx',mode:0o600});
  return c;
}
