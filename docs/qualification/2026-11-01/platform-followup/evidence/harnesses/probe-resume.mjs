// Additional real-binary/local-mock checks for saved-session continuation.
// Run under loopback-only.sb. No tools are requested and no real key is used.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../../../../..');
const root = await fs.mkdtemp(path.join(os.tmpdir(), '0x2f-resume-mock-'));
const out = path.join(here, `resume-${new Date().toISOString().replaceAll(':', '-')}`);
await fs.mkdir(out, { recursive: true });
const home = path.join(root, 'home');
await fs.mkdir(home);
for (const key of Object.keys(process.env)) delete process.env[key];
Object.assign(process.env, {
  PATH: '/opt/homebrew/bin:/usr/bin:/bin', HOME: home, TMPDIR: root,
  XDG_CONFIG_HOME: path.join(home, 'config'), XDG_CACHE_HOME: path.join(home, 'cache'),
  XDG_DATA_HOME: path.join(home, 'data'), CODEX_BIN: '/Users/bogart/.n/bin/codex',
  GEMINI_BIN: '/Users/bogart/.n/bin/gemini', GEMINI_TELEMETRY_ENABLED: 'false',
  CODEX_SANDBOX: 'workspace-write', CI: '1', NO_COLOR: '1'
});
const { codexProvider } = await import(pathToFileURL(path.join(repo, 'src/providers/codex.mjs')));
const { geminiProvider } = await import(pathToFileURL(path.join(repo, 'src/providers/gemini.mjs')));
const { startCodexResponsesMock, messageStream } = await import(pathToFileURL(path.join(repo, 'test/fixtures/codex-responses-mock.mjs')));
const { startGeminiApiMock } = await import(pathToFileURL(path.join(repo, 'test/fixtures/gemini-api-mock.mjs')));
const result = [];
const firstText = '## Result\nqualification-first-marker\n## Needs human decision\nREQUIRED: no';
const secondText = '## Result\nqualification-resumed-marker\n## Needs human decision\nREQUIRED: no';
for (const name of ['codex', 'gemini']) {
  const cwd = path.join(root, name);
  const configHome = path.join(root, `${name}-home`);
  await fs.mkdir(cwd);
  await fs.mkdir(configHome);
  const mock = name === 'codex'
    ? await startCodexResponsesMock([{ events: messageStream(firstText) }, { events: messageStream(secondText) }])
    : await startGeminiApiMock({ steps: [{ text: firstText }, { text: secondText }] });
  const events = [];
  let first;
  let second;
  try {
    let provider;
    if (name === 'codex') {
      process.env.CODEX_HOME = configHome;
      await fs.writeFile(path.join(configHome, 'config.toml'),
        `model = "gpt-5.1-codex"\nmodel_provider = "mock"\n[model_providers.mock]\nname = "Local mock"\nbase_url = "${mock.url}/v1"\nwire_api = "responses"\n`);
      provider = codexProvider;
    } else {
      delete process.env.CODEX_HOME;
      process.env.GEMINI_CLI_HOME = configHome;
      process.env.GEMINI_API_KEY = 'test-key';
      process.env.GOOGLE_GEMINI_BASE_URL = mock.url;
      await fs.mkdir(path.join(configHome, '.gemini'));
      await fs.writeFile(path.join(configHome, '.gemini', 'settings.json'),
        JSON.stringify({ security: { auth: { selectedType: 'gateway', useExternal: true } } }));
      provider = geminiProvider;
    }
    first = await provider.start({ cwd, prompt: 'Return qualification-first-marker. No tools.', onEvent: e => events.push(e) });
    assert.equal(first.status, 'ready');
    assert.ok(first.externalSessionId);
    second = await provider.resume({ cwd, externalSessionId: first.externalSessionId,
      grant: 'continue', onEvent: e => events.push(e) });
    assert.equal(second.status, 'ready');
    assert.equal(second.externalSessionId, first.externalSessionId);
    assert.match(second.result, /qualification-resumed-marker/);
    const requests = name === 'codex' ? mock.requests : mock.requestLog;
    const carried = requests.slice(1).some(r => JSON.stringify(r.body).includes('qualification-first-marker'));
    assert.ok(carried, 'Resumed model request carries prior assistant marker');
    result.push({ name, first, second, priorAssistantContextCarried: carried, events, passed: true });
  } catch (error) {
    result.push({ name, passed: false, first, second, error: error.stack, events });
    process.exitCode = 1;
  } finally {
    await fs.writeFile(path.join(out, `${name}-requests.json`),
      JSON.stringify(name === 'codex' ? mock.requests : mock.requestLog, null, 2) + '\n');
    await mock.close();
    await fs.cp(configHome, path.join(out, `${name}-home`), { recursive: true });
  }
}
await fs.writeFile(path.join(out, 'result.json'), JSON.stringify(result, null, 2) + '\n');
console.log(`Evidence: ${out}`);
console.log(JSON.stringify(result.map(r => ({ name: r.name, passed: r.passed, error: r.error })), null, 2));
await fs.rm(root, { recursive: true, force: true });
