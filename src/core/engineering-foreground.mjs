// User-initiated subscription execution. This module is never imported by the
// detached engineering worker and does not qualify unattended execution.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { codexProvider, codexBin } from '../providers/codex.mjs';
import { runEngineeringTask } from './engineering.mjs';
import { handoffHash } from './engineering-handoff.mjs';
const exec = promisify(execFile);

export async function foregroundPreflight({ env = process.env, home = os.homedir(), run = exec } = {}) {
  if (['OPENAI_API_KEY', 'OPENAI_BASE_URL', 'CODEX_API_KEY', 'CODEX_ACCESS_TOKEN'].some(k => env[k])) return { eligible: false, reason: 'Subscription-only foreground refuses API-key/endpoint/token overrides.' };
  const root = env.CODEX_HOME ?? path.join(home, '.codex');
  try {
    const auth = JSON.parse(await fs.readFile(path.join(root, 'auth.json'), 'utf8'));
    const config = await fs.readFile(path.join(root, 'config.toml'), 'utf8').catch(e => { if (e.code === 'ENOENT') return ''; throw e; });
    if (auth.auth_mode !== 'chatgpt' || auth.OPENAI_API_KEY || !auth.tokens?.access_token) return { eligible: false, reason: 'Existing file-backed ChatGPT subscription authentication was not established.' };
    if (/^\s*\[(?:model_providers|profiles)[.\]]|^\s*(?:base_url|chatgpt_base_url|profile)\s*=/m.test(config) || /^\s*model_provider\s*=\s*"(?!openai")/m.test(config) || /^\s*forced_login_method\s*=\s*"(?!chatgpt")/m.test(config)) return { eligible: false, reason: 'Custom provider/profile configuration needs separate qualification.' };
    const requested = env.CODEX_BIN ?? codexBin();
    const binary = path.isAbsolute(requested) ? requested : (await run('/usr/bin/which', [requested], { timeout: 5000 })).stdout.trim();
    const [login, version, bytes] = await Promise.all([run(binary, ['login', 'status'], { timeout: 5000 }), run(binary, ['--version'], { timeout: 5000 }), fs.readFile(binary)]);
    if (!/Logged in using ChatGPT/.test(login.stdout + login.stderr)) return { eligible: false, reason: 'Harness did not confirm ChatGPT authentication.' };
    return { eligible: true, evidence: { authMethod: 'chatgpt', binary, binaryDigest: handoffHash(bytes), version: version.stdout.trim(), configDigest: handoffHash(config), trustClass: 'foreground-subscription', hardSpendingCeilings: false, sandbox: 'workspace-write' } };
  } catch { return { eligible: false, reason: 'Existing subscription/configuration could not be established without credential changes.' }; }
}

export async function runForegroundEngineering(ctx, task) {
  const preflight = await foregroundPreflight();
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once('SIGINT', abort); process.once('SIGTERM', abort);
  const qualify = async p => {
    if (p !== codexProvider || !preflight.eligible) return null;
    const current = await foregroundPreflight();
    if (!current.eligible || JSON.stringify(current.evidence) !== JSON.stringify(preflight.evidence)) return null;
    return { trustClass: 'foreground-subscription', evidence: current.evidence, cancel: () => p.cancel(), execute: async input => {
      const fresh = await ctx.store.findTask(task.id);
      const run = fresh.runs.at(-1).run;
      const events = [];
      let bytes = 0;
      const outcome = await p.startForeground({ ...input, onEvent: e => { const line = JSON.stringify(e); bytes += Buffer.byteLength(line); if (bytes <= 1000000) events.push(line); } });
      await ctx.store.writeText(path.join(ctx.store.taskDir(task.slug), 'runs', String(run), 'run.log'), events.join('\n'));
      if (outcome.status === 'ready' && ['investigate', 'review'].includes(input.purpose)) {
        try { outcome.engineering = JSON.parse(outcome.result.replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { /* saved prose remains evidence; structured diagnosis/review must qualify */ }
      }
      return outcome;
    } };
  };
  try {
    await ctx.store.writeJson(path.join(ctx.store.taskDir(task.slug), 'foreground-preflight.json'), preflight);
    return await runEngineeringTask({ store: ctx.store, slug: task.slug, token: task.engineering.driver.token, providers: ctx.providers, qualify, trustClass: 'foreground-subscription', signal: controller.signal });
  } finally { process.removeListener('SIGINT', abort); process.removeListener('SIGTERM', abort); }
}
