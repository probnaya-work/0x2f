import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {spawn} from "node:child_process";
import {pidAlive,processGroupAlive} from "../src/recover.mjs";

test("Linux unreaped zombies cannot keep an otherwise empty execution group active", {skip:process.platform!=='linux',timeout:10000}, async t=>{
  // A live parent outside the child's group deliberately delays waitpid.
  // This creates a real, harmless all-zombie group without relying on PID 1.
  const parent=spawn(process.env.PYTHON??'python3',['-c',`import os,sys
pid=os.fork()
if pid==0:
 os.setpgid(0,0)
 os._exit(0)
print(pid,flush=True)
sys.stdin.read()
os.waitpid(pid,0)
`],{stdio:['pipe','pipe','pipe']});
  const closed=new Promise(resolve=>parent.once('close',resolve));
  t.after(async()=>{parent.stdin.end();await closed;});
  const pid=await new Promise((resolve,reject)=>{parent.once('error',reject);parent.stdout.once('data',d=>resolve(Number(String(d).trim())));});
  let state;
  for(let i=0;i<100;i++){
    const stat=await fs.readFile(`/proc/${pid}/stat`,'utf8');
    const fields=stat.slice(stat.lastIndexOf(')')+2).split(' ');state=fields[0];
    if(state==='Z'){assert.equal(Number(fields[2]),pid);break;}
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.equal(state,'Z');
  process.kill(-pid,0); // The OS existence probe succeeds even though no work can execute.
  assert.equal(processGroupAlive(pid),false);
  assert.equal(pidAlive(pid),false);
});
