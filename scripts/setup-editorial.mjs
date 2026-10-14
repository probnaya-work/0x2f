// Installs only local, versioned workflow settings; never enables a schedule.
import fs from 'node:fs/promises';
import path from 'node:path';
const base = path.resolve(process.argv[2] ?? '.');
const source = new URL('../examples/workflows/probnaya-editorial/', import.meta.url).pathname;
const target = path.join(base, '.work', 'workflows', 'probnaya-editorial');
try { await fs.access(target); throw new Error('Workflow already exists; edit it explicitly instead of overwriting.'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
await fs.cp(source, target, { recursive: true });
console.log(target);
