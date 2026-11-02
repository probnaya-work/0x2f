#!/usr/bin/env node
// Independent acceptance oracle: copy neither this file nor its assertions into agent prompts.
import assert from 'node:assert/strict';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [fixture, selection = 'all'] = process.argv.slice(2);
if (!fixture || !['all', 'headers', 'recovery', 'retry', 'handoff'].includes(selection)) throw new Error('Usage: node check.mjs FIXTURE [all|headers|recovery|retry|handoff]');
const receipts = [];
async function check(name, body) {
  try { await body(); receipts.push({ name, pass: true }); }
  catch (error) { receipts.push({ name, pass: false, error: `${error.name}: ${error.message}` }); }
}
let createRetryClient;
await check('module loads without packages or generated files', async () => {
  ({ createRetryClient } = await import(pathToFileURL(join(resolve(fixture), 'src/client.mjs')).href));
  assert.equal(typeof createRetryClient, 'function');
});
function scenario(sequence, options = {}) {
  const calls = [], delays = [];
  const client = createRetryClient({ ...options,
    transport: async request => { calls.push(request); const item = sequence[Math.min(calls.length - 1, sequence.length - 1)]; if (item instanceof Error) throw item; return item; },
    sleep: async delay => { delays.push(delay); },
  });
  return { client, calls, delays };
}
const response = (status, headers = {}) => ({ status, headers, body: 'fixture' });
if (createRetryClient && ['all', 'headers'].includes(selection)) {
  await check('caller accept override is case-insensitive and unique', async () => {
    const s = scenario([response(200)]); await s.client.request({ headers: { Accept: 'text/plain', 'x-trace': 'local' } });
    const pairs = Object.entries(s.calls[0].headers).filter(([key]) => key.toLowerCase() === 'accept');
    assert.equal(pairs.length, 1); assert.equal(pairs[0][1], 'text/plain'); assert.equal(s.calls[0].headers['x-trace'], 'local');
  });
  await check('default accept remains JSON', async () => {
    const s = scenario([response(200)]); await s.client.request();
    assert.equal(Object.entries(s.calls[0].headers).find(([key]) => key.toLowerCase() === 'accept')?.[1], 'application/json');
  });
}
if (createRetryClient && ['all', 'retry', 'handoff'].includes(selection)) {
  await check('GET retries 503 then succeeds with deterministic delay', async () => {
    const final = response(200), s = scenario([response(503), final]);
    assert.equal(await s.client.request(), final); assert.equal(s.calls.length, 2); assert.deepEqual(s.delays, [100]);
  });
  await check('HEAD handles numeric Retry-After seconds within cap', async () => {
    const s = scenario([response(429, { 'Retry-After': '2' }), response(200)]);
    assert.equal((await s.client.request({ method: 'head' })).status, 200); assert.deepEqual(s.delays, [1000]);
  });
  await check('GET retries network error; final error identity preserved', async () => {
    const failure = new Error('transport unavailable'), s = scenario([failure]);
    await assert.rejects(s.client.request(), error => error === failure); assert.equal(s.calls.length, 3); assert.deepEqual(s.delays, [100, 200]);
  });
  await check('transient response stops after three total attempts', async () => {
    const final = response(503), s = scenario([final]); assert.equal(await s.client.request(), final);
    assert.equal(s.calls.length, 3); assert.deepEqual(s.delays, [100, 200]);
  });
  await check('POST is never retried and body/header/signal remain intact', async () => {
    const body = 'charge-once', signal = new AbortController().signal, final = response(503), s = scenario([final, response(200)]);
    assert.equal(await s.client.request({ method: 'POST', body, signal, headers: { 'x-key': 'safe' } }), final);
    assert.equal(s.calls.length, 1); assert.equal(s.calls[0].body, body); assert.equal(s.calls[0].signal, signal); assert.equal(s.calls[0].headers['x-key'], 'safe'); assert.deepEqual(s.delays, []);
  });
  await check('AbortError is never retried', async () => {
    const failure = Object.assign(new Error('cancelled'), { name: 'AbortError' }), s = scenario([failure]);
    await assert.rejects(s.client.request(), error => error === failure); assert.equal(s.calls.length, 1); assert.deepEqual(s.delays, []);
  });
  await check('permanent response is returned without retry', async () => {
    const final = response(400), s = scenario([final]); assert.equal(await s.client.request(), final); assert.equal(s.calls.length, 1); assert.deepEqual(s.delays, []);
  });
}
if (createRetryClient && selection === 'recovery') await check('recovered client executes local success', async () => {
  const final = response(200), s = scenario([final]); assert.equal(await s.client.request(), final); assert.equal(s.calls.length, 1);
});
const result = { fixture: resolve(fixture), selection, checks: receipts, passed: receipts.filter(row => row.pass).length, failed: receipts.filter(row => !row.pass).length, networkUsed: false, agentOrHumanEvaluation: false };
console.log(JSON.stringify(result, null, 2));
process.exitCode = result.failed ? 1 : 0;
