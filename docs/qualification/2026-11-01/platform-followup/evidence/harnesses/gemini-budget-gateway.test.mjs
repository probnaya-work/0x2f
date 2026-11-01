import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { MODEL, prepareGeminiRequest, inspectGeminiSse, startGeminiBudgetGateway } from './gemini-budget-gateway.mjs';

const body = { contents: [{ role: 'user', parts: [{ text: 'offline fixture' }] }],
  tools: [{ googleSearch: {} }, { functionDeclarations: [{ name: 'shell', parametersJsonSchema: { type: 'object' } }] }],
  generationConfig: { maxOutputTokens: 900000, candidateCount: 10, thinkingConfig: { thinkingLevel: 'high' } } };
const sse = (part = { text: 'fixture response' }, usage = {}) => `data: ${JSON.stringify({
  candidates: [{ content: { role: 'model', parts: [part] }, finishReason: 'STOP' }],
  usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, thoughtsTokenCount: 2, totalTokenCount: 17, ...usage }
})}\n\n`;

async function setup(handler) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), '0x2f-google-gate-test-'));
  const ledgerPath = path.join(dir, 'ledger.json'); const auditPath = path.join(dir, 'audit.jsonl');
  const received = [];
  const backend = http.createServer(async (req, res) => {
    let text = ''; for await (const chunk of req) text += chunk;
    received.push({ body: JSON.parse(text), headers: req.headers });
    if (handler) return handler(req, res);
    res.writeHead(200, { 'content-type': 'text/event-stream' }); res.end(sse());
  });
  await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve));
  const options = { ledgerPath, auditPath, mockUpstream: `http://127.0.0.1:${backend.address().port}/fake` };
  let gate = await startGeminiBudgetGateway(options);
  return { received, dir, ledgerPath, auditPath, get gate() { return gate; },
    restart: async () => { await gate.close(); gate = await startGeminiBudgetGateway(options); },
    send: async (payload = body, route = `/v1beta/models/${MODEL}:streamGenerateContent?alt=sse`) => fetch(`${gate.url}${route}`, {
      method: 'POST', headers: { 'x-goog-api-key': gate.token }, body: JSON.stringify(payload)
    }),
    close: async () => { await gate.close(); await new Promise(resolve => backend.close(resolve)); await fs.rm(dir, { recursive: true, force: true }); } };
}

test('Gemini transform fixes total output/thinking cap and removes all unapproved tools', () => {
  const prepared = prepareGeminiRequest(body, {});
  assert.equal(prepared.generationConfig.maxOutputTokens, 1024);
  assert.equal(prepared.generationConfig.thinkingConfig.thinkingLevel, 'minimal');
  assert.equal(prepared.generationConfig.candidateCount, 1);
  assert.equal(prepared.tools, undefined);
  assert.throws(() => prepareGeminiRequest({ ...body, cachedContent: 'external-cache' }, {}), /Unexpected/);
  for (const part of [{ fileData: { fileUri: 'https://example.invalid/huge.pdf' } },
    { inlineData: { mimeType: 'image/png', data: 'compressed-image' } },
    { executableCode: { language: 'PYTHON', code: 'print(1)' } }]) {
    assert.throws(() => prepareGeminiRequest({ contents: [{ parts: [part] }] }, {}), /assets and code/);
  }
  assert.throws(() => prepareGeminiRequest({ ...body, systemInstruction: 'scalar' }, {}), /Plain content/);
});

test('exact endpoint/model, body size and controlled auth failure never reach upstream', async () => {
  const f = await setup();
  try {
    f.gate.beginTurn('controlled-retry', { failLocally: true });
    assert.equal((await f.send()).status, 401);
    assert.equal((await f.send()).status, 401, 'same turn remains local even if client retries');
    assert.equal((await f.send(body, '/v1beta/models/other:streamGenerateContent?alt=sse')).status, 400);
    assert.equal((await f.send({ contents: [{ parts: [{ text: 'x'.repeat(65537) }] }] })).status, 413);
    assert.equal(f.received.length, 0);
    assert.equal(f.gate.snapshot().requests, 0);
    f.gate.beginTurn('manual-retry');
    assert.equal((await f.send()).status, 200);
    assert.equal(f.received.length, 1);
  } finally { await f.close(); }
});

test('SSE remains parseable, usage is audited, cap applied, and local auth never forwarded', async () => {
  const f = await setup();
  try {
    f.gate.beginTurn('text');
    const response = await f.send();
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /event-stream/);
    assert.match(await response.text(), /fixture response/);
    assert.equal(f.received[0].body.generationConfig.maxOutputTokens, 1024);
    assert.equal(f.received[0].headers['x-goog-api-key'], undefined);
    assert.equal(f.received[0].headers.authorization, undefined);
    const audit = await fs.readFile(f.auditPath, 'utf8');
    assert.doesNotMatch(audit, new RegExp(f.gate.token));
    assert.ok(JSON.parse(audit.trim().split('\n').at(-1)).usage.totalTokenCount === 17);
    assert.ok(f.gate.snapshot().reservedUsd > f.gate.snapshot().usageEstimateUsd);
  } finally { await f.close(); }
});

