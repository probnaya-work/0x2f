// Read-only CLI preflight. No login, installer, model call or credential contents.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), 'evidence');
const prefix = process.env.CURSOR_PROBE_PREFIX ?? '';
fs.mkdirSync(out, {recursive:true});
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
function probe(name, command, args) {
  const result = spawnSync(command, args, {encoding:'utf8', timeout:20000, maxBuffer:1024*1024});
  const record = {command:[command,...args],exitCode:result.status,signal:result.signal,error:result.error?{code:result.error.code,message:result.error.message}:null,stdout:result.stdout??'',stderr:result.stderr??''};
  fs.writeFileSync(path.join(out,prefix+name+'.json'),JSON.stringify(record,null,2));
  return record;
}
const names=['agent','cursor-agent','cursor','codex','2f'];
const directories=[...new Set((process.env.PATH??'').split(path.delimiter).filter(Boolean))];
const resolved=Object.fromEntries(names.map(name=>[name,directories.flatMap(dir=>{
  const file=path.join(dir,name);try{fs.accessSync(file,fs.constants.X_OK);if(!fs.statSync(file).isFile())return[];return [{path:file,realpath:fs.realpathSync(file)}];}catch{return[];}
})]));
const candidates=[...new Set([
  ...['agent','cursor-agent'].flatMap(name=>[path.join(os.homedir(),'.local/bin',name),path.join(os.homedir(),'.n/bin',name),'/opt/homebrew/bin/'+name,'/usr/local/bin/'+name]),
  path.join(os.homedir(),'.cursor-agent'),path.join(os.homedir(),'.local/share/cursor-agent'),path.join(os.homedir(),'.cursor/bin'),path.join(os.homedir(),'.cursor/cli')
])].map(file=>{try{const stat=fs.statSync(file);return {path:file,exists:true,directory:stat.isDirectory(),executable:!!(stat.mode&0o111)};}catch(error){return {path:file,exists:false,error:error.code};}});
const editor='/Applications/Cursor.app/Contents/Resources/app/bin/cursor';
const wrapper=fs.existsSync(editor)?fs.readFileSync(editor,'utf8'):'';
const inventory={
  observedAt:new Date().toISOString(),host:{platform:process.platform,arch:process.arch,node:process.version},
  pathDirectories:directories,resolved,candidates,
  cursorAuth:{apiKeyEnvironmentPresent:!!process.env.CURSOR_API_KEY,authTokenEnvironmentPresent:!!process.env.CURSOR_AUTH_TOKEN,
    agentStateFilePresent:fs.existsSync(path.join(os.homedir(),'.cursor/agent-cli-state.json')),
    stateFileContentsRead:false,keychainRead:false,status:'NOT_VERIFIED_WITHOUT_AGENT_CLI'},
  editorWrapper:{path:editor,sha256:digest(wrapper),routesAgentTo:path.join(os.homedir(),'.local/bin/cursor-agent'),
    autoInstallsMissingAgent:wrapper.includes('https://cursor.com/install')&&wrapper.includes('curl -sS'),agentRouteInvoked:false},
  probes:{},modelsInvoked:0,installsPerformed:0
};
for(const name of ['agent','cursor-agent'])for(const [label,args] of [['version',['--version']],['status',['status']],['headless-help',['--print','--help']],['acp',['acp']]]){
  const standard=candidates.find(candidate=>candidate.exists&&!candidate.directory&&candidate.executable&&path.basename(candidate.path)===name);
  const executable=resolved[name]?.[0]?.path??standard?.path??name;
  const result=probe(name+'-'+label,executable,args);inventory.probes[name+'-'+label]={command:result.command,exitCode:result.exitCode,error:result.error?.code??null};
  if(name==='agent'&&label==='status'&&!result.error)inventory.cursorAuth.status=/Not logged in/i.test(result.stdout+result.stderr)?'NOT_LOGGED_IN':result.exitCode===0?'STATUS_RETURNED_SUCCESS':'STATUS_RETURNED_FAILURE';
}
const version=probe('cursor-editor-version',editor,['--version']);
inventory.editorVersion=version.stdout.trim().split('\n')[0]||null;
const help=probe('cursor-editor-help',editor,['--help']);
inventory.editorHelp={listsAgentSubcommand:/^\s+agent\s/m.test(help.stdout),listsACPFlag:/--acp\b/.test(help.stdout),exitCode:help.exitCode};
const cv=probe('codex-version','codex',['--version']);
const ca=probe('codex-auth-status','codex',['login','status']);
inventory.codex={version:cv.stdout.trim(),existingChatGPTLogin:/Logged in using ChatGPT/.test(ca.stdout+ca.stderr),modelsInvoked:0};
fs.writeFileSync(path.join(out,prefix+'inventory.json'),JSON.stringify(inventory,null,2));
console.log(JSON.stringify({resolved:inventory.resolved,editorVersion:inventory.editorVersion,cursorAuth:inventory.cursorAuth,probes:inventory.probes,codex:inventory.codex},null,2));
