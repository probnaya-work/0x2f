// Reversible user-local entry, deliberately separate from the installed 2f.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
const root=await fs.realpath(fileURLToPath(new URL('..',import.meta.url)));
if(!root.startsWith(path.join(os.homedir(),'Dev','PROBNAYA')+path.sep))throw new Error('Install from the durable candidate checkout under ~/Dev/PROBNAYA.');
const target=path.join(os.homedir(),'.n/bin/2f-next');
// Known local Node installation convention; never replace an existing command.
await fs.access(path.dirname(target));
const quote=s=>"'"+s.replaceAll("'","'\\''")+"'";
const body=`#!/bin/sh\n# 0x2F foreground candidate; remove this file to uninstall.\nexec ${quote(process.execPath)} ${quote(path.join(root,'src/foreground-cli.mjs'))} "$@"\n`;
await fs.writeFile(target,body,{flag:'wx',mode:0o755});
console.log(target);
