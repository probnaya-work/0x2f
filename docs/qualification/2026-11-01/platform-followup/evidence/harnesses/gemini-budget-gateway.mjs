// Approved qualification gateway. No CLI or secret is loaded on import.
// The only live upstream is Google's exact Gemini 3.5 Flash-Lite REST route.
import http from 'node:http';
import fs from 'node:fs';
import { randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import path from 'node:path';
import { DEEPSEEK_MODEL, prepareDeepseekRequest, inspectDeepseekSse } from './deepseek-protocol.mjs';

export const MODEL = 'gemini-3.5-flash-lite';
const ROUTE = `/v1beta/models/${MODEL}:streamGenerateContent`;
const LIMITS = Object.freeze({ turns: 8, requests: 16, perTurn: 2, bodyBytes: 65536,
  outputTokens: 1024, turnMs: 90000, budgetUsd: 5, responseBytes: 262144 });
const RATE = Object.freeze({ input: 0.30, output: 2.50 });
const ALLOWED_BODY = new Set(['contents', 'systemInstruction', 'tools', 'toolConfig', 'generationConfig', 'safetySettings']);

function jsonResponse(res, code, message) {
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: { code, message, status: code === 401 ? 'UNAUTHENTICATED' : 'FAILED_PRECONDITION' } }));
}

function validateTextContent(content, turn, system = false) {
  if (!content || typeof content !== 'object' || Array.isArray(content) || !Array.isArray(content.parts) ||
      Object.keys(content).some(key => !['role', 'parts'].includes(key)) ||
      (content.role !== undefined && !['user', 'model', 'system'].includes(content.role))) throw new Error('Plain content object required');
  for (const part of content.parts) {
    if (!part || typeof part !== 'object' || Array.isArray(part) ||
        Object.keys(part).some(key => !['text', 'thought', 'thoughtSignature', 'functionCall', 'functionResponse'].includes(key))) {
      throw new Error('Only plaintext or approved local write history is allowed; assets and code are refused');
    }
    if (part.text !== undefined) {
      if (typeof part.text !== 'string' || part.functionCall || part.functionResponse ||
          (part.thought !== undefined && typeof part.thought !== 'boolean') ||
          (part.thoughtSignature !== undefined && typeof part.thoughtSignature !== 'string')) throw new Error('Plaintext part required');
      continue;
    }
    if (system || !turn.writePath || (!part.functionCall && !part.functionResponse)) throw new Error('Unexpected non-text part');
    if (part.functionCall) {
      const call = part.functionCall;
      if (call.name !== 'write_file' || call.args?.file_path !== turn.writePath || call.args?.content !== 'APPROVED_ONCE\n' ||
          Object.keys(call.args).some(key => !['file_path', 'content'].includes(key))) throw new Error('Unexpected write history');
    }
    if (part.functionResponse) {
      const response = part.functionResponse;
      if (response.name !== 'write_file' || !response.response || Object.entries(response.response).some(([key, value]) =>
        !['output', 'result', 'error'].includes(key) || typeof value !== 'string')) throw new Error('Unexpected function response history');
    }
  }
}

export function prepareGeminiRequest(body, turn) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Expected request object');
  for (const key of Object.keys(body)) if (!ALLOWED_BODY.has(key)) throw new Error(`Unexpected request field: ${key}`);
  if (!Array.isArray(body.contents)) throw new Error('contents array required');
  for (const content of body.contents) validateTextContent(content, turn);
  if (body.systemInstruction) validateTextContent(body.systemInstruction, turn, true);
  const result = { contents: body.contents, ...(body.systemInstruction ? { systemInstruction: body.systemInstruction } : {}),
    generationConfig: { maxOutputTokens: LIMITS.outputTokens, candidateCount: 1,
      thinkingConfig: { thinkingLevel: 'minimal', includeThoughts: false }, temperature: 0.1 } };
  // No built-in search, retrieval, grounding, remote tools or MCP declarations.
  if (turn.writePath) {
    const offered = body.tools?.some(tool => tool.functionDeclarations?.some(fn => fn.name === 'write_file'));
    if (!offered) throw new Error('Approved write_file tool was not offered');
    result.tools = [{ functionDeclarations: [{ name: 'write_file', description: 'Write the single explicitly approved qualification marker file.',
      parametersJsonSchema: { type: 'object', properties: {
        file_path: { type: 'string', enum: [turn.writePath] },
        content: { type: 'string', enum: ['APPROVED_ONCE\n'] }
      }, required: ['file_path', 'content'], additionalProperties: false } }] }];
    result.toolConfig = { functionCallingConfig: { mode: 'AUTO' } };
  }
  return result;
}

