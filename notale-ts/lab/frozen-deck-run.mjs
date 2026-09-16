// Rebuild every page of a frozen deck (planner/director output kept) and report retries, rebuilds and public text.
// usage: npx tsx lab/frozen-deck-run.mjs --source <frozen work dir> --out <dir>
import {readFile,writeFile,cp,appendFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {baselineRuntime} from '../src/core/baseline-pipeline.ts';
import {buildRun,seed} from '../src/core/orchestration.ts';
import {publicReason} from '../src/core/public-text.ts';
import {lessonTitle} from '../src/core/builder.ts';
import {acquireVisualChecker} from '../src/tools/visual-check.ts';
const {values:{source,out}}=parseArgs({options:{source:{type:'string'},out:{type:'string'}}});
if(!source||!out)throw new Error('--source and --out are required');
const root=path.resolve(out),work=root+'/work',resources=new URL('../resources',import.meta.url).pathname;
await mkdir(root,{recursive:true});
await cp(path.resolve(source),work,{recursive:true,filter:src=>{const rel=path.relative(path.resolve(source),src);
 return !['builder-manifest.json','builder-results.json','trace.jsonl'].includes(rel)&&!/^pages\/(?:page-\d+\.html|index\.html)$/.test(rel)&&!/(^|\/)(?:\.shots|code-runtime[^/]*|lessons|preview-snapshots)(\/|$)/.test(rel);}});
await seed(work);
const events=[];const LEAK=/\/data1|\/tmp\/|Traceback|TypeError|ReferenceError|node_modules|\.ts:\d|\.js:\d|default_api|\bat \w+ \(/;
const note=(kind,text,extra={})=>{const row={at:new Date().toISOString(),kind,text,leak:LEAK.test(text),...extra};events.push(row);console.log(kind,text.slice(0,140));};
const signal=AbortSignal.timeout(1800000),rt=baselineRuntime(work,{profile:'gemini38-google-low'},signal);
const release=acquireVisualChecker();const t0=performance.now();
try{
 const pages=await buildRun(work,rt.builders,{label:'frozen-deck',profile:rt.models.builders['build-page'].profile,profiles:Object.fromEntries(Object.entries(rt.models.builders).map(([k,v])=>[k,v.profile])),workflowRoot:resources+'/skills',prompts:resources+'/prompts',signal,
  onRetry(page){note('page.progress',`${page.pid} · ${page.label}：${publicReason(page)}，正在修正`,{pid:page.pid,attempts:page.attempts});},
  async onPage(page,state){
   if(state==='started')note('page.started',`正在生成 ${lessonTitle(page)}`,{pid:page.pid});
   else if(page.artifact_present&&page.termination==='no_tool_use'&&!page.audit?.fatal_errors.length)note('page.ready',`${lessonTitle(page)} 已生成`,{pid:page.pid,attempts:page.attempts,seconds:Math.round(page.seconds)});
   else note('page.progress',`${page.pid} · ${page.label} · ${lessonTitle(page)}：${publicReason(page)}，本页未收录`,{pid:page.pid,attempts:page.attempts,failed:true});
  }});
 const wall=(performance.now()-t0)/1000;
 const rows=pages.map(p=>({pid:p.pid,workflow:p.workflow,attempts:p.attempts,premature_stops:p.premature_stops,stop_reasons:p.stop_reasons,calls:p.calls,seconds:Math.round(p.seconds),termination:p.termination,delivered:p.artifact_present&&p.termination==='no_tool_use'&&!p.audit?.fatal_errors.length,public:publicReason(p)}));
 await writeFile(root+'/summary.json',JSON.stringify({wallSeconds:Math.round(wall),delivered:rows.filter(r=>r.delivered).length,pages:rows,events,leaks:events.filter(e=>e.leak)},null,2));
 console.log('\nWALL',Math.round(wall),'s delivered',rows.filter(r=>r.delivered).length,'/',rows.length,'rebuilt',rows.filter(r=>r.attempts>1).map(r=>r.pid),'leaks',events.filter(e=>e.leak).length);
}finally{await release();}
