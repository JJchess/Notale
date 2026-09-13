import {diagramTheme as diagram} from './diagram-theme.js';
import katex from 'katex';
import { chartSvg } from '@notale/editor/browser';
import { iconChildren } from './icon-library.js';
import { highlight } from './code-highlight.js';
const esc = (s: string) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const box = 'position:absolute;left:120px;top:160px;';
// Every generated object carries its palette as variables on its root: --accent
// follows the lecture's own --model when the page defines one, and the format
// panel recolours a whole object by patching one variable.
const palette = '--accent:var(--model,#466ddb);--accent-2:#28a69b;--accent-soft:#dee8ff;--ink:var(--text,#263449);';
const name = (n: string) => `data-notale-name="${n}"`;
// Shape library: one child element each, no presentation attributes — fill/stroke
// are inherited from the root <svg> style so `element.patch {style}` recolors them.
const SHAPES: Record<string, [label: string, inner: string]> = {
  rect: ['矩形', '<path d="M4 4H296V156H4Z"/>'],
  rounded: ['圆角矩形', '<rect x="4" y="4" width="292" height="152" rx="18"/>'],
  ellipse: ['椭圆', '<ellipse cx="150" cy="80" rx="146" ry="76"/>'],
  triangle: ['三角形', '<path d="M150 4L296 156H4Z"/>'],
  diamond: ['菱形', '<path d="M150 4L296 80L150 156L4 80Z"/>'],
  parallelogram: ['平行四边形', '<path d="M60 4H296L240 156H4Z"/>'],
  pentagon: ['五边形', '<path d="M150 8L222 62L195 149H105L78 62Z"/>'],
  hexagon: ['六边形', '<path d="M78 4H222L296 80L222 156H78L4 80Z"/>'],
  star: ['五角星', '<path d="M150 6L169 58L224 60L180 94L196 147L150 116L104 147L120 94L76 60L131 58Z"/>'],
  'arrow-right': ['右箭头', '<path d="M4 50H200V10L296 80L200 150V110H4Z"/>'],
  'arrow-double': ['双向箭头', '<path d="M4 80L80 10V50H220V10L296 80L220 150V110H80V150Z"/>'],
  callout: ['对话框', '<path d="M20 4H280Q296 4 296 20V110Q296 126 280 126H120L70 156L80 126H20Q4 126 4 110V20Q4 4 20 4Z"/>'],
};
export const shapes = Object.entries(SHAPES).map(([name, [label]]) => ({ name, label }));
// Gallery glyphs are drawn in the button's own colour, so the tool panel stays neutral
// and only the canvas carries the palette (the PowerPoint shape gallery does the same).
export function shapeIcon(name: string) {
  return `<svg viewBox="0 0 300 160" width="42" height="24" aria-hidden="true" style="fill:currentColor;fill-opacity:.16;stroke:currentColor;stroke-width:8;stroke-linejoin:round">${SHAPES[name][1]}</svg>`;
}
export const DEFAULT_TEX = '\\hat{y}=\\sum_{i=1}^{n} w_i x_i + b';
export function renderTex(tex: string, display = true) {
  return katex.renderToString(tex, { displayMode: display, throwOnError: false });
}
export const iconStyle = 'fill:none;stroke:var(--accent,#466ddb);stroke-width:2;stroke-linecap:round;stroke-linejoin:round';
// Simplified SmartArt: plain containers with <p> leaves, so text stays editable
// and the whole layout drags as one container object. Process steps are single
// chevron cards, so duplicating or deleting one keeps the row consistent.
const diagramPalette = `--accent:${diagram.accent};--accent-soft:${diagram.soft};--ink:${diagram.ink};--diagram-border:${diagram.border};font-family:${diagram.font.replaceAll('"', "'")};`;
const chevron = 'clip-path:polygon(0 0,calc(100% - 26px) 0,100% 50%,calc(100% - 26px) 100%,0 100%,26px 50%)';
const step = (title: string, note: string, first = false) =>
  `<div style="flex:1;padding:26px 24px 26px ${first ? 28 : 44}px;background:var(--accent-soft);${first ? chevron.replace(',26px 50%', ',0 50%') : chevron}"><p style="margin:0;font-size:30px;font-weight:700;color:var(--ink)">${title}</p><p style="margin:8px 0 0;font-size:22px;color:var(--ink);opacity:.75">${note}</p></div>`;
