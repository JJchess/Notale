/** Observer course execution, frame and reset checks. */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { Page } from 'playwright';
import { lessonRoot } from './code-scaffold.js';
import { acquireVisualChecker, browser, staticServer } from './visual-check.js';
import { CODE_RUNTIME_VERSION } from '../core/code-observer.js';

async function assertHealthy(page: Page): Promise<void> {
  const state = await page.evaluate('window.CodeLab?.getState()') as Record<string, any> | undefined;
  if (state?.executionError) {
    const error = state.executionError;
    throw new Error(`[${error.kind}] ${error.message}${error.source ? `\n位置：${error.source.file}:${error.source.line}` : ''}${error.context ? `\n观察上下文：${JSON.stringify(error.context)}` : ''}`);
  }
  if (state?.viewError) throw new Error(`可视化渲染失败：${state.viewError}`);
  if (['error', 'warning'].includes(state?.outputKind)) throw new Error(state!.output || '课程运行或测试失败');
}

async function waitForState(page: Page, condition: string, phase: string, timeout = 30000): Promise<void> {
  try {
    await page.waitForFunction(`(() => { const s = window.CodeLab?.getState(); return s?.executionError || s?.viewError || ['error','warning'].includes(s?.outputKind) || (${condition}); })()`, undefined, { timeout });
    await assertHealthy(page);
  } catch (error) {
    await assertHealthy(page);
    throw new Error(`阶段：${phase}\n${error instanceof Error ? error.message : String(error)}`);
  }
}

