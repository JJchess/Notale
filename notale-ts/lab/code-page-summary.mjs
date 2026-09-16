import {readFile,writeFile} from 'node:fs/promises';
import {runBrowserCheck} from '../src/tools/code-check.ts';
import {closeVisualChecker} from '../src/tools/visual-check.ts';
import {parseArgs} from 'node:util';
const {values:{dir}}=parseArgs({options:{dir:{type:'string'}}});if(!dir)throw new Error('--dir is required');const root=dir.replace(/\/$/,'');
const results=JSON.parse(await readFile(root+'/results.json','utf8'));
const requests=(await readFile(root+'/requests.jsonl','utf8')).trim().split('\n').map(l=>JSON.parse(l));
const out=[];
for(const row of results){
 const p=row.pages?.[0]??{}, reqs=requests.filter(r=>r.key===row.key&&r.usage);
 const steps=p.steps??[];
 const work=`${root}/targeted/${row.key}/work`;
 let stages='', check='', firstRender='';
 try{
  const trace=(await readFile(work+'/trace.jsonl','utf8')).trim().split('\n').map(l=>JSON.parse(l));
  const walk=(o,f)=>{if(Array.isArray(o))o.forEach(v=>walk(v,f));else if(o&&typeof o==='object'){f(o);Object.values(o).forEach(v=>walk(v,f));}};
  walk(trace,o=>{if(!firstRender&&o.name==='Write'&&String(o.arguments||'').slice(0,200).includes('render.js')){try{firstRender=JSON.parse(o.arguments).content;}catch{firstRender=String(o.arguments);}}});
 }catch{}
 try{const r=await runBrowserCheck(work+'/pages',results[0]?.pid??'page-10',true,undefined,true);check=r.report;stages=(r.report.match(/\d+ 帧（[^）]*）/)||[''])[0];}catch(e){check=String(e);}
 out.push({key:row.key,status:row.status,seconds:Math.round(row.seconds??0),termination:p.termination,responses:p.calls,patches:steps.filter(s=>s==='Patch').length,patchMiss:steps.filter(s=>s==='Patch!miss').length,autochecks:steps.filter(s=>s==='AutoCheck').length,images:p.images,
  firstResponseSeconds:Math.round(reqs[0]?.seconds??0),lastPrompt:reqs.at(-1)?.usage?.prompt_tokens,totalIn:reqs.reduce((a,r)=>a+(r.usage.prompt_tokens||0),0),totalOut:reqs.reduce((a,r)=>a+(r.usage.completion_tokens||0),0),
  audit:p.audit?.fatal_errors??[],finalCheckPass:/全部通过/.test(check),stages,firstRenderHead:firstRender.slice(0,1400)});
}
await closeVisualChecker();
await writeFile(root+'/summary.json',JSON.stringify(out,null,2));
console.log(['key','status','sec','resp','patch','miss','auto','img','1st(s)','lastPrompt','final✓','stages'].join('\t'));
for(const o of out)console.log([o.key,o.status,o.seconds,o.responses,o.patches,o.patchMiss,o.autochecks,o.images,o.firstResponseSeconds,o.lastPrompt,o.finalCheckPass,o.stages].join('\t'));
