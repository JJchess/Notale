/** Observer course execution, frame and reset checks. */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Page, Frame } from 'playwright';
import { lessonRoot } from './code-scaffold.js';
import { acquireVisualChecker, browser, staticServer } from './visual-check.js';
import { CODE_RUNTIME_VERSION } from '../core/code-observer.js';

/** Always retain endpoints; remaining slots cover the first occurrence of each stage. */
export function representativeFrames(stages: Array<string | null>): number[] {
  if (!stages.length) return [];
  const picks = new Set([0, Math.floor(stages.length / 2), stages.length - 1]);
  const seen = new Set<string>();
  stages.forEach((stage, index) => {
    if (typeof stage === 'string' && !seen.has(stage)) {
      seen.add(stage);
      if (picks.size < 8) picks.add(index);
    }
  });
  return [...picks].sort((a, b) => a - b);
}

export function selectCodeShots(shots: string[]): string[] {
  const named = (name: string) => shots.find(file => path.basename(file) === name + '.png');
  const failure = named('failure');
  return (failure ? [failure, named('active') ?? named('initial')]
    : [named('active'), named('final')]).filter((file): file is string => Boolean(file));
}

/** Failed course tests are collected here so the frame, view and reset checks still run and report in the same round. */
const testFailures = new WeakMap<Page | Frame, string>();
async function assertHealthy(page: Page | Frame): Promise<void> {
  const state = await page.evaluate('window.CodeLab?.getState()') as Record<string, any> | undefined;
  if (state?.outputKind === 'warning') testFailures.set(page, state.output || '课程测试失败');
  if (state?.executionError) {
    const error = state.executionError;
    throw new Error(`[${error.kind}] ${error.message}${error.source ? `\n位置：${error.source.file}:${error.source.line}` : ''}${error.context ? `\n观察上下文：${JSON.stringify(error.context)}` : ''}`);
  }
  if (state?.viewError) throw new Error(`可视化渲染失败：${state.viewError}`);
  if (state?.outputKind === 'error') throw new Error(state.output || '课程运行失败');
}

async function waitForState(page: Page | Frame, condition: string, phase: string, timeout = 30000): Promise<void> {
  try {
    await page.waitForFunction(`(() => { const s = window.CodeLab?.getState(); return s?.executionError || s?.viewError || s?.outputKind === 'error' || (${condition}); })()`, undefined, { timeout });
    await assertHealthy(page);
  } catch (error) {
    await assertHealthy(page);
    throw new Error(`阶段：${phase}\n${error instanceof Error ? error.message : String(error)}`);
  }
}

