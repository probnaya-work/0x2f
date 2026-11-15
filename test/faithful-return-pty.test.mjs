import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {makeWorkspace,startTui,waitForTask,storeOf} from "./tui-pty/driver.mjs";
import {createRuntime} from "../src/runtime.mjs";

test("PTY: read a no-change investigation, partial checks, full intent, old run and exact input before acceptance",async()=>{
  const {base}=await makeWorkspace({providerRoles:{alpha:"investigation"}});
  const gate=path.join(base,"investigation-release");
  const s=await startTui({workspace:base,cols:120,rows:36,env:{FAKE_AGENT_INVESTIGATION_GATE:gate},
    ...(process.env.WORK_RETURN_CLI ? {cli:process.env.WORK_RETURN_CLI} : {})});
  const capture=async name=>{
    if(process.env.WORK_RETURN_EVIDENCE) {await fs.mkdir(process.env.WORK_RETURN_EVIDENCE,{recursive:true});await fs.writeFile(path.join(process.env.WORK_RETURN_EVIDENCE,name+".txt"),s.text());}
  };
  // Read the actual scroll surface: the conclusion is first, while intent
  // and verification remain accessible further down the same saved report.
  const readThrough=async patterns=>{
    const remaining=new Set(patterns);
    const position=()=>s.text().match(/(\d+)\/(\d+)\s*$/m);
    for(let page=0;page<100;page++) {
      for(const pattern of remaining) if(pattern.test(s.text())) remaining.delete(pattern);
      if(!remaining.size) return;
      const before=position();
      assert.ok(before && Number(before[1])<Number(before[2]),`Missing report content: ${[...remaining]}\n${s.text()}`);
      s.write("\x1b[6~");
      await s.waitFor(()=>position()?.[1]!==before[1],{label:"next saved-report page"});
    }
    assert.fail(`Missing report content: ${[...remaining]}`);
  };
  try {
    await s.waitForText(/no task selected/);
    s.press("n"); s.type("Investigate the retry boundary.");s.press("ctrl-n");s.type("FULL_INTENT: preserve the API; do not change files.");s.press("enter");
    await s.waitForText(/executing/);s.press("c");await s.waitForText(/NOTE ON TASK/);s.type("NEXT_RUN_NOTE_SENTINEL");s.press("enter");
    await s.waitForText(/current run unchanged/);await capture("tui-note-saved-while-working");
    let working=await storeOf(base).findTask(1);assert.equal(working.status,"working");
    assert.equal(working.context.notes.at(-1).text,"NEXT_RUN_NOTE_SENTINEL");
    assert.doesNotMatch(await storeOf(base).readRunPrompt(working,1),/NEXT_RUN_NOTE_SENTINEL/);
    await fs.writeFile(gate,"");
    await waitForTask(base,1,"ready"); await s.waitForText(/result available/);await capture("tui-main-ready");
    s.press("r");await s.waitForText(/WRITTEN RESULT · PROVIDER REPORT/);await s.waitForText(/FIRST_RUN_REPORT/);await capture("tui-review-first");
    await readThrough([/FULL_INTENT/,/PARTIAL_VERIFICATION/,/EVIDENCE_END_SENTINEL/]);await capture("tui-review-context");
    s.press("enter"); assert.equal((await storeOf(base).findTask(1)).status,"ready","reading cannot accidentally accept");
    s.press("G");await s.waitForText(/FULL_INTENT/);await capture("tui-review-end");
    s.press("i");await s.waitForText(/EXACT SAVED RUN INPUT/);s.press("g");await s.waitForText(/PROJECT CONTEXT/);await capture("tui-run-input");
    s.press("escape");await s.waitForText(/ACCEPT/);
    const rt=createRuntime(base);
    await rt.actions.rerunWork(1);await waitForTask(base,1,"ready");await s.waitForText(/2 runs/);
    s.press("r");await s.waitForText(/NOTE_RECEIVED_NEXT_RUN/);s.press("[");await s.waitForText(/FIRST_RUN_REPORT/);assert.doesNotMatch(s.text(),/NOTE_RECEIVED_NEXT_RUN/);await capture("tui-earlier-run");
    s.resize(24,80);await s.waitForFrame(24,80);s.press("g");await s.waitForText(/FIRST_RUN_REPORT/);await capture("tui-review-80x24");
    await readThrough([/FULL_INTENT/,/PARTIAL_VERIFICATION/,/EVIDENCE_END_SENTINEL/]);
    s.press("escape");await s.waitForText(/ACCEPT/);s.press("enter");await waitForTask(base,1,"done",{tolerate:["ready"]});
    s.press("q");await s.waitForExit();
  } finally {s.kill();await fs.rm(base,{recursive:true,force:true});}
});
