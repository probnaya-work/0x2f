import { durableWrite, readBounded } from '../core/durable.mjs';
import { archiveArtifacts } from '../core/workflow-artifacts.mjs';
import { schema, validateReceipt, parseWorkflowJson } from '../core/workflow-schema.mjs';
import { validatePublicRecord, validateSourceCheckpoint } from './editorial-schema.mjs';
import { rejectCredentials, verifyExecutable } from '../core/workflow-adapters.mjs';
import { crashPoint } from '../core/faults.mjs';
import { randomUUID } from 'node:crypto';
import { readSourceFile } from '../core/workflow-sources.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { digest, localParts } from '../core/workflows.mjs';
import { gitRead, runArgv } from './adapters.mjs';

const STATUSES = ['experiment', 'implemented_locally', 'published', 'available_to_users'];
function relativeFile(value) {
  if (typeof value !== 'string' || path.isAbsolute(value) || value.split(/[\\/]/).some(p => p === '..') || !value || value.startsWith('-')) throw new Error('Source paths must be explicit relative files.');
  if (/(^|\/)(\.env[^/]*|\.git|node_modules|_drafts|credentials)(\/|$)/.test(value)) throw new Error('Private source path is not allowed.');
  return value;
}
async function allowedFile(root, file) {
  relativeFile(file);
  const [realRoot, realFile] = await Promise.all([fs.realpath(root), fs.realpath(path.join(root, file))]);
  if (!realFile.startsWith(realRoot + path.sep)) throw new Error('Source symlink escapes configured repository.');
  const stat = await fs.stat(realFile);
  if (!stat.isFile() || stat.size > 256_000) throw new Error('Source must be a file <=256KB.');
  return realFile;
}