async function checkView(page: Page | Frame, index: number): Promise<void> {
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
const stateOf = (page: Page | Frame): Promise<Record<string, any>> => page.evaluate('CodeLab.getState()');
const sourcesOf = (page: Page | Frame): Promise<Record<string, string>> => page.evaluate('Object.fromEntries(CodeLab.getLesson().files.map(file => [file.filename, CodeLab.getModel(file.filename).getValue()]))');
async function lessonCoverage(page: Page | Frame, capture: (name: string) => Promise<void>, summary: string[]): Promise<void> {
  const lesson = await page.evaluate('CodeLab.getLesson()') as Record<string, any>, initial = await stateOf(page), sources = await sourcesOf(page);
  const entries = lesson.entryMode === 'active' ? lesson.files.filter((file: any) => Object.hasOwn(file, 'runnable') ? file.runnable : true).map((file: any) => file.filename) : [lesson.entry];
  assert.ok(entries.length, 'lesson has no runnable entry');
  for (const filename of entries) {
    await page.evaluate((name: string) => (globalThis as any).CodeLab.switchFile(name, { focus: false }), filename);
    await page.click('#runButton');
    await waitForState(page, '!CodeLab.getState().running', '课程执行与测试', 15000);
    const state = await stateOf(page);
    assert.ok(['success', 'warning'].includes(state.outputKind), state.output);
    assert.ok(state.frameCount > 0, JSON.stringify(state));
    assert.equal(state.entry, filename, JSON.stringify(state));
    if (state.playing) await page.click('#playButton');
    const stages = await page.evaluate('CodeLab.getFrames().map(frame => frame.state?.stage ?? null)') as Array<string | null>;
    const counts = new Map<string, number>();
    for (const stage of stages) if (typeof stage === 'string') counts.set(stage, (counts.get(stage) ?? 0) + 1);
    summary.push(`${filename}: ${state.frameCount} 帧${counts.size ? `（${[...counts].map(([stage, count]) => `${stage}×${count}`).join(', ')}）` : ''}`);
    // Capacity is the host's business; tell the author what was kept rather than failing the lesson.
    const capacity = await page.evaluate('({truncated: CodeLab.getState().truncated || null, sampled: CodeLab.getState().sampled || []})') as { truncated: { frame: number; limit: string } | null; sampled: Array<{ path: string; from: number; to: number }> };
    const reported = new Set<string>();
    for (const item of capacity.sampled) if (!reported.has(item.path)) { reported.add(item.path); summary.push(`⚠ ${item.path} 由 ${item.from} 均匀抽样到 ${item.to}（宿主 maxItems；帧内保留代表点）`); }
    if (capacity.truncated) summary.push(`⚠ 轨迹在第 ${capacity.truncated.frame} 帧达到 ${capacity.truncated.limit} 上限，之后的帧未记录`);
    for (const index of representativeFrames(stages)) {
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
export async function runBrowserCheck(pages: string, pid: string, shot = false, signal?: AbortSignal, outer = false): Promise<{ report: string; shots: string[] }> {
  const root = lessonRoot(pages, pid), marker = path.join(root, '.notale-code-lesson.json');
  if (!existsSync(marker)) return { report: `失败:代码工作台尚未生成，找不到 ${marker}`, shots: [] };
  const version = JSON.parse(readFileSync(marker, 'utf8')).runtimeVersion;
  if (version !== CODE_RUNTIME_VERSION) return { report: `失败:旧版或未知代码页协议 ${version ?? 'legacy'} 不再支持，请重新生成新版页面`, shots: [] };
  const shotDir = path.join(path.dirname(pages), '.shots/code', pid);
  const combined = AbortSignal.any([AbortSignal.timeout(420000), ...(signal ? [signal] : [])]);
  const release = acquireVisualChecker();
  let page: Page | undefined, course: Page | Frame | undefined, report = '', phase = '打开代码工作台';
  const errors: string[] = [], external: string[] = [], shots: string[] = [], summary: string[] = [];
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
    await page.goto(origin + (outer ? `/${pid}.html` : suffix), { waitUntil: 'domcontentloaded' });
    course = page;
    if (outer) {
      phase = '外层课程嵌入';
      const iframe = page.locator('iframe.code-workbench-frame');
      await iframe.waitFor({ state: 'visible' });
      assert.equal(await iframe.count(), 1, '外层必须嵌入一个代码工作台');
      await page.waitForFunction(() => (document.querySelector('iframe.code-workbench-frame') as HTMLIFrameElement)?.src);
      const src = await iframe.getAttribute('src');
      assert.equal(new URL(src!, page.url()).href, origin + suffix, '外层课程地址或主题引用不匹配');
      const handle = await iframe.elementHandle(); assert.ok(handle);
      const frame = await handle.contentFrame(); assert.ok(frame);
      course = frame;
    }
    phase = '编辑器就绪'; await waitForState(course, 'window.CodeLab?.getState().editorReady', phase);
    phase = 'Python 运行时就绪'; await waitForState(course, 'window.CodeLab?.getState().runtimeReady', phase);
    phase = '初次课程执行与测试'; await waitForState(course, 'window.__prototype?.initialized', phase);
    assert.ok(await course.evaluate('CodeLab.getState().currentStep'), '课程执行没有产生可渲染的观察帧；请检查 observe.py 的观察条件');
    phase = '初始可视化帧';
    await checkView(course, -1);
    await capture('initial');
    phase = '课程运行、选帧与重置';
    await lessonCoverage(course, capture, summary);
    const preview = await course.evaluate('CodeLab.getPreview()');
    if (preview) await writeFile(path.join(root, 'lesson/preview.json'), JSON.stringify(preview));
    assert.deepEqual(external, []); assert.deepEqual(errors, []);
    const failedTests = testFailures.get(course);
    if (failedTests) {
      report = `✗ 代码工作台自检失败（退出码 1）\n✗ 课程测试未通过（执行、抽样渲染与重置已检查，见下）：\n${failedTests}\n` + summary.join('\n') + '\n检查阶段：课程测试';
      await capture('failure');
    } else {
      report = '✓ 代码工作台执行与抽样渲染检查通过\n' + summary.join('\n') + '\n';
      if (shot) report += `  screenshots  ${path.join(shotDir, 'initial.png')}, active.png, final.png\n`;
      report += '全部通过';
    }
  } catch (error) {
    if (combined.aborted) throw combined.reason;
    report = `✗ 代码工作台自检失败（退出码 1）\n${error instanceof Error ? `${error.name}: ${error.message}` : String(error)}`;
    report += `\n检查阶段：${phase}`;
    const failedTests = course && testFailures.get(course);
    if (failedTests) report += `\n✗ 课程测试也未通过：\n${failedTests}`;
    if (errors.length) report += '\n' + errors.slice(0, 5).join('\n');
    await capture('failure');
  } finally {
    combined.removeEventListener('abort', abort);
    await page?.close().catch(() => {}); await release();
  }
  return { report, shots };
}
