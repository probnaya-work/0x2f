import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startLocalBudgetGateway } from './local-budget-gateway.mjs';

async function fixture(options = {}, handler) {
  const forwarded = [];
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    forwarded.push({ headers: req.headers, body: JSON.parse(body) });
    if (handler) return handler(req, res);
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ result: 'fake-only', usage: { input: 10, output: 1 } }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const gate = await startLocalBudgetGateway({ upstream: `http://127.0.0.1:${server.address().port}/mock`,
    model: 'offline-fixture', inputUsdPerMillion: 1.75, outputUsdPerMillion: 14, ...options });
  const send = (body = { model: 'offline-fixture' }, token = gate.token) => fetch(gate.url, {
    method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  return { gate, forwarded, send, close: async () => { await gate.close(); await new Promise(r => server.close(r)); } };
}

test('only literal loopback fake upstreams can be configured', async () => {
  for (const upstream of ['https://api.example.invalid/infer', 'http://localhost/infer',
    'http://127.0.0.1.evil.invalid/infer', 'http://user:secret@127.0.0.1/infer']) {
    await assert.rejects(() => startLocalBudgetGateway({ upstream }), /loopback/);
  }
});

test('auth, active turn, model and input checks prevent any upstream request', async () => {
  const f = await fixture({ maxBodyBytes: 100 });
  try {
    assert.equal((await f.send({}, 'wrong')).status, 401);
    assert.equal((await f.send()).status, 409);
    f.gate.beginTurn('1');
    assert.equal((await f.send({ model: 'drift' })).status, 400);
    assert.equal((await f.send({ model: 'offline-fixture', input: 'x'.repeat(200) })).status, 413);
    assert.equal(f.forwarded.length, 0);
    assert.equal(f.gate.snapshot().requests, 0);
  } finally { await f.close(); }
});

test('fixed output cap and per-turn/total request limits apply before forwarding', async () => {
  const f = await fixture({ maxTurns: 2, maxRequests: 3, perTurnRequests: 2 });
  try {
    f.gate.beginTurn('1');
    assert.equal((await f.send({ model: 'offline-fixture', limit: 999999 })).status, 200);
    assert.equal(f.forwarded[0].body.limit, 1024);
    assert.equal(f.forwarded[0].headers.authorization, undefined, 'local token is not forwarded');
    assert.equal((await f.send()).status, 200);
    assert.equal((await f.send()).status, 429);
    f.gate.beginTurn('2');
    assert.equal((await f.send()).status, 200);
    assert.equal((await f.send()).status, 429);
    assert.equal(f.forwarded.length, 3);
    assert.throws(() => f.gate.beginTurn('3'), /limit/);
  } finally { await f.close(); }
});

test('budget exhaustion rejects before the first paid-shaped request', async () => {
  const f = await fixture({ budgetUsd: 0.001 });
  try {
    f.gate.beginTurn('1');
    assert.equal((await f.send()).status, 402);
    assert.equal(f.forwarded.length, 0);
    assert.equal(f.gate.snapshot().reservedUsd, 0);
  } finally { await f.close(); }
});

test('concurrent request and turn changes cannot overlap a live forward', async () => {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  let arrived;
  const received = new Promise(resolve => { arrived = resolve; });
  const f = await fixture({}, async (req, res) => { arrived(); await held; res.end('{}'); });
  try {
    f.gate.beginTurn('1');
    const first = f.send();
    await received;
    assert.equal((await f.send()).status, 409);
    assert.throws(() => f.gate.beginTurn('2'), /flight/);
    release();
    assert.equal((await first).status, 200);
    assert.equal(f.forwarded.length, 1);
  } finally { release(); await f.close(); }
});

test('timeout stops gate without automatic retry or reservation refund', async () => {
  const f = await fixture({ timeoutMs: 50 }, (req, res) => {
    const timer = setTimeout(() => res.end('{}'), 150);
    res.once('close', () => clearTimeout(timer));
  });
  try {
    f.gate.beginTurn('1');
    assert.equal((await f.send()).status, 502);
    assert.equal(f.gate.snapshot().stopped, true);
    assert.ok(f.gate.snapshot().reservedUsd > 0);
    assert.equal((await f.send()).status, 409);
    assert.equal(f.forwarded.length, 1);
  } finally { await f.close(); }
});

test('upstream redirects are refused without following another endpoint', async () => {
  const f = await fixture({}, (req, res) => { res.writeHead(302, { location: 'https://example.invalid/' }); res.end(); });
  try {
    f.gate.beginTurn('1');
    assert.equal((await f.send()).status, 502);
    assert.equal(f.gate.snapshot().stopped, true);
    assert.equal(f.forwarded.length, 1);
  } finally { await f.close(); }
});
