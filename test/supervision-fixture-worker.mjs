// Real disposable owning worker for execution-boundary tests; never a provider API.
import fs from 'node:fs/promises';
import {createStore} from '../src/core/store.mjs';
import {supervisedRun} from '../src/core/workflow-supervision.mjs';
const [base,id,optionsFile]=process.argv.slice(2),store=createStore(base);
try {
  const task=await store.findTask(Number(id));
  const options=JSON.parse(await fs.readFile(optionsFile,'utf8'));
  const result=await supervisedRun(store,task,options);
  await store.writeJson(optionsFile+'.result',{state:result.state,id:result.id});
  setInterval(()=>{},1000);
} catch { await store.writeJson(optionsFile+'.result',{state:'blocked'}); }
