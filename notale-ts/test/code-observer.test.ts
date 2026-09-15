import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rename, cp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { scaffold, lessonRoot } from '../src/tools/code-scaffold.js';
import { CODE_FILES, CODE_SAMPLES, codeReferences } from '../src/core/code-observer.js';
import { RESOURCES } from '../src/core/guidance.js';
import { resolveBuilderProfile, loadConfig } from '../src/adapters/models/profiles.js';
import { buildOne, codeGuard, Page } from '../src/core/builder.js';
import { runBrowserCheck } from '../src/tools/code-check.js';
import { browser, staticServer, closeVisualChecker } from '../src/tools/visual-check.js';
import { publishOutput } from '../src/core/orchestration.js';
import { lectureArchive, archiveContentTypes } from '../src/server/lecture-archive.js';
import type { RunService } from '../src/core/run-service.js';
import { runTool, toolSpecs, outOfBounds } from '../src/tools/workspace.js';

test('observer Patch batches and read/write boundaries', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'observer-patch-')), pages = path.join(root, 'pages');
  await mkdir(pages);
  const created = await scaffold(pages, 'page-01', 'patch', 1);
  assert.equal((created.limits as Record<string, number>).maxItems, 160);
  const context = { cwd: pages, pid: 'page-01', resourceRoot: path.join(RESOURCES, 'skills/build-code') };
  assert.deepEqual(toolSpecs('build-code', false).map(s => s.name).sort(), ['Check', 'Patch', 'Read', 'Write']);
  const unused = async (): Promise<never> => { throw Error('unexpected dependency'); };
  const ports = {image: unused, media: unused, check: unused};
  for (const file_path of ['page-01.html', 'assets/lessons/page-01/lesson/starter.py', 'assets/lessons/page-01/lesson/view/render.js']) {
    const file = path.join(pages, file_path); await writeFile(file, 'alpha\nbeta\n');
    const missed = await runTool('Patch', {file_path, edits:[{old:'alpha',new:'A'},{old:'absent',new:'B'}]}, context, ports);
    assert.match(String(missed), /失败/); assert.equal(await readFile(file,'utf8'), 'alpha\nbeta\n');
    const result = await runTool('Patch', {file_path, edits:[{old:'alpha',new:'A'},{old:'beta',new:'B'}]}, context, ports);
    assert.match(String(result), /改了 2 处/); assert.equal(await readFile(file,'utf8'), 'A\nB\n');
    if (file_path !== 'page-01.html') assert.equal(codeGuard('Patch', {file_path}, context), undefined);
  }
  for (const file_path of ['assets/lessons/page-01/lesson/lesson.js','assets/lessons/page-02/lesson/starter.py','page-01.html','../outside.py'])
    assert.ok(codeGuard('Patch', {file_path,edits:[]}, context), file_path);
  for (const file_path of ['assets/lessons/page-01/lesson/lesson.js','references/observer.md',path.join(context.resourceRoot,'SKILL.md')]) {
    assert.equal(codeGuard('Read',{file_path},context),undefined);
    assert.equal(outOfBounds('Read',{file_path},context),undefined);
    assert.doesNotMatch(String(await runTool('Read',{file_path},context,ports)), /拒绝|FileNotFoundError/);
  }
  assert.ok(codeGuard('Read',{file_path:'assets/lessons/page-01/frames.json'},context));
});

