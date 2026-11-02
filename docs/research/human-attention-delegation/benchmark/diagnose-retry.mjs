// Nonshipping copies of existing tests, with assertion diagnostics only.
// Imports and CLI entry still resolve to the unchanged audited repository.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const here=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(here,'../../../../');
const copies=[];
for(const name of ['codex-integration','gemini-integration']) {
  const source=await fs.readFile(path.join(repo,'test',name+'.test.mjs'),'utf8');
  const altered=source.replaceAll('../src/',path.join(repo,'src/')).replaceAll('./fixtures/',path.join(repo,'test/fixtures/')).replace('assert.equal(rerun.code, 0);','assert.equal(rerun.code, 0, JSON.stringify(rerun));');
  const target=path.join(here,'../evidence',name+'-diagnostic.test.mjs');
  await fs.writeFile(target,altered); copies.push(target);
}
const r=spawnSync(process.execPath,['--test','--test-name-pattern=auth failure',...copies],{cwd:repo,stdio:'inherit'});
process.exitCode=r.status??1;
