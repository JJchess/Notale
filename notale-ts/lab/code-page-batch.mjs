// Rebuild one code page under several one-line specs against a frozen deck; the spec is the only variable.
// usage: npx tsx lab/code-page-batch.mjs --out <dir> --cases <json>
// cases json: { source, pid, original, continuity: {from, to}, concurrency, cases: [{key, spec}] }
import {readFile,writeFile,cp,appendFile,symlink,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {AsyncLocalStorage} from 'node:async_hooks';
import {baselineRuntime} from '../src/core/baseline-pipeline.ts';
import {buildRun,seed} from '../src/core/orchestration.ts';
import {acquireVisualChecker} from '../src/tools/visual-check.ts';
const {values:{out,cases:casesFile}}=parseArgs({options:{out:{type:'string'},cases:{type:'string'}}});
if(!out||!casesFile)throw new Error('--out and --cases are required');
const root=path.resolve(out),resources=new URL('../resources',import.meta.url).pathname;
const config=JSON.parse(await readFile(casesFile,'utf8'));
const source=path.resolve(path.dirname(casesFile),config.source),pid=config.pid,concurrency=config.concurrency??4;
await mkdir(root+'/preview',{recursive:true});await mkdir(root+'/targeted',{recursive:true});
const context=new AsyncLocalStorage(),nativeFetch=globalThis.fetch;let journals=Promise.resolve(),requestId=0;
// Store only response usage and attribution; never credentials or request bodies.
globalThis.fetch=async(input,init)=>{
 const url=String(input instanceof Request?input.url:input);if(init?.method!=='POST')return nativeFetch(input,init);
 const attribution=context.getStore()??{};let body={};try{body=JSON.parse(init.body);}catch{}
 const row={request:++requestId,...attribution,model:body.model??url.match(/models\/([^:]+)/)?.[1]??null,started:new Date().toISOString()};const start=performance.now();
 try{const response=await nativeFetch(input,init);row.httpStatus=response.status;let raw;try{raw=await response.clone().json();}catch{}
 row.responseId=raw?.id??null;row.model=raw?.model??row.model;row.usage=raw?.usage??null;row.finishReasons=raw?.choices?.map(c=>c.finish_reason)??[];row.error=raw?.error?{code:raw.error.code,status:raw.error.status}:null;
 return response;}catch(e){row.error={name:e.name};throw e;}finally{row.seconds=(performance.now()-start)/1000;row.finished=new Date().toISOString();journals=journals.then(()=>appendFile(root+'/requests.jsonl',JSON.stringify(row)+'\n'));}
};
const rows=[];let saving=Promise.resolve();
const save=()=>{const value=JSON.stringify(rows,null,2);saving=saving.then(()=>writeFile(root+'/results.json',value));return saving;};
async function runCase(c){
 const work=`${root}/targeted/${c.key}/work`,row={...c,status:'preparing'},start=performance.now();rows.push(row);await save();
 try{
  await cp(source,work,{recursive:true,filter:src=>{const rel=path.relative(source,src);
   return !['builder-manifest.json','builder-results.json','trace.jsonl'].includes(rel)&&!/^pages\/(?:page-\d+\.html|index\.html)$/.test(rel)&&!/(^|\/)(?:\.shots|code-runtime[^/]*|lessons|preview-snapshots)(\/|$)/.test(rel);}});
  for(const file of [`pages/plan/p${pid.slice(5)}.md`,'pages/plan/pages.md']){
   const full=work+'/'+file;let text=await readFile(full,'utf8');
   if(!text.includes(config.original))throw new Error(file+' lacks the original spec');
   text=text.replace(config.original,c.spec);if(config.continuity)text=text.replace(config.continuity.from,config.continuity.to);
   await writeFile(full,text);
  }
  await seed(work);
  const signal=AbortSignal.timeout(900000),rt=baselineRuntime(work,{profile:config.profile??'gemini38-google-low'},signal);
  const seen=new Set();for(const port of Object.values(rt.builders)){const model=port.model;if(seen.has(model))continue;seen.add(model);
   const respond=model.respondCanonical.bind(model);model.respondCanonical=(instructions,history,...args)=>context.run({key:c.key,pid,phase:'builder'},()=>respond(instructions,history,...args));}
  row.status='building';row.started=new Date().toISOString();await save();console.log('TARGET',c.key);
  const pages=await buildRun(work,rt.builders,{label:c.key,only:[pid],profile:rt.models.builders['build-page'].profile,profiles:Object.fromEntries(Object.entries(rt.models.builders).map(([k,v])=>[k,v.profile])),workflowRoot:resources+'/skills',prompts:resources+'/prompts',signal});
  const p=pages[0];Object.assign(row,{status:p.artifact_present&&!p.audit?.fatal_errors.length?(p.termination==='no_tool_use'?'completed':'passing-at-deadline'):'incomplete',pages:[p],seconds:(performance.now()-start)/1000});
  await symlink(work+'/pages',`${root}/preview/${c.key}`,'dir');
 }catch(e){row.status='failed';row.error=String(e);}
 await save();console.log('TARGET DONE',c.key,row.status,Math.round(row.seconds??0));
}
// Each lesson loads Pyodide+NumPy in the shared browser; too many at once starve the 15s run waits.
const release=acquireVisualChecker();
try{const queue=[...config.cases];await Promise.all(Array.from({length:concurrency},async()=>{while(queue.length)await runCase(queue.shift());}));}
finally{await release();await journals;await saving;globalThis.fetch=nativeFetch;}
