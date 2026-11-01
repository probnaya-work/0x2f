// No session/prompt: discover the installed agent's actual default model without inference.
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const evidence = path.join(path.dirname(fileURLToPath(import.meta.url)), 'evidence');
const { workspace } = JSON.parse(await fs.readFile(path.join(evidence, 'installation.json')));
const child = spawn('opencode', ['acp'], { cwd: workspace, stdio: ['pipe', 'pipe', 'pipe'] });
const transcript = [];
let buffer = '', stderr = '', sequence = 0;
const pending = new Map();
child.stderr.on('data', chunk => { stderr += chunk; });
child.stdout.on('data', chunk => {
  buffer += chunk;
  while (buffer.includes('\n')) {
    const end = buffer.indexOf('\n');
    const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
    try {
      const message = JSON.parse(line);
      transcript.push({ direction: 'agent', message });
      if (pending.has(message.id)) { const p = pending.get(message.id); pending.delete(message.id); message.error ? p.reject(new Error(JSON.stringify(message.error))) : p.resolve(message.result); }
    } catch { /* Retain only protocol JSON, never log credentials or unrelated stdout. */ }
  }
});
function send(method, params) {
  const id = ++sequence;
  const message = { jsonrpc: '2.0', id, method, params };
  transcript.push({ direction: 'client', message });
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); child.stdin.write(JSON.stringify(message) + '\n'); });
}
const timer = setTimeout(() => child.kill('SIGTERM'), 45000);
child.on('close', () => { for (const p of pending.values()) p.reject(new Error('ACP exited before response')); pending.clear(); });
let result;
try {
  const init = await send('initialize', { protocolVersion: 1, clientCapabilities: {}, clientInfo: { name: '0x2f-qualification-preflight', version: '1' } });
  const session = await send('session/new', { cwd: workspace, mcpServers: [] });
  result = { init, session, inferenceRequests: 0 };
} catch (error) { result = { error: error.message, inferenceRequests: 0 }; }
finally {
  clearTimeout(timer);
  child.stdin.end();
  const killTimer = setTimeout(() => child.kill('SIGTERM'), 1500);
  await new Promise(resolve => child.once('close', resolve));
  clearTimeout(killTimer);
}
await fs.writeFile(path.join(evidence, 'opencode-acp-preflight.json'), JSON.stringify({ time: new Date().toISOString(), workspace, command: ['opencode', 'acp'], ...result, transcript, stderr }, null, 2) + '\n');
console.log(JSON.stringify(result));
