// Process-level crash peer. Only the loopback mock and disposable Task are used.
import {createStore} from '../../src/core/store.mjs';
import {runManagedForeground} from '../../src/core/engineering-managed.mjs';
import {managedTransport,MANAGED_MODELS} from '../../src/providers/managed-openai.mjs';

const [base,id,port,point]=process.argv.slice(2);
const store=createStore(base),task=await store.findTask(Number(id));
const transport=managedTransport(process.env.OPENAI_API_KEY,{
  fetchImpl:(url,init)=>fetch(`http://127.0.0.1:${port}${new URL(url).pathname}`,init)
});
transport.live=false;
const call=transport.call;
transport.call=async(kind,...args)=>{
  const pending=call(kind,...args);
  if(point==='in-flight'&&kind==='inference')setTimeout(()=>process.kill(process.pid,'SIGKILL'),100);
  return pending;
};
const registry=MANAGED_MODELS;
await runManagedForeground({store},task,{transport,registry,foregroundCanary:true,fault:(p,kind)=>{
  if(p===point&&kind==='inference')process.kill(process.pid,'SIGKILL');
}});