async function collect(def, prior, signal) {
  const topics = [], context = [], warnings = [];
  const since = new Date(Date.now() - (def.lookbackDays ?? 14) * 86_400_000).toISOString();
  const historical = (def.publicationHistory?.publications ?? []).filter(p => p.status === 'published').flatMap(p => p.topicKeys ?? []);
  const seen = new Set([...prior.flatMap(p => p.topics ?? []).map(t => t.key), ...historical]);
  if (!Array.isArray(def.sources) || def.sources.length > 20) throw new Error('Configure at most 20 explicit sources.');
  for (const source of def.sources) {
    signal.throwIfAborted();
    if (!STATUSES.includes(source.status)) throw new Error(`Set project status for ${source.id}.`);
    if (['published', 'available_to_users'].includes(source.status) && !source.publicEvidence?.url) throw new Error(`Public status requires evidence for ${source.id}.`);
    const root = await fs.realpath(source.repo);
    const rootStat = await fs.stat(root);
    if(root !== source.sourcePin?.realPath || rootStat.dev !== source.sourcePin.dev || rootStat.ino !== source.sourcePin.ino) throw new Error('Source root changed after approval. Explicitly refresh settings.');
    if (!Array.isArray(source.files) || source.files.length > 30 || !source.files.length) throw new Error('Configure explicit source files, not directory scans.');
    let record;
    if (['engineering-record','observation'].includes(source.type)) {
      record = validatePublicRecord(parseWorkflowJson(rejectCredentials((await readSourceFile(source.sourcePin, source.record, { signal })).toString('utf8'), def), 'Public source record'), source.type);
      if (source.type === 'observation' && record.status !== 'published') { warnings.push(`${source.id}: unpublished Observation excluded.`); continue; }
      if (source.type === 'engineering-record' && (record.status !== 'completed' || record.verification !== 'passed' || record.independentReview !== 'passed' || record.userDecision !== 'accepted' || record.publicEligible !== true || !record.publicEvidence?.url)) { warnings.push(`${source.id}: unfinished, private or unapproved engineering record excluded.`); continue; }
    }
    for (const file of source.files) {
      const resolved = await allowedFile(root, file);
      const text = rejectCredentials((await readSourceFile(source.sourcePin, file, { signal })).toString('utf8'), def);
      if (context.reduce((sum, item) => sum + Buffer.byteLength(item.text), 0) + Buffer.byteLength(text) > 2_000_000) throw new Error('Combined source material exceeds 2MB. Narrow configured files.');
      context.push({ source: source.id, file, sha256: digest(text), text });
    }
    if (source.type === 'engineering-record') {
      if (record.status !== 'completed' || record.verification !== 'passed' || record.independentReview !== 'passed' || record.userDecision !== 'accepted' || record.publicEligible !== true || !record.publicEvidence?.url) {
        warnings.push(`${source.id}: unfinished, private or unapproved engineering record excluded.`); continue;
      }
      if (!STATUSES.includes(record.projectStatus)) throw new Error('Engineering record has an invalid project status.');
      const key = `${source.id}:${record.id}`;
      if (!seen.has(key)) topics.push({ key, title: record.title, description: record.summary,
        detail: record.checks, sourceId: source.id, status: record.projectStatus,
        link: record.publicEvidence.url, evidence: [{ file: source.record, sha256: digest(JSON.stringify(record)) }],
        visual: { kind: 'diagram', nodes: ['CHANGE', 'CHECKS', 'USER REVIEW'], caption: 'VERIFIED ENGINEERING RECORD' } });
      continue;
    }
    if (source.type === 'observation') {
      // Only already-public records; the contributor's text is not transformed.
      if (record.published_at && record.published_at < since.slice(0, 10)) continue;
      if (record.status !== 'published') { warnings.push(`${source.id}: unpublished Observation excluded.`); continue; }
      const key = `${source.id}:${digest(JSON.stringify(record))}`;
      if (!seen.has(key)) topics.push({ key, title: record.title ?? `Observation by ${record.author}`, description: 'An Observation sent to PROBNAYA.', detail: 'Published as received from its author. The original text is included unchanged in the source snapshot.', sourceId: source.id, status: 'published', link: source.publicEvidence.url, evidence: [{ file: source.record, sha256: digest(JSON.stringify(record)) }], visual: { kind: 'unavailable', reason: 'Use the shared Observations social image; no per-author synthetic image.' } });
      continue;
    }
    const history = await gitRead(root, ['log', '--no-show-signature', `--since=${since}`, '-30', '--format=%H%x1f%cs%x1f%s', '--', ...source.files.map(relativeFile)], signal, def);
    for (const line of history.trim().split('\n').filter(Boolean)) {
      const [commit, date, subject] = line.split('\x1f');
      const rule = (source.topics ?? []).find(r => new RegExp(r.match, 'i').test(subject));
      if (!rule && (source.onlyConfiguredTopics || !/^(feat|fix|runs|providers)(\(|:)/.test(subject))) continue;
      const key = `${source.id}:${rule?.id ?? subject.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      if (seen.has(key) || topics.some(t => t.key === key)) continue;
      const diff = await gitRead(root, ['show', '--format=', '--no-ext-diff', '--no-textconv', '--unified=2', commit, '--', ...source.files], signal, def);
      if (!diff.trim()) continue;
      const title = rule?.title ?? subject.replace(/^[^:]+:\s*/, '');
      topics.push({ key, title, description: rule?.description ?? `A local change to ${source.name ?? source.id}.`,
        detail: rule?.detail ?? `The local commit records this change: “${subject}”. Public release has not been verified.`,
        sourceId: source.id, status: source.status, link: `${source.repositoryUrl}/commit/${commit}`,
        evidence: [{ commit, date, subject, files: source.files, diff: diff.slice(0, 16_000) }],
        visual: rule?.visual ?? { kind: 'diagram', nodes: ['SOURCE', 'LOCAL CHANGE', 'REVIEW'], caption: 'LOCAL CHANGE / PUBLIC RELEASE UNVERIFIED' } });
      // Two recent topics per repository prevents a busy instrument drowning others.
      if (topics.filter(t => t.sourceId === source.id).length >= 2) break;
    }
  }
  return { schemaVersion: 1, topics: topics.slice(0, 3), context, warnings, collectedAt: new Date().toISOString() };
}

function renderTemplate(template, topic, date) {
  const values = { date: date.replaceAll('-', '.'), title: topic.title.toUpperCase(), description: topic.description, detail: topic.detail, link: topic.link };
  return template.replace(/\{\{(date|title|description|detail|link)\}\}/g, (_, key) => values[key]).trim() + '\n';
}

async function prepareVisual({ topic, def, dir, signal, store, date }) {
  const final = path.join(dir, 'visual.png');
  const receipt = path.join(dir, 'visual-receipt.json');
  const visualKey = digest(JSON.stringify({ visual: topic.visual, title: topic.title, date, settings: def.visual }));
  await verifyExecutable(def.adapterPins?.python);
  if (await store.exists(receipt)) {
    const record = validateReceipt(await store.readJson(receipt));
    if (record.key === visualKey && await store.exists(final) && record.sha256 === digest(await fs.readFile(final))) return { complete: true, file: final, ...record };
  }
  let visual = topic.visual;
  if (visual.kind === 'generated') {
    const generator = def.adapters?.image;
    if (!generator?.argv || def.permissions.imageGeneration !== true) return { complete: false, reason: 'Image adapter / image-generation permission is absent.' };
    if (def.maxCostUsd !== undefined) return { complete: false, reason: 'This command adapter cannot enforce a monetary budget. Use a provider-side hard limit before enabling generation.' };
    const attempt = path.join(dir, 'image-attempt.json');
    const asset = path.join(dir, 'generated.png');
    if (await store.exists(attempt)) {
      const previous = validateReceipt(await store.readJson(attempt), true);
      if (previous.state !== 'complete' || previous.key !== visualKey || !(await store.exists(asset)) || previous.sha256 !== digest(await readBounded(asset, 64_000_000))) return { complete: false, reason: 'An image call was already attempted. Its outcome is uncertain or failed; no automatic retry or duplicate charge.' };
    } else {
      const credentialNames = generator.credentialEnv ?? [];
      if (credentialNames.some(name => !process.env[name])) return { complete: false, reason: `Missing credentials: ${credentialNames.filter(name => !process.env[name]).join(', ')}` };
      if (def.maxAdapterCalls !== 1) throw new Error('Image adapters require maxAdapterCalls:1.');
      await verifyExecutable(def.adapterPins?.image);
      const operationId = randomUUID();
      await store.writeJson(attempt, { schemaVersion: 1, operationId, state: 'pending', key: visualKey, at: new Date().toISOString() });
      crashPoint('external.intent-durable');
      try {
        const argv = generator.argv.map(arg => arg.replaceAll('{output}', asset).replaceAll('{prompt}', visual.prompt));
        await runArgv(argv, { cwd: dir, signal, timeoutMs: def.maxDurationMs, definition: def, pin: def.adapterPins?.image });
        const assetBytes = rejectCredentials(await readBounded(asset, 64_000_000), def);
        await durableWrite(asset, assetBytes);
        crashPoint('external.output-durable');
        await store.writeJson(attempt, { schemaVersion: 1, operationId, state: 'complete', sha256: digest(assetBytes), key: visualKey, at: new Date().toISOString() });
      } catch (error) {
        await store.writeJson(attempt, { schemaVersion: 1, operationId, state: 'failed', key: visualKey, error: error.message });
        throw error;
      }
    }
    visual = { kind: 'image', file: asset, synthetic: true };
  }
  if (visual.kind === 'image' && !visual.synthetic) {
    // Images can only come from an explicitly configured repository/file pair.
    relativeFile(visual.file);
    const root = await fs.realpath(visual.repo);
    const source = def.sources.find(s => s.sourcePin?.realPath === root && def.permissions.readSources.includes(s.id));
    if (!source) throw new Error('Image source root needs an explicit readSources permission.');
    const local = path.join(dir,'source-image.png');
    await durableWrite(local, await readSourceFile(source.sourcePin, visual.file, { signal, maxBytes:64_000_000 }));
    visual = { ...visual, file: local };
  }
  if (!['diagram', 'image'].includes(visual.kind)) return { complete: false, reason: visual.reason ?? 'No factual visual source configured.' };
  const spec = { ...def.visual, title: topic.title, date, status: topic.status, visual, output: final };
  await store.writeJson(path.join(dir, 'visual-spec.json'), spec);
  await runArgv([def.adapters?.python ?? 'python3', new URL('./visual.py', import.meta.url).pathname, path.join(dir, 'visual-spec.json')], { cwd: dir, signal, definition: def, pin: def.adapterPins?.python });
  const png = rejectCredentials(await readBounded(final, 64_000_000), def);
  await durableWrite(final, png);
  const width = def.visual.width ?? 1200, height = def.visual.height ?? 630;
  if (png.length < 24 || !png.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || png.readUInt32BE(16) !== width || png.readUInt32BE(20) !== height) throw new Error(`Visual adapter produced an invalid ${width}x${height} PNG.`);
  const record = { schemaVersion: 1, key: visualKey, sha256: digest(png), kind: visual.kind, synthetic: Boolean(visual.synthetic), width, height };
  await store.writeJson(receipt, record);
  return { complete: true, file: final, ...record };
}

export async function runEditorial({ task, store, signal, onEvent }) {
  const def = task.workflow.definition;
  if (def.permissions.externalChanges !== false) throw new Error('External changes are disabled for editorial.');
  const dir = path.join(store.taskDir(task.slug), 'artifacts', 'editorial');
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const sourceFile = path.join(dir, 'sources.json');
  let source;
  if (await store.exists(sourceFile)) source = validateSourceCheckpoint(await store.readJson(sourceFile));
  else {
    await onEvent({ type: 'progress', text: 'Reading explicitly configured repositories and material files.' });
    const prior = [];
    for (const other of await store.listTasks()) {
      if (other.id === task.id || other.workflow?.id !== task.workflow.id) continue;
      const p = path.join(store.taskDir(other.slug), 'artifacts', 'editorial', 'sources.json');
      if (await store.exists(p)) prior.push(validateSourceCheckpoint(await store.readJson(p)));
    }
    source = await collect(def, prior, signal);
    await store.writeJson(sourceFile, source);
  }
  signal.throwIfAborted();
  const date = localParts(new Date(task.createdAt)).date;
  const topics = source.topics.map((t, i) => {
    const rule = def.sources.find(s => s.id === t.sourceId)?.topics?.find(r => `${t.sourceId}:${r.id}` === t.key);
    return { ...t, ...(rule?.visual ? { visual: rule.visual } : {}), number: i + 1,
      post: task.workflow.corrections?.[i + 1] ?? renderTemplate(def.materials['template.md'], t, date) };
  });
  if (!topics.length) {
    const result = 'No material: no new substantive changes in the configured sources and lookback window. Previously proposed topics were excluded.\n' + source.warnings.map(w => `Warning: ${w}\n`).join('');
    await store.writeText(path.join(dir, 'review.md'), result);
    return { status: 'ready', result };
  }
  const selected = task.workflow.selected ?? (def.previewFirstTopic ? 1 : undefined);
  const selectionOrigin = task.workflow.selected ? "user" : selected ? "proposed preview" : "pending";
  if (selected && !topics[selected - 1]) throw new Error('Selected topic does not exist in this package.');
  let visual = { complete: false, reason: 'Select one topic before preparing the final visual and personal repost.' };
  if (selected) {
    await onEvent({ type: 'progress', text: `Preparing local visual for topic ${selected}.` });
    visual = await prepareVisual({ topic: topics[selected - 1], def, dir, signal, store, date });
    await store.writeText(path.join(dir, 'personal-repost.txt'), `A recent piece of work at PROBNAYA: ${topics[selected - 1].title.toLowerCase()}.\n${topics[selected - 1].description}\n${topics[selected - 1].link}\n`);
  }
  const corrections = (await store.listTasks()).filter(t => t.workflow?.id === task.workflow.id).flatMap(t => t.workflow.decisions ?? []);
  const packageRecord = { schemaVersion: 1, workflow: task.workflow.id, version: task.workflow.version, definitionDigest: def.digest, date, topics, selected: selected ?? null, selectionOrigin, visual,
    complete: Boolean(selected && visual.complete), templateProvenance: def.templateProvenance,
    publication: task.workflow.publication ?? null, publicationHistory: def.publicationHistory ?? { publications: [] }, previousDecisions: corrections, warnings: source.warnings,
    checks: { sourcesSaved: true, duplicateTopicsExcluded: true, publicStatusRequiresEvidence: true, observationContentsUnedited: true, externalChanges: false, monetaryCost: 'No paid adapter used for local diagrams; paid command adapters cannot enforce monetary budgets.' } };
  const { file: visualPath, ...visualContent } = visual;
  const packageDigest = digest(JSON.stringify({ topics, selected, visual: visualContent }));
  await store.writeJson(path.join(dir, 'package.json'), { ...packageRecord, digest: packageDigest });
  for (const topic of topics) await store.writeText(path.join(dir, `topic-${topic.number}.txt`), topic.post);
  const run = task.runs.at(-1).run;
  const archiveDir = path.join(store.taskDir(task.slug), 'runs', String(run), 'artifacts', 'editorial');
  const question = `Review the package. Answer: select N, changes N <full replacement post>, accept, defer or reject. After selecting/changing, rerun this task. Record publication separately with published <https URL>.`;
  const result = `# PROBNAYA editorial / ${date}\n\nTemplate: ${def.templateProvenance}\n\n${topics.map(t => `## ${t.number}. ${t.title}\n\nProject status: ${t.status}\n\n${t.post}\nSource: ${t.link}\n`).join('\n')}\nSelected topic: ${selected ?? 'pending'} (${selectionOrigin})\n\nVisual: ${visual.complete ? path.join(archiveDir, 'visual.png') : visual.reason}\n\nPackage complete: ${packageRecord.complete}\n\nArtifacts: ${archiveDir}\n\nPublication remains a separate manual action.\n\n## Needs human decision\nREQUIRED: yes\nQUESTION: ${question}\n`;
  await store.writeText(path.join(dir, 'review.md'), result);
  await store.writeJson(path.join(dir, 'package.json'), { ...packageRecord, digest: packageDigest, visual: { ...visual, ...(visual.complete ? { file: path.join(archiveDir, 'visual.png') } : {}) } });
  const artifacts = await archiveArtifacts(store, task, dir, run);
  crashPoint('result.artifacts-durable');
  return { workflowPatch: { topicKeys: topics.map(t => t.key), packageDigest, packageComplete: packageRecord.complete, ...artifacts }, status: 'needs_you', reason: 'decision', blockedOn: { type: 'decision', text: `${question}\n\n${result.split('## Needs human decision')[0]}` }, result };
}
