import { validateAdapterPolicy } from '../core/workflow-supervision.mjs';
import path from 'node:path';
import { sourceRootIdentity, validateSourcePath } from '../core/workflow-sources.mjs';
import { createHash } from 'node:crypto';
import { pinAdapters } from '../core/workflow-adapters.mjs';
import { schema, parseWorkflowJson } from '../core/workflow-schema.mjs';
import { WorkError } from '../core/errors.mjs';
import { fields, https } from '../core/workflow-schema.mjs';
export function validateEditorialDefinition(d) {
  fields(d, ['id','kind','version','name','templateProvenance','maxDurationMs','maxCostUsd','maxAdapterCalls','lookbackDays','permissions','adapters','visual','sources','previewFirstTopic'], 'workflow definition');
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(d.id) || typeof d.version !== 'string' || !d.version || !['editorial','engineering'].includes(d.kind)) throw new WorkError('Workflow needs an id, version and supported kind.');
  if (!Number.isInteger(d.maxDurationMs) || d.maxDurationMs < 100 || d.maxDurationMs > 3600000) throw new WorkError('Workflow maxDurationMs must be 100..3600000.');
  if (d.maxAdapterCalls !== 1 || (d.maxCostUsd !== undefined && (typeof d.maxCostUsd !== 'number' || d.maxCostUsd < 0))) throw new WorkError('Invalid workflow adapter/cost limit.');
  if (d.lookbackDays !== undefined && (!Number.isInteger(d.lookbackDays) || d.lookbackDays < 1 || d.lookbackDays > 3660)) throw new WorkError('Invalid lookbackDays.');
  fields(d.permissions, ['localArtifacts','externalChanges','imageGeneration','readSources','commandAdapters','network','unattendedAdapters'], 'permissions');
  if (d.permissions.externalChanges !== false || d.permissions.localArtifacts !== true || !Array.isArray(d.permissions.readSources)) throw new WorkError('Workflow requires localArtifacts:true, externalChanges:false and readSources.');
  if (d.permissions.network !== undefined && d.permissions.network !== false) throw new WorkError('Network adapters are not supported.');
  for (const key of ['commandAdapters','imageGeneration','unattendedAdapters']) if(d.permissions[key]!==undefined&&typeof d.permissions[key]!=='boolean')throw new WorkError(`Invalid permission ${key}.`);
  if(d.previewFirstTopic!==undefined&&typeof d.previewFirstTopic!=='boolean')throw new WorkError('previewFirstTopic must be boolean.');
  fields(d.adapters, ['python','image','supervision'], 'adapters');
  if(d.adapters.supervision)validateAdapterPolicy(d.adapters.supervision);
  if (typeof d.adapters.python !== 'string' || !d.adapters.python.trim()) throw new WorkError('Specify a Python/visual command adapter executable.');
  if (d.adapters.image) {
    fields(d.adapters.image, ['argv','credentialEnv'], 'image adapter');
    if (!Array.isArray(d.adapters.image.argv) || !d.adapters.image.argv.length || d.adapters.image.argv.some(a => typeof a !== 'string' || a.length > 8000)) throw new WorkError('Invalid image adapter argv.');
    if ((d.adapters.image.credentialEnv ?? []).some(a => !/^[A-Z][A-Z0-9_]{0,100}$/.test(a))) throw new WorkError('Invalid credentialEnv names.');
  }
  fields(d.visual, ['titleFont','monoFont','provenance','layout','width','height','surface','referenceHashes'], 'visual settings');
  if (typeof d.visual.titleFont !== 'string' || typeof d.visual.monoFont !== 'string') throw new WorkError('Specify visual fonts.');
  for (const n of ['width','height']) if (d.visual[n] !== undefined && (!Number.isInteger(d.visual[n]) || d.visual[n] < 1 || d.visual[n] > 8192)) throw new WorkError(`Invalid visual ${n}.`);
  if (!Array.isArray(d.sources) || !d.sources.length || d.sources.length > 20) throw new WorkError('Configure 1..20 explicit sources.');
  const ids = new Set();
  for (const source of d.sources) {
    fields(source, ['id','name','type','repo','status','repositoryUrl','publicEvidence','files','record','onlyConfiguredTopics','topics'], 'source');
    if (typeof source.id !== 'string' || !source.id || ids.has(source.id)) throw new WorkError('Source ids must be unique.'); ids.add(source.id);
    if (!d.permissions.readSources.includes(source.id)) throw new WorkError('Every source requires explicit readSources permission.');
    if (!states.includes(source.status) || (source.type && !['observation','engineering-record','git'].includes(source.type))) throw new WorkError('Invalid source status/type.');
    if (typeof source.repo !== 'string' || !source.repo || !Array.isArray(source.files) || !source.files.length || source.files.length > 30) throw new WorkError('Invalid source root/files.');
    for (const file of [...source.files, ...(source.record ? [source.record] : [])]) if (typeof file !== 'string' || !file || file.startsWith('/') || file.startsWith('-') || file.split(/[\\/]/).includes('..')) throw new WorkError('Source paths must be explicit relative files.');
    for (const file of source.files) validateSourcePath(file);
    if (['observation','engineering-record'].includes(source.type) && (typeof source.record !== 'string' || !source.files.includes(source.record))) throw new WorkError('Source record must be included in its explicit file allowlist.');
    if (source.repositoryUrl) https(source.repositoryUrl);
    if (source.publicEvidence) { fields(source.publicEvidence, ['url','basis'], 'public evidence'); https(source.publicEvidence.url); }
    if (['published','available_to_users'].includes(source.status) && !source.publicEvidence) throw new WorkError('Public status requires evidence.');
    for (const topic of source.topics ?? []) {
      fields(topic, ['id','match','title','description','detail','visual'], 'topic');
      if (typeof topic.match !== 'string' || topic.match.length > 200) throw new WorkError('Topic match must be a bounded regex.');
      // Patterns come from trusted local config; prohibit catastrophic nested repetition.
      if (/\([^)]*[+*][^)]*\)[+*{]/.test(topic.match)) throw new WorkError('Nested regex repetition is refused.');
      try { new RegExp(topic.match); } catch { throw new WorkError('Invalid topic regex.'); }
      if (topic.visual) {
        fields(topic.visual, ['kind','nodes','caption','layout','heading','subheading','stateLabel','stateDetail','specimen','statement','rows','repo','file','reason','prompt'], 'topic visual');
        if (!['diagram','image','generated','unavailable'].includes(topic.visual.kind)) throw new WorkError('Unknown visual kind.');
        if (topic.visual.kind === 'image') {
          validateSourcePath(topic.visual.file);
          if (typeof topic.visual.repo !== 'string' || !topic.visual.repo) throw new WorkError('Image source requires an explicit repository/file pair.');
        }
      }
    }
  }
  return d;
}

