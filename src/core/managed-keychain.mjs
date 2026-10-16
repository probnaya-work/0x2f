// A single dedicated macOS credential. No background caller may use this API.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
export const MANAGED_KEYCHAIN = Object.freeze({service:'space.0x2f.managed-openai.foreground',account:'openai-api-key'});
const helper=fileURLToPath(new URL('./managed-keychain.py',import.meta.url));
const unavailable=()=>new Error('managed_keychain_unavailable');

export function keychainProcess(operation) {
  return new Promise((resolve,reject)=>{
    // No inherited API key, Python startup hooks, shell, or value-bearing argv.
    const child=spawn('/usr/bin/python3',['-I',helper,operation],{env:{PATH:'/usr/bin:/bin'},stdio:['ignore','pipe','pipe']});
    const chunks=[];let size=0,failed=false;
    const timer=setTimeout(()=>{failed=true;child.kill('SIGKILL');},5000);
    child.stdout.on('data',b=>{size+=b.length;if(size>16384){failed=true;child.kill('SIGKILL');}else chunks.push(b);});
    child.stderr.on('data',()=>{}); // Native diagnostics are never propagated.
    child.once('error',()=>{clearTimeout(timer);reject(unavailable());});
    child.once('close',code=>{clearTimeout(timer);if(failed||![0,44].includes(code))reject(unavailable());else resolve({code,bytes:Buffer.concat(chunks)});});
  });
}

export async function managedCredential(operation,{foreground=false,platform=process.platform,run=keychainProcess}={}) {
  if(foreground!==true)throw new Error('managed_foreground_required');
  if(!['import','status','retrieve'].includes(operation)||platform!=='darwin')throw unavailable();
  let result;try{result=await run(operation);}catch{throw unavailable();}
  if(operation==='retrieve') {
    if(result.code===44)return null;
    if(result.code!==0||!Buffer.isBuffer(result.bytes)||!result.bytes.length||result.bytes.length>16384)throw unavailable();
    return result.bytes.toString('utf8');
  }
  const status=result.bytes?.toString('utf8');
  if(result.code!==0||!['configured','missing'].includes(status)||operation==='import'&&status!=='configured')throw unavailable();
  return status;
}
