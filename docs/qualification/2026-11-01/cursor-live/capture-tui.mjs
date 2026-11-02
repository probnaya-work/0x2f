// Real installed TUI on the live task. The shared driver supplies only the PTY
// and ANSI decoder; all native executable overrides are restored to real CLIs.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {startTui} from '../../../../test/tui-pty/driver.mjs';
const dir=path.join(path.dirname(fileURLToPath(import.meta.url)),'evidence');
const {workspace,cli}=JSON.parse(await fs.readFile(path.join(dir,'installation.json'),'utf8'));
const phase=process.argv[2]??'working';
const s=await startTui({workspace,cli,cols:120,rows:36,env:{...process.env,CLAUDE_BIN:process.env.CLAUDE_BIN??'claude',CODEX_BIN:process.env.CODEX_BIN??'codex',DSH_BIN:process.env.DSH_BIN??'dsh',GEMINI_BIN:process.env.GEMINI_BIN??'gemini',PATH:'/Users/bogart/.local/bin:'+process.env.PATH,CODEX_SANDBOX:'workspace-write'}});
const save=async name=>fs.writeFile(path.join(dir,`tui-${phase}-${name}.txt`),s.text());
try{
 await s.waitForText(/0x2F/);await save('main');await s.press('r');await s.waitForText(/ORIGINAL REQUEST/);if(process.argv[3]){const root=path.join(workspace,'.work/tasks');const d=(await fs.readdir(root))[0];const task=JSON.parse(await fs.readFile(path.join(root,d,'task.json'),'utf8'));for(let n=task.runs.length;n>Number(process.argv[3]);n--)await s.press('[');await s.waitForText(new RegExp('RUN '+process.argv[3]));}await save('reader');
 await s.press('G');await new Promise(r=>setTimeout(r,200));await save('reader-end');
 await s.press('i');await s.press('g');await s.waitForText(/EXACT SAVED RUN INPUT/);await save('input');await s.press('G');await new Promise(r=>setTimeout(r,200));await save('input-end');await s.press('g');
 await s.resize(24,80);await s.waitForFrame(24,80);await save('input-80x24');
 await s.press('escape');await s.press('q');const exit=await s.waitForExit();assert.equal(exit.status?.exit??exit.code,0);console.log(JSON.stringify({phase,exit,installedCLI:cli,realHarnesses:true}));
}finally{s.kill();}
