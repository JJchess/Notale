/** Code lesson execution gate, ported from vendor/code-workbench/check.py. */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { Page } from 'playwright';
import { lessonRoot } from './code-scaffold.js';
import { acquireVisualChecker, browser, staticServer } from './visual-check.js';

async function checkView(page: Page, index: number): Promise<void> {
  const iframe = page.locator('#visualizer iframe.native-view-frame');
  assert.equal(await iframe.count(), 1);
  const handle = await iframe.elementHandle(); assert.ok(handle);
  const frame = await handle.contentFrame(); assert.ok(frame);
  await frame.waitForFunction((index: number) => document.documentElement.dataset.frameIndex === String(index), index, { timeout: 5000 });
  assert.ok(await frame.locator('body > *').count() > 0, 'lesson view is empty');
  assert.equal(await page.locator('#visualizerError').isVisible(), false, await page.locator('#visualizerError').innerText());
}
const stateOf = (page: Page): Promise<Record<string, any>> => page.evaluate('CodeLab.getState()');
const sourcesOf = (page: Page): Promise<Record<string, string>> => page.evaluate('Object.fromEntries(CodeLab.getLesson().files.map(file => [file.filename, CodeLab.getModel(file.filename).getValue()]))');
async function lessonCoverage(page: Page, shots?: string): Promise<void> {
  const lesson = await page.evaluate('CodeLab.getLesson()') as Record<string, any>, initial = await stateOf(page), sources = await sourcesOf(page);
  const entries = lesson.entryMode === 'active' ? lesson.files.filter((file: any) => Object.hasOwn(file, 'runnable') ? file.runnable : true).map((file: any) => file.filename) : [lesson.entry];
  assert.ok(entries.length, 'lesson has no runnable entry');
  for (const filename of entries) {
    await page.evaluate((name: string) => (globalThis as any).CodeLab.switchFile(name, { focus: false }), filename);
    await page.click('#runButton');
    await page.waitForFunction('!CodeLab.getState().running', undefined, { timeout: 15000 });
    const state = await stateOf(page);
    assert.equal(state.outputKind, 'success', state.output);
    assert.ok(state.frameCount > 0, JSON.stringify(state));
    assert.equal(state.entry, filename, JSON.stringify(state));
    if (state.playing) await page.click('#playButton');
    for (const index of [...new Set([0, Math.floor(state.frameCount / 2), state.frameCount - 1])].sort((a, b) => a - b)) {
      await page.evaluate((index: number) => {
        const CodeLab = (globalThis as any).CodeLab;
        const from = CodeLab.getState().frameIndex;
        const button = document.querySelector<HTMLButtonElement>(index < from ? '#previousButton' : '#nextButton')!;
        for (let n = 0; n < Math.abs(index - from); n++) button.click();
        if (CodeLab.getState().frameIndex !== index) throw new Error('无法选择课程执行帧 ' + index);
      }, index);
      const current = await page.evaluate('CodeLab.getState().currentStep') as Record<string, any>, source = current.source;
      assert.ok(source.file in sources, JSON.stringify(source));
      const lines = sources[source.file]!.split(/\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/);
      if (lines.at(-1) === '') lines.pop();
      assert.ok(source.line >= 1 && source.line <= lines.length + 1, JSON.stringify(source));
      await checkView(page, index);
      if (shots && index === Math.floor(state.frameCount / 2)) await page.screenshot({ path: path.join(shots, 'active.png') });
    }
    if (shots) await page.screenshot({ path: path.join(shots, 'final.png') });
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
  const shotDir = path.join(path.dirname(pages), '.shots/code', pid);
  const combined = AbortSignal.any([AbortSignal.timeout(420000), ...(signal ? [signal] : [])]);
  const release = acquireVisualChecker();
  let page: Page | undefined, report = '';
  const abort = () => { void page?.close().catch(() => {}); };
  combined.addEventListener('abort', abort, { once: true });
  try {
    combined.throwIfAborted();
    const active = await browser(), { origin } = await staticServer(root);
    page = await active.newPage({ viewport: { width: 1600, height: 900 } });
    combined.throwIfAborted();
    const errors: string[] = [], external: string[] = [];
    page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
    page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
    page.on('requestfailed', request => errors.push(`request failed: ${request.url()}`));
    page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`); });
    page.on('request', request => {
      const url = new URL(request.url());
      if (!['data:', 'blob:', 'about:'].includes(url.protocol) && !['127.0.0.1', 'localhost'].includes(url.hostname)) external.push(request.url());
    });
    await page.goto(origin + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('window.CodeLab && CodeLab.getState().editorReady', undefined, { timeout: 30000 });
    await page.waitForFunction('CodeLab.getState().runtimeReady', undefined, { timeout: 30000 });
    await checkView(page, -1);
    if (shot) { await mkdir(shotDir, { recursive: true }); await page.screenshot({ path: path.join(shotDir, 'initial.png') }); }
    await lessonCoverage(page, shot ? shotDir : undefined);
    assert.deepEqual(external, []); assert.deepEqual(errors, []);
    report = '✓ 代码工作台自检通过\nok  lesson execution, tests, trace, native view, reset\n';
    if (shot) report += `  screenshots  ${path.join(shotDir, 'initial.png')}, active.png, final.png\n`;
    report += '全部通过';
  } catch (error) {
    if (combined.aborted) throw combined.reason;
    report = `✗ 代码工作台自检失败（退出码 1）\n${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`;
  } finally {
    combined.removeEventListener('abort', abort);
    await page?.close().catch(() => {}); await release();
  }
  return { report, shots: ['initial.png', 'active.png', 'final.png'].map(name => path.join(shotDir, name)).filter(existsSync) };
}
