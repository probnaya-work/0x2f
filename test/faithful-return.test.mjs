import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resultEvidence } from "../src/web/result-evidence.mjs";
import { remotePermissionScope } from "../src/core/permission-scope.mjs";
import { projectBlockedOn, projectAck } from "../src/relay/project.mjs";
import { normalizeOutcome } from "../src/providers/claude-code.mjs";
import { createRuntime } from "../src/runtime.mjs";
import { wrap } from "../src/tui/view.mjs";
import {apply,initialState} from "../src/tui/state.mjs";

test("reading stays bound to its task when another task changes ledger order", () => {
  const tasks=[{id:2,state:"needs",runs:[{run:1}]},{id:1,state:"ready",runs:[{run:1},{run:2}]}];
  const state={...initialState(),mode:"result",review:{taskId:1,run:2}};
  const previous=apply(state,{name:"char",ch:"["},{tasks});
  assert.deepEqual(previous.intent,{type:"review",id:1,run:1});
  const returned=apply(state,{name:"escape"},{tasks});
  assert.equal(returned.state.sel,1);assert.equal(returned.state.mode,"work");
});

test("long evidence tokens remain readable at narrow width and terminal controls cannot repaint a result", () => {
  const token="long-evidence-path/".repeat(20);
  const lines=wrap("\u001b[31m"+token+"\u001b[0m",40);
  assert.equal(lines.join(""),token);assert.ok(lines.every(s=>s.length<=40));
});

test("saved provider claims, observed commands and absent receipts remain distinct", () => {
  const result = "## Result\nDone.\n\n## Verification\nUnit tests passed. Integration not run.\n\n## Evidence\nSee report.";
  const facts = resultEvidence(result, [
    {type:"tool.started",input:{command:"npm test"}},
    {type:"tool.completed",isError:false}
  ]);
  assert.equal(facts.verification,"Unit tests passed. Integration not run.");
  assert.deepEqual(facts.commands,["npm test"]);
  assert.match(facts.receipt,/not recorded/);
  assert.equal(resultEvidence("Passed 200 checks!").verification,"Not recorded.");
  assert.equal(resultEvidence("## Verification\r\nOne check.\r\n## Changes\r\nNone").verification,"One check.");
});

const scoped = {type:"permission",tool:"Edit",file:"src/a.ts",description:"Replace the local retry delay with the agreed value"};
test("bounded ACP descriptions can suffice without exporting raw input", () => {
  for(const raw of [undefined,{kind:"edit",title:scoped.description,locations:[{path:"/w/src/a.ts"}]}]) {
    const p=projectBlockedOn({...scoped,raw},"/w");
    assert.equal(p.scopeIncomplete,false); assert.equal(p.canAllow,true); assert.equal(p.raw,undefined);
  }
});

test("legacy cached mutation replies are projected without changing their acknowledged effect", () => {
  const old={ok:true,status:202,body:{id:1,status:"needs_you",execution:{provider:"claude-code",externalSessionId:"PRIVATE_SESSION"},blockedOn:{type:"permission",tool:"Write",file:"src/a.ts",plannedChange:"file: src/a.ts",raw:{tool_input:{content:"PRIVATE_INPUT"}}}}};
  const ack=projectAck(old,"/w");
  assert.equal(ack.status,202);assert.equal(ack.body.id,1);assert.equal(ack.body.provider,"claude-code");
  assert.doesNotMatch(JSON.stringify(ack),/PRIVATE_SESSION|PRIVATE_INPUT/);
  assert.equal(ack.body.blockedOn.canAllow,false);
  assert.equal(projectAck(ack,"/w"),ack,"already projected acknowledgements stay stable");
});

test("native command and edit scope is checked against the actual saved parameters", () => {
  const native = (tool,input) => normalizeOutcome({permission_denials:[{tool_name:tool,tool_input:input}]}).blockedOn;
  const cmd=native("Bash",{command:"npm test"});
  assert.equal(remotePermissionScope(cmd,"/w").complete,true);
  const edit=native("Edit",{file_path:"/w/src/a.ts",old_string:"old",new_string:"new"});
  assert.equal(remotePermissionScope(edit,"/w").complete,true);
  const long=native("Bash",{command:"echo " + "a".repeat(150) + " && deploy --production"});
  assert.equal(projectBlockedOn(long,"/w").canAllow,false);
  assert.equal(remotePermissionScope(native("Write",{file_path:"src/a.ts",content:"SECRET_NOT_FOR_PHONE"}),"/w").complete,false);
  assert.doesNotMatch(JSON.stringify(projectBlockedOn(native("Write",{file_path:"src/a.ts",content:"SECRET_NOT_FOR_PHONE"}),"/w")),/SECRET_NOT_FOR_PHONE/);
});

test("truncation, external same-basename targets, hidden and unrecorded parameters require local review", () => {
  const forms = [
    {...scoped,description:"a".repeat(500)+" consequential tail"},
    {...scoped,plannedChange:"a".repeat(200)+" consequential tail"},
    {...scoped,file:"/outside/one/deploy.sh"},
    {...scoped,file:"/outside/two/deploy.sh"},
    {...scoped,raw:{rawInput:{path:"/outside/a.ts"}}},
    {...scoped,file:"src/one/config.mjs",raw:{rawInput:{path:"src/two/config.mjs"}}},
    {...scoped,raw:{tool_input:{file_path:"src/a.ts",old_string:"old",new_string:"new",replace_all:true}},plannedChange:"old → new"},
    {type:"permission",tool:"Bash",plannedChange:"command: npm test",raw:{tool_input:{command:"npm test",dangerouslyDisableSandbox:true}}},
    {...scoped,raw:{rawInput:{content:"hidden write"}}},
    {...scoped,raw:{locations:[{path:"src/a.ts"},{path:"src/b.ts"}]}},
    {type:"permission",tool:"execute",description:"Run a command"},
    {type:"permission",tool:"Edit",file:"src/a.ts"}
  ];
  for(const form of forms){const p=projectBlockedOn(form,"/w");assert.equal(p.canAllow,false,JSON.stringify(form));assert.equal(p.scopeIncomplete,true);assert.match(p.scopeNotice,/computer/);assert.equal(p.canReject,true);}
});

test("remote scope is enforced on current state under the grant lock; local review remains possible", async t => {
  const base=await fs.mkdtemp(path.join(os.tmpdir(),"work-scope-action-"));t.after(()=>fs.rm(base,{recursive:true,force:true}));
  const runtime=createRuntime(base,{node:{id:"inert",startExecution:async()=>null,resumeExecution:async()=>null}});
  const task=await runtime.actions.createWork({brief:"Safe permission fixture"});
  const blocked={...scoped,live:true,requestId:100,decisionId:"occurrence-1",plannedChange:"long".repeat(100)};
  await runtime.store.updateTask({...task,status:"needs_you",pid:process.pid,blockedOn:blocked});
  const file=path.join(runtime.store.taskDir(task.slug),"permission.json");
  await assert.rejects(runtime.actions.allowWork(task.id,{requireRemoteScope:true,decisionId:blocked.decisionId}),/incomplete on this device/);
  await assert.rejects(fs.access(file),{code:"ENOENT"});
  assert.equal((await runtime.store.findTask(task.id)).status,"needs_you");
  await runtime.actions.allowWork(task.id,{decisionId:blocked.decisionId});
  assert.equal(JSON.parse(await fs.readFile(file,"utf8")).grant,"allow");
});