export function validateEditorialDecisionRecord(d) {
  if(!['select','accept','changes','defer','reject','published'].includes(d.action)||typeof d.value!=='string')throw new WorkError('Invalid editorial decision record.');
}

export async function freezeEditorialSnapshot({ store, definition, materials }) {
  const publicationHistory = materials['history.json'] ? parseWorkflowJson(materials['history.json'], 'Publication history') : { publications: [] };
  schema(publicationHistory, 'publication history');
  if (!Array.isArray(publicationHistory.publications)) throw new WorkError('history.json needs a publications array.');
  const snapshot = { permissions: { ...definition.permissions, commandAdapters: definition.permissions.commandAdapters ?? true, network: false }, adapterPins: await pinAdapters(definition), publicationHistory,
    sources: await Promise.all(definition.sources.map(async source => ({ ...source, sourcePin: await sourceRootIdentity(path.resolve(store.base, source.repo)), repo: path.resolve(store.base, source.repo),
      topics: (source.topics ?? []).map(topic => ({ ...topic,
        ...(topic.visual?.repo ? { visual: { ...topic.visual, repo: path.resolve(store.base, topic.visual.repo) } } : {})
      })) }))),
    visual: { ...definition.visual,
      titleFont: path.resolve(store.base, definition.visual.titleFont),
      monoFont: path.resolve(store.base, definition.visual.monoFont) }
  };
  return snapshot;
}

export function validateEditorialSnapshot(d) {
  const { materials, publicationHistory, adapterPins, digest, ...definition } = d;
  validateEditorialDefinition({ ...definition, sources: definition.sources?.map(source => { const { sourcePin, ...rest } = source; return rest; }) });
  if (!materials || typeof materials['template.md'] !== 'string' || typeof materials['rules.md'] !== 'string' || typeof materials['examples.md'] !== 'string') throw new WorkError('Missing workflow material files.');
  if (publicationHistory) schema(publicationHistory, 'publication history');
}

export const states = ['experiment', 'implemented_locally', 'published', 'available_to_users'];
export function validatePublicRecord(r, kind) {
  if (kind === 'observation') {
    fields(r, ['number','status','published_at','title','author','blocks'], 'Observation');
    if (!['published','draft','received'].includes(r.status) || (r.title !== undefined && typeof r.title !== 'string') || typeof r.author !== 'string' || !Array.isArray(r.blocks)) throw new WorkError('Invalid Observation.');
    for (const block of r.blocks) fields(block, ['text','image','caption','alt','video','audio'], 'Observation block');
  } else {
    fields(r, ['id','status','title','summary','checks','verification','independentReview','userDecision','publicEligible','projectStatus','publicEvidence'], 'engineering record');
    for (const key of ['id','title','summary','checks']) if (typeof r[key] !== 'string') throw new WorkError(`Engineering record missing ${key}.`);
    if (!['completed','working','failed'].includes(r.status) || !['passed','failed','pending'].includes(r.verification) || !['passed','failed','pending'].includes(r.independentReview) || !['accepted','rejected','pending'].includes(r.userDecision) || !states.includes(r.projectStatus) || typeof r.publicEligible !== 'boolean') throw new WorkError('Invalid engineering record enum.');
    if (r.publicEvidence) https(r.publicEvidence.url);
  }
  return r;
}

export function validateSourceCheckpoint(s) {
  fields(s,['topics','context','warnings','collectedAt'],'source checkpoint');
  if(!Array.isArray(s.topics)||s.topics.length>3||!Array.isArray(s.context)||!Array.isArray(s.warnings)||typeof s.collectedAt!=='string')throw new WorkError('Invalid source checkpoint.');
  for(const t of s.topics){fields(t,['key','title','description','detail','sourceId','status','link','evidence','visual'],'source topic');if(!states.includes(t.status)||typeof t.key!=='string'||typeof t.title!=='string'||!Array.isArray(t.evidence))throw new WorkError('Invalid source topic.');https(t.link);}
  for(const c of s.context){fields(c,['source','file','sha256','text'],'source material');if(typeof c.text!=='string'||typeof c.file!=='string'||!/^[a-f0-9]{64}$/.test(c.sha256))throw new WorkError('Invalid source material.');if(createHash('sha256').update(c.text).digest('hex')!==c.sha256)throw new WorkError('Source checkpoint hash does not match saved evidence.');}
  return s;
}
