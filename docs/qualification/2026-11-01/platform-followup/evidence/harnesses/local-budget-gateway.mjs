// Provider-neutral OFFLINE budget gate. Upstreams MUST be literal loopback.
// No live provider URL, credential access, or provider-specific request wiring.
import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';

const isLoopback = url => ['127.0.0.1', '[::1]'].includes(url.hostname);

export async function startLocalBudgetGateway({ upstream, model, inputUsdPerMillion,
  outputUsdPerMillion, maxTurns = 8, maxRequests = 16, perTurnRequests = 2,
  maxBodyBytes = 65536, outputLimit = 1024, budgetUsd = 5, timeoutMs = 90000,
  outputField = 'limit', audit = () => {} } = {}) {
  const target = new URL(upstream);
  if (target.protocol !== 'http:' || !isLoopback(target) || target.username || target.password) {
    throw new Error('Offline gateway accepts literal loopback HTTP upstreams only');
  }
  if (!model || !Number.isFinite(inputUsdPerMillion) || inputUsdPerMillion < 0 ||
      !Number.isFinite(outputUsdPerMillion) || outputUsdPerMillion < 0) throw new Error('Model/rates required');
  if (![maxTurns, maxRequests, perTurnRequests, maxBodyBytes, outputLimit, timeoutMs].every(n =>
    Number.isSafeInteger(n) && n > 0) || !Number.isFinite(budgetUsd) || budgetUsd <= 0) throw new Error('Positive limits required');
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(outputField)) throw new Error('Simple output limit field required');
  const token = randomBytes(32).toString('hex');
  const expectedAuth = Buffer.from(`Bearer ${token}`);
  const state = { turns: 0, requests: 0, reservedUsd: 0, active: null, inFlight: false, stopped: false };
  const turnIds = new Set();
  const snapshot = () => structuredClone(state);
  function beginTurn(id) {
    if (state.stopped || state.inFlight || state.turns >= maxTurns || !id || turnIds.has(id)) {
      throw new Error('Turn limit, duplicate, stopped or request still in flight');
    }
    state.turns++;
    state.active = { id, requests: 0 };
    turnIds.add(id);
    audit({ type: 'turn', id, turns: state.turns });
  }
  function stop() { state.stopped = true; }
  const server = http.createServer(async (req, res) => {
    const reply = (status, error) => {
      if (!res.writableEnded) { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error })); }
    };
    const auth = Buffer.from(String(req.headers.authorization ?? ''));
    if (auth.length !== expectedAuth.length || !timingSafeEqual(auth, expectedAuth)) return reply(401, 'Unauthorized local request');
    if (req.method !== 'POST' || req.url !== '/infer') return reply(404, 'No route');
    if (state.stopped || !state.active) return reply(409, 'No active approved turn');
    if (state.inFlight) return reply(409, 'Concurrent requests refused');
    // Admission is synchronous after bounded body collection. Recheck all
    // mutable limits immediately before reservation; never refund a forward.
    let bytes = 0;
    const chunks = [];
    try {
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > maxBodyBytes) { reply(413, 'Input body limit'); return; }
        chunks.push(chunk);
      }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { return reply(400, 'Invalid JSON'); }
      if (!body || typeof body !== 'object' || Array.isArray(body) || body.model !== model) return reply(400, 'Unexpected model');
      if (state.stopped || !state.active || state.inFlight) return reply(409, 'Turn is not available');
      if (state.requests >= maxRequests || state.active.requests >= perTurnRequests) return reply(429, 'Request allowance exhausted');
      // Conservative reservation, not an account billing guarantee: two
      // input tokens per byte plus 2,048 service overhead tokens; no caching
      // discount. Output reservation includes reasoning at the fixed cap.
      const reserveUsd = ((bytes * 2 + 2048) * inputUsdPerMillion + outputLimit * outputUsdPerMillion) / 1e6;
      if (state.reservedUsd + reserveUsd > budgetUsd) return reply(402, 'Reservation budget exhausted');
      body[outputField] = outputLimit;
      state.requests++;
      state.active.requests++;
      state.reservedUsd += reserveUsd;
      state.inFlight = true;
      audit({ type: 'forward', turnId: state.active.id, request: state.requests, bytes,
        outputLimit, reserveUsd, reservedUsd: state.reservedUsd });
      try {
        const response = await fetch(target, { method: 'POST',
          headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs), redirect: 'error' });
        // Small fake upstream responses only. Live streaming is not wired.
        const payload = await response.text();
        res.writeHead(response.status, { 'content-type': response.headers.get('content-type') ?? 'application/json' });
        res.end(payload);
      } catch {
        state.stopped = true;
        audit({ type: 'stop', reason: 'upstream-failure-or-timeout', requests: state.requests });
        reply(502, 'Upstream failure; gate stopped without retry or refund');
      } finally { state.inFlight = false; }
    } catch { reply(400, 'Input stream failed'); }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return { url: `http://127.0.0.1:${server.address().port}/infer`, token, beginTurn,
    stop, snapshot, close: () => new Promise(resolve => server.close(resolve)) };
}