test('persistent ledger enforces two calls per turn and sixteen across eight turns including restart', async () => {
  const f = await setup();
  try {
    for (let turn = 0; turn < 8; turn++) {
      if (turn === 4) await f.restart();
      f.gate.beginTurn(`turn-${turn}`);
      assert.equal((await f.send()).status, 200);
      assert.equal((await f.send()).status, 200);
      assert.equal((await f.send()).status, 429);
    }
    assert.equal(f.received.length, 16);
    assert.equal(f.gate.snapshot().requests, 16);
    assert.ok(f.gate.snapshot().reservedUsd < 5);
    assert.throws(() => f.gate.beginTurn('turn-9'), /exhausted/);
  } finally { await f.close(); }
});

test('only the exact approved file/content reaches CLI; response tool drift is blocked', async () => {
  const approved = '/private/tmp/approved-fixture/permission-roundtrip.txt';
  const request = { ...body, tools: [{ functionDeclarations: [{ name: 'write_file' }] }] };
  const prepared = prepareGeminiRequest(request, { writePath: approved });
  assert.deepEqual(prepared.tools[0].functionDeclarations.map(f => f.name), ['write_file']);
  assert.deepEqual(prepared.tools[0].functionDeclarations[0].parametersJsonSchema.properties.file_path.enum, [approved]);
  assert.equal(inspectGeminiSse(sse({ functionCall: { name: 'write_file', args: { file_path: approved, content: 'APPROVED_ONCE\n' } } }), { writePath: approved }).functionCalls, 1);
  assert.throws(() => inspectGeminiSse(sse({ functionCall: { name: 'write_file', args: { file_path: '/private/tmp/other', content: 'APPROVED_ONCE\n' } } }), { writePath: approved }), /Unapproved/);
  const f = await setup((req, res) => { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.end(sse({ functionCall: { name: 'shell', args: { command: 'bad' } } })); });
  try {
    f.gate.beginTurn('permission', { writePath: approved });
    assert.equal((await f.send(request)).status, 502);
    assert.equal(f.gate.snapshot().stopped, true);
  } finally { await f.close(); }
});

test('redirect and upstream auth failure stop without retry or refund', async () => {
  for (const status of [302, 401]) {
    const f = await setup((req, res) => { res.writeHead(status, { location: 'https://example.invalid/' }); res.end('{}'); });
    try {
      f.gate.beginTurn('stop');
      assert.equal((await f.send()).status, status === 302 ? 502 : 401);
      assert.equal(f.gate.snapshot().stopped, true);
      assert.equal(f.received.length, 1);
      assert.ok(f.gate.snapshot().reservedUsd > 0);
      assert.equal((await f.send()).status, 409);
    } finally { await f.close(); }
  }
});

test('a repeated write across separate responses is stopped before a second call reaches CLI', async () => {
  const approved = '/private/tmp/approved-fixture/permission-roundtrip.txt';
  const request = { ...body, tools: [{ functionDeclarations: [{ name: 'write_file' }] }] };
  const f = await setup((req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.end(sse({ functionCall: { name: 'write_file', args: { file_path: approved, content: 'APPROVED_ONCE\n' } } }));
  });
  try {
    f.gate.beginTurn('one-write', { writePath: approved });
    assert.equal((await f.send(request)).status, 200);
    const repeated = await f.send(request);
    assert.equal(repeated.status, 502);
    assert.doesNotMatch(await repeated.text(), /functionCall/);
    assert.equal(f.received.length, 2);
    assert.equal(f.gate.snapshot().turns[0].functionCalls, 1);
    assert.equal(f.gate.snapshot().stopped, true);
  } finally { await f.close(); }
});

test('missing usage or combined output/thinking overflow cannot produce accepted SSE', async () => {
  assert.throws(() => inspectGeminiSse(sse(undefined, { candidatesTokenCount: 1000, thoughtsTokenCount: 100 }), {}), /cap violation/);
  const f = await setup((req, res) => { res.writeHead(200, { 'content-type': 'text/event-stream' }); res.end('data: {"candidates":[]}\n\n'); });
  try {
    f.gate.beginTurn('missing-usage');
    assert.equal((await f.send()).status, 502);
    assert.equal(f.gate.snapshot().stopped, true);
    assert.equal(f.received.length, 1);
  } finally { await f.close(); }
});
