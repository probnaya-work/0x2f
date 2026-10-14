// Compatibility entrypoint; lifecycle is shared by the CLI and diagnostics.
import path from 'node:path';
import { createRuntime } from '../src/runtime.mjs';
if (process.argv[3] && path.resolve(process.argv[3]) !== process.execPath) throw new Error('Run this script with the desired Node executable instead of a separate Node path.');
const base = path.resolve(process.argv[2] ?? '.');
console.log(JSON.stringify(await createRuntime(base).actions.schedulerAgent('install'), null, 2));
