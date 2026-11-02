import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(here,'../../../../');
const {makeWorkspace,startTui,waitForTask,storeOf}=await import(path.join(repo,'test/tui-pty/driver.mjs'));
const {base,markers}=await makeWorkspace();
const s=await startTui({workspace:base,cols:120,rows:36});
const actions=[];
function press(k){actions.push({type:'key',key:k});s.press(k);}
function type(t){actions.push({type:'text',characters:t.length});s.type(t);}
async function capture(name){await fs.writeFile(path.join(here,'../evidence',`tui-${name}.txt`),s.text());}
try {
  await s.waitForText(/no task selected/); await capture('empty');
  press('n'); type('Implement retry handling.'); press('ctrl-n'); type('Honor Retry-After and preserve the offline queue.'); press('enter');
  await s.waitForText(/NEEDS YOU · PERMISSION/,{timeout:15000}); await capture('permission');
  press('enter'); await waitForTask(base,1,'ready',{tolerate:['needs_you']});
  await s.waitForText(/complete · awaiting you/); await capture('ready');
  press('d'); await s.waitForText(/retry with backoff/); await capture('changes'); press('escape');
  press('x'); await s.waitForText(/SEND BACK/); type(markers.correction); press('enter');
  await s.waitForText(/NEEDS YOU · DECISION/); await capture('decision');
  press('enter'); await s.waitForText(/ANSWER & CONTINUE/); type(markers.answer); press('enter');
  await waitForTask(base,1,'ready',{tolerate:['needs_you']}); await s.waitForText(/complete · awaiting you/);
  s.resize(24,80); await s.waitForFrame(24,80); await capture('ready-80x24');
  press('enter'); await waitForTask(base,1,'done',{tolerate:['ready']}); await s.waitForText(/CLOSED/); await capture('done');
  const task=await storeOf(base).findTask(1);
  await fs.writeFile(path.join(here,'../evidence/tui-actions.json'),JSON.stringify({mode:'real PTY plus deterministic ACP agent; no human/model study',actions,status:task.status,runs:task.runs.length,permissionRequests:1,decisionRequests:1},null,2));
  press('q'); await s.waitForExit();
} finally { s.kill(); await fs.rm(base,{recursive:true,force:true}); }
