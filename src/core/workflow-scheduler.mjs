import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { durableWrite, backupFile, syncDirectory } from './durable.mjs';
import { executableIdentity } from './workflow-adapters.mjs';
import { schema } from './workflow-schema.mjs';
const exec = promisify(execFile);
const root = new URL('../../', import.meta.url).pathname;
export const installationPath = store => path.join(store.workDir(), 'scheduler', 'installation.json');
export async function runtimeFingerprint() {
  const hash = createHash('sha256');
  async function walk(dir) {
    for (const entry of (await fs.readdir(dir, { withFileTypes: true })).sort((a,b)=>a.name.localeCompare(b.name))) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (/\.(mjs|js|py)$/.test(entry.name)) hash.update(path.relative(root,file)).update(await fs.readFile(file));
    }
  }
  await walk(path.join(root,'src')); hash.update(await fs.readFile(path.join(root,'package.json')));
  return hash.digest('hex');
}
const escape = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export async function stopLaunchAgent(label, run = exec) {
  const target = `gui/${process.getuid()}/${label}`;
  try { await run('/bin/launchctl', ['bootout', target]); }
  catch {
    try { await run('/bin/launchctl', ['print', target]); }
    catch (error) {
      if (error.code === 113 && error.stderr?.includes('Could not find service')) return;
      throw new Error('Could not verify that the LaunchAgent stopped; installation files were retained.');
    }
    throw new Error('LaunchAgent is still loaded after bootout failed; installation files were retained.');
  }
}
export function agentPlist(m) {
  const args = [m.node.realPath, m.cli, 'workflow','tick'];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>\n<key>Label</key><string>${escape(m.label)}</string>\n<key>ProgramArguments</key><array>${args.map(v=>`<string>${escape(v)}</string>`).join('')}</array>\n<key>WorkingDirectory</key><string>${escape(m.base)}</string>\n<key>EnvironmentVariables</key><dict><key>PATH</key><string>${escape(m.path)}</string><key>WORKFLOW_LOCK_PYTHON</key><string>${escape(m.python.realPath)}</string></dict>\n<key>RunAtLoad</key><true/>\n<key>StartCalendarInterval</key><array>${[0,15,30,45].map(n=>`<dict><key>Minute</key><integer>${n}</integer></dict>`).join('')}</array>\n<key>StandardOutPath</key><string>${escape(m.log)}</string><key>StandardErrorPath</key><string>${escape(m.log)}</string>\n</dict></plist>\n`;
}
export async function schedulerDrift(store, manifest) {
  schema(manifest, 'scheduler installation');
  const issues = [];
  if (manifest.base !== path.resolve(store.base) || manifest.cli !== path.join(root,'src','cli.mjs')) issues.push('workspace/runtime path changed');
  if (manifest.runtimeFingerprint !== await runtimeFingerprint()) issues.push('runtime code changed; repair/reinstall after checks');
  for (const [name, pin] of [['Node',manifest.node],['Python',manifest.python]]) {
    try { const actual = await executableIdentity(pin.realPath); if (actual.sha256 !== pin.sha256) issues.push(`${name} executable changed`); }
    catch { issues.push(`${name} executable missing`); }
  }
  if (manifest.node.realPath !== await fs.realpath(process.execPath)) issues.push('current Node differs from installed Node');
  return issues;
}
export async function assertSchedulerCompatible(store) {
  const file = installationPath(store);
  if (!(await store.exists(file))) return;
  const issues = await schedulerDrift(store, await store.readJson(file));
  if (issues.length) throw new Error(`Scheduler is blocked by drift: ${issues.join('; ')}. Run 2f workflow agent repair after verification.`);
}
function validateInstallation(m) {
  schema(m,'scheduler installation');
  if(typeof m.workspaceId!=='string'||!/^[a-f0-9-]{36}$/.test(m.workspaceId)||m.label!==`work.probnaya.0x2f.workflow.${m.workspaceId}`||m.destination!==path.join(os.homedir(),'Library','LaunchAgents',`${m.label}.plist`)||typeof m.base!=='string'||!path.isAbsolute(m.base))throw new Error('Invalid scheduler installation identity/path. Refusing lifecycle mutation.');
  return m;
}
export async function schedulerStatus(store) {
  const file = installationPath(store);
  if (!(await store.exists(file))) { const legacy = path.join(os.homedir(),'Library','LaunchAgents','work.probnaya.0x2f.workflow.plist'); const text = await store.readText(legacy,null); const installed = Boolean(text?.includes(`<string>${escape(path.resolve(store.base))}</string>`)); return { configured: false, installed, legacy: installed, matching: false, drift: ['scheduler installation record absent; explicit install/repair required'] }; }
  const m = validateInstallation(await store.readJson(file));
  const plist = await store.readText(m.destination, null);
  const drift = await schedulerDrift(store,m);
  const matching = plist === agentPlist(m); if (plist && !matching) drift.push('plist differs from saved installation');
  if (!plist) drift.push('installed plist is missing');
  let loaded = false;
  if (process.platform === 'darwin') loaded = await exec('/bin/launchctl',['print',`gui/${process.getuid()}/${m.label}`]).then(()=>true,()=>false);
  if (process.platform === 'darwin' && !loaded) drift.push('LaunchAgent is not loaded');
  return { configured: true, installed: Boolean(plist), loaded, matching: matching && !drift.length, drift, label: m.label, destination: m.destination, base: m.base, lastTick: await store.readJson(path.join(store.workDir(),'scheduler','health.json')).catch(error=>({unavailable:error.message})) };
}
export async function manageScheduler(store, operation) {
  if (operation === 'status') return schedulerStatus(store);
  if (process.platform !== 'darwin') throw new Error('LaunchAgent lifecycle requires macOS; explicit workflow tick is portable.');
  if (!['install','repair','uninstall'].includes(operation)) throw new Error('Use agent install, repair, status or uninstall.');
  const file = installationPath(store), prior = await store.exists(file) ? validateInstallation(await store.readJson(file)) : null;
  if (operation === 'uninstall') {
    if (!prior) return { uninstalled: false };
    await stopLaunchAgent(prior.label);
    await fs.rm(prior.destination,{force:true}); await backupFile(file); await fs.rm(file); await syncDirectory(path.dirname(file)); await syncDirectory(path.dirname(prior.destination));
    return { uninstalled: true, workflowDataRetained: true, label: prior.label };
  }
  const workspaceId = prior?.workspaceId ?? randomUUID();
  const label = `work.probnaya.0x2f.workflow.${workspaceId}`;
  const m = { schemaVersion: 1, workspaceId, label, base: path.resolve(store.base), cli: path.join(root,'src','cli.mjs'), runtimeFingerprint: await runtimeFingerprint(),
    node: await executableIdentity(process.execPath), python: await executableIdentity(process.env.WORKFLOW_LOCK_PYTHON ?? 'python3'), path: process.env.PATH ?? '/usr/bin:/bin',
    destination: path.join(os.homedir(),'Library','LaunchAgents',`${label}.plist`), log: path.join(store.workDir(),'scheduler.log') };
  if (prior) await backupFile(file);
  await store.writeJson(file,m); await durableWrite(m.destination,agentPlist(m));
  await exec('/usr/bin/plutil',['-lint',m.destination]);
  // Adopt the earlier singleton only when it belongs to this workspace.
  const legacy = path.join(os.homedir(),'Library','LaunchAgents','work.probnaya.0x2f.workflow.plist');
  const legacyText = await store.readText(legacy,null);
  if (legacyText?.includes(`<string>${escape(m.base)}</string>`)) {
    await stopLaunchAgent('work.probnaya.0x2f.workflow');
    await backupFile(legacy); await fs.rm(legacy);
  }
  await stopLaunchAgent(label);
  await exec('/bin/launchctl',['bootstrap',`gui/${process.getuid()}`,m.destination]);
  await exec('/bin/launchctl',['kickstart',`gui/${process.getuid()}/${label}`]);
  return schedulerStatus(store);
}

// Existing UI processes must restart after code changes; they cannot bless a
// new on-disk fingerprint while retaining older modules in memory.
export const loadedRuntimeFingerprint = await runtimeFingerprint();
export async function assertRuntimeCompatible() {
  if (loadedRuntimeFingerprint !== await runtimeFingerprint()) throw new Error('Runtime code changed during this process. Restart the CLI/UI before creating a workflow run.');
}