test('observer diagnostics report execution failures before waiting for a frame', {timeout:60000}, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'observer-diagnostics-')), pages = path.join(root,'pages');
  await mkdir(pages); await scaffold(pages,'page-01','diagnostics',1);
  const lesson = path.join(lessonRoot(pages,'page-01'),'lesson');
  const observer = 'def observe(context):\n    if context.function == "<module>" and context.event == "return":\n        return {"X": context.globals.get("values", [])}\n';
  const renderer = 'window.renderNotaleView = ({state}) => { document.getElementById("code-title").textContent = String(state.X.length); };';
  const cases = [
    {source:'values = list(range(160))', expected:/全部通过/},
    {source:'values = list(range(161))', expected:/state.X: maxItems exceeded \(actual=161, limit=160\)/},
    {source:'values = list(range(200))', expected:/state.X: maxItems exceeded \(actual=200, limit=160\)/},
    {source:'raise ValueError("runtime evidence")', expected:/runtime evidence/},
    {source:'values = []', observe:'def observe(context):\n    raise ValueError("observer evidence")', expected:/observer evidence/},
    {source:'values = []', tests:'def run_tests(ns):\n    return [{"name":"independent check", "passed":False, "message":"test evidence"}]', expected:/test evidence/},
    {source:'values = []', render:'window.renderNotaleView = () => { throw Error("render evidence"); };', expected:/render evidence/},
  ];
  try {
    for (const row of cases) {
      await writeFile(path.join(lesson,'starter.py'),row.source+'\n');
      await writeFile(path.join(lesson,'observe.py'),row.observe ?? observer);
      await writeFile(path.join(lesson,'tests.py'),row.tests ?? 'def run_tests(ns):\n    return []\n');
      await writeFile(path.join(lesson,'view/render.js'),row.render ?? renderer);
      const result = await runBrowserCheck(pages,'page-01');
      assert.match(result.report,row.expected); assert.doesNotMatch(result.report,/TimeoutError|等待超过/);
    }
    for (const file of CODE_FILES) await cp(path.join(RESOURCES,'skills/build-code/observer-samples/neural-network',file),path.join(lesson,file));
    assert.match((await runBrowserCheck(pages,'page-01')).report,/全部通过/);
    // A missing render acknowledgement, with no execution error, is a real view timeout.
    const bridge = path.join(pages,'assets/code-runtime-observer-v1/core/native-view-bridge.js');
    await writeFile(bridge,(await readFile(bridge,'utf8')).replace('document.documentElement.dataset.renderedFrameIndex = String(playback.index ?? -1);',''));
    assert.match((await runBrowserCheck(pages,'page-01')).report,/可视化帧 -1 渲染确认；等待超过 5000ms/);
  } finally { await closeVisualChecker(); }
});

test('observer first input, exact ownership and same-context repair (no model)', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'observer-agent-'));
  const pages = path.join(root, 'pages'); await mkdir(pages);
  const references = codeReferences();
  for (const sample of CODE_SAMPLES) for (const file of CODE_FILES)
    assert.ok(references.includes(await readFile(path.join(RESOURCES, 'skills/build-code/observer-samples', sample, file), 'utf8')));
  const profile = resolveBuilderProfile(loadConfig(), 'glm53-flash-low');
  assert.equal(profile.model, 'GLM-5.3-Flash'); assert.equal(profile.reasoning_effort, 'low');
  assert.equal(profile.http_timeout_sec, 300); assert.equal(profile.vision_input, false);
  const created = await scaffold(pages, 'page-01', 'test', 1);
  const lesson = path.join(lessonRoot(pages, 'page-01'), 'lesson');
  assert.equal((created.editable as unknown[]).length, 4);
  assert.deepEqual(await scaffold(pages, 'page-01', 'test', 1), created);
  const context = {cwd:pages, pid:'page-01'};
  assert.equal(codeGuard('Write', {file_path:path.join(lesson,'starter.py')}, context), undefined);
  for (const file of ['lesson.js','view/style.css','view/index.html','extra.py','../core/workbench.js'])
    assert.ok(codeGuard('Patch', {file_path:path.join(lesson,file)}, context));
  const page = new Page('page-01','Implement'); page.workflow='build-code'; page.total=1;
  await writeFile(path.join(lesson,'starter.py'),'alpha');
  await writeFile(path.join(lesson,'view/render.js'),'beta');
  let turn=0, checks=0;
  await buildOne(page,pages,path.join(root,'trace.jsonl'),references,{
    scaffold,
    model:{async respondCanonical(_instructions,history,specs){
      assert(!specs.some(s=>s.name==='CodeScaffold'));
      assert(JSON.stringify(history[0]).includes('CURRENT FILES'));
      if(turn===1) assert.equal(history.filter(item=>item.type==='function_call_output').length,2);
      if(turn===2) assert(JSON.stringify(history).includes('fixture error'));
      turn++;
      const output = turn===1 ? [['starter.py','alpha','A'],['view/render.js','beta','B']].map(([file,old,value],i)=>({
        type:'function_call',name:'Patch',call_id:'patch-'+i,arguments:JSON.stringify({file_path:path.join(lesson,file!),edits:[{old,new:value}]})
      })) : [{type:'message',role:'assistant',content:[{type:'output_text',text:'done'}]}];
      return {id:String(turn),output,
        replay_items:[],raw:{},status:'completed',incomplete_details:null,
        usage:{input_tokens:10,output_tokens:1,input_tokens_details:{cached_tokens:0}}};
    }},
    run:async(name,args,context)=> name==='Patch' ? runTool(name,args,context,{image:async()=>({text:'',images:[]}),media:async()=>({text:'',images:[]}),check:async()=>({text:'ok',images:[]})}) : ({text:'ok',images:[],diagnostics:{fatal_errors:[],visual_warnings:[]}}), image:async()=>({text:'',images:[]}),
    codeCheck:async()=>({report:checks++===0?'失败:fixture error':'ok',shots:[]}),
  },{visionInput:false});
  assert.equal(turn,3); assert.equal(page.termination,'no_tool_use');
  assert.equal(await readFile(path.join(lesson,'starter.py'),'utf8'),'A');
  assert.equal(await readFile(path.join(lesson,'view/render.js'),'utf8'),'B');
  const marker=path.join(lessonRoot(pages,'page-01'),'.notale-code-lesson.json');
  const metadata=JSON.parse(await readFile(marker,'utf8'));delete metadata.runtimeVersion;
  await writeFile(marker,JSON.stringify(metadata));
  await assert.rejects(scaffold(pages,'page-01','old',1),/重新生成新版页面/);
  assert.match((await runBrowserCheck(pages,'page-01')).report,/重新生成新版页面/);
});

