import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createStore } from '../src/core/store.mjs';
import { initProject } from '../src/project.mjs';
import { createHandoff, verifyHandoff, handoffHash, engineeringIntent } from '../src/core/engineering-handoff.mjs';

async function setup(t) {
  const base = await fs.mkdtemp('/private/tmp/0x2f-handoff-');
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  await initProject(base);
  const store = createStore(base);
  const task = await store.createTask({ title: 'Bounded task', brief: 'Fix the parser', prompt: 'Keep its public API.' }, { engineering: { configDigest: 'policy', config: { files: ['id.mjs'], writePaths: ['id.mjs'], check: [process.execPath, '--test'] } }, runs: [{ run: 1, outcome: 'ready' }, { run: 2, outcome: 'working' }] });
  await store.writeText(path.join(store.taskDir(task.slug), 'runs/1/result.md'), 'IRRELEVANT_TRANSCRIPT'.repeat(4000));
  await store.appendEvent(task.slug, { type: 'task.answered', at: '2026-10-16T00:00:00Z', answer: 'Keep API stable.' });
  const bytes = 'export const id = 14;';
  const manifest = { files: { 'id.mjs': { sha256: handoffHash(bytes), bytes: bytes.length } }, digest: 'content' };
  await store.writeText(path.join(store.taskDir(task.slug), 'runs/1/artifacts/files/id.mjs'), bytes);
  await store.writeJson(path.join(store.taskDir(task.slug), 'runs/1/artifacts/manifest.json'), manifest);
  return { store, task, ref: { path: 'runs/1/artifacts/manifest.json', digest: handoffHash(manifest), contentDigest: 'content' } };
}

test('four engineering purposes retain human decisions and exact refs without history', async t => {
  const { store, task, ref } = await setup(t);
  for (const purpose of ['investigate', 'implement', 'verify', 'review']) {
    const h = await createHandoff(store, task, { run: 2, purpose, source: ref, artifact: ref });
    assert.doesNotMatch(JSON.stringify(h.content), /IRRELEVANT_TRANSCRIPT/);
    assert.equal(h.content.decisions[0].answer, 'Keep API stable.');
    assert.equal(h.metrics.smallerThanHistory, true);
    assert.equal(h.metrics.bytes, Buffer.byteLength(JSON.stringify(h.content)));
    assert.equal((await verifyHandoff(store, task, h, { run: 2 })).purpose, purpose);
    if (purpose === 'review') { assert.equal(h.content.freshContext, true); assert.ok(h.content.refs.artifact.digest); assert.equal(h.content.failedCheck, undefined); }
  }
});

test('changed task constraints or a different run cannot reuse the same handoff', async t => {
  const { store, task, ref } = await setup(t);
  const h = await createHandoff(store, task, { run: 2, purpose: 'implement', source: ref });
  const updated = { ...task, context: { notes: [{ text: 'New constraint' }] } };
  assert.notEqual(engineeringIntent(task), engineeringIntent(updated));
  await assert.rejects(verifyHandoff(store, updated, h), /Stale engineering handoff/);
  await assert.rejects(verifyHandoff(store, task, h, { run: 3 }), /Stale engineering handoff/);
});

test('digest-bound snapshot rejects changed archived source and original brief bytes', async t => {
  const { store, task, ref } = await setup(t);
  const h = await createHandoff(store, task, { run: 2, purpose: 'review', source: ref, artifact: ref });
  await store.writeText(path.join(store.taskDir(task.slug), 'runs/1/artifacts/files/id.mjs'), 'tampered');
  await assert.rejects(verifyHandoff(store, task, h), /snapshot changed/);
  await store.writeText(path.join(store.taskDir(task.slug), 'prompt.md'), 'new original');
  await assert.rejects(verifyHandoff(store, task, h), /evidence changed/);
});