export function inspectGeminiSse(text, turn) {
  const payloads = text.split(/\r?\n/).filter(line => line.startsWith('data:'))
    .map(line => JSON.parse(line.slice(5).trim()));
  if (!payloads.length) throw new Error('No Gemini SSE data');
  const usage = { promptTokenCount: 0, candidatesTokenCount: 0, thoughtsTokenCount: 0, totalTokenCount: 0 };
  let functionCalls = 0;
  for (const payload of payloads) {
    if (payload.error) throw new Error('Upstream SSE error');
    for (const [key, value] of Object.entries(payload.usageMetadata ?? {})) {
      if (key in usage && Number.isSafeInteger(value) && value >= 0) usage[key] = Math.max(usage[key], value);
    }
    for (const candidate of payload.candidates ?? []) {
      if (candidate.finishReason === 'MAX_TOKENS') throw new Error('Output limit reached; no automatic continuation');
      if (candidate.groundingMetadata || candidate.urlContextMetadata) throw new Error('Unapproved server tool evidence');
      for (const part of candidate.content?.parts ?? []) {
        if (part.executableCode || part.codeExecutionResult) throw new Error('Unapproved code execution');
        if (!part.functionCall) continue;
        functionCalls++;
        const call = part.functionCall;
        if (!turn.writePath || call.name !== 'write_file' || call.args?.file_path !== turn.writePath ||
            call.args?.content !== 'APPROVED_ONCE\n' || Object.keys(call.args).some(k => !['file_path', 'content'].includes(k))) {
          throw new Error('Unapproved function call or write target');
        }
      }
    }
  }
  if (functionCalls > 1) throw new Error('More than one write requested in one model response');
  if (usage.candidatesTokenCount + usage.thoughtsTokenCount > LIMITS.outputTokens) throw new Error('Upstream output cap violation');
  return { usage, functionCalls };
}

