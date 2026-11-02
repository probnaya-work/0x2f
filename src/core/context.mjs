// Deterministic context projection. Binding user text is never silently cut.
// When it alone exceeds the configured budget, execution is refused intact.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { WorkError } from './errors.mjs';
export const CONTEXT_VERSION = 1;
export const DEFAULT_CONTEXT_CHARS = 128000;
export const digest = text => createHash('sha256').update(text).digest('hex');
export async function contextBudget(base) {
  let config;
  try { config=JSON.parse(await fs.readFile(path.join(base,'.work/context.json'),'utf8')); }
  catch(e) { if(e.code==='ENOENT') return DEFAULT_CONTEXT_CHARS; throw new WorkError(`Invalid context config: ${e.message}`); }
  if (!config || Object.keys(config).some(k=>k!=='maxChars') || !Number.isSafeInteger(config.maxChars) || config.maxChars<16000 || config.maxChars>1000000)
    throw new WorkError('Context config requires maxChars between 16000 and 1000000 (characters, not model tokens).');
  return config.maxChars;
}
export async function projectContext(base) {
  const files = {};
  for(const name of ['project.md','rules.md','knowledge.md','decisions.md']) {
    try { files[name]=await fs.readFile(path.join(base,'.work',name),'utf8'); }
    catch(e) { if(e.code!=='ENOENT') throw e; files[name]=''; }
  }
  return { files, version: digest(JSON.stringify(files)) };
}
export async function compileContinuation({task,base,originalPrompt,store}) {
  let original=originalPrompt;
  if (!original) original=await store.readText(path.join(store.taskDir(task.slug),'prompt.md'),'');
  if (!original) original=task.brief??task.title??'';
  const run=task.runs?.at(-1)?.run??1;
  const maxChars=await contextBudget(base);
  const project=await projectContext(base);
  const notes=task.context?.notes??[];
  const previous=(task.runs??[]).filter(r=>r.run!==run);
  const root=path.join(store.taskDir(task.slug),'runs',String(run));
  const refs=[];
  const critical=[];
  const full=[];
  const events=await store.readEvents(task.slug);
  for(const record of previous) {
    const result=await store.readRunResult(task,record);
    const file=path.join(store.taskDir(task.slug),record.legacy?'result.md':`runs/${record.run}/result.md`);
    const ref={run:record.run,artifact:file,sha256:digest(result),characters:result.length,outcome:record.outcome};
    refs.push(ref);
    const heading=`#### Run ${record.run} — ${record.provider} · ${record.outcome??'unknown'}`;
    const facts=[heading,record.error?`Error: ${record.error}`:'',record.blockedOn?.text?`Unresolved decision: ${record.blockedOn.text}`:'',record.stopReason==='cancelled'?'Cancelled: external side effects may already have occurred; inspect before retrying.':''].filter(Boolean).join('\n');
    const unresolved = [...result.matchAll(/^## (?:Unverified requirements|Remaining work|Limitations|Needs human decision)\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm)].map(m => m[0]).join("\n\n");
    critical.push(facts + (unresolved ? "\n" + unresolved : ""));
    const changed=[...new Set(events.filter(e=>e.type==='file.changed'&&e.run===record.run&&e.path).map(e=>e.path))];
    const paths=changed.length?`\nFiles observed (not exclusive authorship):\n${changed.map(p=>'- '+p).join('\n')}`:'';
    const narrative = result.replace(/^## (?:Unverified requirements|Remaining work|Limitations|Needs human decision)\s*\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm, "").trim();
    full.push({record,result:narrative,ref,text:`${heading}\n\nResult:\n${narrative||'—'}${paths}\nFull artifact: ${file} (sha256 ${ref.sha256})`});
  }
  const sections=[];
  if(notes.length) sections.push('### User input on this task\n\nThese constraints, answers and corrections are binding; formatting is preserved.\n\n'+notes.map(n=>`#### ${n.kind??'User input'} · ${n.at??'time unknown'}\n\n${n.text}`).join('\n\n'));
  if(Object.values(project.files).some(Boolean)) sections.push(`### Current project context · ${project.version}\n\nThis revision supersedes historical project context in the original prompt. Explicit user intent and task constraints remain binding.\n\n`+Object.entries(project.files).map(([name,text])=>`#### ${name}\n\n${text}`).join('\n\n'));
  if(critical.length) sections.push('### Previous run outcomes and unresolved requirements\n\n'+critical.join('\n\n'));
  const index=JSON.stringify({version:1,artifacts:refs},null,2)+'\n';
  const indexPath=path.join(root,'context-artifacts.json');
  const link=previous.length?`\n\nFull previous results and hashes: ${indexPath} (sha256 ${digest(index)}). Excerpts below are a projection; inspect full artifacts for omitted evidence or requirements.`:'';
  const prefix=original+'\n\n---\n\n## Task state for this run\n\n'+sections.join('\n\n')+link;
  const budget=maxChars-prefix.length-200;
  if(budget<0) throw new WorkError(`Binding task intent, user input, current rules and unresolved outcomes exceed the ${maxChars}-character context budget. No execution started. All original text is preserved; raise .work/context.json maxChars explicitly or resolve the task context.`,409);
  let remaining=budget;
  const included=[];
  const projections=[];
  // Most recent outcomes get space first. Only prior-result prose is shortened.
  for(const item of [...full].reverse()) {
    if(item.text.length+2<=remaining) {
      included.unshift(item.text); remaining-=item.text.length+2;
      projections.unshift({...item.ref,delivery:'full'});
    } else {
      const allowance=Math.min(remaining,4000);
      if(allowance>500) {
        const header=`#### Run ${item.record.run} — excerpt only\n`;
        const marker='\n[Middle omitted; read the full hashed artifact]\n';
        const available=allowance-header.length-marker.length;
        const text=header+item.result.slice(0,Math.floor(available/2))+marker+item.result.slice(-Math.ceil(available/2));
        included.unshift(text);remaining-=text.length+2;
        projections.unshift({...item.ref,delivery:'excerpt',includedCharacters:available});
      } else projections.unshift({...item.ref,delivery:'reference-only'});
    }
  }
  const history=included.length?'\n\n### Previous runs\n\n'+included.join('\n\n'):'';
  const prompt=prefix+history;
  if(prompt.length>maxChars) throw new WorkError('Context framing exceeds its budget; no run was started.',409);
  const receipt={version:CONTEXT_VERSION,maxChars,characters:prompt.length,sha256:digest(prompt),projectVersion:project.version,
    userInputs:notes.length,userInputDelivery:'full; next-run only',originalDelivery:'full',artifacts:projections};
  await store.writeJson(path.join(root,'context.json'),receipt);
  await store.writeJson(path.join(root,'project-context.json'),project);
  await store.writeText(indexPath,index);
  return prompt;
}