async function checkView(page: Page, index: number): Promise<void> {
  await assertHealthy(page);
  const iframe = page.locator('#visualizer iframe.native-view-frame');
  assert.equal(await iframe.count(), 1);
  const handle = await iframe.elementHandle(); assert.ok(handle);
  const frame = await handle.contentFrame(); assert.ok(frame);
  const deadline = performance.now() + 5000;
  while (!await frame.evaluate((index: number) => document.documentElement.dataset.renderedFrameIndex === String(index), index)) {
    await assertHealthy(page);
    if (performance.now() >= deadline) throw new Error(`阶段：可视化帧 ${index} 渲染确认；等待超过 5000ms`);
    await page.waitForTimeout(50);
  }
  await assertHealthy(page);
  assert.ok(await frame.locator('body > *').count() > 0, 'lesson view is empty');
  assert.equal(await page.locator('#visualizerError').isVisible(), false, await page.locator('#visualizerError').innerText());
}
const stateOf = (page: Page): Promise<Record<string, any>> => page.evaluate('CodeLab.getState()');
const sourcesOf = (page: Page): Promise<Record<string, string>> => page.evaluate('Object.fromEntries(CodeLab.getLesson().files.map(file => [file.filename, CodeLab.getModel(file.filename).getValue()]))');
async function lessonCoverage(page: Page, capture: (name: string) => Promise<void>): Promise<void> {
  const lesson = await page.evaluate('CodeLab.getLesson()') as Record<string, any>, initial = await stateOf(page), sources = await sourcesOf(page);
  const entries = lesson.entryMode === 'active' ? lesson.files.filter((file: any) => Object.hasOwn(file, 'runnable') ? file.runnable : true).map((file: any) => file.filename) : [lesson.entry];
  assert.ok(entries.length, 'lesson has no runnable entry');
  for (const filename of entries) {
    await page.evaluate((name: string) => (globalThis as any).CodeLab.switchFile(name, { focus: false }), filename);
    await page.click('#runButton');
    await waitForState(page, '!CodeLab.getState().running', '课程执行与测试', 15000);
    const state = await stateOf(page);
    assert.equal(state.outputKind, 'success', state.output);
    assert.ok(state.frameCount > 0, JSON.stringify(state));
    assert.equal(state.entry, filename, JSON.stringify(state));
    if (state.playing) await page.click('#playButton');
    for (const index of [...new Set([0, Math.floor(state.frameCount / 2), state.frameCount - 1])].sort((a, b) => a - b)) {
      await page.evaluate((index: number) => {
        const CodeLab = (globalThis as any).CodeLab;
        CodeLab.selectFrame(index);
      }, index);
      const current = await page.evaluate('CodeLab.getState().currentStep') as Record<string, any>, source = current.source;
      assert.ok(source.file in sources, JSON.stringify(source));
      const lines = sources[source.file]!.split(/\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/);
      if (lines.at(-1) === '') lines.pop();
      assert.ok(source.line >= 1 && source.line <= lines.length + 1, JSON.stringify(source));
      await checkView(page, index);
      if (index === Math.floor(state.frameCount / 2)) await capture('active');
    }
    await capture('final');
    await page.evaluate('CodeLab.reset()');
    const reset = await stateOf(page);
    for (const key of ['activeFile', 'frameIndex', 'frameCount', 'currentStep', 'output', 'outputKind', 'playing']) assert.deepEqual(reset[key], initial[key], key);
    assert.deepEqual(await sourcesOf(page), sources);
    await checkView(page, -1);
  }
}
export async function runBrowserCheck(pages: string, pid: string, shot = false, signal?: AbortSignal): Promise<{ report: string; shots: string[] }> {
  const root = lessonRoot(pages, pid), marker = path.join(root, '.notale-code-lesson.json');
  if (!existsSync(marker)) return { report: `失败:代码工作台尚未生成，找不到 ${marker}`, shots: [] };
  const version = JSON.parse(readFileSync(marker, 'utf8')).runtimeVersion;
  if (version !== CODE_RUNTIME_VERSION) return { report: `失败:旧版或未知代码页协议 ${version ?? 'legacy'} 不再支持，请重新生成新版页面`, shots: [] };
  const shotDir = path.join(path.dirname(pages), '.shots/code', pid);
  const combined = AbortSignal.any([AbortSignal.timeout(420000), ...(signal ? [signal] : [])]);
  const release = acquireVisualChecker();
  let page: Page | undefined, report = '', phase = '打开代码工作台';
  const errors: string[] = [], external: string[] = [], shots: string[] = [];
  const capture = async (name: string): Promise<void> => {
    if (!shot || !page) return;
    try { await mkdir(shotDir, { recursive: true }); const file = path.join(shotDir, name + '.png'); await page.screenshot({ path: file, timeout: 3000 }); shots.push(file); }
    catch { /* Screenshot evidence must not replace the execution diagnosis. */ }
  };
  const abort = () => { void page?.close().catch(() => {}); };
  combined.addEventListener('abort', abort, { once: true });
  try {
    combined.throwIfAborted();
    const active = await browser(), { origin } = await staticServer(pages);
    page = await active.newPage({ viewport: { width: 1600, height: 900 } });
    combined.throwIfAborted();
    page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
    page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
    page.on('requestfailed', request => errors.push(`request failed: ${request.url()}`));
    page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`); });
    page.on('request', request => {
      const url = new URL(request.url());
      if (!['data:', 'blob:', 'about:'].includes(url.protocol) && !['127.0.0.1', 'localhost'].includes(url.hostname)) external.push(request.url());
    });
    const suffix = `/assets/lessons/${pid}/index.html${existsSync(path.join(pages, 'assets/theme.css')) ? '?theme=../../theme.css' : ''}`;
    await page.goto(origin + suffix, { waitUntil: 'domcontentloaded' });
    phase = '编辑器就绪'; await waitForState(page, 'window.CodeLab?.getState().editorReady', phase);
    phase = 'Python 运行时就绪'; await waitForState(page, 'window.CodeLab?.getState().runtimeReady', phase);
    phase = '初次课程执行与测试'; await waitForState(page, 'window.__prototype?.initialized', phase);
    assert.ok(await page.evaluate('CodeLab.getState().currentStep'), '课程执行没有产生可渲染的观察帧；请检查 observe.py 的观察条件');
    phase = '初始可视化帧';
    await checkView(page, -1);
    await capture('initial');
    phase = '课程运行、选帧与重置';
    await lessonCoverage(page, capture);
    assert.deepEqual(external, []); assert.deepEqual(errors, []);
    report = '✓ 代码工作台自检通过\nok  lesson execution, tests, trace, native view, reset\n';
    if (shot) report += `  screenshots  ${path.join(shotDir, 'initial.png')}, active.png, final.png\n`;
    report += '全部通过';
  } catch (error) {
    if (combined.aborted) throw combined.reason;
    report = `✗ 代码工作台自检失败（退出码 1）\n${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`;
    report += `\n检查阶段：${phase}`;
    if (errors.length) report += '\n' + errors.slice(0, 5).join('\n');
    await capture('failure');
  } finally {
    combined.removeEventListener('abort', abort);
    await page?.close().catch(() => {}); await release();
  }
  return { report, shots };
}