function smartArt(kind: string) {
  if (kind === 'process')
    return `<div data-notale-smart="process" ${name('流程图示')} style="${box}${diagramPalette}display:flex;align-items:stretch;gap:0;width:1100px">${['步骤一', '步骤二', '步骤三']
      .map((t, i) => step(t, '说明', i === 0))
      .join('')}</div>`;
  if (kind === 'list')
    return `<div data-notale-smart="list" ${name('列表图示')} style="${box}${diagramPalette}display:grid;gap:14px;width:820px">${['要点一', '要点二', '要点三']
      .map(
        (t, i) =>
          `<div style="display:flex;gap:18px;align-items:center;padding:18px 22px;border-radius:14px;background:#fff;border:1px solid var(--diagram-border)"><span style="flex:none;width:44px;height:44px;border-radius:50%;background:var(--accent);color:#fff;font-size:24px;font-weight:700;display:flex;align-items:center;justify-content:center">${i + 1}</span><p style="margin:0;font-size:28px;color:var(--ink)">${t}</p></div>`,
      )
      .join('')}</div>`;
  if (kind === 'cycle')
    return `<div data-notale-smart="cycle" data-notale-cycle="3" ${name('循环图示')} style="${box}${diagramPalette}position:relative;width:640px;height:640px">${cycleContent(['阶段一', '阶段二', '阶段三'])}</div>`;
  throw new Error(`Unknown layout ${kind}`);
}
// The ring is laid out from the label count, so items can be added or removed and the
// arrows still meet, the way SmartArt re-flows a cycle.
const STAGES = ['阶段一', '阶段二', '阶段三', '阶段四', '阶段五', '阶段六'];
export function cycleLabels(count: number, existing: string[] = []) {
  return Array.from({ length: count }, (_, index) => existing[index] ?? STAGES[index] ?? `阶段${index + 1}`);
}
export function cycleContent(labels: string[]) {
  const r = 220, cx = 320, cy = 320, span = 360 / labels.length, gap = Math.min(18, span * 0.18);
  const arc = (start: number) => {
    const from = ((start + gap) * Math.PI) / 180, to = ((start + span - gap) * Math.PI) / 180;
    const x1 = cx + r * Math.cos(from), y1 = cy + r * Math.sin(from), x2 = cx + r * Math.cos(to), y2 = cy + r * Math.sin(to);
    const nx = -Math.sin(to), ny = Math.cos(to), hx = cx + r * Math.cos(to), hy = cy + r * Math.sin(to);
    const head = `M${(hx - nx * 20 + Math.cos(to) * 16).toFixed(1)} ${(hy - ny * 20 + Math.sin(to) * 16).toFixed(1)}L${(hx + nx * 3).toFixed(1)} ${(hy + ny * 3).toFixed(1)}L${(hx - nx * 20 - Math.cos(to) * 16).toFixed(1)} ${(hy - ny * 20 - Math.sin(to) * 16).toFixed(1)}`;
    return `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)}A${r} ${r} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}"/><path d="${head}"/>`;
  };
  const label = (text: string, angle: number) => {
    const x = cx + r * Math.cos((angle * Math.PI) / 180) - 90, y = cy + r * Math.sin((angle * Math.PI) / 180) - 36;
    return `<p style="position:absolute;left:${x.toFixed(0)}px;top:${y.toFixed(0)}px;width:180px;height:72px;margin:0;display:flex;align-items:center;justify-content:center;text-align:center;border-radius:36px;background:var(--accent-soft);border:2px solid var(--diagram-border,var(--accent));font-size:${labels.length > 4 ? 22 : 26}px;font-weight:700;color:var(--ink)">${esc(text)}</p>`;
  };
  const angles = labels.map((_, index) => -90 + index * span);
  return `<svg width="640" height="640" viewBox="0 0 640 640" aria-hidden="true" style="position:absolute;left:0;top:0;fill:none;stroke:var(--accent);stroke-width:6;stroke-linecap:round;stroke-linejoin:round">${angles
    .map(arc)
    .join('')}</svg>${labels.map((text, index) => label(text, angles[index])).join('')}`;
}
export function template(kind: string, value = '', href = '', display = true): string {
  if (kind === 'text' || kind === 'vertical-text' || kind === 'symbol') {
    const vertical = kind === 'vertical-text', symbol = kind === 'symbol';
    return `<p ${symbol ? name(`符号 ${esc(value)}`) : ''} style="${box}font-size:${symbol ? 64 : 42}px;color:var(--text,#263449);${vertical ? 'width:100px;height:420px;writing-mode:vertical-rl;text-orientation:upright' : `width:${symbol ? '120px;text-align:center' : '600px'};writing-mode:horizontal-tb;text-orientation:mixed`};line-height:1.4">${esc(value || '输入你的内容')}</p>`;
  }
  if (kind.startsWith('wordart:')) {
    // Gradient keeps `color` for the caret and hides the glyph fill instead, so
    // editing in the canvas still shows a cursor.
    const preset = kind.slice(8), style = {
      gradient: 'background:linear-gradient(90deg,var(--accent),var(--accent-2));-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:var(--ink)',
      outline: 'color:#fff;-webkit-text-stroke:2px var(--ink)',
      shadow: 'color:var(--accent);text-shadow:4px 4px 0 var(--accent-soft),8px 8px 0 #bcc9db',
    }[preset];
    if (!style) throw new Error(`Unknown word art ${kind}`);
    return `<p data-notale-wordart="${preset}" ${name('艺术字')} style="${box}${palette}margin:0;font-size:72px;font-weight:800;line-height:1.2;${style}">${esc(value || '艺术字')}</p>`;
  }
  if (kind === 'date')
    return template('text', new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })).replace('<p ', `<p ${name('日期')} `);
  if (kind === 'code') {
    // Highlighting is baked in as inline colours, so the slide needs no extra stylesheet.
    const code = value || 'def predict(x):\n    return sum(w * xi for w, xi in zip(weights, x)) + b';
    return `<pre data-notale-code="${esc(code)}" data-notale-code-lang="python" ${name('代码')} style="${box}width:720px;margin:0;padding:24px 28px;border-radius:14px;background:#1e1e2e;color:#cdd6f4;font:24px/1.5 ui-monospace,Consolas,monospace;white-space:pre-wrap;tab-size:4">${highlight(code, 'python')}</pre>`;
  }
  if (kind.startsWith('icon:'))
    return `<svg width="160" height="160" viewBox="0 0 24 24" data-notale-icon="${kind.slice(5)}" ${name(`图标 ${kind.slice(5)}`)} style="${box}${palette}overflow:visible;${iconStyle}">${iconChildren(kind.slice(5))}</svg>`;
  if (kind.startsWith('smart:')) return smartArt(kind.slice(6));
  if (kind === 'shape') return template('shape:rounded');
  if (kind.startsWith('shape:')) {
    const key = kind.slice(6), shape = SHAPES[key];
    if (!shape) throw new Error(`Unknown shape ${key}`);
    // A shape holds text, as in PowerPoint: the outline is an SVG that stretches with the
    // box, the caption is an ordinary editable paragraph centred over it, and fill/stroke
    // live on the root because both properties inherit into the drawing.
    return `<div data-notale-shape="${key}" ${name(shape[0])} style="${box}${palette}width:300px;height:160px;display:grid;place-items:center;fill:var(--accent-soft);stroke:var(--accent);stroke-width:3;stroke-linejoin:round"><svg viewBox="0 0 300 160" preserveAspectRatio="none" aria-hidden="true" style="position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible">${shape[1]}</svg><p style="position:relative;margin:0;padding:6px 22px;max-width:100%;text-align:center;font-size:28px;line-height:1.3;color:var(--ink)">${esc(value || '文字')}</p></div>`;
  }
  if (kind === 'line')
    return `<svg width="400" height="80" viewBox="0 0 400 80" ${name('箭头')} style="${box}${palette}overflow:visible;fill:none;stroke:var(--accent);stroke-width:4"><path d="M 5 40 L 370 40 M 350 20 L 370 40 L 350 60"/></svg>`;
  if (kind === 'table')
    return `<table style="${box}width:650px;border-collapse:collapse;font-size:26px;background:#fff"><thead><tr>${['模型', '准确率', '说明'].map((t) => `<th style="padding:14px;border:1px solid #bcc9db;text-align:left;background:#e4ebf8">${t}</th>`).join('')}</tr></thead><tbody>${[
      '基线,78%,初始方案',
      '集成,91%,改进结果',
    ]
      .map(
        (row) =>
          `<tr>${row
            .split(',')
            .map((t) => `<td style="padding:14px;border:1px solid #bcc9db">${t}</td>`)
            .join('')}</tr>`,
      )
      .join('')}</tbody></table>`;
  if (kind === 'chart')
    return chartSvg(value ? JSON.parse(value) : { labels: ['A', 'B', 'C'], values: [48, 72, 91] });
  if (kind === 'equation') {
    // The stylesheet link travels inside the object: deleting the equation removes
    // its only dependency, and export picks the CSS up through the generic href scan.
    const tex = value || DEFAULT_TEX;
    return `<div data-notale-tex="${esc(tex)}" data-notale-tex-display="${display ? 1 : 0}" ${name('公式')} style="${box}font-size:${display ? 40 : 32}px;color:var(--text,#263449)${display ? '' : ';display:inline-block'}"><link rel="stylesheet" href="${esc(href)}">${renderTex(tex, display)}</div>`;
  }
  if (kind === 'image')
    return `<img alt="插入图片" src="${esc(value)}" style="${box}width:500px;height:320px;object-fit:contain">`;
  if (kind === 'video' || kind === 'audio')
    return `<${kind} controls src="${esc(value)}" style="${box}width:600px${kind === 'video' ? ';height:340px' : ''}"></${kind}>`;
  throw new Error(`Unknown object type ${kind}`);
}