test('observer: portable publication, runtime, editor archive and session', {timeout:60000}, async () => {
  const parent = process.env.NOTALE_CODE_TEST_DIR || os.tmpdir();
  const root = await mkdtemp(path.join(parent,'observer-ts-'));
  const pages=path.join(root,'pages');await mkdir(path.join(pages,'assets'),{recursive:true});
  for(const name of ['base.css','base.js']) await cp(path.join(RESOURCES,'chassis',name),path.join(pages,'assets',name));
  await writeFile(path.join(pages,'assets/theme.css'), ':root{--bg:#f3f6f8;--text:#183040;--muted:#567080;--focus:#2472ae}');
  for(const [pid,sample] of [['page-01','insertion-sort'],['page-02','neural-network']]){
    await scaffold(pages,pid!,sample!,2);
    for(const file of CODE_FILES) await cp(path.join(RESOURCES,'skills/build-code/observer-samples',sample!,file),path.join(lessonRoot(pages,pid!),'lesson',file));
  }
  await writeFile(path.join(pages,'index.html'),'<a href="page-01.html">Sorting</a><a href="page-02.html">Neural</a>');
  const output=path.join(root,'output');await publishOutput(pages,output);
  const moved=path.join(root,'moved');await rename(output,moved);
  const reports=[];
  try {
    for(const pid of ['page-01','page-02']){
      const result=await runBrowserCheck(moved,pid,false); assert.match(result.report,/全部通过/,pid+' '+result.report);reports.push({pid,...result});
    }
    const active=await browser(),{origin}=await staticServer(moved);
    const page=await active.newPage();
    await page.goto(origin+'/assets/lessons/page-01/index.html?theme=../../theme.css');
    await page.waitForFunction('window.__prototype?.initialized');
    await page.evaluate(async()=>{
      const lab=(window as any).CodeLab;await lab.ensureInteractive();
      const saved=lab.captureSession();saved.files['starter.py']+='\n# edited';await lab.restoreSession(saved);
    });
    await page.reload();await page.waitForFunction('window.__prototype?.initialized');
    assert.match(await page.evaluate('CodeLab.getModel().getValue()'),/# edited/);
    await page.close();
    const files=async function walk(dir:string,prefix=''):Promise<string[]>{
      const rows:string[]=[];for(const entry of await readdir(dir,{withFileTypes:true})){
        assert(!entry.isSymbolicLink());const name=prefix+entry.name;
        if(entry.isDirectory())rows.push(...await walk(path.join(dir,entry.name),name+'/'));else rows.push(name);
      }return rows;
    };
    await rename(moved,output);
    const manifest=await files(output);
    const service={store:{get:async()=>({status:'completed',request:{query:'Observer migration'}}),runDir:()=>root},manifest:async()=>({files:manifest})} as unknown as RunService;
    const bytes=await lectureArchive(service,'fixture',archiveContentTypes);
    await writeFile(path.join(root,'lecture.notale'),bytes);
    const editor=await import(pathToFileURL(path.resolve(RESOURCES,'../../notale-editor/src/server/notale-archive.ts')).href);
    const decoded=await editor.decodeArchive(bytes);
    assert.equal(decoded.document.slides.length,2);
    const encoded=await editor.encodeArchive(decoded.files),again=await editor.decodeArchive(encoded);
    assert.deepEqual(again.document,decoded.document);
    for(const name of manifest.filter(name=>name.includes('/lesson/')))assert.deepEqual(again.files[name],decoded.files[name]);
    await writeFile(path.join(root,'verification.json'),JSON.stringify({reports,archiveBytes:bytes.length,editorRoundTrip:true,root},null,2));
    console.log('OBSERVER_PREVIEW',root);
  } finally {await closeVisualChecker();}
});
