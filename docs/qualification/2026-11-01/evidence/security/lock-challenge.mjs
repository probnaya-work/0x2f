import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
const repo=fileURLToPath(new URL('../../../../../',import.meta.url));
const lockUrl=pathToFileURL(path.join(repo,'src/core/lock.mjs')).href;
const {withFileLock}=await import(lockUrl);
const exec=promisify(execFile);
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'0x2f-lock-challenge-'));
const program=`import fs from 'node:fs/promises';import path from 'node:path';import {withFileLock} from ${JSON.stringify(lockUrl)};
const root=process.argv[1],role=process.argv[2];const lock=path.join(root,'mutex');
if(role==='holder'){await withFileLock(lock,async()=>{process.stdout.write('locked\\n');await new Promise(()=>setInterval(()=>{},1000));});}
else for(let i=0;i<50;i++)await withFileLock(lock,async()=>{const critical=path.join(root,'critical');await fs.mkdir(critical);try{const current=Number(await fs.readFile(path.join(root,'counter'),'utf8'));await new Promise(r=>setTimeout(r,1));await fs.writeFile(path.join(root,'counter'),String(current+1));}finally{await fs.rmdir(critical);}});`;
try{
 await fs.writeFile(path.join(dir,'counter'),'0');
 const holder=spawn(process.execPath,['--input-type=module','-e',program,dir,'holder'],{stdio:['ignore','pipe','pipe']});
 await new Promise((resolve,reject)=>{holder.stdout.once('data',resolve);holder.once('error',reject);holder.once('exit',code=>reject(new Error('holder exited '+code)));});
 const closed=new Promise(resolve=>holder.once('exit',resolve));holder.kill('SIGKILL');await closed;
 await Promise.all(Array.from({length:10},()=>exec(process.execPath,['--input-type=module','-e',program,dir,'contender'])));
 const count=Number(await fs.readFile(path.join(dir,'counter'),'utf8'));
 if(count!==500)throw new Error('counter mismatch '+count);
 console.log(JSON.stringify({deadOwnerReclaimed:true,contenders:10,criticalSections:count,overlaps:0}));
 const lock=path.join(dir,'replacement-lock');let replacement;
 await withFileLock(lock,async()=>{
  const [old]=await fs.readdir(lock);await fs.unlink(path.join(lock,old));await fs.rmdir(lock);
  const candidate=path.join(dir,'replacement-candidate');await fs.mkdir(candidate);
  replacement=`${process.pid}-${randomUUID()}.owner`;await fs.writeFile(path.join(candidate,replacement),'');await fs.rename(candidate,lock);
 });
 const markers=await fs.readdir(lock);if(markers.length!==1||markers[0]!==replacement)throw new Error('replacement was damaged');
 console.log(JSON.stringify({staleReleasePreservesReplacement:true}));
 const empty=path.join(dir,'empty-lock');await fs.mkdir(empty);let entered=false;await withFileLock(empty,async()=>{entered=true;});
 console.log(JSON.stringify({emptyLegacyDirectoryAcquired:entered}));
}finally{await fs.rm(dir,{recursive:true,force:true});}
