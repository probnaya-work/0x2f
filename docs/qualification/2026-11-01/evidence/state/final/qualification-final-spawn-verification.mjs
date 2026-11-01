import fs from 'node:fs/promises';import fsSync from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';
import {ensureRuntime} from '/Users/bogart/Dev/PROBNAYA/work-cli-qualification-20261101/src/ui.mjs';
import {createLocalNode} from '/Users/bogart/Dev/PROBNAYA/work-cli-qualification-20261101/src/nodes/local.mjs';
import {createRuntime} from '/Users/bogart/Dev/PROBNAYA/work-cli-qualification-20261101/src/runtime.mjs';
const base=await fs.mkdtemp(path.join(os.tmpdir(),'qualification-final-spawn-'));let fd;let unrefCalled=false;
const spawnImpl=(_command,_args,opts)=>{fd=opts.stdio[1];const child=new EventEmitter();child.unref=()=>{unrefCalled=true;};queueMicrotask(()=>child.emit('error',Object.assign(new Error('controlled local spawn EAGAIN'),{code:'EAGAIN'})));return child;};
try{
await assert.rejects(()=>ensureRuntime({base,waitMs:50,intervalMs:5,probe:async()=>({ok:false,kind:'down'}),spawnImpl}),error=>error.name==='UiError'&&/EAGAIN/.test(error.message));assert.equal(unrefCalled,false);assert.throws(()=>fsSync.fstatSync(fd),{code:'EBADF'});console.log(JSON.stringify({case:'ui-async-spawn-error',handled:true,parentLogFdClosed:true,unrefCalled:false}));
const node=createLocalNode({workspace:base,spawn:spawnImpl});const runtime=createRuntime(base,{node});await assert.rejects(()=>runtime.actions.createWork({brief:'Controlled asynchronous launch failure'}),{code:'EAGAIN'});const [task]=await runtime.store.listTasks();assert.equal(task.status,'failed');assert.equal(task.failure.kind,'crashed');assert.throws(()=>fsSync.fstatSync(fd),{code:'EBADF'});assert.equal(unrefCalled,false);console.log(JSON.stringify({case:'worker-async-spawn-error',handled:true,parentLogFdClosed:true,taskStatus:task.status,failureKind:task.failure.kind,unrefCalled:false}));
}finally{await fs.rm(base,{recursive:true,force:true});}
