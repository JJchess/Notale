/** Full browser measurement and report orchestration from vendor/chassis/selfcheck.py. */
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resizeRgbPng } from './image-resample.js';
import type { Page, Browser } from 'playwright';
import { acquireVisualChecker, browser } from './visual-check.js';
import { jsonText } from '../core/json.js';
import { recordPreviewSnapshot } from '../core/preview-snapshot.js';
import type { CheckDiagnostics } from './workspace.js';

declare const BUNDLED_SELFCHECK_PROBES: Record<string, any>;
const probes = typeof BUNDLED_SELFCHECK_PROBES === 'undefined'
  ? JSON.parse(readFileSync(new URL('../../resources/selfcheck-probe.json', import.meta.url), 'utf8'))
  : BUNDLED_SELFCHECK_PROBES;
type Probe = Record<string, any>;
export interface CheckState {
  label: string | null; probe: Probe | null; errs: string[]; bad: string[]; png: string | null;
  steps?: number; step_pngs?: string[]; rewind_png?: string | null; step_issues?: string[];
  viewport_issues?: string[]; result?: unknown; js_error?: string | null; crop?: string | null;
  cropSize?: [number, number]; capture_notes?: string[];
}
export interface CheckOptions { pageAudit?(page: Page): Promise<string[]>; shotDir?: string; wait?: number; after?: string[]; crop?: number[]; zoom?: number; signal?: AbortSignal }
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error)).replace(/^page\./, 'Page.');
const shorten = (text: string, max: number) => [...text].slice(0, max).join('');
async function viewportContract(active: Browser, file: string, wait: number, signal?: AbortSignal): Promise<string[]> {
  const small = await active.newPage({ viewport: { width: 800, height: 450 } });
  const abort = () => { void small.close().catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    signal?.throwIfAborted();
    await small.goto(pathToFileURL(path.resolve(file)).href, { waitUntil: 'load' });
    await small.waitForTimeout(wait);
    return await small.evaluate(`(${probes.CONTRACT})()`);
  } catch (error) { if (signal?.aborted) throw signal.reason; return [`缩放检查未完成: ${shorten(errorText(error), 160)}`]; }
  finally { signal?.removeEventListener('abort', abort); await small.close().catch(() => {}); }
}
/** Observe finite browser/chart transitions; never stop a continuous simulation. */
export async function settleCapture(page: Page): Promise<string | null> {
  try {
    await page.waitForFunction(() => {
      const finite = document.getAnimations().some(a => a.playState === 'running' && a.effect?.getComputedTiming().endTime !== Infinity);
      const echarts = (window as any).echarts;
      const charts = echarts && [...document.querySelectorAll('[_echarts_instance_]')].some(el => {
        const animation = echarts.getInstanceByDom(el)?.getZr()?.animation;
        return animation?.isFinished && !animation.isFinished();
      });
      return !finite && !charts;
    }, undefined, { timeout: 3000, polling: 'raf' });
    await page.evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    return null;
  } catch (error) {
    if ((error as Error).name !== 'TimeoutError') throw error;
    return '有限动画等待超过 3 秒，此状态截图可能仍在变化；不据此判断数据绘制错误';
  }
}
async function shrink(png: Buffer, dest: string): Promise<void> {
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, await resizeRgbPng(png, 800, 450));
}
async function shoot(page: Page, dest: string, options: CheckOptions): Promise<{ png: string; crop: string | null; cropSize?: [number, number] }> {
  const image = await page.screenshot();
  let crop: string | null = null, cropSize: [number, number] | undefined;
  if (options.crop) {
    const [x, y, width, height] = options.crop as [number, number, number, number];
    const left = Math.max(0, Math.min(x, 1600)), top = Math.max(0, Math.min(y, 900));
    const right = Math.max(0, Math.min(x + width, 1600)), bottom = Math.max(0, Math.min(y + height, 900));
    if (right - left >= 2 && bottom - top >= 2) {
      const zoom = options.zoom ?? 2;
      cropSize = [(right - left) * zoom, (bottom - top) * zoom];
      crop = dest.replace(/\.png$/, '-crop.png');
      await mkdir(path.dirname(crop), { recursive: true });
      await writeFile(crop, await resizeRgbPng(image, ...cropSize, { left, top, width: right - left, height: bottom - top }));
    }
  }
  await shrink(image, dest);
  return { png: dest, crop, ...(cropSize ? { cropSize } : {}) };
}
export async function runSelfcheck(files: string[], options: CheckOptions = {}): Promise<Array<[string, CheckState[]]>> {
  const release = acquireVisualChecker(), output: Array<[string, CheckState[]]> = [];
  const wait = options.wait ?? 1200;
  try {
    const active = await browser();
    for (const file of files) {
      options.signal?.throwIfAborted();
      const page = await active.newPage({ viewport: { width: 1600, height: 900 } });
      const abort = () => { void page.close().catch(() => {}); };
      options.signal?.addEventListener('abort', abort, { once: true });
      const errors: string[] = [], bad: string[] = [];
      page.on('pageerror', error => errors.push(`JS 报错: ${error.message}`));
      page.on('console', message => { if (message.type() === 'error') errors.push('console.error: ' + shorten(message.text(), 120)); });
      page.on('requestfailed', request => bad.push(`${request.url().split('/').at(-1)}  ${request.failure()?.errorText}`));
      page.on('response', response => { if (response.status() >= 400) bad.push(`${response.url().split('/').at(-1)}  HTTP ${response.status()}`); });
      let viewport: Promise<string[]> | undefined;
      try {
        const stem = path.basename(file, path.extname(file));
        let probe: Probe, maximum = 0, rewind: string | null = null;
        const stepPngs: string[] = [], issues: string[] = [], captureNotes: string[] = [];
        const settle = async (label: string) => { const note = await settleCapture(page); if (note) captureNotes.push(label + ': ' + note); };
        try {
          await page.goto(pathToFileURL(path.resolve(file)).href, { waitUntil: 'load' });
          await page.waitForTimeout(wait);
          await settle('初态');
          const contract = await page.evaluate(`(${probes.CONTRACT})()`) as string[];
          maximum = contract.length ? 0 : await page.evaluate('(window.Deck && Deck.stepMax) || 0');
          if (maximum) {
            const counts = await page.evaluate(`Array.from({length: Deck.stepMax + 1}, (_, i) => document.querySelectorAll('#stage [data-deck-step="' + i + '"]').length)`) as number[];
            const functions = await page.evaluate('Deck._stepFns.length');
            for (let i = 1; i <= maximum; i++) if (!counts[i] && !functions) issues.push(`第 ${i} 步没有任何元素出场,也没有 Deck.onStep(空步)`);
            for (let i = 0; i < maximum; i++) {
              options.signal?.throwIfAborted();
              await page.evaluate(`Deck.stepTo(${i})`); await page.waitForTimeout(350);
              if (options.shotDir) { await settle('第 ' + i + ' 步'); const dest = path.join(options.shotDir, `${stem}-step${i}.png`); await shrink(await page.screenshot(), dest); stepPngs.push(dest); if (i === 0) await recordPreviewSnapshot(page, file, dest); }
            }
            await page.evaluate(`Deck.stepTo(${maximum}); Deck.stepTo(0)`); await page.waitForTimeout(350);
            if (options.shotDir) { await settle('回退初态'); rewind = path.join(options.shotDir, `${stem}-step0-back.png`); await shrink(await page.screenshot(), rewind); }
            await page.evaluate(`Deck.stepTo(${maximum})`); await page.waitForTimeout(350);
            await settle('完整末态');
          }
          probe = await page.evaluate(`(${probes.PROBE})()`);
        } catch (error) {
          if (options.signal?.aborted) throw options.signal.reason;
          output.push([path.basename(file), [{ label: null, probe: { fatal: shorten(errorText(error), 200) }, errs: errors, bad, png: null }]]);
          continue;
        }
        if (!probe.contract?.length) {
          viewport = viewportContract(active, file, wait, options.signal);
          // Observe early rejection while the primary page continues its after states.
          void viewport.catch(() => {});
        }
        if (options.pageAudit) errors.push(...(await options.pageAudit(page)).map(error => '底盘契约:模板：' + error));
        const states: CheckState[] = [{ label: null, probe, errs: [...errors], bad: [...bad], png: null, steps: maximum, step_pngs: stepPngs, rewind_png: rewind, step_issues: issues, capture_notes: captureNotes }];
        if (options.shotDir) {
          const dest = path.join(options.shotDir, `${stem}.png`);
          Object.assign(states[0]!, await shoot(page, dest, options));
          if (!options.crop) await recordPreviewSnapshot(page, file, dest);
        }
        let errorCursor = errors.length, badCursor = bad.length;
        for (const [index, js] of (options.after ?? []).entries()) {
          options.signal?.throwIfAborted();
          const state: CheckState = { label: shorten(js.split(/\s+/).filter(Boolean).join(' '), 60), probe: null, errs: [], bad: [], png: null, js_error: null };
          try { state.result = (await page.evaluate(`(() => { ${js} })()`)) ?? null; }
          catch (error) { if (options.signal?.aborted) throw options.signal.reason; state.js_error = shorten(errorText(error).split(/\s+/).join(' '), 160); }
          if (!state.js_error) {
            await page.waitForTimeout(600);
            const note = await settleCapture(page); if (note) state.capture_notes = [note];
            state.probe = await page.evaluate(`(${probes.PROBE})()`);
            if (options.shotDir) Object.assign(state, await shoot(page, path.join(options.shotDir, `${stem}-after${index + 1}.png`), options));
          }
          if (options.pageAudit) errors.push(...(await options.pageAudit(page)).map(error => '底盘契约:模板：' + error));
          state.errs = errors.slice(errorCursor); state.bad = bad.slice(badCursor); errorCursor = errors.length; badCursor = bad.length;
          states.push(state);
        }
        output.push([path.basename(file), states]);
        if (viewport) states[0]!.viewport_issues = await viewport;
      } finally {
        options.signal?.removeEventListener('abort', abort);
        await page.close().catch(() => {});
        if (viewport) await viewport.catch(() => {});
      }
    }
    return output;
  } finally { await release(); }
}
const at = (item: Probe) => item.at ? `@${item.at[0]},${item.at[1]} ${item.at[2]}×${item.at[3]}` : '';
export function checkDiagnostics(states: CheckState[]): CheckDiagnostics {
  const fatal_errors: string[] = [], visual_warnings: string[] = [];
  for (const state of states) {
    const probe = state.probe;
    if (state.js_error) fatal_errors.push('这段 JS 报错了，这个状态没测到: ' + state.js_error);
    else if (!probe || probe.fatal) fatal_errors.push('无法渲染: ' + (probe?.fatal ?? '没有有效检查结果'));
    fatal_errors.push(...state.errs, ...state.bad.map(x => '资源加载失败 ' + x),
      ...[...(probe?.contract ?? []), ...(state.viewport_issues ?? [])].map(x => '底盘契约: ' + x));
    if (!probe || probe.fatal || probe.contract?.length) continue;
    for (const item of probe.escaped ?? []) {
      const side = ['左', '上', '右', '下'].filter((_, i) => item.out[i]).join(', ') || '?';
      visual_warnings.push(`超出画布 ${item.el} 往${side}出去 ${Math.max(...item.out)}px ${at(item)} «${item.text}»`);
    }
    for (const item of probe.clipped ?? []) visual_warnings.push(`被裁 ${item.el} 内容 ${jsonText(item.need)} 容器只有 ${jsonText(item.have)} ${at(item)} «${item.text}»`);
    visual_warnings.push(...(state.step_issues ?? []));
  }
  return { fatal_errors: [...new Set(fatal_errors)], visual_warnings: [...new Set(visual_warnings)] };
}
function stateLines(state: CheckState, textReport: boolean): string[] {
  const lines: string[] = [];
  const diagnostic = checkDiagnostics([state]);
  lines.push(...diagnostic.fatal_errors.map(x => '   ✗ ' + x), ...diagnostic.visual_warnings.map(x => '   ✗ ' + x));
  lines.push(...(state.capture_notes ?? []).map(x => '   截图时序: ' + x));
  if (state.result != null) lines.push('   返回值 ' + jsonText(state.result));
  const probe = state.probe;
  if (state.js_error || !probe || probe.fatal) return lines;
  if (probe.contract?.length) { if (state.png) lines.push('   截图 ' + state.png); return lines; }
  const sizes = [...probe.sizes].sort((a: number, b: number) => a - b);
  if (!diagnostic.fatal_errors.length && !probe.escaped.length && !probe.clipped.length) lines.push('   渲染无报错,没有元素超出画布或被裁');
  if (state.steps) lines.push(`   分步 0..${state.steps}（${state.steps + 1} 个状态），以上判定按末步`);
  if (sizes.length) lines.push(`   canvas ${probe.canvases} 个;有文字的元素 ${sizes.length} 个,字号最小 ${sizes[0]}px 中位 ${sizes[Math.floor(sizes.length / 2)]}px 最大 ${sizes.at(-1)}px`);
  const minor = probe.minor ?? {};
  if (minor.all) {
    lines.push(`   次级文字 舞台纯色参考下 ≤15px 且低对比的 ${minor.n} 处,承载 ${Math.floor(minor.chars * 100 / minor.all)}% 的字符` + (minor.at?.length ? '；例如 ' + minor.at.join('、') : ''));
    if (minor.unmeasuredChars) lines.push(`   对比度 ${minor.unmeasuredChars} 字涉及复杂背景、局部底色或透明/过滤，未测；需看图`);
  }
  if (textReport && probe.text) lines.push(`   文字 画面 ${probe.text.chars ?? 0} 字（汉字 ${probe.text.cjk ?? 0}）· 讲稿 ${probe.text.notes ?? 0} 字`);
  if (probe.theme?.invalidTokens?.length) lines.push('   参考 根上缺失或不可用于对应属性的必需主题值：' + probe.theme.invalidTokens.join('、') + '；页面无权改共享资产，不能据此断言 CSS 语法损坏');
  // Counts alone cannot guide a repair. Keep the raw probe, and report only
  // existing text pairs / element identities that can be checked in the image.
  for (const [a, b] of probe.overlap_pairs ?? []) {
    if (a && b) lines.push(`   疑似文字叠压 «${a}» / «${b}»；结合截图确认`);
  }
  for (const item of probe.intrude ?? []) {
    if (item.el) lines.push(`   侵入${item.band} ${item.el} ${item.px}px «${item.text}»`);
  }
  if (state.png) {
    for (const [index, shot] of (state.step_pngs ?? []).entries()) lines.push(`   截图 ${shot}  (第 ${index} 步)`);
    if (state.rewind_png) lines.push(`   截图 ${state.rewind_png}  (回退到第 0 步，供核对状态)`);
    lines.push(`   截图 ${state.png}  (800×450` + (state.steps ? `,第 ${state.steps} 步 = 完整画面` : '') + ')');
  }
  if (state.crop && state.cropSize) lines.push(`   裁图 ${state.crop}  (${state.cropSize[0]}×${state.cropSize[1]})`);
  return lines;
}
export function report(name: string, states: CheckState[], textReport = false): string {
  const output = [`\n── ${name}`];
  let baseline: string[] | undefined, label = '初态';
  for (const [index, state] of states.entries()) {
    if (index) output.push(`   ┄ after${index} «${state.label}»`);
    const lines = stateLines(state, textReport);
    const measured = !!state.probe && !state.js_error && !state.probe.fatal && !state.probe.contract?.length;
    const metrics = lines.filter(line => !/^(?:✗|打不开:|截图 |裁图 |返回值 )/.test(line.trimStart()));
    let emitted = lines;
    if (measured && baseline) {
      emitted = lines.filter(line => !metrics.includes(line) || !baseline!.includes(line));
      const current = new Set(metrics.map(line => line.trim().split(/\s+/)[0]));
      const missing = [...new Set(baseline.map(line => line.trim().split(/\s+/)[0]!))].filter(key => !current.has(key)).sort();
      const unchanged = metrics.filter(line => baseline!.includes(line)).length;
      if (unchanged) output.push(`   已测，${emitted.length || missing.length ? `其余 ${unchanged} 项` : '指标'}同${label}`);
      if (missing.length) output.push('   本状态不再报告的项目：' + missing.join('、'));
    } else if (measured) { baseline = metrics; label = index === 0 ? '初态' : `after${index}`; }
    output.push(...emitted);
  }
  return output.join('\n') + '\n';
}
