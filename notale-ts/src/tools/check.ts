import { assembleTemplatePage, templatePageAudit } from '../core/template-page.js';
/** Check's public tool contract: full measurement, selective image feedback, original guidance. */
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { resizeRgbPng } from './image-resample.js';
import { RESOURCES } from '../core/guidance.js';
import { runSelfcheck, report, checkDiagnostics, type CheckState } from './selfcheck.js';
import type { CheckDiagnostics } from './workspace.js';
import type { ToolOutput, Workspace } from './workspace.js';

const instructions = JSON.parse(readFileSync(path.join(RESOURCES, 'check-instructions.json'), 'utf8'));
export async function imageOutput(file: string): Promise<ToolOutput> {
  const input = await readFile(file), metadata = await sharp(input).metadata();
  const width = metadata.width!, height = metadata.height!;
  if (width <= 1600 && metadata.space === 'cmyk') throw Object.assign(new Error('cannot write mode CMYK as PNG'), { name: 'OSError' });
  let resized: Buffer | undefined, note = '', w = width, h = height;
  if (width > 1600) {
    w = 1600; const scaled = height * 1600 / width, floor = Math.floor(scaled);
    h = scaled - floor === 0.5 ? floor + (floor % 2) : Math.round(scaled);
    resized = await resizeRgbPng(input, w, h);
    note = `,已从 ${width}×${height} 缩到 ${w}×${h} 再给你`;
  }
  const decoder = sharp(input, { ignoreIcc: true }).keepIccProfile();
  if (metadata.space === 'grey16' && metadata.channels === 1) decoder.toColourspace('grey16');
  return { text: `${path.basename(file)}(${w}×${h},约 ${Math.floor(w * h / 750)} token${note})`, images: [['image/png', (resized ?? await decoder.png().toBuffer()).toString('base64')]] };
}
export function checkUse(workflow?: string): string { return instructions.guidance[workflow ?? ''] ?? ''; }
export function selectCheckShots(states: CheckState[], crop = false): string[] {
  const full = crop ? states[0]?.crop : states[0]?.png;
  const last = states.length > 1 ? (crop ? states.at(-1)?.crop : states.at(-1)?.png) : undefined;
  const initial = crop ? undefined : states[0]?.step_pngs?.[0];
  return [...new Set((states.length > 1 ? [full, last] : [initial, full]).filter((x): x is string => Boolean(x)))].slice(0, 2);
}
export async function check(args: Record<string, any>, context: Workspace, signal?: AbortSignal): Promise<ToolOutput> {
  const page = String(args.page), shot = Boolean(args.shot);
  let box = shot ? args.box : undefined, zoom = 2;
  const failure = (text: string): ToolOutput => ({ text, images: [], diagnostics: { fatal_errors: [text], visual_warnings: [] } });
  if (box != null) {
    if (!Array.isArray(box) || box.length !== 4 || box.some(value => !Number.isInteger(value)) || box[2] <= 0 || box[3] <= 0) return failure('失败：box 必须是 [x,y,w,h] 整数数组，宽高必须大于 0。');
    if (JSON.stringify(box) === '[0,0,1600,900]') box = undefined;
    else {
      if (box[0] >= 1600 || box[1] >= 900 || box[0] + box[2] <= 0 || box[1] + box[3] <= 0) return failure('失败：box 超出画布，没有可裁区域。');
      zoom = args.zoom === undefined ? 2 : args.zoom;
      if (!Number.isInteger(zoom) || zoom < 1) return failure('失败：zoom 必须是大于等于 1 的整数。');
    }
  }
  let text: string;
  let measured: CheckState[] = [];
  let diagnostics: CheckDiagnostics = { fatal_errors: [], visual_warnings: [] };
  const images: Array<[string, string]> = [];
  if (!existsSync(path.resolve(context.cwd, page))) return failure(`失败:${page} 不存在。页面文件名形如 page-07.html`);
  else {
    const templateErrors = await assembleTemplatePage(context.cwd, page, context.resourceRoot ? path.basename(context.resourceRoot) : undefined);
    if (templateErrors.length) return failure(templateErrors.map(error => '失败:模板契约：' + error).join('\n'));
    const pageAudit = await templatePageAudit(context.cwd, page);
    const timeout = AbortSignal.timeout(300000), combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const states = await runSelfcheck([path.resolve(context.cwd, page)], { ...(shot || box ? { shotDir: path.join(path.dirname(context.cwd), '.shots') } : {}), after: args.after || [], ...(box ? { crop: box } : {}), zoom, signal: combined, ...(pageAudit ? { pageAudit } : {}) });
    measured = states.flatMap(([, states]) => states);
    diagnostics = checkDiagnostics(measured);
    text = states.map(([name, states]) => report(name, states, context.textReport ?? false)).join('').trim();
  }
  if (shot) {
    const kind = box ? '裁图' : '截图';
    const inline = selectCheckShots(measured, Boolean(box)).filter(existsSync);
    for (const file of inline) images.push(...(await imageOutput(file)).images);
    const selected = new Set(inline);
    text = text.replace(new RegExp(`^(\\s*${kind} )(\\S+\\.png)([^\\n]*)$`, 'gm'), (line, _prefix, file) => line + (selected.has(file) ? ' [已内联]' : ' [可 Read]'));
    if (box && !inline.length) text += '\n失败：没有生成局部截图，请检查渲染报告。';
  }
  const guidance = checkUse(context.resourceRoot ? path.basename(context.resourceRoot) : undefined);
  return { text: guidance ? guidance + '\n\n' + text : text, images, diagnostics };
}
