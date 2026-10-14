import { verifyExecutable, rejectCredentials } from '../core/workflow-adapters.mjs';
import { spawn } from 'node:child_process';

// Trusted, explicitly configured argv adapters. Never interpolate into a shell.
// No adapter output is logged: errors can contain credentials or private data.
export async function runArgv(argv, { pin, definition, cwd, signal, maxBytes = 500_000, timeoutMs = 30_000 } = {}) {
  if (!Array.isArray(argv) || !argv.length || argv.some(v => typeof v !== 'string')) throw new Error('Adapter requires argv.');
  if (definition && definition.permissions.commandAdapters !== true) throw new Error('Command adapter permission is absent.');
  if (definition) argv = [await verifyExecutable(pin), ...argv.slice(1)];
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const child = spawn(argv[0], argv.slice(1), { cwd, env:{PATH:process.env.PATH??'/usr/bin:/bin',LANG:'C.UTF-8'}, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', bytes = 0, failure;
    const stop = reason => {
      failure ??= reason;
      try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
    };
    const abort = () => stop(new Error('Adapter cancelled.'));
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => stop(new Error('Adapter duration limit exceeded.')), timeoutMs);
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > maxBytes) stop(new Error('Adapter output limit exceeded.'));
      if (stream === child.stdout && bytes <= maxBytes) stdout += chunk.toString();
    });
    child.on('error', () => { failure ??= new Error('Adapter executable unavailable.'); });
    child.on('close', code => {
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      if (failure) reject(failure);
      else if (code !== 0) reject(new Error(`Adapter failed (exit ${code}).`));
      else { try { if (definition) rejectCredentials(stdout, definition); resolve(stdout); } catch (error) { reject(error); } }
    });
  });
}

export function gitRead(repo, args, signal, definition) {
  return runArgv(['git', '-C', repo, ...args], { signal, timeoutMs: 15_000, definition, pin: definition?.adapterPins?.git });
}
