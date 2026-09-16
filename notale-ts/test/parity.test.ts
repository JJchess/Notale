import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import test from 'node:test';
import * as guidance from '../src/core/guidance.js';
/** TS code pages (observer contract, Patch, auto-run check) have no Python counterpart; every Python oracle skips them. */
const PYTHON_WORKFLOWS = guidance.PAGE_WORKFLOWS.filter(name => name !== 'build-code');

const pythonRoot = path.resolve(guidance.RESOURCES, '../../notale-v2');
// Compare assembly using the same explicitly updated configuration on both sides.
const nativeBuilder = JSON.parse(readFileSync(path.join(guidance.RESOURCES, 'builder-instructions.json'), 'utf8'));

test('path resolution follows symlinks before parent traversal like Python', async () => {
  const { mkdtempSync, mkdirSync, symlinkSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { resolvePath } = await import('../src/core/planner-contract.js');
  const { resolveReadPath, outOfBounds } = await import('../src/tools/workspace.js');
  const root = mkdtempSync(path.join(tmpdir(), 'notale-path-parity-'));
  try {
    const cwd = path.join(root, 'pages');
    mkdirSync(cwd); mkdirSync(path.join(root, 'outside', 'child'), { recursive: true });
    symlinkSync('../outside/child', path.join(cwd, 'link'));
    symlinkSync('../outside/missing', path.join(cwd, 'dangling'));
    symlinkSync('loop', path.join(cwd, 'loop'));
    writeFileSync(path.join(root, 'outside', 'target.txt'), 'outside');
    writeFileSync(path.join(cwd, 'plain'), 'file');
    const files = ['link/../target.txt', 'dangling/../target.txt', 'missing/../plain', 'plain/child/..', 'link/../../pages/plain', '.', 'x'.repeat(300) + '/../plain'];
    const expected = JSON.parse(execFileSync('python', ['-c', `
import json,sys
from pathlib import Path
p=json.load(sys.stdin)
print(json.dumps([str((Path(p['cwd'])/f).resolve()) for f in p['files']]))
`], { input: JSON.stringify({ cwd, files }), encoding: 'utf8' }));
    assert.deepEqual(files.map(file => resolvePath(file, cwd)), expected);
    assert.equal(resolveReadPath(files[0]!, cwd), expected[0]);
    assert.match(outOfBounds('Read', { file_path: files[0] }, { cwd, pid: 'page-01' })!, /run 目录之外/);
    assert.equal(outOfBounds('Read', { file_path: files[4] }, { cwd, pid: 'page-01' }), undefined);
    assert.throws(() => resolvePath('loop', cwd), /Symlink loop/);
    assert.equal(resolvePath('../target.txt', cwd + '/link'), expected[0]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('dotenv bindings and ordered expansion match Python without mutating the host environment', async () => {
  const { dotenvEnvironment, runtimeEnvironment } = await import('../src/core/baseline-pipeline.js');
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const source = '\uFEFF' + String.raw`export BASE=first
EARLY=\${BASE}
BASE=second
ORDER=first
ORDER_EARLY=\${ORDER}
ORDER=second
ORDER_LATE=\${ORDER}
LATE=\${BASE}
HOST_REF=\${HOST}
DEFAULT=\${ABSENT:-fallback}
BARE
BARE_REF=\${BARE:-not-used}
EMPTY=
EMPTY_REF=\${EMPTY:-not-used}
HASH=value#kept # removed
'quoted key'='one\'two\\three'
ESCAPES="one\ntwo\tthree\a\b\f\r\v\"\\"
MULTILINE="first
second"
SINGLE='\${BASE}'
INVALID="value" trailing
RECOVER=ok
UNFINISHED="bad
NEXT=kept
`.replace(/\\\$/g, '$');
  const env = { HOST: 'external', BASE: 'host-base', EMPTY: '' };
  const expected = JSON.parse(execFileSync('python', ['-c', `
import os,sys,json,io
from dotenv import load_dotenv
p=json.load(sys.stdin);os.environ.clear();os.environ.update(p['env'])
load_dotenv(stream=io.StringIO(p['source']))
print(json.dumps(dict(os.environ)))
`], { input: JSON.stringify({ source, env }), encoding: 'utf8' }));
  assert.equal(expected.ORDER_EARLY, 'first');
  assert.equal(expected.ORDER_LATE, 'second');
  assert.deepEqual(dotenvEnvironment(source, env), expected);
  assert.deepEqual(env, { HOST: 'external', BASE: 'host-base', EMPTY: '' });
  const root = mkdtempSync(path.join(tmpdir(), 'notale-env-parity-'));
  try {
    const file = path.join(root, 'fixture.env');
    writeFileSync(file, source);
    assert.deepEqual(runtimeEnvironment(env, file), expected);
    const disabled = { ...env, PYTHON_DOTENV_DISABLED: 'True' };
    assert.deepEqual(runtimeEnvironment(disabled, file), disabled);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('prompt resources retain baseline bytes or explicitly recorded native updates', () => {
  const baseline = JSON.parse(readFileSync(path.join(guidance.RESOURCES, 'python-baseline.json'), 'utf8'));
  for (const [file, digest] of Object.entries({ ...baseline.files, ...baseline.resourceUpdates })) {
    if (!file.startsWith('prompts/') && !file.startsWith('skills/')) continue;
    for (const root of [guidance.RESOURCES, pythonRoot]) {
      const expected = root === guidance.RESOURCES ? baseline.nativeResourceUpdates?.[file] ?? digest : digest;
      assert.equal(createHash('sha256').update(readFileSync(path.join(root, file))).digest('hex'), expected, `${root}/${file}`);
    }
  }
});

test('shared guidance resources match Python independently of current workflow policy', () => {
  // Python is an independent comparison oracle for migration tests only.
  const reference = JSON.parse(execFileSync('python', ['-c', `
import json
from core import skills
out = dict(descriptions=skills.page_skill_descriptions(),
           deck=skills.philosophy_block('deck'),page=skills.philosophy_block('page'),
           direction=skills.direction_block(),theme=skills.theme_slop_block(),
           visual=skills.anti_slop_block(),code=skills.anti_slop_block(include_visual=False),routes={})
print(json.dumps(out,ensure_ascii=False))
`], { cwd: pythonRoot, encoding: 'utf8' }));
  assert.equal(guidance.pageSkillDescriptions(), reference.descriptions);
  assert.equal(guidance.philosophyBlock('deck'), reference.deck);
  assert.equal(guidance.philosophyBlock('page', path.join(pythonRoot, 'prompts')), reference.page);
  assert.equal(guidance.directionBlock(), reference.direction);
  assert.equal(guidance.themeSlopBlock(), reference.theme);
  assert.equal(guidance.antiSlopBlock(path.join(pythonRoot, 'skills')), reference.visual);
  assert.equal(guidance.antiSlopBlock(undefined, false), reference.code);

});

test('literal prompt substitution preserves code braces and warns from original template', () => {
  const warnings: string[] = [];
  assert.equal(guidance.fill('{query} {missing} fn({index:1})', { query: '{inserted}' }, 'deck', message => warnings.push(message)), '{inserted} {missing} fn({index:1})');
  assert.equal(warnings.length, 1);
  assert.ok(warnings[0]!.includes('{missing}'));
  assert.ok(!warnings[0]!.includes('{inserted}'));
});

test('builder prompt blocks, order and chapter context match Python on baseline resources', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const builder = await import('../src/core/builder-context.js');
  const root = mkdtempSync(path.join(tmpdir(), 'notale-prompt-parity-'));
  try {
    mkdirSync(path.join(root, 'pages/assets/lib'), { recursive: true });
    mkdirSync(path.join(root, 'pages/plan'), { recursive: true });
    for (const file of ['CHASSIS.md', 'lib/LIBS.md']) writeFileSync(path.join(root, 'pages/assets', file), readFileSync(path.join(pythonRoot, 'vendor/chassis', file), 'utf8').replaceAll('\n', '\r\n'));
    writeFileSync(path.join(root, 'pages/assets/theme.css'), '/* ==== INTERFACE ====\n修订 2026-09-12\n--bg: #ffffff;\n==== /INTERFACE ==== */\n:root { --bg: #fff; }');
    const pages = ['# page-01 [标题页]\n封面 & <主题>', '# page-02 [内容页]\n建立关系', '# page-03 [交互页]\n检验关系', '# page-04 [标题页]\n第二章', '# page-05 [代码页]\n计算验证'];
    writeFileSync(path.join(root, 'pages/plan/pages.md'), ('图池前言\n' + pages.join('\n\n')).replaceAll('\n', '\r\n'));
    pages.forEach((page, index) => writeFileSync(path.join(root, 'pages/plan', `p${String(index + 1).padStart(2, '0')}.md`), (page + '\n').replaceAll('\n', '\r\n')));
    const workflowRoot = path.join(root, 'workflows');
    for (const name of guidance.PAGE_WORKFLOWS) {
      mkdirSync(path.join(workflowRoot, name), { recursive: true });
      const skillSource = readFileSync(path.join(pythonRoot, 'skills', name, 'SKILL.md'), 'utf8');
      const customMetadata = skillSource.replace(/^---\n.*?\n---/s, header => header.replace(/\n---$/, '\nname: 012\ndescription: ignored\ndescription: final discovery\n---'));
      writeFileSync(path.join(workflowRoot, name, 'SKILL.md'), customMetadata.replaceAll('\n', '\r\n'));
    }
    writeFileSync(path.join(root, 'deck.md'), '开头\r\n{query}\r页表\r\n结尾\r');
    const reference = JSON.parse(execFileSync('python', ['-c', `
import json,sys
from pathlib import Path
from core import builder,skills,planner
skills.FONT_FLOOR = ${JSON.stringify(guidance.FONT_FLOOR)}
builder.IDENTITY = ${JSON.stringify(nativeBuilder.IDENTITY)}
builder.TEXT_CAP_TEMPLATE = ${JSON.stringify(nativeBuilder.TEXT_CAP_TEMPLATE)}
builder.STEPS_BLOCK = ${JSON.stringify(nativeBuilder.STEPS_BLOCK)}
from types import SimpleNamespace
root=Path(sys.argv[1]); out={'chapters':builder.chapter_preloads(root,5),'blocks':{}}
out['descriptions']=skills.page_skill_descriptions(root/'workflows')
out['prompt']=planner.Run.prompt(SimpleNamespace(prompts=root,style_director=True),'deck',query='主题')

for workflow in skills.PAGE_WORKFLOWS:
 for notes in builder.NOTES_MODES:
  for visual in (False,True):
   key=f'{workflow}/{notes}/{visual}'
   blocks=builder.instruction_blocks(root,5,workflow,notes=notes,visual_focus=visual)
   out['blocks'][key]={'order':list(blocks),'text':blocks}
out['environment']=builder.environment_context(root/'pages',builder.Page('page-02',''),skills.WORKFLOWS/'build-page')
print(json.dumps(out,ensure_ascii=False))
`, root], { cwd: pythonRoot, encoding: 'utf8' }));
    assert.deepEqual(builder.chapterPreloads(root, 5), reference.chapters);
    assert.equal(guidance.pageSkillDescriptions(workflowRoot), reference.descriptions);
    const { plannerPrompt } = await import('../src/core/planner-contract.js');
    assert.equal(plannerPrompt('deck', { query: '主题' }, root), reference.prompt);

    for (const workflow of PYTHON_WORKFLOWS) for (const notes of ['off', 'cap', 'notes', 'only']) for (const visualFocus of [false, true]) {
      const expected = reference.blocks[`${workflow}/${notes}/${visualFocus ? 'True' : 'False'}`];
      const actual = builder.instructionBlocks(root, 5, workflow, { notes, visualFocus, workflowRoot: path.join(pythonRoot, 'skills'), prompts: path.join(pythonRoot, 'prompts') });
      assert.deepEqual(Object.keys(actual), expected.order);
      // Workflow policy now has its own mode/teaching contract tests; retain the
      // independent Python oracle for every other shared input block.
      const { workflow: _actualWorkflow, ...shared } = actual;
      const { workflow: _expectedWorkflow, ...expectedShared } = expected.text;
      assert.deepEqual(JSON.parse(JSON.stringify(shared).replaceAll(guidance.WORKFLOWS, path.join(pythonRoot, 'skills'))), expectedShared);
    }
    const defaults = Object.fromEntries(guidance.PAGE_WORKFLOWS.map(workflow => [workflow, Object.values(builder.instructionBlocks(root, 5, workflow)).join('\n\n')]));
    assert.match(defaults['build-cover']!, /不超过 80 个字符/);
    for (const workflow of ['build-page', 'build-interaction']) assert.match(defaults[workflow]!, /不超过 200 个字符/);
    assert.ok(!defaults['build-code']!.includes('<text_budget>'));
    for (const text of Object.values(defaults)) assert.ok(!text.includes('<speaker_notes>'));
    assert.equal(builder.environmentContext(path.join(root, 'pages'), 'page-02', path.join(guidance.WORKFLOWS, 'build-page')).replaceAll(guidance.WORKFLOWS, path.join(pythonRoot, 'skills')), reference.environment);
    const brokenSkill = path.join(workflowRoot, 'build-page/SKILL.md');
    writeFileSync(brokenSkill, Buffer.concat([readFileSync(brokenSkill), Buffer.from([255])]));
    for (const file of ['deck.md', 'direction.md', 'pages/assets/lib/LIBS.md', 'pages/assets/CHASSIS.md']) writeFileSync(path.join(root, file), Buffer.concat([Buffer.from(file), Buffer.from([255])]));
    const invalid = JSON.parse(execFileSync('python', ['-c', `
import json,sys
from pathlib import Path
from types import SimpleNamespace
from core import skills,planner,builder
root=Path(sys.argv[1]);rows=[]
for call in [lambda:skills.page_skill_descriptions(root/'workflows'),lambda:skills.direction_block(root),lambda:planner.Run.prompt(SimpleNamespace(prompts=root,style_director=True),'deck',query='主题'),lambda:builder._libs_index(root),lambda:builder.shared_preload(root,5)]:
 try:rows.append({'value':call()})
 except Exception as error:rows.append({'name':type(error).__name__,'message':str(error)})
print(json.dumps(rows))
`, root], { cwd: pythonRoot, encoding: 'utf8' }));
    const checks = [() => guidance.pageSkillDescriptions(workflowRoot), () => guidance.directionBlock(root), () => plannerPrompt('deck', { query: '主题' }, root), () => builder.libsIndex(root), () => builder.sharedPreload(root, 5)];
    checks.forEach((call, index) => {
      let actual;
      try { actual = { value: call() }; } catch (error) { actual = { name: (error as Error).name, message: (error as Error).message }; }
      assert.deepEqual(actual, invalid[index]);
    });
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('planner page parsing and rejection messages match the Python gate', async () => {
  const planner = await import('../src/core/planner-contract.js');
  const cases = [
    '', '# page-01 [标题页]\n开场', '# page-02 [内容页]\n缺第一页',
    '# page-01 [未知]\n主题', '# page-01 [内容页]\n', '# page-1 [内容页]\n非两位编号',
    '# page-02 [内容页]\n第二页\n# page-01 [标题页]\n第一页',
    '前言\n# page-01 [内容页]\n初稿\n# page-01 [标题页]\n定稿',
    '```markdown\n# page-01 [标题页]\n主题\n```',
    ...[30, 60, 61].map(n => Array.from({ length: n }, (_, i) => `# page-${String(i + 1).padStart(2, '0')} [内容页]\n主题 ${i + 1}`).join('\n')),
  ];
  const expected = JSON.parse(execFileSync('python', ['-c', `
import json,sys
from core import planner
print(json.dumps([{'pages':planner.split_pages(s),'error':planner._valid_pages(s)} for s in json.load(sys.stdin)],ensure_ascii=False))
`], { cwd: pythonRoot, input: JSON.stringify(cases), encoding: 'utf8' }));
  cases.forEach((text, index) => {
    assert.deepEqual(planner.splitPages(text), expected[index].pages);
    assert.equal(planner.validPages(text), expected[index].error);
  });
  assert.throws(() => planner.finalizePlan({ pages_md: '## Audience\n学生\n\n' + cases[1]!, media_by_page: null }, {}, '/tmp'), /media_by_page/);
});

test('plan audience and scoped continuity reach only intended Builders in Python and TS', async () => {
  const { mkdtempSync, mkdirSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const planner = await import('../src/core/planner-contract.js');
  const builder = await import('../src/core/builder-context.js');
  const root = mkdtempSync(path.join(tmpdir(), 'notale-continuity-'));
  const pages = '# page-01 [标题页]\n主题\n\n# page-02 [内容页]\n第一组\n\n# page-03 [交互页]\n重叠组\n\n# page-04 [代码页]\n第二组\n';
  const preamble = '## Audience\n高中生，掌握代数；x < 18 & y > 0。\n\n## Continuity\n### dataset\nPages: page-02, page-03\n样本 [[0,1],[1,0]]，类标 [0,1]。\n\n### training\nPages: page-03, page-04\n初始权重 [0.1,0.2]，学习率 0.01。\n\n';
  const doc = preamble + pages;
  const cases = [doc, doc.replaceAll('\n', '\r\n'), pages, '## Audience\n学生\n## Continuity\n无\n' + pages,
    doc.replace('page-02, page-03', 'page-02, page-99'), doc.replace('page-02, page-03', 'page-02, page-02'),
    doc.replace('### training', '### dataset'), '## Audience\n重复\n' + doc, pages + preamble,
    '## Audience\n\n## Continuity\n无\n' + pages, doc.replace('Pages: page-02, page-03', 'Pages: page-02～page-03'),
    doc.replace('### training', '### invalid id'), doc.replace('Pages: page-03, page-04\n', ''),
    doc.replace('初始权重 [0.1,0.2]，学习率 0.01。', '')];
  try {
    mkdirSync(path.join(root, 'pages/plan'), { recursive: true });
    mkdirSync(path.join(root, 'pages/assets/lib'), { recursive: true });
    writeFileSync(path.join(root, 'pages/plan/pages.md'), doc);
    for (const [number, spec] of Object.entries(planner.splitPages(doc))) {
      assert.ok(!spec.includes('## Audience') && !spec.includes('## Continuity') && !spec.includes('初始权重'));
      writeFileSync(path.join(root, `pages/plan/p${number}.md`), spec);
    }
    writeFileSync(path.join(root, 'pages/assets/CHASSIS.md'), 'chassis');
    writeFileSync(path.join(root, 'pages/assets/theme.css'), '/* ==== INTERFACE ====\ntheme\n==== /INTERFACE ==== */');
    writeFileSync(path.join(root, 'pages/assets/lib/LIBS.md'), '## 按「要做的事」查\nfixture\n');
    const expected = JSON.parse(execFileSync('python', ['-c', `
import json,sys
from pathlib import Path
from core import planner,builder,skills
skills.FONT_FLOOR = ${JSON.stringify(guidance.FONT_FLOOR)}
p=json.load(sys.stdin);root=Path(p['root']);parsed=[]
for text in p['cases']:
 try:parsed.append(planner.plan_context(text))
 except ValueError as e:parsed.append({'error':str(e)})
print(json.dumps(dict(parsed=parsed,chapters=builder.chapter_preloads(root,4),shared={w:builder.shared_preload(root,4,workflow=w) for w in skills.PAGE_WORKFLOWS}),ensure_ascii=False))
`], { cwd: pythonRoot, input: JSON.stringify({ root, cases }), encoding: 'utf8' }));
    assert.deepEqual(cases.map(text => { try { return planner.planContext(text); } catch (e) { return { error: (e as Error).message }; } }), expected.parsed);
    for (let i = 4; i < cases.length; i++) assert.ok(expected.parsed[i].error, `invalid case ${i}`);
    assert.throws(() => planner.finalizePlan({ pages_md: pages }, {}, root), /Audience/);
    assert.equal(planner.finalizePlan({ pages_md: doc }, {}, root).pagesDoc, doc);
    const chapters = builder.chapterPreloads(root, 4);
    assert.deepEqual(chapters, expected.chapters);
    assert.ok(!chapters['page-01']!.includes('<continuity>'));
    assert.ok(chapters['page-02']!.includes('id="dataset"') && !chapters['page-02']!.includes('id="training"'));
    assert.ok(chapters['page-03']!.includes('id="dataset"') && chapters['page-03']!.includes('id="training"'));
    assert.ok(!chapters['page-04']!.includes('id="dataset"') && chapters['page-04']!.includes('id="training"'));
    for (const workflow of PYTHON_WORKFLOWS) {
      const shared = builder.sharedPreload(root, 4, path.join(pythonRoot, 'prompts'), workflow);
      assert.equal(shared, expected.shared[workflow]);
      assert.equal(shared.match(/<audience>/g)?.length, 1);
      assert.ok(shared.includes('x &lt; 18 &amp; y &gt; 0'));
      assert.ok(!shared.includes('初始权重') && !shared.includes('样本 [['));
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('planner free tool loop preserves submission ordering and retry gates', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { deckCall, deckPrompt } = await import('../src/core/planning.js');
  const root = mkdtempSync(path.join(tmpdir(), 'notale-planner-parity-'));
  mkdirSync(path.join(root, 'pages/assets/img'), { recursive: true });
  writeFileSync(path.join(root, 'pages/assets/img/a.png'), 'fixture');
  const good = { pages_md: '## Audience\n读者\n\n# page-01 [标题页]\n主题' };
  const mapped = { ...good, media_by_page: { '1': ['assets/img/a.png'] } };
  const call = (name: string, args: object) => ({ name, arguments: JSON.stringify(args) });
  const scenarios = [
    [[{ name: 'FinalizePlan', arguments: '{\"pages_md\":' }], [call('FinalizePlan', good)]],
    [[call('FinalizePlan', good)]],
    [[call('ImageSearch', { query:'broken' })],[call('FinalizePlan',good)]],
    [[call('ImageSearch', { query: 'need' }), call('FinalizePlan', mapped)], [call('FinalizePlan', mapped)]],
    [[call('FinalizePlan', good), call('FinalizePlan', { pages_md: '' })], [call('FinalizePlan', good)]],
    Array.from({ length: 3 }, () => [call('FinalizePlan', { pages_md: '' })]),
    [[]],
    [...Array.from({ length: 15 }, () => [call('ImageGen', { prompt: 'fail' })]), [call('FinalizePlan', good)]],
  ];
  const oracle = `
import json,sys,io,contextlib
from pathlib import Path
from types import SimpleNamespace as NS
from core import planner,llm
payload=json.load(sys.stdin); root=Path(payload['root']); result=[]
planner.config=lambda:{'planner':{'reasoning_effort':'low'}}
llm.usage_of=lambda r:(0,0,0)
llm.text_of=lambda r:''
llm.replay_item=lambda item:vars(item)
llm.ModelRuntime.replay=lambda r:r.output
for scenario in payload['scenarios']:
 history=[]; count=[0]
 def respond(identity,hist,specs,effort,**kw):
  history[:] = list(hist)
  row=scenario[count[0]];count[0]+=1
  return NS(id=str(count[0]),output=[NS(type='function_call',name=c['name'],arguments=c['arguments'],call_id=f'{count[0]}-{i}') for i,c in enumerate(row)])
 def media(name,args,*rest):
  if name=='ImageGen':raise ValueError('media failed')
  if args.get('query')=='broken':return NS(text='{"results":',images=[])
  return NS(text=json.dumps({'results':[{'path':'assets/img/a.png','query_index':0}]}),images=[('image/png','ZmFrZQ==')])
 llm.respond=respond;planner.tools.media_call=media
 run=NS(root=root,style_director=True,log=NS(add=lambda *args:None))
 try:
  with contextlib.redirect_stdout(io.StringIO()):final=planner.deck_call(run,'prompt')
  item={'final':list(final)[1:]}
 except Exception as e:item={'error':str(e),'name':type(e).__name__}
 item['calls']=count[0]
 item['feedback']=[x['output'] for x in history if x.get('type')=='function_call_output']
 result.append(item)
print(json.dumps(result,ensure_ascii=False))
`;
  try {
    const expected = JSON.parse(execFileSync('python', ['-c', oracle], { cwd: pythonRoot, input: JSON.stringify({ root, scenarios }), encoding: 'utf8' }));
    const run = { root, query: '主题', minutes: 45, audience: '读者' };
    for (const [index, scenario] of scenarios.entries()) {
      let count = 0;
      let observed: import('../src/adapters/models/chat-model.js').ChatMessage[] = [];
      let result: Record<string, unknown>;
      try {
        const final = await deckCall(run, {
          progress: () => { throw new Error("observer must not alter planning"); },
          model: { async respond(messages) {
            observed = structuredClone(messages);
            const calls = scenario[count++]!;
            return { id: String(count), inputTokens: 0, outputTokens: 0, message: { role: 'assistant', content: '', tool_calls: calls.map((call, index) => ({ id: `${count}-${index}`, type: 'function', function: call })) } };
          } },
          async media(name,args) {
            if (name === 'ImageGen') throw new Error('media failed');
            if (args.query === 'broken') return { text:'{"results":',images:[] };
            return { text: JSON.stringify({ results: [{ path: 'assets/img/a.png', query_index: 0 }] }), images: [{ mime: 'image/png', data: 'ZmFrZQ==' }] };
          },
          trace: () => {},
        }, undefined, 3); // Python oracle stops at 3; production allows DECK_TRIES
        result = { final: [final.pagesDoc, final.mapping] };
      } catch (error) { result = { error: (error as Error).message, name: (error as Error).name }; }
      result.calls = count;
      result.feedback = observed.filter(message => message.role === 'tool').map(message => message.content);
      // JSON formatting of a mocked media provider is not a planner-loop difference.
      const actualFeedback = result.feedback as string[];
      const expectedFeedback = expected[index].feedback as string[];
      actualFeedback.forEach((value, i) => {
        if (value.startsWith('{')) assert.deepEqual(JSON.parse(value), JSON.parse(expectedFeedback[i]!));
        else assert.equal(value, expectedFeedback[i]);
      });
      assert.equal(actualFeedback.length, expectedFeedback.length);
      delete result.feedback;
      const { feedback: _feedback, ...expectedResult } = expected[index];
      assert.deepEqual(result, expectedResult, `scenario ${index}`);
      if (scenario[0]?.some(call => call.name === 'ImageSearch' && JSON.parse(call.arguments).query !== 'broken')) {
        const imageIndex = observed.findIndex(message => message.role === 'user' && Array.isArray(message.content));
        assert.equal(observed[imageIndex - 1]?.role, 'tool');
        assert.equal(observed[imageIndex - 2]?.role, 'tool');
      }
    }
    assert.ok(deckPrompt(run).includes('45'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('Director submission and repair loop matches Python, including reuse and continuous history', async () => {
  const { mkdtempSync, rmSync, mkdirSync, symlinkSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { direct } = await import('../src/core/director.js');
  const { workflowTraceText } = await import('../src/core/baseline-pipeline.js');
  const root = mkdtempSync(path.join(tmpdir(), 'notale-director-parity-'));
  mkdirSync(path.join(root, 'pages/assets'), { recursive: true });
  const target = path.join(root, 'pages/assets/theme.css');
  const loop = path.join(root, 'loop'); symlinkSync(loop, loop);
  const pickTarget = path.join(root, 'style-picks.tsv');
  const css = '/* ==== INTERFACE ====\n==== /INTERFACE ==== */\n:root{--bg:white}';
  const call = (name: string, args: object) => ({ name, arguments: JSON.stringify(args) });
  const write = (content: string) => call('Write', { file_path: target, content });
  const scenarios = [
    { style: 'named', rows: [[{ name: 'Write', arguments: '{\"content\":' }], [write(css)]] },
    { style: 'named', rows: [[{ name: 'Read', arguments: '{\"😀\":x}' }], [write(css)]] },
    { style: 'named', rows: [[write(css)]] },
    { style: 'named', rows: [[write(css), call('Read', { file_path: '01-test' })], [write(css)]] },
    { style: 'named', rows: [[write('bad')], [write(css)]] },
    { style: 'named', rows: Array.from({ length: 3 }, () => [write('bad')]) },
    { style: 'named', rows: [[]] },
    {style:'named',rows:[[call('Write',{file_path:loop,content:css})]]},
    ...['ValueError','OSError','TypeError','KeyError','RuntimeError'].map(readFault => ({style:'named',readFault,rows:[[call('Read',{file_path:'01-test'})],[write(css)]]})),
    ...['ValueError','OSError','TypeError','RuntimeError'].map(fault => ({style:'named',fault,rows:[[write(css)],[write(css)],[write(css)]]})),
    ...['\x1c', '\x85', '\ufeff'].map(content => ({style:'named',rows:[[write(content)],[write(css)]]})),
    ...['\r', '\x85', '\u2028', '\ufeff'].map(separator => ({rows:[[call('Write',{file_path:pickTarget,content:'01-test'+separator})],...(separator === '\ufeff' ? [[call('Write',{file_path:pickTarget,content:'01-test'})]] : []),[write(css)]]})),
    { style: 'named', rows: [...Array.from({ length: 15 }, () => [call('Read', { file_path: '01-test' })]), [write(css)]] },
    { rows: [[call('Write', { file_path: pickTarget, content: '01-test' })], [write(css)]] },
    { original: css, rows: [], vision: false },
    { original: 'bad', rows: [] },
    { style: 'named', rows: [], vision: false },
  ];
  const expected = JSON.parse(execFileSync('python', ['-c', `
import json,sys,io,contextlib
from pathlib import Path
from types import SimpleNamespace as NS
from core import director,planner,llm,skills
skills.FONT_FLOOR = ${JSON.stringify(guidance.FONT_FLOOR)}
payload=json.load(sys.stdin);root=Path(payload['root']);result=[]
llm.usage_of=lambda r:(0,0,0);llm.text_of=lambda r:''
llm.replay_item=lambda x:vars(x);llm.ModelRuntime.replay=lambda r:r.output
c=director.style_catalog;c.rows=lambda:[['01-test','Test']];c.match=lambda s:'01-test' if s=='named' else None
c.read_path=lambda key:Path('/fixture.png');c.selection_inputs=lambda:('index',[])
c.selected_inputs=lambda ids:('detail',[]);c.inputs=lambda s:('index',[])
c.detail=lambda value:('detail',[]);c.identify=lambda value:'01-test'
director._images=lambda refs,**kw:[]
t=director.theme_io;t.check_options=lambda *a:None;t.references=lambda css:[]
t.reference_images=lambda *a:[];director.font_library.prepare=lambda *a:[]
director.gates=lambda css,**kw:['gate failed'] if css=='bad' else []
for scenario in payload['scenarios']:
 count=[0];history=[];published=[];trace_inputs=[]
 def gates(css,**kw):
  if scenario.get('fault'):raise getattr(__import__('builtins'),scenario['fault'])('fixture fault')
  return ['gate failed'] if css=='bad' else []
 director.gates=gates
 def detail(value):
  if scenario.get('readFault'):raise getattr(__import__('builtins'),scenario['readFault'])('fixture fault')
  return ('detail',[])
 c.detail=detail
 def respond(identity,hist,specs,effort,**kw):
  history[:]=list(hist);row=scenario['rows'][count[0]];count[0]+=1
  return NS(id=str(count[0]),output=[NS(type='function_call',name=x['name'],arguments=x['arguments'],call_id=f'{count[0]}-{i}') for i,x in enumerate(row)])
 llm.respond=respond;llm.default_runtime=lambda:NS(profile=NS(vision_input=scenario.get('vision',True)))
 t.import_input=lambda *a,**kw:(scenario.get('original',''),[])
 t.publish=lambda css,out:published.append(css)
 run=NS(root=root,query='主题',audience='读者',minutes=45,scenario='',canvas=(1600,900),prompts=skills.PROMPTS,style_director=True,style=scenario.get('style'),template=None,log=NS(add=lambda *a:trace_inputs.append(a[0][0]['text'])))
 run.prompt=lambda name,**kw:planner.Run.prompt(run,name,**kw)
 try:
  with contextlib.redirect_stdout(io.StringIO()):final=director.direct(run,'low')
  item={'final':final}
 except Exception as e:item={'error':{'name':type(e).__name__,'message':str(e)}}
 item.update(calls=count[0],published=published,traceInputs=trace_inputs,feedback=[x['output'] for x in history if x.get('type')=='function_call_output'],userTexts=[x['content'] if isinstance(x['content'],str) else [b['text'] for b in x['content'] if b['type']=='input_text'] for x in history if x.get('role')=='user'])
 result.append(item)
print(json.dumps(result,ensure_ascii=False))
`], { cwd: pythonRoot, input: JSON.stringify({ root, scenarios }), encoding: 'utf8' }));
  try {
    for (const [index, raw] of scenarios.entries()) {
      const scenario = raw as { style?: string; readFault?: string; fault?: string; original?: string; vision?: boolean; rows: Array<Array<{ name: string; arguments: string }>> };
      let count = 0;
      let history: import('../src/adapters/models/chat-model.js').ChatMessage[] = [];
      const published: string[] = [];
      const traceInputs: string[] = [];
      let result: Record<string, unknown>;
      try {
        const final = await direct({ root, query: '主题', audience: '读者', minutes: 45, prompts: path.join(pythonRoot, 'prompts'), ...(scenario.style ? { style: scenario.style } : {}) }, {
          progress: () => { throw new Error('observer must not alter directing'); },
          model: { async respond(messages) {
            assert.equal(String(messages[0]!.content).split(guidance.visualSlopBlock()).length, 2, 'Director receives shared visual rules once');
            history = structuredClone(messages);
            const row = scenario.rows[count++]!;
            return { id: String(count), inputTokens: 0, outputTokens: 0, message: { role: 'assistant', content: '', tool_calls: row.map((call, index) => ({ id: `${count}-${index}`, type: 'function', function: call })) } };
          } },
          visionInput: scenario.vision ?? true, trace: record => { traceInputs.push(workflowTraceText(record)); },
          catalog: {
            rows: () => [['01-test', 'Test']], match: style => style === 'named' ? '01-test' : undefined,
            identify: () => '01-test', readPath: () => '/fixture.png',
            selectionInputs: async () => ({ text: 'index', images: [] }), selectedInputs: async () => ({ text: 'detail', images: [] }),
            inputs: async () => ({ text: 'index', images: [] }), detail: async () => { if (scenario.readFault) throw Object.assign(new Error(scenario.readFault === 'KeyError' ? "'fixture fault'" : 'fixture fault'),{name:scenario.readFault}); return {text:'detail',images:[]}; },
          },
          images: async () => [], media: async () => { throw new Error('unexpected media call'); },
          theme: {
            checkOptions: () => {}, importInput: async () => ({ css: scenario.original ?? '', shots: [] }), importedAssets: async () => [],
            prepareFonts: async () => [], referenceImages: async () => [], references: () => [],
            gates: async candidate => { if (scenario.fault) throw Object.assign(new Error('fixture fault'),{name:scenario.fault}); return candidate === 'bad' ? ['gate failed'] : []; }, publish: async css => { published.push(css); },
          },
        }, undefined, 3); // Python oracle stops at 3; production allows 10
        result = { final };
      } catch (error) { result = { error: {name:(error as Error).name,message:(error as Error).message} }; }
      Object.assign(result, { calls: count, published, traceInputs, feedback: history.filter(message => message.role === 'tool').map(message => message.content), userTexts: history.filter(message => message.role === 'user').map(message => typeof message.content === 'string' ? message.content : message.content?.filter(block => block.type === 'text').map(block => block.type === 'text' ? block.text : '')) });
      assert.deepEqual(result, expected[index], `Director scenario ${index}`);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('CLI Builder switches match Python defaults and last boolean switch wins', async () => {
  const { buildArguments } = await import('../src/cli/main.js');
  const cases = [[], ['--samples', 'none'], ['--notes', 'notes', '--sample-shots', '--visual-focus', '--uniform', '--profile', 'fixture', '--concurrency', '3'],
    ['--samples', 'none', '--no-aux-samples', '--aux-samples'], ['--aux-samples', '--no-aux-samples'], ...['1_0', ' 3 ', '+٤', '０２', '0', '-1'].map(value => ['--concurrency', value])];
  const expected = JSON.parse(execFileSync('python', ['-c', `
import json,sys
from core.builder import parse_args
print(json.dumps([vars(parse_args(['--label','fixture']+args)) for args in json.load(sys.stdin)]))
`], { cwd: pythonRoot, input: JSON.stringify(cases), encoding: 'utf8' }));
  for (const [index, args] of cases.entries()) {
    const { pipeline, request } = buildArguments(['--query', 'fixture', ...args]);
    const actual = pipeline.build!, reference = expected[index];
    assert.deepEqual({samples:actual.samples,notes:actual.notes,sample_shots:actual.sampleShots,visual_focus:actual.visualFocus,aux_samples:actual.includeAux,concurrency:actual.concurrency,uniform:pipeline.uniform,profile:pipeline.profile??null},
      Object.fromEntries(['samples','notes','sample_shots','visual_focus','aux_samples','concurrency','uniform','profile'].map(key=>[key,reference[key]])));
    assert.equal(request.minutes,90); assert.equal(request.scenario,''); assert.equal(request.style,'');
  }
  const { createRunRequestSchema } = await import('../src/protocol/index.js');
  const inputs = [{ query: '' }, { query: '-1', minutes: -1, audience: '-.5', scenario: '-0.25', style: '-2' }, { query: '  原样主题  ', minutes: 999, audience: ' 学生 ', scenario: ' 场景 ', style: ' 浅色 ' },
    { query: '讲义'.repeat(6000), minutes: 0, audience: '学'.repeat(2100), style: '风'.repeat(2100) }];
  const original = JSON.parse(execFileSync('python', ['-c', `
import json,sys,argparse
from core import planner
rows=[]
class Captured(Exception):pass
original=argparse.ArgumentParser.parse_args
def capture(self,*unused,**kwargs):raise Captured(vars(original(self,args)))
argparse.ArgumentParser.parse_args=capture
for item in json.load(sys.stdin):
 args=['--label','fixture']
 for key,value in item.items():args.extend(['--'+key,str(value)])
 try:planner.main()
 except Captured as caught:
  parsed=caught.args[0];rows.append({key:parsed[key] for key in ['query','minutes','audience','scenario','style']})
print(json.dumps(rows,ensure_ascii=False))
`], { cwd: pythonRoot, input: JSON.stringify(inputs), encoding: 'utf8' }));
  inputs.forEach((input, index) => {
    const args = Object.entries(input).flatMap(([key, value]) => ['--' + key, String(value)]);
    const expected = { ...original[index], style: original[index].style ?? '' };
    assert.deepEqual(createRunRequestSchema.parse(input), expected);
    assert.deepEqual(buildArguments(args).request, expected);
  });
  // The Director is the only theme route now; --no-style-director cases have no TS counterpart.
  const styleCases = [[], ['--style', ''], ['--style='], ['--style', '  '], ['--style', 'blue'], ['--style', '\x1c'], ['--style', '\x85'], ['--style', '\ufeff'],
    ['--template', '']];
  const styleOutcomes = JSON.parse(execFileSync('python', ['-c', `
import argparse,json,sys
from pathlib import Path
from core.theme import check_options
parser=argparse.ArgumentParser()
parser.add_argument('--style');parser.add_argument('--template',type=Path)
parser.add_argument('--style-director',action=argparse.BooleanOptionalAction,default=True)
rows=[]
for args in json.load(sys.stdin):
 n=parser.parse_args(args)
 try:check_options(n.template,n.style,n.style_director);rows.append(None)
 except ValueError as exc:rows.append(str(exc))
print(json.dumps(rows))
`], { cwd: pythonRoot, input: JSON.stringify(styleCases), encoding: 'utf8' }));
  for (const [index, args] of styleCases.entries()) for (const stage of ['plan', 'build'] as const) {
    let error: string | null = null;
    try { buildArguments(['--query', 'fixture', ...(stage === 'plan' ? ['--label', 'fixture'] : []), ...args], stage); }
    catch (caught) { error = (caught as Error).message; }
    assert.equal(error, styleOutcomes[index], `${stage}: ${JSON.stringify(args)}`);
  }
  assert.equal(buildArguments(['--query', 'fixture', '--template', '']).pipeline.template, process.cwd());
  assert.equal(buildArguments(['-q', '-1', '--minutes=-1']).request.query, '-1');
  const integerForms = ['1_000', ' 45 ', '+٤٥', '００７', '-٤٥', '-0', '\u008590\u0085'];
  const integers = JSON.parse(execFileSync('python', ['-c', 'import json,sys;print(json.dumps([int(value) for value in json.load(sys.stdin)]))'], { input: JSON.stringify(integerForms), encoding: 'utf8' }));
  integerForms.forEach((value,index) => assert.equal(buildArguments(['--query','fixture','--minutes',value]).request.minutes, integers[index]));

  const integerBounds=['9007199254740992','10000000000000000','-10000000000000000','0'.repeat(4300),'0'.repeat(4301),'\x1c12','-００'];
  const argumentOracle=JSON.parse(execFileSync('python',['-c',`
import argparse,json,sys,contextlib,io
parser=argparse.ArgumentParser();parser.add_argument('--value',type=int)
rows=[]
for value in json.load(sys.stdin):
 try:
  with contextlib.redirect_stderr(io.StringIO()):n=parser.parse_args(['--value='+value])
  rows.append({'value':n.value})
 except SystemExit:rows.append({'rejected':True})
print(json.dumps(rows))
`],{input:JSON.stringify(integerBounds),encoding:'utf8'}));
  for(const flag of ['minutes','concurrency']) integerBounds.forEach((value,index)=>{
    let actual;try{const result=buildArguments(['--query','x','--'+flag+'='+value]);actual={value:flag==='minutes'?result.request.minutes:result.pipeline.build!.concurrency};}catch{actual={rejected:true};}
    assert.deepEqual(actual,argumentOracle[index],flag+' integer boundary');
  });
  for (const args of [['--notes','invalid'],['--samples','full'],['--minutes',''],['--minutes','1.0'],['--minutes','0x10'],['--minutes','1e2'],['--concurrency','2.5']]) assert.throws(()=>buildArguments(['--query','x',...args]));
});

test('all configured model profiles and workflow overrides match Python', async () => {
  const api = await import('../src/index.js');
  const runtime = await import('../src/adapters/models/runtime.js');
  const baseline = await import('../src/core/baseline-pipeline.js');
  assert.equal(api.ModelRuntime, runtime.ModelRuntime);
  assert.equal(api.workflowModels, runtime.workflowModels);
  assert.equal(api.createModelPipeline, baseline.createBaselinePipeline);
  for (const obsolete of ['runAgent', 'ChatModel', 'modelFromEnvironment']) assert.equal(obsolete in api, false);

  const profiles = await import('../src/adapters/models/profiles.js');
  const cfg = profiles.loadConfig();
  const expected = JSON.parse(execFileSync('python', ['-c', `
import json
from dataclasses import asdict
from core import llm,builder
cfg=llm.config();default=llm.resolve_builder_profile(cfg)
print(json.dumps({'default':asdict(llm._default_model_profile(cfg)), 'profiles':{key:asdict(llm.resolve_builder_profile(cfg,key)) for key in cfg['builder']['profiles']},'workflows':{key:asdict(rt.profile) for key,rt in builder.workflow_runtimes(cfg,default).items()},'uniform':{key:asdict(rt.profile) for key,rt in builder.workflow_runtimes(cfg,default,uniform=True).items()}},ensure_ascii=False))
`], { cwd: pythonRoot, encoding: 'utf8' }));
  assert.deepEqual(profiles.defaultModelProfile(cfg), expected.default);
  for (const id of Object.keys(cfg.builder.profiles)) assert.deepEqual(profiles.resolveBuilderProfile(cfg, id), expected.profiles[id]);
  const main = profiles.resolveBuilderProfile(cfg);
  assert.deepEqual(profiles.workflowProfiles(cfg, main), expected.workflows);
  assert.deepEqual(profiles.workflowProfiles(cfg, main, true), expected.uniform);
  const flagValues = [[], {}, false, null, 0, '', ['x'], { x: 0 }, 'false', true];
  const flags = JSON.parse(execFileSync('python', ['-c', `
import copy,json,sys
from dataclasses import asdict
from core import llm
rows=[]
for value in json.load(sys.stdin):
 cfg=copy.deepcopy(llm.config());raw=cfg['builder']['profiles'][cfg['builder']['default_profile']]
 for target in [cfg['model'],raw]:target.update(vision_input=value,replay_reasoning=value)
 rows.append([asdict(llm._default_model_profile(cfg)),asdict(llm.resolve_builder_profile(cfg))])
print(json.dumps(rows))
`], { cwd: pythonRoot, input: JSON.stringify(flagValues), encoding: 'utf8' }));
  flagValues.forEach((value, index) => {
    const configured = structuredClone(cfg);
    for (const target of [configured.model, configured.builder.profiles[configured.builder.default_profile]]) Object.assign(target, { vision_input: value, replay_reasoning: value });
    assert.deepEqual([profiles.defaultModelProfile(configured), profiles.resolveBuilderProfile(configured)], flags[index]);
  });

  const numericValues: unknown[] = [[], {}, 0, '', true, false, null, '1_280', '٤٥', ' 90 ', '1.0', '0x10', 'bad', 1.9, ['x'], { x: 1 }];
  const optionValues: unknown[] = [{ temperature: 0.2 }, [['temperature', 0.2], ['temperature', 0.5]], ['ab'], [], {}, null, false, 0, true, 1, 1.5, 'abc', [1], [['x']], [['x', 1, 2]], [[[], 1]], [[{}, 1]], [['__proto__', { preserved: true }]]];
  const stringValues = [null, true, false, [], {}, ['x', null, true], { x: false }, "a'b", 'a"b', "a'\"b", '\n', 1.5];
  const profileInputs = [...stringValues.flatMap(value => [{ name: value, model: value, api_key_env: value, reasoning_effort: value }, { adapter: value }]),...numericValues.map(value => ({ http_timeout_sec: value, max_output_tokens: value })), ...optionValues.map(value => ({ request_options: value })), ...[[], {}].map(value => ({ adapter: "", wire_api: value }))];
  const numericOracle = JSON.parse(execFileSync('python', ['-c', `
import copy,json,sys
from dataclasses import asdict
from core import llm
out=[]
for value in json.load(sys.stdin):
 cfg=copy.deepcopy(llm.config());raw=cfg['builder']['profiles'][cfg['builder']['default_profile']]
 for target in [cfg['model'],raw]:target.update(value)
 row=[]
 for call in [llm._default_model_profile,llm.resolve_builder_profile]:
  try:row.append(asdict(call(cfg)))
  except Exception as e:row.append({'name':type(e).__name__,'message':str(e)})
 out.append(row)
print(json.dumps(out))
`], { cwd: pythonRoot, input: JSON.stringify(profileInputs), encoding: 'utf8' }));
  profileInputs.forEach((value,index) => {
    const configured = structuredClone(cfg);
    for (const target of [configured.model, configured.builder.profiles[configured.builder.default_profile]]) Object.assign(target, value);
    const actual = [profiles.defaultModelProfile, profiles.resolveBuilderProfile].map(call => {
      try { return call(configured); } catch (error) { return { name: (error as Error).name, message: (error as Error).message }; }
    });
    assert.deepEqual(actual, numericOracle[index], `profile values ${JSON.stringify(value)}`);
  });

  const defaultConfigs = [null, {}, { builder: {} }, ...[null, false, [], 'x', 1, 1.5].map(model => ({ model })), ...['name', 'base_url', 'api_key_env'].map(key => {
    const configured = structuredClone(cfg); delete configured.model[key]; return configured;
  })];
  const defaultOracle = JSON.parse(execFileSync('python', ['-c', `
import json,sys
from dataclasses import asdict
from core import llm
out=[]
for cfg in json.load(sys.stdin):
 try:out.append(asdict(llm._default_model_profile(cfg)))
 except Exception as e:out.append({'name':type(e).__name__,'message':str(e)})
print(json.dumps(out))
`], { cwd: pythonRoot, input: JSON.stringify(defaultConfigs), encoding: 'utf8' }));
  defaultConfigs.forEach((configured,index) => {
    let actual; try { actual = profiles.defaultModelProfile(configured as any); } catch (error) { actual = { name: (error as Error).name, message: (error as Error).message }; }
    assert.deepEqual(actual, defaultOracle[index], `default config ${index}`);
  });

  const builderBlocks = [null, false, 0, '', [], {}, true, 1, 1.5, 'x', ['x']];
  const builderBlockOracle = JSON.parse(execFileSync('python', ['-c', `
import copy,json,sys
from dataclasses import asdict
from types import SimpleNamespace
from unittest.mock import patch
from core import llm,builder
cfg=llm.config();default=llm.resolve_builder_profile(cfg);out=[]
with patch.object(llm,'ModelRuntime',lambda profile:SimpleNamespace(profile=profile)):
 for value in json.load(sys.stdin):
  current=copy.deepcopy(cfg);current['builder']=value;row=[]
  for fn in [lambda:asdict(llm.resolve_builder_profile(current)),lambda:{k:asdict(v.profile) for k,v in builder.workflow_runtimes(current,default).items()},lambda:{k:asdict(v.profile) for k,v in builder.workflow_runtimes(current,default,uniform=True).items()}]:
   try:row.append(fn())
   except Exception as e:row.append({'name':type(e).__name__,'message':str(e)})
  out.append(row)
print(json.dumps(out))
`], { cwd: pythonRoot, input: JSON.stringify(builderBlocks), encoding: 'utf8' }));
  builderBlocks.forEach((builder, index) => {
    const current = { ...cfg, builder };
    const actual = [() => profiles.resolveBuilderProfile(current), () => profiles.workflowProfiles(current, main), () => profiles.workflowProfiles(current, main, true)].map(fn => {
      try { return fn(); } catch (error) { return { name: (error as Error).name, message: (error as Error).message }; }
    });
    assert.deepEqual(actual, builderBlockOracle[index], `builder block ${index}`);
  });

  const overrideValues = [null, false, 0, '', [], {}, true, 1, 1.5, 'build-page', ['build-page'], ['z', 'a', 'z'], ['𐀀', '\ue000'], [3, 1, 3], [true, 1, false, 0], [null], [['build-page']], [{ x: 1 }], { 'build-page': [] }, { 'build-code': {} }];
  const overrideOracle = JSON.parse(execFileSync('python', ['-c', `
import copy,json,sys
from dataclasses import asdict
from types import SimpleNamespace
from unittest.mock import patch
from core import llm,builder
cfg=llm.config();default=llm.resolve_builder_profile(cfg);out=[]
with patch.object(llm,'ModelRuntime',lambda profile:SimpleNamespace(profile=profile)):
 for value in json.load(sys.stdin):
  current=copy.deepcopy(cfg);current['builder']['workflow_profiles']=value;row=[]
  for uniform in (False,True):
   try:row.append({k:asdict(v.profile) for k,v in builder.workflow_runtimes(current,default,uniform=uniform).items()})
   except Exception as e:row.append({'name':type(e).__name__,'message':str(e)})
  out.append(row)
print(json.dumps(out))
`], { cwd: pythonRoot, input: JSON.stringify(overrideValues), encoding: 'utf8' }));
  overrideValues.forEach((value, index) => {
    const current = structuredClone(cfg); current.builder.workflow_profiles = value;
    const actual = [false, true].map(uniform => {
      try { return profiles.workflowProfiles(current, main, uniform); }
      catch (error) { return { name: (error as Error).name, message: (error as Error).message }; }
    });
    assert.deepEqual(actual, overrideOracle[index], `workflow override value ${index}`);
  });

  const defaultBlockCases = builderBlocks.flatMap(model => [0, 1, 2, 3].map(mask => ({ model, mask })));
  const defaultBlockOracle = JSON.parse(execFileSync('python', ['-c', `
import copy,json,sys
from dataclasses import asdict
from core import llm
cfg=llm.config();out=[]
for case in json.load(sys.stdin):
 current=copy.deepcopy(cfg);current['model']=case['model'];raw=current['builder']['profiles'][current['builder']['default_profile']]
 for key,bit,value in [('http_timeout_sec',1,23),('max_output_tokens',2,456)]:
  raw.pop(key,None)
  if case['mask']&bit:raw[key]=value
 try:out.append(asdict(llm.resolve_builder_profile(current)))
 except Exception as e:out.append({'name':type(e).__name__,'message':str(e)})
print(json.dumps(out))
`], { cwd: pythonRoot, input: JSON.stringify(defaultBlockCases), encoding: 'utf8' }));
  defaultBlockCases.forEach(({ model, mask }, index) => {
    const current = structuredClone(cfg); current.model = model;
    const raw = current.builder.profiles[current.builder.default_profile];
    delete raw.http_timeout_sec; delete raw.max_output_tokens;
    if (mask & 1) raw.http_timeout_sec = 23;
    if (mask & 2) raw.max_output_tokens = 456;
    let actual;
    try { actual = profiles.resolveBuilderProfile(current); }
    catch (error) { actual = { name: (error as Error).name, message: (error as Error).message }; }
    assert.deepEqual(actual, defaultBlockOracle[index], `default fallback ${index}`);
  });

  const profileRecord = cfg.builder.profiles[cfg.builder.default_profile];
  const rawProfiles = [Object.entries(profileRecord), [...Object.entries(profileRecord), ['adapter', 'messages']], [], null, true, [1], [['model']], [['model', 'x']], { ...profileRecord, adapter: 'unknown' }, { ...profileRecord, base_url: '', base_url_env: '' }, ...[[], {}, false, 0].map(value => ({ ...profileRecord, base_url: value, base_url_env: '' }))];
  const rawOracle = JSON.parse(execFileSync('python', ['-c', `
import copy,json,sys
from dataclasses import asdict
from core import llm
out=[]
for value in json.load(sys.stdin):
 cfg=copy.deepcopy(llm.config());cfg['builder']['profiles'][cfg['builder']['default_profile']]=value
 try:out.append(asdict(llm.resolve_builder_profile(cfg)))
 except Exception as e:out.append({'name':type(e).__name__,'message':str(e)})
print(json.dumps(out))
`], { cwd: pythonRoot, input: JSON.stringify(rawProfiles), encoding: 'utf8' }));
  rawProfiles.forEach((value,index) => {
    const configured = structuredClone(cfg); configured.builder.profiles[configured.builder.default_profile] = value;
    let actual; try { actual = profiles.resolveBuilderProfile(configured); } catch (error) { actual = { name: (error as Error).name, message: (error as Error).message }; }
    assert.deepEqual(actual, rawOracle[index], `raw profile ${index}`);
  });

  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const root = await mkdtemp(path.join(tmpdir(), 'notale-config-yaml-'));
  try {
    const source = `model:
  name: fixture
  base_url: https://fixture.invalid/v1
  api_key_env: FIXTURE_KEY
  wire_api: chat
  vision_input: off
  replay_reasoning: no
  http_timeout_sec: 012
  max_output_tokens: 1_280
  max_output_tokens: 2_560
scalars: [yes, YES, Yes, no, No, NO, on, ON, off, OFF, true, TRUE, false, FALSE, y, N, YEs, 0o12]
float_scalars: [1e3, 1e+3, 1.0e3, 1.0e+3, 1.0e-3, .1, +.1, -.1, ., +., -., 1., 1_0.5, .1e3, .1e+3, 1:20.5, 1:60.5]
defaults: &defaults {vision_input: on, reasoning_effort: low}
overrides: {<<: *defaults, vision_input: off}
repeated: [${Array(110).fill('*defaults').join(',')}]
`;
    const file = path.join(root, 'config.yaml'); await writeFile(file, source);
    const original = JSON.parse(execFileSync('python', ['-c', `
import json,sys,yaml
from dataclasses import asdict
from core import llm
cfg=yaml.safe_load(sys.stdin.read());print(json.dumps({'config':cfg,'profile':asdict(llm._default_model_profile(cfg))}))
`], { cwd: pythonRoot, input: source, encoding: 'utf8' }));
    const loaded = profiles.loadConfig(file);
    assert.deepEqual(loaded, original.config);
    assert.equal(loaded.repeated[0], loaded.defaults);
    assert.deepEqual(profiles.defaultModelProfile(loaded), original.profile);
    for (const version of ['1.1', '1.2']) {
      const declared = `%YAML ${version}\n---\n${source}`;
      await writeFile(file, declared);
      const expected = JSON.parse(execFileSync('python', ['-c', 'import json,sys,yaml;print(json.dumps(yaml.safe_load(sys.stdin.read())))'], { input: declared, encoding: 'utf8' }));
      const configured = profiles.loadConfig(file);
      assert.deepEqual(configured, expected);
      assert.deepEqual(profiles.defaultModelProfile(configured), original.profile);
    }

    const numericSource = `model: &model
  name: 1.0
  model: 2.0
  max_output_tokens: 9007199254740993
  adapter: chat
  base_url: 3.0
  api_key_env: 4.0
  vision_input: true
  reasoning_effort: [1.0, 9007199254740993, -0.0]
  request_options: &options {"10": ten, "2": two, "0": zero, float: 1.0, int: 1, big: 9007199254740993, hex: 0x20000000000001, nested: [1.0, 2, -0.0]}
builder:
  default_profile: fixture
  profiles:
    fixture: {<<: *model}
repeated: [*options, *options]
left: &left {priority: first, a: left}
right: &right {priority: second, b: right}
mid: &mid {before: true, <<: [*left, *right], after: false}
merge_cases:
  - {<<: [*left, *right]}
  - {priority: explicit, <<: [*left, *right]}
  - {<<: [*left, *right], priority: explicit}
  - {<<: *left, <<: *right}
  - {priority: explicit, <<: *left, <<: *right}
  - {<<: *left, priority: explicit, <<: *right}
  - {<<: [*left, *right], <<: {priority: last}}
  - {<<: *mid}
  - {"9": nine, <<: *options, "3": three}
self_before: &self_before {<<: *self_before, a: 1}
self_after: &self_after {a: 1, <<: *self_after}
`;
    await writeFile(file, numericSource);
    const numberOracle = JSON.parse(execFileSync('python', ['-c', `
import json,sys,yaml
from dataclasses import asdict
from core import llm
cfg=yaml.safe_load(sys.stdin.read())
print(json.dumps({'profiles':[json.dumps(asdict(call(cfg)),ensure_ascii=False) for call in [llm._default_model_profile,llm.resolve_builder_profile]],'merges':cfg['merge_cases'], 'mergeText':json.dumps(cfg['merge_cases']), 'maxTokens':str(llm._default_model_profile(cfg).max_output_tokens), 'self':[cfg['self_before'],cfg['self_after']]}))
`], { cwd: pythonRoot, input: numericSource, encoding: 'utf8' }));
    const numericConfig = profiles.loadConfig(file);
    const { jsonText } = await import('../src/core/json.js');
    assert.equal(numericConfig.repeated[0], numericConfig.repeated[1]);
    assert.equal(numericConfig.repeated[0], numericConfig.model.request_options);
    assert.equal(numericConfig.builder.profiles.fixture.request_options, numericConfig.model.request_options);
    assert.deepEqual([profiles.defaultModelProfile(numericConfig), profiles.resolveBuilderProfile(numericConfig)].map(value => jsonText(value)), numberOracle.profiles);
    assert.deepEqual(numericConfig.merge_cases, numberOracle.merges);
    assert.equal(jsonText(numericConfig.merge_cases), numberOracle.mergeText);
    assert.deepEqual([numericConfig.self_before, numericConfig.self_after], numberOracle.self);
    const { ModelRuntime } = await import('../src/adapters/models/runtime.js');
    const { parsePythonJson, pythonNumberText } = await import('../src/core/json.js');
    for (const adapter of ['chat', 'messages', 'responses']) {
      let sentLimit = '';
      const candidate = new ModelRuntime({ ...profiles.defaultModelProfile(numericConfig), adapter, base_url: 'https://fixture.invalid', api_key_env: 'FIXTURE_KEY', request_options: {} }, {
        env: { FIXTURE_KEY: 'fake' }, fetch: async (_url, init) => {
          const sent = parsePythonJson(String(init?.body));
          const key = adapter === 'responses' ? 'max_output_tokens' : 'max_tokens';
          sentLimit = pythonNumberText(sent[key], sent, key);
          return new Response('{"choices":[{"message":{"content":"done"}}],"content":[],"output":[]}');
        },
      });
      await candidate.respondCanonical('', [], []);
      assert.equal(sentLimit, numberOracle.maxTokens);
    }


    await writeFile(file, Buffer.from([0x61, 0xff]));
    const decodingError = JSON.parse(execFileSync('python', ['-c', `
import json,sys
from pathlib import Path
try:Path(sys.argv[1]).read_text(encoding='utf-8')
except Exception as error:print(json.dumps({'name':type(error).__name__,'message':str(error)}))
`, file], { encoding: 'utf8' }));
    assert.throws(() => profiles.loadConfig(file), decodingError);
  } finally { await rm(root, { recursive: true, force: true }); }

});

test('Planner overrides match Python without mutating shared Builder configuration', async () => {
  const { loadConfig } = await import('../src/adapters/models/profiles.js');
  const { workflowModels } = await import('../src/adapters/models/runtime.js');
  const { buildArguments } = await import('../src/cli/main.js');
  const cfg=loadConfig(), before=JSON.stringify(cfg);
  const cases=[{model:'SONNET-fixture'}, {model:'opus-fixture',wire:'chat',effort:'high',baseUrl:'https://fixture.invalid/v1',keyEnv:'FIXTURE_KEY'}, {model:'other',wire:'responses'}];
  const expected=JSON.parse(execFileSync('python',['-c',`
import json,sys,io,contextlib,dataclasses
from core import llm
out=[]
for row in json.load(sys.stdin):
 llm._OVERRIDE.clear()
 with contextlib.redirect_stdout(io.StringIO()):
  llm.override(name=row.get('model'),wire_api=row.get('wire'),base_url=row.get('baseUrl'),api_key_env=row.get('keyEnv'))
 cfg=llm.config();profile=dataclasses.asdict(llm._default_model_profile(cfg))
 profile['reasoning_effort']=row.get('effort') or cfg['planner']['reasoning_effort'] or profile['reasoning_effort']
 out.append(profile)
print(json.dumps(out))
`],{cwd:pythonRoot,input:JSON.stringify(cases),encoding:'utf8'}));
  const base=workflowModels(cfg).builders;
  for(const [index,overrides] of cases.entries()) {
    const models=workflowModels(cfg,undefined,false,{},overrides);
    assert.deepEqual(models.planner.profile,expected[index]);
    assert.equal(models.director,models.planner);
    for(const name of Object.keys(base))assert.deepEqual(models.builders[name]!.profile,base[name]!.profile);
  }
  assert.equal(JSON.stringify(cfg),before);
  assert.throws(()=>buildArguments(['--query','x','--model','ignored']),/require the plan command/);
  assert.throws(()=>buildArguments(['--query','x','--label','x','--wire','invalid'],'plan'),/--wire/);
});

test('Planner assembly matches Python on baseline resources with current font configuration', async () => {
  const { deckPrompt } = await import('../src/core/planning.js');
  const reference = JSON.parse(execFileSync('python', ['-c', `
import json
from pathlib import Path
from types import SimpleNamespace as NS
from core import planner,skills
skills.FONT_FLOOR = ${JSON.stringify(guidance.FONT_FLOOR)}
out=[]
import sys
for focus in (True,False):
  run=NS(prompts=Path(sys.argv[1]),style_director=True)
  out.append(planner.Run.prompt(run,'deck',query='主题',minutes=45,audience='读者',scenario='（没写）',canvas_w=1600,canvas_h=900,css_path=Path('/fixture/pages/assets/theme.css'),pages_path=Path('/fixture/pages/plan/pages.md'),philosophy=skills.philosophy_block('deck'),page_skills=skills.page_skill_descriptions(),direction=skills.direction_block(),theme_bans=skills.theme_slop_block(),font_floor=skills.FONT_FLOOR,visual_focus=planner.VISUAL_FOCUS_SPEC if focus else ''))
print(json.dumps(out,ensure_ascii=False))
`, path.join(guidance.RESOURCES, 'prompts')], { cwd: pythonRoot, encoding: 'utf8' }));
  for (const [index, visualFocus] of [true, false].entries()) {
    assert.equal(deckPrompt({ root: '/fixture', query: '主题', minutes: 45, audience: '读者', visualFocus, workflowRoot: path.join(pythonRoot, 'skills') }), reference[index]);
  }
});

test('model wire bodies, opaque replay, usage and truncation match Python', async () => {
  const runtime = await import('../src/adapters/models/runtime.js');
  const bodies = ['low', 'medium', 'high', ' HIGH '].map(effort => ({
    model: 'fixture-model', instructions: 'system 原文', store: false, max_output_tokens: 128000, reasoning: { effort },
    tools: [{ type: 'function', name: 'Read', description: '读', parameters: { type: 'object', properties: {} } }],
    input: [
      { role: 'user', content: '问题' },
      { type: 'function_call', name: 'Read', arguments: '{"file_path":"a"}', call_id: 'c1' },
      { type: 'function_call', name: 'Read', arguments: 'bad-json', call_id: 'c2' },
      { type: 'function_call_output', call_id: 'c1', output: '结果一' },
      { type: 'function_call_output', call_id: 'c2', output: '结果二' },
      { role: 'user', content: [{ type: 'input_text', text: '本地参考' }, { type: 'input_image', image_url: 'data:image/png;base64,YQ==' }, { type: 'input_image', image_url: 'https://example.com/a.png' }] },
      { type: 'reasoning', id: 'r1', summary: [], status: 'completed' },
      { type: 'anthropic_assistant', content: [{ type: 'thinking', thinking: 'opaque', signature: 'signed' }, { type: 'text', text: '完成' }] },
      { type: 'chat_assistant', message: { role: 'assistant', content: null, reasoning_content: 'opaque', tool_calls: [{ id: 'c3', type: 'function', function: { name: 'Write', arguments: '{}' }, extra_content: { google: { thought_signature: 'signed' } } }] } },
    ],
  }));
  const chats = [false, true].flatMap(replay => [false, true].map(cached => ({ replay, want: 12, raw: { id: 'chat-id', object: 'chat.completion', created: 0, model: 'fixture-model', choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: '答案', reasoning_content: '推理', thinking: { opaque: 'block' }, tool_calls: [{ id: 'tool-id', type: 'function', function: { name: 'Read', arguments: '{}' }, extra_content: { google: { thought_signature: 'signature' } } }] } }], usage: { prompt_tokens: 100, completion_tokens: 12, total_tokens: 112, ...(cached ? { prompt_tokens_details: { cached_tokens: 70 } } : {}) } } })));
  const messages = [{ id: 'messages-id', stop_reason: 'max_tokens', content: [{ type: 'thinking', thinking: 'opaque', signature: 'sig' }, { type: 'text', text: '答案' }, { type: 'tool_use', id: 't1', name: 'Write', input: { content: '引号\" 和 , :', file_path: 'a' } }], usage: { input_tokens: 10, cache_read_input_tokens: 70, cache_creation_input_tokens: 20, output_tokens: 12 } }];
  const oracle = JSON.parse(execFileSync('python', ['-c', `
import json,sys
from core import llm
from openai.types.chat import ChatCompletion
p=json.load(sys.stdin)
def expose(r):
 return dict(id=r.id,output=[x.model_dump() for x in r.output],replay_items=llm.ModelRuntime.replay(r),usage=vars(r.usage),status=r.status,incomplete_details=vars(r.incomplete_details) if r.incomplete_details else None)
out=dict(chatBodies=[llm._chat_body(b) for b in p['bodies']],messagesBodies=[llm.to_messages(b) for b in p['bodies']],chats=[expose(llm._adapt_chat(ChatCompletion.model_validate(c['raw']),c['want'],replay_reasoning=c['replay'])) for c in p['chats']],messages=[expose(llm._adapt_messages(m)) for m in p['messages']])
print(json.dumps(out,ensure_ascii=False,default=vars))
`], { cwd: pythonRoot, input: JSON.stringify({ bodies, chats, messages }), encoding: 'utf8' }));
  bodies.forEach((body, i) => {
    assert.deepEqual(runtime.chatBody(body), oracle.chatBodies[i]);
    assert.deepEqual(runtime.toMessages(body), oracle.messagesBodies[i]);
  });
  chats.forEach((chat, i) => { const { raw: _raw, ...value } = runtime.adaptChat(chat.raw, chat.want, chat.replay); assert.deepEqual(value, oracle.chats[i]); });
  messages.forEach((message, i) => { const { raw: _raw, ...value } = runtime.adaptMessages(message); assert.deepEqual(value, oracle.messages[i]); });
  const { parsePythonJson, jsonText } = await import('../src/core/json.js');
  const boundaryRaw = ['\u0085', '\u001c', '\ufeff', ' ', '正文'].map(text => ({ content:[{type:'text',text}] }));
  const inputRaw = ['[]','{}','null','false','0','""','NaN','[0]'].map(input => '{"content":[{"type":"tool_use","id":"t","name":"Read","input":' + input + '}]}');
  const emptyBody = { model:'fixture',instructions:'',input:'',tools:[{type:'function',name:'Read',parameters:{}}],store:false,max_output_tokens:128000,reasoning:{effort:'\u0085high\u001c'} };
  const boundaryOracle = JSON.parse(execFileSync('python', ['-c', `
import json,sys,contextlib,io
from types import SimpleNamespace
from core import llm
p=json.load(sys.stdin)
def outputs(raw):return [x.model_dump() for x in llm._adapt_messages(raw).output]
chat=[]
with contextlib.redirect_stdout(io.StringIO()):
 for raw in p['text']:
  text=raw['content'][0]['text']
  result=llm._adapt_chat(SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=text),finish_reason='stop')]))
  chat.append([x.model_dump() for x in result.output])
print(json.dumps(dict(text=[outputs(x) for x in p['text']],chat=chat,args=[outputs(json.loads(x)) for x in p['input']],messages=llm.to_messages(p['body']),chatBody=llm._chat_body(p['body'])),ensure_ascii=False))
`], { cwd:pythonRoot,input:JSON.stringify({text:boundaryRaw,input:inputRaw,body:emptyBody}),encoding:'utf8' }));
  boundaryRaw.forEach((raw,index) => {
    assert.deepEqual(runtime.adaptMessages(raw).output,boundaryOracle.text[index]);
    assert.deepEqual(runtime.adaptChat({choices:[{message:{content:raw.content[0]!.text},finish_reason:'stop'}]}).output,boundaryOracle.chat[index]);
  });
  inputRaw.forEach((raw,index) => assert.deepEqual(runtime.adaptMessages(parsePythonJson(raw)).output,boundaryOracle.args[index]));
  assert.deepEqual(runtime.toMessages(emptyBody),boundaryOracle.messages);
  assert.deepEqual(runtime.chatBody(emptyBody),boundaryOracle.chatBody);
  const exactUsageSources = ['9007199254740993', '9'.repeat(400)];
  const exactUsageOracle = JSON.parse(execFileSync('python', ['-c', `
import json,sys
from types import SimpleNamespace as NS
from core import llm
rows=[]
for literal in json.load(sys.stdin):
 n=int(literal)
 chat=llm._adapt_chat(NS(choices=[NS(message=NS(content='done'),finish_reason='stop')],usage=NS(prompt_tokens=n,completion_tokens=n,prompt_tokens_details=NS(cached_tokens=n))),n)
 message=llm._adapt_messages({'content':[],'usage':{'input_tokens':n,'output_tokens':n,'cache_read_input_tokens':n,'cache_creation_input_tokens':n}})
 rows.append([{'usage':json.dumps(vars(r.usage),default=vars),'status':r.status} for r in [chat,message]])
print(json.dumps(rows))
`], { cwd: pythonRoot, input: JSON.stringify(exactUsageSources), encoding: 'utf8' }));
  exactUsageSources.forEach((literal, index) => {
    const chat = runtime.adaptChat(parsePythonJson(`{"choices":[{"message":{"content":"done"},"finish_reason":"stop"}],"usage":{"prompt_tokens":${literal},"completion_tokens":${literal},"prompt_tokens_details":{"cached_tokens":${literal}}}}`), BigInt(literal));
    const message = runtime.adaptMessages(parsePythonJson(`{"content":[],"usage":{"input_tokens":${literal},"output_tokens":${literal},"cache_read_input_tokens":${literal},"cache_creation_input_tokens":${literal}}}`));
    assert.deepEqual([chat,message].map(response => ({ usage: jsonText(response.usage), status: response.status })), exactUsageOracle[index]);
  });
  const { rememberKeyOrder } = await import('../src/core/json.js');
  const normalizedUsage = (text: string) => {
    const value = parsePythonJson(text);
    for (const row of [value, value.input_tokens_details, value.output_tokens_details]) rememberKeyOrder(row, Object.keys(row).sort());
    return jsonText(value);
  };
  const responseUsageSources = exactUsageSources.map(n => `{"id":"fixture","status":"completed","output":[],"usage":{"input_tokens":${n},"input_tokens_details":{"cached_tokens":${n},"cache_write_tokens":${n}},"output_tokens":${n},"output_tokens_details":{"reasoning_tokens":${n}},"total_tokens":${n},"diagnostic":1.0}}`);
  const responseUsageOracle = JSON.parse(execFileSync('python', ['-c', `
import json,sys,httpx
from dataclasses import replace
from openai import OpenAI
from core import llm
rows=[]
for body in json.load(sys.stdin):
 client=OpenAI(api_key='fixture',base_url='https://fixture.invalid/v1',max_retries=0,http_client=httpx.Client(transport=httpx.MockTransport(lambda request:httpx.Response(200,content=body,headers={'content-type':'application/json'}))))
 try:
  r=llm.ModelRuntime(replace(llm._default_model_profile(),adapter='responses'),sdk_client=client).complete({'model':'fixture','input':''})
  rows.append({'usage':json.dumps(r.usage.model_dump(),ensure_ascii=False),'write':str(llm.cache_write_of(r))})
 finally:client.close()
print(json.dumps(rows))
`], { cwd: pythonRoot, input: JSON.stringify(responseUsageSources), encoding: 'utf8' }));
  const { defaultModelProfile } = await import('../src/adapters/models/profiles.js');
  for (const [index, body] of responseUsageSources.entries()) {
    const model = new runtime.ModelRuntime({ ...defaultModelProfile(), adapter: 'responses', api_key_env: 'FIXTURE_KEY' }, { env: { FIXTURE_KEY: 'fake' }, fetch: async () => new Response(body) });
    const response = await model.respondCanonical('', [], []);
    assert.deepEqual({ usage: normalizedUsage(jsonText(response.usage)), write: String(runtime.cacheWriteOf(response)) }, { ...responseUsageOracle[index], usage: normalizedUsage(responseUsageOracle[index].usage) });
  }
  const usageInputs=['-0','-００',2.9,-2.9,true,false,[],{},[1],null,'1_000','１２','١٢',' 12 ','\x8512','\x1c12','1.0','1e3','0x10','',NaN,Infinity,-Infinity];
  const usageOracle=JSON.parse(execFileSync('python',['-c',`
import json,sys
from core import llm
out=[]
for value in json.load(sys.stdin):
 try:
  r=llm._adapt_messages({'usage':{'input_tokens':value,'output_tokens':value,'cache_read_input_tokens':value,'cache_creation_input_tokens':value}})
  out.append({'input':r.usage.input_tokens,'output':r.usage.output_tokens,'cached':r.usage.cache_read_input_tokens,'write':llm.cache_write_of(r)})
 except Exception as e:out.append({'name':type(e).__name__,'message':str(e)})
print(json.dumps(out))
`],{cwd:pythonRoot,input:jsonText(usageInputs),encoding:'utf8'}));
  const { pythonInteger } = await import('../src/core/json.js');
  const digitInputs=['0'.repeat(4300),'0'.repeat(4301),'9'.repeat(4301),'-'+'9'.repeat(4301),'１'.repeat(4301),Array(4301).fill('1').join('_')];
  const digitOracle=JSON.parse(execFileSync('python',['-c',`
import json,sys
assert sys.get_int_max_str_digits()==4300
out=[]
for value in json.load(sys.stdin):
 row=[]
 for convert in [int,json.loads]:
  try:row.append({'value':convert(value)})
  except Exception as e:row.append({'name':type(e).__name__,'message':str(e)})
 out.append(row)
print(json.dumps(out))
`],{input:JSON.stringify(digitInputs),encoding:'utf8'}));
  digitInputs.forEach((value,index)=>[pythonInteger,parsePythonJson].forEach((convert,kind)=>{
    let actual;try{actual={value:convert(value)};}catch(error){actual={name:(error as Error).name,message:(error as Error).message};}
    assert.deepEqual(actual,digitOracle[index][kind]);
  }));
  usageInputs.forEach((value,index)=>{
    let actual;
    try {const r=runtime.adaptMessages({usage:{input_tokens:value,output_tokens:value,cache_read_input_tokens:value,cache_creation_input_tokens:value}});actual={input:r.usage.input_tokens,output:r.usage.output_tokens,cached:r.usage.cache_read_input_tokens,write:runtime.cacheWriteOf(r)};}
    catch(error){actual={name:(error as Error).name,message:(error as Error).message};}
    assert.deepEqual(actual,usageOracle[index],`provider usage ${index}`);
  });
  const opaqueJson = '{"id":"opaque","content":[{"type":"tool_use","id":"c","name":"Read","10":1.0,"2":-0.0,"status":"done","nullable":null,"large":9007199254740993,"input":{"large":-9007199254740993,"10":1.0,"2":2,"values":[1.0,-0.0,1e-5]}}]}';
  const replayOracle = JSON.parse(execFileSync('python', ['-c', `
import json,sys
from core import llm
raw=json.load(sys.stdin)
replay=[llm.replay_item(item) for item in llm.ModelRuntime.replay(llm._adapt_messages(raw))]
body=dict(model='fixture',instructions='',input=replay,tools=[],store=False,max_output_tokens=128000,reasoning={'effort':'low'})
print(json.dumps([json.dumps(replay,ensure_ascii=False),json.dumps(llm.to_messages(body),ensure_ascii=False)]))
`], { cwd: pythonRoot, input: opaqueJson, encoding: 'utf8' }));
  const opaqueRaw = parsePythonJson(opaqueJson);
  const replayed = runtime.ModelRuntime.replay(runtime.adaptMessages(opaqueRaw));
  assert.equal(jsonText(replayed), replayOracle[0]);
  assert.equal(jsonText(runtime.toMessages({ model:'fixture',instructions:'',input:replayed,tools:[],store:false,max_output_tokens:128000,reasoning:{effort:'low'} })), replayOracle[1]);
  assert.equal(opaqueRaw.content[0].cache_control, undefined);
  assert.deepEqual(runtime.replayItem({ id: 'id', status: 'completed', a: null, nested: [{ status: 'done', signature: 'sig' }] }), { id: 'id', nested: [{ signature: 'sig' }] });
});

test('model HTTP retry ladder preserves requests and cancellation interrupts backoff', async () => {
  const { ModelRuntime, LADDER } = await import('../src/adapters/models/runtime.js');
  const { defaultModelProfile } = await import('../src/adapters/models/profiles.js');
  const profile = { ...defaultModelProfile(), api_key_env: 'FIXTURE_KEY', base_url: 'https://fixture.invalid', request_options: { custom: true } };
  const requestBodies: string[] = [], waits: number[] = [];
  const responses = [new Response('service unavailable', { status: 503 }), new Response('Error doing the fallback', { status: 400 }), new Response(JSON.stringify({ id: 'done', choices: [{ message: { role: 'assistant', content: 'done' }, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 2 } }))];
  const model = new ModelRuntime(profile, { env: { FIXTURE_KEY: 'fake' }, random: () => 0.5,
    fetch: async (url, init) => { assert.equal(url, 'https://fixture.invalid/v1/chat/completions'); requestBodies.push(String(init!.body)); return responses.shift()!; },
    wait: async ms => { waits.push(ms); },
  });
  await model.respondCanonical('system', [{ role: 'user', content: 'task' }], []);
  assert.deepEqual(waits, [5000, 15000]);
  assert.equal(new Set(requestBodies).size, 1);
  assert.equal(JSON.parse(requestBodies[0]!).max_tokens, 128000);
  assert.equal(JSON.parse(requestBodies[0]!).custom, true);
  let calls = 0;
  const noRetry = new ModelRuntime(profile, { env: { FIXTURE_KEY: 'fake' }, fetch: async () => { calls++; return new Response('invalid schema', { status: 400 }); }, wait: async () => { throw new Error('unexpected retry'); } });
  await assert.rejects(noRetry.respondCanonical('', [], []), /invalid schema/);
  assert.equal(calls, 1);
  calls = 0; waits.length = 0;
  const exhausted = new ModelRuntime(profile, { env: { FIXTURE_KEY: 'fake' }, random: () => 0.5, fetch: async () => { calls++; return new Response('busy', { status: 429 }); }, wait: async ms => { waits.push(ms); } });
  await assert.rejects(exhausted.respondCanonical('', [], []), /busy/);
  assert.equal(calls, 9);
  assert.deepEqual(waits, LADDER.map(seconds => seconds * 1000));
  calls = 0;
  const controller = new AbortController();
  const cancelled = new ModelRuntime(profile, { env: { FIXTURE_KEY: 'fake' }, fetch: async () => { calls++; return new Response('busy', { status: 503 }); }, wait: async () => { controller.abort(new Error('cancelled')); } });
  await assert.rejects(cancelled.respondCanonical('', [], [], { signal: controller.signal }), /cancelled/);
  assert.equal(calls, 1);
  const errorBodies = ['x'.repeat(700) + ' error doing the fallback',  '中'.repeat(210) + ' no available channel', String.raw`{"error":{"message":"\u006eo available channel"}}`,
    String.raw`{"error":{"message":"no available\u0020channel"}}`, String.raw`{"error":{"message":"invalid schema"}}`];
  errorBodies.push('\x1c\u0085' + errorBodies[3] + '\u2028\x1f');
  const encodedErrorBodies = errorBodies.map(detail => Buffer.from(detail));
  encodedErrorBodies.push(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(errorBodies[3]!)]));
  for (const detail of ['{"error":{"message":"no available channel"}}', '{"error":{"message":"invalid schema"}}']) {
    encodedErrorBodies.push(Buffer.from(detail, 'utf16le'));
    encodedErrorBodies.push(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(detail, 'utf16le')]));
    const utf32 = Buffer.alloc(detail.length * 4);
    Array.from(detail).forEach((char, index) => utf32.writeUInt32BE(char.codePointAt(0)!, index * 4));
    encodedErrorBodies.push(utf32);
  }
  const errorFixtures = encodedErrorBodies.map(detail => ({ detail, contentType: 'application/json' }));
  for (const charset of ['utf-16le', 'UTF-16', 'utf-8-sig', 'invalid-encoding']) {
    const detail = charset.toLowerCase().startsWith('utf-16') ? Buffer.concat([...(charset === 'UTF-16' ? [Buffer.from([0xff, 0xfe])] : []), Buffer.from(errorBodies[3]!, 'utf16le')]) : Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(errorBodies[3]!)]);
    errorFixtures.push({ detail, contentType: `application/json; charset="${charset}"` });
  }
  errorFixtures.push({ detail: Buffer.from(errorBodies[3]!, 'utf16le'), contentType: 'application/json; charset=utf-16' });
  for (const contentType of [
    'application/json; note=";charset=ascii"; charset=utf-16le',
    'application/json; charset="utf-16le"; charset=ascii',
    'application/json; charset=ascii; charset="utf-16le"',
    'application/json; note="semi;colon"; CHARSET="utf-16le"',
  ]) errorFixtures.push({ detail: Buffer.from(errorBodies[3]!, 'utf16le'), contentType });

  for (const little of [false, true]) {
    const detail = Buffer.alloc(errorBodies[3]!.length * 4);
    Array.from(errorBodies[3]!).forEach((char, index) => little ? detail.writeUInt32LE(char.codePointAt(0)!, index * 4) : detail.writeUInt32BE(char.codePointAt(0)!, index * 4));
    const bom = Buffer.from(little ? 'fffe0000' : '0000feff', 'hex');
    errorFixtures.push({ detail, contentType: `application/json; charset=utf-32${little ? 'le' : 'be'}` });
    errorFixtures.push({ detail: Buffer.concat([bom, detail]), contentType: 'application/json; charset=utf-32' });
    errorFixtures.push({ detail, contentType: 'application/json; charset=utf-32' });
  }

  const decisions = JSON.parse(execFileSync('python', ['-c', `
import io,json,sys,os,urllib.error,base64
from dataclasses import replace
from unittest.mock import patch
import httpx
from openai import OpenAI
from core import llm
rows=[]
for adapter in ['chat','responses','messages']:
 for fixture in json.load(io.StringIO(sys.argv[1])):
  detail=base64.b64decode(fixture['detail'])
  if adapter == 'messages':
   profile=replace(llm._default_model_profile(),adapter='messages',api_key_env='FIXTURE_KEY')
   error=urllib.error.HTTPError('https://fixture.invalid',400,'bad request',{},io.BytesIO(detail))
   with patch.dict(os.environ,{'FIXTURE_KEY':'fixture'}), patch('urllib.request.urlopen',side_effect=error):
    try:llm._post_messages_for(profile,{'model':'fixture','input':[],'tools':[],'reasoning':{'effort':'low'}})
    except Exception as exc:
     assert getattr(exc,'status_code',None)==400,repr(exc)
     rows.append(bool(llm._is_gateway_flake(exc)))
  else:
   client=OpenAI(api_key='fixture',base_url='https://fixture.invalid/v1',max_retries=0,http_client=httpx.Client(transport=httpx.MockTransport(lambda request:httpx.Response(400,content=detail,headers={'Content-Type':fixture['contentType']}))))
   try:
    if adapter == 'chat':client.chat.completions.create(model='fixture',messages=[])
    else:client.responses.create(model='fixture',input='')
   except Exception as exc:
    if getattr(exc,'status_code',None)!=400:rows.append({'name':type(exc).__name__,'message':str(exc)})
    else:rows.append(bool(llm._is_gateway_flake(exc)))
   finally:client.close()
print(json.dumps(rows))
`, JSON.stringify(errorFixtures.map(({ detail, contentType }) => ({ detail: detail.toString('base64'), contentType })))], { cwd: pythonRoot, encoding: 'utf8' }));
  let decision = 0;
  for (const adapter of ['chat','responses','messages']) for (const { detail, contentType } of errorFixtures) {
    let attempts = 0;
    const success = adapter === 'chat' ? { choices: [{ message: { content: 'done' } }] } : adapter === 'messages' ? { content: [] } : { output: [] };
    const candidate = new ModelRuntime({ ...profile, adapter }, { env: { FIXTURE_KEY: 'fake' }, wait: async () => {}, fetch: async () => ++attempts === 1 ? new Response(detail, { status: 400, headers: { 'content-type': contentType } }) : new Response(JSON.stringify(success)) });
    const expected = decisions[decision++];
    if (typeof expected === 'object') { await assert.rejects(candidate.respondCanonical('', [], []), error => error instanceof Error && error.name === expected.name && error.message === expected.message); assert.equal(attempts, 1); }
    else if (expected) { await candidate.respondCanonical('', [], []); assert.equal(attempts, 2); }
    else { await assert.rejects(candidate.respondCanonical('', [], [])); assert.equal(attempts, 1); }
  }
  const { ModelCookies } = await import('../src/adapters/models/cookies.js');
  const cookieCases = [
    ['session=one; Path=/', 'nested=two; Path=/api', 'private=no; Path=/private', 'secure=no; Secure; Path=/'],
    ['a=one', 'a=two', 'flag', 'quoted="hello world"; Path=/'],
    ['a=one; Path=/', 'a=gone; Path=/; Max-Age=0'],
    ['a=one; Path=/', 'a=gone; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT'],
    ['future=yes; Expires=Wed, 01 Jan 2099 00:00:00 GMT', 'invalid=yes; Expires=nonsense'],
    ['domain=yes; Domain=example.test; Path=/', 'bad=no; Domain=other.test; Path=/'],
    ['v=yes; Version=1', 'bad=no; Version=2', 'plain=yes; Secure=; Path=/'],
    ['port=yes; Port=80; Path=/', 'port2=no; Port=81; Path=/', 'implicit=yes; Port; Path=/'],
    ['bad=no; Max-Age=invalid', 'age=yes; Max-Age=3600; Expires=Thu, 01 Jan 1970 00:00:00 GMT'],
    ['dup=yes; Path=/api; Path=/other', 'bad=no; Domain', 'badpath=no; Path'],
    ['a=one; Path=/', 'a=two; Path=/; Max-Age=3600; Max-Age=0'],
    ['a=two; Path=/; Max-Age=0; Max-Age=3600'],
    ['a=two; Path=/; Max-Age=3600; Max-Age=invalid'],
    ['a=two; Path=/; Max-Age=invalid; Max-Age=3600'],
    ['a=two; Path=/; Expires=nonsense; Expires=Thu, 01 Jan 1970 00:00:00 GMT'],
  ];
  cookieCases.push(...[
    '01 Jan 1969 00:00:00 GMT', '01 Jan 1970 00:00:00 GMT',
    '01 Jan 2050 00:00:00 EST', '01-Jan-50', '01/01/2050',
    'Jan 01 2050', '2050-01-01', '01 Jan 2050 24:00:00 GMT',
    '01 Jan 2050 00:00:60 GMT', '01 Jan 2050 00:00:00 +0800',
    '01 Jan 2050 00:00:00 UTC', '01 Jan 2050 00:00:00 Z',
    '01 Jan 2050 00:00:00 GMT (UTC)', '01 Jan 2050 12:00 PM',
    '32 Jan 2050', '31 Feb 2050', '01 Jan 10000', '01 Jan 0000',
  ].map(date => [`dated=yes; Path=/; Expires=${date}`]));
  const cookieUrls = ['http://example.test/api/call', 'http://example.test/api/sub/page', 'http://example.test/apix', 'http://sub.example.test/api/call', 'http://other.test/api/call', 'https://example.test/api/call', 'http://example.test:81/api/call'];
  for (const batch of [false, true]) {
  const cookieOracle = JSON.parse(execFileSync('python', ['-c', `
import json,sys,httpx
cases,urls,batch=json.load(sys.stdin);out=[]
for values in cases:
 jar=httpx.Cookies();request=httpx.Request('POST',urls[0])
 for group in ([values] if batch else [[value] for value in values]):jar.extract_cookies(httpx.Response(200,headers=[('set-cookie',value) for value in group],request=request))
 row=[]
 for url in urls:
  request=httpx.Request('GET',url);jar.set_cookie_header(request);row.append(request.headers.get('cookie'))
 out.append(row)
print(json.dumps(out))
`], { input: JSON.stringify([cookieCases, cookieUrls, batch]), encoding: 'utf8' }));
  for (const [index, values] of cookieCases.entries()) {
    const jar = new ModelCookies();
    for (const group of batch ? [values] : values.map(value => [value])) jar.extract(cookieUrls[0]!, new Headers(group.map((value): [string, string] => ['set-cookie', value])));
    assert.deepEqual(cookieUrls.map(url => jar.header(url) ?? null), cookieOracle[index], `cookie policy ${index}, batch=${batch}`);
  }
  }
  const legacyCookies: [string, string][][] = [
    [['set-cookie2', 'legacy=one; Version=1; Path=/']],
    [['set-cookie2', 'legacy=one; Version=0; Path=/']],
    [['set-cookie', 'normal=one; Path=/'], ['set-cookie2', 'legacy=one; Version=1; Path=/']],
    [['set-cookie', 'normal=one; Path=/'], ['set-cookie2', 'legacy=one; Version=0; Path=/']],
    [['set-cookie', 'normal=one; Path=/'], ['set-cookie2', 'legacy="hello; world, \"friend\""; Version=0; Path=/']],
    [['set-cookie', 'normal=one; Path=/'], ['set-cookie2', 'first=one; Version=0; Path=/, second=two; Version=0; Path=/']],
    [['set-cookie', 'normal=one; Path=/'], ['set-cookie2', 'normal=old; Version=0; Path=/']],
  ];
  legacyCookies.push(...[[["set-cookie", "first=one; Path=/"], ["set-cookie", "broken=x; Max-Age"], ["set-cookie", "old=gone; Path=/; Max-Age=0"]], [["set-cookie", "first=one; Path=/"], ["set-cookie", "broken=x; Max-Age=invalid"], ["set-cookie", "old=gone; Path=/; Max-Age=0"]], [["set-cookie", "first=one; Path=/"], ["set-cookie", "broken=x; Expires=Wed, 09 Jxx 2050 00:00:00 GMT"], ["set-cookie", "old=gone; Path=/; Max-Age=0"]], [["set-cookie", "first=one; Path=/"], ["set-cookie", "broken=x; Domain; Max-Age"], ["set-cookie", "old=gone; Path=/; Max-Age=0"]], [["set-cookie", "normal=one; Path=/"], ["set-cookie2", "legacy=one; Version=0; Path=/"], ["set-cookie2", "broken=x; Version=0; Expires=123"]], [["set-cookie", "normal=one; Path=/"], ["set-cookie2", "old=gone; Version=0; Path=/; Max-Age=0"], ["set-cookie2", "broken=x; Version=0; Expires=123"]]] as [string, string][][]);
  const legacyOracle = JSON.parse(execFileSync('python', ['-c', `
import json,sys,httpx
out=[]
for headers in json.load(sys.stdin):
 jar=httpx.Cookies();request=httpx.Request('GET','http://example.test/')
 jar.extract_cookies(httpx.Response(200,headers={'set-cookie':'old=keep; Path=/'},request=request))
 jar.extract_cookies(httpx.Response(200,headers=headers,request=request));jar.set_cookie_header(request)
 out.append(request.headers.get('cookie'))
print(json.dumps(out))
`], { input: JSON.stringify(legacyCookies), encoding: 'utf8' }));
  for (const [index, headers] of legacyCookies.entries()) {
    const jar = new ModelCookies();
    jar.extract('http://example.test/', new Headers({ 'set-cookie': 'old=keep; Path=/' }));
    jar.extract('http://example.test/', new Headers(headers));
    assert.equal(jar.header('http://example.test/') ?? null, legacyOracle[index], `legacy cookie ${index}`);
  }
  const { createServer } = await import('node:http');
  let stalledCookies: (string | null)[] = [];
  let redirectRequests: { method: string; path: string; contentType: boolean }[] = [];
  const server=createServer((request,response)=>{
    if (request.url?.startsWith('/cookie-stalled')) {
      stalledCookies.push(request.headers.cookie ?? null);
      request.resume();
      if (stalledCookies.length === 1) {
        response.writeHead(200, { 'Set-Cookie': 'gateway=session; Path=/', 'Content-Type': 'application/json' });
        response.write('{');
        const timer = setTimeout(() => response.end('}'), 500);
        response.on('close', () => clearTimeout(timer));
      } else response.end('{"content":[],"choices":[],"output":[]}');
      return;
    }
    if (request.url === '/redirect-log') { response.end(JSON.stringify(redirectRequests)); return; }
    if (request.url?.startsWith('/redirect-')) {
      if (request.method === 'POST') redirectRequests = [];
      redirectRequests.push({ method: request.method!, path: request.url, contentType: !!request.headers['content-type'] });
      const status = Number(request.url.match(/^\/redirect-(\d+)/)?.[1] ?? 302);
      let location: string | string[] = '/redirect-target';
      if (request.url.startsWith('/redirect-duplicate')) location = ['/redirect-target', '/redirect-other'];
      if (request.url.startsWith('/redirect-comma')) location = '/redirect-target,part';
      if (request.url.startsWith('/redirect-chain')) location = '/redirect-307';
      if (request.url.startsWith('/redirect-loop')) location = '/redirect-loop';
      if (request.url.startsWith('/redirect-unique')) location = '/redirect-unique-' + (Number(request.url.match(/unique-(\d+)/)?.[1] ?? 0) + 1);
      if (request.url.startsWith('/redirect-target')) response.end('{"content":[],"choices":[],"output":[]}');
      else { response.writeHead(status, { Location: location }); response.end(); }
      request.resume(); return;
    }
    if (request.url?.startsWith('/partial-headers')) {
      const socket = response.socket!;
      socket.write('HTTP/1.1 200 OK\r\n');
      const stalled = request.url.startsWith('/partial-headers-stalled');
      const parts = ['X-Partial: yes\r\n', 'Content-Type: application/json\r\n', 'Connection: close\r\n\r\n{"content":[],"choices":[],"output":[]}'];
      const timers = parts.map((part, index) => setTimeout(() => {
        if (index === parts.length - 1) socket.end(part); else socket.write(part);
      }, (index + 1) * (stalled ? 350 : 120)));
      socket.on('close', () => timers.forEach(clearTimeout)); return;
    }
    if (request.url?.startsWith('/upload-phases')) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      request.resume(); request.on('end', () => { timer = setTimeout(() => response.end('{}'), 120); });
      response.on('close', () => clearTimeout(timer)); return;
    }
    if (request.url?.startsWith('/delayed-headers')) {
      const timer = setTimeout(() => { response.writeHead(200, {'Content-Type':'application/json'}); response.end('{"content":[],"choices":[],"output":[]}'); }, 1200);
      response.on('close', () => clearTimeout(timer)); return;
    }
    response.writeHead(200,{'Content-Type':'application/json'});
    response.write('{"content":');
    const timers=request.url?.startsWith('/steady')
      ? [setTimeout(()=>response.write('[],"choices":'),120),setTimeout(()=>response.end('[],"output":[]}'),240)]
      : [setTimeout(()=>response.end('[]}'),500)];
    response.on('close',()=>timers.forEach(clearTimeout));
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
  try {
    const { promisify } = await import('node:util');
    const { execFile } = await import('node:child_process');
    for (const adapter of ['messages', 'chat', 'responses']) {
      stalledCookies = [];
      const statuses = JSON.parse((await promisify(execFile)('python', ['-c', `
import json,sys,urllib.request
from openai._base_client import _DefaultHttpxClient
adapter,url=sys.argv[1:];out=[]
with _DefaultHttpxClient(timeout=.15) as client:
 for _ in range(2):
  try:
   if adapter=='messages':
    with urllib.request.urlopen(urllib.request.Request(url,data=b'{}'),timeout=.15) as response:response.read()
   else:client.post(url,content=b'{}')
   out.append(True)
  except Exception:out.append(False)
print(json.dumps(out))
`, adapter, origin + '/cookie-stalled'], { encoding: 'utf8' })).stdout);
      const expectedCookies = [...stalledCookies];
      assert.deepEqual(statuses, [false, true]);
      stalledCookies = [];
      const candidate = new ModelRuntime({ ...profile, adapter, base_url: origin + '/cookie-stalled', http_timeout_sec: .15 }, { env: { FIXTURE_KEY: 'fake' } });
      const actualStatuses: boolean[] = [];
      for (let i = 0; i < 2; i++) {
        try { await candidate.complete({ model: 'fixture', instructions: '', input: [], tools: [], store: false, max_output_tokens: 128000, reasoning: { effort: 'low' } }); actualStatuses.push(true); }
        catch { actualStatuses.push(false); }
      }
      assert.deepEqual(actualStatuses, statuses, `${adapter} stalled Cookie response`);
      assert.deepEqual(stalledCookies, expectedCookies, `${adapter} Cookie survives response body timeout`);
    }
    const oracle=JSON.parse((await promisify(execFile)('python',['-c',`
import json,sys,urllib.request,httpx
out=[]
for name in ['messages','chat','responses']:
 for mode,timeout in [('steady',.2),('stalled',.2),('steady',30*86400),('delayed-headers',2),('partial-headers',.2),('partial-headers-stalled',.2)]:
  try:
   if name=='messages':
    with urllib.request.urlopen(sys.argv[1]+'/'+mode,timeout=timeout) as r:json.loads(r.read())
   else:httpx.get(sys.argv[1]+'/'+mode,timeout=timeout).json()
   out.append(True)
  except (TimeoutError,httpx.TimeoutException):out.append(False)
import time
def upload():
 for _ in range(2):time.sleep(.12);yield b'x'
try:httpx.post(sys.argv[1]+'/upload-phases',content=upload(),timeout=.2).json();out.append(True)
except httpx.TimeoutException:out.append(False)
print(json.dumps(out))
`,origin],{encoding:'utf8'})).stdout);
    const redirectModes = ['301', '302', '303', '307', '308', 'chain', 'loop', 'unique-0', 'duplicate', 'comma'];
    const redirectOracle = JSON.parse((await promisify(execFile)('python', ['-c', `
import json,sys,urllib.request,urllib.error
from openai._base_client import _DefaultHttpxClient
out=[]
for adapter in ('messages','chat','responses'):
 for mode in json.loads(sys.argv[2]):
  suffix={'messages':'messages','chat':'chat/completions','responses':'responses'}[adapter]
  url=sys.argv[1]+'/redirect-'+mode+'/'+suffix
  try:
   if adapter=='messages':
    with urllib.request.urlopen(urllib.request.Request(url,data=b'{}',headers={'Content-Type':'application/json'})) as r:ok=r.status==200
   else:
    with _DefaultHttpxClient() as c:r=c.post(url,json={});ok=r.status_code==200
  except Exception:ok=False
  with urllib.request.urlopen(sys.argv[1]+'/redirect-log') as r:requests=json.load(r)
  out.append({'ok':ok,'requests':requests})
print(json.dumps(out))
`, origin, JSON.stringify(redirectModes)], { encoding: 'utf8' })).stdout);
    let redirectIndex = 0;
    for (const adapter of ['messages', 'chat', 'responses']) for (const mode of redirectModes) {
      let ok = true;
      try { await new ModelRuntime({ ...profile, adapter, base_url: origin + '/redirect-' + mode }, { env: { FIXTURE_KEY: 'fake' } }).complete({ model: 'fixture', instructions: '', input: [], tools: [], store: false, max_output_tokens: 128000, reasoning: { effort: 'low' } }); }
      catch { ok = false; }
      assert.deepEqual({ ok, requests: redirectRequests }, redirectOracle[redirectIndex++], `${adapter} redirect ${mode}`);
    }
    const { Agent, getGlobalDispatcher, setGlobalDispatcher } = await import('undici');
    const previousDispatcher = getGlobalDispatcher(), shortDispatcher = new Agent({ headersTimeout: 1, bodyTimeout: 1 });
    setGlobalDispatcher(shortDispatcher);
    try {
    let index=0;
    for(const adapter of ['messages','chat','responses']) for(const [mode, timeout] of [['steady', .2], ['stalled', .2], ['steady', 30 * 86400], ['delayed-headers', 2], ['partial-headers', .2], ['partial-headers-stalled', .2]] as const) {
      const candidate=new ModelRuntime({...profile,adapter,base_url:origin+'/'+mode,http_timeout_sec:timeout},{env:{FIXTURE_KEY:'fake'}});
      let success=true;
      try {await candidate.complete({model:'fixture',instructions:'',input:[],tools:[],store:false,max_output_tokens:128000,reasoning:{effort:'low'}});}
      catch(error){assert.ok(error instanceof (await import('../src/adapters/models/runtime.js')).ModelConnectionError);success=false;}
      assert.equal(success,oracle[index++],`${adapter} ${mode} read timeout`);
    }
    const { requestBytes } = await import('../src/core/http.js');
    let chunks = 0;
    const upload = new ReadableStream<Uint8Array>({ async pull(controller) {
      await new Promise(resolve => setTimeout(resolve, 120));
      controller.enqueue(new Uint8Array([120])); if (++chunks === 2) controller.close();
    } });
    let uploadSucceeded = true;
    try { await requestBytes(fetch, origin + '/upload-phases', { method: 'POST', body: upload, duplex: 'half' } as RequestInit, .2); }
    catch { uploadSucceeded = false; }
    assert.equal(uploadSucceeded, oracle[index], 'upload progress and response wait use separate idle windows');
    const dns = (await import('node:dns')).default;
    const originalLookup = dns.lookup;
    const dnsTimers = new Set<ReturnType<typeof setTimeout>>();
    const delayedLookup: import('node:net').LookupFunction = (hostname, options, callback) => {
      if (hostname !== 'notale-dns-fixture.test') return (originalLookup as import('node:net').LookupFunction)(hostname, options, callback);
      const timer = setTimeout(() => {
        dnsTimers.delete(timer);
        (originalLookup as import('node:net').LookupFunction)('127.0.0.1', options, callback);
      }, 350);
      dnsTimers.add(timer);
    };
    dns.lookup = delayedLookup as typeof dns.lookup;
    try {
      const response = await requestBytes(fetch, origin.replace('127.0.0.1', 'notale-dns-fixture.test') + '/steady', {}, .2);
      assert.equal(response.response.status, 200, 'DNS resolution precedes the socket timeout');
      assert.deepEqual(JSON.parse(response.bytes.toString()), { content: [], choices: [], output: [] });
    } finally { dns.lookup = originalLookup; for (const timer of dnsTimers) clearTimeout(timer); }
    const abortHeaders = new AbortController();
    const abortTimer = setTimeout(() => abortHeaders.abort(), 150);
    try {
      await assert.rejects(requestBytes(fetch, origin + '/partial-headers', {}, .2, abortHeaders.signal),
        error => error instanceof Error && error.name === 'AbortError');
    } finally { clearTimeout(abortTimer); }

    } finally { setGlobalDispatcher(previousDispatcher); await shortDispatcher.close(); }
  } finally { server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())); }

});

test('all three model transports retain provider state through the orchestration bridge', async () => {
  const { ModelRuntime } = await import('../src/adapters/models/runtime.js');
  const { defaultModelProfile } = await import('../src/adapters/models/profiles.js');
  const { parsePythonJson, jsonText, rememberKeyOrder } = await import('../src/core/json.js');
  const normalizeWire = (source: string) => {
    const value = parsePythonJson(source); rememberKeyOrder(value, Object.keys(value).sort()); return jsonText(value);
  };
  const extraSource = '{"model":"overridden","tools":[],"reasoning":{"fixture":true},"metadata":{"nested":{"flag":false}},"temperature":1.0,"seed":9007199254740993,"stop":null}';
  const extra = parsePythonJson(extraSource);
  const canonical = { model: 'fixture', instructions: 'system', input: [{ role: 'user', content: 'task' }], tools: [{ type: 'function', name: 'Read', description: 'read', parameters: { type: 'object' } }], store: false, max_output_tokens: 128000, reasoning: { effort: 'high' } };
  const mergedBodies = JSON.parse(execFileSync('python', ['-c', `
import io,json,sys,os,httpx
from dataclasses import replace
from unittest.mock import patch
from openai import OpenAI
from core import llm
body,extra=json.load(sys.stdin);extra=json.loads(extra);rows=[]
for adapter in ['chat','messages','responses']:
 profile=replace(llm._default_model_profile(),adapter=adapter,api_key_env='FIXTURE_KEY',request_options=extra)
 if adapter=='messages':
  def transport(request,**kwargs):
   rows.append(request.data.decode());return io.BytesIO(b'{"content":[]}')
  with patch.dict(os.environ,{'FIXTURE_KEY':'fixture'}),patch('urllib.request.urlopen',side_effect=transport):llm.ModelRuntime(profile).complete(body)
 else:
  def transport(request):
   rows.append(request.content.decode());return httpx.Response(200,json={'choices':[{'message':{'role':'assistant','content':'done'}}],'output':[]})
  client=OpenAI(api_key='fixture',base_url='https://fixture.invalid/v1',max_retries=0,http_client=httpx.Client(transport=httpx.MockTransport(transport)))
  try:llm.ModelRuntime(profile,sdk_client=client).complete(body)
  finally:client.close()
print(json.dumps(rows))
`], { cwd: pythonRoot, input: JSON.stringify([canonical, extraSource]), encoding: 'utf8' }));
  for (const [index, adapter] of ['chat','messages','responses'].entries()) {
    let sent: unknown;
    const model = new ModelRuntime({ ...defaultModelProfile(), adapter, api_key_env: 'FIXTURE_KEY', request_options: extra }, {
      env: { FIXTURE_KEY: 'fixture' }, fetch: async (_url, init) => {
        sent = normalizeWire(String(init!.body));
        return new Response(JSON.stringify({ choices: [{ message: { content: 'done' } }], content: [], output: [] }));
      },
    });
    await model.complete(canonical);
    assert.equal(sent, normalizeWire(mergedBodies[index]));
  }
  const bases = ['https://fixture.invalid/v1?tenant=x', 'https://fixture.invalid/v1/#frag', 'https://fixture.invalid/v1?x=1#frag', 'https://fixture.invalid'];
  const endpoints = JSON.parse(execFileSync('python', ['-c', `
import io,json,sys,os,httpx
from unittest.mock import patch
from dataclasses import replace
from openai import OpenAI
from core import llm
rows=[]
for adapter in ['chat','messages','responses']:
 for base in json.load(io.StringIO(sys.argv[1])):
  if adapter=='messages':
   def transport(request,**kwargs):
    rows.append(request.full_url);return io.BytesIO(b'{"content":[]}')
   profile=replace(llm._default_model_profile(),adapter=adapter,base_url=base,api_key_env='FIXTURE_KEY')
   with patch.dict(os.environ,{'FIXTURE_KEY':'fixture'}),patch('urllib.request.urlopen',side_effect=transport):
    llm._post_messages_for(profile,{'model':'fixture','input':[],'tools':[]})
  else:
   def transport(request):
    rows.append(str(request.url));return httpx.Response(200,json={'choices':[{'message':{'role':'assistant','content':'done'}}],'output':[]})
   client=OpenAI(api_key='fixture',base_url=llm._normalized_base_url(base),max_retries=0,http_client=httpx.Client(transport=httpx.MockTransport(transport)))
   try:
    if adapter=='chat':client.chat.completions.create(model='fixture',messages=[])
    else:client.responses.create(model='fixture',input='')
   finally:client.close()
print(json.dumps(rows))
`, JSON.stringify(bases)], { cwd: pythonRoot, encoding: 'utf8' }));
  let endpoint = 0;
  for (const adapter of ['chat','messages','responses']) for (const base_url of bases) {
    const candidate = new ModelRuntime({ ...defaultModelProfile(), adapter, base_url, api_key_env: 'FIXTURE_KEY' }, {
      env: { FIXTURE_KEY: 'fixture' }, fetch: async url => {
        assert.equal(url, endpoints[endpoint++]);
        return new Response(JSON.stringify({ choices: [{ message: { content: 'done' } }], content: [], output: [] }));
      },
    });
    await candidate.respondCanonical('', [], []);
  }
  const invalidNumbers = [NaN,Infinity,-Infinity];
  const numberErrors = JSON.parse(execFileSync('python',['-c',`
import json,httpx
out=[]
for value in [float('nan'),float('inf'),-float('inf')]:
 try:httpx.Request('POST','https://fixture.invalid',json={'metadata':{'value':value}})
 except Exception as e:out.append({'name':type(e).__name__,'message':str(e)})
print(json.dumps(out))
`],{encoding:'utf8'}));
  for(const adapter of ['chat','responses']) for(const [index,value] of invalidNumbers.entries()) {
    let requests=0,waits=0;
    const model=new ModelRuntime({...defaultModelProfile(),adapter,api_key_env:'FIXTURE_KEY',request_options:{metadata:{value}}},{env:{FIXTURE_KEY:'fake'},wait:async()=>{waits++;},fetch:async()=>{requests++;return new Response('{}');}});
    await assert.rejects(model.respondCanonical('',[],[]),error=>error instanceof Error && error.name===numberErrors[index].name && error.message===numberErrors[index].message);
    assert.equal(requests,0);assert.equal(waits,0);
  }
  let messageWire='';
  const nanModel=new ModelRuntime({...defaultModelProfile(),adapter:'messages',api_key_env:'FIXTURE_KEY',request_options:{metadata:{value:NaN,label:'汉😀\x7f'}}},{env:{FIXTURE_KEY:'fake'},fetch:async(_url,init)=>{messageWire=String(init!.body);return new Response('{"content":[]}');}});
  await nanModel.respondCanonical('',[],[]);
  assert.ok(messageWire.includes('"metadata": {"value": NaN, "label": "\\u6c49\\ud83d\\ude00\\u007f"}'));
  const messageResponses = ['{"content":[{"type":"tool_use","id":"c","name":"ImageSearch","input":{"count":1.0,"10":10,"2":2,"nested":[-0.0,1e-5]}}]}',
    '{"content":[{"type":"tool_use","id":"c","name":"Read","input":{"x":NaN,"y":Infinity}}]}'];
  const expectedArguments = JSON.parse(execFileSync('python',['-c',`
import json,sys
from core import llm
print(json.dumps([[item.arguments for item in llm._adapt_messages(json.loads(text)).output if item.type=='function_call'] for text in json.load(sys.stdin)]))
`],{cwd:pythonRoot,input:JSON.stringify(messageResponses),encoding:'utf8'}));
  for(const [index,text] of messageResponses.entries()) {
    const model=new ModelRuntime({...defaultModelProfile(),adapter:'messages',api_key_env:'FIXTURE_KEY'},{env:{FIXTURE_KEY:'fake'},fetch:async()=>new Response(text)});
    const turn=await model.respond([{role:'user',content:'task'}]);
    assert.deepEqual(turn.message.tool_calls?.map(call=>call.function.arguments),expectedArguments[index]);
  }
  for (const adapter of ['chat', 'messages', 'responses']) {
    const bodies: Record<string, any>[] = [];
    const first = adapter === 'chat' ? { id: 'r1', choices: [{ message: { role: 'assistant', content: null, reasoning_content: 'opaque', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'Read', arguments: '{}' }, extra_content: { google: { thought_signature: 'signature' } } }] } }] } : adapter === 'messages' ? { id: 'r1', content: [{ type: 'thinking', thinking: 'opaque', signature: 'signature' }, { type: 'tool_use', id: 'c1', name: 'Read', input: {} }] } : { id: 'r1', status: 'completed', output: [{ type: 'reasoning', id: 'reason1', encrypted_content: 'opaque', status: 'completed' }, { type: 'function_call', id: 'fc1', call_id: 'c1', name: 'Read', arguments: '{}', status: 'completed' }] };
    const second = adapter === 'chat' ? { choices: [{ message: { role: 'assistant', content: 'done' } }] } : adapter === 'messages' ? { content: [{ type: 'text', text: 'done' }] } : { status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'done' }] }] };
    const model = new ModelRuntime({ ...defaultModelProfile(), adapter, api_key_env: 'FIXTURE_KEY' }, { env: { FIXTURE_KEY: 'fake' }, fetch: async (_url, init) => { bodies.push(JSON.parse(String(init!.body))); return new Response(JSON.stringify(bodies.length === 1 ? first : second)); } });
    const history: import('../src/adapters/models/chat-model.js').ChatMessage[] = [{ role: 'system', content: 'system' }, { role: 'user', content: 'task' }];
    const turn = await model.respond(history);
    history.push(turn.message, { role: 'tool', tool_call_id: 'c1', content: 'result' });
    assert.equal((await model.respond(history)).message.content, 'done');
    assert.ok(!JSON.stringify(bodies[1]).includes('replay_items'));
    if (adapter === 'chat') {
      assert.equal(bodies[1]!.messages[2].tool_calls[0].extra_content.google.thought_signature, 'signature');
      assert.equal(bodies[1]!.messages[2].reasoning_content, 'opaque');
    } else if (adapter === 'messages') assert.equal(bodies[1]!.messages[1].content[0].signature, 'signature');
    else {
      assert.equal(bodies[1]!.input[1].encrypted_content, 'opaque');
      assert.equal(bodies[1]!.input[2].call_id, 'c1');
      assert.ok(!('status' in bodies[1]!.input[1]));
    }
  }
});

test('redaction and transcript schema match Python, including immutable image evidence', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { redact } = await import('../src/core/redact.js');
  const { TraceWriter } = await import('../src/core/trace.js');
  const root = mkdtempSync(path.join(tmpdir(), 'notale-trace-parity-'));
  const example = 'custom-secret-value-long Bearer ' + 'a'.repeat(35) + ' sk-' + 'b'.repeat(35) + ' ghp_' + 'c'.repeat(32) + ' eyJ' + 'd'.repeat(12) + '.eyJ' + 'e'.repeat(12) + '.abc- 中文AKIAABCDEFGHIJKLMNOP AKIAABCDEFGHIJKLMNOP中文 AIza' + 'x'.repeat(34) + '-a';
  const env = { FIXTURE_KEY: 'custom-secret-value-long', API_URL_TOKEN: 'https://example.com/long-reference' };
  const { parsePythonJson, jsonText } = await import('../src/core/json.js');
  const numericSource = '{"float":1.0,"big":9007199254740993,"nested":[-0.0],"nan":NaN,"inf":Infinity}';
  const reference = parsePythonJson(execFileSync('python', ['-c', `
import json,sys,os
from pathlib import Path
from core.redact import redact
from core.trace import Writer
p=json.load(sys.stdin);os.environ.clear();os.environ.update(p['env'])
f=Path(p['root'])/'python.jsonl';w=Writer(f,'session')
numbers=json.loads(p['numericSource'])
w.add([{'type':'text','text':p['example'],'data':numbers}],'answer',{'input_tokens':3,'exact':9007199254740993},'r1','start','finish',{'step':'deck','data':numbers})
w.tool(rid='r1',call_id='c1',page='page-01',name='Read',arguments='{}',output='result',started='start',finished='finish',seconds=1.5,images=[('image/png','YQ==')])
w.add([],'done',{},'r2','start2','finish2')
print(json.dumps({'redacted':redact(p['example']),'rows':[json.loads(line) for line in f.read_text().splitlines()]},ensure_ascii=False))
`], { cwd: pythonRoot, input: JSON.stringify({ root, env, example, numericSource }), encoding: 'utf8' }));
  try {
    assert.equal(redact(example, env), reference.redacted);
    const file = path.join(root, 'ts.jsonl'), writer = new TraceWriter(file, 'session');
    writer.add([{ type: 'text', text: redact(example, env), data: parsePythonJson(numericSource) }], 'answer', { input_tokens: 3, exact: 9007199254740993n }, 'r1', 'start', 'finish', { step: 'deck', data: parsePythonJson(numericSource) });
    writer.tool({ rid: 'r1', call_id: 'c1', page: 'page-01', name: 'Read', arguments: '{}', output: 'result', started: 'start', finished: 'finish', seconds: 1.5, images: [['image/png', 'YQ==']] });
    writer.add([], 'done', {}, 'r2', 'start2', 'finish2');
    const normalize = (rows: Record<string, any>[]) => {
      const ids = new Map(rows.map((row, index) => [row.uuid, index]));
      return rows.map(row => ({ ...row, uuid: ids.get(row.uuid), ...('parentUuid' in row ? { parentUuid: ids.get(row.parentUuid) } : {}) }));
    };
    const rows = readFileSync(file, 'utf8').trim().split('\n').map(line => parsePythonJson(line));
    assert.deepEqual(normalize(rows), normalize(reference.rows));
    assert.equal(jsonText(rows[0].message), jsonText(reference.rows[0].message));
    assert.equal(jsonText(rows[1].message), jsonText(reference.rows[1].message));
    assert.equal(jsonText(rows[1].toolUseResult), jsonText(reference.rows[1].toolUseResult));
    assert.equal(readFileSync(path.join(root, rows[2].toolUseResult.images[0].path), 'utf8'), 'a');
    assert.throws(() => writer.tool({ rid: 'r', call_id: 'c', page: 'p', name: 'Read', arguments: '{}', output: '', started: '', finished: '', seconds: 0, images: [['image/png', 'invalid!']] }), /base64/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('theme static gates and local URL rules match Python on shared CSS boundaries', async () => {
  const theme = await import('../src/core/theme.js');
  const valid = '/* ==== INTERFACE ====\ntoken --bg --text --font-sans\n==== /INTERFACE ==== */\n:root{--bg:#fff;--text:#111;--font-sans:serif}';
  const cases = [valid, valid + '\nh1{color:red}', valid + '\n:root{--surface-1:white}', valid + '\n.nt-card{--surface-1:white}', valid + '\n#stage{width:100%}', valid + '\n@media(min-width:1px){#stage{overflow:auto}}', valid + '\n@import "a.css";', valid.replace('token --bg', 'variant alternate\nclass .nt-absent\ntoken --missing --bg'), valid + '\n:is(.nt-one,.nt-two){color:red}', valid + '\n:root,.nt-one{--panel:white}', valid + '\n.nt-one{.child{color:red}}'];
  cases.push(valid + String.raw` @im\70ort "a.css";`, valid + String.raw` @\6d edia screen {#stage{width:100%}}`,
    valid + '\n.nt-标题{--panel:white}',
    valid.replace('token --bg', 'class .nt-标题\ntoken --颜色 --bg') + '\n.nt-标题{--颜色:red}',
    valid.replace('token --bg', 'class .nt-标题\ntoken --bg') + '\n.nt-标题副本{color:red}',
    valid + String.raw` .nt-a{content:"@im\70ort";background:url(images/@im\70ort.png)}`);
  cases.push(valid + String.raw` #st\61 ge{width:100%;overflow:auto}`,
    valid + String.raw` :r\6f ot{--panel:white}`,
    valid + String.raw` .\6e t-card{--panel:white}`,
    valid.replace(':root', String.raw`:r\6f ot`),
    valid.replace('token --bg', 'class .nt-card\ntoken --bg') + String.raw` .nt-c\61 rd{color:red}`);
  cases.push(valid.slice(0, -1), valid + '#stage{width:1px', valid + '@media screen{#stage{height:1px}',
    valid + '/* unfinished', valid + ':root{--panel:white', valid.replace('--font-sans:serif}', '') );
  cases.push(valid + '#stage{color:red width:1px}', valid + '.nt-a{color:red width:1px}',
    valid.replace('--bg:#fff;--text:#111;', '--bg:#fff --text:#111;'));
  cases.push(...['.nt-a{color:red; broken}', '.nt-a{color red; width:1px}', '.nt-a{--x:1; ???; width:1px}',
    '#stage{foo; width:1px;bar}', '#stage{width:1px;\nfoo;\nheight:1px}', '.nt-a{foo;bar;}'].map(rule => valid + rule));
  cases.push(valid.replace('--bg:#fff', '_--bg:#fff'), valid + '#stage{_width:1px;_overflow:auto}',
    valid + ':root{_--panel:white}', valid.replace('token --bg', 'token --私有 --bg') + ':root{_--私有:1}');
  cases.push(...['h1; @import "x";', 'h1;#stage{width:1px}', '@media screen{bad;h1{color:red}}',
    '.nt-a{color:"bad\nstr"}', '.nt-a{--x:[1}', '.nt-a{color:red}}', '<!-- h1 -->',
    '.nt-a{color:!important}', '.nt-a{color:!/**/IMPORTANT}', '.nt-a{color:red !important x}',
    '.nt-a{--x:{a:b};color:red}', '.nt-a{--x:a{b:c};color:red}', '.nt-a{color:url(a b)}'].map(rule => valid + rule));
  cases.push(...['h1', 'h1;', 'h1 x', 'h1 x;', 'h1; h2;', 'h1  ', 'h1\n', 'h1;  '].flatMap(tail => [tail, valid + tail, valid + '#stage{width:1px}' + tail]));
  cases.push(...['\ufeff', '\ufffe', '\ufeff\ufeff'].flatMap(bom => [bom + valid, bom + valid + '#stage{width:1px}', bom + valid + '@media screen{broken}']));
  cases.push(...['\x1c', '\x85', '\ufeff'].map(space => valid.replace('/* ', '/* ' + space)));
  cases.push(...['\x1c', '\x85', '\u2028', '\u2029'].map(separator => valid.replace('token --bg --text --font-sans', `token --bg${separator}token --missing`)));
  cases.push(...[',.nt-a{color:red}', '.nt-a,,.nt-b{color:red}', ':root,,.nt-a{--panel:white}',
    ',{color:red}', '.nt-a[data-x="a,b"],{color:red}', '.nt-a[data-x=a,b]{color:red}',
    '.nt-a/*,h1*/{color:red}', '.nt-a/*,h1*/,h2{color:red}', ':is(.nt-a,.nt-b),h1{color:red}',
    String.raw`.nt-a\,h1{color:red}`, '.nt-a{,h1{color:red}}'].map(rule => valid + rule));
  cases.push(...['media screen', 'supports (display:grid)', 'layer named', 'container wide', 'scope (.nt-a)', 'starting-style', 'font-face', 'unknown'].flatMap(at => [valid + `@${at}{broken}`, valid + `@${at}{#stage{width:1px} broken}`, valid + `@${at}{broken}#stage{height:1px}`]));
  cases.push(...['#stage{*width:1px}', ':root{*--panel:red}', '.nt-a{123:x}',
    '#stage{*width:1px; height:2px}', '.nt-a{-1:x;}', '.nt-a{foo!:1;}',
    '.nt-a{--:1}', String.raw`.nt-a{\31 23:x}`, '.nt-a{_private:1}',
    '#stage{*width:1px!important;}', '#stage{123:x;\nheight:1px}',
    ':root{*--bg:white;--text:black}', '.nt-a{*width:1px{a:b}; height:2px}'].map(rule => valid + rule));
  for (const separator of ['\x1c', '\x85', '\r', '\u2028', '\u2029', '\ufeff']) {
    cases.push(valid.replace('token --bg', `class${separator}.nt-missing\nvariant${separator}missing\ntoken --bg`));
    cases.push(valid.replace('token --bg', `prose${separator}class .nt-missing\nprose${separator}variant missing\ntoken --bg`));
    cases.push(valid + `#stage${separator}{width:1px}`);
    cases.push(valid.replace('token --bg', 'variant match\ntoken --bg') + `.nt-a[data-variant${separator}=${separator}"match"]{color:red}`);
    cases.push(valid.replace('token --bg', `reference user:a${separator}b\nreference${separator}style:c\ntoken --bg`));
  }
  cases.push(...['汉html', 'html汉', 'body²', 'Ⅲbody', 'body\u0301'].map(selector => valid + selector + '{color:red}'));
  cases.push(...['--ſurface', '--tİle', '--chıp'].map(token => valid + `:root{${token}:white}`));
  const interfaceExpected = JSON.parse(execFileSync('python', ['-c', `
import json,sys
from core import theme
print(json.dumps([[theme.variants(theme.INTERFACE.search(css).group(1) if theme.INTERFACE.search(css) else ''),theme.references(css)] for css in json.load(sys.stdin)]))
`], { cwd: pythonRoot, input: JSON.stringify(cases), encoding: 'utf8' }));
  cases.forEach((css,index) => assert.deepEqual([theme.variants(css.match(theme.INTERFACE)?.[1] ?? ''),theme.references(css)], interfaceExpected[index], `CSS interface ${index}`));
  const { cssComponents, serializeCss, cssRules, cssBlocks } = await import('../src/core/css-tokenizer.js');
  const lexical = [...cases, ...['a/**/b 1/**/px #/**/x @/**/media / /**/ *', '-0 1e-2 1e-foo 1E', 'url()', 'url(', 'url(a b)', 'url(a"', 'url(a\\)', 'url(a\\\n)',
    '"a\nb"', '"eof', '"escaped\\\nline"', 'U+4?? U+0020-007F U+10FFFF',
    '#123 #abc @media -x --x -1.2e+3px 12% +.5', '\0\r\n\f😀 [a {b(c)}]',
    String.raw`\0 \110000 \d800 \31 x`, '/* comment', '<!-- --> || ~= |= ^= $= *=',
    'url(a\x01', 'url(a\x01)', 'url(a\x01tail)', 'url(   ', 'url(a  ', 'url(a b\\)c)']];
  const fragments = ['a', '.nt-a', ':root', '#stage', '--bg', ':', ';', ' ', '\n', '\r', '\0', '\ufeff', '汉', '😀',
    '{', '}', '[', ']', '(', ')', '/*', '*/', '"', "'", '\\', '\\31 ', '\\\n', 'url(', 'image-set(',
    '@import', '@media', '!', 'important', 'U+4??', '1e-2', '%', ',', '<!--', '-->', '"x.png"'];
  let seed = 0x4e6f7461;
  const choose = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
  const generated = Array.from({ length: 256 }, () => Array.from({ length: 2 + choose() % 12 }, () => fragments[choose() % fragments.length]).join(''));
  lexical.push(...generated);
  cases.push(...generated);
  const lexicalExpected = JSON.parse(execFileSync('python', ['-c', `
import json,sys,tinycss2
fields=['important','representation','at_keyword','prelude','type','source_line','source_column','value','name','unit','int_value','is_identifier','start','end','kind','message','content','arguments']
def project(token):
 return {name:[project(t) for t in getattr(token,name)] if isinstance(getattr(token,name),list) else getattr(token,name) for name in fields if hasattr(token,name)}
print(json.dumps([[project(t) for t in tinycss2.parse_component_value_list(css)] for css in json.load(sys.stdin)]))
`], { input: JSON.stringify(lexical), encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }));
  lexical.forEach((css, index) => assert.deepEqual(cssComponents(css), lexicalExpected[index], `CSS tokens ${index}: ${JSON.stringify(css)}`));
  const serialized = JSON.parse(execFileSync('python', ['-c', 'import json,sys,tinycss2;print(json.dumps([[tinycss2.serialize(tinycss2.parse_component_value_list(css,skip_comments=skip)) for skip in (False,True)] for css in json.load(sys.stdin)]))'], { input: JSON.stringify(lexical), encoding: 'utf8' }));
  lexical.forEach((css, index) => assert.deepEqual([serializeCss(cssComponents(css)), serializeCss(cssComponents(css, true))], serialized[index], `CSS serialization ${index}`));
  const ruleExpected = JSON.parse(execFileSync('python', ['-c', `
import json,sys,tinycss2
fields=['important','representation','at_keyword','prelude','type','source_line','source_column','value','name','unit','int_value','is_identifier','start','end','kind','message','content','arguments']
def project(token):
 return {name:[project(t) for t in getattr(token,name)] if isinstance(getattr(token,name),list) else getattr(token,name) for name in fields if hasattr(token,name)}
print(json.dumps([[[project(t) for t in parser(css,skip_comments=True,skip_whitespace=True)] for parser in (tinycss2.parse_stylesheet,tinycss2.parse_rule_list,tinycss2.parse_blocks_contents)] for css in json.load(sys.stdin)]))
`], { input: JSON.stringify(lexical), encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }));
  lexical.forEach((css, index) => assert.deepEqual([cssRules(css), cssRules(css, false), cssBlocks(css)], ruleExpected[index], `CSS rules ${index}`));

  cases.push(...['.nt-a', '.nt-a,.nt-b', '#stage', 'h1()', 'h1[data-x="a"]', 'U+4??', '123px', 'h1/*end*/', 'h1😀'].flatMap(tail => [tail, valid + tail]));
  const expected = JSON.parse(execFileSync('python', ['-c', `
import json,sys
from core import theme
print(json.dumps([theme.inspect(css)[0] for css in json.load(sys.stdin)],ensure_ascii=False))
`], { cwd: pythonRoot, input: JSON.stringify(cases), encoding: 'utf8' }));
  cases.forEach((css, index) => assert.deepEqual(theme.inspect(css).bad, expected[index], `CSS case ${index}`));
  assert.equal(theme.parseCss(cases[16]!).toString(), serializeCss(cssRules(cases[16]!, true, false, false)));
  for (const bom of ['\ufeff', '\ufffe', '\ufeff\ufeff']) assert.equal(theme.parseCss(bom + valid).toString(), bom + valid);
  let urls = `:root{background:image-set("a.png" 1x,url('b.png') 2x);--test:url(\\61 .png)}`;
  urls += String.raw` .nt-a{background:\75 rl("c.png"),\69 mage-set("d.png" 1x,u\72l(e.png) 2x);content:"\\75 rl(fake.png)"}`;
  urls += '.nt-b{background:url("a\\\nb.png"),image-set("c\\\r\nd.png" 1x)}';
  const reference = JSON.parse(execFileSync('python', ['-c', `
import json,sys
from core import theme
print(json.dumps([value for _,value in theme.urls(theme.cssparser.parse_stylesheet(sys.stdin.read()))]))
`], { cwd: pythonRoot, input: urls, encoding: 'utf8' }));
  const parsedUrls = theme.parseCss(urls);
  const resources = theme.cssUrls(parsedUrls);
  assert.deepEqual(resources.map(token => token.value), reference);
  resources.forEach((token, index) => token.replace(`style/asset-${index}.png`));
  assert.deepEqual(theme.cssUrls(theme.parseCss(parsedUrls.toString())).map(token => token.value), reference.map((_: string, index: number) => `style/asset-${index}.png`));
  const urlCases = [urls, 'a{background:url()}', 'a{background:url(}', 'a{background:url(a b)}',
    'a{background:url("a" "b")}', 'a{background:url("a"/**/)}',
    'a{background:image-set("a.png" 1x,url(b.png) 2x)}',
    'a{background:-webkit-image-set("a.png" 1x)}', 'a{background:url("a\\\nb.png")}',
    'a{--x:[url(a.png)];--y:{background:url(b.png)}}', 'url(before.png){color:red}',
    'broken; @import url(hidden.png);', '@media screen{a{background:url(a.png)}}'];
  const addresses = ['', '#x', 'a.png?#', '//', '///a.png', ' HTTP://example.org/a?b#c',
    'a\tb.png', '\0a.png', '1x:a.png', '汉:a.png', '//example.org/a.png',
    '//[::1]/a', '//[::1%eth 0]/a', '//[::ffff:127.0.0.1]/a', '//[v1.future]/a',
    '//[v1.]/a', '//[V1.future]/a', '//[127.0.0.1]/a', '//[missing]/a',
    '//[::1/a', '//::1]/a', '//prefix[::1]/a', '//[::1]suffix/a', '//[::1]:bad/a',
    '//user:pass@[::1]/a', '//[user]@127.0.0.1/a', '//[::1%]/a', '//[::1%x%y]/a',
    '//[a\u00a0b]/a', '//[a\u2028b]/a', '//[a\ud800b]/a', '//example.org：80/a', '//example.org／a', '//℀/a', '//normalé/a'];
  const addressExpected = JSON.parse(execFileSync('python', ['-c', `
import json,sys
from urllib.parse import urlsplit
rows=[]
for value in json.load(sys.stdin):
 try:rows.append(dict(zip(['scheme','netloc','path','query','fragment'],urlsplit(value))))
 except Exception as error:rows.append({'error':{'name':type(error).__name__,'message':str(error)}})
print(json.dumps(rows))
`], { input: JSON.stringify(addresses), encoding: 'utf8' }));
  addresses.forEach((value, index) => {
    let actual;
    try { actual = theme.splitResourceUrl(value); }
    catch (error) { actual = { error: { name: (error as Error).name, message: (error as Error).message } }; }
    assert.deepEqual(actual, addressExpected[index], value);
  });
  const replacement = 'moved/a"b\\c.png#x';
  const urlExpected = JSON.parse(execFileSync('python', ['-c', `
import json,sys
from core import theme
p=json.load(sys.stdin);rows=[]
for css in p['cases']:
 try:
  nodes=theme.cssparser.parse_stylesheet(css);entries=list(theme.urls(nodes));values=[value for _,value in entries]
  for token,_ in entries:theme.replace_url(token,p['replacement'])
  rows.append({'values':values,'css':theme.cssparser.serialize(nodes)})
 except Exception as error:rows.append({'error':{'name':type(error).__name__,'message':str(error)}})
print(json.dumps(rows))
`], { cwd: pythonRoot, input: JSON.stringify({ cases: urlCases, replacement }), encoding: 'utf8' }));
  urlCases.forEach((css, index) => {
    let actual;
    try {
      const root = theme.parseCss(css), entries = theme.cssUrls(root), values = entries.map(entry => entry.value);
      entries.forEach(entry => entry.replace(replacement)); actual = { values, css: root.toString() };
    } catch (error) { actual = { error: { name: (error as Error).name, message: (error as Error).message } }; }
    assert.deepEqual(actual, urlExpected[index], `CSS URL rewrite ${index}`);
  });

  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const resourceRoot = await mkdtemp(path.join(tmpdir(), 'notale-css-url-'));
  try {
    for (const name of ['a.png', 'ab.png', 'a�.png', '中%ZZ.png', 'a%ZZ.png', 'bad.txt']) await writeFile(path.join(resourceRoot, name), 'fixture');
    const values = [' a.png', 'a\tb.png', 'a%FF.png', '%E4%B8%AD%ZZ.png', 'a%ZZ.png', '\nhttps://example.org/a.png',
      '\t//example.org/a.png', 'a.png#x\ty', '#x\ty', 'a.png?', 'a.png?q', '%2e%2e/out.png', '\x01a.png', 'missing.png', 'bad.txt'];
    const originalPaths = JSON.parse(execFileSync('python', ['-c', `
import json,sys
from pathlib import Path
from core import theme
root=Path(sys.argv[1]); rows=[]
for value in json.load(sys.stdin):
 try:
  file,fragment=theme.local_url(value,root,root)
  rows.append({'result':[str(file) if file else None,fragment]})
 except Exception as error: rows.append({'error':{'name':type(error).__name__,'message':str(error)}})
print(json.dumps(rows,ensure_ascii=False))
` , resourceRoot], { cwd: pythonRoot, input: JSON.stringify(values), encoding: 'utf8' }));
    values.forEach((value, index) => {
      let actual;
      try { actual = { result: theme.localUrl(value, resourceRoot, resourceRoot) }; }
      catch (error) { actual = { error: { name: (error as Error).name, message: (error as Error).message } }; }
      assert.deepEqual(actual, originalPaths[index], JSON.stringify(value));
    });
    const options: Array<[string | undefined, string | undefined, boolean]> = [[undefined, '', true], [path.join(resourceRoot, 'absent'), undefined, true], [undefined, undefined, true]];
    const errorsExpected = JSON.parse(execFileSync('python', ['-c', `
import json,sys
from core import theme
out=[]
for template,style,enabled in json.load(sys.stdin):
 try: theme.check_options(template,style,enabled);out.append(None)
 except Exception as error: out.append({'name':type(error).__name__,'message':str(error)})
print(json.dumps(out))
`], { cwd: pythonRoot, input: JSON.stringify(options), encoding: 'utf8' }));
    options.forEach((args,index) => {
      let error = null;
      try { theme.checkOptions(args[0], args[1]); } catch (caught) { error = {name:(caught as Error).name,message:(caught as Error).message}; }
      assert.deepEqual(error,errorsExpected[index]);
    });
  } finally { await rm(resourceRoot, { recursive: true, force: true }); }

});

test('style detail, font declarations and supplied reference images match Python', async () => {
  const { StyleCatalog, snippets } = await import('../src/core/style-assets.js');
  const catalogue = new StyleCatalog();
  const ids = catalogue.rows().map(row => row[0]!);
  const chosen = [ids[0]!, ids[Math.floor(ids.length / 2)]!, ids.at(-1)!];
  const expected = JSON.parse(execFileSync('python', ['-c', `
import json,sys
from core import style_catalog as c,font_library
ids=json.load(sys.stdin)
def blocks(items):
 return [{'type':'text','text':b['text']} if b['type']=='input_text' else {'type':'image_url','image_url':{'url':b['image_url']}} for b in items]
print(json.dumps({'rows':c.rows(),'details':[{'text':c.detail(key)[0],'images':blocks(c.detail(key)[1])} for key in ids],'fonts':font_library.snippets(list(font_library.inventory()))},ensure_ascii=False))
`], { cwd: pythonRoot, input: JSON.stringify(chosen), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }));
  assert.deepEqual(catalogue.rows(), expected.rows);
  for (const [index, id] of chosen.entries()) {
    const actual = await catalogue.detail(id);
    actual.images = actual.images.map(block => block.type === 'text' ? { ...block, text: block.text.replaceAll(guidance.WORKFLOWS, path.join(pythonRoot, 'skills')) } : block);
    assert.deepEqual(actual, expected.details[index]);
    assert.equal(catalogue.match(id), id);
    assert.equal(catalogue.identify(`details/${id}.md`), id);
  }
  const selections = [{ids:['one','two','one'],bad:[]},{ids:['one','two'],bad:['one','two']},{ids:['one','two','three'],bad:['two']},{ids:[],bad:[]}];
  const selectionExpected = JSON.parse(execFileSync('python',['-c',`
import json,sys
from core import style_catalog as c
out=[]
for scenario in json.load(sys.stdin):
 calls=[]
 def detail(key):
  calls.append(key)
  if key in scenario['bad']:raise ValueError(key)
  return key,[{'type':'text','text':key}]
 c.detail=detail
 try:
  text,images=c.selected_inputs(scenario['ids']);result={'text':text,'images':images}
 except Exception as e:result={'error':{'name':type(e).__name__,'message':str(e)}}
 out.append({'result':result,'calls':calls})
print(json.dumps(out))
`],{cwd:pythonRoot,input:JSON.stringify(selections),encoding:'utf8'}));
  for (const [index,scenario] of selections.entries()) {
    const calls: string[] = [];
    class Catalog extends StyleCatalog {
      override async detail(value: unknown): Promise<import('../src/core/director.js').StyleInput> {
        const key=String(value);calls.push(key);await Promise.resolve();
        if(scenario.bad.includes(key)) throw Object.assign(new Error(key),{name:'ValueError'});
        return {text:key,images:[{type:'text',text:key}]};
      }
    }
    let result;
    try {result=await new Catalog().selectedInputs(scenario.ids);} catch(error) {result={error:{name:(error as Error).name,message:(error as Error).message}};}
    assert.deepEqual({result,calls},selectionExpected[index]);
  }
  const manifest = JSON.parse(readFileSync(path.join(guidance.RESOURCES, 'vendor/fonts/manifest.json'), 'utf8'));
  assert.equal(snippets(Object.keys(manifest)), expected.fonts);
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { importInput } = await import('../src/core/theme-runtime.js');
  const root = mkdtempSync(path.join(tmpdir(), 'notale-style-text-'));
  try {
    for (const directory of ['details', 'contact-sheets']) mkdirSync(path.join(root, directory));
    const { prepareFonts, inventory } = await import('../src/core/style-assets.js');
    const fontPath = `fonts/library/barlow-condensed/${inventory()['barlow-condensed']!.files[0]!.file}`;
    const urls = [fontPath, fontPath + '?', fontPath + '#', fontPath + '?#', ' ' + fontPath,
      fontPath.replace('fonts', '%66onts'), fontPath.replace('fonts', 'fo\tnts'),
      fontPath + '?v=1', fontPath + '#face', 'custom:' + fontPath,
      'https://fixture.invalid/' + fontPath, '//' + fontPath, 'image%ZZ.png',
      'fonts/library/%FF.ttf', 'fonts/library/%ZZ.ttf', 'fonts/library/%E2%82.ttf', '//[bad]/a', '//[::1]/a', '//℀/a'];
    const sources = urls.map(url => `.nt-font{src:url("${url}")}`);
    const reference = JSON.parse(execFileSync('python', ['-c', `
import json,sys,hashlib
from pathlib import Path
from core import font_library
p=json.load(sys.stdin);assets=Path(p['root'])/'py-fonts';rows=[]
for css in p['sources']:
 try:rows.append({'copied':font_library.prepare(css,assets)})
 except Exception as error:rows.append({'error':str(error)})
files={str(f.relative_to(assets)):hashlib.sha256(f.read_bytes()).hexdigest() for f in assets.rglob('*') if f.is_file()}
print(json.dumps({'rows':rows,'files':files}))
`], { cwd: pythonRoot, input: JSON.stringify({ root, sources }), encoding: 'utf8' }));
    const fontAssets = path.join(root, 'ts-fonts');
    for (const [index, css] of sources.entries()) {
      let result;
      try { result = { copied: await prepareFonts(css, fontAssets) }; }
      catch (error) { result = { error: (error as Error).message }; }
      assert.deepEqual(result, reference.rows[index], urls[index]);
    }
    for (const [file, digest] of Object.entries(reference.files)) {
      assert.equal(createHash('sha256').update(readFileSync(path.join(fontAssets, file))).digest('hex'), digest, file);
    }
    const { caseFold } = await import('../src/core/text.js');
    const foldExpected = JSON.parse(execFileSync('python', ['-c', `
import json,sys
chars=[chr(i) for i in range(sys.maxunicode+1) if chr(i).casefold()!=chr(i).lower()]
chars+=['ΟΣ','Straße','\u0130','\u0131','汉字']
print(json.dumps([[s,s.casefold()] for s in chars]))
`], {encoding:'utf8'})) as Array<[string,string]>;
    for (const [text,fold] of foldExpected) assert.equal(caseFold(text),fold);
    const table = '| 01-test | Straße · ΟΣ | Desc |\n| １２-test | \x85Name\x85 | Desc |\n';
    writeFileSync(path.join(root,'INDEX.md'),table);
    const requests = ['STRASSE','straße','οσ','ος','\x85STRASSE\x85','\ufeffSTRASSE','Name','１２-test'];
    const matches = JSON.parse(execFileSync('python',['-c',`
import json,sys
from pathlib import Path
from core import style_catalog as c
p=json.load(sys.stdin);c.ROOT=Path(p['root'])
print(json.dumps({'rows':c.rows(),'matches':[c.match(s) for s in p['requests']]}))
`],{cwd:pythonRoot,input:JSON.stringify({root,requests}),encoding:'utf8'}));
    const customCatalog = new StyleCatalog(root);
    assert.deepEqual(customCatalog.rows(),matches.rows);
    assert.deepEqual(requests.map(s=>customCatalog.match(s)??null),matches.matches);
    const indexFile = path.join(root, 'INDEX.md');
    const indexText = ['\r', '\r\n', '\v', '\f', '\x1c', '\x1d', '\x1e', '\x85', '\u2028', '\u2029'].map((separator, i) => `| ${String(i).padStart(2, '0')}-test | Test | Desc |${separator}`).join('');
    writeFileSync(indexFile, indexText);
    const local = new StyleCatalog(root);
    const rows = JSON.parse(execFileSync('python', ['-c', "import json,sys;from pathlib import Path;from core import style_catalog as c;c.ROOT=Path(sys.argv[1]);print(json.dumps(c.rows()))", root], { cwd: pythonRoot, encoding: 'utf8' }));
    assert.deepEqual(local.rows(), rows);
    const files = ['INDEX.md', 'details/00-test.md', 'contact-sheets/README.md', 'theme.css'];
    for (const [position, file] of files.entries()) {
      writeFileSync(indexFile, '| 00-test | Test | Desc |\n');
      writeFileSync(path.join(root, file), Buffer.from([0x61, 0xff]));
      const error = JSON.parse(execFileSync('python', ['-c', `
import json,sys
from pathlib import Path
from core import style_catalog as c,theme
c.ROOT=Path(sys.argv[1])
calls=[c.rows,lambda:c.detail('00-test'),c.selection_inputs,lambda:theme.import_input(c.ROOT,c.ROOT/'assets')]
try:calls[int(sys.argv[2])]()
except Exception as error:print(json.dumps({'name':type(error).__name__,'message':str(error)}))
`, root, String(position)], { cwd: pythonRoot, encoding: 'utf8' }));
      const calls = [async () => local.rows(), () => local.detail('00-test'), () => local.selectionInputs(), () => importInput(root, path.join(root, 'assets'))];
      await assert.rejects(calls[position]!, error);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }

});

test('theme import, font copying and actual browser gates match Python', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const theme = await import('../src/core/theme.js');
  const runtime = await import('../src/core/theme-runtime.js');
  const fonts = await import('../src/core/style-assets.js');
  const { acquireVisualChecker } = await import('../src/tools/visual-check.js');
  const sharp = (await import('sharp')).default;
  const root = mkdtempSync(path.join(tmpdir(), 'notale-theme-parity-'));
  const source = path.join(root, 'source'), assets = path.join(root, 'pages/assets');
  mkdirSync(path.join(source, 'shots'), { recursive: true });
  mkdirSync(assets, { recursive: true });
  const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#778899' } }).png().toBuffer();
  writeFileSync(path.join(source, 'picture.png'), png);
  writeFileSync(path.join(source, 'shots/ref.png'), png);
  const css = '/* ==== INTERFACE ====\nreference user:shots/ref.png\ntoken --bg --text --font-sans\n==== /INTERFACE ==== */\n:root{--bg:#fff;--text:#111;--font-sans:serif}.nt-figure{background:url("picture.png")}';
  writeFileSync(path.join(source, 'theme.css'), css);
  const valid = '/* ==== INTERFACE ====\ntoken --bg --text --font-sans\n==== /INTERFACE ==== */\n:root{--bg:#fff;--text:#111;--font-sans:serif}';
  const cases = [valid, valid.replace('--text:#111', '--text:not-a-color'), valid + '.nt-title[hidden]{display:block}'];
  const fontCss = fonts.snippets(['barlow-condensed']);
  const expected = JSON.parse(execFileSync('python', ['-c', `
import json,sys
from pathlib import Path
from core import theme,font_library
p=json.load(sys.stdin);assets=Path(p['assets'])
css,shots=theme.import_input(Path(p['source']),assets)
fonts=font_library.prepare(p['fontCss'],assets)
print(json.dumps({'css':css,'shots':[str(s) for s in shots],'fonts':fonts,'gates':[theme.validate(css,assets) for css in p['cases']]},ensure_ascii=False))
`], { cwd: pythonRoot, input: JSON.stringify({ source, assets, cases, fontCss }), encoding: 'utf8', timeout: 30000 }));
  const release = acquireVisualChecker();
  try {
    const imported = await runtime.importInput(source, assets);
    assert.equal(imported.css, expected.css);
    assert.deepEqual(imported.shots, expected.shots);
    const strange = "图 !'()*.png";
    writeFileSync(path.join(source, strange), png);
    const imports = ['\x1c', '\x85', '\u2028', '\ufeff'].map(space => css.replace('reference user:shots/ref.png', `reference${space}user:shots/ref.png`).replace('picture.png', strange));
    const importedExpected = JSON.parse(execFileSync('python', ['-c', `
import json,sys
from pathlib import Path
from core import theme
p=json.load(sys.stdin);source=Path(p['source']);assets=Path(p['assets']);out=[]
for css in p['cases']:
 (source/'theme.css').write_text(css)
 text,shots=theme.import_input(source,assets);out.append({'css':text,'shots':[str(s) for s in shots]})
print(json.dumps(out))
`], { cwd: pythonRoot, input: JSON.stringify({source,assets,cases:imports}), encoding: 'utf8' }));
    for (const [index,input] of imports.entries()) {
      writeFileSync(path.join(source, 'theme.css'), input);
      assert.deepEqual(await runtime.importInput(source, assets), importedExpected[index], `theme reference relocation ${index}`);
    }

    assert.deepEqual(await fonts.prepareFonts(fontCss, assets), expected.fonts);
    for (const [index, candidate] of cases.entries()) assert.deepEqual(await runtime.validate(candidate, assets), expected.gates[index]);
    assert.throws(() => theme.localUrl('../outside.png', assets, assets), /越界/);
    symlinkSync(source, path.join(assets, 'outside'));
    assert.throws(() => theme.localUrl('outside/picture.png', assets, assets), /越界/);
    const rejected = [path.join(source,'bad.txt'),path.join(source,'empty')];
    writeFileSync(rejected[0]!, 'not an image'); mkdirSync(rejected[1]!);
    const failures = JSON.parse(execFileSync('python', ['-c', `
import json,sys
from pathlib import Path
from core import theme
p=json.load(sys.stdin);out=[]
for source in p['sources']:
 try:theme.import_input(Path(source),Path(p['assets']));out.append(None)
 except Exception as error:out.append({'name':type(error).__name__,'message':str(error)})
print(json.dumps(out))
`], { cwd:pythonRoot,input:JSON.stringify({sources:rejected,assets}),encoding:'utf8' }));
    for (const [index,input] of rejected.entries()) {
      let failure = null;
      try { await runtime.importInput(input,assets); } catch (error) { failure = {name:(error as Error).name,message:(error as Error).message}; }
      assert.deepEqual(failure,failures[index]);
    }
    assert.deepEqual(await runtime.validate(valid + '.nt-a{background:url(absent.png)}',assets,false),[`缺少资源: ${path.join(assets,'absent.png')}`]);
    const copied = path.join(assets, expected.fonts[0]);
    writeFileSync(copied, 'changed');
    await assert.rejects(fonts.prepareFonts(fontCss, assets), /不能覆盖/);
  } finally { await release(); rmSync(root, { recursive: true, force: true }); }
});

test('workspace tools and schemas match Python on edits, scope and full resource reads', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const tools = await import('../src/tools/workspace.js');
  const root = mkdtempSync(path.join(tmpdir(), 'notale-tools-parity-')), cwd = path.join(root, 'pages'), resources = path.join(root, 'build-page');
  mkdirSync(cwd); mkdirSync(path.join(resources, 'references'), { recursive: true });
  writeFileSync(path.join(resources, 'references/data.md'), '原始指令\r\n第二行\r');
  const operations = [
    ['Write', { file_path: 'page-01.html', content: '甲 a a\n乙 b\n' }],
    ['Read', { file_path: 'page-01.html', offset: 2, limit: 1 }],
    ['Patch', { file_path: 'page-01.html', edits: [{ old: 'a', new: 'b' }, { old: 'b', new: '$&' }] }],
    ['Patch', { file_path: 'page-01.html', edits: [{ old: '甲', new: '丙' }, { old: '不存在', new: 'x' }] }],
    ['Read', { file_path: 'page-01.html' }],
    ['Read', { file_path: 'references/data.md', offset: 99, limit: 1 }],
    ['Write', { file_path: 'page-02.html', content: '不得写' }],
    ['Write', { file_path: 'assets/img/shared.svg', content: '不得写' }],
    ['Bash', { command: "printf 'out'; printf 'error' >&2" }],
    ['Bash', { command: "printf 'one\\r\\ntwo\\rthree\\n'; printf 'err\\r\\nnext\\r' >&2" }],
    ['Bash', { command: 'kill -TERM $$' }],
    ['Bash', { command: "printf '\\377'" }],
    ['Bash', { command: "printf 'ok'; printf '\\342\\202' >&2" }],
    ['Write', { file_path: 'page-01.html', content: '甲\r\n乙\r丙\n' }],
    ['Read', { file_path: 'page-01.html' }],
    ['Patch', { file_path: 'page-01.html', edits: [{ old: '甲\n乙', new: '新甲\n新乙' }] }],
    ['Write', { file_path: 'page-01.html', content: '甲\r\n乙\r丙\n' }],
    ['Patch', { file_path: 'page-01.html', edits: [{ old: '甲\n乙', new: '丁' }] }],
    ['Read', { file_path: 'page-01.html' }],
  ];
  const oracle = JSON.parse(execFileSync('python', ['-c', `
import json,sys
from pathlib import Path
from tools import runtime
p=json.load(sys.stdin);cwd=Path(p['cwd']);root=Path(p['resources']);out=[]
for name,args in p['operations']:
 if name=='Patch':args={'page':args['file_path'],'edits':args['edits']}
 r=runtime.run(name,args,cwd,root,'page-01');out.append(r.text if isinstance(r,runtime.Out) else r)
print(json.dumps({'outputs':out,'text':(cwd/'page-01.html').read_text(),'bytes':(cwd/'page-01.html').read_bytes().hex(),'schemas':{f'{workflow}/{vision}':runtime.specs(workflow,vision_input=vision) for workflow in (None,'build-cover','build-page','build-interaction','build-code') for vision in (True,False)}},ensure_ascii=False))
`], { cwd: pythonRoot, input: JSON.stringify({ cwd, resources, operations }), encoding: 'utf8' }));
  try {
    const outputs: string[] = [];
    const unused = async (): Promise<never> => { throw new Error('unexpected dependency'); };
    for (const [name, args] of operations) {
      const result = await tools.runTool(name as string, args as Record<string, unknown>, { cwd, pid: 'page-01', resourceRoot: resources }, { image: unused, media: unused, check: unused });
      outputs.push(typeof result === 'string' ? result : result.text);
    }
    const scopeCases = [
      { page: 'page-01.html', after: ['return { value: 1 }; /*' + '长'.repeat(500) + '*/'] },
      { page: 'page-01.html', after: ['x'.repeat(500) + ' page-02.html'] },
      { page: '../outside/page-01.html', after: ['x'.repeat(500)] },
    ];
    const expectedScope = JSON.parse(execFileSync('python', ['-c', `
import json,sys
from pathlib import Path
from tools.shared.paths import _out_of_bounds
p=json.load(sys.stdin)
print(json.dumps([_out_of_bounds('Check', a, Path(p['cwd']), 'page-01') for a in p['cases']]))
`], { cwd: pythonRoot, input: JSON.stringify({ cwd, cases: scopeCases }), encoding: 'utf8' }));
    assert.deepEqual(scopeCases.map(args => tools.outOfBounds('Check', args, { cwd, pid: 'page-01' }) ?? null), expectedScope);
    const bundle = path.join(resources, 'samples/bundles/general/topic.mini.md');
    const sheet = path.join(resources, 'samples/general/topic/shots.png');
    mkdirSync(path.dirname(bundle), { recursive: true }); mkdirSync(path.dirname(sheet), { recursive: true });
    writeFileSync(bundle, 'sample source'); writeFileSync(sheet, 'image-port fixture');
    const sampleOracle = JSON.parse(execFileSync('python', ['-c', `
import json,sys
from pathlib import Path
from tools.read import tool
from tools.shared.result import Out
p=json.load(sys.stdin);out=[]
tool._image=lambda file: Out('fixture shot', [('image/png','fixture payload')])
for enabled in [False,True]:
 tool.SAMPLE_SHOTS=enabled
 r=tool.execute({'file_path':p['bundle']},Path(p['cwd']),Path(p['resources']))
 out.append({'text':r.text,'images':r.images} if isinstance(r,Out) else {'text':r,'images':[]})
print(json.dumps(out))
`], { cwd: pythonRoot, input: JSON.stringify({ bundle, cwd, resources }), encoding: 'utf8' }));
    for (const [index, sampleShots] of [false, true].entries()) {
      const result = await tools.readText({ file_path: bundle }, { cwd, pid: 'page-01', resourceRoot: resources, sampleShots }, {
        check: unused, media: unused, image: async file => { assert.equal(file, sheet); return { text: 'fixture shot', images: [['image/png', 'fixture payload']] }; },
      });
      assert.deepEqual(typeof result === 'string' ? { text: result, images: [] } : result, sampleOracle[index]);
    }
    assert.deepEqual(outputs, oracle.outputs);
    assert.equal(readFileSync(path.join(cwd, 'page-01.html'), 'utf8'), oracle.text);
    assert.equal(readFileSync(path.join(cwd, 'page-01.html')).toString('hex'), oracle.bytes);
    const malformed = ['61ff', 'e28278', 'e282', 'eda080', 'f4908080', 'c080'];
    const byteActions = [['Read', { file_path: 'page-01.html' }], ['Patch', { file_path: 'page-01.html', edits: [{ old: 'a', new: 'b' }] }]];
    const byteOracle = JSON.parse(execFileSync('python', ['-c', `
import json,sys
from pathlib import Path
from tools import runtime
p=json.load(sys.stdin);cwd=Path(p['cwd']);rows=[]
for value in p['bytes']:
 for name,args in p['actions']:
  if name=='Patch':args={'page':args['file_path'],'edits':args['edits']}
  file=cwd/'page-01.html';file.write_bytes(bytes.fromhex(value))
  result=runtime.run(name,args,cwd,None,'page-01')
  rows.append({'text':result.text if isinstance(result,runtime.Out) else result,'bytes':file.read_bytes().hex()})
print(json.dumps(rows))
`], { cwd: pythonRoot, input: JSON.stringify({ cwd, bytes: malformed, actions: byteActions }), encoding: 'utf8' }));
    let byteIndex = 0;
    for (const value of malformed) for (const [name, args] of byteActions) {
      const file = path.join(cwd, 'page-01.html'); writeFileSync(file, Buffer.from(value, 'hex'));
      const result = await tools.runTool(name as string, args as Record<string, unknown>, { cwd, pid: 'page-01' }, { image: unused, media: unused, check: unused });
      assert.deepEqual({ text: typeof result === 'string' ? result : result.text, bytes: readFileSync(file).toString('hex') }, byteOracle[byteIndex++]);
    }

    // The TS authoring API intentionally uses file_path/Patch; compare unchanged tool contracts to Python.
    for (const workflow of [undefined, ...PYTHON_WORKFLOWS]) for (const vision of [true, false]) {
      const specs = tools.toolSpecs(workflow, vision);
      assert(!specs.some(s => s.name === 'Edit'));
      assert.deepEqual(specs.find(s => s.name === 'Patch')!.parameters.required, ['file_path', 'edits']);
      for (const spec of specs.filter(s => !['Write', 'Patch'].includes(s.name)))
        assert.deepEqual(spec, oracle.schemas[`${workflow ?? 'None'}/${vision ? 'True' : 'False'}`].find((s: any) => s.name === spec.name));
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('Patch miss and legacy text audit match Python; context eviction preserves remaining images', async () => {
  const { classifyMiss } = await import('../src/tools/workspace.js');
  const builder = await import('../src/core/builder.js');
  const probes = [['', ''], ['a b', 'a\nb'], ['a\\nb', 'a\nb'], ['测试ABC', '第一行\n测试ABD\n末行'], ['zzzz', 'abc\ndef'], ['a'.repeat(250) + 'x', 'a'.repeat(250) + 'y']];
  const history = Array.from({ length: 4 }, (_, i) => ({ role: 'user', content: [{ type: 'input_image', image_url: String(i) }] }));
  const report = '✗ 页面溢出\n✗ JS 报错\n失败:missing\n失败：not fatal in baseline\n✗ 字号偏小';
  const expected = JSON.parse(execFileSync('python', ['-c', `
import json,sys,copy
from core import builder
from tools.patch.tool import _classify_miss
p=json.load(sys.stdin);low=copy.deepcopy(p['history']);high=copy.deepcopy(low)
print(json.dumps({'miss':[_classify_miss(*row) for row in p['probes']],'low':[builder.evict_images(low,150000),low],'high':[builder.evict_images(high,150001),high],'audit':builder._audit_lines(p['report'])},ensure_ascii=False))
`], { cwd: pythonRoot, input: JSON.stringify({ history, report, probes }), encoding: 'utf8' }));
  assert.deepEqual(probes.map(([old, source]) => classifyMiss(old!, source!)), expected.miss);
  const low = structuredClone(history), high = structuredClone(history);
  assert.deepEqual([builder.evictImages(low, 150000), low], expected.low);
  assert.equal(builder.evictImages(high, 150001), expected.high[0]);
  assert.deepEqual(high.slice(2), history.slice(2));
  assert.ok(high.slice(0, 2).every(item => item.content.every(block => block.type !== 'input_image')));
  assert.deepEqual(builder.auditLines(report), expected.audit);
});

test('Builder loop matches Python natural stop, image feedback, code guard and separate audit', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const builder = await import('../src/core/builder.js');
  await import('../src/adapters/models/runtime.js');
  const root = mkdtempSync(path.join(tmpdir(), 'notale-builder-parity-')), pages = path.join(root, 'pages');
  mkdirSync(pages);
  writeFileSync(path.join(pages, 'page-01.html'), '<html>fixture</html>');
  const call = (name: string, args: object) => ({ name, arguments: JSON.stringify(args) });
  const scenarios = [
    { workflow: 'build-page', rows: [[{ name: 'Write', arguments: '{\"content\":' }, { name: 'Read', arguments: '[1,]' }], [call('Read', { file_path: 'page-01.html' })], []] },
    { workflow: 'build-page', rows: [[call('Write', { file_path: 'page-01.html', content: 'page' }), call('Check', { page: 'page-01.html' })], [call('Patch', { file_path: 'page-01.html', edits: [] }), call('Check', { page: 'page-01.html' })], []] },
    { workflow: 'build-page', rows: [...Array.from({ length: 16 }, () => [call('Read', { file_path: 'page-01.html' })]), []] },
    // Observer code-loop behavior has dedicated tests, not old CodeScaffold-call parity.
    { workflow: 'build-page', vision: false, rows: [[call('Check', { page: 'page-01.html', shot: true, box: [0, 0, 100, 100], zoom: 2 })], []] },
    { workflow: 'build-page', high: true, rows: [[call('Read', { file_path: 'page-01.html' }), call('Read', { file_path: 'page-01.html' }), call('Read', { file_path: 'page-01.html' })], []] },
  ];
  const expected = JSON.parse(execFileSync('python', ['-c', `
import json,sys,io,contextlib
from pathlib import Path
from types import SimpleNamespace as NS
from core import builder,llm,skills
p=json.load(sys.stdin);root=Path(p['root']);results=[]
# Adapt only the renamed Patch argument; keep the Python loop as an independent oracle.
legacy_tag=builder._tag_of
def tag(c):
 if c.name=='Patch':
  a=json.loads(c.arguments);c=NS(name='Patch',arguments=json.dumps({'page':a['file_path'],'edits':a['edits']}))
 return legacy_tag(c)
builder._tag_of=tag
for ix,scenario in enumerate(p['scenarios']):
 count=[0];histories=[];executed=[];codechecks=[]
 def respond(instructions,history,specs,**kw):
  histories.append(json.loads(json.dumps(history)));row=scenario['rows'][count[0]];count[0]+=1
  calls=[llm._Item('function_call',name=c['name'],arguments=c['arguments'],call_id=f'{count[0]}-{i}',id_=f'{count[0]}-{i}') for i,c in enumerate(row)]
  if not calls:calls=[llm._Item('message',text='done')]
  u=NS(input_tokens=150001 if scenario.get('high') else 20,output_tokens=5,input_tokens_details=NS(cached_tokens=10))
  return llm._Resp(calls,u,False,str(count[0]))
 def run(name,args,*rest):
  executed.append([name,args])
  if name=='Patch':return '失败:miss'
  if name=='Check':return builder.tools.Out('<check_use workflow="build-page">guidance</check_use>\\n\\n✗ 页面溢出',[('image/png','YQ==')] if args.get('shot') else [])
  return builder.tools.Out('loaded',[('image/png','YQ==')])
 def codecheck(cwd,pid,shot):codechecks.append(shot);return 'code report',[]
 builder.tools.run=run;builder.code_check.run_browser_check=codecheck;builder.code_runtime.scaffold=lambda *a:{'made':True}
 page=builder.Page('page-01','brief');page.workflow=scenario['workflow'];page.total=1
 rt=NS(respond=respond,replay=llm.ModelRuntime.replay)
 with contextlib.redirect_stdout(io.StringIO()):builder.build_one(page,root/'pages',root/f'py-{ix}.jsonl',skills.WORKFLOWS,'instructions','low',vision_input=scenario.get('vision',True),runtime=rt)
 result={k:v for k,v in vars(page).items() if k!='seconds'}
 results.append(dict(page=result,histories=histories,executed=executed,codechecks=codechecks))
print(json.dumps(results,ensure_ascii=False))
`], { cwd: pythonRoot, input: JSON.stringify({ root, scenarios }), encoding: 'utf8', maxBuffer: 5 * 1024 * 1024 }));
  try {
    for (const [index, raw] of scenarios.entries()) {
      const scenario = raw as typeof raw & { vision?: boolean; high?: boolean };
      const histories: unknown[] = [], executed: unknown[] = [], codechecks: boolean[] = [];
      let count = 0;
      const page = new builder.Page('page-01', 'brief'); page.workflow = scenario.workflow; page.total = 1;
      await builder.buildOne(page, pages, path.join(root, `ts-${index}.jsonl`), 'instructions', {
        model: { async respondCanonical(_instructions, history) {
          histories.push(structuredClone(history));
          const row = scenario.rows[count++]!;
          const output = row.length ? row.map((call, i) => ({ type: 'function_call', ...call, call_id: `${count}-${i}`, id: `${count}-${i}` })) : [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'done' }] }];
          return { id: String(count), output, replay_items: [], raw: {}, status: 'completed', incomplete_details: null, usage: { input_tokens: scenario.high ? 150001 : 20, output_tokens: 5, input_tokens_details: { cached_tokens: 10 } } };
        } },
        async run(name, args) {
          executed.push([name, structuredClone(args)]);
          if (name === 'Patch') return '失败:miss';
          if (name === 'Check') return { text: '<check_use workflow="build-page">guidance</check_use>\n\n✗ 页面溢出', images: args.shot ? [['image/png', 'YQ==']] : [], diagnostics: { fatal_errors: [], visual_warnings: ['✗ 页面溢出'] } };
          return { text: 'loaded', images: [['image/png', 'YQ==']] };
        },
        scaffold: async () => ({ made: true }), codeCheck: async (_cwd, _pid, shot) => { codechecks.push(shot); return { report: 'code report', shots: [] }; }, image: async () => ({ text: '', images: [] }),
      }, { visionInput: scenario.vision ?? true });
      // attempts / stop_reasons are TS-only retry records; Python's page has no counterpart.
      const { seconds: _seconds, attempts: _attempts, stop_reasons: _stopReasons, ...state } = page;
      assert.deepEqual({ page: state, histories, executed, codechecks }, expected[index], `Builder ${index}`);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

for (const shot of [false, true]) test(`full selfcheck measures the same initial, step and after states as Python (shot=${shot})`, async () => {
  const { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const selfcheck = await import('../src/tools/selfcheck.js');
  const root = mkdtempSync(path.join(tmpdir(), 'notale-selfcheck-parity-'));
  mkdirSync(path.join(root, 'assets'));
  for (const file of ['base.css', 'base.js']) copyFileSync(path.join(pythonRoot, 'vendor/chassis', file), path.join(root, 'assets', file));
  const file = path.join(root, 'page-01.html');
  writeFileSync(file, `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="assets/base.css"><style>:root{--bg:#fff;--text:#111;--font-sans:Arial}#moving{position:absolute;left:50px;top:100px;width:200px;font-size:20px}.reveal{position:absolute;left:400px;top:100px;font-size:20px}</style><div id="stage"><div id="moving">第一段内容</div><div class="reveal" data-deck-step="2">第二段内容</div></div><aside class="notes" hidden>这是讲稿，不属于画面文字。</aside><script src="assets/base.js"></script>`);
  const after = ["document.querySelector('#moving').style.left='1700px'; return {computed:2,displayed:2};", "document.querySelector('#moving').style.left='50px'"];
  const shotDir = shot ? path.join(root, '.shots') : undefined;
  const expected = JSON.parse(execFileSync('python', ['-c', `
import json,sys,runpy,asyncio,io,contextlib,hashlib
from pathlib import Path
from PIL import Image
p=json.load(sys.stdin);m=runpy.run_path('vendor/chassis/selfcheck.py')
result=asyncio.run(m['run']([p['file']],after=p['after'],shot_dir=p.get('shotDir'),crop=[-10,90,250,100]))
stream=io.StringIO()
with contextlib.redirect_stdout(stream):
 for name,states in result:m['report'](name,states)
notes=io.StringIO()
with contextlib.redirect_stdout(notes):
 for name,states in result:m['report'](name,states,True)
images={str(f):hashlib.sha256(Image.open(f).convert('RGB').tobytes()).hexdigest() for f in Path(p['shotDir']).glob('*.png')} if p.get('shotDir') else {}
print(json.dumps({'states':result,'report':stream.getvalue(),'notesReport':notes.getvalue(),'images':images},ensure_ascii=False,default=str))
`], { cwd: pythonRoot, input: JSON.stringify({ file, after, shotDir }), encoding: 'utf8', timeout: 30000 }));
  const originalImages = new Map(Object.keys(expected.images).map(file => [file, readFileSync(file)]));
  try {
    const actual = await selfcheck.runSelfcheck([file], { after, ...(shotDir ? { shotDir } : {}), crop: [-10, 90, 250, 100] });
    const measured = actual.map(([name, states]) => [name, states.map(({ cropSize: _cropSize, capture_notes: _captureNotes, ...state }) => state)]);
    assert.deepEqual(measured, expected.states);
    const reportLines = (text: string) => text.split('\n').sort();
    assert.deepEqual(reportLines(actual.map(([name, states]) => selfcheck.report(name, states)).join('')), reportLines(expected.report));
    assert.deepEqual(reportLines(actual.map(([name, states]) => selfcheck.report(name, states, true)).join('')), reportLines(expected.notesReport));
    if (!shot) {
      const { check } = await import('../src/tools/check.js');
      const result = await check({ page: 'page-01.html', shot: false }, { cwd: root, pid: 'page-01', textReport: true });
      const line = expected.notesReport.split('\n').find((line: string) => line.includes('文字 画面'))!.trim();
      assert.ok(result.text.includes(line));
      assert.ok(!expected.report.includes('文字 画面'));
    }
    // Exercise the public command against the same Python oracle, including crop-implies-shot.
    const cli = [path.resolve(guidance.RESOURCES, '../node_modules/tsx/dist/cli.mjs'), path.resolve(guidance.RESOURCES, '../src/cli/main.ts'), 'check'];
    const options = after.flatMap(script => ['--after', script]);
    if (shotDir) options.push('--crop=-10,90,250,100', '--shot-dir', shotDir);
    const json = JSON.parse(execFileSync(process.execPath, [...cli, ...options, '--json'], { cwd: root, encoding: 'utf8', timeout: 30000 }));
    const wanted = expected.states.map(([name, states]: [string, Record<string, any>[]]) => ({ page: name, states: states.map(state => ({
      after: state.label, js_error: state.js_error ?? null, result: state.result ?? null, ...(state.probe ?? {}),
      errors: state.errs, failed: state.bad, viewport_issues: state.viewport_issues ?? [], shot: state.png || null, crop: state.crop || null,
    })) }));
    assert.deepEqual(json, wanted);
    if (!shot) {
      const text = execFileSync(process.execPath, [...cli, file, ...options, '--text-report'], { cwd: root, encoding: 'utf8', timeout: 30000 });
      assert.deepEqual(reportLines(text), reportLines(expected.notesReport));
      const missing = spawnSync(process.execPath, [...cli, 'missing.html'], { cwd: root, encoding: 'utf8', timeout: 10000 });
      assert.equal(missing.status, 2);
      assert.match(missing.stdout, /没找到页面/);
      const bundled = execFileSync(process.execPath, [path.resolve(guidance.RESOURCES, '../dist/diagnostics/selfcheck.mjs'), file, ...options, '--text-report'], { cwd: root, encoding: 'utf8', timeout: 30000 });
      assert.deepEqual(reportLines(bundled), reportLines(expected.notesReport));
    }
    const sharp = (await import('sharp')).default;
    for (const [file, digest] of Object.entries(expected.images)) {
      const pixels = await sharp(file).removeAlpha().raw().toBuffer();
      const original = await sharp(originalImages.get(file)!).removeAlpha().raw().toBuffer();
      const differences = [...pixels.keys()].filter(i => pixels[i] !== original[i]);
      assert.equal(createHash('sha256').update(pixels).digest('hex'), digest, `${file}: ${differences.length} channels differ; first ${differences.slice(0, 12).map(i => `${i}:${original[i]}→${pixels[i]}`).join(', ')}`);
    }
    assert.ok(actual[0]![1][1]!.probe!.escaped.length > 0);
    assert.equal(actual[0]![1][2]!.probe!.escaped.length, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('Check RGB resizing matches Pillow pixels for downscale, crop and enlargement', async () => {
  const { resizeRgb, resizeRgbPng, thumbnailJpeg } = await import('../src/tools/image-resample.js');
  const sharp = (await import('sharp')).default;
  const thumbnails = JSON.parse(execFileSync('python', ['-c', `
import io,json,base64,hashlib
from PIL import Image
rows=[]
for w,h,limit in [(31,17,900),(200,137,70),(137,200,70),(1023,719,90),(91,777,22),(1800,901,900)]:
 im=Image.frombytes('RGB',(w,h),bytes((i*73+(i//11)*19)%256 for i in range(w*h*3)))
 source=io.BytesIO();im.save(source,'PNG');im.thumbnail((limit,limit));out=io.BytesIO();im.save(out,'JPEG',quality=82)
 rows.append({'input':base64.b64encode(source.getvalue()).decode(),'limit':limit,'size':im.size,'sha':hashlib.sha256(out.getvalue()).hexdigest()})
print(json.dumps(rows))
`], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }));
  const cmyk = JSON.parse(execFileSync('python', ['-c', `
import io,json,base64,hashlib
from PIL import Image
rows=[]
for w,h in [(200,137),(1701,5)]:
 source=io.BytesIO();Image.frombytes('CMYK',(w,h),bytes((i*73+i//11*19)%256 for i in range(w*h*4))).save(source,'JPEG',quality=95)
 im=Image.open(io.BytesIO(source.getvalue())).convert('RGB')
 scaled=im.resize((1600,5),Image.Resampling.LANCZOS)
 im.thumbnail((70,70));out=io.BytesIO();im.save(out,'JPEG',quality=82)
 rows.append({'input':base64.b64encode(source.getvalue()).decode(),'limit':70,'size':im.size,'sha':hashlib.sha256(out.getvalue()).hexdigest(),'scaledHash':hashlib.sha256(scaled.tobytes()).hexdigest()})
print(json.dumps(rows))
`], { encoding: 'utf8' }));
  thumbnails.push(...cmyk);
  const profiled = await sharp(Buffer.from(thumbnails[1].input, 'base64')).withIccProfile('p3').png().toBuffer();
  thumbnails.push(JSON.parse(execFileSync('python', ['-c', `
import io,json,base64,hashlib,sys
from PIL import Image
source=sys.stdin.buffer.read(); original=Image.open(io.BytesIO(source))
assert original.info.get('icc_profile')
im=original.convert('RGB'); im.thumbnail((70,70)); out=io.BytesIO();im.save(out,'JPEG',quality=82)
print(json.dumps({'input':base64.b64encode(source).decode(),'limit':70,'size':im.size,'sha':hashlib.sha256(out.getvalue()).hexdigest()}))
`], { input: profiled, encoding: 'utf8' })));
  for (const fixture of thumbnails) {
    const output = await thumbnailJpeg(Buffer.from(fixture.input, 'base64'), fixture.limit);
    assert.deepEqual([output.width, output.height], fixture.size);
    assert.equal(createHash('sha256').update(output.data).digest('hex'), fixture.sha, `thumbnail ${fixture.size}`);
    if (fixture.scaledHash) {
      const resized = await resizeRgbPng(Buffer.from(fixture.input, 'base64'), 1600, 5);
      assert.equal(createHash('sha256').update(await sharp(resized).raw().toBuffer()).digest('hex'), fixture.scaledHash);
    }
  }
  const modes = JSON.parse(execFileSync('python', ['-c', `
import io,json,base64,hashlib
from PIL import Image
rows=[]
for mode in ['RGBA','LA','L','P','I;16']:
 im=Image.new(mode,(1701,5))
 if mode=='P': im.putpalette([(i*37)%256 for i in range(768)]);im.info['transparency']=bytes(range(256))
 im.putdata([tuple((i*73+c*19)%256 for c in range(len(mode))) if mode in ('RGBA','LA') else ((i*129)%65536 if mode=='I;16' else i%256) for i in range(1701*5)])
 buf=io.BytesIO();im.save(buf,'PNG')
 result=im.convert('RGB').resize((1600,5),Image.Resampling.LANCZOS)
 small=io.BytesIO();im.crop((0,0,4,1)).save(small,'PNG')
 rows.append({'mode':mode,'png':base64.b64encode(buf.getvalue()).decode(),'small':base64.b64encode(small.getvalue()).decode(),'hash':hashlib.sha256(result.tobytes()).hexdigest()})
print(json.dumps(rows))
`], { encoding: 'utf8' }));
  for (const fixture of modes) {
    const output = await resizeRgbPng(Buffer.from(fixture.png, 'base64'), 1600, 5);
    const pixels = await sharp(output).raw().toBuffer();
    assert.equal(createHash('sha256').update(pixels).digest('hex'), fixture.hash, fixture.mode);
  }
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { imageOutput } = await import('../src/tools/check.js');
  const root = await mkdtemp(path.join(tmpdir(), 'notale-image-mode-'));
  try {
    const { images } = await import('../src/core/style-assets.js');
    for (const fixture of thumbnails) {
      const shot = path.join(root, 'custom-reference.png');
      await writeFile(shot, Buffer.from(fixture.input, 'base64'));
      const blocks = await images([{ id: 'custom', shot }], fixture.limit);
      assert.deepEqual(blocks[0], { type: 'text', text: `参考 custom: ${shot} (${fixture.size[0]}×${fixture.size[1]}, sha256=${fixture.sha})` });
      const encoded = (blocks[1] as { type: string; image_url: { url: string } }).image_url.url.split(',')[1]!;
      assert.equal(createHash('sha256').update(Buffer.from(encoded, 'base64')).digest('hex'), fixture.sha);
    }
    const cmykFile = path.join(root, 'small-cmyk.jpg');
    await writeFile(cmykFile, Buffer.from(cmyk[0].input, 'base64'));
    const cmykError = JSON.parse(execFileSync('python', ['-c', `
import json,sys
from pathlib import Path
from tools.shared.image import _image
try:_image(Path(sys.argv[1]))
except Exception as error:print(json.dumps({'name':type(error).__name__,'message':str(error)}))
`, cmykFile], { cwd: pythonRoot, encoding: 'utf8' }));
    await assert.rejects(imageOutput(cmykFile), cmykError);
    const profileFiles = [path.join(root, 'profile-small.png'), path.join(root, 'profile-large.png')];
    await writeFile(profileFiles[0]!, profiled);
    await writeFile(profileFiles[1]!, await sharp(profiled).resize(1701, 5).withIccProfile('p3').png().toBuffer());
    const profileOutputs = JSON.parse(execFileSync('python', ['-c', `
import json,sys
from pathlib import Path
from tools.shared.image import _image
rows=[]
for file in json.load(sys.stdin):
 out=_image(Path(file));rows.append({'text':out.text,'png':out.images[0][1]})
print(json.dumps(rows))
`], { cwd: pythonRoot, input: JSON.stringify(profileFiles), encoding: 'utf8' }));
    for (const [index, file] of profileFiles.entries()) {
      const actual = await imageOutput(file), reference = profileOutputs[index];
      const actualPng = Buffer.from(actual.images[0]![1], 'base64'), expectedPng = Buffer.from(reference.png, 'base64');
      assert.equal(actual.text, reference.text);
      assert.deepEqual((await sharp(actualPng).metadata()).icc, (await sharp(expectedPng).metadata()).icc);
      assert.deepEqual(await sharp(actualPng, { ignoreIcc: true }).raw().toBuffer(), await sharp(expectedPng, { ignoreIcc: true }).raw().toBuffer());
    }
    const file = path.join(root, 'gray16.png');
    await writeFile(file, Buffer.from(modes.find((row: any) => row.mode === 'I;16').small, 'base64'));
    const result = await imageOutput(file);
    const png = Buffer.from(result.images[0]![1], 'base64');
    assert.equal((await sharp(png).metadata()).depth, 'ushort');
    const samples = await sharp(png).toColourspace('grey16').raw({ depth: 'ushort' }).toBuffer();
    assert.deepEqual([...new Uint16Array(samples.buffer, samples.byteOffset, samples.length / 2)], [0, 129, 258, 387]);
  } finally { await rm(root, { recursive: true, force: true }); }
  const cases = [[17, 13, 31, 29], [320, 180, 80, 45], [1600, 900, 800, 450], [17, 13, 17, 7], [17, 13, 8, 13], [1, 3, 7, 9]];
  const expected = JSON.parse(execFileSync('python', ['-c', `
import json,sys,hashlib
from PIL import Image
results=[]
for w,h,ow,oh in json.load(sys.stdin):
 data=bytes((i*73+(i//11)*19)%256 for i in range(w*h*3))
 image=Image.frombytes('RGB',(w,h),data).resize((ow,oh),Image.Resampling.LANCZOS)
 results.append(hashlib.sha256(image.tobytes()).hexdigest())
print(json.dumps(results))
`], { input: JSON.stringify(cases), encoding: 'utf8' }));
  for (const [index, dimensions] of cases.entries()) {
    const [w, h, ow, oh] = dimensions as [number, number, number, number];
    const input = Buffer.from(Array.from({ length: w * h * 3 }, (_, i) => (i * 73 + Math.floor(i / 11) * 19) % 256));
    const actual = resizeRgb(input, w, h, ow, oh);
    assert.equal(createHash('sha256').update(actual).digest('hex'), expected[index], dimensions.join('x'));
  }
  const input = Buffer.from(Array.from({ length: 17 * 13 * 3 }, (_, i) => (i * 73 + Math.floor(i / 11) * 19) % 256));
  const encoded = await sharp(input, { raw: { width: 17, height: 13, channels: 3 } }).png().toBuffer();
  const cropped = await resizeRgbPng(encoded, 18, 14, { left: 2, top: 3, width: 9, height: 7 });
  const reference = execFileSync('python', ['-c', `
import sys,io
from PIL import Image
sys.stdout.buffer.write(Image.open(io.BytesIO(sys.stdin.buffer.read())).crop((2,3,11,10)).resize((18,14),Image.Resampling.LANCZOS).tobytes())
`], { input: encoded });
  assert.deepEqual(await sharp(cropped).raw().toBuffer(), reference);
});


test('media requests, public IP rules and search response gates match Python', async () => {
  const { mkdtempSync, rmSync, mkdirSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { requestBody, search, mediaError } = await import('../src/tools/image-search.js');
  const { publicAddress } = await import('../src/tools/media-transport.js');
  const { queriesOf } = await import('../src/tools/image-search.js');
  const queryInputs: unknown[]=['', ' ', '\u0085', '\u001c', '\ufeff', '需求', ['需求','\u0085'], ['\ufeff'], [], null, 1];
  const queryOracle=JSON.parse(execFileSync('python',['-c',`
import json,sys
from tools.image_search import tool
out=[]
for value in json.load(sys.stdin):
 try:out.append({'queries':tool.queries_of(value)})
 except Exception as e:out.append({'name':type(e).__name__,'message':str(e)})
print(json.dumps(out))
`],{cwd:pythonRoot,input:JSON.stringify(queryInputs),encoding:'utf8'}));
  queryInputs.forEach((value,index)=>{let actual;try{actual={queries:queriesOf(value)};}catch(error){actual={name:(error as Error).name,message:(error as Error).message};}assert.deepEqual(actual,queryOracle[index]);});

  const addresses = ['8.8.8.8', '127.0.0.1', '192.0.0.9', '192.0.0.8', '100.64.0.1', '224.1.2.3', '198.51.100.1', '2001:4860:4860::8888', '::ffff:8.8.8.8', '::ffff:127.0.0.1', '2001:1::1', '2001:db8::1', '64:ff9b:1::8', '3fff::1'];
  const response = (parts: unknown[], extra = {}) => ({ candidates: [{ finishReason: 'STOP', content: { parts }, ...extra }] });
  const grounded = (text: unknown) => response([{ text }], { groundingMetadata: { webSearchQueries: ['query'] } });
  const fixtures = [{}, { candidates: [{ finishReason: 'MAX_TOKENS' }] }, response([]), grounded(null), grounded('{}'),
    grounded('{"queries":[]}'), grounded('{"queries":[{"query_index":0,"results":[]},{"query_index":0,"results":[]}]}'),
    grounded('{"queries":[{"query_index":0,"results":[{"title":"bad"}]}]}')];
  fixtures.push(...['', '{"queries":', '{"😀":x}', '[1,]', '{"a" 1}', '{a:1}',
    '"bad\\x"', '"\\u123x"', '"unclosed', '"line\n"', '{} trailing', '\uFEFF{}',
    '{"queries":[],"number":NaN}', '{"queries":[],"number":-Infinity}',
    '{"queries":[],"__proto__":{"queries":[1]}}',
    '{"queries":false,"queries":[]}',
    ...['0.0','0e0','true','0'].map(index => '{"queries":[{"query_index":'+index+',"results":[]}]}'),
  ].map(grounded));
  fixtures.push(...[{},[],true,false,1,0].map(thought=>response([{toolCall:{toolType:'GOOGLE_SEARCH_WEB'}},{text:'{"queries":[]}',thought}])));
  fixtures.push(...[{},[],true,false,1,0].map(webSearchQueries=>response([{text:'{"queries":[]}'}],{groundingMetadata:{webSearchQueries}})));
  const { jsonText, parsePythonJson } = await import('../src/core/json.js');
  const serialInputs = ['NaN','Infinity','-Infinity','{"a":NaN,"b":[Infinity,-Infinity,null]}','{"text":"NaN, Infinity: \\\"quoted\\\"","汉":1}','[{},[],true,false,0]'];
  serialInputs.push('{"x":1.0,"y":-0.0,"integer":-0,"nested":[1e0,1e-5,1e-4,1e16,1e15,1.23e20,1.25e-7]}');
  serialInputs.push(...['5e-324','2.2250738585072014e-308','1.7976931348623157e308','0.00009999999999999999','1.0000000000000002','9007199254740991.0'].map(n=>'{"x":'+n+'}'));
  serialInputs.push('{"10":"ten","2":"two","a":1,"0":0}','{"nested":{"9":9,"1":1},"02":2,"2":2}',
    '{"2":0,"1":1,"2":2.0,"__proto__":{"3":3,"0":0}}','{"4294967295":1,"4294967294":2,"0":3,"-1":4}');
  serialInputs.push('{"n":9007199254740993,"negative":-9007199254740993,"nested":[100000000000000000000,1e20]}',
    '{"n":'+ '9'.repeat(4300) +'}', '{"n":9007199254740993,"n":1.0}', '{"n":1.0,"n":9007199254740993}');
  const serialExpected = JSON.parse(execFileSync('python',['-c',`
import json,sys
print(json.dumps([json.dumps(json.loads(s),ensure_ascii=False) for s in json.load(sys.stdin)]))
`],{input:JSON.stringify(serialInputs),encoding:'utf8'}));
  serialInputs.forEach((text,index)=>assert.equal(jsonText(parsePythonJson(text)),serialExpected[index]));
  const zeroInputs = ['-0', '0', '-0.0', '0.0', '-0e0'];
  const zeroOracle = JSON.parse(execFileSync('python', ['-c', `
import json,sys,math
out=[]
for text in json.load(sys.stdin):
 value=json.loads(text)
 out.append({'floating':isinstance(value,float),'negative':math.copysign(1,value)<0,'text':json.dumps({'value':value})})
print(json.dumps(out))
`], { input: JSON.stringify(zeroInputs), encoding: 'utf8' }));
  const { isPythonIntegerField } = await import('../src/core/json.js');
  zeroInputs.forEach((text,index) => {
    const root: Record<string, unknown> = {}, value = parsePythonJson(text, root);
    assert.deepEqual({ floating: !isPythonIntegerField(root, 'value'), negative: Object.is(value, -0), text: jsonText(root) }, zeroOracle[index]);
  });

  const root = mkdtempSync(path.join(tmpdir(), 'notale-media-gates-'));
  const expected = JSON.parse(execFileSync('python', ['-c', `
import sys,json,ipaddress,tempfile,httpx,os
from pathlib import Path
from tools.image_search import tool
from core import llm
p=json.load(sys.stdin);llm.config=lambda:{};os.environ['GEMINI_API_KEY']='fake-key'
rows=[]
for fixture in p['fixtures']:
 tool.httpx.post=lambda *a,**kw:httpx.Response(200,json=fixture,request=httpx.Request('POST',tool.ENDPOINT))
 with tempfile.TemporaryDirectory() as root:rows.append(tool.search(['a','b'],7,Path(root)))
print(json.dumps(dict(body=tool.request_body(['主体与用途','第二个需求'],7),addresses=[ipaddress.ip_address(a).is_global for a in p['addresses']],rows=rows),ensure_ascii=False))
`], { cwd: pythonRoot, input: JSON.stringify({ fixtures, addresses }), encoding: 'utf8' }));
  try {
    const retryValues = ['12', '0', '-1', '1.5', 'Wed, 21 Oct 2015 07:28:00 GMT', ''];
    const httpErrors = JSON.parse(execFileSync('python', ['-c', `
import json,sys,httpx
from tools.shared.media import _error
rows=[]
for delay in json.load(sys.stdin):
 response=httpx.Response(429,headers={'Retry-After':delay},text='private response body',request=httpx.Request('POST','https://example.org',headers={'Authorization':'Bearer private-header'}))
 try:response.raise_for_status()
 except Exception as e:rows.append(_error('fixture',e))
print(json.dumps(rows))
`], { cwd: pythonRoot, input: JSON.stringify(retryValues), encoding: 'utf8' }));
    assert.deepEqual(retryValues.map(retryAfter => mediaError('fixture', Object.assign(new Error('private response body'), {
      name: 'HTTPStatusError', status: 429, statusText: 'Too Many Requests', retryAfter,
    }), {})), httpErrors);
    assert.deepEqual(requestBody(['主体与用途', '第二个需求'], 7), expected.body);
    assert.deepEqual(addresses.map(publicAddress), expected.addresses);
    for (const [index, fixture] of fixtures.entries()) {
      const out = path.join(root, String(index)); mkdirSync(out);
      const actual = await search(['a', 'b'], 7, out, { env: { GEMINI_API_KEY: 'fake-key' }, fetch: async () => new Response(JSON.stringify(fixture)) });
      assert.deepEqual(actual, expected.rows[index], `search gate ${index}`);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('shared media executor preserves candidates, Commons provenance and counts above old TS limits', async () => {
  const { mkdtempSync, rmSync, mkdirSync, readdirSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { Readable } = await import('node:stream');
  const sharp = (await import('sharp')).default;
  const { decodeGenerationBase64, fetchMedia, generate, mediaCall, writeCredits } = await import('../src/tools/media-execution.js');
  const root = mkdtempSync(path.join(tmpdir(), 'notale-media-output-'));
  const pyPages = path.join(root, 'python/pages'), tsPages = path.join(root, 'typescript/pages');
  mkdirSync(pyPages, { recursive: true }); mkdirSync(tsPages, { recursive: true });
  const png = await sharp({ create: { width: 3, height: 2, channels: 3, background: '#cd3749' } }).png().toBuffer();
  const candidates = Array.from({ length: 6 }, (_, i) => ({ title: `image ${i}`, page_url: `https://example.org/page/${i}`, image_url: `https://example.org/image/${i}.png` }));
  const payload = { queries: [{ query_index: 0, results: [...candidates, candidates[0]] }, { query_index: 1, results: [{ title: 'Commons main', page_url: 'https://commons.wikimedia.org/wiki/File:Demo.png', image_url: 'https://example.org/wrong.png' }] }] };
  const provider = { candidates: [{ finishReason: 'STOP', content: { parts: [{ toolCall: { toolType: 'GOOGLE_SEARCH_WEB' } }, { text: JSON.stringify(payload) }] } }] };
  const html = '<img src="/unrelated.png"><div class="fullImageLink" id="file"><div><img src="https://example.org/main.png?a=1&amp;b=2"></div></div>';
  try {
    const oversized=JSON.parse(execFileSync('python',['-c',`
import json,struct,tempfile,base64
from pathlib import Path
from io import BytesIO
from PIL import Image
from tools.shared.media import image_info
stream=BytesIO();Image.new('L',(1,1)).save(stream,format='TIFF');template=stream.getvalue();rows=[]
for size in [1,10000,20000]:
 raw=bytearray(template);endian='<' if raw[:2]==b'II' else '>';offset=struct.unpack_from(endian+'I',raw,4)[0];count=struct.unpack_from(endian+'H',raw,offset)[0]
 for i in range(count):
  at=offset+2+12*i;tag,kind,n,value=struct.unpack_from(endian+'HHII',raw,at)
  if tag in (256,257):struct.pack_into(endian+'HHII',raw,at,tag,4,1,size)
 with tempfile.TemporaryDirectory() as root:
  file=Path(root)/'image.tiff';file.write_bytes(raw)
  try:result={'value':image_info(file)}
  except Exception as e:result={'name':type(e).__name__,'message':str(e)}
 rows.append({'bytes':base64.b64encode(raw).decode(),'result':result})
print(json.dumps(rows))
`],{cwd:pythonRoot,encoding:'utf8'}));
    const { imageInfo } = await import('../src/tools/media-transport.js');
    const { writeFileSync: writeFixture } = await import('node:fs');
    for(const [index,fixture] of oversized.entries()) {
      const file=path.join(root,`size-${index}.tiff`);writeFixture(file,Buffer.from(fixture.bytes,'base64'));
      let actual;try{actual={value:await imageInfo(file)};}catch(error){actual={name:(error as Error).name,message:(error as Error).message};}
      assert.deepEqual(actual,fixture.result);
    }

    const expected = JSON.parse(execFileSync('python', ['-c', `
import sys,json,io,base64,os,httpx
from pathlib import Path
from types import SimpleNamespace as NS
from urllib.parse import urlsplit
from tools import runtime
from tools.shared import media
from tools.image_search import tool
from core import llm
p=json.load(sys.stdin);pages=Path(p['pages']);llm.config=lambda:{};os.environ['GEMINI_API_KEY']='fake-key'
requests=[]
tool.httpx.post=lambda *a,**kw:httpx.Response(200,json=p['provider'],request=httpx.Request('POST',tool.ENDPOINT))
class Conn:
 def __init__(self,url):self.url=url;self.sock=None
 def request(self,*a,**kw):requests.append(self.url)
 def close(self):pass
 def getresponse(self):
  html='commons.wikimedia.org' in self.url;stream=io.BytesIO(p['html'].encode() if html else base64.b64decode(p['png']))
  return NS(status=200,reason='OK',getheader=lambda k:'text/html' if html else 'image/png',read=stream.read)
media._public_connection=lambda url,timeout:(Conn(url),urlsplit(url))
result=runtime.media_call('ImageSearch',{'query':['a','b'],'count':6},pages,'planner');media.write_credits(pages)
directory=next(p for p in (pages/'assets/img').iterdir() if p.is_dir() and p.name.startswith('planner-'))
print(json.dumps(dict(text=json.loads(result.text),images=len(result.images),requests=requests,attribution=json.loads((directory/'attribution.json').read_text()),credits=(pages/'assets/img/CREDITS.md').read_text()),ensure_ascii=False))
`], { cwd: pythonRoot, input: JSON.stringify({ pages: pyPages, provider, html, png: png.toString('base64') }), encoding: 'utf8' }));
    const requests: string[] = [];
    const options = { env: { GEMINI_API_KEY: 'fake-key' }, fetch: (async () => new Response(JSON.stringify(provider))) as typeof fetch,
      publicGet: async (url: string) => {
        requests.push(url); const isHtml = url.includes('commons.wikimedia.org');
        return Object.assign(Readable.from([isHtml ? Buffer.from(html) : png]), { statusCode: 200, statusMessage: 'OK', headers: { 'content-type': isHtml ? 'text/html' : 'image/png' } }) as unknown as import('node:http').IncomingMessage;
      } };
    const result = await mediaCall('ImageSearch', { query: ['a', 'b'], count: 6 }, tsPages, 'planner', options);
    await writeCredits(tsPages);
    const normalize = (value: unknown) => JSON.stringify(value).replace(/planner-[a-f0-9]{12}/g, 'planner-<id>');
    const directory = readdirSync(path.join(tsPages, 'assets/img')).find(name => name.startsWith('planner-'))!;
    assert.equal(normalize(JSON.parse(result.text)), normalize(expected.text));
    assert.equal(result.images.length, expected.images); assert.equal(result.images.length, 7);
    assert.deepEqual(requests, expected.requests);
    assert.equal(normalize(JSON.parse(readFileSync(path.join(tsPages, 'assets/img', directory, 'attribution.json'), 'utf8'))), normalize(expected.attribution));
    assert.equal(normalize(readFileSync(path.join(tsPages, 'assets/img/CREDITS.md'), 'utf8')), normalize(expected.credits));
    for (const [, data] of result.images) assert.deepEqual(await sharp(Buffer.from(data, 'base64')).raw().toBuffer(), await sharp(png).raw().toBuffer());
    const failures = [{status:200,text:'{"data":{}}'},{status:200,text:'{"data":[{"b64_json":[],"url":{}}]}'},{status:400,text:'\ufefferror\r\n详情'},{status:200,text:JSON.stringify({message:'DEL\x7f'})},{status:400,text:'😀'.repeat(401)},{status:200,text:JSON.stringify({message:'没有图片😀'.repeat(40)})},{status:200,text:'{"data":[]}'},{status:200,text:'{"data":[],"score":NaN}'}];
    const failureMessages = JSON.parse(execFileSync('python',['-c',`
import json,sys,io,urllib.error
from tools.image_gen import gen
out=[];requests=[];gen.api_key=lambda:'fake-key'
for fixture in json.load(sys.stdin):
 def request(*a,**kw):
  requests.append(a[0].data.decode());body=fixture['text'].encode()
  if fixture['status']>=400:raise urllib.error.HTTPError(gen.ENDPOINT,fixture['status'],'fixture',{},io.BytesIO(body))
  return io.BytesIO(body)
 gen.urllib.request.urlopen=request
 try:gen.generate('test 汉😀'+chr(127),'2048x1152',1);out.append(None)
 except SystemExit as e:out.append(dict(message=str(e),body=requests[-1]))
print(json.dumps(out))
`],{cwd:pythonRoot,input:JSON.stringify(failures),encoding:'utf8'}));
    for (const [index,fixture] of failures.entries()) {
      await assert.rejects(generate('test 汉😀\x7f',1,tsPages,{env:{PARATERA_API_KEY:'fake-key'},fetch:async(_url,init)=>{assert.equal(init!.body,failureMessages[index].body);return new Response(fixture.text,{status:fixture.status});}}),error => error instanceof Error && error.name==='RuntimeError' && error.message===failureMessages[index].message);
    }
    const encoded: unknown[] = [[],{},true,null,1,1.5,['YQ=='],{value:'YQ=='},'a','ab','abc','abcd','ab=','ab==','a===','====','ab===','abcd=','ab==cd','a-b_','abcd====a','é','ab=!=','abc=ignored','a\nb= ='];
    let seed=1829;const alphabet='ab+/=_-!';
    for(let i=0;i<128;i++) {let value='';for(let n=0;n<i%13;n++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;value+=alphabet[seed%alphabet.length];}encoded.push(value);}
    const decoded = JSON.parse(execFileSync('python',['-c',`
import json,sys,base64
out=[]
for value in json.load(sys.stdin):
 try:out.append({'hex':base64.b64decode(value).hex()})
 except Exception as e:out.append({'name':type(e).__name__,'message':str(e)})
print(json.dumps(out))
`],{input:JSON.stringify(encoded),encoding:'utf8'}));
    for(const [index,value] of encoded.entries()) {
      let actual;try{actual={hex:decodeGenerationBase64(value).toString('hex')};}catch(error){actual={name:(error as Error).name,message:(error as Error).message};}
      assert.deepEqual(actual,decoded[index],`base64 ${JSON.stringify(value)}`);
    }
    const jsonResponses = ['1.0', '1e0', '{"data":[{"url":true}]}', '{"data":[{"url":1}]}', '{"data":[{"url":1.5}]}', '{"data":[{"url":[1]}]}', '{"data":[{"url":{"x":1}}]}', 'null', '[]', 'true', '1', '1.5', '"bad"', '{"data":true}', '{"data":1}', '{"data":1.5}', '{"data":{"key":{}}}', '{"data":[null]}', '{"data":[[]]}', '{"data":[1]}', '{"data":[{"b64_json":["YQ=="]}]}', '{"data":[{"b64_json":{"value":"YQ=="}}]}', '{"data":[{"b64_json":true}]}', '{"data":[{"b64_json":1.5}]}', '{"data":[{"b64_json":[],"url":"https://fixture.invalid/image"}]}', '{"data":[{"b64_json":{},"url":"https://fixture.invalid/image"}]}', '', '{"data":', '{"😀":x}', '{"data":[]} trailing', '{"x":"line\r\nbreak"}',
      '{"data":[{"b64_json":"YQ=="}],"ignored":NaN}', '{"data":[{"b64_json":"YQ=="}],"ignored":Infinity}',
      '{"data":[{"b64_json":"YQ=="}],"ignored":-Infinity}', '\ufeff{"data":[{"b64_json":"YQ=="}]}'];
    const overflowingNumbers = ['9'.repeat(400), '-' + '9'.repeat(400), '1e400', '-1e400'];
    jsonResponses.push(...overflowingNumbers);
    for (const literal of ['1.0', '1e0', ...overflowingNumbers]) jsonResponses.push(
      `{"data":${literal}}`, `{"data":[${literal}]}`, `{"data":[{"b64_json":${literal}}]}`, `{"data":[{"url":${literal}}]}`);
    const parsedResponses = JSON.parse(execFileSync('python',['-c',`
import json,sys,io
from tools.image_gen import gen
out=[];gen.api_key=lambda:'fake-key';original=gen.urllib.request.urlopen
for body in json.load(sys.stdin):
 def request(value,**kw):
  if isinstance(value,gen.urllib.request.Request):return io.BytesIO(body.encode('utf-8'))
  if isinstance(value,str):return io.BytesIO(b'image')
  return original(value,**kw)
 gen.urllib.request.urlopen=request
 try:out.append({'images':[b.hex() for b in gen.generate('test','2048x1152',1)]})
 except Exception as e:out.append({'name':type(e).__name__,'message':str(e)})
print(json.dumps(out))
`],{cwd:pythonRoot,input:JSON.stringify(jsonResponses),encoding:'utf8'}));
    for(const [index,body] of jsonResponses.entries()) {
      const jsonOut=path.join(root,`json-${index}`);mkdirSync(jsonOut);
      let actual, requests = 0;
      try {const rows=await generate('test',1,jsonOut,{env:{PARATERA_API_KEY:'fake-key'},fetch:async url=>{requests++;return new Response(url==='https://fixture.invalid/image'?'image':body);}});actual={images:rows.map(row=>readFileSync(path.join(jsonOut,row.file)).toString('hex'))};}
      catch(error){actual={name:(error as Error).name,message:(error as Error).message};}
      assert.deepEqual(actual,parsedResponses[index],`ImageGen JSON ${index}`);
      if (parsedResponses[index].name) assert.equal(requests, 1, 'invalid provider response must not initiate a download');
    }
    const { parsePythonJsonBytes } = await import('../src/core/json.js');
    const byteCases = JSON.parse(execFileSync('python',['-c',String.raw`
import json
values=[]
for encoding in ['utf-8','utf-8-sig','utf-16','utf-16-le','utf-16-be','utf-32','utf-32-le','utf-32-be']:
 for text in ['{"text":"汉😀"}','{"text":"\ud800"}','{"text":"\udfff"}','[\r\n1,]','{"x":','{}','{"data":[{"b64_json":"YQ=="}]}']:
  values.append(text.encode(encoding,errors='surrogatepass'))
values.extend(bytes.fromhex(s) for s in ['ff','22ff22','fffe7b','fffe00007b','0000feff00110000','fffe00d8','fffe00d861','00007b','efbbbf22ff22','eda080','eda0'])
out=[]
for data in values:
 try: result={'value':json.loads(data)}
 except Exception as e:result={'name':type(e).__name__,'message':str(e)}
 out.append({'hex':data.hex(),'result':result})
print(json.dumps(out))
`],{encoding:'utf8'}));
    for(const {hex,result} of byteCases) {
      let actual;try{actual={value:parsePythonJsonBytes(Buffer.from(hex,'hex'))};}catch(error){actual={name:(error as Error).name,message:(error as Error).message};}
      assert.deepEqual(actual,result,`JSON bytes ${hex}`);
      if (result.value?.data) {
        const rows = await generate('encoded',1,tsPages,{env:{PARATERA_API_KEY:'fake-key'},fetch:async()=>new Response(new Uint8Array(Buffer.from(hex,'hex')))});
        assert.equal(readFileSync(path.join(tsPages,rows[0]!.file)).toString('hex'),'61');
      }
    }
    const repeatPages=path.join(root,'repeat-ts'), repeatOut=path.join(repeatPages,'assets/img/page-01-repeat');mkdirSync(repeatOut,{recursive:true});
    const previousRecords='[{"file":"old.png","prompt":"existing","10":1.0,"2":-0.0,"metadata":{"numbers":[1.0,1e-5,NaN,9007199254740993],"empty":[],"object":{}}}]';
    const { writeFileSync } = await import('node:fs');
    writeFileSync(path.join(repeatOut,'illustrations.json'),previousRecords);
    writeFileSync(path.join(repeatOut,'old.png'),'old image');
    const repeated=JSON.parse(execFileSync('python',['-c',`
import json,sys,contextlib,io
from pathlib import Path
from tools.image_gen import gen
root=Path(sys.argv[1]);out=[];root.mkdir()
(root/'illustrations.json').write_text(sys.stdin.read())
for prompt,n in [('first 中文',2),('second 😀',1)]:
 gen.generate=lambda *args:[b'image']*n
 sys.argv=['gen.py',prompt,'--n',str(n),'--out',str(root/'image.png')]
 with contextlib.redirect_stdout(io.StringIO()):gen.main()
 out.append((root/'illustrations.json').read_text())
print(json.dumps(out))
` ,path.join(root,'repeat-python')],{cwd:pythonRoot,input:previousRecords,encoding:'utf8'}));
    for(const [index,[prompt,n]] of ([['first 中文',2],['second 😀',1]] as const).entries()) {
      const rows=await generate(prompt,n,repeatOut,{env:{PARATERA_API_KEY:'fake-key'},fetch:async()=>new Response(JSON.stringify({data:Array.from({length:n},()=>({b64_json:Buffer.from('image').toString('base64')}))}))});
      assert.deepEqual(rows,parsePythonJsonBytes(Buffer.from(repeated[index])));
      assert.equal(readFileSync(path.join(repeatOut,'illustrations.json'),'utf8'),repeated[index]);
    }
    const invalidRecords = ['{}', 'null', '"old"', '1', '1.0', '1e0', ...overflowingNumbers];
    const recordFailures = JSON.parse(execFileSync('python', ['-c', `
import json,sys,io,contextlib
from pathlib import Path
from tools.image_gen import gen
root=Path(sys.argv[1]);root.mkdir();results=[]
for index,text in enumerate(json.load(sys.stdin)):
 folder=root/str(index);folder.mkdir();log=folder/'illustrations.json';log.write_text(text)
 gen.generate=lambda *args:[b'image']
 sys.argv=['gen.py','test','--out',str(folder/'image.png')]
 try:
  with contextlib.redirect_stdout(io.StringIO()):gen.main()
 except Exception as e:results.append({'name':type(e).__name__,'message':str(e),'manifest':log.read_text(),'image':(folder/'image.png').read_bytes().hex()})
print(json.dumps(results))
`, path.join(root, 'invalid-records-python')], { cwd: pythonRoot, input: JSON.stringify(invalidRecords), encoding: 'utf8' }));
    for (const [index, text] of invalidRecords.entries()) {
      const folder = path.join(root, `invalid-records-ts-${index}`); mkdirSync(folder);
      writeFileSync(path.join(folder, 'illustrations.json'), text);
      let actual;
      try { await generate('test', 1, folder, { env: { PARATERA_API_KEY: 'fake-key' }, fetch: async () => new Response('{"data":[{"b64_json":"aW1hZ2U="}]}') }); }
      catch (error) { actual = { name: (error as Error).name, message: (error as Error).message, manifest: readFileSync(path.join(folder, 'illustrations.json'), 'utf8'), image: readFileSync(path.join(folder, 'image.png')).toString('hex') }; }
      assert.deepEqual(actual, recordFailures[index]);
    }
    const { mediaSources } = await import('../src/tools/media-execution.js');
    const { jsonText } = await import('../src/core/json.js');
    const provenanceOracle=JSON.parse(execFileSync('python',['-c',`
import json,sys
from pathlib import Path
from tools.shared import media
rows=media.sources(Path(sys.argv[1]))
print(json.dumps(dict(rows=json.dumps(rows,ensure_ascii=False),lines=[media.describe(k,v) for k,v in rows.items()]),ensure_ascii=False))
`,repeatPages],{cwd:pythonRoot,encoding:'utf8'}));
    const sources=await mediaSources(repeatPages);
    assert.equal(Object.keys(sources).length,4);
    assert.equal(jsonText(sources),provenanceOracle.rows);
    await writeCredits(repeatPages);
    assert.equal(readFileSync(path.join(repeatPages,'assets/img/CREDITS.md'),'utf8').split('\n\n').at(-1),provenanceOracle.lines.join('\n')+'\n');
    const exactCounts = ['3', '9007199254740993', '9'.repeat(400)];
    const countInputs=[...exactCounts.map(value => `{"count":${value}}`), ...overflowingNumbers.map(value => `{"count":${value}}`), '{"count":1}','{"count":1.0}','{"count":1e0}','{"count":true}','{"count":0}','{"count":1.0,"count":2}','{"count":2,"count":1.0}','{}'];
    const countExpected=JSON.parse(execFileSync('python',['-c',`
import json,sys,tempfile
from pathlib import Path
from tools.shared import media
out=[]
with tempfile.TemporaryDirectory() as root:
 for source in json.load(sys.stdin):
  try:media.fetch('ImageSearch',json.loads(source),Path(root),'planner',backend='fixture-unsupported');out.append({'accepted':True})
  except Exception as e:out.append({'name':type(e).__name__,'message':str(e)})
print(json.dumps(out))
`],{cwd:pythonRoot,input:JSON.stringify(countInputs),encoding:'utf8'}));
    const { objectArguments } = await import('../src/core/planning.js');
    for (const [index,text] of countInputs.entries()) {
      let actual;try{await fetchMedia('ImageSearch',objectArguments(text),tsPages,'planner',{backend:'fixture-unsupported'});actual={accepted:true};}catch(error){actual={name:(error as Error).name,message:(error as Error).message};}
      assert.deepEqual(actual,countExpected[index],`media integer ${text}`);
    }
    const exactBodies = JSON.parse(execFileSync('python', ['-c', `
import json,sys,io
from tools.image_gen import gen
from tools.image_search.tool import request_body
out=[];gen.api_key=lambda:'fake-key'
for literal in json.load(sys.stdin):
 count=json.loads(literal);sent=[]
 def request(req,**kwargs):sent.append(req.data.decode());return io.BytesIO(b'{"data":[{"b64_json":"YQ=="}]}')
 gen.urllib.request.urlopen=request;gen.generate('exact count','2048x1152',count)
 out.append({'gen':sent[0],'search':request_body(['exact count'],count)})
print(json.dumps(out))
`], { cwd: pythonRoot, input: JSON.stringify(exactCounts), encoding: 'utf8' }));
    for (const [index, literal] of exactCounts.entries()) {
      let genBody = '', searchBody = '';
      await fetchMedia('ImageGen', objectArguments(`{"prompt":"exact count","n":${literal}}`), tsPages, 'planner', { env: { PARATERA_API_KEY: 'fake-key' }, fetch: async (_url, init) => {
        genBody = String(init?.body); return new Response('{"data":[{"b64_json":"YQ=="}]}');
      } });
      await fetchMedia('ImageSearch', objectArguments(`{"query":"exact count","count":${literal}}`), tsPages, 'planner', { env: { GEMINI_API_KEY: 'fake-key' }, fetch: async (_url, init) => {
        searchBody = String(init?.body); return new Response('{}', { status: 500 });
      } });
      assert.equal(genBody, exactBodies[index].gen);
      assert.deepEqual(JSON.parse(searchBody), exactBodies[index].search);
    }
    const posted: Record<string, unknown>[] = [];
    const generated = await mediaCall('ImageGen', { prompt: 'test illustration', n: 3 }, tsPages, 'page-01', { env: { PARATERA_API_KEY: 'fake-key' }, fetch: async (_url, init) => {
      posted.push(JSON.parse(String(init?.body))); return new Response(JSON.stringify({ data: Array.from({ length: 3 }, () => ({ b64_json: png.toString('base64') })) }));
    } });
    assert.deepEqual(posted, [{ model: 'Doubao-Seedream-4.0', prompt: 'test illustration', size: '2048x1152', n: 3 }]);
    assert.equal(generated.images.length, 3);
    assert.deepEqual(JSON.parse(generated.text).map((row: any) => path.basename(row.path)), ['image-1.png', 'image-2.png', 'image-3.png']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('media redirects retain public-address checks and cancellation stops provider work', async (t) => {
  const { mkdtempSync, rmSync, readdirSync, mkdirSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { Readable } = await import('node:stream');
  const { publicGet, downloadImage } = await import('../src/tools/media-transport.js');
  const { generate } = await import('../src/tools/media-execution.js');
  const root = mkdtempSync(path.join(tmpdir(), 'notale-media-cancel-'));
  try {
    await assert.rejects(publicGet('http://127.0.0.1/image.png', performance.now() + 5000), /图片地址解析到非公网地址/);
    const attempted: string[] = [];
    await assert.rejects(downloadImage('https://example.org/image.png', root, 0, performance.now() + 5000, undefined, async (url, deadline, signal) => {
      attempted.push(url);
      if (attempted.length === 1) return Object.assign(Readable.from([]), { statusCode: 302, headers: { location: 'http://127.0.0.1/private.png' } }) as unknown as import('node:http').IncomingMessage;
      return publicGet(url, deadline, signal);
    }), /图片地址解析到非公网地址/);
    assert.equal(attempted.length, 2); assert.deepEqual(readdirSync(root), []);
    const controller = new AbortController();
    let started!: () => void, calls = 0;
    const ready = new Promise<void>(resolve => { started = resolve; });
    const task = generate('cancelled image', 3, root, { env: { PARATERA_API_KEY: 'fake-key' }, fetch: async (_url, init) => {
      calls++; started();
      return new Promise((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(init!.signal!.reason), { once: true }));
    } }, controller.signal);
    await ready; controller.abort(new Error('media task cancelled'));
    await assert.rejects(task, /media task cancelled/);
    assert.equal(calls, 1); assert.deepEqual(readdirSync(root), []);
    const timingRoot=path.join(root,'timing');mkdirSync(timingRoot);
    const budgets = JSON.parse(execFileSync('python',['-c',`
import json,io
from tools.image_gen import gen
budgets=[];gen.api_key=lambda:'fake-key'
def request(url,timeout):
 budgets.append(timeout)
 return io.BytesIO(json.dumps({'data':[{'url':'https://fixture/one'},{'url':'https://fixture/two'}]}).encode() if len(budgets)==1 else b'image')
gen.urllib.request.urlopen=request;gen.generate('test','2048x1152',2)
from tools.image_gen import tool
import subprocess,tempfile
from pathlib import Path
def run(cmd,**kwargs):raise subprocess.TimeoutExpired(cmd,kwargs['timeout'])
tool.subprocess.run=run
try:
 with tempfile.TemporaryDirectory() as root:tool.generate({'prompt':'test'},2,Path(root))
except subprocess.TimeoutExpired as exc:total=exc.timeout
print(json.dumps({'requests':budgets,'total':total}))
`],{cwd:pythonRoot,encoding:'utf8'}));
    const clocks: Array<{milliseconds:number;controller:AbortController}> = [];
    const timeoutMock=t.mock.method(AbortSignal,'timeout',(milliseconds:number)=>{const controller=new AbortController();clocks.push({milliseconds,controller});return controller.signal;});
    try {
      let count=0;
      const rows=await generate('test',2,timingRoot,{env:{PARATERA_API_KEY:'fake-key'},fetch:async(_url,init)=>{
        count++;
        if(count===1)return new Response(JSON.stringify({data:[{url:'https://fixture/one'},{url:'https://fixture/two'}]}));
        assert.equal(init!.signal!.aborted,false,'completed requests must not cancel subsequent downloads');
        return new Response('image');
      }});
      assert.equal(rows.length,2);assert.deepEqual(clocks.map(c=>c.milliseconds/1000),[budgets.total]);
      assert.deepEqual(budgets.requests,[300,180,180]);
      const offset=clocks.length;let downloads=0;
      await assert.rejects(generate('deadline',2,timingRoot,{env:{PARATERA_API_KEY:'fake-key'},fetch:async(_url,init)=>{
        downloads++;
        if(downloads===1)return new Response(JSON.stringify({data:[{url:'https://fixture/one'},{url:'https://fixture/two'}]}));
        clocks[offset]!.controller.abort(new Error('overall deadline'));
        init!.signal!.throwIfAborted();
        return new Response('image');
      }}),error=>error instanceof Error && error.name==='TimeoutExpired');
      assert.equal(clocks[offset]!.milliseconds/1000,budgets.total);
      assert.equal(downloads,2,'overall deadline stops the remaining download');

    } finally {timeoutMock.mock.restore();rmSync(timingRoot,{recursive:true,force:true});}
    const dns = (await import('node:dns/promises')).default;
    const http = (await import('node:http')).default;
    const { syncBuiltinESMExports } = await import('node:module');
    const { EventEmitter } = await import('node:events');
    let answers = [{ address: '8.8.8.8', family: 4 }, { address: '1.1.1.1', family: 4 }];
    let lookups = 0, connections = 0;
    const lookupMock = t.mock.method(dns, 'lookup', async () => { lookups++; return answers; });
    syncBuiltinESMExports();
    const requestMock = t.mock.method(http, 'get', (url: URL, options: any, respond: any) => {
      connections++;
      assert.equal(url.hostname, 'images.example');
      assert.equal(options.agent, false);
      assert.deepEqual(options.headers, { 'User-Agent': 'Notale-image-search/1.0' });
      // DNS changes after validation, before the transport requests its address.
      answers = [{ address: '127.0.0.1', family: 4 }];
      options.lookup(url.hostname, {}, (error: unknown, address: string, family: number) => {
        assert.equal(error, null); assert.equal(address, '8.8.8.8'); assert.equal(family, 4);
      });
      options.lookup(url.hostname, { all: true }, (error: unknown, rows: unknown) => {
        assert.equal(error, null); assert.deepEqual(rows, [{ address: '8.8.8.8', family: 4 }]);
      });
      const request = Object.assign(new EventEmitter(), { setTimeout() { return request; } });
      queueMicrotask(() => respond(Object.assign(Readable.from([]), { statusCode: 302, headers: { location: '/rebound.png' } })));
      return request;
    });
    try {
      await assert.rejects(downloadImage('http://images.example/start.png', root, 1, performance.now() + 5000), /图片地址解析到非公网地址/);
      assert.equal(lookups, 2); assert.equal(connections, 1); assert.deepEqual(readdirSync(root), []);
      answers = [{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }];
      await assert.rejects(publicGet('http://images.example/mixed.png', performance.now() + 5000), /图片地址解析到非公网地址/);
      assert.equal(connections, 1, 'one private answer must reject the whole DNS result');
      let finishDns!: (rows: typeof answers) => void;
      lookupMock.mock.mockImplementation(() => new Promise<typeof answers>(resolve => { finishDns = resolve; }));
      const stop = new AbortController();
      const pending = publicGet('http://images.example/slow.png', performance.now() + 5000, stop.signal);
      stop.abort(new Error('cancel during DNS'));
      let timer: NodeJS.Timeout | undefined;
      try {
        await assert.rejects(Promise.race([pending, new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('DNS cancellation did not settle')), 1000);
        })]), /cancel during DNS/);
      } finally { clearTimeout(timer); finishDns([{ address: '8.8.8.8', family: 4 }]); }
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(connections, 1, 'late DNS completion must not open a socket after cancellation');
    } finally { requestMock.mock.restore(); lookupMock.mock.restore(); syncBuiltinESMExports(); }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('plan publication and Builder handoff preserve Python records with aligned prompt resources', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { planRun, buildRun } = await import('../src/core/orchestration.js');
  const { loadConfig, resolveBuilderProfile, workflowProfiles } = await import('../src/adapters/models/profiles.js');
  const { checkOptions } = await import('../src/core/theme.js');
  const root = mkdtempSync(path.join(tmpdir(), 'notale-handoff-'));
  const pyRoot = path.join(root, 'python'), tsRoot = path.join(root, 'typescript');
  const doc = '## Audience\n学生\n\n## Continuity\n### example\nPages: page-01, page-02\n共同数据 x=[1,2,3]，量纲为米。\n\n# page-01 [标题页]\n学习问题\n\n# page-02 [内容页]\n讲清一个完整概念\n', css = '/* ==== INTERFACE ====\n背景与正文\n==== /INTERFACE ==== */\n:root{--bg:#fff;--text:#111;--font-sans:Arial}';
  const { parsePythonJson, jsonText } = await import('../src/core/json.js');
  const cfg = loadConfig(), profile = resolveBuilderProfile(cfg), profiles = workflowProfiles(cfg, profile);
  try {
    const expected = parsePythonJson(execFileSync('python', ['-c', `
import sys,json,io,contextlib
from pathlib import Path
from types import SimpleNamespace as NS
from core import planner,builder,skills,llm
skills.FONT_FLOOR = ${JSON.stringify(guidance.FONT_FLOOR)}
builder.IDENTITY = ${JSON.stringify(nativeBuilder.IDENTITY)}
builder.TEXT_CAP_TEMPLATE = ${JSON.stringify(nativeBuilder.TEXT_CAP_TEMPLATE)}
builder.STEPS_BLOCK = ${JSON.stringify(nativeBuilder.STEPS_BLOCK)}
p=json.load(sys.stdin);root=Path(p['root']);assets=root/'pages/assets';assets.mkdir(parents=True)
run=NS(root=root,pages=root/'pages',assets=assets,label='test',query='讲义主题',minutes=45,audience='学生',scenario='',canvas=(1600,900),prompts=skills.PROMPTS,style_director=False,visual_focus=False)
run.prompt=lambda name,**kw:planner.Run.prompt(run,name,**kw)
planner.deck_call=lambda *a:(p['css'],p['doc'],{})
histories=[]
def respond(instructions,history,specs,**kw):
 (root/'pages'/(kw['tag']+'.html')).write_text('<html>fixture</html>')
 histories.append(dict(instructions=instructions,history=history))
 u=NS(input_tokens=9007199254740993,output_tokens=9007199254740993,input_tokens_details=NS(cached_tokens=10))
 return llm._Resp([llm._Item('message',text='done')],u,False,'test')
cfg=p['cfg'];default=llm.resolve_builder_profile(cfg,None)
builder.audit_delivery=lambda *a:dict(fatal_errors=[],visual_warnings=[],code_result=None)
builder.config=lambda:cfg
builder.workflow_runtimes=lambda *a:{name:NS(profile=llm.resolve_builder_profile(cfg,cfg['builder'].get('workflow_profiles',{}).get(name,default.id)),respond=respond,replay=llm.ModelRuntime.replay) for name in skills.PAGE_WORKFLOWS}
builder.RUNS_ROOT=root.parent
sys.argv=['builder','--label',root.name]
with contextlib.redirect_stdout(io.StringIO()):
 planner.plan_run(run,Path('vendor/chassis'),Path('vendor/chassis/lib'))
 builder.main()
files={name:(root/name).read_text() for name in ['briefs.json','pages/plan/pages.md','pages/plan/p01.md','pages/plan/p02.md','pages/assets/theme.css','pages/assets/CHASSIS.md']}
print(json.dumps(dict(files=files,manifest=json.loads((root/'builder-manifest.json').read_text()),results=json.loads((root/'builder-results.json').read_text()),histories=histories),ensure_ascii=False))
`], { cwd: pythonRoot, input: JSON.stringify({ root: pyRoot, doc, css, cfg }), encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }));
    let called = false;
    await planRun({ root: tsRoot, query: '讲义主题', minutes: 45, audience: '学生' }, {
      planner: { model: { async respond() {
        assert.equal(called, false); called = true;
        return { id: 'plan', message: { role: 'assistant', content: null, tool_calls: [
          { id: 'plan', type: 'function', function: { name: 'FinalizePlan', arguments: JSON.stringify({ pages_md: doc }) } },
        ] }, inputTokens: 0, outputTokens: 0, cachedTokens: 0 };
      } }, media: async () => { throw new Error('unused'); }, trace: () => {} },
      // An imported theme that passes its gates takes the Director's reuse route: no model call, same published file.
      director: { theme: { checkOptions, importInput: async () => ({ css, shots: [] }), gates: async () => [],
        publish: async (content: string, target: string) => { await import('node:fs/promises').then(fs => fs.writeFile(target, content)); } } } as unknown as import('../src/core/director.js').DirectorPorts,
    });
    const histories: unknown[] = [];
    const port: import('../src/core/builder.js').BuilderPorts = {
      model: { async respondCanonical(instructions, history) {
        writeFileSync(path.join(tsRoot, 'pages', JSON.stringify(history).match(/page-\d+/)![0] + '.html'), '<html>fixture</html>');
        histories.push({ instructions, history: structuredClone(history) });
        return { id: 'test', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'done' }] }], replay_items: [], raw: {}, status: 'completed', incomplete_details: null, usage: { input_tokens: 9007199254740993n, output_tokens: 9007199254740993n, input_tokens_details: { cached_tokens: 10 } } };
      } }, // Python stubs audit_delivery to an empty verdict; the TS port must return the same shape, not a bare string.
      run: async () => ({ text: 'ok', images: [], diagnostics: { fatal_errors: [], visual_warnings: [] } }), scaffold: async () => { throw new Error('unused'); }, codeCheck: async () => { throw new Error('unused'); }, image: async () => { throw new Error('unused'); },
    };
    await buildRun(tsRoot, Object.fromEntries(guidance.PAGE_WORKFLOWS.map(name => [name, port])), { label: 'typescript', profile, profiles, workflowRoot: path.join(pythonRoot, 'skills'), prompts: path.join(pythonRoot, 'prompts') });
    const normalize = (value: unknown) => jsonText(value).replaceAll(pyRoot, '<run>').replaceAll(tsRoot, '<run>').replaceAll(path.join(pythonRoot, 'skills'), '<skills>').replaceAll(guidance.WORKFLOWS, '<skills>');
    // Python still slices the page list into p*.md; TS keeps one pages.md and slices it in memory.
    for (const [file, value] of Object.entries(expected.files)) {
      if (/^pages\/plan\/p\d+\.md$/.test(file)) continue;
      assert.equal(normalize(readFileSync(path.join(tsRoot, file), 'utf8')), normalize(value), file);
    }
    const results = parsePythonJson(readFileSync(path.join(tsRoot, 'builder-results.json'), 'utf8'));
    // attempts / stop_reasons are TS-only retry records; Python's rows have no counterpart.
    for (const row of Object.values(results) as any[]) { row.seconds = 0; delete row.attempts; delete row.stop_reasons; }
    for (const row of Object.values(expected.results) as any[]) row.seconds = 0;
    assert.equal(normalize(results), normalize(expected.results));
    const manifest = parsePythonJson(readFileSync(path.join(tsRoot, 'builder-manifest.json'), 'utf8'));
    for (const row of [manifest, expected.manifest]) for (const key of ['startedAt', 'completedAt', 'wallSeconds', 'label', 'rebuiltPages']) delete row[key];
    assert.deepEqual(manifest, expected.manifest);
    assert.equal(normalize(manifest), normalize(expected.manifest));
    // Sample policy is TS-native (see the blocks comparison above); compare every other part of the handoff.
    const withoutWorkflow = (value: unknown) => normalize(value)
      .replace(/<workflow_skill[\s\S]*?<\/workflow_skill>/g, '<workflow_skill/>')
      .replace(/(\\n)*<(sample_read_policy|aux_sample_catalog)[\s\S]*?<\/\2>/g, '');
    assert.deepEqual(histories.map(withoutWorkflow).sort(), expected.histories.map(withoutWorkflow).sort());
    for (const entry of histories as { instructions: string; history: unknown[] }[]) {
      assert.equal(entry.instructions.match(/<audience>/g)?.length, 1);
      assert.ok(JSON.stringify(entry.history).includes('共同数据 x=[1,2,3]'));
    }
    await assert.rejects(buildRun(tsRoot, {}, { label: 'test', profile, profiles }), /已存在/);
    const { mkdirSync } = await import('node:fs');
    const { Page, routePage, lessonTitle } = await import('../src/core/builder.js');
    const { PAGES_REL } = await import('../src/core/planner-contract.js');
    const { pageEntries } = await import('../src/core/builder-context.js');
    const { decodeText } = await import('../src/core/text.js');
    const routeRoot = path.join(root, 'route');
    mkdirSync(path.join(routeRoot, 'pages/plan'), { recursive: true });
    const routeCases = [
      ...['标题页', '内容页', '交互页', '代码页'].map(label => ({ pid: 'page-01', text: `# page-01 [${label}]\r\n- 标题\r正文` })),
      ...['\u001c', '\u0085', '\ufeff', '\u2028'].map(space => ({ pid: 'page-01', text: `#${space}page-01 [代码页]\n*${space}题目` })),
      ...['\u2028', '\u2029'].map(separator => ({ pid: 'page-01', text: `prefix${separator}# page-01 [内容页]\n正文` })),
      // A real line break leaves a preamble: Python keeps it in the per-page file, TS slices the page out of the
      // shared list. Publication never puts a preamble inside a page spec, so both agree in production.
      { pid: 'page-01', text: 'prefix\r# page-01 [内容页]\n正文', sliced: true },
      { pid: 'page-０１', text: '# page-０１ [代码页]\n标题' },
      { pid: 'page-01', text: '# page-02 [内容页]\n正文' },
      // TS routes out of the shared page list, so a second heading is a sibling page, not a malformed spec.
      { pid: 'page-01', text: '# page-01 [内容页]\n正文\n# page-02 [代码页]\n内容', sliced: true },
      { pid: 'page-01', text: '# page-01 [代码页]\n<ignore>\u0085- 题目\u2028正文' },
    ];
    const routeReference = JSON.parse(execFileSync('python', ['-c', `
import json,sys
from pathlib import Path
from core import builder
p=json.load(sys.stdin);root=Path(p['root']);rows=[]
for case in p['cases']:
 file=root/'pages/plan'/f"{case['pid'].replace('page-', 'p')}.md"
 file.write_bytes((case['text']+chr(10)).encode('utf-8'))
 text=file.read_text(encoding='utf-8',errors='replace')
 row={'entries':[dict(pid=pid,label=label,body=body) for pid,label,body in builder._page_entries(text)]}
 try:
  page=builder.route_page(root,builder.Page(case['pid'],'fixture'))
  row['page']=dict(label=page.label,workflow=page.workflow,spec_text=page.spec_text,title=builder._lesson_title(page))
 except Exception as error:row['error']=dict(name=type(error).__name__,message=str(error))
 rows.append(row)
print(json.dumps(rows))
`], { cwd: pythonRoot, input: JSON.stringify({ root: routeRoot, cases: routeCases }), encoding: 'utf8' }));
    for (const [index, item] of routeCases.entries()) {
      // Plan publication ends every spec with a newline on both sides; the fixture does the same.
      const bytes = Buffer.from(item.text + '\n');
      writeFileSync(path.join(routeRoot, PAGES_REL), bytes);
      const actual: Record<string, unknown> = { entries: pageEntries(decodeText(bytes, false)) };
      try {
        const page = routePage(routeRoot, new Page(item.pid, 'fixture'));
        actual.page = { label: page.label, workflow: page.workflow, spec_text: page.spec_text, title: lessonTitle(page) };
      } catch (error) { actual.error = { name: (error as Error).name, message: (error as Error).message }; }
      if ('sliced' in item) {
        assert.deepEqual(actual.entries, routeReference[index].entries, JSON.stringify(item));
        assert.deepEqual(actual.page, { label: '内容页', workflow: 'build-page', spec_text: '# page-01 [内容页]\n正文\n', title: '正文' }, JSON.stringify(item));
      } else assert.deepEqual(actual, routeReference[index], JSON.stringify(item));
    }
    for (const kind of ['utf8', 'json', 'workflow-directory', 'missing-spec', 'manifest', 'artifact']) {
      const candidate = path.join(root, kind), workflows = path.join(candidate, 'workflows');
      mkdirSync(path.join(candidate, 'pages'), { recursive: true });
      writeFileSync(path.join(candidate, 'briefs.json'), kind === 'utf8' ? Buffer.from([0x5b, 0xff]) : kind === 'json' ? '[{bad}]' : JSON.stringify([{ description: 'Build page-01', prompt: 'fixture' }]));
      if (kind === 'workflow-directory') for (const workflow of guidance.PAGE_WORKFLOWS) mkdirSync(path.join(workflows, workflow, 'SKILL.md'), { recursive: true });
      if (kind === 'manifest' || kind === 'artifact') {
        mkdirSync(path.join(candidate, 'pages/plan'));
        for (const file of ['p01.md', 'pages.md']) writeFileSync(path.join(candidate, 'pages/plan', file), '# page-01 [标题页]\r\nfixture\r');
      }
      if (kind === 'manifest') writeFileSync(path.join(candidate, 'builder-manifest.json'), '{}');
      if (kind === 'artifact') writeFileSync(path.join(candidate, 'pages/page-01.html'), 'protected');
      const error = JSON.parse(execFileSync('python', ['-c', `
import sys,json,io,contextlib
from pathlib import Path
from core import builder
root=Path(sys.argv[1]);builder.RUNS_ROOT=root.parent
builder.workflow_runtimes=lambda *args:{}
sys.argv=['builder','--label',root.name]+(['--workflows',str(root/'workflows')] if root.name=='workflow-directory' else [])
try:
 with contextlib.redirect_stdout(io.StringIO()):builder.main()
except Exception as error:print(json.dumps({'name':type(error).__name__,'message':str(error)}))
`, candidate], { cwd: pythonRoot, encoding: 'utf8' }));
      // Python names the missing per-page file; TS names the one page list it routes from.
      if (kind === 'missing-spec') error.message = error.message.replace('pages/plan/p01.md', 'pages/plan/pages.md');
      await assert.rejects(buildRun(candidate, {}, { label: kind, profile, profiles, ...(kind === 'workflow-directory' ? { workflowRoot: workflows } : {}) }), error);
      if (kind === 'artifact') assert.equal(readFileSync(path.join(candidate, 'pages/page-01.html'), 'utf8'), 'protected');
    }

  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('portable publication materializes internal links and rejects external or cyclic links', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, lstatSync, renameSync, rmSync, existsSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { publishOutput } = await import('../src/core/orchestration.js');
  const root = mkdtempSync(path.join(tmpdir(), 'notale-publish-'));
  const pages = path.join(root, 'pages'), output = path.join(root, 'output');
  mkdirSync(path.join(pages, 'shared'), { recursive: true }); mkdirSync(output);
  writeFileSync(path.join(pages, 'shared/runtime.js'), 'window.example = true;');
  symlinkSync('shared', path.join(pages, 'lesson-runtime'));
  try {
    await publishOutput(pages, output);
    assert.equal(lstatSync(path.join(output, 'lesson-runtime')).isSymbolicLink(), false);
    assert.equal(readFileSync(path.join(output, 'lesson-runtime/runtime.js'), 'utf8'), 'window.example = true;');
    assert.equal(lstatSync(path.join(pages, 'lesson-runtime')).isSymbolicLink(), true);
    await assert.rejects(publishOutput(pages, output), /拒绝覆盖/);
    renameSync(output, path.join(root, 'moved'));
    symlinkSync('..', path.join(pages, 'shared/cycle'));
    await assert.rejects(publishOutput(pages, output), /循环链接/);
    rmSync(path.join(pages, 'shared/cycle'));
    writeFileSync(path.join(root, 'outside.txt'), 'not an output asset');
    symlinkSync('../outside.txt', path.join(pages, 'outside'));
    await assert.rejects(publishOutput(pages, output), /运行目录之外/);
    assert.equal(existsSync(output), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

for (const fail of [false, true]) test(`baseline service adapter runs model transport, browser audit and portable publication (failure=${fail})`, async () => {
  const { mkdtempSync, rmSync, mkdirSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { createBaselinePipeline } = await import('../src/core/baseline-pipeline.js');
  const { createRunRequestSchema } = await import('../src/protocol/index.js');
  const root = mkdtempSync(path.join(tmpdir(), 'notale-pipeline-')), output = path.join(root, 'output');
  const events: string[] = [], bodies: any[] = [];
  const model = { model: 'fixture', base_url: 'https://fixture.invalid/v1', api_key_env: 'FIXTURE_KEY', adapter: 'chat', reasoning_effort: 'low', vision_input: true };
  const css = '/* ==== INTERFACE ====\ntoken --bg --text --font-sans\n==== /INTERFACE ==== */\n:root{--bg:#fff;--text:#111;--font-sans:Arial}';
  const template = path.join(root, 'template'); mkdirSync(template); writeFileSync(path.join(template, 'theme.css'), css);
  const html = '<!doctype html><html lang="zh"><meta charset="utf-8"><link rel="stylesheet" href="assets/base.css"><link rel="stylesheet" href="assets/theme.css"><body data-page="01" data-total="1"><div id="stage"><h1 style="position:absolute;left:100px;top:100px">课程标题</h1></div><script src="assets/base.js"></script><script>Deck.init({index:1,total:1})</script></body></html>';
  const call = (name: string, args: unknown) => ({ id: name, type: 'function', function: { name, arguments: JSON.stringify(args) } });
  let builderCalls = 0;
  const pipeline = createBaselinePipeline({ config: { model: { ...model, name: 'fixture' }, planner: { reasoning_effort: 'low' }, builder: { default_profile: 'fixture', profiles: { fixture: model } } },
    env: { FIXTURE_KEY: 'fixture-secret-key' }, envFile: path.join(root, 'absent.env'), template,
    transport: { fetch: async (_url, init) => {
      const body = JSON.parse(String(init?.body)); bodies.push(body);
      const planner = body.tools.some((tool: any) => tool.function.name === 'FinalizePlan');
      const calls = planner ? [call('FinalizePlan', { pages_md: '## Audience\n学生\n\n# page-01 [标题页]\n课程标题\n' })]
        : ++builderCalls === 1 ? [call('Write', { file_path: 'page-01.html', content: html })] : [];
      if (fail && !planner && builderCalls > 1) return new Response('fixture provider rejection', { status: 400 });
      return new Response(JSON.stringify({ id: 'fixture', choices: [{ message: { role: 'assistant', content: calls.length ? null : 'done', tool_calls: calls }, finish_reason: calls.length ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 20, completion_tokens: 5 } }));
    } } });
  try {
    mkdirSync(output);
    const execution = pipeline({ run: { protocolVersion: 1, id: 'fixture-run', status: 'running', request: createRunRequestSchema.parse({ query: '课程主题', style: '' }), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), lastSequence: 0 }, outputDir: output,
      signal: new AbortController().signal, emit: async kind => { events.push(kind); } });
    // The provider failing after the page passed its audit no longer discards the deck: the delivered page is published.
    await execution;
    const result = JSON.parse(readFileSync(path.join(root, 'work/builder-results.json'), 'utf8'))['page-01'];
    assert.equal(result.termination, fail ? 'agent_exception' : 'no_tool_use');
    assert.equal(result.attempts, 1);
    assert.equal(readFileSync(path.join(output, 'page-01.html'), 'utf8'), html);
    assert.match(readFileSync(path.join(output, 'index.html'), 'utf8'), /page-01.html/);
    assert.deepEqual(JSON.parse(readFileSync(path.join(root, 'work/builder-results.json'), 'utf8'))['page-01'].audit.fatal_errors, []);
    assert.deepEqual(events.filter(kind => !['workflow.progress', 'plan.ready', 'page.progress'].includes(kind)), ['phase.changed', 'phase.changed', 'page.started', 'page.ready', 'phase.changed']);
    assert.equal(bodies.length, 3);
    assert.equal(bodies[0].max_tokens, 128000);
    assert.ok(bodies[1].messages[0].content.includes('build-cover'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});


test('separate CLI planning and selected-page build preserve absent-target protection', async () => {
  const { mkdtemp, mkdir, writeFile, readFile, rm, access } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { createServer } = await import('node:http');
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execute = promisify(execFile), root = await mkdtemp(path.join(tmpdir(), 'notale-stage-cli-'));
  const run = path.join(root, 'runs/fixture');
  const css='/* ==== INTERFACE ====\n背景/正文\n==== /INTERFACE ==== */:root{--bg:#fff;--text:#111;--font-sans:Arial}';
  const html='<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="assets/base.css"><link rel="stylesheet" href="assets/theme.css"><body data-page="02" data-total="2"><div id="stage"><p style="position:absolute;left:100px;top:100px">selected page</p></div><script src="assets/base.js"></script><script>Deck.init({index:2,total:2})</script>';
  let calls=0, builders=0;
  const call=(name:string,args:unknown)=>({id:name,type:'function',function:{name,arguments:JSON.stringify(args)}});
  const server=createServer(async(req,res)=>{
    let raw='';for await(const chunk of req)raw+=chunk;
    const body=JSON.parse(raw);calls++;
    const planner=body.tools.some((t:any)=>t.function.name==='FinalizePlan');
    assert.equal(body.model,planner?'planner-override':'fixture');
    assert.equal(req.headers.authorization,planner?'Bearer planner-key':'Bearer fixture-key');
    const tools=planner?[call('FinalizePlan',{pages_md:'## Audience\n学生\n\n# page-01 [标题页]\n标题\n\n# page-02 [内容页]\n内容\n'})]:++builders===1?[call('Write',{file_path:'page-02.html',content:html})]:[];
    res.setHeader('content-type','application/json');res.end(JSON.stringify({id:'fixture',choices:[{message:{role:'assistant',content:tools.length?null:'done',tool_calls:tools},finish_reason:tools.length?'tool_calls':'stop'}],usage:{prompt_tokens:20,completion_tokens:5}}));
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {
    const address=server.address() as import('node:net').AddressInfo;
    const model={model:'fixture',base_url:`http://127.0.0.1:${address.port}/v1`,api_key_env:'FIXTURE_KEY',adapter:'chat',wire_api:'chat',reasoning_effort:'low',vision_input:false};
    await writeFile(path.join(root,'config.json'),JSON.stringify({model:{...model,name:'unused-default',base_url:'http://127.0.0.1:1/v1'},planner:{reasoning_effort:'low'}}));
    await writeFile(path.join(root,'fixture.env'),'');
    const template=path.join(root,'template');await mkdir(template,{recursive:true});await writeFile(path.join(template,'theme.css'),css);
    const common=['--label','fixture','--runs',path.join(root,'runs'),'--config',path.join(root,'config.json'),'--env-file',path.join(root,'fixture.env')];
    const command=(stage:string,args:string[]=[])=>execute(process.execPath,['--import','tsx','src/cli/main.ts',stage,...common,...args],{cwd:path.resolve(guidance.RESOURCES,'..'),env:{...process.env,FIXTURE_KEY:'fixture-key',PLANNER_OVERRIDE_KEY:'planner-key'},timeout:20000});
    await command('plan',['--query','fixture','--template',template,'--model','planner-override','--base-url',model.base_url,'--key-env','PLANNER_OVERRIDE_KEY','--wire','chat']);
    await access(path.join(run,'briefs.json'));
    await writeFile(path.join(root,'config.json'),JSON.stringify({model:{},builder:{default_profile:'fixture',profiles:{fixture:model}}}));
    await command('build',['--only','page-02']);
    assert.equal(await readFile(path.join(run,'pages/page-02.html'),'utf8'),html);
    await assert.rejects(access(path.join(run,'pages/page-01.html')));
    assert.deepEqual(JSON.parse(await readFile(path.join(run,'builder-manifest.json'),'utf8')).pages,['page-02']);
    assert.equal(JSON.parse(await readFile(path.join(run,'builder-results.json'),'utf8'))['page-02'].termination,'no_tool_use');
    assert.equal(calls,3);
    await assert.rejects(command('plan',['--query','fixture','--template',template]),/EEXIST/);
    await assert.rejects(command('build',['--only','page-01']),/已存在/);
    assert.equal(calls,3,'rejected repeats must not call the provider');
  } finally {await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(root,{recursive:true,force:true});}
});


test('custom ImageGen roots preserve Python subprocess results and cancellation', async () => {
  const { mkdtemp, mkdir, writeFile, rm, access } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { generate, generationScriptFor, generationKeyFromFile } = await import('../src/tools/media-execution.js');
  const root=await mkdtemp(path.join(tmpdir(),'notale-custom-gen-')), custom=path.join(root,'custom'), script=path.join(custom,'make-illustration/scripts/gen.py');
  await mkdir(path.dirname(script),{recursive:true});
  await writeFile(script,`import argparse,json,sys,time
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('prompt');p.add_argument('--n',type=int);p.add_argument('--out');a=p.parse_args();out=Path(a.out).parent
if a.prompt=='failure':
 sys.stderr.write('x'*1600+'终止');sys.exit(7)
if a.prompt=='missing':
 print('no manifest');sys.exit(0)
if a.prompt=='newline':
 sys.stdout.buffer.write(b'first\\r\\nsecond\\r');sys.exit(1)
if a.prompt=='bad-output':
 sys.stdout.buffer.write(b'\\xff');sys.exit(1)
if a.prompt=='bad-json':
 (out/'illustrations.json').write_text('[');sys.exit(0)
if a.prompt=='bad-utf8':
 (out/'illustrations.json').write_bytes(b'\\xff');sys.exit(0)
if a.prompt=='signal':
 import os,signal
 (out/'illustrations.json').write_text('[]');os.kill(os.getpid(),signal.SIGTERM)

if a.prompt=='wait':
 (out/'ready').write_text('ready');time.sleep(60);(out/'late').write_text('must not happen')
(out/'illustrations.json').write_text(json.dumps([dict(file='image.png',prompt=a.prompt,n=a.n)]))
`);
  try {
    const keyFiles = ['PARATERA_API_KEY=fake','PARATERA_API_KEY="fake"','PARATERA_API_KEY=\x85fake\x85','\ufeffPARATERA_API_KEY=fake','ignored\x85PARATERA_API_KEY=fake','PARATERA_API_KEY=\rPARATERA_API_KEY=next','PARATERA_API_KEY=""','PARATERA_API_KEY=first\nPARATERA_API_KEY=second','PARATERA_API_KEY=badkey'].map(text=>Buffer.from(text,'utf8'));
    keyFiles.push(Buffer.from('50415241544552415f4150495f4b45593dff','hex'));
    const keyExpected=JSON.parse(execFileSync('python',['-c',`
import json,sys,os,tempfile
from pathlib import Path
from tools.image_gen import gen
os.environ.pop('PARATERA_API_KEY',None);out=[]
with tempfile.TemporaryDirectory() as directory:
 gen.ENV_FILE=Path(directory)/'fake.env'
 for value in json.load(sys.stdin):
  gen.ENV_FILE.write_bytes(bytes.fromhex(value))
  try:out.append(gen.api_key())
  except SystemExit:out.append(None)
print(json.dumps(out))
`],{cwd:pythonRoot,input:JSON.stringify(keyFiles.map(b=>b.toString('hex'))),encoding:'utf8'}));
    assert.deepEqual(keyFiles.map(bytes=>generationKeyFromFile(bytes)??null),keyExpected);
    assert.equal(generationScriptFor(custom),script);
    assert.equal(generationScriptFor(path.join(pythonRoot,'tools')),undefined);
    assert.throws(()=>generationScriptFor(path.join(root,'absent')),/不是目录/);
    assert.throws(()=>generationScriptFor(root),/取图脚本不存在/);
    const cases=['literal $value; `command` "quote"','failure','missing','newline','bad-output','bad-json','bad-utf8','signal'];
    const expected=JSON.parse(execFileSync('python',['-c',`
import json,sys
from pathlib import Path
from tools.image_gen import tool
from core import skills
p=json.load(sys.stdin);skills.DEFAULT=Path(p['custom']);rows=[]
for index,prompt in enumerate(p['cases']):
 out=Path(p['root'])/('py-'+str(index));out.mkdir()
 try: rows.append({'rows':tool.generate({'prompt':prompt},3,out)})
 except Exception as e:rows.append({'name':type(e).__name__,'message':str(e)})
print(json.dumps(rows))
`],{cwd:pythonRoot,input:JSON.stringify({root,custom,cases}),encoding:'utf8'}));
    for(const [index,prompt] of cases.entries()) {
      const out=path.join(root,'ts-'+index);await mkdir(out);
      try {assert.deepEqual({rows:await generate(prompt,3,out,{imageGenScript:script})},expected[index]);}
      catch(error) {assert.deepEqual({name:(error as Error).name,message:(error as Error).message},expected[index]);}
    }
    const out=path.join(root,'cancel');await mkdir(out);const controller=new AbortController();
    const task=generate('wait',1,out,{imageGenScript:script},controller.signal);
    const cancelled=assert.rejects(task,/cancel fixture/);
    const deadline=Date.now()+3000;
    for(;;){try{await access(path.join(out,'ready'));break;}catch{if(Date.now()>deadline)throw new Error('custom script did not start');await new Promise(resolve=>setTimeout(resolve,10));}}
    controller.abort(new Error('cancel fixture'));await cancelled;await assert.rejects(access(path.join(out,'late')));
    const { baselineRuntime }=await import('../src/core/baseline-pipeline.js');
    const { loadConfig }=await import('../src/adapters/models/profiles.js');
    const config=loadConfig();config.media={image_search_backend:'fixture-unsupported'};
    const runtime=baselineRuntime(root,{config,env:{},envFile:path.join(root,'absent.env')});
    const result=await runtime.builders['build-page']!.run('ImageSearch',{query:'never sent'}, {cwd:root,pid:'page-01'});
    assert.match(typeof result==='string'?result:result.text,/未知图片检索后端：fixture-unsupported/);
    config.media={image_search_backend:''};
    const emptyRuntime=baselineRuntime(root,{config,env:{},envFile:path.join(root,'absent.env')});
    const emptyResult=await emptyRuntime.builders['build-page']!.run('ImageSearch',{query:'never sent'}, {cwd:root,pid:'page-01'});
    const emptyText=typeof emptyResult==='string'?emptyResult:emptyResult.text;
    assert.match(emptyText,/未知图片检索后端：/);
    assert.doesNotMatch(emptyText,/GEMINI_API_KEY/);
    const emptyExpected=JSON.parse(execFileSync('python',['-c',`
import json,tempfile
from pathlib import Path
from core import llm
from tools.shared import media
llm.config=lambda:{'media':{'image_search_backend':''}}
with tempfile.TemporaryDirectory() as directory:
 out,rows,errors=media.fetch('ImageSearch',{'query':'never sent'},Path(directory),'page-01')
 print(json.dumps(errors))
`],{cwd:pythonRoot,encoding:'utf8'}));
    assert.deepEqual(JSON.parse(emptyText).errors,emptyExpected);


  } finally {await rm(root,{recursive:true,force:true});}
});
