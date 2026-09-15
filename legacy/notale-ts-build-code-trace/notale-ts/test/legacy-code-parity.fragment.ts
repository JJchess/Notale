test('code scaffold preserves author files and the actual execution gate after relocation', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, renameSync, rmSync, realpathSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const code = await import('../src/tools/code-scaffold.js');
  const { runBrowserCheck } = await import('../src/tools/code-check.js');
  const root = mkdtempSync(path.join(tmpdir(), 'notale-code-parity-'));
  const pyPages = path.join(root, 'python/pages'), tsPages = path.join(root, 'typescript/pages');
  mkdirSync(pyPages, { recursive: true }); mkdirSync(tsPages, { recursive: true });
  const title = ` 测试 & <代码> "引号" '单引号' page-987 654 `;
  try {
    const expected = JSON.parse(execFileSync('python', ['-c', `
import sys,json,contextlib,io
from pathlib import Path
from tools.code_scaffold.tool import scaffold,_outer_page
from tools.check.code import run_browser_check
p=json.load(sys.stdin);pages=Path(p['pages'])
first=scaffold(pages,'page-07',p['title'],12)
report,shots=run_browser_check(pages,'page-07')
editable=Path(first['editable_root'])/'starter.py';editable.write_text(editable.read_text()+'\\n# author edit preserved\\n')
again=scaffold(pages,'page-07','Second title',13)
print(json.dumps(dict(first=first,again=again,outer=(pages/'page-07.html').read_text(),report=report),ensure_ascii=False))
`], { cwd: pythonRoot, input: JSON.stringify({ pages: pyPages, title }), encoding: 'utf8', timeout: 45000, maxBuffer: 2 * 1024 * 1024 }));
    const first = await code.legacyScaffold(tsPages, 'page-07', title, 12);
    const normalize = (value: unknown) => JSON.parse(JSON.stringify(value).replaceAll(tsPages, '<pages>').replaceAll(pyPages, '<pages>'));
    assert.deepEqual(normalize(first), normalize(expected.first));
    const starter = path.join(tsPages, 'assets/lessons/page-07/lesson/starter.py');
    writeFileSync(starter, readFileSync(starter, 'utf8') + '\n# author edit preserved\n');
    const again = await code.legacyScaffold(tsPages, 'page-07', 'Second title', 13);
    assert.deepEqual(normalize(again), normalize(expected.again));
    assert.equal(readFileSync(path.join(tsPages, 'page-07.html'), 'utf8'), expected.outer);
    const relocated = path.join(root, 'moved'); renameSync(path.dirname(tsPages), relocated);
    const movedPages = path.join(relocated, 'pages');
    assert.ok(realpathSync(path.join(movedPages, 'assets/lessons/page-07/assets/lib/pyodide/pyodide.mjs')).startsWith(relocated + '/'));
    const actual = await runBrowserCheck(movedPages, 'page-07');
    assert.equal(actual.report, expected.report);
    assert.match(actual.report, /^✓/);
    const testsFile = path.join(movedPages, 'assets/lessons/page-07/lesson/tests.py');
    const originalTests = readFileSync(testsFile, 'utf8');
    // A real authored failing test must fail the gate; no synthetic CodeLab packet.
    writeFileSync(path.join(movedPages, 'assets/lessons/page-07/lesson/tests.py'), 'def run_tests(namespace):\n    return [{"name":"parity rejection", "passed":False, "message":"authored failure"}]\n');
    const rejected = await runBrowserCheck(movedPages, 'page-07');
    assert.match(rejected.report, /^✗ 代码工作台自检失败/);
    assert.match(rejected.report, /parity rejection/);
    writeFileSync(testsFile, originalTests);
    const renderFile = path.join(movedPages, 'assets/lessons/page-07/lesson/view/render.js');
    writeFileSync(renderFile, readFileSync(renderFile, 'utf8') + '\nconst originalRender = window.renderNotaleView;\nwindow.renderNotaleView = input => { originalRender(input); if (input.step?.sequence > 0) console.error("parity later frame rejection"); };\n');
    const laterFrame = await runBrowserCheck(movedPages, 'page-07');
    assert.match(laterFrame.report, /^✗ 代码工作台自检失败/);
    assert.match(laterFrame.report, /parity later frame rejection/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('code runtime loads NumPy on demand without spending the authored execution timeout', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { legacyScaffold: scaffold } = await import('../src/tools/code-scaffold.js');
  const { acquireVisualChecker, browser, staticServer } = await import('../src/tools/visual-check.js');
  const root = mkdtempSync(path.join(tmpdir(), 'notale-lazy-numpy-')), pages = path.join(root, 'pages');
  mkdirSync(pages);
  const release = acquireVisualChecker();
  let page: import('playwright').Page | undefined;
  try {
    await scaffold(pages, 'page-01', 'Lazy NumPy', 1);
    const lesson = path.join(pages, 'assets/lessons/page-01');
    const config = path.join(lesson, 'lesson/lesson.js');
    writeFileSync(config, readFileSync(config, 'utf8').replace('timeoutMs: 5000', 'timeoutMs: 1000'));
    const { origin } = await staticServer(lesson);
    page = await (await browser()).newPage();
    const numpy: string[] = [];
    page.context().on('request', request => { if (/numpy.*\.whl/.test(request.url())) numpy.push(request.url()); });
    let failPackage = true;
    // Fail preparation once, then model package I/O exceeding the execution budget.
    await page.context().route('**/*numpy*.whl', async route => {
      if (failPackage) { await route.fulfill({ status: 503, body: 'fixture package unavailable' }); return; }
      await new Promise(resolve => setTimeout(resolve, 1200)); await route.continue();
    });
    await page.goto(origin + '/index.html');
    await page.waitForFunction('window.CodeLab && CodeLab.getState().runtimeReady && CodeLab.getState().editorReady');
    assert.equal(numpy.length, 0, 'initial readiness must not load NumPy');
    await page.click('#runButton');
    await page.waitForFunction('!CodeLab.getState().running && CodeLab.getState().outputKind === "success"');
    assert.equal(numpy.length, 0, 'the original ordinary lesson must not load NumPy');
    await page.evaluate(`CodeLab.reset(); CodeLab.getModel('starter.py').setValue(CodeLab.getModel('starter.py').getValue() + '\\nimport numpy as np\\nprint("np-check", int(np.sum([1,2,3])))\\n')`);
    await page.click('#runButton');
    await page.waitForFunction('!CodeLab.getState().running && CodeLab.getState().outputKind !== "idle"', undefined, { timeout: 15000 });
    const preparationFailure = await page.evaluate('CodeLab.getState()') as any;
    assert.equal(preparationFailure.outputKind, 'error', preparationFailure.output);
    assert.doesNotMatch(preparationFailure.output, /np-check 6/);
    assert.equal(preparationFailure.frameCount, 0);
    assert.equal(numpy.length, 1);
    failPackage = false;
    await page.click('#runButton');
    await page.waitForFunction('!CodeLab.getState().running && CodeLab.getState().outputKind !== "idle"', undefined, { timeout: 15000 });
    const state = await page.evaluate('CodeLab.getState()') as any;
    assert.equal(state.outputKind, 'success', state.output);
    assert.match(state.output, /np-check 6/); assert.ok(state.frameCount > 0);
    assert.equal(numpy.length, 2);
    await page.click('#runButton');
    await page.waitForFunction('!CodeLab.getState().running && CodeLab.getState().outputKind === "success"');
    assert.equal(numpy.length, 2, 'reuse the loaded package in the current worker');
    await page.evaluate(`CodeLab.getModel('starter.py').setValue('while True:\\n    pass\\n')`);
    await page.click('#runButton');
    await page.waitForFunction('!CodeLab.getState().running && CodeLab.getState().outputKind === "error"');
    const timeout = await page.evaluate('CodeLab.getState().output');
    assert.match(String(timeout), /运行超过 1000ms/);
    await page.waitForFunction('CodeLab.getState().runtimeReady');
    await page.evaluate('CodeLab.reset()');
    await page.click('#runButton');
    await page.waitForFunction('!CodeLab.getState().running && CodeLab.getState().outputKind === "success"');
    assert.equal(numpy.length, 2, 'a rebuilt worker running ordinary code must stay NumPy-free');
    await page.evaluate(`CodeLab.getModel('starter.py').setValue(CodeLab.getModel('starter.py').getValue() + '\\nimport numpy as np\\nprint("cancelled-numpy-run")\\n')`);
    const generation = await page.evaluate('CodeLab.getState().runtimeGeneration') as number;
    const requested = page.waitForRequest(request => /numpy.*\.whl/.test(request.url()));
    await page.click('#runButton');
    await requested;
    await page.evaluate('CodeLab.reset()');
    await page.waitForFunction(`CodeLab.getState().runtimeReady && CodeLab.getState().runtimeGeneration > ${generation}`);
    await page.click('#runButton');
    await page.waitForFunction('!CodeLab.getState().running && CodeLab.getState().outputKind === "success"');
    assert.doesNotMatch(String(await page.evaluate('CodeLab.getState().output')), /cancelled-numpy-run/);
    assert.equal(numpy.length, 3, 'cancelled preparation must not start another package load for ordinary code');
    const indirect = '\nimport sys\nnp = sys.modules["builtins"].__dict__["__im" + "port__"]("nu" + "mpy")\nprint("indirect-numpy", int(np.sum([1, 2, 3])))\n';
    await page.evaluate(source => {
      const lab = (window as any).CodeLab;
      lab.getModel('starter.py').setValue(lab.getModel('starter.py').getValue() + source);
    }, indirect);
    await page.click('#runButton');
    await page.waitForFunction('!CodeLab.getState().running && CodeLab.getState().outputKind !== "idle"', undefined, { timeout: 15000 });
    const indirectState = await page.evaluate('CodeLab.getState()') as any;
    assert.equal(indirectState.outputKind, 'success', indirectState.output);
    assert.match(indirectState.output, /indirect-numpy 6/);
    assert.equal(numpy.length, 4);


  } finally { await page?.close(); await release(); rmSync(root, { recursive: true, force: true }); }
});
test('code workbench maps light and dark lecture colors across Monaco and the native view', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { legacyScaffold: scaffold } = await import('../src/tools/code-scaffold.js');
  const { acquireVisualChecker, browser, staticServer } = await import('../src/tools/visual-check.js');
  const root = mkdtempSync(path.join(tmpdir(), 'notale-code-theme-')), pages = path.join(root, 'pages');
  mkdirSync(path.join(pages, 'assets'), { recursive: true });
  const release = acquireVisualChecker();
  let page: import('playwright').Page | undefined;
  try {
    for (const [index, palette] of [
      { bg: '#f3efe7', text: '#17201c', accent: '#a84b32', base: 'vs' },
      { bg: '#14181e', text: '#f1f2f4', accent: '#ffb464', base: 'vs-dark' },
    ].entries()) {
      const css = `/* ==== INTERFACE ====\ntoken --bg --text --accent --font-sans\n==== /INTERFACE ==== */\n:root{--bg:${palette.bg};--text:${palette.text};--accent:${palette.accent};--font-sans:Arial}`;
      writeFileSync(path.join(pages, 'assets/theme.css'), css);
      await scaffold(pages, 'page-01', '颜色映射', 1);
      assert.equal(readFileSync(path.join(pages, 'assets/theme.css'), 'utf8'), css, 'shared theme is unchanged');
      const authorPath = path.join(pages, 'assets/lessons/page-01/lesson/view/style.css');
      const authored = readFileSync(path.join(guidance.RESOURCES, 'code-workbench/lesson/view/style.css'), 'utf8') + '\n.scope{background:rgba(10,14,20,.62);color:#e9eef5;outline-color:rgb(31,99,171)}.scope::before{content:"#05070a"}';
      writeFileSync(authorPath, authored);
      const { origin } = await staticServer(path.join(pages, 'assets/lessons/page-01'));
      page = await (await browser()).newPage({ viewport: { width: 1600, height: 900 } });
      await page.goto(origin + '/index.html');
      await page.waitForFunction('window.CodeLab && CodeLab.getState().runtimeReady && CodeLab.getState().editorReady');
      const actual = await page.evaluate(`({ palette: window.NotaleCodeTheme.palette, base: window.NotaleCodeTheme.monaco.base,
        shell: getComputedStyle(document.querySelector('.workbench')).backgroundColor,
        editor: getComputedStyle(document.querySelector('.monaco-editor')).backgroundColor })`) as any;
      assert.equal(actual.palette.background, palette.bg); assert.equal(actual.palette.foreground, palette.text);
      assert.equal(actual.palette.accent, palette.accent); assert.equal(actual.base, palette.base);
      const rgb = (hex: string) => `rgb(${[1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16)).join(', ')})`;
      assert.equal(actual.shell, rgb(palette.bg)); assert.equal(actual.editor, rgb(actual.palette.surface));
      const native = page.frames().find(frame => frame !== page!.mainFrame()); assert.ok(native);
      await native.waitForFunction('document.documentElement.dataset.frameIndex === "-1"');
      assert.equal(await native.evaluate('getComputedStyle(document.documentElement).getPropertyValue("--viz-bg-0").trim()'), palette.bg);
      assert.equal(await native.evaluate('getComputedStyle(document.documentElement).getPropertyValue("--viz-cyan").trim()'), palette.accent);
      const contrast = await native.evaluate(String.raw`(() => {
        const style=getComputedStyle(document.querySelector('.scope'));
        const canvas=document.createElement('canvas'); canvas.width=canvas.height=1;
        const ctx=canvas.getContext('2d');
        ctx.fillStyle=getComputedStyle(document.documentElement).backgroundColor;ctx.fillRect(0,0,1,1);
        ctx.fillStyle=style.backgroundColor;ctx.fillRect(0,0,1,1);
        const bg=[...ctx.getImageData(0,0,1,1).data].slice(0,3);
        ctx.fillStyle=style.color;ctx.fillRect(0,0,1,1);
        const fg=[...ctx.getImageData(0,0,1,1).data].slice(0,3);
        const luminance=rgb=>rgb.map(c=>{const s=c/255;return s<=0.04045?s/12.92:((s+0.055)/1.055)**2.4}).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
        const a=luminance(bg),b=luminance(fg);
        return {ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),outline:style.outlineColor,content:getComputedStyle(document.querySelector('.scope'),'::before').content};
      })()`) as any;
      assert.ok(contrast.ratio >= 4.5, JSON.stringify(contrast));
      assert.equal(contrast.outline, 'rgb(31, 99, 171)', 'custom colors remain authored');
      assert.equal(contrast.content, '"#05070a"', 'quoted content is not a color declaration');
      assert.equal(readFileSync(authorPath, 'utf8'), authored, 'render mapping does not edit the lesson');
      await page.click('#runButton');
      await page.waitForFunction('!CodeLab.getState().running && CodeLab.getState().outputKind === "success"');
      if (index === 0) await page.screenshot({ path: '/tmp/notale-code-theme-light.png' });
      await page.close(); page = undefined;
    }
  } finally { await page?.close(); await release(); rmSync(root, { recursive: true, force: true }); }
});
