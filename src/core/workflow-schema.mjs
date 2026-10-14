import { workflowKind } from '../workflows/registry.mjs';
import { createHash } from 'node:crypto';
import { WorkError } from './errors.mjs';
export const SCHEMA_VERSION = 1;
export function parseWorkflowJson(text, label = 'State') {
  try { return JSON.parse(text); }
  catch { throw new WorkError(`${label} contains invalid JSON; restore or explicitly repair the affected file.`); }
}
export function schema(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new WorkError(`${label} must be an object.`);
  if (value.schemaVersion !== undefined && value.schemaVersion !== 1) throw new WorkError(`Unsupported ${label} schema ${value.schemaVersion}; supported: legacy and 1. Use a compatible runtime.`);
  return value;
}
export function fields(value, allowed, label) {
  schema(value, label);
  for (const key of Object.keys(value)) if (!allowed.includes(key) && key !== 'schemaVersion') throw new WorkError(`Unknown ${label} field: ${key}`);
}
export function https(value, label = 'URL') {
  let url; try { url = new URL(value); } catch { throw new WorkError(`${label} requires an https URL.`); }
  if (url.protocol !== 'https:' || url.username || url.password || !url.hostname) throw new WorkError(`${label} requires an https URL without credentials.`);
  return value;
}
export function validateDefinition(d) {
  schema(d,'workflow definition');
  if(!/^[a-z][a-z0-9-]{0,63}$/.test(d.id)||typeof d.version!=='string'||!d.version||typeof d.kind!=='string')throw new WorkError('Workflow needs an id, version and supported kind.');
  return workflowKind(d.kind).validateDefinition(d);
}
export function validateSchedule(s) {
  fields(s, ['id','timezone','time','everyDays','nextDate','paused','lastTaskId','lastSlot','lastCheckedAt','lastError','enabled'], 'schedule');
  if (!/^[a-z][a-z0-9-]{0,63}$/.test(s.id) || s.everyDays !== 2 || typeof s.paused !== 'boolean' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time)) throw new WorkError('Invalid schedule identity, cadence, time or pause state.');
  try { new Intl.DateTimeFormat('en', { timeZone: s.timezone }).format(); } catch { throw new WorkError('Invalid schedule timezone.'); }
  if (typeof s.timezone !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s.nextDate) || !Number.isFinite(Date.parse(`${s.nextDate}T12:00:00Z`)) || new Date(`${s.nextDate}T12:00:00Z`).toISOString().slice(0,10) !== s.nextDate) throw new WorkError('Invalid schedule date.');
  return s;
}

export function validateSnapshot(d) {
  schema(d, 'workflow snapshot');
  workflowKind(d.kind).validateSnapshot(d);
  const digest = d.digest;
  if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)) throw new WorkError('Invalid workflow snapshot digest.');
  const { digest: claimed, ...snapshot } = d;
  if (createHash('sha256').update(JSON.stringify(snapshot)).digest('hex') !== claimed) throw new WorkError('Frozen workflow definition digest does not match its contents.');
  return d;
}
export function validateTaskWorkflow(w) {
  fields(w,['id','version','definition','trigger','triggerKey','decisions','packageDigest','packageComplete','review','acceptedDigest','publication','publications','manifest','manifestDigest','artifactRun','runtimeFingerprint',...(workflowKind(w.definition.kind).taskFields ?? [])],'task workflow');
  schema(w.definition,'frozen definition');
  if(!['manual','schedule'].includes(w.trigger)||typeof w.id!=='string'||typeof w.version!=='string'||typeof w.triggerKey!=='string'||!Array.isArray(w.decisions))throw new WorkError('Invalid task workflow identity/trigger/decisions.');
  if(w.review!==undefined&&!['pending','selected','changes_requested','accepted','published','deferred','rejected'].includes(w.review))throw new WorkError('Unknown workflow review state.');
  for(const d of w.decisions) {
    fields(d,['action','value','at','operationId','answer','run','packageDigest'],'decision');
    workflowKind(w.definition.kind).validateDecisionRecord(d);
  }
  if(w.publication)https(w.publication.url,'Publication');
  return w;
}

export function validateReceipt(r, external=false) {
  fields(r,external?['operationId','state','key','at','error','sha256']:['key','sha256','kind','synthetic','width','height'],'adapter receipt');
  if(!/^[a-f0-9]{64}$/.test(r.key))throw new WorkError('Invalid receipt key.');
  if(external&&!['pending','complete','failed'].includes(r.state))throw new WorkError('Unknown external attempt state.');
  if(!external&&!/^[a-f0-9]{64}$/.test(r.sha256))throw new WorkError('Invalid visual receipt hash.');
  return r;
}
