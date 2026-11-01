import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

const exec = promisify(execFile);
const providerModule = new URL("../src/providers/acp.mjs", import.meta.url).href;

for (const outcome of ["ready", "failed"]) {
  test(`ACP ${outcome} teardown retains no timeout after its actual child closes`, async () => {
    const base = await fs.mkdtemp(path.join(os.tmpdir(), "work-acp-teardown-"));
    try {
      const agent = path.join(base, "agent.mjs");
      await fs.writeFile(agent, `import fs from 'node:fs';
        import readline from 'node:readline';
        fs.writeFileSync('agent.pid',String(process.pid));
        ${outcome === "failed" ? "process.exit(7);" : `
        readline.createInterface({input:process.stdin}).on('line', line=>{
          const m=JSON.parse(line);const send=result=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result})+'\\n');
          if(m.method==='initialize')send({protocolVersion:1,agentCapabilities:{},authMethods:[]});
          else if(m.method==='session/new')send({sessionId:'fixture-session'});
          else if(m.method==='session/prompt')send({stopReason:'end_turn'});
        });`}
      `);
      const probe = path.join(base, "probe.mjs");
      await fs.writeFile(probe, `import fs from 'node:fs/promises';
        import {createAcpProvider} from ${JSON.stringify(providerModule)};
        const provider=createAcpProvider({id:'fixture',displayName:'Fixture',transport:'acp',permissions:'deny',command:[process.execPath,${JSON.stringify(agent)}]});
        const result=await provider.start({cwd:process.cwd(),prompt:'local fixture'});
        const pid=Number(await fs.readFile('agent.pid','utf8'));
        const deadline=Date.now()+5000;
        for(;;){try{process.kill(pid,0)}catch(e){if(e.code==='ESRCH')break;throw e}
          if(Date.now()>deadline)throw Error('fixture agent did not exit');
          await new Promise(r=>setTimeout(r,5));}
        await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));
        console.log(JSON.stringify({status:result.status,timeouts:process.getActiveResourcesInfo().filter(t=>t==='Timeout').length}));
      `);
      const { stdout } = await exec(process.execPath, [probe], { cwd: base, timeout: 10000 });
      const observed = JSON.parse(stdout);
      assert.equal(observed.status, outcome);
      assert.equal(observed.timeouts, 0, "an exited child must not retain teardown or pending RPC timers");
    } finally {
      await fs.rm(base, { recursive: true, force: true });
    }
  });
}
