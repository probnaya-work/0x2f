import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const phase = process.argv[2];
assert.ok(['initial', 'opencode', 'final'].includes(phase));
const evidence = path.join(path.dirname(fileURLToPath(import.meta.url)), 'evidence');
const { workspace } = JSON.parse(await fs.readFile(path.join(evidence, 'installation.json')));
const script = path.join(workspace, 'duration.mjs');
const suite = spawnSync(process.execPath, ['--test', 'duration.test.mjs'], { cwd: workspace, encoding: 'utf8' });
await fs.writeFile(path.join(evidence, `${phase}-program-tests.tap`), suite.stdout + suite.stderr);
assert.equal(suite.status, 0);
assert.ok((await fs.stat(script)).mode & 0o111);
const { formatDuration } = await import(pathToFileURL(script));
const oracle = n => {
  const b = BigInt(n);
  return `${b / 3600n}:${String(b / 60n % 60n).padStart(2, '0')}:${String(b % 60n).padStart(2, '0')}`;
};
const numbers = new Set([0, 1, 59, 60, 61, 3599, 3600, 3601, 86399, 86400, 360000, Number.MAX_SAFE_INTEGER]);
for (let i = 0; i < 1000; i++) {
  numbers.add(Number.MAX_SAFE_INTEGER - i);
  numbers.add(Number(BigInt(i) * 7919n * 104729n));
}
for (const n of numbers) assert.equal(formatDuration(n), oracle(n), `independent BigInt oracle ${n}`);
const cases = [
  { args: ['0'], expected: '0:00:00\n' },
  { args: ['360001'], expected: '100:00:01\n' },
  { args: [String(Number.MAX_SAFE_INTEGER)], expected: oracle(Number.MAX_SAFE_INTEGER) + '\n' },
  ...[[], ['01'], ['1e2'], ['1\n'], ['9007199254740992'], ['1', '2']].map(args => ({ args, invalid: true }))
];
if (phase !== 'initial') cases.push(
  { args: ['--sum', '0', '59', '1'], expected: '0:01:00\n' },
  { args: ['--sum', '3599', '1', '3600'], expected: '2:00:00\n' },
  { args: ['--sum', '0'], expected: '0:00:00\n' },
  { args: ['--sum', '9007199254740990', '1'], expected: oracle(Number.MAX_SAFE_INTEGER) + '\n' },
  ...[['--sum'], ['--sum', '1', '1e2'], ['--sum', '9007199254740991', '1'], ['--sum', '1', '2\n'], ['--sum', '01']].map(args => ({ args, invalid: true }))
);
const results = cases.map(c => {
  const r = spawnSync(script, c.args, { cwd: workspace, encoding: 'utf8' });
  let failure;
  try {
    assert.ifError(r.error);
    if (c.invalid) { assert.notEqual(r.status, 0); assert.equal(r.stdout, ''); assert.ok(r.stderr.trim()); }
    else { assert.equal(r.status, 0); assert.equal(r.stdout, c.expected); assert.equal(r.stderr, ''); }
  } catch (error) { failure = error.message; }
  return { ...c, status: r.status, stdout: r.stdout, stderr: r.stderr, ...(failure ? { failure } : {}) };
});
const result = { at: new Date().toISOString(), phase, workspace, suiteStatus: suite.status,
  suiteSummary: suite.stdout.split('\n').filter(line => /^(ℹ|#) (tests|pass|fail|skipped|duration_ms)/.test(line)),
  oracleCases: numbers.size, cliCases: results, diffCheck: execFileSync('git', ['diff', '--check'], { cwd: workspace, encoding: 'utf8' }) };
await fs.writeFile(path.join(evidence, `${phase}-independent-verification.json`), JSON.stringify(result, null, 2) + '\n');
const failed = results.filter(r => r.failure).length;
console.log(JSON.stringify({ phase, suiteSummary: result.suiteSummary, oracleCases: numbers.size, cliCases: results.length, failed, status: failed ? 'failed' : 'passed' }));
if (failed) process.exitCode = 1;
