import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { formatDuration } from './duration.mjs';

const script = fileURLToPath(new URL('./duration.mjs', import.meta.url));
const cases = [
  [0, '0:00:00'],
  [1, '0:00:01'],
  [59, '0:00:59'],
  [60, '0:01:00'],
  [61, '0:01:01'],
  [3599, '0:59:59'],
  [3600, '1:00:00'],
  [3661, '1:01:01'],
  [86399, '23:59:59'],
  [86400, '24:00:00'],
  [360000, '100:00:00'],
  [Number.MAX_SAFE_INTEGER - 1, '2501999792983:36:30'],
  [Number.MAX_SAFE_INTEGER, '2501999792983:36:31'],
];

for (const [seconds, expected] of cases) {
  test(`formats ${seconds} seconds as ${expected}`, () => {
    assert.equal(formatDuration(seconds), expected);
  });
}

test('rejects invalid numeric values and non-number inputs without coercion', () => {
  for (const value of [
    -1, -60, 0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1,
    '60', '', null, undefined, true, false, 60n, {}, [], Symbol('seconds'),
  ]) {
    assert.throws(() => formatDuration(value), RangeError);
  }
});

for (const [seconds, expected] of cases) {
  test(`CLI formats ${seconds}`, () => {
    const result = spawnSync(process.execPath, [script, String(seconds)], { encoding: 'utf8' });
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, `${expected}\n`);
    assert.equal(result.stderr, '');
  });
}

const invalidArguments = [
  [], ['0', '1'], ['1', '2', '3'], [''], ['-1'], ['-0'], ['+1'], ['00'], ['01'],
  ['1.0'], ['0.5'], ['1e3'], ['0x10'], ['NaN'], ['Infinity'], [' 1'], ['1 '],
  ['1\n'], ['1\r\n'], ['\t1'], ['1\t'], ['1_000'], ['１２'], ['--help'],
  ['9007199254740992'], ['9007199254740993'], ['9'.repeat(400)],
];

for (const args of invalidArguments) {
  test(`CLI rejects ${JSON.stringify(args)}`, () => {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /non-negative safe integer/);
  });
}

test('importing the module has no CLI side effects', () => {
  const url = new URL('./duration.mjs', import.meta.url).href;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(url)})`], {
    encoding: 'utf8',
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
});

test('script has a shebang and runs directly as an executable', { skip: process.platform === 'win32' }, () => {
  assert.ok(readFileSync(script, 'utf8').startsWith('#!/usr/bin/env node\n'));
  assert.notEqual(statSync(script).mode & 0o111, 0);
  const result = spawnSync(script, ['3661'], { encoding: 'utf8' });
  assert.ifError(result.error);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '1:01:01\n');
  assert.equal(result.stderr, '');
});