export async function startGeminiBudgetGateway({ ledgerPath, auditPath, apiKey,
  liveApproved = false, mockUpstream = null, provider = 'gemini' } = {}) {
  if (!['gemini', 'deepseek'].includes(provider)) throw new Error('Unapproved provider');
  const selectedModel = provider === 'deepseek' ? DEEPSEEK_MODEL : MODEL;
  const selectedRoute = provider === 'deepseek' ? '/chat/completions' : ROUTE;
  const rates = provider === 'deepseek' ? { input: 0.30, output: 1.20 } : RATE;
  if (!ledgerPath || !auditPath) throw new Error('Persistent ledger/audit paths required');
  if (mockUpstream) {
    const url = new URL(mockUpstream);
    if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Mock upstream must be literal loopback');
  } else if (!liveApproved || typeof apiKey !== 'string' || !apiKey) throw new Error('Explicit existing-key live approval required');
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  const lockPath = `${ledgerPath}.lock`;
  const lock = fs.openSync(lockPath, 'wx', 0o600);
  let state;
  try { state = JSON.parse(fs.readFileSync(ledgerPath, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') { fs.closeSync(lock); fs.unlinkSync(lockPath); throw error; }
    state = { version: 1, approvedUsd: 5, limits: LIMITS, model: MODEL, turns: [], requests: 0,
      reservedUsd: 0, usageEstimateUsd: 0, stopped: false };
  }
  if (state.model !== MODEL || state.approvedUsd !== 5 || state.version !== 1) throw new Error('Unexpected ledger identity');
  const persist = () => { const tmp = `${ledgerPath}.tmp`; fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n', { mode: 0o600 }); fs.renameSync(tmp, ledgerPath); };
  const audit = event => fs.appendFileSync(auditPath, JSON.stringify({ at: new Date().toISOString(), ...event }) + '\n', { mode: 0o600 });
  persist();
  const token = randomBytes(32).toString('hex');
  const expected = Buffer.from(token);
  let active = null;
  let inFlight = false;
  function beginTurn(id, { writePath = null, failLocally = false } = {}) {
    if (state.stopped || inFlight || state.turns.length >= LIMITS.turns || state.turns.some(t => t.id === id)) throw new Error('Turn unavailable or exhausted');
    if (writePath && !path.isAbsolute(writePath)) throw new Error('Absolute approved scratch write required');
    active = { id, provider, requests: 0, functionCalls: 0, started: Date.now(), writePath, failLocally, deadline: Date.now() + LIMITS.turnMs };
    state.turns.push(active); persist(); audit({ type: 'turn.started', id, provider, writePath, failLocally });
  }
  const server = http.createServer(async (req, res) => {
    const supplied = Buffer.from(String(provider === 'deepseek' ? String(req.headers.authorization ?? '').replace(/^Bearer /, '') : req.headers['x-goog-api-key'] ?? ''));
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return jsonResponse(res, 401, 'Local gateway authentication required');
    const incoming = new URL(req.url, 'http://127.0.0.1');
    if (req.method !== 'POST' || incoming.pathname !== selectedRoute || (provider === 'deepseek' ? incoming.search !== '' : ([...incoming.searchParams.keys()].some(k => k !== 'alt') || incoming.searchParams.get('alt') !== 'sse'))) {
      audit({ type: 'request.rejected', reason: 'unexpected-model-method-route', path: incoming.pathname });
      return jsonResponse(res, 400, 'Only the explicitly approved model streaming route is allowed');
    }
    const turn = active;
    if (!turn || state.stopped || inFlight || Date.now() >= turn.deadline) return jsonResponse(res, 409, 'No available approved turn');
    let bytes = 0;
    const chunks = [];
    try {
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > LIMITS.bodyBytes) return jsonResponse(res, 413, 'Input body exceeds 64 KiB');
        chunks.push(chunk);
      }
      if (active !== turn || state.stopped || inFlight || Date.now() >= turn.deadline) return jsonResponse(res, 409, 'Turn changed or expired');
      const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const body = provider === 'deepseek' ? prepareDeepseekRequest(parsed) : prepareGeminiRequest(parsed, turn);
      const encoded = JSON.stringify(body);
      const forwardedBytes = Buffer.byteLength(encoded);
      if (forwardedBytes > LIMITS.bodyBytes) return jsonResponse(res, 413, 'Transformed body exceeds 64 KiB');
      if (turn.failLocally) {
        audit({ type: 'controlled.local-failure', id: turn.id, upstreamForwarded: false });
        return jsonResponse(res, 401, 'Qualification controlled auth failure before upstream forwarding');
      }
      if (state.requests >= LIMITS.requests || turn.requests >= LIMITS.perTurn) return jsonResponse(res, 429, 'Request allowance exhausted');
      const reservedInputTokens = forwardedBytes * 2 + 2048;
      const reservation = (reservedInputTokens * rates.input + LIMITS.outputTokens * rates.output) / 1e6;
      if (state.reservedUsd + reservation > LIMITS.budgetUsd) return jsonResponse(res, 402, 'Conservative reservation budget exhausted');
      if (provider === 'deepseek' && (state.deepseekReservedUsd ?? 0) + reservation > 0.10) return jsonResponse(res, 402, 'DeepSeek sub-reservation allowance exhausted');
      if (provider === 'deepseek') state.deepseekReservedUsd = (state.deepseekReservedUsd ?? 0) + reservation;
      state.requests++; turn.requests++; state.reservedUsd += reservation; inFlight = true;
      persist();
      audit({ type: 'request.forwarded', id: turn.id, number: state.requests, provider, model: selectedModel,
        bytes: forwardedBytes, sha256: createHash('sha256').update(encoded).digest('hex'),
        generationConfig: body.generationConfig ?? { max_tokens: body.max_tokens, thinking: body.thinking, reasoning_effort: body.reasoning_effort, tool_choice: body.tool_choice }, allowedTools: turn.writePath ? ['write_file'] : [],
        reservationUsd: reservation, cumulativeReservationUsd: state.reservedUsd });
      const endpoint = mockUpstream ?? (provider === 'deepseek' ? 'https://api.deepseek.com/chat/completions' : `https://generativelanguage.googleapis.com${ROUTE}?alt=sse`);
      const abort = new AbortController();
      const timer = setTimeout(() => abort.abort(), Math.max(1, turn.deadline - Date.now()));
      try {
        const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json',
          ...(mockUpstream ? {} : provider === 'deepseek' ? { authorization: `Bearer ${apiKey}` } : { 'x-goog-api-key': apiKey }) }, body: encoded, redirect: 'error', signal: abort.signal });
        const reader = response.body.getReader();
        const responseChunks = []; let responseBytes = 0;
        while (true) {
          const { done, value } = await reader.read(); if (done) break;
          responseBytes += value.length;
          if (responseBytes > LIMITS.responseBytes) { abort.abort(); throw new Error('Response byte cap exceeded'); }
          responseChunks.push(value);
        }
        const text = Buffer.concat(responseChunks).toString('utf8');
        if (response.status !== 200) {
          state.stopped = true; persist();
          audit({ type: 'upstream.error', id: turn.id, status: response.status,
            message: apiKey ? text.replaceAll(apiKey, '[REDACTED]') : text });
          return jsonResponse(res, response.status, `Upstream returned ${response.status}; gateway stopped without retry`);
        }
        const inspected = provider === 'deepseek' ? inspectDeepseekSse(text) : inspectGeminiSse(text, turn);
        if (turn.functionCalls + inspected.functionCalls > 1) throw new Error('Repeated write refused within same turn');
        turn.functionCalls += inspected.functionCalls;
        const usage = inspected.usage;
        if (!usage.totalTokenCount || usage.promptTokenCount > reservedInputTokens) throw new Error('Missing or out-of-reservation usage metadata');
        const estimate = (usage.promptTokenCount * rates.input +
          (usage.candidatesTokenCount + usage.thoughtsTokenCount) * rates.output) / 1e6;
        state.usageEstimateUsd += estimate; persist();
        audit({ type: 'response.completed', id: turn.id, number: state.requests, provider, model: selectedModel, responseModel: inspected.responseModel, usage,
          estimateUsd: estimate, cumulativeEstimateUsd: state.usageEstimateUsd, functionCalls: inspected.functionCalls, accepted: !inspected.policyError });
        if (inspected.policyError) throw new Error(inspected.policyError);
        // Validate complete tool targets before any executable function call
        // reaches the CLI, then preserve the vendor's original SSE bytes.
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
        for (const chunk of responseChunks) res.write(chunk);
        res.end();
      } catch (error) {
        state.stopped = true; persist();
        audit({ type: 'gateway.stopped', id: turn.id, reason: error.message, reservationRetained: true });
        jsonResponse(res, 502, 'Gateway stopped; no automatic retry or reservation refund');
      } finally { clearTimeout(timer); inFlight = false; }
    } catch (error) {
      audit({ type: 'request.rejected', reason: error.message });
      jsonResponse(res, 400, 'Request rejected before forwarding');
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { url: `http://127.0.0.1:${server.address().port}`, token, beginTurn,
    snapshot: () => structuredClone(state), close: async () => {
      await new Promise(resolve => server.close(resolve)); fs.closeSync(lock); fs.unlinkSync(lockPath);
    } };
}
