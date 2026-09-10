#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const toolRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(toolRoot, '../..');
const organizedRoot = path.join(repoRoot, 'refs/template/organized');
const runtime = fs.readFileSync(path.join(toolRoot, 'native-template-runtime.js'), 'utf8');
const sharedFontRoot = path.join(organizedRoot, '_shared/fonts');
const vectorTracer = path.join(toolRoot, 'trace-native-vectors.py');
const edgeStripTracer = path.join(toolRoot, 'native-edge-strips.py');
const forceVectorRetrace = process.argv.includes('--retrace-vectors');

const sharedFonts = [
  { query: 'Noto Sans CJK SC:style=Regular', file: 'NotaleCJK-Regular.otf', weight: 400 },
  { query: 'Noto Sans CJK SC:style=Medium', file: 'NotaleCJK-Medium.otf', weight: 500 },
  { query: 'Noto Sans CJK SC:style=Bold', file: 'NotaleCJK-Bold.otf', weight: 700 },
  { query: 'WenQuanYi Zen Hei:style=Regular', file: 'NotaleZenHei.ttc', family: 'Notale Zen Hei', format: 'truetype', weight: 400 },
  { query: 'Droid Sans Fallback:style=Regular', file: 'NotaleDroid.ttf', family: 'Notale Droid', format: 'truetype', weight: 400 },
];

const C = {
  green900: '#135535',
  green800: '#1d7f50',
  green700: '#1d7f50',
  green600: '#26aa6b',
  green400: '#6bdea7',
  green100: '#cef4e2',
  gray050: '#f8f8f8',
  gray100: '#f2f2f2',
  gray300: '#c9cecb',
  gray500: '#858b87',
  ink: '#1d2521',
  navy: '#1e4274',
  navyDark: '#1e4274',
  rust: '#9d3729',
  blush: '#f7e9e6',
};

function esc(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function ensureSharedFonts() {
  fs.mkdirSync(sharedFontRoot, { recursive: true });
  for (const font of sharedFonts) {
    const source = execFileSync('fc-match', ['-f', '%{file}', font.query], { encoding: 'utf8' }).trim();
    if (!source || !fs.existsSync(source)) throw new Error(`Required font is unavailable: ${font.query}`);
    fs.copyFileSync(source, path.join(sharedFontRoot, font.file));
  }
}

function fontFaceCss(page) {
  const from = path.posix.dirname(page.relativePath);
  const base = path.posix.relative(from, '_shared/fonts');
  return sharedFonts.map((font) => `@font-face{font-family:"${font.family || 'Notale CJK'}";src:url("${base}/${font.file}") format("${font.format || 'opentype'}");font-style:normal;font-weight:${font.weight};font-display:block}`).join('\n');
}

function attrs(id, text = false) {
  return `data-element-id="${esc(id)}" data-editable="true"${text ? ' data-text="true"' : ''}`;
}

function nativeEdgeStripBackground(relativePath, strips) {
  const source = path.join(organizedRoot, relativePath.replace(/\.html$/i, '.png'));
  return execFileSync('python3', [
    edgeStripTracer,
    '--source', source,
    '--strips', JSON.stringify(strips),
  ], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }).trim();
}

function rotationFromStyle(style) {
  const match = String(style).match(/transform\s*:\s*rotate\(\s*(-?\d+(?:\.\d+)?)deg\s*\)/i);
  return match ? Number(match[1]) : 0;
}

function el(id, x, y, width, height, inner, className = '', style = '') {
  return `<div class="el ${className}" ${attrs(id)} data-rotate="${rotationFromStyle(style)}" style="left:${x}px;top:${y}px;width:${width}px;height:${height}px;${style}">${inner}</div>`;
}

function text(id, x, y, width, height, inner, className = '', style = '') {
  return `<div class="el text ${className}" ${attrs(id, true)} data-rotate="${rotationFromStyle(style)}" style="left:${x}px;top:${y}px;width:${width}px;height:${height}px;${style}">${inner}</div>`;
}

function flowText(id, inner, className = '', style = '') {
  return `<div class="${className}" ${attrs(id, true)} style="${style}">${inner}</div>`;
}

function photo(id, asset, x, y, width, height, className = '', style = '', imageStyle = '') {
  return `<div class="el photo ${className}" ${attrs(id)} data-asset="./${esc(asset)}" data-rotate="${rotationFromStyle(style)}" style="left:${x}px;top:${y}px;width:${width}px;height:${height}px;${style}"><img src="./${esc(asset)}" alt="" draggable="false" style="${imageStyle}"></div>`;
}

function filmPerforationStrip(x1, y1, x2, y2, options = {}) {
  const step = options.step || 20;
  const offset = options.offset || 0;
  const width = options.width || 8;
  const height = options.height || 12;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  const rotation = Math.atan2(dy, dx) * 180 / Math.PI;
  const holes = [];
  for (let distance = offset; distance <= length + .01; distance += step) {
    const ratio = length ? distance / length : 0;
    const x = x1 + dx * ratio;
    const y = y1 + dy * ratio;
    holes.push(`<rect x="${-width / 2}" y="${-height / 2}" width="${width}" height="${height}" rx="3" transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${rotation.toFixed(2)})"/>`);
  }
  return holes.join('');
}

function diagonalRopeSegment(x1, x2, y, options = {}) {
  const step = options.step || 13;
  const rustIndexes = new Set(options.rustIndexes || []);
  const lines = [];
  let index = 0;
  for (let x = x1; x <= x2 + 8; x += step, index += 1) {
    lines.push(`<line x1="${(x + 8).toFixed(2)}" y1="${y - 5}" x2="${x.toFixed(2)}" y2="${y + 6}" stroke="${rustIndexes.has(index) ? '#944944' : '#113452'}" stroke-width="10" stroke-linecap="round"/>`);
  }
  return `<g><line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="#cedbe5" stroke-width="26" stroke-linecap="round" opacity=".82"/><line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="#f8faf9" stroke-width="20" stroke-linecap="round"/>${lines.join('')}</g>`;
}

function header(code, title, width, compact = false) {
  const tiny = compact && width < 500;
  const left = tiny ? 14 : (compact ? 27 : 42);
  const top = tiny ? 8 : (compact ? 18 : 28);
  const h = tiny ? 20 : (compact ? 36 : 56);
  const codeW = tiny ? 27 : (compact ? 52 : 78);
  const accentW = tiny ? 2 : (compact ? 5 : 9);
  const titlePad = tiny ? 5 : (compact ? 9 : 9);
  const titleSize = tiny ? 11 : (compact ? 21 : 37);
  const codeSize = tiny ? 9 : (compact ? 16 : 25);
  return el('header', left, top, width - left * 2, h, `
    <div class="header-code" ${attrs('header-code', true)} style="font-size:${codeSize}px"><span>${esc(code)}</span></div>
    <div class="header-title" ${attrs('header-title', true)} style="font-size:${titleSize}px">${esc(title)}</div>
    <div class="header-rule"></div>
  `, `page-header ${compact ? 'compact-header' : 'regular-header'}`, `--code-width:${codeW}px;--accent-width:${accentW}px;--title-pad:${titlePad}px;`);
}

function toolbarMarkup() {
  return `<aside id="native-toolbar" hidden aria-label="模板编辑工具栏">
    <div class="native-toolbar-row">
      <strong>Native 编辑</strong>
      <button type="button" data-action="preview">预览</button>
      <button type="button" data-action="undo">撤销</button>
      <button type="button" data-action="redo">重做</button>
      <button type="button" data-action="reset">复位</button>
      <button type="button" data-action="replace">换图</button>
      <button type="button" class="native-save" data-action="save">保存到文件</button>
    </div>
    <div class="native-toolbar-row native-properties">
      <label>填充 <input id="native-fill" type="color" value="#ffffff"></label>
      <label>文字 <input id="native-color" type="color" value="#1d2521"></label>
      <label>字号 <input id="native-font-size" type="number" min="6" max="160" value="16"></label>
      <label>旋转 <input id="native-rotate" type="number" min="-180" max="180" value="0"></label>
      <span>双击文字编辑 · 拖动移动 · 右下角缩放 · Ctrl/⌘+S 保存</span>
    </div>
  </aside>
  <input id="native-image-input" type="file" accept="image/*" hidden>
  <div id="native-toast" hidden role="status" aria-live="polite"></div>`;
}

function baseCss(width, height, extraCss = '') {
  return `
    :root{color-scheme:light;--canvas-width:${width}px;--canvas-height:${height}px;--green-900:${C.green900};--green-700:${C.green700};--green-600:${C.green600};--navy:${C.navy};--rust:${C.rust}}
    *{box-sizing:border-box}
    html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#151918}
    body{font-family:"Notale CJK","Noto Sans CJK SC","Microsoft YaHei",sans-serif;color:${C.ink}}
    #viewport{position:fixed;inset:0;overflow:auto}
    #slide-shell{position:absolute;left:0;top:0;width:${width}px;height:${height}px;transform-origin:center center}
    .slide{position:relative;width:${width}px;height:${height}px;overflow:hidden;background:#fff;isolation:isolate;user-select:text}
    .el{position:absolute;transform-origin:center center;min-width:2px;min-height:2px}
    .text{display:flex;align-items:center;line-height:1.35;white-space:pre-line;overflow:hidden}
    .photo{overflow:hidden;background:#dfe6ea}
    .photo>img{display:block;width:100%;height:100%;object-fit:cover;pointer-events:none;user-select:none;-webkit-user-drag:none}
    .fidelity-photo-layer{position:absolute;z-index:60;inset:0;display:none;pointer-events:none}
    .fidelity-photo-layer img{position:absolute;display:block;max-width:none;image-rendering:auto}
    .fidelity-vector-layer{position:absolute;z-index:70;inset:0;display:none;width:100%;height:100%;pointer-events:none;shape-rendering:crispEdges;transform:translate(var(--vector-x,0),var(--vector-y,0))}
    html[data-fidelity="true"][data-edit-mode="false"] .slide .photo{visibility:hidden}
    html[data-fidelity="true"][data-edit-mode="false"] .fidelity-photo-layer,
    html[data-fidelity="true"][data-edit-mode="false"] .fidelity-vector-layer{display:block}
    html[data-fidelity="true"][data-edit-mode="false"] .slide.vector-fidelity{background:#fff!important}
    html[data-fidelity="true"][data-edit-mode="false"] .slide.vector-fidelity:before,
    html[data-fidelity="true"][data-edit-mode="false"] .slide.vector-fidelity:after{display:none!important}
    html[data-fidelity="true"][data-edit-mode="false"] .slide.vector-fidelity>.el{visibility:hidden}
    .page-header{display:flex;align-items:flex-start;color:${C.green900}}
    .page-header:before{content:"";flex:0 0 var(--accent-width);width:var(--accent-width);height:100%;background:${C.green100}}
    .header-code{display:grid;place-items:center;width:var(--code-width);height:100%;border-radius:8px 8px 0 0;background:${C.green900};color:#fff;font-size:26px;font-weight:700;line-height:1}
    .header-title{height:100%;display:flex;align-items:center;padding:0 var(--title-pad);font-weight:800;letter-spacing:-.03em;white-space:nowrap;transform:scaleY(.94)}
    .header-rule{position:absolute;left:0;right:0;bottom:-2px;height:2px;background:${C.green900}}
    .regular-header:before{flex-basis:9px;width:8px;height:53px;margin-left:1px;transform:translateY(2px)}
    .regular-header .header-code{width:77px;height:53px;transform:translateY(2px)}
    .regular-header .header-rule{left:86px;bottom:2px;height:1px;transform:rotate(.11deg);transform-origin:left center}
    .small{font-size:14px}.muted{color:#818784}.bold{font-weight:700}.heavy{font-weight:800}.center{justify-content:center;text-align:center}.right{justify-content:flex-end;text-align:right}
    .pill{display:inline-flex;align-items:center;justify-content:center;border-radius:999px}
    svg{display:block;width:100%;height:100%;overflow:visible}
    svg path.connector,svg line.connector,svg polyline.connector{fill:none}
    #native-toolbar{position:fixed;z-index:10000;left:12px;top:12px;width:min(920px,calc(100vw - 24px));padding:9px 11px;border:1px solid #cad2cf;border-radius:10px;background:rgba(255,255,255,.97);box-shadow:0 12px 36px rgba(0,0,0,.2);font:13px/1.2 system-ui,sans-serif;color:#17201c}
    #native-toolbar[hidden]{display:none}
    .native-toolbar-row{display:flex;align-items:center;gap:7px;min-width:0}
    .native-toolbar-row+ .native-toolbar-row{margin-top:7px;padding-top:7px;border-top:1px solid #e4e9e7}
    #native-toolbar button{height:28px;padding:0 10px;border:1px solid #bec9c4;border-radius:6px;background:#fff;color:#17201c;cursor:pointer}
    #native-toolbar button:hover{border-color:${C.green700};color:${C.green700}}
    #native-toolbar button:disabled{opacity:.42;cursor:default}
    #native-toolbar .native-save{margin-left:auto;border-color:${C.green700};background:${C.green700};color:#fff}
    .native-properties label{display:flex;align-items:center;gap:4px;white-space:nowrap}
    .native-properties input[type="color"]{width:28px;height:24px;padding:1px;border:1px solid #c7cecb;background:#fff}
    .native-properties input[type="number"]{width:56px;height:25px;border:1px solid #c7cecb;border-radius:4px;padding:0 5px}
    .native-properties>span{margin-left:auto;color:#66716c;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    #native-toast{position:fixed;z-index:10001;left:50%;bottom:22px;transform:translateX(-50%);padding:10px 16px;border-radius:8px;background:#17201c;color:#fff;font:14px/1.3 system-ui,sans-serif;box-shadow:0 8px 26px rgba(0,0,0,.24)}
    #native-toast[data-type="success"]{background:#167447}#native-toast[data-type="error"]{background:#a5362b}
    html[data-edit-mode="true"] [data-editable="true"]{cursor:move}
    html[data-edit-mode="true"] [data-editable="true"]:hover{outline:1px dashed rgba(28,139,85,.65);outline-offset:1px}
    html[data-edit-mode="true"] [data-text="true"]{cursor:text}
    .native-selected{outline:2px solid #0d8fda!important;outline-offset:2px;z-index:9000!important}
    .native-handle{position:absolute;z-index:30;right:2px;bottom:2px;width:14px;height:14px;padding:0;border:2px solid #fff;border-radius:50%;background:#0d8fda;box-shadow:0 0 0 1px #0a6da7;cursor:nwse-resize!important}
    [contenteditable="true"]{outline:2px solid #ef9f27!important;cursor:text!important;user-select:text!important}
    ${extraCss}
  `;
}

function renderPage(page) {
  const manifest = {
    id: page.id,
    width: page.width,
    height: page.height,
    relativePath: page.relativePath,
    sourcePrompt: `./${path.basename(page.relativePath, '.html')}.md`,
    renderMode: 'native-html',
  };
  return `<!doctype html>
<html lang="zh-CN" data-render-mode="native-html" data-edit-mode="false" data-fidelity="false">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
<meta name="template-spec" content="${esc(manifest.sourcePrompt)}">
<link rel="icon" href="data:,">
<title>${esc(page.title)}</title>
<script>document.documentElement.dataset.fidelity=new URLSearchParams(location.search).get('fidelity')==='1'?'true':'false';</script>
<style>${fontFaceCss(page)}\n${baseCss(page.width, page.height, page.css || '')}</style>
</head>
<body>
${toolbarMarkup()}
<main id="viewport"><div id="slide-shell"><section class="slide${page.vectorFidelity ? ' vector-fidelity' : ''}" aria-label="${esc(page.title)}" style="--vector-x:${page.width % 2 ? -1 : 0}px;--vector-y:${page.height % 2 ? -1 : 0}px">${page.body}${fidelityPhotoLayer(page)}${fidelityVectorLayer(page)}</section></div></main>
<script id="template-manifest" type="application/json">${JSON.stringify(manifest).replaceAll('<', '\\u003c')}</script>
<script id="template-state" type="application/json">{"version":1,"elements":{}}</script>
<script>
(() => {
  const shell=document.getElementById('slide-shell');
  const viewport=document.getElementById('viewport');
  const W=${page.width},H=${page.height};
  function fit(){
    // Native 1:1 is the default. A CSS transform on the whole slide makes Chrome
    // composite the page as a scaled layer, which softens DOM text and 1px rules.
    // ?fit=1 remains available for a deliberately scaled overview.
    const wantsFit=new URLSearchParams(location.search).get('fit')==='1';
    if(!wantsFit){
      viewport.style.overflow='auto';
      shell.style.left=Math.max(0,Math.floor((innerWidth-W)/2))+'px';
      shell.style.top=Math.max(0,Math.floor((innerHeight-H)/2))+'px';
      shell.style.transform='none';
      return;
    }
    const s=Math.min(innerWidth/W,innerHeight/H,1);
    viewport.style.overflow='hidden';
    if(s===1){
      shell.style.left=Math.max(0,Math.floor((innerWidth-W)/2))+'px';
      shell.style.top=Math.max(0,Math.floor((innerHeight-H)/2))+'px';
      shell.style.transform='none';
    }else{
      shell.style.left='50%';
      shell.style.top='50%';
      shell.style.transform='translate(-50%,-50%) scale('+s+')';
    }
  }
  addEventListener('resize',fit);
  fit();
})();
</script>
<script>${runtime.replaceAll('</script>', '<\\/script>')}</script>
</body>
</html>`;
}

function fidelityPhotoLayer(page) {
  if (!page.crops?.length) return '';
  return `<div class="fidelity-photo-layer" aria-hidden="true">${page.crops.map((crop, index) => `<img data-fidelity-photo="${index + 1}" src="./${esc(crop.asset)}" alt="" draggable="false" width="${crop.w}" height="${crop.h}" style="left:${crop.x}px;top:${crop.y}px;width:${crop.w}px;height:${crop.h}px">`).join('')}</div>`;
}

function fidelityVectorLayer(page) {
  if (!page.vectorFidelity) return '';
  const source = path.join(organizedRoot, page.relativePath.replace(/\.html$/, '.png'));
  const existingPage = path.join(organizedRoot, page.relativePath);
  if (!forceVectorRetrace && fs.existsSync(existingPage)) {
    const existingHtml = fs.readFileSync(existingPage, 'utf8');
    const cachedLayer = existingHtml.match(/<svg class="fidelity-vector-layer"[\s\S]*?<\/svg>/)?.[0];
    if (cachedLayer) return cachedLayer;
  }
  return execFileSync('python3', [
    vectorTracer,
    source,
    '--photos', JSON.stringify(page.crops || []),
    '--masks', JSON.stringify(watermarkMasks(page)),
    '--colors', String(page.vectorColors || 48),
    '--min-area', String(page.vectorMinArea || 0),
  ], { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 }).trim();
}

function cropAssets(page) {
  if (!page.crops?.length) return;
  const pageDir = path.dirname(path.join(organizedRoot, page.relativePath));
  const source = path.join(organizedRoot, page.relativePath.replace(/\.html$/, '.png'));
  for (const crop of page.crops) {
    const target = path.join(pageDir, crop.asset);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const geometry = `${crop.w}x${crop.h}+${crop.x}+${crop.y}`;
    if (crop.mask?.length) {
      const polygon = crop.mask.map(([x, y]) => `${x},${y}`).join(' ');
      execFileSync('convert', [
        source, '-crop', geometry, '+repage',
        '(', '-size', `${crop.w}x${crop.h}`, 'xc:black', '-fill', 'white', '-draw', `polygon ${polygon}`, ')',
        '-alpha', 'off', '-compose', 'CopyOpacity', '-composite', target,
      ]);
    } else {
      execFileSync('convert', [source, '-crop', geometry, '+repage', target]);
    }
  }
}

const pages = [];

function add(page) {
  page.vectorFidelity ??= true;
  if (['mind-overview', 'p004-pyramid', 'e3-02-cards', 'e4-03-work-completion', 'e4-05-film', 'e6-06-strategy'].includes(page.id)) {
    page.vectorColors ??= 96;
    page.vectorMinArea ??= 1;
  }
  pages.push(page);
}

function donutSvg(id, colors, labels, size = 420, innerRatio = 0.43) {
  const cx = size / 2;
  const cy = size / 2;
  const outer = size * 0.454;
  const inner = outer * innerRatio;
  const point = (r, angle) => {
    const a = (angle - 90) * Math.PI / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const segment = (start, end) => {
    const [x1, y1] = point(outer, start);
    const [x2, y2] = point(outer, end);
    const [x3, y3] = point(inner, end);
    const [x4, y4] = point(inner, start);
    return `M${x1.toFixed(2)} ${y1.toFixed(2)}A${outer} ${outer} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}L${x3.toFixed(2)} ${y3.toFixed(2)}A${inner} ${inner} 0 0 0 ${x4.toFixed(2)} ${y4.toFixed(2)}Z`;
  };
  const paths = colors.map((color, index) => `<path d="${segment(index * 60, (index + 1) * 60)}" fill="${color}" stroke="#fff" stroke-width="10" stroke-linejoin="round"/>`).join('');
  const textLabels = labels.map((label, index) => {
    const [x, y] = point((outer + inner) / 2, index * 60 + 30);
    return `<div class="donut-label" ${attrs(`${id}-label-${index + 1}`, true)} style="left:${x - 45}px;top:${y - 20}px">${esc(label)}</div>`;
  }).join('');
  return `<svg viewBox="0 0 ${size} ${size}" aria-hidden="true">${paths}</svg>${textLabels}`;
}

const greenSharedCss = `
  .slide{font-family:"Notale Zen Hei","WenQuanYi Zen Hei","Notale CJK",sans-serif}
  .slide:after{content:"";position:absolute;z-index:99;inset:0;pointer-events:none;border-style:solid;border-width:1px;border-color:#e1e1e1 #e4e4e4 #ebebeb}
  .intro-band{display:grid;grid-template-columns:142px 1fr;background:#fff;font-size:16px;color:#999}
  .intro-band .intro-label{display:grid;place-items:center;background:${C.gray100};color:#303532;font-size:22px;font-weight:800}
  .intro-band .intro-copy{display:flex;align-items:center;padding:0 16px;line-height:1.65;transform:translateY(2px)}
  .matrix-cell{display:flex;align-items:center;justify-content:center;padding:8px;text-align:center;line-height:1.32}
  .green-card{background:${C.gray100}}
  .donut-label{position:absolute;width:90px;height:40px;display:grid;place-items:center;color:#fff;font-size:22px;font-weight:800;text-align:center}
  .arrow-right{background:#d9d9d9;clip-path:polygon(0 23%,66% 23%,66% 0,100% 50%,66% 100%,66% 77%,0 77%)}
  .dash-rule{border-top:1px dashed #c8cdca}
`;

const overviewPath = '思维模型/00-总览/00-总览-经典思维模型目录.html';
const overviewEdgeStrips = (() => {
  const strips = [];
  for (let row = 18; row < 57; row += 1) strips.push({ row, start: 27, end: 525 });
  for (let row = 64; row < 125; row += 1) strips.push({ row, start: 27, end: 786 });
  for (const row of [54, 55]) strips.push({ row, start: 27, end: 790 });
  for (const row of [64, 65, 66, 122, 123, 124]) strips.push({ row, start: 26, end: 786 });
  for (const column of [26, 27, 28, 121, 122, 123, 124, 783, 784, 785]) {
    strips.push({ column, start: 64, end: 125 });
  }
  for (const row of [129, 130, 131, 132, 442, 443, 444, 445]) {
    strips.push({ row, start: 26, end: 786 });
  }
  for (const column of [
    26, 27, 28, 29, 152, 153, 154, 155, 278, 279, 280, 281,
    405, 406, 407, 408, 531, 532, 533, 534, 657, 658, 659, 660,
    784, 785, 786,
  ]) {
    strips.push({ column, start: 129, end: 445 });
  }
  for (const row of [200, 201, 202, 203]) {
    for (const start of [33, 159, 286, 412, 538, 665]) strips.push({ row, start, end: start + 115 });
  }
  return strips;
})();

add({
  id: 'mind-overview',
  title: '经典思维模型和方法论框架',
  width: 818,
  height: 461,
  relativePath: overviewPath,
  css: greenSharedCss + `
    .slide:before{content:"";position:absolute;z-index:20;inset:0;pointer-events:none;background:${nativeEdgeStripBackground(overviewPath, overviewEdgeStrips)}}
    .slide:after{border:0!important;background:${nativeEdgeStripBackground(overviewPath, [
      { row: 0, start: 0, end: 818 }, { row: 460, start: 0, end: 818 },
      { column: 0, start: 0, end: 461 }, { column: 817, start: 0, end: 461 },
    ])}!important}
    html[data-edit-mode="true"] .slide:before{display:none}
    .intro-band{grid-template-columns:95px 1fr;font-size:12px}
    .intro-band{font-family:"Notale CJK",sans-serif}
    .intro-band .intro-label{font-size:14px;transform:translateX(-1px) scaleX(1.07)}
    .intro-band .intro-copy{padding:0 10px;line-height:1.55;transform:translate(1px,1px) scaleX(.985);transform-origin:left center}
    .page-header .header-title{transform:translateY(-1px) scaleY(.97)}
    .overview-column{padding:8px 6px;color:#fff;text-align:center}
    .overview-column{font-family:"Notale CJK",sans-serif}
    .overview-column .num{font-size:31px;font-weight:800;line-height:1.05;transform:translateY(-2px)}
    .overview-column .category{margin:5px 0 9px;padding-bottom:7px;border-bottom:1px dashed rgba(255,255,255,.45);font-size:15px;font-weight:700;color:rgba(255,255,255,.9);transform:translateY(-2px)}
    .overview-column .models{font-size:14px;line-height:1.79;color:rgba(255,255,255,.55);transform:translateY(-1px)}
    [data-element-id="header-code"]{translate:2px 2px!important;font-size:15px!important}
    [data-element-id="header-title"]{translate:2px 1px!important;scale:1 .98!important;font-size:20px!important}
    [data-element-id="overview-intro-label"]{translate:2px -2px!important;scale:1 .98!important;font-weight:500!important}
    [data-element-id="overview-intro-copy"]{translate:1px 1px!important;scale:1 .98!important}
    [data-element-id="overview-num-1"]{translate:3px 0!important;scale:.94 .98!important}
    [data-element-id="overview-num-2"]{translate:1px 0!important}
    [data-element-id="overview-num-3"]{translate:1px -1px!important;scale:1.06 .98!important}
    [data-element-id="overview-num-5"]{scale:1.04 1!important;font-weight:500!important}
    [data-element-id="overview-num-6"]{translate:-1px 0!important;scale:1 .98!important}
    [data-element-id="overview-category-1"]{translate:1px -1px!important;scale:1.015 .98!important;color:rgba(255,255,255,.86)!important}
    [data-element-id="overview-category-2"]{translate:1.75px -1px!important;scale:1.05 1!important;font-size:14.5px!important;color:rgba(255,255,255,.88)!important}
    [data-element-id="overview-category-3"]{translate:.25px -1px!important;scale:1.045 .99!important;font-size:14.5px!important;font-weight:500!important}
    [data-element-id="overview-category-4"]{translate:.25px -.75px!important;scale:1.02 .98!important;color:rgba(255,255,255,.86)!important}
    [data-element-id="overview-category-5"]{translate:0 -.75px!important;scale:1.01 .97!important;color:rgba(255,255,255,.91)!important}
    [data-element-id="overview-category-6"]{translate:-.5px -1px!important;scale:1.02 1.02!important;color:rgba(255,255,255,.84)!important}
    [data-element-id="overview-models-1"]{translate:1.25px -.5px!important;scale:.975 1!important}
    [data-element-id="overview-models-2"]{translate:-.25px -.5px!important;scale:.97 1!important;font-weight:500!important}
    [data-element-id="overview-models-3"]{translate:.25px -.5px!important;font-weight:500!important}
    [data-element-id="overview-models-4"]{translate:-.5px -.5px!important;scale:.96 .99!important;font-weight:600!important;line-height:24.9px!important}
    [data-element-id="overview-models-5"]{scale:.97 1!important;font-weight:500!important}
    [data-element-id="overview-models-6"]{translate:-1.25px -.5px!important;scale:.96 1!important;font-weight:500!important}
    .overview-column .models{color:rgba(255,255,255,.6)!important}
    .overview-column .num{color:#fafafa!important}
    .intro-band .intro-copy{color:#ccc!important}
    .intro-band .intro-label{color:#404542!important}
  `,
  body: `
    ${header('目录', '经典思维模型和方法论框架', 818, true)}
    ${el('overview-intro', 27, 65, 758, 59, `
      <div class="intro-label" ${attrs('overview-intro-label', true)}>系列介绍</div>
      <div class="intro-copy" ${attrs('overview-intro-copy', true)}>本系列为职场常见、常用思维框架模型合集，涵盖通用思维模型、营销与用户、组织与运营、创新与创意、战略与策略以及问题解构方法等六大部分，助力职场人思维进阶和方法提升，也可以作为日常工作汇报蓝本，修改后可用于工作总结汇报等用途。（注：为方便大家使用，每一个模型给出1-3页不同布局排版参考）</div>
    `, 'intro-band')}
    ${[
      ['01','通用思维模型',['5W1H分析法','金字塔结构','黄金圈法则','MECE原则','PREP法','ABC理论','归纳与演绎','第一性原理','二阶思维']],
      ['02','营销与用户',['4C营销理论','AIDMA模型','品牌资产','STP分析','用户画像分析','产品生命周期','消费者旅程','PEST分析','4P理论']],
      ['03','组织与运营',['PDCA循环','卡茨管理模型','PM理论','马斯洛需求理论','KPI树','7S模型','TOPIC模型','SMART目标管理','GROW教练模型']],
      ['04','创新与创意',['SCAMPER法','曼陀罗思考法','头脑风暴','决策矩阵','KJ法','归纳与演绎','利弊均衡表','支付矩阵','戴明循环']],
      ['05','战略与策略',['蓝海战略','VRIO框架','核心竞争力','价值链分析','波特基本战略','最小可行产品','AARRR漏斗模型','POA行动','设计思维']],
      ['06','问题解构方法',['流程图','空雨伞','时间四象限','假设思考','逻辑树','差异分析','SWOT','SCRTV法','矩形图工具']],
    ].map((column, index) => el(`overview-col-${index + 1}`, 27 + index * 126.33, 130, 126.5, 314, `
      ${flowText(`overview-num-${index + 1}`, column[0], 'num')}
      ${flowText(`overview-category-${index + 1}`, column[1], 'category')}
      ${flowText(`overview-models-${index + 1}`, column[2].join('<br>'), 'models')}
    `, 'overview-column', `background:${[C.green800,C.green900,C.green800,C.green900,C.green800,C.green900][index]};`)).join('')}
  `,
});

add({
  id: 'p002-5w1h-matrix',
  title: '6个维度分析问题-5W1H分析法',
  width: 1222,
  height: 688,
  relativePath: '思维模型/01-5W1H/P002-5W1H-六维度分析.html',
  css: greenSharedCss + `
    .p002-intro{font-size:18px;color:#999}
    .p002-intro .intro-copy{line-height:1.475;letter-spacing:-.2px;transform:translate(-.5px,1.5px)}
    .p002-intro .intro-label{font-size:22px}
    .p002-en{color:#fff;font-family:Arial,sans-serif;font-size:24px;font-weight:800;letter-spacing:.5px;background:${C.green600}}
    .p002-zh{border:1.5px solid ${C.green700};border-radius:50%;color:${C.green700};font-size:23px;font-weight:800}
    .p002-question{justify-content:flex-start;padding-left:3px;color:#242424;font-size:17px;letter-spacing:.8px}
    .p002-question:after{content:"";position:absolute;left:0;right:0;bottom:0;height:2px;background:repeating-linear-gradient(90deg,#e8e8e8 0 5.4px,transparent 5.4px 8.9px);background-position:-1.75px 0}
    .p002-question>span{display:inline-block}
    [data-element-id="p002-question-0"]{height:77px!important;letter-spacing:.6px}[data-element-id="p002-question-0"]>span{transform:translate(0,-.5px)}
    [data-element-id="p002-question-1"]{height:77px!important}[data-element-id="p002-question-1"]>span{transform:translate(-1px,-1.5px)}
    [data-element-id="p002-question-2"]{height:77px!important}[data-element-id="p002-question-2"]>span{transform:translate(-1px,-1px)}
    [data-element-id="p002-question-3"]{height:76px!important}[data-element-id="p002-question-3"]>span{transform:translate(0,-.5px)}
    [data-element-id="p002-question-4"]{height:77px!important}[data-element-id="p002-question-4"]>span{transform:translate(0,.5px)}
    [data-element-id="p002-question-5"]{height:77px!important}[data-element-id="p002-question-5"]>span{transform:translate(-1px,-1px)}
    .p002-goal{color:#fff;font-size:22px;font-weight:800;letter-spacing:.8px;background:${C.green600}}
    .p002-goal>span{display:inline-block}
    [data-element-id="p002-goal-0"]>span,[data-element-id="p002-goal-5"]>span{transform:translateY(1px)}[data-element-id="p002-goal-2"]>span{transform:translateY(-1px)}[data-element-id="p002-goal-3"]{letter-spacing:.6px}[data-element-id="p002-goal-3"]>span,[data-element-id="p002-goal-4"]>span{transform:translateY(-2px)}
    .p002-example{justify-content:flex-start;padding-left:27px;background:${C.gray100};color:#6a6a6a;font-size:18px;letter-spacing:.2px;text-align:left}
    .p002-example:before{content:"";position:absolute;left:10px;width:9px;height:9px;border:1.5px solid #6c716e;border-radius:50%}
    .p002-example>span{display:inline-block;transform:translate(4px,0)}
    [data-element-id="p002-example-0"]>span{transform:translate(5px,2px)}[data-element-id="p002-example-2"]>span{transform:translate(5px,1px)}
    .p002-arrow{height:44px!important;transform:translateY(-1px);clip-path:polygon(0 17%,66% 17%,66% 0,100% 50%,66% 100%,66% 83%,0 83%)}
    .p002-rail-text{display:inline-block;transform:translateX(-3px) scaleY(1.08)}
    .p002-one-h .p002-rail-text{transform:translateX(-4px) scale(.8,1.08)}
  `,
  body: `
    ${header('P002', '6个维度分析问题-5W1H分析法', 1222)}
    ${el('p002-intro', 42, 97, 1131, 66, `<div class="intro-label" ${attrs('p002-intro-label', true)}>模型介绍</div><div class="intro-copy" ${attrs('p002-intro-copy', true)}>5W1H分析法，又称“六何分析法”，是一种通过连续提问六个核心维度来拆解问题、构建逻辑框架的经典思维工具。<br>它由六个英文疑问词的首字母组合而成，旨在确保思考过程全面、缜密，不遗漏关键信息。</div>`, 'intro-band p002-intro')}
    ${el('p002-five-w', 45, 177, 83, 393, '<span class="p002-rail-text">5<small>w</small></span>', 'matrix-cell p002-five-w', `background:${C.green700};color:#fff;font-size:49px;font-weight:800;`)}
    ${el('p002-one-h', 45, 576, 83, 74, '<span class="p002-rail-text">1<small>H</small></span>', 'matrix-cell p002-one-h', `background:${C.green900};color:#fff;font-size:49px;font-weight:800;`)}
    ${[
      ['What','何事','对象是什么？本质是什么？','定义核心','DAU连续3天下降5%'],
      ['Why','何因','为什么要做？根本目的是什么？','寻求动机','推测是新版首页改版<br>导致核心入口隐藏'],
      ['Who','何人','谁来做？为谁做？利益相关者是谁？','明确主体与受众','受影响的主要是30岁<br>以上非活跃老用户'],
      ['When','何时','什么时候开始？截止时间？频率如何？','界定时间线','发生在本周二系统更<br>新后'],
      ['Where','何地','在哪里发生？在什么范围或场景下？','划定空间场景','集中在新版未覆盖的<br>华东区域'],
      ['How','何法','用什么方法？具体步骤和路径是什么？','制定行动路径','先灰度回滚，再通过<br>A/B测试验证新方案'],
    ].map((row, index) => {
      const y = [177,257,337,417,496,576][index];
      const h = [74,74,73,73,74,73][index];
      const tone = [C.green600,C.green600,C.green700,C.green700,C.green700,C.green900][index];
      return `
        ${el(`p002-en-${index}`, 134, y, 90, h, `<span>${row[0]}</span>`, 'matrix-cell p002-en', `background:${tone};`)}
        ${el(`p002-arrow-${index}`, 242, y + 16, 61, 43, '', 'arrow-right p002-arrow')}
        ${el(`p002-zh-${index}`, 316, y + 2, 72, 72, `<span>${row[1]}</span>`, 'matrix-cell p002-zh')}
        ${text(`p002-question-${index}`, 407, y, 320, h, `<span>${row[2]}</span>`, 'p002-question')}
        ${el(`p002-goal-${index}`, 742, y, 201, h, `<span>${row[3]}</span>`, 'matrix-cell p002-goal', `background:${tone};`)}
        ${el(`p002-example-${index}`, 950, [177,257,336,417,497,575][index], 223, [74,74,75,74,73,75][index], `<span>${row[4]}</span>`, 'matrix-cell p002-example')}
      `;
    }).join('')}
  `,
});

add({
  id: 'p003-5w1h-ring',
  title: '6个维度分析问题-5W1H分析法',
  width: 1222,
  height: 688,
  relativePath: '思维模型/01-5W1H/P003-5W1H-环形分析.html',
  css: greenSharedCss + `
    .p003-card{padding:14px 18px;background:#f2f2f2;line-height:1.45}
    .p003-card.right-card{padding-right:31px;text-align:right}
    .p003-card .card-title{font-size:21px;color:${C.green800};font-weight:800}
    .p003-card .question{color:#242424;font-size:18px;font-weight:600;margin:10px 0 8px}
    .p003-card .example{position:relative;border-top:0;padding-top:13px;color:#666;font-size:17px}
    .p003-card .example:before{content:"";position:absolute;left:-12px;top:-5px;width:8px;height:8px;border-radius:50%;background:#c9cecb}
    .p003-card .example:after{content:"";position:absolute;left:0;right:0;top:0;height:1px;background:repeating-linear-gradient(90deg,#c5c5c5 0 5.4px,transparent 5.4px 8.9px);background-position:4px 0}
    .p003-card .card-title>span,.p003-card .question>span,.p003-card .example>span,.p003-center>span{display:inline-block}
    .p003-card:not(.right-card) .card-title>span{transform-origin:left center;transform:translate(1px,-2px) scale(1.04,.9)}
    .p003-card.right-card .card-title>span{transform-origin:right center;transform:translate(-2px,-2px) scale(1.04,.9)}
    .p003-card:not(.right-card) .question>span{transform-origin:left center;transform:translate(1px,-3px) scale(.95,.94)}
    .p003-card.right-card .question>span{transform-origin:right center;transform:translate(4px,-2px) scale(.975,.94)}
    .p003-card:not(.right-card) .example>span{transform-origin:left center;transform:scaleX(1.075)}
    .p003-card.right-card .example>span{transform-origin:right center;transform:translateX(-2px) scaleX(1.04)}
    [data-element-id="p003-left-q-0"]>span{transform:translate(1px,-3px) scale(.965,.94)!important}[data-element-id="p003-left-q-1"]>span{transform:translate(2px,-1px) scale(.974,.94)!important}[data-element-id="p003-left-q-2"]>span{transform:translate(1px,-4px) scale(.968,.94)!important}
    [data-element-id="p003-right-q-0"]>span{transform:translate(5px,-3px) scale(.975,.94)!important}[data-element-id="p003-right-q-1"]>span{transform:translate(9px,-2px) scale(.965,.94)!important}[data-element-id="p003-right-q-2"]>span{transform:translate(9px,-4px) scale(.975,.94)!important}
    [data-element-id="p003-left-e-0"]>span{transform:translate(1px,0) scaleX(1.061)!important}[data-element-id="p003-left-e-1"]>span{transform:translate(2px,1px) scaleX(1.046)!important}[data-element-id="p003-left-e-2"]>span{transform:translate(0,1px) scale(1.034,1.05)!important}
    [data-element-id="p003-right-e-0"]>span{transform:translate(1px,0) scaleX(1.046)!important}[data-element-id="p003-right-e-1"]>span{transform:translate(1px,0) scaleX(1.049)!important}[data-element-id="p003-right-e-2"]>span{transform:translate(-3px,1px) scale(1.045,1.05)!important}
    [data-element-id="p003-left-title-0"]>span{transform:translate(1px,-2px) scale(1.03,.86)!important}[data-element-id="p003-left-title-1"]>span{transform:translate(1px,-1px) scale(1.03,.945)!important}[data-element-id="p003-left-title-2"]>span{transform:translate(1px,-2px) scale(1.015,.855)!important}
    [data-element-id="p003-right-title-0"]>span{transform:translate(-2px,-3px) scale(1.02,.855)!important}[data-element-id="p003-right-title-1"]>span{transform:translate(3px,-2px) scale(1.03,.945)!important}[data-element-id="p003-right-title-2"]>span{transform:translate(4px,-3px) scale(1.03,.945)!important}
    .p003-card .example-pill{position:absolute;bottom:12px;display:grid;width:111px;height:31px;place-items:center;padding:0;border-radius:16px;background:var(--pill-tone,${C.green600});color:#fff;font-size:17px;letter-spacing:.5px}
    .p003-card:not(.right-card) .example-pill{left:15px}
    .p003-card.right-card .example-pill{right:22px}
    [data-element-id="p003-left-1"] .example-pill,[data-element-id="p003-right-1"] .example-pill{bottom:10px}
    [data-element-id="p003-right-0"] .example-pill{transform:translateX(1px)}[data-element-id="p003-right-2"] .example-pill{transform:translate(1px,-1px)}
    .p003-ring{border:1.5px dashed #999;border-radius:50%;padding:0;background:rgba(255,255,255,.18)}
    .p003-ring .donut-label{font-family:Arial,sans-serif;font-size:24px}
    .p003-center{border-radius:50%;display:grid;place-items:center;background:#fff;color:${C.green900};font-family:Arial,sans-serif;font-size:46px;font-weight:800;letter-spacing:-1px}
    .p003-center>span{transform:translate(1px,-2px)}
    .p003-node-text{font-size:22px;font-weight:800;color:${C.green700}}
    .p003-dot{border:2px solid #fff;border-radius:50%;background:${C.green600};box-shadow:0 0 0 1px #e5e8e6}
  `,
  body: `
    ${header('P003', '6个维度分析问题-5W1H分析法', 1222)}
    ${[
      ['01 定义问题','对象是什么？本质是什么？','DAU连续3天下降5%'],
      ['02 寻找原因','为什么要做？根本目的是什么？','推测首页改版导致核心入口隐藏'],
      ['03 定位人员','谁来做？为谁做？利益相关者是谁？','受影响的主要是30岁以上非活跃老用户'],
    ].map((card, i) => el(`p003-left-${i}`, 42, [102,291,481][i], [564,564,563][i], [179,179,178][i], `<div class="card-title" ${attrs(`p003-left-title-${i}`, true)}><span>${card[0]}</span></div><div class="question" ${attrs(`p003-left-q-${i}`, true)}><span>${card[1]}</span></div><div class="example" ${attrs(`p003-left-e-${i}`, true)}><span>${card[2]}</span></div><span class="example-pill" style="--pill-tone:${[C.green600,C.green800,C.green900][i]}">举例说明</span>`, 'p003-card')).join('')}
    ${[
      ['06 采取措施','用什么方法？具体步骤和路径是什么？','先灰度回滚，再通过A/B测试验证新方案'],
      ['05 弄清地点','哪里发生？在什么范围或场景下？','集中在新版未覆盖的华东区域'],
      ['04 确定时间','什么时候开始？截止时间？频率如何？','发生在本周二系统更新后'],
    ].map((card, i) => el(`p003-right-${i}`, [617,617,616][i], [102,292,481][i], [563,564,564][i], [179,178,179][i], `<div class="card-title" ${attrs(`p003-right-title-${i}`, true)}><span>${card[0]}</span></div><div class="question" ${attrs(`p003-right-q-${i}`, true)}><span>${card[1]}</span></div><div class="example" ${attrs(`p003-right-e-${i}`, true)}><span>${card[2]}</span></div><span class="example-pill" style="--pill-tone:${[C.green900,C.green800,C.green600][i]}">举例说明</span>`, 'p003-card right-card')).join('')}
    ${el('p003-ring', 396, 166, 428, 428, `${donutSvg('p003', [C.green900,C.green800,C.green600,C.green900,C.green800,C.green600], ['How','Where','When','Who','Why','What'], 428, .45)}`, 'p003-ring')}
    ${el('p003-center', 524, 292, 177, 177, '<span>5W1H</span>', 'p003-center')}
    ${text('p003-node-what', 416, 176, 52, 32, '何事', 'p003-node-text')}
    ${el('p003-dot-what', 479, 195, 24, 24, '', 'p003-dot')}
    ${el('p003-dot-how', 720, 195, 24, 24, '', 'p003-dot', `background:${C.green900};`)}
    ${text('p003-node-how', 763, 176, 52, 32, '何法', 'p003-node-text')}
    ${el('p003-dot-where', 812, 369, 24, 24, '', 'p003-dot')}
    ${text('p003-node-where', 844, 365, 52, 32, '何地', 'p003-node-text')}
    ${el('p003-dot-when', 720, 545, 24, 24, '', 'p003-dot', `background:${C.green900};`)}
    ${text('p003-node-when', 760, 554, 52, 32, '何时', 'p003-node-text')}
    ${text('p003-node-who', 433, 554, 52, 32, '何人', 'p003-node-text')}
    ${el('p003-dot-who', 479, 545, 24, 24, '', 'p003-dot')}
    ${text('p003-node-why', 333, 365, 52, 32, '何因', 'p003-node-text')}
    ${el('p003-dot-why', 386, 369, 24, 24, '', 'p003-dot', `background:${C.green900};`)}
  `,
});

add({
  id: 'p007-golden-circle',
  vectorFidelity: true,
  title: '黄金圈法则-由内而外思考',
  width: 1222,
  height: 688,
  relativePath: '思维模型/02-黄金圈/P007-黄金圈-由内而外.html',
  css: greenSharedCss + `
    .slide{letter-spacing:.3px}
    .golden-circle{border-radius:50%;display:grid;place-items:center;color:#fff;text-align:center}
    .golden-circle .middle{width:67.4%;height:67.4%;border-radius:50%;display:grid;place-items:center;background:${C.green600}}
    .golden-circle .inner{width:52.5%;height:52.5%;border-radius:50%;display:grid;place-items:center;background:#f2f2f2;color:#111}
    .golden-circle strong{font-size:25px}.golden-circle span{font-size:19px}
    .p007-explain{display:flex;align-items:center;font-size:16px;line-height:1.6;border-bottom:1px dashed #c3c7c5;padding:0}
    .p007-explain b{align-self:stretch;flex:0 0 var(--label);width:var(--label);display:flex;align-items:center;justify-content:center;background:#f2f2f2;font-size:22px;color:#111}
    .p007-explain span{padding-left:14px;color:#666;letter-spacing:.6px;transform:translateY(-2px)}
    .p007-case{display:grid;grid-template-columns:repeat(3,1fr);background:#f2f2f2;padding:28px 0 14px 94px;clip-path:path('M95 0 H714 V210 H0 C56 158 98 80 95 0 Z')}
    .p007-case>div{padding:0 22px;border-left:1px dashed #b9bfbc;font-size:15px;line-height:1.55}
    .p007-case>div:first-child{border-left:0}.p007-case strong{display:block;margin-bottom:12px;color:${C.green900};font-family:Arial,sans-serif;font-size:25px;text-align:center}
    [data-element-id="p007-explain-copy-0"]{padding-left:10px}
    [data-element-id="p007-explain-copy-1"]{padding-left:10px}
    [data-element-id="p007-explain-copy-2"]{padding-left:30px}
    [data-element-id="p007-case-why"]{color:#666;line-height:1.65}
    [data-element-id="p007-case-how"]{color:#666;line-height:1.65;transform:translateX(14px)}
    [data-element-id="p007-case-what"]{color:#666;line-height:1.65;transform:translateX(18px)}
    .p007-case-label{background:transparent!important;clip-path:none!important}
    .p007-case-label:before{content:"";position:absolute;left:0;top:34px;width:94px;height:36px;background:#d7d9d8;clip-path:polygon(0 23%,66% 23%,66% 0,100% 50%,66% 100%,66% 77%,0 77%)}
  `,
  body: `
    ${header('P007', '黄金圈法则-由内而外思考', 1222)}
    ${el('p007-intro', 42, 97, 1131, 66, `<div class="intro-label" ${attrs('p007-intro-label', true)}>模型介绍</div><div class="intro-copy" ${attrs('p007-intro-copy', true)}>黄金圈法则（The Golden Circle）由美国营销专家西蒙·斯涅克（Simon Sinek）在其著作《从“为什么”开始》中提出。<br>它是一种由内而外的思维与沟通模型，揭示了为何某些领导者、组织或个人能拥有超乎寻常的影响力。</div>`, 'intro-band', 'background:#fff;')}
    ${el('p007-circle', 44, 209, 419, 419, `<div class="middle"><div class="inner"><div><strong>Why</strong><br><span>为什么</span></div></div></div><div style="position:absolute;top:-1px"><strong>What</strong><br><span>做什么</span></div><div style="position:absolute;top:69px"><strong>How</strong><br><span>怎么做</span></div>`, 'golden-circle', `background:${C.green700};z-index:2;`)}
    ${[
      ['外在结果','你每天在做什么？你向市场交付什么？<br>指你的具体产品、服务或业务',293,671,291],
      ['实现路径','你通过什么方式来实现你的信念？你为何与众不同？ 指你的独特方法或价值主张',412,552,193],
      ['核心信念','你为什么要做这件事？你存在的理由是什么？<br>它回答的是超越利益驱动的最深层动机',452,512,161],
    ].map((item,i)=>el(`p007-explain-${i}`, item[2], [210,279,347][i], item[3], [66,66,65][i], `<b ${attrs(`p007-explain-title-${i}`, true)}>${item[0]}</b><span ${attrs(`p007-explain-copy-${i}`, true)}>${item[1]}</span>`, 'p007-explain', `--label:${item[4]}px;background:#fff;z-index:1;`)).join('')}
    ${el('p007-overview-arrow', 1012, 289, 58, 35, '', 'arrow-right', 'transform:rotate(180deg);')}
    ${text('p007-overview', 1078, 272, 90, 80, '模型\n概述', 'center heavy', 'font-size:22px;color:#111;')}
    ${el('p007-case', 459, 419, 714, 209, `<div><strong>Why</strong>${flowText('p007-case-why','我们坚信，改变世界<br>的想法可以来自创新<br>的思考方式')}</div><div><strong>How</strong>${flowText('p007-case-how','我们创造的产品，拥<br>有精美的设计和极简的<br>用户体验')}</div><div><strong>What</strong>${flowText('p007-case-what','恰好，我们制造了<br>Mac电脑。你想买一<br>台吗？')}</div>`, 'p007-case')}
    ${el('p007-case-label', 458, 419, 95, 209, '案例<br>说明', 'matrix-cell heavy p007-case-label', 'font-size:23px;z-index:3;')}
  `,
});

add({
  id: 'p008-golden-directions',
  title: '黄金圈法则-由内而外思考',
  width: 1222,
  height: 688,
  relativePath: '思维模型/02-黄金圈/P008-黄金圈-内外思考.html',
  css: greenSharedCss + `
    .slide:after{border-color:#e8e8e8 #e4e4e4 #d9d9d9 #d9d9d9}
    .regular-header:before{flex-basis:9px;width:9px;height:56px;margin-left:0;transform:none}
    .regular-header .header-code{width:77px;height:56px;transform:none}
    .regular-header .header-code span{display:inline-block;font-family:"Notale CJK",sans-serif;font-size:25px;font-weight:400;transform:none}
    .regular-header .header-rule{right:6px;bottom:1px;height:1px;transform:rotate(.09deg)}
    .p008-ellipse{border-radius:50%;display:grid;place-items:center;text-align:center;color:#fff;font-size:23px;font-weight:500;line-height:1.42}
    .p008-ellipse strong{font-family:Arial,sans-serif;font-size:32px;font-weight:700}
    [data-element-id="p008-what"]>div{transform:translateX(-26px)}
    [data-element-id="p008-how"]>div{transform:translateX(-15px)}
    .p008-arrow{height:36px;clip-path:polygon(0 28%,95.5% 28%,95.5% 0,100% 50%,95.5% 100%,95.5% 72%,0 72%)}
    .p008-arrow.reverse{clip-path:polygon(4.5% 0,4.5% 28%,100% 28%,100% 72%,4.5% 72%,4.5% 100%,0 50%)}
    .p008-major-arrow{background:linear-gradient(90deg,#fff 0%,#f9faf9 13%,#eff2f0 24%,#dee5e0 34%,#c7d4cc 45%,#a9bfb1 55%,#87a993 66%,#649677 76%,#438861 87%,#1d7f50 100%);clip-path:polygon(0 17%,79% 17%,79% 0,100% 50%,79% 100%,79% 83%,0 83%)}
    .p008-major-arrow.reverse{background:linear-gradient(90deg,#1d7f50 0%,#438861 13%,#649677 24%,#87a993 34%,#a9bfb1 45%,#c7d4cc 55%,#dee5e0 66%,#eff2f0 76%,#f9faf9 87%,#fff 100%);clip-path:polygon(21% 0,21% 17%,100% 17%,100% 83%,21% 83%,21% 100%,0 50%)}
    .p008-copy{font-size:18px;line-height:1.55;transform-origin:left top}.p008-copy b{font-size:18px}
    [data-element-id="p008-inward-arrow"]{background:linear-gradient(90deg,#fff 0%,#fff 19%,transparent 19%,transparent 32.5%,#fff 32.5%,#a9d3bb 56%,transparent 56%,transparent 63.75%,#8bcba8 63.75%,#26aa6b 100%)}
    [data-element-id="p008-outward-arrow"]{background:linear-gradient(90deg,#fff 0%,#fff 19%,transparent 19%,transparent 32.5%,#fff 32.5%,#a7bcaf 56%,transparent 56%,transparent 63.75%,#79a98d 63.75%,#1d7f50 100%)}
    [data-element-id="p008-top-copy"]{transform:scaleX(1.03)}
    [data-element-id="p008-bottom-copy"]{transform:translate(1px,1px) scaleX(1.02)}
    [data-element-id="p008-top-sub"],[data-element-id="p008-bottom-sub"]{font-size:22px!important;transform-origin:left center;transform:translate(1px,1px) scale(1.035,1.18)}
    [data-element-id="p008-bottom-sub"]{transform:translate(1px,5px) scale(1.035,1.18)}
    [data-element-id="p008-top-title"]{font-size:25px!important;transform-origin:left center;transform:translate(1px,0) scale(1.006,1.04)}
    [data-element-id="p008-bottom-title"]{font-size:26px!important;transform-origin:left center;transform:translate(1px,1px) scaleX(.974)}
    [data-element-id="p008-outside-in"],[data-element-id="p008-inside-out"]{padding:0!important;position:absolute}
    [data-element-id="p008-outside-in"] b,[data-element-id="p008-inside-out"] b{position:absolute;left:15px;top:8px;display:inline-flex;align-items:center;font-size:22px;line-height:1.2}
    [data-element-id="p008-outside-in"] .p008-bullet,[data-element-id="p008-inside-out"] .p008-bullet{margin-right:12px}
    [data-element-id="p008-outside-in"]>span,[data-element-id="p008-inside-out"]>span{position:absolute;left:40px;top:44px;display:block;font-size:21px;line-height:1.2;white-space:nowrap;transform-origin:left top;transform:scaleX(1.08)}
    .p008-bullet{display:inline-block;width:12px;height:12px;margin-right:8px;border-radius:50%;background:${C.green700}}
  `,
  body: `
    ${header('P008', '黄金圈法则-由内而外思考', 1222)}
    ${text('p008-outer-label', 100, 105, 90, 48, '外', 'center heavy', 'font-size:30px;')}
    ${text('p008-mid-label', 235, 105, 90, 48, '中', 'center heavy', 'font-size:30px;')}
    ${text('p008-inner-label', 346, 105, 90, 48, '内', 'center heavy', 'font-size:30px;')}
    ${el('p008-what', 42, 158, 211, 422, '<div><strong>What</strong><br>做什么</div>', 'p008-ellipse', `background:${C.green900};`)}
    ${el('p008-how', 188, 192, 182, 354, '<div><strong>How</strong><br>怎么做</div>', 'p008-ellipse', `background:${C.green700};`)}
    ${el('p008-why', 322, 240, 132, 258, '<div><strong>Why</strong><br>为什么</div>', 'p008-ellipse', `background:${C.green600};`)}
    ${el('p008-inward-arrow', 126, 258, 400, 36, '', 'p008-arrow')}
    ${el('p008-outward-arrow', 126, 438, 400, 36, '', 'p008-arrow reverse')}
    ${text('p008-results', 96, 594, 105, 62, '现象\n成果', 'center heavy', 'font-size:22px;')}
    ${text('p008-methods', 225, 594, 105, 62, '方法\n措施', 'center heavy', 'font-size:22px;')}
    ${text('p008-purpose', 335, 594, 105, 62, '目的\n理念', 'center heavy', 'font-size:22px;')}
    ${el('p008-top-arrow', 535, 112, 190, 81, '', 'p008-arrow p008-major-arrow')}
    ${text('p008-top-title', 742, 111, 430, 42, '普通人、大众思路和模式', 'heavy', 'font-size:25px;')}
    ${text('p008-top-sub', 742, 155, 430, 40, '理性说服，容易陷入价格战', '', 'font-size:20px;')}
    ${el('p008-outside-in', 535, 237, 190, 80, `<b ${attrs('p008-outside-in-title', true)}><i class="p008-bullet"></i>由外向内</b><br><span ${attrs('p008-outside-in-sub', true)}>从清晰到模糊</span>`, 'matrix-cell', 'display:block;text-align:left;padding:11px 16px;background:#f2f2f2;font-size:19px;line-height:1.45;')}
    ${el('p008-top-copy', 742, 236, 430, 114, `<b>What：</b>我们制造一流的个人电脑<br><b>How：</b>它们设计精美、操作简单、用户友好<br><b>Why：</b>你想买一台吗？`, 'p008-copy')}
    ${el('p008-divider', 535, 368, 637, 1, '', '', 'border-top:1px dashed #bbb;')}
    ${el('p008-inside-out', 535, 418, 190, 80, `<b ${attrs('p008-inside-out-title', true)}><i class="p008-bullet"></i>由内向外</b><br><span ${attrs('p008-inside-out-sub', true)}>从模糊到清晰</span>`, 'matrix-cell', 'display:block;text-align:left;padding:11px 16px;background:#f2f2f2;font-size:19px;line-height:1.45;')}
    ${el('p008-bottom-copy', 742, 418, 430, 114, `<b>What：</b>我们做的每一件事，都是为了挑战现状<br><b>How：</b>我们创造的产品，有精美的设计和极简用户体验<br><b>Why：</b>恰好，我们制造了Mac电脑。你想买一台吗？`, 'p008-copy')}
    ${el('p008-bottom-arrow', 535, 557, 190, 81, '', 'p008-arrow reverse p008-major-arrow')}
    ${text('p008-bottom-sub', 742, 554, 430, 36, '情感共鸣，建立信任与忠诚', '', 'font-size:20px;')}
    ${text('p008-bottom-title', 742, 602, 430, 42, '非凡、精益团队思路和模式', 'heavy', 'font-size:25px;')}
  `,
});

add({
  id: 'p014-prep-cycle',
  title: 'PREP法-使用步骤与操作要点',
  width: 1222,
  height: 688,
  relativePath: '思维模型/03-PREP/P014-PREP-循环步骤.html',
  css: greenSharedCss + `
    .p014-quadrant{padding:25px 32px;background:linear-gradient(90deg,#f2f2f2 0%,#f3f3f3 14%,#f4f4f4 28%,#f7f7f7 42%,#fafafa 56%,#fdfdfd 70%,#fefefe 84%,#fff 100%);font-size:16px;line-height:1.45}
    .p014-quadrant.right{text-align:right;background:linear-gradient(270deg,#f2f2f2 0%,#f3f3f3 14%,#f4f4f4 28%,#f7f7f7 42%,#fafafa 56%,#fdfdfd 70%,#fefefe 84%,#fff 100%)}
    .p014-quadrant[data-element-id*="p014-top"]{border-top:2px dashed rgba(38,170,107,.58)}
    .p014-quadrant[data-element-id*="p014-bottom"]{border-bottom:2px dashed rgba(38,170,107,.58)}
    .p014-quadrant h3{margin:0 0 12px;color:${C.green700};font-family:"Notale CJK",sans-serif;font-size:24px;font-weight:700}
    [data-element-id="header-title"]{font-family:"Notale Zen Hei",sans-serif!important;font-size:36px!important;transform:translate(0,-1px) scaleX(1.02)!important;transform-origin:left center!important}
    [data-element-id="p014-subtitle"]{font-family:"Notale CJK",sans-serif;font-size:23px!important;transform:translate(-9px,-4px) scale(.995,1.05)}
    [data-element-id="p014-top-left"] h3{transform:translate(1px,-4px) scale(1.02,.913);transform-origin:left center}
    [data-element-id="p014-top-right"] h3{transform:translate(-12px,-3px) scale(1.123,.942);transform-origin:right center}
    [data-element-id="p014-bottom-left"] h3{transform:translate(2px,-7px) scale(1.005,.932);transform-origin:left center}
    [data-element-id="p014-bottom-right"] h3{transform:translate(-13px,-7px) scale(1.091,.924);transform-origin:right center}
    .p014-quadrant>div[data-element-id$="-copy"]{font-family:"Notale Zen Hei",sans-serif;font-size:18px;line-height:1.4;transform-origin:left top}
    [data-element-id="p014-tl-copy"]{transform:translate(1px,-3px) scale(.985,.97)}
    [data-element-id="p014-tr-copy"]{transform:translate(-16px,-4px) scale(1,1.02);transform-origin:right top!important}
    [data-element-id="p014-bl-copy"]{transform:translate(1px,-6px) scale(.985,.97)}
    [data-element-id="p014-br-copy"]{transform:translate(-22px,-7px) scale(.92);transform-origin:right top!important}
    .p014-quadrant .rule{margin:12px 0;border-top:1px dashed #999}
    .p014-example{display:flex;align-items:flex-start;gap:9px;margin:10px 0;color:#434844;font-family:"Notale Zen Hei",sans-serif;font-size:16px}
    .right .p014-example{justify-content:flex-end}
    .p014-quadrant.right .p014-example span[data-element-id]{text-align:left;transform-origin:left top}
    .p014-quadrant:not(.right) .p014-example span[data-element-id]{transform-origin:left top}
    [data-element-id="p014-top-left"] .p014-example:nth-of-type(3){transform:translate(-3px,1px)}
    [data-element-id="p014-tl-yes"]{transform:scale(.95,.92)}
    [data-element-id="p014-top-left"] .p014-example+.p014-example{transform:translate(-3px,13px)}
    [data-element-id="p014-tl-no"]{transform:translateX(1px) scale(.95,.92)}
    [data-element-id="p014-top-right"] .p014-example:nth-of-type(3){transform:translateY(1px)}
    [data-element-id="p014-tr-yes"]{transform:translateX(16px) scale(.92,.95)}
    [data-element-id="p014-top-right"] .p014-example+.p014-example{transform:translate(1px,-12px)}
    [data-element-id="p014-tr-no"]{transform:translateX(-2px) scale(.94,.98)}
    [data-element-id="p014-bottom-left"] .p014-example:nth-of-type(3){transform:translate(-5px,-3px)}
    [data-element-id="p014-bl-yes"]{transform:translateX(2px) scale(.95,.98)}
    [data-element-id="p014-bottom-left"] .p014-example+.p014-example{transform:translate(-5px,9px)}
    [data-element-id="p014-bl-no"]{transform:scale(.95,1.07)}
    [data-element-id="p014-bottom-right"] .p014-example:nth-of-type(3){transform:translate(-1px,-3px)}
    [data-element-id="p014-br-yes"]{transform:scale(.97,.98)}
    [data-element-id="p014-bottom-right"] .p014-example+.p014-example{transform:translateY(9px)}
    [data-element-id="p014-br-no"]{transform:translateX(-4px) scale(.96,.98)}
    .p014-quadrant.right .p014-mark{transform:translateX(-9px)}
    [data-element-id="p014-top-left"] .p014-example:nth-of-type(3) .p014-mark{transform:translate(-1px,1px)}
    [data-element-id="p014-top-right"] .p014-example:nth-of-type(3) .p014-mark{transform:translate(-9px,1px)}
    [data-element-id="p014-bottom-left"] .p014-example:nth-of-type(3) .p014-mark{transform:translate(1px,1px)}
    [data-element-id="p014-bottom-right"] .p014-example:nth-of-type(3) .p014-mark{transform:translate(-8px,1px)}
    [data-element-id="p014-top-left"] .p014-example+.p014-example .p014-mark{transform:translate(-2px,-1px) scale(1.04,1.08)}
    [data-element-id="p014-top-right"] .p014-example+.p014-example .p014-mark{transform:translate(-10px,0) scale(1.04,1.08)}
    [data-element-id="p014-bottom-left"] .p014-example+.p014-example .p014-mark{transform:translateY(-1px) scale(1.04,1.08)}
    [data-element-id="p014-bottom-right"] .p014-example+.p014-example .p014-mark{transform:translate(-9px,-1px) scale(1.04,1.08)}
    .p014-mark{display:inline-grid;flex:none;width:23px;height:23px;place-items:center;border-radius:50%;background:${C.green700};color:#fff;font-weight:800}
    .p014-mark.no{background:#b2b4b3}
    .p014-cycle{border-radius:50%}
    .p014-cycle svg text{font-family:"Noto Sans CJK SC","Microsoft YaHei",sans-serif}
  `,
  body: `
    ${header('P014', 'PREP法-使用步骤与操作要点', 1222)}
    ${text('p014-subtitle', 42, 91, 1131, 47, 'PREP法分为四个步骤，每一步都有具体的操作要领', 'center', 'font-size:23px;')}
    ${el('p014-top-left', 42, 139, 565, 252, `<h3 ${attrs('p014-tl-title', true)}>01&nbsp;&nbsp;开门见山</h3><div ${attrs('p014-tl-copy', true)}>第一句话就用清晰、肯定、完整的句子说<br>出你的主张</div><div class="rule"></div><div class="p014-example"><span class="p014-mark">✓</span><span ${attrs('p014-tl-yes', true)}>我建议……、我认为……、我的结论是……</span></div><div class="p014-example"><span class="p014-mark no">×</span><span ${attrs('p014-tl-no', true)}>铺垫太长，铺垫了30秒还没进入主题</span></div>`, 'p014-quadrant')}
    ${el('p014-top-right', 616, 139, 565, 252, `<h3 ${attrs('p014-tr-title', true)}>简明扼要&nbsp;&nbsp;02</h3><div ${attrs('p014-tr-copy', true)}>列出支撑结论的核心理由，通常以2-3条<br>理由为佳</div><div class="rule"></div><div class="p014-example"><span ${attrs('p014-tr-yes', true)}>理由之间建议符合MECE原则（相互独立，<br>完全穷尽）</span><span class="p014-mark">✓</span></div><div class="p014-example"><span ${attrs('p014-tr-no', true)}>理由太多导致听众记不住；或理由与结论<br>之间逻辑断裂</span><span class="p014-mark no">×</span></div>`, 'p014-quadrant right')}
    ${el('p014-bottom-left', 42, 405, 565, 248, `<h3 ${attrs('p014-bl-title', true)}>04&nbsp;&nbsp;首尾呼应</h3><div ${attrs('p014-bl-copy', true)}>用不同的措辞，把第一步的结论换种说法<br>再强调一遍，为表达画上圆满句号</div><div class="rule"></div><div class="p014-example"><span class="p014-mark">✓</span><span ${attrs('p014-bl-yes', true)}>所以，基于以上考虑，我坚持……</span></div><div class="p014-example"><span class="p014-mark no">×</span><span ${attrs('p014-bl-no', true)}>草草结尾，没有强化印象</span></div>`, 'p014-quadrant')}
    ${el('p014-bottom-right', 616, 405, 565, 248, `<h3 ${attrs('p014-br-title', true)}>实锤落地&nbsp;&nbsp;03</h3><div ${attrs('p014-br-copy', true)}>针对上述理由，提供具体的数据、案例、<br>事实或亲身体验</div><div class="rule"></div><div class="p014-example"><span ${attrs('p014-br-yes', true)}>实锤佐证非“泛泛而谈”和做到“有理有据”</span><span class="p014-mark">✓</span></div><div class="p014-example"><span ${attrs('p014-br-no', true)}>证据力度不足（如“我朋友说……”），<br>或证据与理由不匹配</span><span class="p014-mark no">×</span></div>`, 'p014-quadrant right')}
    ${el('p014-cycle', 390, 188, 442, 442, `<svg viewBox="0 0 442 442" aria-label="PREP循环">
      <path d="M275 81L215 5L214 40L184 43L146 55L111 75L81 102L58 133L46 158L36 192L80 157L124 191L136 168L154 148L180 132L202 125L215 125L215 158Z" fill="${C.green900}"/>
      <path d="M251 37L285 80L251 125L268 132L292 152L307 173L317 201L317 216L285 216L362 275L438 216L403 215L402 196L395 165L383 136L365 108L341 82L321 66L299 53L266 40Z" fill="${C.green700}"/>
      <path d="M405 252L362 286L317 253L307 274L288 295L263 311L241 318L226 318L225 287L167 363L226 439L227 404L266 399L300 387L332 368L358 345L376 323L392 295L402 268Z" fill="${C.green600}"/>
      <path d="M79 170L5 228L39 229L39 243L46 277L58 307L77 337L102 364L120 378L145 393L171 403L191 407L157 364L191 320L170 310L151 294L134 270L124 240L125 228L156 228L86 173Z" fill="${C.green400}"/>
      <circle cx="221" cy="222" r="96" fill="#fff"/>
      <text x="221" y="239" text-anchor="middle" font-size="45" font-weight="700" fill="#218654">PREP</text>
      <text x="204" y="100" text-anchor="middle" font-size="40" font-weight="700" fill="#fff">P</text>
      <text x="138" y="116" text-anchor="middle" font-size="19" fill="#fff">Point</text>
      <text x="359" y="227" text-anchor="middle" font-size="40" font-weight="700" fill="#fff">R</text>
      <text x="333" y="145" text-anchor="middle" font-size="21" fill="#fff">Reason</text>
      <text x="232" y="376" text-anchor="middle" font-size="40" font-weight="700" fill="#fff">E</text>
      <text x="305" y="341" text-anchor="middle" font-size="21" fill="#fff">Evidence</text>
      <text x="85" y="255" text-anchor="middle" font-size="40" font-weight="700" fill="#fff">P</text>
      <text x="108" y="302" text-anchor="middle" font-size="21" fill="#fff">Point</text>
    </svg>`, 'p014-cycle')}
  `,
});

const p015Path = '思维模型/03-PREP/P015-PREP-流程要点.html';
const p015EdgeStrips = (() => {
  const strips = [];
  const addArea = (x1, y1, x2, y2, exclusions = []) => {
    for (let row = y1; row < y2; row += 1) {
      let segments = [[x1, x2]];
      for (const [x, y, width, height] of exclusions) {
        if (row < y || row >= y + height) continue;
        const next = [];
        for (const [start, end] of segments) {
          if (x >= end || x + width <= start) {
            next.push([start, end]);
            continue;
          }
          if (start < x) next.push([start, x]);
          if (x + width < end) next.push([x + width, end]);
        }
        segments = next;
      }
      for (const [start, end] of segments) {
        if (end > start) strips.push({ row, start, end });
      }
    }
  };

  for (let row = 84; row < 90; row += 1) strips.push({ row, start: 42, end: 1181 });
  addArea(38, 98, 1178, 166, [
    [58, 111, 190, 42], [272, 101, 900, 31], [272, 130, 900, 34],
  ]);
  addArea(38, 176, 1178, 270, [
    [55, 193, 100, 52], [195, 185, 170, 74], [411, 185, 188, 74],
    [660, 185, 194, 74], [908, 185, 220, 74],
  ]);
  addArea(38, 262, 1138, 467, [
    [54, 281, 104, 55], [54, 369, 104, 65],
    [178, 277, 185, 69], [385, 277, 228, 69], [638, 277, 229, 69], [892, 277, 235, 69],
    [178, 357, 185, 99], [385, 357, 228, 99], [638, 357, 229, 99], [892, 357, 235, 99],
  ]);
  addArea(38, 465, 1178, 663, [
    [55, 502, 100, 120],
    [174, 478, 194, 55], [174, 526, 194, 124],
    [389, 478, 225, 55], [389, 526, 225, 124],
    [635, 478, 225, 55], [635, 526, 225, 124],
    [881, 478, 286, 55], [881, 526, 286, 124],
  ]);
  for (const [x, y, width, height] of [
    [54, 290, 104, 35], [54, 378, 104, 35],
    [178, 285, 185, 58], [385, 285, 228, 58], [638, 285, 229, 58], [892, 285, 235, 58],
    [178, 365, 185, 82], [385, 365, 228, 82], [638, 365, 229, 82], [892, 365, 235, 82],
  ]) {
    for (let row = y; row < y + height; row += 1) strips.push({ row, start: x, end: x + width });
  }
  return strips;
})();

add({
  id: 'p015-prep-flow',
  title: 'PREP法-使用步骤与操作要点',
  width: 1222,
  height: 688,
  relativePath: p015Path,
  css: greenSharedCss + `
    .slide:before{content:"";position:absolute;z-index:20;inset:0;pointer-events:none;background:${nativeEdgeStripBackground(p015Path, p015EdgeStrips)}}
    .slide:after{border:0!important;background:${nativeEdgeStripBackground(p015Path, [
      { row: 0, start: 0, end: 1222 }, { row: 687, start: 0, end: 1222 },
      { column: 0, start: 0, end: 688 }, { column: 1221, start: 0, end: 688 },
    ])}!important}
    html[data-edit-mode="true"] .slide:before{display:none}
    [data-element-id="header-title"]{font-family:"Notale Zen Hei",sans-serif!important;font-size:37px!important;font-weight:400!important;letter-spacing:-1px!important;transform:translate(-2px,-1px)!important;transform-origin:left center!important}
    [data-element-id="p015-core"]{font-family:"Notale Droid",sans-serif;font-size:24px!important;font-weight:400!important;letter-spacing:-1px!important;transform:none!important}
    [data-element-id="p015-intro"]{display:block!important;overflow:visible!important;font-family:"Notale CJK",sans-serif!important;font-size:19px!important;font-weight:400!important;transform:none!important}
    .p015-intro-line{position:absolute;display:block;left:0;line-height:1;white-space:nowrap}
    .p015-intro-line-1{left:3px;top:7px;letter-spacing:-2px}.p015-intro-line-2{left:0;top:34px;letter-spacing:-1.5px}
    .p015-flow{display:grid;grid-template-columns:125px 203px 254px 255px 254px;color:#fff;overflow:visible;background:linear-gradient(90deg,#fff 0%,#e3f9ee 5%,#c4f2dc 10.5%,#97e8c1 18.4%,#6bdea7 27.2%,#6adda5 31.7%,#58cb93 40.5%,#34b174 49.3%,#25a769 56.4%,#239b62 62.6%,#1e8654 71.4%,#1c7c4e 78.5%,#1a7248 84.7%,#155938 95.3%,#135535 100%);clip-path:polygon(0 0,96.46% 0,100% 50%,96.46% 100%,0 100%)}
    .p015-flow-label{display:grid;place-items:center;align-self:center;width:123px;height:43px;border-radius:999px;background:${C.green700};color:#fff;font-size:18px;font-weight:700}
    .p015-flow .step{position:relative;display:flex;align-items:center;justify-content:center;gap:18px;padding-right:24px;font-size:22px;line-height:1.15;background:transparent!important}
    .p015-flow .step:after{content:"";position:absolute;z-index:2;right:-44px;top:0;width:44px;height:86px;background:#fff;clip-path:polygon(0 0,100% 50%,0 100%,0 96.5%,93% 50%,0 3.5%)}
    .p015-flow .step:nth-child(2):after{right:-46px;width:46px}
    .p015-flow .step:nth-child(5):after{display:none}
    .p015-flow .flow-content{display:flex;align-items:center;gap:45px;color:#fff}
    .p015-flow .step:nth-child(2) .flow-content{transform:translateX(53px)}
    .p015-flow .step:nth-child(3) .flow-content{transform:translateX(68px)}
    .p015-flow .step:nth-child(4) .flow-content{transform:translateX(63px)}
    .p015-flow .step:nth-child(5) .flow-content{transform:translateX(48px)}
    .p015-flow .step strong{font-size:43px}.p015-flow .step span{display:block;font-size:17px;font-weight:400}
    .p015-flow .flow-content b{font-family:"Notale Droid",sans-serif;text-align:center;transform:translateY(-4px) scale(1.12,1.08);transform-origin:center center}
    .p015-flow .step:nth-child(3) .flow-content b{transform:translate(-9px,-4px) scale(1.14,1.08)}
    .p015-flow .step:nth-child(4) .flow-content b{transform:translate(-11px,-4px) scale(1.12,1.08)}
    .p015-flow .flow-content b span{transform-origin:center center}
    .p015-flow .step:nth-child(2) b span{transform:translate(1px,7px) scale(1.34,1.25)}
    .p015-flow .step:nth-child(3) b span{transform:translateY(5px) scale(1.19,1.25)}
    .p015-flow .step:nth-child(4) b span{transform:translateY(7px) scale(1.24,1.25)}
    .p015-flow .step:nth-child(5) b span{transform:translateY(5px) scale(1.31,1.25)}
    .p015-flow .flow-content strong{font-size:42px;transform:translateY(-2px) scale(.94,1.04);transform-origin:center center}
    .p015-flow .step:nth-child(2) strong{transform:translate(4px,-3px) scale(1.18)}
    .p015-flow .step:nth-child(3) strong{transform:translate(6px,-3px) scale(1.29,1.18)}
    .p015-flow .step:nth-child(4) strong{transform:translate(-2px,-3px) scale(1.10,1.18)}
    .p015-flow .step:nth-child(5) strong{transform:translate(8px,-3px) scale(1.18)}
    .p015-table{display:grid;grid-template-columns:125px 203px 254px 255px 254px;grid-template-rows:87px 110px;font-size:15px;line-height:1.5}
    .p015-table .label{display:grid;align-self:center;justify-self:start;width:123px;height:43px;place-items:center;margin:0;border-radius:999px;background:${C.green600};color:#fff;font-size:18px}
    .p015-table .label:first-child{transform:translateY(4px)}.p015-table .label:nth-child(6){transform:translateY(-8px)}
    .p015-table .cell{padding:17px 20px;border-left:1px dashed #b8bdb9;white-space:nowrap}
    .p015-table .cell:nth-child(-n+5){padding-top:24px}.p015-table .cell:nth-child(n+7){padding-top:16px}
    .p015-table .cell>span{display:inline-block;transform:translateX(-1px) scaleX(.96);transform-origin:left top}
    .p015-table{font-family:"Notale Droid",sans-serif;font-size:16px}
    [data-element-id="p015-overview-0"]{transform:translate(-2px,0) scale(1,1.03)!important}[data-element-id="p015-overview-1"]{transform:translate(1px,0) scale(.995,1.03)!important}[data-element-id="p015-overview-2"]{transform:translate(2px,0) scale(1,1.03)!important}[data-element-id="p015-overview-3"]{transform:translate(3px,0) scale(.97,1.03)!important}
    [data-element-id="p015-require-0"]{transform:translate(3px,-3px) scaleX(.993)!important}[data-element-id="p015-require-1"]{transform:translate(2px,-3px) scaleX(1.01)!important}[data-element-id="p015-require-2"]{transform:translate(2px,-2px) scaleX(.995)!important}[data-element-id="p015-require-3"]{transform:translate(3px,-3px) scale(.995,1.02)!important}
    .p015-tips{display:grid;grid-template-columns:121px 215px 246px 246px 303px;background:#f2f2f2}
    .p015-tips .rail{display:grid;place-items:center;padding:18px;background:${C.green400};color:#fff;text-align:center;font-size:17px;line-height:1.65}
    .p015-tips .tip{padding:14px 13px 10px;font-family:"Notale Droid",sans-serif;font-size:16px;line-height:25px}
    .p015-tips .tip b{display:block;margin-bottom:19px;font-family:"Notale CJK",sans-serif;font-size:20px}.p015-tips .num{display:inline-grid;width:43px;height:43px;place-items:center;border-radius:50%;background:${C.green600};color:#fff;font-size:20px;margin-right:8px}
    .p015-tips .tip>div{line-height:24px}
    .p015-tips .tip:nth-child(2) .num{background:${C.green400};transform:translateX(-1px)}.p015-tips .tip:nth-child(3) .num{background:${C.green600};transform:translateX(-1px)}.p015-tips .tip:nth-child(4) .num{background:${C.green800};transform:translateX(-1px)}.p015-tips .tip:nth-child(5) .num{background:${C.green900};transform:translateX(-1px)}
    [data-element-id="p015-tip-copy-0"]{transform:translateY(-2px) scaleX(.94);transform-origin:left top}[data-element-id="p015-tip-copy-1"]{transform:translate(2px,-2px) scaleX(.96);transform-origin:left top}[data-element-id="p015-tip-copy-2"]{transform:translate(3px,-2px) scaleX(.985);transform-origin:left top}[data-element-id="p015-tip-copy-3"]{transform:translate(4px,-2px) scaleX(.96);transform-origin:left top}
    [data-element-id="header-code"]{translate:-1px .5px;scale:1 1}
    [data-element-id="p015-intro"]{scale:1 .94}
    [data-element-id="p015-flow-label"]{translate:.25px -1px}
    [data-element-id="p015-flow-r"]{translate:1px 1px;scale:1 1.03}
    [data-element-id="p015-flow-e"]{scale:1.03 .97}
    [data-element-id="p015-tips-rail"]{translate:-1px 3.5px;scale:1.03 1}
    [data-element-id="p015-tip-title-0"],[data-element-id="p015-tip-title-2"],[data-element-id="p015-tip-title-3"]{font-weight:400}
    [data-element-id="p015-tip-title-1"]{font-weight:500}
    [data-element-id="p015-tip-copy-0"]{translate:.75px -.5px}
    [data-element-id="p015-tip-copy-1"]{translate:-1.25px -.5px}
    [data-element-id="p015-tip-copy-2"]{translate:-1px 0}
  `,
  body: `
    ${header('P015', 'PREP法-使用步骤与操作要点', 1222)}
    ${el('p015-core', 42, 106, 222, 52, '核心逻辑', 'matrix-cell heavy', 'border-radius:30px;background:#f1f1f1;font-size:21px;')}
    ${text('p015-intro', 277, 102, 896, 62, '<span class="p015-intro-line p015-intro-line-1">PREP法的本质是“果因表达”——它要求你先抛出核心结论，再展开论证过程。这完全契合人脑“先接收要点、</span><span class="p015-intro-line p015-intro-line-2">再消化细节”的信息处理习惯，能让听众在第一时间抓住重点，而不必等到你把话说完。</span>', '', 'font-size:18px;line-height:1.5;')}
    ${el('p015-flow', 42, 180, 1131, 86, `
      <div class="p015-flow-label" ${attrs('p015-flow-label', true)}>操作步骤</div>
      <div class="step" style="background:#9de5c5;color:#9de5c5"><div class="flow-content"><b ${attrs('p015-flow-p1', true)}>观点 <span>Point</span></b><strong>P</strong></div></div>
      <div class="step" style="background:#48bd82;color:#48bd82"><div class="flow-content"><b ${attrs('p015-flow-r', true)}>理由 <span>Reason</span></b><strong>R</strong></div></div>
      <div class="step" style="background:#1e8a53;color:#1e8a53"><div class="flow-content"><b ${attrs('p015-flow-e', true)}>证据 <span>Evidence</span></b><strong>E</strong></div></div>
      <div class="step" style="background:#115b38;color:#115b38"><div class="flow-content"><b ${attrs('p015-flow-p2', true)}>重申观点 <span>Point</span></b><strong>P</strong></div></div>
    `, 'p015-flow')}
    ${el('p015-table', 42, 266, 1091, 197, `
      <div class="label">步骤概述</div>${['先说出你的结论，表明你<br>的核心主张','然后再简明扼要阐述支持该观点<br>的核心理由','给理由举证，用事实、数据<br>或案例来佐证理由','最后再次强调结论，加深印象，<br>呼应开头观点形成闭环'].map((v,i)=>`<div class="cell"><span ${attrs(`p015-overview-${i}`,true)}>${v}</span></div>`).join('')}
      <div class="label" style="background:${C.green400}">操作要求</div>${['开门见山，第一句话就<br>用清晰、肯定、完整的<br>句子说出你的主张。','简明扼要，列出支撑结论的核<br>心理由，通常2-3条为佳。理由<br>之间建议符合MECE原则。','实锤落地，针对上述理由，提<br>供具体的数据、案例、事实或<br>亲身体验。','首尾呼应，用不同的措辞，把<br>第一步的结论换种说法再强调<br>一遍，为表达画上圆满句号。'].map((v,i)=>`<div class="cell"><span ${attrs(`p015-require-${i}`,true)}>${v}</span></div>`).join('')}
    `, 'p015-table')}
    ${el('p015-tips', 42, 469, 1131, 190, `<div class="rail" ${attrs('p015-tips-rail',true)}>PREP法<br>使用技巧&<br>注意事项</div>${[
      ['01','控制好时长','PREP法适用于1-3分钟<br>的口头表达。如果时间<br>更长，可以每个R和E点<br>展开成更丰富的层级'],
      ['02','理由不超3条','人类的短期记忆上限约为<br>4±1个信息模块，一般2-3<br>条理由最容易让听众跟上<br>你的讲解节奏'],
      ['03','证据要具体','不用“大概”、“可能”、“听说”<br>等词汇。用“数据表明…”、<br>“报告显示…”、“测试结果显<br>示…”等确定性描述'],
      ['04','首尾用不同措辞','如开头的P是“建议立项”，结尾<br>的P是“作为本季度紧急事项推<br>动”，意思一致，但换说法，避<br>免重复感'],
    ].map((tip,i)=>`<div class="tip"><b><span class="num">${tip[0]}</span><span ${attrs(`p015-tip-title-${i}`,true)}>${tip[1]}</span></b><div ${attrs(`p015-tip-copy-${i}`,true)}>${tip[2]}</div></div>`).join('')}`, 'p015-tips')}
  `,
});

add({
  id: 'p016-abc-chain',
  title: 'ABC理论-信念导致结果',
  width: 1222,
  height: 688,
  relativePath: '思维模型/04-ABC/P016-ABC-事件信念结果.html',
  css: greenSharedCss + `
    .slide:after{border-color:#e8e8e8 #e4e4e4 #d9d9d9 #d9d9d9}
    .regular-header:before{flex-basis:9px;width:9px;height:56px;margin-left:0;transform:none}
    .regular-header .header-code{width:77px;height:56px;transform:none}
    .regular-header .header-code span{display:inline-block;font-family:"Notale CJK",sans-serif;font-size:25px;font-weight:400;transform:none}
    .regular-header .header-title{font-family:"Notale Droid",sans-serif;font-size:36px!important;transform-origin:left center;transform:translate(1px,-3px) scale(1.03,.98)}
    .regular-header .header-rule{right:6px;bottom:1px;height:1px;transform:rotate(.09deg)}
    .abc-shape{border-radius:0 177px 177px 0;background:linear-gradient(90deg,#f5fcf9 0%,#e2f6ed 10%,#d1f0e1 24%,#ade2c8 43%,#91d8b6 57%,#6ec99d 72%,#36b277 91%,#26aa6b 100%)}
    .abc-shape-b{background-color:#f5fcf9;background-position:right;background-repeat:no-repeat;background-size:418px 100%}
    .abc-shape-c{background-color:#f5fcf9;background-position:right;background-repeat:no-repeat;background-size:417px 100%}
    .abc-shape:after{content:"";position:absolute;inset:-1px;border-right:1.5px dashed ${C.green700};border-radius:inherit;pointer-events:none}
    .abc-module{padding:88px 55px 40px 72px;background:transparent;overflow:visible}
    .abc-module .abc-copy{position:relative;z-index:2;font-size:15px;line-height:1.55;transform:translateY(8px)}
    .abc-module h3{margin:0;color:${C.green700};font-size:30px;transform-origin:left center}
    .abc-module .en{font-size:22px;transform-origin:left center}
    .abc-module .big{position:absolute;right:36px;top:68px;color:transparent;background:linear-gradient(90deg,rgba(255,255,255,0) 15%,rgba(255,255,255,.95) 100%);background-clip:text;-webkit-background-clip:text;font-family:Arial,sans-serif;font-size:200px;font-weight:900;line-height:1;transform-origin:center}
    .abc-module b{display:inline-block;transform-origin:left center;transform:translate(0,2px) scale(1.32,1.2)}
    .abc-module .abc-copy>span{display:inline-block;transform:translateY(16px)}
    .abc-module:before{content:"";position:absolute;left:55px;top:101px;height:168px;border-left:1px dashed ${C.green700}}
    .abc-module-0 .big{right:20px;top:70px;transform:scaleY(1.15)}
    .abc-module-1{padding-left:58px}.abc-module-1:before{left:41px}.abc-module-1 .big{right:38px;top:68px;transform:scaleY(1.125)}
    .abc-module-2{padding-left:32px}.abc-module-2:before{left:17px}.abc-module-2 .big{right:60px;top:68px;transform:scaleY(1.125)}
    .abc-module-0 h3{transform:translate(2px,-5px) scale(1.17,1.18)}
    .abc-module-1 h3{transform:translate(-1px,-5px) scale(1.17,1.18)}
    .abc-module-2 h3{transform:translate(0,-5px) scale(1.17,1.18)}
    .abc-module-0 .en{transform:translate(1px,-1px) scale(1.027,1.16)}
    .abc-module-1 .en{transform:translate(1px,-2px) scale(1.075,1.2)}
    .abc-module-2 .en{transform:translate(1px,-1px) scale(1.11,1.2)}
    .abc-module-0 b{transform:translate(2px,2px) scale(1.32,1.2)}
    .abc-module-2 b{transform:translate(1px,2px) scale(1.32,1.2)}
    .abc-module-0 .abc-copy>span{transform:translate(2px,16px)}
    .abc-module-2 .abc-copy>span{transform:translate(1px,16px)}
    [data-element-id="p016-intro"] .intro-copy{display:block;position:relative;padding:0;transform:none;overflow:visible;color:#999}
    [data-element-id="p016-intro"] .intro-copy>span{position:absolute;left:16px;display:block;white-space:nowrap;font-family:"Notale Zen Hei",sans-serif;font-size:18px;font-weight:400;line-height:1;transform-origin:left top}
    [data-element-id="p016-intro"] .p016-intro-line-1{top:12px;transform:scaleX(1.02)}
    [data-element-id="p016-intro"] .p016-intro-line-2{top:39px;transform:translateX(1.5px) scale(.975,1.06)}
    [data-element-id="p016-intro"] .intro-label>span{display:inline-block;font-family:"Notale Zen Hei",sans-serif;font-size:23px;font-weight:700;transform:translate(1px,-1px) scale(1,.92)}
    [data-element-id="p016-conclusion"]{display:block;background:linear-gradient(90deg,#26aa6b 0%,#26a86a 16.4%,#23a366 32.7%,#239a62 49.1%,#1f905a 65.5%,#1f8756 81.8%,#1e8152 100%)!important}
    [data-element-id="p016-conclusion"]>span{position:absolute;left:0;display:block;width:100%;text-align:center;line-height:1;white-space:nowrap;transform-origin:center top}
    [data-element-id="p016-conclusion"] .p016-conclusion-line-1{top:46px;font-size:24px;transform:translateX(2px) scaleX(.96)}
    [data-element-id="p016-conclusion"] .p016-conclusion-line-2{top:88px;font-size:24px;transform:translateX(1px) scaleX(.96)}
  `,
  body: `
    ${header('P016', 'ABC理论-信念导致结果', 1222)}
    ${el('p016-intro', 42, 97, 1131, 66, `<div class="intro-label" ${attrs('p016-intro-label',true)}><span>模型介绍</span></div><div class="intro-copy" ${attrs('p016-intro-copy',true)}><span class="p016-intro-line-1">ABC理论由美国心理学家阿尔伯特·艾利斯（Albert Ellis）于20世纪50年代提出，是认知行为疗法（CBT）的核心基础。</span><span class="p016-intro-line-2">它揭示了一个反直觉的真相：引发你情绪和行为后果的，不是事件本身，而是你对事件的看法（信念）。</span></div>`, 'intro-band')}
    ${el('p016-shape-a', 0, 178, 413, 354, '', 'abc-shape abc-shape-a', 'z-index:3;')}
    ${el('p016-shape-b', 359, 178, 442, 354, '', 'abc-shape abc-shape-b', 'z-index:2;')}
    ${el('p016-shape-c', 745, 178, 444, 354, '', 'abc-shape abc-shape-c', 'z-index:1;')}
    ${[
      ['事件','Activating Event','诱发性事件','发生了什么','A'],
      ['信念','Belief','信念/认知','我怎么看待这件事','B'],
      ['结果','Consequence','情绪和行为后果','我产生了什么感受、做了什么','C'],
    ].map((item,i)=>el(`p016-module-${i}`, i*407, 178, 408, 354, `<div class="abc-copy"><h3 ${attrs(`p016-title-${i}`,true)}>${item[0]}</h3><div class="en" ${attrs(`p016-en-${i}`,true)}>${item[1]}</div><br><b ${attrs(`p016-sub-${i}`,true)}>${item[2]}</b><br><span ${attrs(`p016-question-${i}`,true)}>${item[3]}</span></div><div class="big">${item[4]}</div>`, `abc-module abc-module-${i}`, 'z-index:10;')).join('')}
    ${text('p016-conclusion', 0, 532, 1222, 156, '<span class="p016-conclusion-line-1">事件本身是中性的，是你对事件的解读（B），决定了最终的情绪和行为（C）</span><span class="p016-conclusion-line-2">同一个（A），在不同B的作用下，会产生完全不同的（C）</span>', 'center', `z-index:20;color:#fff;`)}
  `,
});

add({
  id: 'p017-belief-compare',
  title: 'ABC理论-理性与非理性信念结果',
  width: 1222,
  height: 688,
  relativePath: '思维模型/04-ABC/P017-ABC-理性与非理性信念.html',
  css: greenSharedCss + `
    .p017-bg{background:#f2f2f2;clip-path:polygon(0 0,100% 30%,100% 70%,0 100%)}
    .p017-circle{display:grid;place-items:center;border-radius:50%;color:#fff;font-size:34px;font-weight:800;text-align:center}
    .p017-circle:after{content:"";position:absolute;inset:22px;border:1.5px dashed rgba(255,255,255,.9);border-radius:50%}
    .p017-side{display:grid;grid-template-rows:90px 89px 1fr;font-size:17px;line-height:1.55;color:${C.green700}}
    .p017-side .label{display:block;width:116px;height:34px;margin:0 0 9px;padding:5px;border-radius:999px;background:${C.green700};color:#fff;text-align:center;font-weight:700;line-height:24px}
    .p017-side.right{text-align:right}.p017-side.right .label{margin-left:auto;margin-right:0;background:${C.green600}}
    .p017-roof span{display:inline-flex;padding:7px 27px;border-radius:999px;background:#fff;color:${C.green700}}
    .p017-bottom{display:grid;grid-template-columns:193px 1fr;border:1px solid ${C.green700};background:#f2f2f2}
    .p017-headicon{display:grid;place-items:center;color:${C.green600}}
    .p017-lines{display:grid;grid-template-rows:repeat(3,38px);align-content:center;padding:0;font-size:17px;letter-spacing:.9px}
    .p017-lines>div{display:grid;grid-template-columns:61px 110px 48px 258px 55px 1fr;align-items:center}.p017-lines b{color:${C.green700}}
    .p017-lines .link{position:relative;height:1px;border-top:1px dashed ${C.green700}}
    .p017-lines .link:after{content:"";position:absolute;right:-1px;top:-4px;border-left:7px solid ${C.green700};border-top:4px solid transparent;border-bottom:4px solid transparent}
  `,
  body: `
    ${header('P017', 'ABC理论-理性与非理性信念结果', 1222)}
    ${el('p017-left-bg', 42, 97, 565, 391, '', 'p017-bg')}
    ${el('p017-right-bg', 616, 97, 565, 391, '', 'p017-bg', 'clip-path:polygon(0 30%,100% 0,100% 100%,0 70%);')}
    ${el('p017-left-side', 81, 162, 232, 290, `<div><span class="label" ${attrs('p017-left-feature',true)}>特征</span><div ${attrs('p017-left-feature-copy',true)}>基于事实、灵活、有建设性</div></div><div><span class="label" ${attrs('p017-left-sentence',true)}>典型句式</span><div ${attrs('p017-left-sentence-copy',true)}>“我希望……”、“我争取……”</div></div><div><span class="label" ${attrs('p017-left-result',true)}>后果</span><div ${attrs('p017-left-result-copy',true)}>产生适度情绪<br>—焦虑、失望，促进行动</div></div>`, 'p017-side')}
    ${el('p017-right-side', 897, 162, 232, 290, `<div><span class="label" ${attrs('p017-right-feature',true)}>特征</span><div ${attrs('p017-right-feature-copy',true)}>脱离事实、绝对化、灾难化</div></div><div><span class="label" ${attrs('p017-right-sentence',true)}>典型句式</span><div ${attrs('p017-right-sentence-copy',true)}>“我必须…”、“万一…就完了”</div></div><div><span class="label" ${attrs('p017-right-result',true)}>后果</span><div ${attrs('p017-right-result-copy',true)}>产生过度情绪<br>—抑郁、暴怒，阻碍行动</div></div>`, 'p017-side right')}
    ${el('p017-rational', 344, 162, 261, 261, '理性<br>信念', 'p017-circle', `background:${C.green700};`)}
    ${el('p017-irrational', 618, 162, 261, 261, '非理性<br>信念', 'p017-circle', `background:${C.green600};`)}
    ${el('p017-roof', 42, 446, 1131, 66, `<span ${attrs('p017-roof-title',true)}>常见的三类非理性信念</span>`, 'matrix-cell p017-roof', `background:${C.green600};clip-path:polygon(0 100%,50% 0,100% 100%);color:#fff;font-size:17px;padding-top:24px;`)}
    ${el('p017-bottom', 42, 510, 1131, 149, `<div class="p017-headicon"><svg viewBox="0 0 193 149" aria-hidden="true"><circle cx="114" cy="76" r="54" fill="none" stroke="${C.green600}" stroke-width="1.5"/><path d="M110 38C96 39 86 50 85 64C84 75 89 86 94 96V114H126Q127 114 127 113V107Q127 104 130 104H138Q142 104 142 99V88L149 87V84L143 74C143 58 135 45 124 40C119 38 115 38 110 38Z" fill="${C.green600}"/><path d="M110 45H114L116 49L122 48L125 51L123 56L128 59V63L123 66L125 70L122 73L117 72L114 77H111L108 72L102 73L99 70L101 65L96 62V59L101 56L99 51L102 48L108 49Z" fill="#fff"/><circle cx="112" cy="61" r="5" fill="${C.green600}"/></svg></div><div class="p017-lines">${[['绝对化要求','认为事情“必须”按自己期望发展','“我付出了努力，必须得到回报。”'],['过分概括化','以偏概全，因一次失败否定全部','“这次汇报搞砸了，我什么都做不好。”'],['灾难化思维','很容易将所谓消极后果无限放大','“这次晋升没过，我的职业生涯就全毁了。”']].map((line,i)=>`<div><i class="link"></i><b ${attrs(`p017-line-title-${i+1}`,true)}>${line[0]}</b><i class="link"></i><span ${attrs(`p017-line-copy-${i+1}`,true)}>${line[1]}</span><i class="link"></i><span ${attrs(`p017-line-example-${i+1}`,true)}>${line[2]}</span></div>`).join('')}</div>`, 'p017-bottom')}
  `,
});

add({
  id: 'p020-induction-deduction',
  title: '归纳与演绎-深层逻辑与辩证关系',
  width: 1222,
  height: 688,
  relativePath: '思维模型/05-归纳与演绎/P020-归纳与演绎-深层逻辑.html',
  css: greenSharedCss + `
    .p020-band{z-index:4;display:grid;place-items:center;color:#fff;font-size:23px;font-weight:800;line-height:1;background:linear-gradient(90deg,#1e7f50 0%,#1e8051 10%,#1e8353 20%,#1f8956 30%,#20905a 40%,#22965e 50%,#239d62 60%,#24a366 70%,#25a769 80%,#25a96a 90%,#26aa6b 100%)}
    [data-element-id="p020-lower-band"]{background:linear-gradient(90deg,#26aa6b 0%,#25a96a 10%,#25a769 20%,#24a366 30%,#239d62 40%,#22965e 50%,#20905a 60%,#1f8956 70%,#1e8353 80%,#1e8051 90%,#1e7f50 100%)}
    .p020-fold{z-index:1}
    .p020-loop{z-index:2;background:${C.gray100}}
    .p020-node{z-index:4;display:grid;place-items:center;border-radius:999px;color:#fff;text-align:center;font-size:16px;line-height:1.4}
    .p020-node small{font-size:14px;color:rgba(255,255,255,.64)}
    [data-element-id="p020-loop-copy"]{z-index:3;display:block;overflow:visible;font-size:15px;line-height:1}
    [data-element-id="p020-loop-copy"]>span{position:absolute;display:block;white-space:nowrap;line-height:1}
    [data-element-id="p020-loop-copy"] .line-1{left:2px;top:12px}
    [data-element-id="p020-loop-copy"] .line-2{left:2px;top:40px}
    [data-element-id="p020-loop-copy"] .line-3{left:19px;top:102px}
    [data-element-id="p020-loop-copy"] .line-4{left:19px;top:124px}
    [data-element-id="p020-loop-copy"] .line-5{left:19px;top:147px}
    .p020-copy-rule{z-index:3;background:#c9cecb}
    .p020-connectors{z-index:3}
    .p020-status{z-index:5;display:grid;place-items:center;border-radius:999px;background:#a6a6a6;color:#fff;font-size:16px;line-height:1}
    .p020-lower{z-index:2;background:${C.gray100};font-size:14px;line-height:1.5}
    .p020-lower-item{z-index:3;display:block;overflow:visible;color:#1d2521;white-space:normal}
    .p020-lower-copy{font-size:15px;line-height:1.48}
    .p020-lower-example{font-size:13px;line-height:1.45}
    [data-element-id="p020-major-example"],[data-element-id="p020-major-copy"]{white-space:nowrap}
    [data-element-id="p020-major-example"]>span,[data-element-id="p020-major-copy"]>span{position:absolute;left:0;display:block;white-space:nowrap}
    [data-element-id="p020-major-example"] .g1{top:1px}
    [data-element-id="p020-major-example"] .g2{top:56px}
    [data-element-id="p020-major-example"] .g3{top:120px}
    [data-element-id="p020-major-copy"] .g1{top:-1px}
    [data-element-id="p020-major-copy"] .g2{top:54px}
    [data-element-id="p020-major-copy"] .g3{top:118px}
    .p020-tag{z-index:4;display:grid;place-items:center;border-radius:999px;background:${C.green700};color:#fff;text-align:center;font-size:16px;line-height:1}
    .p020-tag.deduction{background:${C.green600}}
    .p020-separator{z-index:3;background:repeating-linear-gradient(to bottom,#b8b8b8 0 6px,transparent 6px 11px)}
    .p020-separator.green{background:repeating-linear-gradient(to bottom,${C.green700} 0 6px,transparent 6px 11px)}
    .p020-direction{z-index:3}
    .p020-direction svg{overflow:hidden}
    .p020-rail-guide{z-index:2}
    .p020-rail{z-index:3;display:block;overflow:visible;font-size:23px;color:${C.green700};font-weight:800;line-height:1}
    .p020-rail>span{position:absolute;left:0;display:block;width:24px;text-align:center;line-height:1}
    .p020-rail .c1{top:3px}.p020-rail .c2{top:33px}.p020-rail .c3{top:62px}.p020-rail .c4{top:93px}
  `,
  body: `
    ${header('P020', '归纳与演绎-深层逻辑与辩证关系', 1222)}
    ${el('p020-top-fold-left', 112, 156, 37, 24, '', 'p020-fold', `background:${C.green900};clip-path:polygon(0 0,100% 0,100% 100%);`)}
    ${el('p020-top-fold-right', 1073, 156, 37, 24, '', 'p020-fold', `background:${C.green700};clip-path:polygon(0 0,100% 0,0 100%);`)}
    ${el('p020-top-band', 112.5, 100.5, 998, 56, '辩证关系', 'p020-band')}
    ${el('p020-loop-bg', 148.5, 156.5, 926, 225, '', 'p020-loop')}
    ${text('p020-loop-copy', 166, 172, 255, 170, '<span class="line-1">归纳与演绎不是对立的两套工具</span><span class="line-2">而是一个完整思维循环的两半</span><span class="line-3">归纳是演绎的基础</span><span class="line-4">演绎是归纳的验证</span><span class="line-5">循环迭代，螺旋上升</span>')}
    ${el('p020-copy-rule', 169, 275, 2, 64, '', 'p020-copy-rule')}
    ${el('p020-node-observe', 337.5, 287.5, 191, 69, '观察现象<br><small>收集数据</small>', 'p020-node', `background:${C.green400};`)}
    ${el('p020-node-induce', 518.5, 230.5, 192, 69, '归纳推理<br><small>提炼规律/假说</small>', 'p020-node', `background:${C.green600};`)}
    ${el('p020-node-deduce', 702.5, 172.5, 192, 69, '演绎推理<br><small>推导可验证的预测</small>', 'p020-node', `background:${C.green700};`)}
    ${el('p020-node-verify', 872.5, 287.5, 192, 69, '验证/实验<br><small>检验预测是否成立</small>', 'p020-node', `background:${C.green900};`)}
    ${el('p020-connectors', 0, 0, 1222, 688, `<svg viewBox="0 0 1222 688"><defs><marker id="p020-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M2 1L8 5L2 9" fill="none" stroke="#bfbfbf" stroke-width="1.5"/></marker></defs><path class="connector" d="M414 281 Q468 232 516 253" stroke="#bfbfbf" stroke-width="2" marker-end="url(#p020-arrow)"/><path class="connector" d="M614 231 Q655 188 704 205" stroke="#bfbfbf" stroke-width="2" marker-end="url(#p020-arrow)"/><path class="connector" d="M892 213 Q947 216 984 270" stroke="#bfbfbf" stroke-width="2" marker-end="url(#p020-arrow)"/><path class="connector" d="M872 294H714" stroke="#bfbfbf" stroke-width="2" marker-end="url(#p020-arrow)"/><path class="connector" d="M872 354H531" stroke="#bfbfbf" stroke-width="2" marker-end="url(#p020-arrow)"/></svg>`, 'p020-connectors')}
    ${el('p020-status-success', 746, 278, 102, 33, '验证成功', 'p020-status')}
    ${el('p020-status-failure', 630, 338, 102, 33, '验证失败', 'p020-status')}
    ${el('p020-lower-fold-left', 112, 360, 37, 23, '', 'p020-fold', `background:${C.green700};clip-path:polygon(0 100%,100% 0,100% 100%);`)}
    ${el('p020-lower-fold-right', 1073, 360, 37, 23, '', 'p020-fold', `background:${C.green900};clip-path:polygon(0 0,100% 100%,0 100%);`)}
    ${el('p020-lower-band', 112.5, 382.5, 998, 56, '深层逻辑', 'p020-band')}
    ${el('p020-lower', 112.5, 438.5, 998, 219, '', 'p020-lower')}
    ${el('p020-tag-complete', 132, 492, 121, 36, '完全归纳', 'p020-tag')}
    ${el('p020-complete-copy', 267, 489, 140, 46, '考察某类事物的全部<br>对象，得出普遍结论', 'p020-lower-item p020-lower-copy')}
    ${el('p020-complete-example', 430, 483, 150, 56, '某班有50人，逐一检查发<br>现全部穿了校服，归纳出<br>“该班全员穿校服”', 'p020-lower-item p020-lower-example')}
    ${el('p020-tag-partial', 132, 569, 121, 36, '不完全归纳', 'p020-tag')}
    ${el('p020-partial-copy', 267, 566, 140, 46, '考察部分对象，<br>推断整体结论', 'p020-lower-item p020-lower-copy')}
    ${el('p020-partial-example', 430, 561, 150, 58, '抽查100名消费者，92人<br>偏好A口味，推断“A口味<br>在市场上更受欢迎”', 'p020-lower-item p020-lower-example')}
    ${el('p020-left-separator', 413, 478, 1, 138, '', 'p020-separator')}
    ${el('p020-center-separator', 611, 454, 1, 187, '', 'p020-separator green')}
    ${el('p020-major-example', 655, 479, 132, 140, '<span class="g1">所有优秀的产品经理都<br>重视用户调研</span><span class="g2">小王是一名优秀的产品<br>经理</span><span class="g3">小王一定重视用户调研</span>', 'p020-lower-item p020-lower-example')}
    ${el('p020-major-copy', 824, 479, 130, 140, '<span class="g1">一般性规律或原理</span><span class="g2">具体情境或对象</span><span class="g3">必然推出的结果</span>', 'p020-lower-item p020-lower-copy')}
    ${el('p020-right-separator', 808, 478, 1, 138, '', 'p020-separator')}
    ${el('p020-tag-major', 965, 471, 121, 36, '大前提', 'p020-tag deduction')}
    ${el('p020-tag-minor', 965, 530, 121, 36, '小前提', 'p020-tag deduction')}
    ${el('p020-tag-conclusion', 965, 589, 121, 36, '结论', 'p020-tag deduction')}
    ${el('p020-left-direction', 134, 634, 424, 11, '<svg viewBox="0 0 424 11"><path d="M0 5.5H418" fill="none" stroke="#397747" stroke-width="1.4"/><path d="M418 1L424 5.5L418 10Z" fill="#397747"/></svg>', 'p020-direction')}
    ${el('p020-right-direction', 660, 449, 424, 11, '<svg viewBox="0 0 424 11"><path d="M6 5.5H424" fill="none" stroke="#397747" stroke-width="1.4"/><path d="M6 1L0 5.5L6 10Z" fill="#397747"/></svg>', 'p020-direction')}
    ${el('p020-left-guide', 64, 125, 9, 348, '<svg viewBox="0 0 9 348"><circle cx="4.5" cy="4" r="4" fill="#b8b8b8"/><path d="M4.5 10V348" stroke="#b8b8b8" stroke-width="1" stroke-dasharray="5 4"/></svg>', 'p020-rail-guide')}
    ${el('p020-right-guide', 1151, 125, 9, 348, '<svg viewBox="0 0 9 348"><circle cx="4.5" cy="4" r="4" fill="#b8b8b8"/><path d="M4.5 10V348" stroke="#b8b8b8" stroke-width="1" stroke-dasharray="5 4"/></svg>', 'p020-rail-guide')}
    ${text('p020-left-rail', 55, 490, 24, 120, '<span class="c1">归</span><span class="c2">纳</span><span class="c3">推</span><span class="c4">理</span>', 'p020-rail')}
    ${text('p020-right-rail', 1145, 486, 24, 120, '<span class="c1">演</span><span class="c2">绎</span><span class="c3">推</span><span class="c4">理</span>', 'p020-rail')}
  `,
});

add({
  id: 'p021-three-stage',
  title: '归纳与演绎-如何使用归纳演绎',
  width: 1222,
  height: 688,
  relativePath: '思维模型/05-归纳与演绎/P021-归纳与演绎-三阶段案例.html',
  css: greenSharedCss + `
    .slide:before{content:"";position:absolute;z-index:8;inset:0;pointer-events:none;background:
      ${nativeEdgeStripBackground('思维模型/05-归纳与演绎/P021-归纳与演绎-三阶段案例.html', [
        ...[81,82,83,84,85].map(row => ({ row, start:128, end:1174 })),
        ...[250,344,345].map(row => ({ row, start:42, end:1173 })),
        ...[642,643,644,645].map(row => ({ row, start:75, end:732 })),
      ])},
      repeating-linear-gradient(180deg,#e2e2e2 0 6px,#fff 6px 9px) 363px 389px/1px 255px no-repeat,
      repeating-linear-gradient(180deg,#b1b1b1 0 6px,#fff 6px 9px) 364px 389px/1px 255px no-repeat,
      repeating-linear-gradient(180deg,#c0c0c0 0 6px,#fff 6px 9px) 729px 389px/1px 255px no-repeat,
      repeating-linear-gradient(180deg,#cacaca 0 6px,#fff 6px 9px) 730px 389px/1px 255px no-repeat,
      linear-gradient(180deg,#8fe4bb,#88cfac) 76px 412px/1px 94px no-repeat,
      linear-gradient(180deg,#6cdba5,#57bb8a) 77px 412px/1px 94px no-repeat,
      linear-gradient(180deg,#daf6e9,#f1f9f5) 78px 412px/1px 94px no-repeat,
      linear-gradient(180deg,#61a484,#6ea48a) 437px 412px/1px 94px no-repeat,
      linear-gradient(180deg,#1c7d4f,#196e45) 438px 412px/1px 94px no-repeat,
      linear-gradient(180deg,#9ec7b4,#bad3c7) 439px 412px/1px 94px no-repeat,
      linear-gradient(180deg,#7abd9c,#5ba280) 76px 554px/1px 89px no-repeat,
      linear-gradient(180deg,#43a173,#268456) 77px 554px/1px 89px no-repeat,
      linear-gradient(180deg,#eff7f3,#a9cebc) 78px 554px/1px 89px no-repeat,
      linear-gradient(180deg,#6d9c85,#5f8c76) 437px 554px/1px 89px no-repeat,
      linear-gradient(180deg,#17623e,#165939) 438px 554px/1px 89px no-repeat,
      linear-gradient(180deg,#b9d0c5,#84a797) 439px 554px/1px 89px no-repeat,
      repeating-linear-gradient(180deg,#a9a9a9 0 6px,#fff 6px 9px) 826px 407px/1px 57px no-repeat,
      repeating-linear-gradient(180deg,#f4f4f4 0 6px,#fff 6px 9px) 827px 407px/1px 57px no-repeat,
      repeating-linear-gradient(180deg,#a9a9a9 0 6px,#fff 6px 9px) 826px 500px/1px 57px no-repeat,
      repeating-linear-gradient(180deg,#f4f4f4 0 6px,#fff 6px 9px) 827px 500px/1px 57px no-repeat,
      repeating-linear-gradient(180deg,#a9a9a9 0 6px,#fff 6px 9px) 826px 594px/1px 50px no-repeat,
      repeating-linear-gradient(180deg,#f4f4f4 0 6px,#fff 6px 9px) 827px 594px/1px 50px no-repeat}
    .regular-header .header-rule{display:none}
    .regular-header .header-title{scale:1.005 1.05;translate:-1px 0}
    .p021-intro{grid-template-columns:142px 1fr;font-size:19px;color:#a6a6a6}
    .p021-intro .intro-label{transform:translate(-.5px,-.5px) scaleX(1.02)}
    .p021-intro .intro-copy{font-family:"Notale CJK",sans-serif;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;line-height:26.5px;transform:scaleX(.94);transform-origin:left center;translate:1px 0}
    .p021-intro .intro-copy>span{display:block;white-space:nowrap;line-height:inherit}
    .p021-stage-head{display:grid;grid-template-columns:repeat(3,1fr);background:${C.gray100};color:#333;font-size:23px;font-weight:700;text-align:center;align-items:center}
    .p021-stage-head>div:nth-child(1){transform:translate(-19px,5px)}
    .p021-stage-head>div:nth-child(2){transform:translate(3px,5px)}
    .p021-stage-head>div:nth-child(3){transform:translate(24px,5px)}
    .p021-arrow{display:grid;grid-template-columns:repeat(3,1fr);color:#fff;font-size:30px;font-weight:800;text-align:center;align-items:center;background:linear-gradient(90deg,#9ce9c4 0%,#9be8c3 5%,#98e5c0 10%,#96e3be 15%,#93dfba 24%,#8cd7b2 32%,#81cca7 41%,#74be98 50%,#65af89 59%,#54a078 68%,#429269 77%,#33895d 86%,#248154 100%);clip-path:polygon(0 0,94.43% 0,100% 50%,94.43% 100%,0 100%)}
    .p021-arrow>div{transform:translateX(-31px);translate:2px 0;scale:1.03 1}
    .p021-columns{display:grid;grid-template-columns:360px 368px 1fr;gap:0;padding:20px 12px;color:#333}
    .p021-track{position:relative;padding-right:48px}
    .p021-track:before{display:none}
    .p021-track:first-child:before{left:23px}
    .p021-track:nth-child(2):before{border-color:${C.green900}}
    .p021-track:after{display:none}
    .p021-track:first-child:after{left:23px;right:49px}
    .p021-track:nth-child(2):after{right:51px}
    .p021-step{position:relative;z-index:1;padding:10px 0 12px 58px;min-height:140px;font-size:14px;line-height:1.5}
    .p021-step .num{position:absolute;left:-.5px;top:.5px;display:grid;width:48px;height:48px;place-items:center;border-radius:50%;background:${C.green600};color:#fff;font-size:23px;font-weight:800}
    .p021-track:first-child .p021-step:first-child .num{background:${C.green400}}
    .p021-track:nth-child(2) .num{left:.5px}
    .p021-track .p021-step:first-child .num{top:-.5px}
    .p021-step b{display:block;margin-bottom:11px;font-size:19px;transform:translateY(-1px) scaleX(.89);transform-origin:left center;translate:2px 0}
    .p021-step:nth-child(2) b{transform:scaleX(.89)}
    .p021-step small{font-family:"WenQuanYi Zen Hei Sharp","Notale Zen Hei",sans-serif;color:#c3c3c3;font-size:14px;white-space:nowrap;transform:scaleX(.94);transform-origin:left top;translate:1px 0}
    .p021-track:nth-child(2) .p021-step{padding-left:59px}
    .p021-track:nth-child(2) .p021-step:first-child b{margin-bottom:1px}
    .p021-track:first-child .p021-step small{display:block;width:205px;line-height:19px}
    .p021-track:first-child .p021-step:first-child small{line-height:18.8px}
    .p021-track:first-child .p021-step:nth-child(2) b{margin-bottom:10px}
    .p021-track:nth-child(2) .p021-step small{display:block;line-height:19px}
    .p021-track:nth-child(2) .p021-step:first-child b{margin-bottom:10px}
    .p021-track:nth-child(2) .p021-step:first-child small{line-height:19px;transform:translateY(2px) scaleX(.94)}
    .p021-track:nth-child(2) .p021-step:nth-child(2) b{margin-bottom:10px}
    .p021-strategies{position:relative}.p021-strategies:before{display:none}
    .p021-strategy{position:absolute;left:0;width:379px;height:84px;margin:0;font-size:13px;line-height:1.45}
    .p021-strategy:nth-child(1){top:6.5px}.p021-strategy:nth-child(2){top:99.5px}.p021-strategy:nth-child(3){top:193.5px}
    .p021-strategy b{position:absolute;z-index:1;left:0;top:0;display:grid;width:89px;height:34.5px;place-items:center;border-radius:999px;background:${C.green700};color:#fff;text-align:center;font-size:16px;line-height:1}
    .p021-strategy span{position:absolute;left:105px;top:-1px;display:block;width:265px;color:#4b4b4b;font-size:14px;line-height:1.4;transform:scaleX(.94);transform-origin:left top;translate:1px -1px}
    .p021-strategy small{position:absolute;left:105px;top:46px;display:block;width:265px;color:#c3c3c3;font-size:13px;line-height:18px;transform:scaleX(.94);transform-origin:left top;translate:2px 1px;scale:1.07 1}
    .p021-strategy:nth-child(2) span{top:2px;line-height:20px}.p021-strategy:nth-child(2) small{top:49px}
    .p021-strategy:nth-child(3) span{top:5px}.p021-strategy:nth-child(3) small{top:51px}
  `,
  body: `
    ${header('P021', '归纳与演绎-如何使用归纳演绎', 1222)}
    ${el('p021-intro', 41.5, 97.5, 1131, 65, `<div class="intro-label" ${attrs('p021-intro-label',true)}>案例背景</div><div class="intro-copy" ${attrs('p021-intro-copy',true)}><span>一家连锁咖啡品牌华东区50家门店，过去一个月，区域内所有门店的下午2点至4点时段（下午茶时段）销售额环比下降了</span><span>12%，用归纳与演绎推理找出原因并制定对策。</span></div>`, 'intro-band p021-intro')}
    ${el('p021-head', 41.5, 175.5, 1068, 74, `<div ${attrs('p021-head-1',true)}>用归纳法发现问题规律</div><div ${attrs('p021-head-2',true)}>用演绎法验证并推导对策</div><div ${attrs('p021-head-3',true)}>闭环输出对策</div>`, 'p021-stage-head')}
    ${el('p021-arrow', 41.5, 249.5, 1131, 95, `<div ${attrs('p021-stage-1',true)}>第1阶段</div><div ${attrs('p021-stage-2',true)}>第2阶段</div><div ${attrs('p021-stage-3',true)}>第3阶段</div>`, 'p021-arrow')}
    ${el('p021-connector-1', 363, 382, 49, 14, '<svg viewBox="0 0 49 14"><path d="M1 7H43" fill="none" stroke="#b1b1b1" stroke-width="1" stroke-dasharray="5 4"/><path d="M42 2L48 7L42 12" fill="none" stroke="#b1b1b1" stroke-width="1.2"/></svg>')}
    ${el('p021-connector-2', 729, 382, 49, 14, '<svg viewBox="0 0 49 14"><path d="M1 7H43" fill="none" stroke="#b1b1b1" stroke-width="1" stroke-dasharray="5 4"/><path d="M42 2L48 7L42 12" fill="none" stroke="#b1b1b1" stroke-width="1.2"/></svg>')}
    ${el('p021-columns', 42, 345, 1131, 313, `<div class="p021-track"><div class="p021-step"><span class="num">01</span><b ${attrs('p021-step-1-title',true)}>收集数据，观察现象</b><small ${attrs('p021-step-1-copy',true)}>从50家门店中抽取12家代表性门店<br>，收集下午茶时段销售额变化、客<br>单价变化、客流量变化、周边竞品<br>数量等数据。</small></div><div class="p021-step"><span class="num">02</span><b ${attrs('p021-step-2-title',true)}>归纳规律，提炼假设</b><small ${attrs('p021-step-2-copy',true)}>对12家门店的数据进行交叉比对后，<br>归纳出：客流减少而非消费力下降、<br>受影响程度与业态类型相关、竞品<br>增多导致客群分流等原因。</small></div></div><div class="p021-track"><div class="p021-step"><span class="num" style="background:${C.green700}">03</span><b ${attrs('p021-step-3-title',true)}>基于归纳假说，进行演绎推导</b><small ${attrs('p021-step-3-copy',true)}>将“竞品增多导致客群分流”作为大前<br>提，进行三段论演绎：大前提（一般性<br>规律）小前提（具体情境）演绎结<br>论（可验证预测）</small></div><div class="p021-step"><span class="num" style="background:${C.green900}">04</span><b ${attrs('p021-step-4-title',true)}>用实际数据验证演绎结论</b><small ${attrs('p021-step-4-copy',true)}>对12家门店进行“门店与最近竞品距<br>离”vs“销售额降幅”的交叉验证；验证<br>结果：距离越近、产品越相似的店，<br>降幅越大。演绎结论被证实。</small></div></div><div class="p021-strategies">${[['对策1','针对竞品密集区门店，推出“专属<br>下午茶套餐”，制造产品差异','基于演绎逻辑：<br>提高差异化→降低分流影响'],['对策2','开通企业微信专属下午茶预约通道，<br>锁定写字楼白领固定消费','基于归纳逻辑：<br>写字楼店降幅与竞品数量相关'],['对策3','三个月内对新开竞品门店周边3公<br>里做价格弹性测试，评估跟进策略','基于归纳+演绎：共同指向竞争主因']].map((s,i)=>`<div class="p021-strategy"><b ${attrs(`p021-strategy-${i}`,true)}>${s[0]}</b><span ${attrs(`p021-strategy-copy-${i}`,true)}>${s[1]}</span><small ${attrs(`p021-strategy-note-${i}`,true)}>${s[2]}</small></div>`).join('')}</div>`, 'p021-columns')}
  `,
});

add({
  id: 'p004-pyramid',
  title: '金字塔结构-分层思考',
  width: 399,
  height: 225,
  relativePath: '思维模型/06-其他模型/P004-金字塔结构-分层思考.html',
  css: greenSharedCss + `
    .slide:after{border-color:#fff #f8f8f8 #fbfbfb #fff}
    .slide:before{content:"";position:absolute;z-index:8;inset:0;pointer-events:none;background:linear-gradient(#d3d7d5,#d3d7d5) 114px 114px/48px 1px no-repeat,linear-gradient(#3caf78,#3caf78) 108px 115px/63px 1px no-repeat,linear-gradient(#dce6e1,#dce6e1) 90px 146px/10px 1px no-repeat,linear-gradient(#afb8b4,#afb8b4) 100px 146px/79px 1px no-repeat,linear-gradient(#dce6e1,#dce6e1) 179px 146px/11px 1px no-repeat,linear-gradient(#529b79,#529b79) 88px 147px/8px 1px no-repeat,linear-gradient(#468e6b,#468e6b) 96px 147px/80px 1px no-repeat,linear-gradient(#529b79,#529b79) 176px 147px/15px 1px no-repeat,linear-gradient(#9ab6a8,#9ab6a8) 68px 179px/12px 1px no-repeat,linear-gradient(#668375,#668375) 80px 179px/118px 1px no-repeat,linear-gradient(#9ab6a8,#9ab6a8) 198px 179px/13px 1px no-repeat,linear-gradient(#2b674a,#2b674a) 52px 205px/175px 1px no-repeat}
    .page-header{left:14px!important;top:9px!important;width:369px!important;height:18px!important;--code-width:25px!important}
    .page-header .header-code{font-size:7px!important;border-radius:0!important}
    .page-header .header-code span{font-family:"Notale CJK",sans-serif;font-size:9px;font-weight:400}
    .page-header .header-title{padding-left:4px!important;font-family:"Notale CJK",sans-serif!important;font-size:12px!important;font-weight:700!important;color:#1f5d40!important;transform:translateY(-2px)!important;transform-origin:left center!important}
    .page-header .header-rule{left:27px!important;bottom:-1px!important;height:2px!important;background:
      linear-gradient(90deg,#5e8b75 0 1px,#8bab9c 1px 129px,#95b3a5 129px 130px,#9bb7aa 130px 168px,#a8c0b4 168px 169px,#acc3b7 169px 206px,#adc4b8 206px 207px,#bbcdc5 207px 208px,#bccec6 208px 245px,#c8d7cf 245px 246px,#cddbd4 246px 100%) top/100% 1px no-repeat,
      linear-gradient(90deg,#d8e3de 0 129px,#dbe4e0 129px 130px,#dee6e2 130px 168px,#e1e9e5 168px 169px,#e3eae7 169px 206px,#e3ebe7 206px 207px,#e8edea 207px 208px,#e9eeec 208px 245px,#ecf1ef 245px 246px,#eef2f0 246px 100%) bottom/100% 1px no-repeat!important}
    .p004-intro{background:#fff!important}
    .p004-intro .intro-label{font-family:"Notale CJK",sans-serif!important;font-size:7.5px!important;font-weight:700!important;color:#404440!important;transform:translateY(-1px)}
    .p004-intro .intro-copy{display:block!important;padding:2px 9px 0 5px!important;font-family:"Notale CJK",sans-serif;font-size:5.5px!important;font-weight:400!important;letter-spacing:.4px!important;line-height:9px!important;color:#b0b0b0!important;transform:translateY(1px)!important}
    .p004-tier{z-index:2;display:grid;place-items:center;color:#eee;font-family:"Notale CJK",sans-serif;font-size:7.5px;font-weight:700}
    .p004-tier>span{display:inline-block;white-space:nowrap;font-family:"Notale Droid",sans-serif;font-size:7.5px;font-weight:700;transform:translate(-1px,-1px) scaleX(1.1)}
    .p004-shadow{z-index:1}
    [data-element-id^="p004-num-"]{font-family:"Notale CJK",sans-serif;font-size:15.5px!important;font-weight:700;transform:translateY(-2px)}
    .p004-copy{background:#f2f2f2;font-size:5.75px;color:#707070;align-items:flex-start}
    [data-element-id="p004-copy-1"]{color:#808080}
    [data-element-id="p004-copy-1"],[data-element-id="p004-copy-3"]{font-family:"Notale CJK",sans-serif;line-height:9px}
    [data-element-id="p004-copy-2"]{font-family:"Notale Zen Hei",sans-serif;line-height:8px}
    [data-element-id="p004-copy-4"]{font-family:"Notale Zen Hei",sans-serif;line-height:8.5px}
  `,
  body: `
    ${header('P004', '金字塔结构-分层思考', 399, true)}
    ${el('p004-intro', 14, 32, 367, 21, `<div class="intro-label" ${attrs('p004-intro-label',true)}>模型介绍</div><div class="intro-copy" ${attrs('p004-intro-copy',true)}>金字塔原则（The Pyramid Principle）由麦肯锡顾问芭芭拉·明托（Barbara Minto）提出，是一种结构化、自上而下的沟通与思考方法。</div>`, 'intro-band p004-intro', 'grid-template-columns:45px 1fr;font-size:6px;')}
    ${text('p004-num-1',20,77,24,30,'01','heavy',`font-size:14px;color:${C.green900};`)}
    ${el('p004-tier-1',114,69,51,39,'<span>结论</span>','p004-tier','background:#6bdea7;clip-path:polygon(50% 0,100% 100%,0 100%);padding-top:14px;')}
    ${el('p004-shadow-1',116,109,49,5,'','p004-shadow','background:#d9d9d9;clip-path:polygon(10% 0,100% 0,86% 100%,0 100%);')}
    ${text('p004-copy-1',141,68,240,33,'动笔或开口前，先问自己：“我希望对方最终记住的唯一一句话是什么？”<br>把这句话提炼出来，作为你的核心观点。这是整个结构的灵魂，必须清晰、有力。','p004-copy','padding:7px 5px 2px 28px;')}
    ${text('p004-num-2',20,111,24,30,'02','heavy',`font-size:14px;color:${C.green900};`)}
    ${el('p004-tier-2',94,116,91,24,'<span>支撑论点</span>','p004-tier','background:#26aa6b;clip-path:polygon(16% 0,84% 0,100% 100%,0 100%);')}
    ${el('p004-shadow-2',99,141,85,5,'','p004-shadow','background:#bfbfbf;clip-path:polygon(7% 0,100% 0,94% 100%,0 100%);')}
    ${text('p004-copy-2',162,103,219,32,'接着：“为了支撑这个核心结论，需要几个关键论点、论据或证据？”——列出3到5个分论点。','p004-copy','padding:8px 5px 2px 27px;')}
    ${text('p004-num-3',20,145,24,30,'03','heavy',`font-size:14px;color:${C.green900};`)}
    ${el('p004-tier-3',74,148,131,24,'<span>层层向下分解</span>','p004-tier','background:#1d7f50;clip-path:polygon(11% 0,89% 0,100% 100%,0 100%);')}
    ${el('p004-shadow-3',81,174,123,5,'','p004-shadow','background:#a6a6a6;clip-path:polygon(4% 0,100% 0,95% 100%,0 100%);')}
    ${text('p004-copy-3',182,138,199,32,'针对第二层的每一个论点，继续追问：“这个论点凭什么？有何证据可以支撑？”','p004-copy','padding:7px 5px 2px 30px;')}
    ${text('p004-num-4',20,179,24,30,'04','heavy',`font-size:14px;color:${C.green900};`)}
    ${el('p004-tier-4',53,180,173,25,'<span>检查逻辑链条验证结构</span>','p004-tier','background:#135535;clip-path:polygon(9% 0,91% 0,100% 100%,0 100%);')}
    ${text('p004-copy-4',201,173,180,32,'最底层的事实是否足以支撑上一层？上一层是否有逻辑<br>？再上一层的结论与这一层的论据是否严谨，最后判断<br>或调整。','p004-copy','padding:4px 4px 2px 28px;')}
  `,
});

const p023Path = '思维模型/06-其他模型/P023-第一性原理-三步重构.html';
const p023StructuralEdgeStrips = [
  ...[54, 55].map((row) => ({ row, start: 27, end: 790 })),
  ...[105, 106].flatMap((row) => [
    [27, 55], [101, 195], [277, 410], [492, 627], [708, 790],
  ].map(([start, end]) => ({ row, start, end }))),
  ...[155, 190, 191, 194, 195, 255, 256, 260, 261, 320, 321].map((row) => ({ row, start: 27, end: 785 })),
  ...[326, 327, 433, 434].map((row) => ({ row, start: 27, end: 785 })),
  ...[26, 27, 28, 129, 130, 131, 334, 335, 336, 575, 576, 577, 783, 784, 785].map((column) => ({ column, start: 150, end: 323 })),
  ...[26, 27, 28, 783, 784, 785].map((column) => ({ column, start: 325, end: 435 })),
  ...[26, 27, 28, 33, 34, 83, 84, 85, 789, 790].map((column) => ({ column, start: 18, end: 56 })),
];
const p023CircleEdgeStrips = (() => {
  const strips = [];
  for (const [left, right] of [[195, 277], [410, 492], [627, 708]]) {
    for (const row of [...Array.from({ length: 16 }, (_, i) => i + 65), ...Array.from({ length: 16 }, (_, i) => i + 131)]) {
      strips.push({ row, start: left, end: right });
    }
    for (const column of [...Array.from({ length: 16 }, (_, i) => i + left), ...Array.from({ length: 17 }, (_, i) => i + right - 17)]) {
      strips.push({ column, start: 65, end: 147 });
    }
  }
  for (const row of [...Array.from({ length: 12 }, (_, i) => i + 84), ...Array.from({ length: 13 }, (_, i) => i + 115)]) {
    strips.push({ row, start: 55, end: 101 });
  }
  for (const column of [...Array.from({ length: 14 }, (_, i) => i + 55), ...Array.from({ length: 15 }, (_, i) => i + 86)]) {
    strips.push({ column, start: 84, end: 128 });
  }
  return strips;
})();

add({
  id: 'p023-first-principles',
  title: '第一性原理-核心逻辑',
  width: 818,
  height: 460,
  relativePath: p023Path,
  css: greenSharedCss + `
    .slide:before{content:"";position:absolute;z-index:8;inset:0;pointer-events:none;background:${nativeEdgeStripBackground(p023Path, p023StructuralEdgeStrips)}}
    .slide:after{border:0!important;background:${nativeEdgeStripBackground(p023Path, [
      { row: 0, start: 0, end: 818 }, { row: 459, start: 0, end: 818 },
      { column: 0, start: 0, end: 460 }, { column: 817, start: 0, end: 460 },
    ])}!important}
    .p023-extra-edges{position:absolute;z-index:20;inset:0;pointer-events:none;background:${nativeEdgeStripBackground(p023Path, p023CircleEdgeStrips)}}
    .page-header .header-code{border-radius:4px 4px 0 0!important;font-size:17px!important;transform:translateX(1px)}
    .page-header .header-code{translate:1px 2px}
    .page-header .header-code span{font-family:"WenQuanYi Zen Hei",sans-serif;font-weight:400;letter-spacing:0}
    .page-header .header-title{font-family:"Notale Droid",sans-serif;font-size:26px!important;font-weight:400;letter-spacing:-.8px;transform:translateY(-1px) scale(.95,.94)!important;transform-origin:left center!important;translate:0 1px}
    .page-header .header-rule{left:57px!important;right:0!important;bottom:-1px!important;height:1px!important;background:#135535!important;opacity:.78;transform:rotate(.12deg);transform-origin:left center}
    .p023-brand{font-family:"Notale CJK",sans-serif;justify-content:flex-end;color:#303531;font-size:13px;line-height:1;white-space:nowrap}
    .p023-brand-sub{font-family:Arial,sans-serif;justify-content:flex-end;color:#babfbc;font-size:10px;line-height:1;white-space:nowrap}
    .p023-timeline{border-top:1px dashed #9da3a0}
    .p023-step{display:grid;place-items:center;border:0;border-radius:50%;background:${C.green600};color:#fff;font-size:18px;font-weight:800;line-height:1;box-shadow:0 0 0 5px #fff;outline:1px dashed #9ca39f;outline-offset:5px}
    .p023-step:not(.p023-start){width:66px!important;height:66px!important;translate:-1px -1px;outline:0}
    .p023-step:not(.p023-start)>span{display:block;transform:translate(-1px,-1px) scaleX(.96)}
    .p023-step:not(.p023-start):before{content:"";position:absolute;inset:-5px;border:1px dashed #999;border-radius:50%;transform:rotate(9deg);pointer-events:none}
    .p023-start{font-size:11px;box-shadow:0 0 0 3px #fff;outline-offset:3px}
    .p023-start{width:31px!important;height:31px!important;translate:0 -1px!important}
    .p023-table{display:grid;grid-template-columns:104px 205px 241px 208px;grid-template-rows:34px 59px 60px;row-gap:6px;background:#fff;font-size:14px;line-height:1.6;text-align:center}
    .p023-table:before{content:"";position:absolute;z-index:0;left:0;right:0;top:0;height:34px;background:linear-gradient(90deg,#27aa6b 0%,#25a76a 17%,#239c62 41%,#208e59 64%,#1d7f50 100%)}
    .p023-table>div{position:relative;z-index:1;display:grid;place-items:center;padding:4px 7px;border-right:1px dashed #bbb;background:#f2f2f2}
    .p023-table>div:not(.head):not(.row){font-family:"Notale CJK",sans-serif;font-size:13.5px;line-height:1.5;color:#333}
    .p023-table>div:not(.head):not(.row)>span{display:block;transform-origin:center center}
    [data-element-id="p023-action-0"]>span{transform:translateX(7px) scaleX(.98);translate:-1px 0;scale:.98 1}
    [data-element-id="p023-action-1"]>span{transform:translateX(-6px) scaleX(1.02);translate:0 0;scale:.98 1}
    [data-element-id="p023-action-2"]>span{font-size:14px;transform:translateX(-10px) scaleX(.9);translate:-3px 0;scale:1.08 1}
    [data-element-id="p023-question-0"]>span{transform:scaleX(1.02);translate:0 0;scale:.99 1}
    [data-element-id="p023-question-1"]>span{transform:translateX(-2px);translate:0 0;scale:1.01 1}
    [data-element-id="p023-question-2"]>span{transform:translateX(-9px) scaleX(.9);translate:-2px 0;scale:1.04 1}
    .p023-table .head{background:transparent;color:#fff;font-size:17px;font-weight:700;line-height:1}
    .p023-table .head:not(.row)>span{display:block;transform:translate(-4px,-1px);scale:.9 1}
    .p023-table .row{color:${C.green600};font-weight:700}
    .p023-table .row>span{display:block;transform:translate(-1px,0);scale:1.02 1}
    .p023-table .head.row{background:transparent}
    .p023-table .head.row .row-pill{display:grid;width:88px;height:26px;place-items:center;border-radius:999px;background:#fff;color:${C.green600};font-size:14px;box-shadow:0 1px 4px rgba(24,78,52,.15)}
    .p023-table .row:not(.head){align-self:center;justify-self:center;width:88px;height:30px;padding:0;border:0;border-radius:999px;background:${C.green600};color:#fff;font-size:14px;line-height:1}
    .p023-fit{display:grid;grid-template-columns:77px 269px 75px 266px 71px;color:#fff;background:linear-gradient(90deg,${C.green600} 0 421px,${C.green700} 421px 100%)}
    .p023-fit .rail{display:grid;place-items:center;border-radius:0 50% 50% 0;background:${C.green400};font-size:18px;font-weight:700;line-height:1.45}
    .p023-fit .rail>span{display:block;transform:translate(-3px,-3px)}
    .p023-fit .rail.last{border-radius:50% 0 0 50%;background:${C.green600}}
    .p023-fit .rail.last{font-size:17px}
    .p023-fit .rail.last>span{transform:translate(2px,-2px)}
    .p023-fit .copy{padding:12px 22px;background:${C.green600};color:#e2f1ea;font-family:"WenQuanYi Zen Hei",sans-serif;font-size:14px;font-weight:400;line-height:1.95;white-space:nowrap}
    .p023-fit>.copy:nth-child(2)>span{display:block;transform:translate(-1px,-1px);scale:.98 1}
    .p023-fit>.copy:nth-child(4){padding-left:26px;background:${C.green700}}
    .p023-fit>.copy:nth-child(4)>span{display:block;transform:translate(-3px,0);scale:.96 1}
    .p023-fit .cut{position:relative;background:${C.green700};overflow:hidden}
    .p023-fit .cut:before{content:"";position:absolute;inset:0;background:${C.green600};clip-path:polygon(0 0,81.34% 0,0 100%)}
    .p023-fit .cut:after{content:"";position:absolute;inset:0;background:#fff;clip-path:polygon(81.34% 0,100% 0,17.34% 100%,0 100%)}
  `,
  body: `
    ${header('P023', '第一性原理-核心逻辑', 818, true)}
    <div class="p023-extra-edges" aria-hidden="true"></div>
    ${text('p023-brand', 651, 16, 137, 18, '© 意象思维模型系列', 'p023-brand')}
    ${text('p023-brand-sub', 682, 35, 106, 14, 'BY IDEAGRAPH PPT', 'p023-brand-sub')}
    ${el('p023-line', 32, 105, 752, 1, '', 'p023-timeline')}
    ${el('p023-start', 62, 91, 31, 30, '<span>▶</span>', 'p023-step p023-start')}
    ${[['第1步',204],['第2步',419],['第3步',636]].map((s,i)=>el(`p023-step-${i}`,s[1],74,64,64,`<span>${s[0]}</span>`,'p023-step',`background:${i===0?C.green600:C.green700};`)).join('')}
    ${el('p023-table', 27, 156, 758, 165, `<div class="head row"><span class="row-pill">步骤</span></div><div class="head" ${attrs('p023-head-1',true)}><span>质疑假设</span></div><div class="head" ${attrs('p023-head-2',true)}><span>拆解到基本真理</span></div><div class="head" ${attrs('p023-head-3',true)}><span>重构方案</span></div><div class="row"><span>核心动作</span></div>${['找出行业内“理所当<br>然”的共识','将问题拆到物理/数学/经济学等<br>不可再分的底层事实','基于底层真理，重新设<br>计路径'].map((v,i)=>`<div ${attrs(`p023-action-${i}`,true)}><span>${v}</span></div>`).join('')}<div class="row"><span>关键问题</span></div>${['“这个做法真的必须这样吗？<br>还是只是因为大家都这样？”','“这件事最根本的要素是什么？<br>哪些是事实，哪些是人为约束？”','“如果没有任何限制，这件事<br>应该怎么做？”'].map((v,i)=>`<div ${attrs(`p023-question-${i}`,true)}><span>${v}</span></div>`).join('')}`, 'p023-table')}
    ${el('p023-fit', 27, 328, 758, 106, `<div class="rail" ${attrs('p023-fit-label',true)}><span>适<br>用</span></div><div class="copy" ${attrs('p023-fit-copy',true)}><span>颠覆式创新、新产品研发<br>成本结构重构、商业模式变革<br>面对长期未变的行业惯例时</span></div><div class="cut"></div><div class="copy" ${attrs('p023-unfit-copy',true)}><span>日常例行决策、短期战术调整<br>已有成熟标准且变动成本极高的情况<br>需快速响应、没时间深入思考的场景</span></div><div class="rail last" ${attrs('p023-unfit-label',true)}><span>不<br>适<br>用</span></div>`, 'p023-fit')}
  `,
});

function photoHeader(code, title) {
  return el('header', 16, 15, 1120, 61, `
    <div class="photo-header-code" ${attrs('header-code', true)}>${esc(code)}</div>
    <div class="photo-header-title" ${attrs('header-title', true)}>${esc(title)}</div>
    <div class="photo-header-rule"></div>
  `, 'photo-page-header');
}

const photoSharedCss = `
  .slide:after{content:"";position:absolute;z-index:99;inset:0;pointer-events:none;border-style:solid;border-width:1px;border-color:#b9bdc0 #879195 #8297b5 #7f8b93}
  .photo-page-header{display:flex;align-items:flex-start;color:${C.navy};font-weight:800;letter-spacing:-.03em}
  .photo-header-code{flex:0 0 119px;width:119px;height:55px;display:flex;align-items:center;transform:translateY(-5px);font-size:43px;white-space:nowrap}
  .photo-header-title{height:55px;display:flex;align-items:center;transform:translateY(-5px);padding-left:18px;font-size:38px;white-space:nowrap}
  .photo-header-rule{position:absolute;left:-16px;right:0;bottom:-3px;height:2px;background:#c8ced1}
  .photo-header-rule:before{content:"";position:absolute;left:0;top:-5px;width:47px;height:4px;background:${C.navy}}
  .photo-frame{border:0;box-shadow:none}
  .navy-title{color:${C.navy};font-weight:800}
  .rust-title{color:${C.rust};font-weight:800}
  .body-copy{font-size:16px;line-height:1.65;color:#171b19}
  .line-icon{display:grid;place-items:center;border-radius:50%;background:${C.rust};color:#fff;font-weight:700}
`;

add({
  id: 'e1-01-brand-belief',
  title: '一图排版：企业宣传',
  width: 1152,
  height: 648,
  relativePath: '图片排版/01-一图/E1-01-一图排版-企业宣传.html',
  css: photoSharedCss + `
    .slide:before{content:"";position:absolute;z-index:100;left:0;right:0;top:519px;bottom:0;pointer-events:none;border-left:1px solid #778faf;border-right:1px solid #7b90ad}
    .e101-metrics{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:22px 38px}
    .e101-metric{display:grid;grid-template-columns:67px 1fr;align-items:center;color:${C.rust}}
    .e101-metric>div{transform:translateY(-3px)}
    .e101-icon{display:grid;width:54px;height:54px;place-items:center;border-radius:50%;background:${C.rust};color:#fff;box-shadow:0 3px 10px rgba(157,55,41,.16)}
    .e101-icon svg{width:35px;height:35px}
    .e101-value{font-size:48px;font-weight:800;line-height:.9}.e101-value small{font-size:24px}.e101-label{font-size:20px;color:#73382f}
  `,
  crops: [
    { asset: 'E1-01-一图排版-企业宣传.assets/photo-01.png', x: 618, y: 121, w: 477, h: 474 },
  ],
  body: `
    ${photoHeader('E1-01', '一图排版：企业宣传')}
    ${text('e101-title', 55, 115, 504, 54, '相信“品牌信仰”的力量', 'navy-title', 'font-size:31px;')}
    ${text('e101-copy', 56, 164, 530, 111, '制造业是“产品力×品牌力×客户连接力”的综合较量，推行分阶段入职培训，开发“平台规则+话术模拟+案例库”线上培训体系，市场部是这场较量的“先锋部队”。', 'body-copy', 'font-size:18px;line-height:1.7;')}
    ${el('e101-metrics', 51, 310, 411, 186, `<div class="e101-metric"><span class="e101-icon"><svg viewBox="0 0 54 54" aria-hidden="true"><circle cx="27" cy="27" r="15" fill="none" stroke="white" stroke-width="2.2"/><circle cx="27" cy="27" r="11" fill="none" stroke="white" stroke-width="1.4"/><path d="M21 22h12v11H21zM23 19h8v3h-8zm2 6h4v5h-4z" fill="white"/></svg></span><div><div class="e101-value" ${attrs('e101-value-1',true)}>30<small>%</small></div><div class="e101-label" ${attrs('e101-label-1',true)}>招聘效率</div></div></div><div class="e101-metric"><span class="e101-icon"><svg viewBox="0 0 54 54" aria-hidden="true"><path d="M14 15h26v5H14zm3 7h20v14H17zm-2 14h24v3H15zm6 3h12v3H21z" fill="white"/><path d="M21 25h12M21 29h12" stroke="${C.rust}" stroke-width="1.5"/></svg></span><div><div class="e101-value" ${attrs('e101-value-2',true)}>45<small>%</small></div><div class="e101-label" ${attrs('e101-label-2',true)}>培训人数</div></div></div><div class="e101-metric"><span class="e101-icon"><svg viewBox="0 0 54 54" aria-hidden="true"><path d="M14 37h6V27h-6zm8 0h6V22h-6zm8 0h6V17h-6zm8 0h4V12h-4z" fill="white"/><path d="M14 23l8-6 7 2 12-10" fill="none" stroke="white" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="14" cy="23" r="2" fill="white"/><circle cx="22" cy="17" r="2" fill="white"/><circle cx="29" cy="19" r="2" fill="white"/></svg></span><div><div class="e101-value" ${attrs('e101-value-3',true)}>40<small>%</small></div><div class="e101-label" ${attrs('e101-label-3',true)}>品牌效应</div></div></div><div class="e101-metric"><span class="e101-icon"><svg viewBox="0 0 54 54" aria-hidden="true"><g fill="none" stroke="white" stroke-width="2"><ellipse cx="24" cy="17" rx="12" ry="4"/><path d="M12 17v5c0 2 5 4 12 4s12-2 12-4v-5M12 23v5c0 2 5 4 12 4 3 0 5-.3 7-1M12 29v5c0 2 5 4 12 4 2 0 4-.2 6-.7"/></g><circle cx="37" cy="34" r="8" fill="white"/><path d="M37 30v8m-4-4h8" stroke="${C.rust}" stroke-width="2"/></svg></span><div><div class="e101-value" ${attrs('e101-value-4',true)}>51<small>%</small></div><div class="e101-label" ${attrs('e101-label-4',true)}>市场价值</div></div></div>`, 'e101-metrics')}
    ${el('e101-band', 0, 519, 1152, 129, '', '', `background:linear-gradient(90deg,${C.navy} 0%,${C.navy} 24%,#426795 100%);`)}
    ${text('e101-band-text', 58, 535, 500, 74, 'BRAND BELIEF', 'heavy', 'font-size:49px;color:rgba(255,255,255,.16);letter-spacing:.08em;')}
    ${photo('e101-photo', 'E1-01-一图排版-企业宣传.assets/photo-01.png', 618, 121, 477, 474, 'photo-frame')}
    ${el('e101-photo-line', 981, 558, 75, 5, '', '', 'background:#fff;')}
  `,
});

const e102Path = '图片排版/01-一图/E1-02-一图排版-工作回顾.html';
const e102EdgeStrips = (() => {
  const strips = [];
  const addArea = (x1, y1, x2, y2, exclusions = []) => {
    for (let row = y1; row < y2; row += 1) {
      let segments = [[x1, x2]];
      for (const [x, y, width, height] of exclusions) {
        if (row < y || row >= y + height) continue;
        const next = [];
        for (const [start, end] of segments) {
          if (x >= end || x + width <= start) {
            next.push([start, end]);
            continue;
          }
          if (start < x) next.push([start, x]);
          if (x + width < end) next.push([x + width, end]);
        }
        segments = next;
      }
      for (const [start, end] of segments) {
        if (end > start) strips.push({ row, start, end });
      }
    }
  };

  for (let row = 69; row <= 80; row += 1) strips.push({ row, start: 0, end: 720 });
  const tops = [102, 235, 367, 500];
  const titleWidths = [330, 325, 370, 250];
  const firstLineWidths = [400, 420, 430, 430];
  const secondLineWidths = [390, 330, 430, 420];
  tops.forEach((top, index) => {
    addArea(20, top - 5, 535, Math.min(648, top + 120), [
      [108, top + 13, titleWidths[index], 35],
      [108, top + 48, firstLineWidths[index], 27],
      [108, top + 75, secondLineWidths[index], 28],
    ]);
    for (let row = top + 17; row < top + 46; row += 1) {
      strips.push({ row, start: 108, end: 108 + titleWidths[index] });
    }
    for (let row = top + 51; row < top + 75; row += 1) {
      strips.push({ row, start: 108, end: 108 + firstLineWidths[index] });
    }
    for (let row = top + 78; row < top + 103; row += 1) {
      strips.push({ row, start: 108, end: 108 + secondLineWidths[index] });
    }
  });
  return strips;
})();

add({
  id: 'e1-02-review',
  title: '一图排版：工作回顾',
  width: 1152,
  height: 648,
  relativePath: e102Path,
  css: photoSharedCss + `
    .slide:before{content:"";position:absolute;z-index:20;inset:0;pointer-events:none;background:${nativeEdgeStripBackground(e102Path, e102EdgeStrips)}}
    .slide:after{border:0!important;background:${nativeEdgeStripBackground(e102Path, [
      { row: 0, start: 0, end: 1152 }, { row: 647, start: 0, end: 1152 },
      { column: 0, start: 0, end: 648 }, { column: 1151, start: 0, end: 648 },
    ])}!important}
    [data-element-id="e102-photo"]{clip-path:none!important}
    [data-element-id="e102-fold"],[data-element-id="e102-peel"]{display:none}
    html[data-edit-mode="true"] .slide:before{display:none}
    html[data-edit-mode="true"] [data-element-id="e102-photo"]{clip-path:path('M0 0 H617 V567 H267 C220 485 180 411 139 338 C94 256 46 174 0 112 C69 110 69 21 0 0 Z')!important}
    html[data-edit-mode="true"] [data-element-id="e102-fold"],html[data-edit-mode="true"] [data-element-id="e102-peel"]{display:block}
    .photo-header-title{font-size:39px;transform:translate(-3px,-5px);transform-origin:left center}
    .e102-list{display:grid;grid-template-rows:repeat(4,minmax(0,1fr));gap:15px}
    .e102-item{display:grid;grid-template-columns:65px 1fr;min-height:0;background:rgba(247,248,249,.94)}
    .e102-icon{display:grid;place-items:center;background:#cf8177;color:#fff;font-size:23px}
    .e102-item:nth-child(even) .e102-icon{background:#e1aaa3}
    .e102-icon svg{display:block;width:28px;height:28px}
    .e102-copy{min-width:0;padding:10px 8px 8px 29px;font-size:14px;line-height:1.65}.e102-copy b{display:block;margin-bottom:3px;color:${C.navy};font-size:18px;line-height:1.65;transform:translateY(1px) scaleX(1.06);transform-origin:left center}.e102-copy>span{display:block;white-space:nowrap;font-size:15px;transform:translateY(1px) scaleX(.92);transform-origin:left top}
    .e102-meta{display:flex;align-items:center;justify-content:flex-end;gap:18px;color:#111;font-size:17px;font-weight:400;letter-spacing:0;white-space:nowrap}.e102-meta span{display:flex;align-items:center;gap:6px}.e102-meta i{display:grid;width:21px;height:21px;place-items:center;border:1.6px solid #111;font-family:Arial,sans-serif;font-size:21px;font-style:normal;line-height:1}.e102-credit{justify-content:flex-end;color:#777;font-size:13px;letter-spacing:0;white-space:nowrap}
    .e102-peel{background:#fff;clip-path:path('M0 0 H174 C236 0 241 88 176 101 C125 111 91 124 105 155 L443 567 H0 Z');filter:drop-shadow(10px 0 13px rgba(48,68,82,.16))}
    .e102-fold{background:linear-gradient(112deg,rgba(255,255,255,.98) 0 12%,rgba(225,232,237,.88) 44%,rgba(185,201,212,.72) 100%);clip-path:polygon(0 4%,36% 0,100% 100%,68% 92%);filter:drop-shadow(7px 2px 9px rgba(48,68,82,.12))}
  `,
  crops: [
    { asset: 'E1-02-一图排版-工作回顾.assets/photo-01.png', x: 535, y: 81, w: 617, h: 567 },
  ],
  body: `
    ${photoHeader('E1-02', '一图排版：工作回顾')}
    ${el('e102-meta', 758, 25, 364, 25, '<span><i>✓</i>全部可编辑</span><span><i>✓</i>一键换色</span><span><i>✓</i>高效省事</span>', 'e102-meta')}
    ${text('e102-credit', 1017, 55, 103, 20, '@月升ppt', 'e102-credit')}
    ${photo('e102-photo', 'E1-02-一图排版-工作回顾.assets/photo-01.png', 535, 81, 617, 567, '', "clip-path:path('M0 0 H617 V567 H267 C220 485 180 411 139 338 C94 256 46 174 0 112 C69 110 69 21 0 0 Z');", 'object-position:center;')}
    ${el('e102-fold', 445, 176, 358, 472, '', 'e102-fold')}
    ${el('e102-peel', 360, 81, 443, 567, '', 'e102-peel')}
    ${el('e102-list', 26, 102, 506, 515, `
      ${[
        ['<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="4" y="6" width="24" height="20" rx="2" fill="currentColor"/><circle cx="12" cy="14" r="3" fill="#cf8177"/><path d="M8 21c1-4 7-4 8 0M18 12h7M18 16h7M18 20h5" fill="none" stroke="#cf8177" stroke-width="1.6"/></svg>','招聘体系优化与关键岗位补位','牵头修订《公司招聘流程规范》，简化初试环节；<br>• 设计“定向挖猎+内部推荐激励”组合策略'],
        ['<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="4" y="7" width="24" height="21" rx="2" fill="currentColor"/><path d="M4 12h24M9 4v6M23 4v6" stroke="#e1aaa3" stroke-width="2"/><circle cx="16" cy="20" r="4" fill="none" stroke="#e1aaa3" stroke-width="1.5"/><path d="M16 17v3l2 1" stroke="#e1aaa3" stroke-width="1.5" fill="none"/></svg>','员工培训体系搭建与落地','调研各部门培训需求，制定《2024年度培训计划》；<br>• 开发“线上培训平台”，上传课程视频32个'],
        ['<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6 5h18a3 3 0 0 1 3 3v19H9a3 3 0 0 1-3-3z" fill="currentColor"/><path d="M9 9h14M9 13h14M9 17h10M9 23h14" stroke="#cf8177" stroke-width="1.5"/></svg>','薪酬结构调整与员工激励优化','将固定薪资占比从60%降至40%，绩效奖金双指标挂钩；<br>• 每季度评选5名优秀员工，奖励现金5000元+荣誉奖杯'],
        ['<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="10" r="5" fill="currentColor"/><path d="M8 27c0-7 3-11 8-11s8 4 8 11z" fill="currentColor"/><circle cx="16" cy="23" r="3" fill="none" stroke="#e1aaa3" stroke-width="1.5"/></svg>','企业文化活动策划','策划“2024年度企业文化季”系列活动，包括夏季员工家庭日；<br>• 组建兴趣社团3个，每周组织活动1次，HR负责场地协调与物料支持。'],
      ].map((item,i)=>`<div class="e102-item"><div class="e102-icon">${item[0]}</div><div class="e102-copy"><b ${attrs(`e102-title-${i}`,true)}>${item[1]}</b><span ${attrs(`e102-copy-${i}`,true)}>• ${item[2]}</span></div></div>`).join('')}
    `, 'e102-list')}
  `,
});

const a110Path = '图片排版/02-二图/A1-10-二图排版-部门概况.html';
const a110EdgeStrips = (() => {
  const strips = [];
  for (const row of [0, 77, 78, 647]) strips.push({ row, start: 0, end: 1152 });
  for (const column of [0, 1151]) strips.push({ column, start: 0, end: 648 });
  for (const [row, start, end] of [
    [89, 21, 310], [90, 21, 310], [91, 21, 310],
    [357, 21, 597], [358, 21, 597], [359, 21, 597],
    [628, 308, 597], [629, 308, 597], [630, 308, 597],
  ]) strips.push({ row, start, end });
  for (const [column, start, end] of [
    [21, 89, 360], [22, 89, 360], [23, 89, 360], [307, 89, 360],
    [308, 89, 631], [309, 358, 631], [310, 358, 631],
    [594, 358, 631], [595, 358, 631], [596, 358, 631],
  ]) strips.push({ column, start, end });
  for (const [top, bottom] of [[198, 272], [284, 358], [371, 445], [457, 531], [543, 616]]) {
    for (let row = top - 2; row < top + 3; row += 1) strips.push({ row, start: 675, end: 1116 });
    for (let row = bottom - 3; row < Math.min(648, bottom + 9); row += 1) strips.push({ row, start: 675, end: 1116 });
  }
  for (const column of [
    ...Array.from({ length: 62 }, (_, i) => i + 620),
    ...Array.from({ length: 9 }, (_, i) => i + 824),
    ...Array.from({ length: 12 }, (_, i) => i + 1105),
  ]) strips.push({ column, start: 190, end: 624 });
  for (const row of [...Array.from({ length: 13 }, (_, i) => i + 110), ...Array.from({ length: 15 }, (_, i) => i + 141)]) {
    strips.push({ row, start: 620, end: 815 });
  }
  for (const column of [...Array.from({ length: 31 }, (_, i) => i + 620), ...Array.from({ length: 30 }, (_, i) => i + 785)]) {
    strips.push({ column, start: 110, end: 156 });
  }
  for (let row = 315; row < 325; row += 1) strips.push({ row, start: 342, end: 423 });
  for (let row = 593; row < 603; row += 1) strips.push({ row, start: 47, end: 128 });
  for (let row = 69; row < 81; row += 1) strips.push({ row, start: 0, end: 700 });
  return strips;
})();

add({
  id: 'a1-10-department',
  title: '部门介绍-部门概况',
  width: 1152,
  height: 648,
  relativePath: a110Path,
  css: photoSharedCss + `
    .slide:before{content:"";position:absolute;z-index:20;inset:0;pointer-events:none;background:${nativeEdgeStripBackground(a110Path, a110EdgeStrips)}}
    .slide:after{border:0!important;background:${nativeEdgeStripBackground(a110Path, [
      { row: 0, start: 0, end: 1152 }, { row: 647, start: 0, end: 1152 },
      { column: 0, start: 0, end: 648 }, { column: 1151, start: 0, end: 648 },
    ])}!important}
    .a110-org{display:grid;grid-template-rows:repeat(5,minmax(0,1fr));gap:12px}
    [data-element-id="header-code"]{font-family:"Notale Droid",sans-serif!important;font-size:43px!important;font-weight:800!important;transform:translateY(-5px)!important}
    [data-element-id="header-title"]{font-family:"Notale Droid",sans-serif!important;font-size:39px!important;font-weight:800!important;transform:translate(-1px,-4px) scaleY(.93)!important;transform-origin:left center!important}
    [data-element-id="a110-photo-label"]{font-family:"Notale Zen Hei",sans-serif!important;font-size:41px!important}
    [data-element-id="a110-left-title"]{display:block!important;width:270px!important;padding-top:9px;white-space:nowrap;transform:translate(1px,-2px)}
    [data-element-id="a110-left-title"] .l1,[data-element-id="a110-left-title"] .l2,[data-element-id="a110-center-title"] .l1,[data-element-id="a110-center-title"] .l2{display:inline-block;transform-origin:left center}
    [data-element-id="a110-left-title"] .l1{transform:scale(.856,.96)}[data-element-id="a110-left-title"] .l2{transform:scale(.855,.95)}
    [data-element-id="a110-left-copy"]{font-family:"Notale Droid",sans-serif!important;font-size:17px!important;line-height:30px!important;transform:translate(2px,-2px) scaleX(.98);transform-origin:left center}
    [data-element-id="a110-center-title"]{display:block!important;width:250px!important;padding-top:12px;font-size:22px!important;line-height:39px!important;white-space:nowrap;transform:translate(1px,-8px);transform-origin:left center}
    [data-element-id="a110-center-title"] .l1{transform:scaleX(.893)}[data-element-id="a110-center-title"] .l2{transform:scale(.936,.95)}
    [data-element-id="a110-center-copy"]{width:255px!important;font-size:17px!important;line-height:30.5px!important;white-space:nowrap;transform:translate(1px,-6px) scaleX(.98);transform-origin:left center}
    [data-element-id="a110-pill"]{display:flex!important;align-items:center;justify-content:center;text-align:center;font-family:"Notale Droid",sans-serif!important;font-size:19px!important;padding:0 8px 6px!important}
    [data-element-id="a110-total"]{transform:translateY(1px) scale(1.047,1.07);transform-origin:left center}
    [data-element-id="a110-org-line"]{left:628px!important;top:221px!important;width:27px!important;height:367px!important;border:1px solid #cbd2d8;border-radius:15px;background:linear-gradient(180deg,#d5e1ef 0%,#e3ebf5 52%,#f6f9f8 100%)!important}
    .a110-card{position:relative;min-height:0;display:grid;grid-template-columns:129px 1fr;align-items:center;padding:6px 9px 6px 18px;border:1px solid #d3d7d9;background:#fff;box-shadow:0 2px 7px rgba(26,46,63,.08);font-size:14px;line-height:1.45}
    .a110-card:nth-child(n+3){transform:translateY(1px)}
    .a110-card:before{content:"";position:absolute;left:-39px;top:50%;width:39px;border-top:1px solid ${C.navy}}
    .a110-card:after{content:"";position:absolute;left:-43px;top:calc(50% - 4px);width:8px;height:8px;border-radius:50%;background:${C.navy}}
    .a110-card b{display:block;color:${C.navy};font-size:19px;transform-origin:left center}.a110-card strong{display:inline-block;font-size:27px;color:${C.navy};transform-origin:left center}
    .a110-card>span{display:flex;min-width:0;min-height:48px;align-items:center;padding-left:8px;border-left:1px solid #d3d7d9}
    .a110-duty-text{display:inline-block;color:#111;font-style:normal;transform-origin:left center}
    .a110-card:nth-child(1) b{transform:translateY(-1px) scaleX(1.009)}.a110-card:nth-child(2) b{transform:translateY(-1px) scaleX(1.009)}.a110-card:nth-child(3) b{transform:translate(-1px,-3px) scaleX(1.022)}.a110-card:nth-child(4) b{transform:translate(-1px,-1px) scaleX(1.022)}.a110-card:nth-child(5) b{transform:translateY(-1px) scaleX(1.011)}
    .a110-card:nth-child(1) strong{transform:translate(1px,-4px) scaleX(.94)}.a110-card:nth-child(2) strong{transform:translate(1px,-3px) scaleX(.94)}.a110-card:nth-child(3) strong{transform:translateY(-4px) scaleX(.94)}.a110-card:nth-child(4) strong{transform:translateY(-4px) scaleX(.94)}.a110-card:nth-child(5) strong{transform:translate(1px,-4px) scaleX(.94)}
    .a110-card:nth-child(1) .a110-duty-text{transform:translateY(-4px) scale(1.063,1.07)}.a110-card:nth-child(2) .a110-duty-text{transform:translateY(-4px) scale(1.008,1.07)}.a110-card:nth-child(3) .a110-duty-text{transform:translateY(-5px) scale(.973,1.07)}.a110-card:nth-child(4) .a110-duty-text{transform:translateY(-4px) scale(1.032,1.07)}.a110-card:nth-child(5) .a110-duty-text{transform:translate(1px,-3px) scale(1.024,1.07)}
    [data-element-id="header-code"]{translate:-3px 0;scale:.94 1;letter-spacing:-.75px}
    [data-element-id="a110-photo-label"]{translate:0 -3px;scale:1.04 .98;font-weight:400;color:#f8f8f8}
    [data-element-id="a110-left-title"]{translate:0 -1px;scale:.96 1.02;font-weight:400}
    [data-element-id="a110-center-title"]{translate:2px -1px;scale:.98 1;font-weight:400}
    [data-element-id="a110-center-copy"]{scale:.94 1;font-size:16.5px!important;letter-spacing:.25px;color:#000}
    [data-element-id="a110-left-copy"]{color:#000}
    [data-element-id="a110-pill"]{scale:1 .98;font-size:19px!important;color:#f8f8f8}
    [data-element-id="a110-total"]{scale:.96 .98}
    .a110-card b{font-weight:400;color:#17365f}
    .a110-card strong{color:#17365f;letter-spacing:1px}
    .a110-duty-text{color:#000}
    [data-element-id="a110-team-0"]{scale:1 .98}
    [data-element-id="a110-count-0"]{translate:3px 2px;scale:1 .98;font-size:26px!important}
    [data-element-id="a110-duty-0"]{translate:-1px 2px;scale:.98 1}
    [data-element-id="a110-count-1"]{translate:3px 2px;scale:1 .98;font-size:26.5px!important;font-weight:400}
    [data-element-id="a110-duty-1"]{translate:3px 2px;scale:1 .98}
    [data-element-id="a110-team-2"]{translate:0 1px;letter-spacing:-.25px}
    [data-element-id="a110-count-2"]{translate:3px 1px;scale:1.04 1;font-weight:400}
    [data-element-id="a110-duty-2"]{translate:3px 1px;scale:1.04 1.02}
    [data-element-id="a110-team-3"]{letter-spacing:-.25px}
    [data-element-id="a110-count-3"]{translate:3px 1px;scale:1.02 1;font-weight:400}
    [data-element-id="a110-duty-3"]{translate:0 1px;scale:1 1.02}
    [data-element-id="a110-team-4"]{translate:-1px 0}
    [data-element-id="a110-count-4"]{translate:3px 2px;font-size:26px!important;font-weight:400}
    [data-element-id="a110-duty-4"]{scale:1 1.02}
  `,
  crops: [
    { asset: 'A1-10-二图排版-部门概况.assets/photo-01.png', x: 22, y: 90, w: 286, h: 269 },
    { asset: 'A1-10-二图排版-部门概况.assets/photo-02.png', x: 309, y: 359, w: 286, h: 271 },
  ],
  body: `
    ${photoHeader('A1-10', '部门介绍-部门概况')}
    ${photo('a110-photo-1', 'A1-10-二图排版-部门概况.assets/photo-01.png', 22, 90, 286, 269)}
    ${text('a110-photo-label', 68, 277, 194, 58, '市场部', 'center heavy', 'font-size:42px;color:#fff;')}
    ${text('a110-left-title', 50, 395, 221, 86, '<span class="l1">市场部不是“花钱部门”，</span><br><span class="l2">而是“投资部门”</span>', 'navy-title', 'font-size:24px;line-height:1.55;')}
    ${text('a110-left-copy', 50, 487, 221, 91, '既要通过精准策略扩大品牌声<br>量，更要深度渗透目标市场，<br>将产品价值转化为客户选择。', 'body-copy', 'font-size:14px;')}
    ${el('a110-left-line', 49, 595, 75, 6, '', '', `background:${C.navy};`)}
    ${text('a110-center-title', 345, 119, 238, 87, '<span class="l1">让客户“选择我们”的理</span><br><span class="l2">由变为“品牌信仰”</span>', 'navy-title', 'font-size:24px;line-height:1.55;')}
    ${text('a110-center-copy', 345, 209, 216, 101, '制造业是“产品力×品牌力×客<br>户连接力”的综合较量。市场<br>部是这场较量的“先锋部队”。', 'body-copy', 'font-size:15px;')}
    ${el('a110-center-line', 345, 317, 74, 6, '', '', `background:${C.navy};`)}
    ${photo('a110-photo-2', 'A1-10-二图排版-部门概况.assets/photo-02.png', 309, 359, 286, 271)}
    ${el('a110-pill', 623, 113, 189, 39, '团队规模与结构', 'matrix-cell heavy', `border-radius:999px;background:${C.navy};color:#fff;font-size:18px;`)}
    ${text('a110-total', 628, 154, 480, 34, '总员工数：12人，采用“3+2”矩阵式架构，兼顾专业性与灵活性。', '', 'font-size:16px;')}
    ${el('a110-org-line', 640, 229, 2, 352, '', '', 'background:#bfd3e5;')}
    ${el('a110-org', 680, 198, 429, 417, `${[
      ['品牌与内容组','3 人','品牌定位、内容营销（白皮书/案例库）、行业PR与展会策划'],
      ['渠道与增长组','3 人','线下渠道拓展（经销商/代理商）、大客户直销支持、区域市场渗透'],
      ['数字营销组','2 人','官网/小程序运营、搜索引擎优化、社交媒体矩阵'],
      ['客户成功组','2 人','现有客户关系维护、复购促进、客户案例提炼与口碑传播'],
      ['市场分析组','3 人','竞品监测、行业趋势报告、客户需求调研（支撑产品迭代与营销决策）'],
    ].map((item,i)=>`<div class="a110-card"><div><b ${attrs(`a110-team-${i}`,true)}>${item[0]}</b><strong ${attrs(`a110-count-${i}`,true)}>${item[1]}</strong></div><span><span class="a110-duty-text" ${attrs(`a110-duty-${i}`,true)}>${item[2]}</span></span></div>`).join('')}`, 'a110-org')}
  `,
});

const e201Path = '图片排版/02-二图/E2-01-二图排版-工作进展.html';
const e201EdgeStrips = [
  ...[0, 76, 77, 78, 85, 86, 87, 625, 626, 627, 628, 629, 647].map((row) => ({ row, start: 0, end: 1152 })),
  ...[0, 1151].map((column) => ({ column, start: 0, end: 648 })),
  ...[23, 24, 25, 255, 256, 257, 580, 581, 582, 812, 813, 814, 1127, 1128].map((column) => ({ column, start: 85, end: 630 })),
  ...[265, 266, 267, 561, 562, 563, 824, 825, 826, 1114, 1115, 1116].map((column) => ({ column, start: 85, end: 278 })),
];

add({
  id: 'e2-01-progress',
  title: '二图排版：工作进展',
  width: 1152,
  height: 648,
  relativePath: e201Path,
  css: photoSharedCss + `
    .slide:before{content:"";position:absolute;z-index:20;inset:0;pointer-events:none;background:${nativeEdgeStripBackground(e201Path, e201EdgeStrips)}}
    .photo-header-code{transform:translate(-2px,-5px) scaleX(.94);transform-origin:left center}
    .photo-header-title{transform:translate(-1px,-4px) scaleX(1.015);transform-origin:left center}
    .e201-column{padding:28px 31px;font-size:16px;line-height:24px}.e201-column.dark{background:${C.navy};color:#fff}.e201-column.light{background:#fff;color:#111}
    .e201-number{font-size:58px;font-weight:800;line-height:1;color:rgba(255,255,255,.43)}.light .e201-number{color:rgba(174,67,51,.28)}
    .e201-column.dark .e201-number{color:transparent;background:linear-gradient(to bottom,#d0dce5 10%,#bccbd8 25%,#7892ad 65%,#3c5e88 100%);-webkit-background-clip:text;background-clip:text}
    .e201-column.light .e201-number{color:transparent;background:linear-gradient(to bottom,#a76c67 12%,#c79d99 50%,#f3efec 100%);-webkit-background-clip:text;background-clip:text}
    .e201-column h3{margin:16px 0 56px;font-size:25px;line-height:1}.light h3{margin:10px 0 17px}.e201-column p{margin:0}
    .e201-column.dark .e201-number,.e201-column.dark h3{margin-left:10px}
    [data-element-id="e201-col-3"]{padding-left:24px;padding-right:24px}
    [data-element-id="e201-num-1"]{transform:translateY(2px) scaleX(.95);transform-origin:left center}
    [data-element-id="e201-num-2"]{transform:translateX(-1px) scaleX(1.17);transform-origin:left center}
    [data-element-id="e201-num-3"]{transform:translateY(3px) scaleX(1.16);transform-origin:left center}
    [data-element-id="e201-num-4"]{transform:translate(-3px,-1px) scaleX(1.14);transform-origin:left center}
    [data-element-id="e201-title-1"]{transform:translateY(6px) scaleX(.92);transform-origin:left center}
    [data-element-id="e201-title-2"]{transform:translate(1px,11px) scaleX(.973);transform-origin:left center}
    [data-element-id="e201-title-3"]{transform:translateY(6px) scaleX(.973);transform-origin:left center}
    [data-element-id="e201-title-4"]{transform:translateY(11px) scaleX(.973);transform-origin:left center}
    [data-element-id="e201-copy-1"]{transform:translateY(13px) scaleX(1.038);transform-origin:left top}
    [data-element-id="e201-copy-2"]{transform:translateY(13px) scaleX(1.05);transform-origin:left top}
    [data-element-id="e201-copy-3"]{transform:translate(-1px,12px) scaleX(1.05);transform-origin:left top}
    [data-element-id="e201-copy-4"]{transform:translate(-1px,14px) scaleX(1.045);transform-origin:left top}
    [data-element-id="header-code"]{translate:3px 0;scale:1.04 1.02}
    [data-element-id="header-title"]{translate:0 -1px;font-weight:500}
    [data-element-id="e201-num-1"]{translate:3px 0;scale:1.06 1;font-size:59px}
    [data-element-id="e201-title-1"]{translate:1px -1px;scale:1.02 .98}
    [data-element-id="e201-copy-1"]{translate:0 -1px}
    [data-element-id="e201-num-2"]{translate:2px 3px}
    [data-element-id="e201-title-2"]{translate:-1px -1px;scale:1 .98}
    [data-element-id="e201-copy-2"]{translate:0 1px}
    [data-element-id="e201-num-3"]{translate:-1px 0}
    [data-element-id="e201-title-3"]{translate:-2px 0;scale:1 1.02}
    [data-element-id="e201-copy-3"]{translate:0 1px}
    [data-element-id="e201-num-4"]{translate:3px 3px;scale:1 .98;font-size:57.5px}
    [data-element-id="e201-title-4"]{translate:-2px -1px;scale:1 .98}
    [data-element-id="e201-copy-4"]{translate:1px 0}
    .e201-column.light{color:#000}
    .e201-doc{position:absolute;left:89px;bottom:107px;width:55px;height:70px}
  `,
  crops: [
    { asset: 'E2-01-二图排版-工作进展.assets/photo-01.png', x: 266, y: 86, w: 296, h: 190 },
    { asset: 'E2-01-二图排版-工作进展.assets/photo-02.png', x: 825, y: 86, w: 290, h: 190 },
  ],
  body: `
    ${photoHeader('E2-01', '二图排版：工作进展')}
    ${el('e201-col-1', 24, 86, 234, 542, `<div class="e201-number" ${attrs('e201-num-1',true)}>01</div><h3 ${attrs('e201-title-1',true)}>工作进展1</h3><p ${attrs('e201-copy-1',true)}>合同签订总额达成预期<br>目标,并且有10个合同<br>签订额达到了1000万<br>元。比预期增加了<br>2000万。</p><div class="e201-doc"><svg viewBox="0 0 55 70" aria-hidden="true"><defs><linearGradient id="e201-doc-grad-1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eef5ff"/><stop offset="1" stop-color="#7691b2" stop-opacity=".7"/></linearGradient></defs><path d="M2 1.5H40L53.5 15V68.5H2Z" fill="none" stroke="url(#e201-doc-grad-1)" stroke-width="3" stroke-linejoin="round"/><path d="M40 1.5V15H53.5M10 27H43M10 36H43M10 45H43M10 54H43" fill="none" stroke="url(#e201-doc-grad-1)" stroke-width="2"/></svg></div>`, 'e201-column dark')}
    ${el('e201-col-2', 258, 86, 315, 542, `${photo('e201-photo-1','E2-01-二图排版-工作进展.assets/photo-01.png',8,0,296,190)}<div style="position:absolute;left:35px;right:24px;top:218px"><div class="e201-number" ${attrs('e201-num-2',true)}>02</div><h3 ${attrs('e201-title-2',true)}>工作进展2</h3><p ${attrs('e201-copy-2',true)}>产品销售额达到了23亿元，有5<br>家客户单位要求建立长期合作。<br>比预期增加了2亿元。完成全国<br>15省渠道部署，激活网点800+；<br>建立营销资源智能调度系统；启<br>动半月度竞品响应机制。</p></div>`, 'e201-column light')}
    ${el('e201-col-3', 581, 86, 233, 542, `<div class="e201-number" ${attrs('e201-num-3',true)}>03</div><h3 ${attrs('e201-title-3',true)}>工作进展3</h3><p ${attrs('e201-copy-3',true)}>线上拓客渠道增加，不<br>再局限在某几个常规平<br>台中，而是增加了更多<br>的平台来拓展客户。</p><div class="e201-doc"><svg viewBox="0 0 55 70" aria-hidden="true"><defs><linearGradient id="e201-doc-grad-3" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#eef5ff"/><stop offset="1" stop-color="#7691b2" stop-opacity=".7"/></linearGradient></defs><path d="M2 1.5H40L53.5 15V68.5H2Z" fill="none" stroke="url(#e201-doc-grad-3)" stroke-width="3" stroke-linejoin="round"/><path d="M40 1.5V15H53.5M10 27H43M10 36H43M10 45H43M10 54H43" fill="none" stroke="url(#e201-doc-grad-3)" stroke-width="2"/></svg></div>`, 'e201-column dark')}
    ${el('e201-col-4', 814, 86, 314, 542, `${photo('e201-photo-2','E2-01-二图排版-工作进展.assets/photo-02.png',11,0,290,190)}<div style="position:absolute;left:30px;right:20px;top:218px"><div class="e201-number" ${attrs('e201-num-4',true)}>04</div><h3 ${attrs('e201-title-4',true)}>工作进展4</h3><p ${attrs('e201-copy-4',true)}>制造模式将直接降低库存、优化<br>产能、降低消耗、提升管理、缩<br>短研发周期、强化财务管控、提<br>升服务品质，为制造商有效降低<br>综合成本。</p></div>`, 'e201-column light')}
  `,
});

add({
  id: 'e3-02-cards',
  title: '三图排版',
  width: 1152,
  height: 648,
  relativePath: '图片排版/03-三图/E3-02-三图排版-卡片结构.html',
  css: photoSharedCss + `
    .slide:after{border-top-color:#d6dadb}
    .photo-header-code{font-size:44px;transform:translateY(-5px) scaleX(.98);transform-origin:left center}
    .photo-header-title{font-size:39px;transform:translateY(-5px) scaleX(.98);transform-origin:left center}
    .photo-header-rule{right:-16px;background:linear-gradient(90deg,#8797a7 0%,#adb2b6 18%,#c7c9cb 36%,#d6d6d6 62%,#f0f0f0 80%,#fff 100%) top/100% 1px no-repeat,linear-gradient(90deg,#8291a1 0%,#afb3b6 18%,#c2c4c6 36%,#d8d8d8 62%,#efefef 80%,#fff 100%) bottom/100% 1px no-repeat}
    .e302-card{padding:24px 15px 14px;border-radius:8px;background:${C.blush};text-align:center;font-size:14px;line-height:1.5}
    .e302-card h3{display:flex;width:235px;height:35px;align-items:center;justify-content:center;margin:0 auto 5px;padding:0;border-radius:999px;background:${C.rust};color:#fff;font-family:"Notale Zen Hei",sans-serif;font-size:21px;font-weight:700;transform:translateY(-1px)}
    .e302-card>div:not(.photo){transform:translateY(3px) scaleX(1.04)}
    .e302-summary{display:flex;align-items:center;overflow:hidden;padding:16px 26px;background:linear-gradient(90deg,#e5e8ef 0%,#edf1f5 62%,#dce7ed 100%);font-size:16px;line-height:1.65;color:${C.navy}}
    .e302-summary-photo{position:absolute;z-index:0;left:845px;top:-12px;width:254px;height:152px;object-fit:cover;opacity:1;-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 35%,#000 100%);mask-image:linear-gradient(90deg,transparent 0,#000 35%,#000 100%)}
    .e302-summary>span{position:relative;z-index:1;font-size:15.5px;transform:scaleX(1.04);transform-origin:left center}
    [data-element-id="e302-waves"]:after{content:"";position:absolute;z-index:2;left:1px;right:1px;bottom:1px;height:2px;background:linear-gradient(#1f3d64 0 50%,#274163 50%)}
  `,
  crops: [
    { asset: 'E3-02-三图排版-卡片结构.assets/photo-01.png', x: 38, y: 278, w: 320, h: 191 },
    { asset: 'E3-02-三图排版-卡片结构.assets/photo-02.png', x: 416, y: 278, w: 320, h: 191 },
    { asset: 'E3-02-三图排版-卡片结构.assets/photo-03.png', x: 792, y: 278, w: 323, h: 191 },
  ],
  body: `
    ${photoHeader('E3-02', '三图排版')}
    ${el('e302-chevron-left', 329, 104, 78, 20, `<svg viewBox="0 0 78 20" aria-hidden="true">${[0,12,24,36,48,60].map((x,i)=>`<path d="M${x+2} 5l7 5-7 5" fill="none" stroke="${i<2?'#dce3e7':i<4?'#9baeb9':C.navy}" stroke-width="2"/>`).join('')}</svg>`)}
    ${el('e302-chevron-right', 746, 104, 78, 20, `<svg viewBox="0 0 78 20" aria-hidden="true">${[0,12,24,36,48,60].map((x,i)=>`<path d="M${x+9} 5l-7 5 7 5" fill="none" stroke="${i>3?'#dce3e7':i>1?'#9baeb9':C.navy}" stroke-width="2"/>`).join('')}</svg>`)}
    ${text('e302-main-title', 385, 88, 382, 51, '企业文化活动策划', 'center navy-title', 'font-size:31px;transform:translateY(-2px) scaleX(1.08);')}
    ${[
      {x:22,photoX:16,photoW:320,title:'提升行业品质',copy:'加强物业服务事项公开公示，118个小区设置<br>“两牌一栏”，让物业服务透明化。',asset:'E3-02-三图排版-卡片结构.assets/photo-01.png'},
      {x:400,photoX:16,photoW:320,title:'打造宜居家园',copy:'提升管理水平，让小区环境更安全、更整洁，累<br>计整改575项安全隐患。',asset:'E3-02-三图排版-卡片结构.assets/photo-02.png'},
      {x:778,photoX:14,photoW:323,title:'守护业主权益',copy:'成立3个检查组，每月至少抽查8家物业小区，<br>实现全覆盖交叉检查。',asset:'E3-02-三图排版-卡片结构.assets/photo-03.png'},
    ].map((card,i)=>el(`e302-card-${i}`, card.x, 153, 352, 330, `<h3 ${attrs(`e302-card-title-${i}`,true)}>${card.title}</h3><div ${attrs(`e302-card-copy-${i}`,true)}>${card.copy}</div>${photo(`e302-photo-${i}`,card.asset,card.photoX,125,card.photoW,191)}`, 'e302-card')).join('')}
    ${el('e302-summary', 22, 499, 1108, 99, `<img class="e302-summary-photo" src="./E3-02-三图排版-卡片结构.assets/photo-02.png" alt="" draggable="false"><span ${attrs('e302-summary-copy',true)}>策划“2024年度企业文化季”系列活动，包括夏季“员工家庭日”、秋季“技能大赛”；组建“兴趣社团”3个、每周组织<br>活动1次，HR负责场地协调与物料支持。</span>`, 'e302-summary')}
    ${el('e302-waves', 0, 595, 1152, 53, '<svg viewBox="0 0 1152 53" preserveAspectRatio="none" aria-hidden="true"><path d="M0 9Q576 55 1152 9V53H0Z" fill="#8e3e35"/><path d="M0 16Q576 62 1152 16V53H0Z" fill="#1a4474"/></svg>')}
  `,
});

add({
  id: 'e3-03-radial',
  title: '三图排版中心辐射',
  width: 1152,
  height: 648,
  relativePath: '图片排版/03-三图/E3-03-三图排版-中心辐射.html',
  css: photoSharedCss + `
    .e303-bg{background:rgba(253,237,234,.55);clip-path:polygon(0 0,50% 62%,100% 0,100% 100%,0 100%)}
    .e303-module{font-size:15px;line-height:1.55}.e303-module h3{margin:0 0 10px;color:${C.rust};font-size:21px}
    .e303-center{border-radius:50%;background:transparent;border:0;overflow:hidden}
    [data-element-id="e303-lines"]{display:none}
  `,
  crops: [
    { asset: 'E3-03-三图排版-中心辐射.assets/photo-01.png', x: 417, y: 162, w: 319, h: 157 },
    { asset: 'E3-03-三图排版-中心辐射.assets/photo-02.png', x: 32, y: 466, w: 319, h: 158 },
    { asset: 'E3-03-三图排版-中心辐射.assets/photo-03.png', x: 800, y: 466, w: 320, h: 158 },
    { asset: 'E3-03-三图排版-中心辐射.assets/photo-04.png', x: 385, y: 340, w: 382, h: 308 },
  ],
  body: `
    ${photoHeader('E3-03', '三图排版')}
    ${el('e303-bg', 0, 135, 1152, 513, '', 'e303-bg')}
    ${el('e303-top-icon', 467, 90, 43, 38, '◈', 'matrix-cell', `background:${C.rust};color:#fff;border-radius:4px;font-size:19px;`)}
    ${text('e303-top-title', 520, 89, 300, 40, '绿色低碳竞争力', 'rust-title', 'font-size:21px;')}
    ${text('e303-top-copy', 309, 129, 535, 28, '资源倾斜需要年度预算20%定向投入数字化与绿色化能力建设，确保异常响应时效。', 'center', 'font-size:13px;')}
    ${photo('e303-photo-top', 'E3-03-三图排版-中心辐射.assets/photo-01.png', 417, 162, 319, 157, '', 'border-radius:7px;')}
    ${el('e303-lines', 158, 229, 836, 303, `<svg viewBox="0 0 836 303"><path class="connector" d="M418 0L0 250" stroke="#c7b9b5"/><path class="connector" d="M418 0L836 250" stroke="#c7b9b5"/><path class="connector" d="M0 250L418 116L836 250" stroke="#c7b9b5"/></svg>`)}
    ${el('e303-left-module', 32, 352, 319, 110, `<h3 ${attrs('e303-left-title',true)}>▣ 规模与动态调优</h3><div ${attrs('e303-left-copy',true)}>编制《政企服务白皮书》及《5G营销作战手册》；建立项目效益评估模型，筹备下年度生态合作伙伴大会。</div>`, 'e303-module')}
    ${el('e303-right-module', 800, 352, 320, 110, `<h3 ${attrs('e303-right-title',true)}>技术场景落地 ▥</h3><div ${attrs('e303-right-copy',true)}>数据穿透需要构建“订单-运输-签收”全链路可视化平台，智能决策需要开发区域货量预测模型。</div>`, 'e303-module right')}
    ${photo('e303-photo-left', 'E3-03-三图排版-中心辐射.assets/photo-02.png', 32, 466, 319, 158, '', 'border-radius:6px;')}
    ${photo('e303-photo-right', 'E3-03-三图排版-中心辐射.assets/photo-03.png', 800, 466, 320, 158, '', 'border-radius:6px;')}
    ${el('e303-center-circle', 385, 340, 382, 382, `${photo('e303-photo-center','E3-03-三图排版-中心辐射.assets/photo-04.png',0,0,382,308,'','background:transparent;','object-fit:cover;object-position:center;')}`, 'e303-center allow-overflow')}
  `,
});

const e403Path = '图片排版/04-四图/E4-03-四图排版-工作完成情况.html';
const e403EdgeStrips = (() => {
  const strips = [];
  for (let row = 69; row <= 80; row += 1) strips.push({ row, start: 0, end: 720 });
  for (let row = 94; row <= 108; row += 1) strips.push({ row, start: 445, end: 709 });
  for (let row = 129; row <= 142; row += 1) strips.push({ row, start: 445, end: 709 });
  for (let column = 445; column <= 469; column += 1) strips.push({ column, start: 94, end: 143 });
  for (let column = 684; column <= 708; column += 1) strips.push({ column, start: 94, end: 143 });
  for (let row = 150; row <= 241; row += 1) strips.push({ row, start: 0, end: 1152 });
  for (const [x, width] of [[82, 236], [334, 229], [587, 234], [839, 235]]) {
    for (let row = 480; row <= 502; row += 1) strips.push({ row, start: x - 3, end: x + width + 4 });
    for (let column = x - 3; column <= x + 12; column += 1) strips.push({ column, start: 150, end: 503 });
    for (let column = x + width - 13; column <= x + width + 3; column += 1) strips.push({ column, start: 150, end: 503 });
  }
  return strips;
})();

add({
  id: 'e4-03-work-completion',
  title: '四图排版：重点工作完成情况',
  width: 1152,
  height: 648,
  relativePath: e403Path,
  css: photoSharedCss + `
    .slide:before{content:"";position:absolute;z-index:20;inset:0;pointer-events:none;background:${nativeEdgeStripBackground(e403Path, e403EdgeStrips)}}
    .slide:after{border:0!important;background:${nativeEdgeStripBackground(e403Path, [
      { row: 0, start: 0, end: 1152 }, { row: 647, start: 0, end: 1152 },
      { column: 0, start: 0, end: 648 }, { column: 1151, start: 0, end: 648 },
    ])}!important}
    .e403-rope{pointer-events:none}
    .photo-header-code{font-size:44px;letter-spacing:-.2px;transform:translateY(-5px) scaleX(.97);transform-origin:left center}
    .photo-header-title{font-size:37px;letter-spacing:.6px;transform:translate(-2px,-5px) scaleX(1.02);transform-origin:left center}
    .e403-label span{display:block;transform:translateY(2px) scaleX(1.12)}
    .e403-card{padding:93px 14px 14px;clip-path:polygon(0 7.6%,100% 0,100% 100%,0 100%);filter:drop-shadow(5px 4px 6px rgba(30,50,64,.13));font-size:14px;line-height:1.38}
    .e403-card.blue{background:linear-gradient(100deg,#e9edf1 0%,#dce2e9 46%,#c2cfdb 100%)}
    .e403-card.gray{background:linear-gradient(100deg,#f5f5f5 0%,#ededed 48%,#e5e5e5 100%)}
    .e403-card:before{content:"";position:absolute;z-index:0;inset:11px 9px 10px 11px;border:1px solid #77858d;clip-path:polygon(0 6.5%,100% 0,100% 100%,0 100%);pointer-events:none}
    .e403-card h3,.e403-card>div:not(.photo){position:relative;z-index:1}
    .e403-card h3{margin:0 0 12px;text-align:center;font-size:21px;color:#111;transform:scaleX(1.025)}
    .e403-card-copy-last{display:inline-block;white-space:nowrap;transform:scaleX(.86);transform-origin:left center}
    .e403-card .photo{z-index:2}
    .e403-summary h3{margin:0 0 6px;color:${C.navy};font-size:24px;transform-origin:left center}.e403-summary{font-size:14px;line-height:1.5;transform:translateY(-1px)}
    .e403-summary>div{transform:scaleX(1.025);transform-origin:left top}
    .e403-meta{display:flex;align-items:center;gap:18px;font-size:16px;white-space:nowrap;color:#111}
    .e403-meta span{display:flex;align-items:center;gap:7px}
    .e403-meta i{display:grid;width:20px;height:20px;place-items:center;border:1.5px solid #111;font:700 17px/1 serif;font-style:normal}
    .e403-mark{color:#7d8589;font-size:12px;text-align:right}
    [data-element-id="header-code"]{translate:-1px 0}
    [data-element-id="header-title"]{font-weight:500}
    [data-element-id="e403-label"]{font-size:16.5px!important;font-weight:400}
    [data-element-id="e403-card-title-0"]{translate:-2px 0;scale:1 1;font-weight:600}
    [data-element-id="e403-card-copy-0"]{translate:3px 0;scale:.98 1;font-size:14px}
    [data-element-id="e403-card-title-1"]{translate:2px 0;scale:1 .98}
    [data-element-id="e403-card-copy-1"]{translate:3px 0;scale:.98 .98;font-size:14.5px}
    [data-element-id="e403-card-title-2"]{translate:0 0;scale:1 .98;font-weight:600}
    [data-element-id="e403-card-copy-2"]{translate:1px 0;scale:.94 .98}
    [data-element-id="e403-card-title-3"]{translate:-1px 0;scale:1 1}
    [data-element-id="e403-card-copy-3"]{translate:1px 1px;scale:.94 .98;font-size:14px}
    [data-element-id="e403-summary-title-1"]{scale:1 .98;font-weight:400}
    [data-element-id="e403-summary-title-2"]{scale:1 .98;font-weight:500}
    [data-element-id="e403-summary-copy-2"]{scale:1 1.02}
  `,
  crops: [
    { asset: 'E4-03-四图排版-工作完成情况.assets/photo-01.png', x: 97, y: 365, w: 201, h: 116 },
    { asset: 'E4-03-四图排版-工作完成情况.assets/photo-02.png', x: 350, y: 365, w: 200, h: 116 },
    { asset: 'E4-03-四图排版-工作完成情况.assets/photo-03.png', x: 602, y: 365, w: 202, h: 116 },
    { asset: 'E4-03-四图排版-工作完成情况.assets/photo-04.png', x: 855, y: 365, w: 201, h: 116 },
  ],
  body: `
    ${photoHeader('E4-03', '四图排版：重点工作完成情况')}
    ${el('e403-meta', 760, 25, 366, 24, '<span><i>✓</i>全部可编辑</span><span><i>✓</i>一键换色</span><span><i>✓</i>高效省事</span>', 'e403-meta')}
    ${text('e403-mark', 1026, 57, 96, 16, '@月升ppt', 'e403-mark')}
    ${el('e403-label', 449, 98, 255, 40, '<span>重点工作描述</span>', 'matrix-cell heavy e403-label', `border-radius:999px;background:${C.navy};color:#fff;font-size:18px;`)}
    ${el('e403-rope', 0, 194, 1152, 44, `<svg viewBox="0 0 1152 44" aria-hidden="true">
      ${[
        [37,'#a8756e',4],[215,'#b8c9d8',6],[332,'#b8c9d8',5],[466,'#b8c9d8',6],[717,'#b8c9d8',6],[963,'#b8c9d8',6],[1114,'#a8756e',4],
      ].map(([cx,stroke,sw])=>`<circle cx="${cx}" cy="21" r="20" fill="rgba(248,250,249,.66)" stroke="${stroke}" stroke-width="${sw}" opacity=".72"/>`).join('')}
      ${diagonalRopeSegment(20, 211, 21, {step:13,rustIndexes:[7]})}
      ${diagonalRopeSegment(315, 462, 21, {step:12.12,rustIndexes:[0,9]})}
      ${diagonalRopeSegment(565, 714, 21, {step:13,rustIndexes:[8]})}
      ${diagonalRopeSegment(818, 967, 21, {step:13,rustIndexes:[4]})}
      ${diagonalRopeSegment(1071, 1133, 21, {step:13})}
    </svg>`, 'e403-rope', 'z-index:5;')}
    ${[
      {x:82,w:236,photoX:15,photoW:201,tone:'blue',title:'优先级排序',copy:'已完成Q3核心需求的用户调研与<br>竞品分析，覆盖目标用户群体<br>85%，提炼出3项关键用户痛点。'},
      {x:334,w:229,photoX:16,photoW:200,tone:'gray',title:'跨部门协作优化',copy:'与市场、运营团队协同完成活动<br>方案，确定功能需求与排期，优<br><span class="e403-card-copy-last">化用户路径后预估转化率提升8%。</span>'},
      {x:587,w:234,photoX:15,photoW:202,tone:'blue',title:'项目里程碑推进',copy:'主导的开发进入测试阶段，当前<br>完成度90%，核心算法AB测试结<br>果显示点击率提升12%。'},
      {x:839,w:235,photoX:16,photoW:201,tone:'gray',title:'数据监控与迭代规划',copy:'监控新版本上线后关键指标，发<br>现首页跳出率异常升高3%，已定<br>位为UI交互问题。'},
    ].map((card,i)=>el(`e403-card-${i}`, card.x, 154, card.w, 345, `<h3 ${attrs(`e403-card-title-${i}`,true)}>${card.title}</h3><div ${attrs(`e403-card-copy-${i}`,true)}>${card.copy}</div>${photo(`e403-photo-${i}`,`E4-03-四图排版-工作完成情况.assets/photo-0${i+1}.png`,card.photoX,211,card.photoW,116)}`, `e403-card ${card.tone}`)).join('')}
    ${el('e403-summary-1', 86, 525, 429, 84, `<h3 ${attrs('e403-summary-title-1',true)}>项目核心工作总结1</h3><div ${attrs('e403-summary-copy-1',true)}>合同签订总额达成预期目标,并且有10个合同签订额达到了1000万元。<br>比预期增加了2000万元。</div>`, 'e403-summary')}
    ${el('e403-summary-2', 590, 525, 478, 84, `<h3 ${attrs('e403-summary-title-2',true)}>项目核心工作总结2</h3><div ${attrs('e403-summary-copy-2',true)}>聚焦品牌声量提升与产品销量转化，已落地项目累计实现品牌曝光量超<br>5000 万，带动产品销售额增长 28%，超额完成年度营销目标。</div>`, 'e403-summary')}
  `,
});

const e405Path = '图片排版/04-四图/E4-05-四图排版-胶片结构.html';
const e405EdgeStrips = (() => {
  const strips = [];
  const addArea = (x1, y1, x2, y2, exclusions = []) => {
    for (let row = y1; row < y2; row += 1) {
      let segments = [[x1, x2]];
      for (const [x, y, width, height] of exclusions) {
        if (row < y || row >= y + height) continue;
        const next = [];
        for (const [start, end] of segments) {
          if (x >= end || x + width <= start) {
            next.push([start, end]);
            continue;
          }
          if (start < x) next.push([start, x]);
          if (x + width < end) next.push([x + width, end]);
        }
        segments = next;
      }
      for (const [start, end] of segments) {
        if (end > start) strips.push({ row, start, end });
      }
    }
  };

  for (let row = 69; row <= 80; row += 1) strips.push({ row, start: 0, end: 720 });
  addArea(0, 80, 620, 648, [
    [23, 196, 216, 397], [158, 126, 261, 316],
    [334, 126, 244, 213], [139, 406, 221, 187],
  ]);
  const titleWidths = [295, 325, 380, 320];
  const secondLineWidths = [390, 330, 455, 455];
  [109, 239, 369, 499].forEach((top, index) => {
    addArea(590, top - 4, 1134, top + 117, [
      [665, top + 15, titleWidths[index], 31],
      [665, top + 47, 455, 25],
      [665, top + 72, secondLineWidths[index], 26],
    ]);
  });
  return strips;
})();

add({
  id: 'e4-05-film',
  title: '四图排版胶片结构',
  width: 1152,
  height: 648,
  relativePath: e405Path,
  css: photoSharedCss + `
    .slide:before{content:"";position:absolute;z-index:20;inset:0;pointer-events:none;background:${nativeEdgeStripBackground(e405Path, e405EdgeStrips)}}
    .slide:after{border:0!important;background:${nativeEdgeStripBackground(e405Path, [
      { row: 0, start: 0, end: 1152 }, { row: 647, start: 0, end: 1152 },
      { column: 0, start: 0, end: 648 }, { column: 1151, start: 0, end: 648 },
    ])}!important}
    .slide{background:
      radial-gradient(ellipse 430px 360px at 17% 53%,rgba(239,213,211,.55),rgba(247,231,230,.26) 48%,rgba(255,255,255,0) 88%),
      radial-gradient(ellipse 700px 430px at 78% 70%,rgba(226,230,238,.58),rgba(255,255,255,0) 86%),
      linear-gradient(180deg,#fff 0 15%,#fafafa 45%,#f4f5f8 100%)}
    .e405-film-frame{z-index:2;overflow:visible;background:transparent}
    .e405-film-frame .photo{box-shadow:none;background:transparent;overflow:visible}
    .e405-film-lines{pointer-events:none;z-index:1}
    .e405-list{display:grid;grid-template-rows:repeat(4,113px);gap:17px}
    .e405-card{position:relative;padding:18px 18px 12px 40px;border:1px dashed #777;border-radius:48px;background:rgba(252,252,251,.92);box-shadow:0 3px 9px rgba(55,60,58,.055);font-size:15px;line-height:1.42}
    .e405-card .icon{position:absolute;left:-37px;top:23px;display:grid;width:60px;height:60px;place-items:center;border-radius:50%;background:#9d3929;color:#fff;box-shadow:0 0 0 5px #fff}
    .e405-card .icon svg{width:38px;height:38px}
    .e405-card b{display:block;color:#9b4a3c;font-size:21px;margin-bottom:3px;transform:translate(2px,1px) scaleX(1.03);transform-origin:left center}
    .e405-card>div>span{display:block;transform:translate(-1px,-1px) scale(.97,.94);transform-origin:left top}
    .e405-meta{display:flex;align-items:center;justify-content:flex-end;gap:18px;color:#111;font-size:17px;font-weight:400;letter-spacing:0;white-space:nowrap}.e405-meta span{display:flex;align-items:center;gap:6px}.e405-meta i{display:grid;width:21px;height:21px;place-items:center;border:1.6px solid #111;font-family:Arial,sans-serif;font-size:21px;font-style:normal;line-height:1}.e405-credit{justify-content:flex-end;color:#777;font-size:13px;letter-spacing:0;white-space:nowrap}
    .e405-reflection{z-index:1;overflow:hidden;opacity:.35;filter:blur(.6px);-webkit-mask-image:linear-gradient(#777,transparent);mask-image:linear-gradient(#777,transparent)}
    .e405-reflection img{display:block;width:215px;height:174px;transform:scaleY(-1);transform-origin:center center}
    [data-element-id="header-code"]{translate:-.75px -.5px;scale:1.03 1;font-size:43.25px!important}
    [data-element-id="header-title"]{translate:-.5px .5px;scale:1 .94;font-size:38.25px!important;letter-spacing:-.23px!important}
    [data-element-id="e405-card-title-0"]{translate:-3.5px -.5px;scale:1 1.03}
    [data-element-id="e405-card-copy-0"],[data-element-id="e405-card-title-1"],[data-element-id="e405-card-copy-1"],[data-element-id="e405-card-title-2"],[data-element-id="e405-card-copy-3"]{scale:1 1.03}
    [data-element-id="e405-card-copy-2"]{translate:1px 0;letter-spacing:-.25px!important}
    [data-element-id="e405-card-title-3"]{scale:1 .94}
  `,
  crops: [
    { asset: 'E4-05-四图排版-胶片结构.assets/photo-01.png', x: 23, y: 196, w: 216, h: 397, mask: [[46,24],[135,0],[215,246],[116,396],[0,178]] },
    { asset: 'E4-05-四图排版-胶片结构.assets/photo-02.png', x: 158, y: 126, w: 261, h: 316, mask: [[0,70],[176,0],[260,192],[80,315]] },
    { asset: 'E4-05-四图排版-胶片结构.assets/photo-03.png', x: 334, y: 126, w: 244, h: 213, mask: [[0,0],[187,4],[243,113],[84,192]] },
    { asset: 'E4-05-四图排版-胶片结构.assets/photo-04.png', x: 139, y: 406, w: 221, h: 187, mask: [[99,36],[194,0],[220,121],[140,168],[0,186]] },
  ],
  body: `
    ${photoHeader('E4-05', '四图排版')}
    ${el('e405-meta', 758, 25, 364, 25, '<span><i>✓</i>全部可编辑</span><span><i>✓</i>一键换色</span><span><i>✓</i>高效省事</span>', 'e405-meta')}
    ${text('e405-credit', 1017, 55, 103, 20, '@月升ppt', 'e405-credit')}
    ${el('e405-soft-bg', 0, 92, 595, 556, '', '', 'background:radial-gradient(ellipse at 32% 48%,rgba(246,225,225,.42),transparent 68%);')}
    ${el('e405-reflection', 143, 591, 215, 57, '<img src="./E4-05-四图排版-胶片结构.assets/photo-04.png" alt="" draggable="false">', 'e405-reflection')}
    ${el('e405-frame-1', 23, 196, 216, 397, `${photo('e405-photo-1','E4-05-四图排版-胶片结构.assets/photo-01.png',0,0,216,397)}`, 'e405-film-frame')}
    ${el('e405-frame-2', 158, 126, 261, 316, `${photo('e405-photo-2','E4-05-四图排版-胶片结构.assets/photo-02.png',0,0,261,316)}`, 'e405-film-frame')}
    ${el('e405-frame-3', 334, 126, 244, 213, `${photo('e405-photo-3','E4-05-四图排版-胶片结构.assets/photo-03.png',0,0,244,213)}`, 'e405-film-frame')}
    ${el('e405-frame-4', 139, 406, 221, 187, `${photo('e405-photo-4','E4-05-四图排版-胶片结构.assets/photo-04.png',0,0,221,187)}`, 'e405-film-frame')}
    ${el('e405-film-lines', 8, 91, 584, 527, `<svg viewBox="0 0 584 527">
      <defs><linearGradient id="e405-film-dark" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="584" y2="0"><stop offset="0" stop-color="#244a7b"/><stop offset=".46" stop-color="#315f88"/><stop offset=".72" stop-color="#7696b1"/><stop offset="1" stop-color="#bdcbd5"/></linearGradient><linearGradient id="e405-film-light" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="584" y2="0"><stop offset="0" stop-color="#557d9f"/><stop offset=".48" stop-color="#7999b5"/><stop offset=".76" stop-color="#aebfcd"/><stop offset="1" stop-color="#d2dbe2"/></linearGradient></defs>
      <path d="M17 282 C56 106 229 15 389 35 C493 51 552 100 571 151" fill="none" stroke="url(#e405-film-dark)" stroke-width="17"/>
      <path d="M17 282 C56 106 229 15 389 35 C493 51 552 100 571 151" fill="none" stroke="url(#e405-film-light)" stroke-width="11"/>
      <path d="M17 282 C56 106 229 15 389 35 C493 51 552 100 571 151" fill="none" stroke="#f3f6f8" stroke-width="2.8" stroke-linecap="round" stroke-dasharray="9 11"/>
      <path d="M134 499 C202 389 307 301 412 257 C492 221 547 193 570 184" fill="none" stroke="url(#e405-film-dark)" stroke-width="17"/>
      <path d="M134 499 C202 389 307 301 412 257 C492 221 547 193 570 184" fill="none" stroke="url(#e405-film-light)" stroke-width="11"/>
      <path d="M134 499 C202 389 307 301 412 257 C492 221 547 193 570 184" fill="none" stroke="#f3f6f8" stroke-width="2.8" stroke-linecap="round" stroke-dasharray="9 11"/>
      <path d="M149 106L237 347M328 43L408 259" fill="none" stroke="url(#e405-film-dark)" stroke-width="15"/>
      <path d="M149 106L237 347M328 43L408 259" fill="none" stroke="url(#e405-film-light)" stroke-width="9"/>
    </svg>`, 'e405-film-lines')}
    ${el('e405-list', 632, 109, 498, 503, `${[
      ['<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="22" cy="15" r="8" fill="white"/><path d="M9 37c0-9 5-15 13-15 7 0 11 4 13 10-7 0-12 2-15 7z" fill="white"/><circle cx="35" cy="34" r="7" fill="none" stroke="white" stroke-width="2"/><path d="M32 34l2 2 4-5" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>','1. 员工培训与发展','组织开展新员工入职培训[X]期，覆盖新员工[X]人，培训满意度达92%。针对在职员工，推出技能提升、考核通过率为90%。'],
      ['<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M9 12h30v22H9z" fill="none" stroke="white" stroke-width="2"/><path d="M13 29l7-7 6 4 9-10M20 35l-4 5M28 35l4 5" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>','2. 绩效管理体系优化','组织员工满意度调查，针对员工反馈的问题，制定并落实改进措施[X]项，员工满意度较上年度提升78%。'],
      ['<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="14" r="8" fill="white"/><path d="M11 39c0-10 5-17 13-17s13 7 13 17z" fill="white"/><path d="M15 29h18v12H15z" fill="none" stroke="white" stroke-width="2"/></svg>','3. 员工关系与企业文化建设','组织员工满意度调查，回收有效问卷[X]份，针对员工反馈的问题，制定并落实改进措施[X]项，员工满意度较上年度提升78%。'],
      ['<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="20" cy="14" r="7" fill="white"/><path d="M8 36c0-9 4-15 12-15s12 6 12 15z" fill="white"/><path d="M30 39v-9h4v9m3 0V25h4v14m-14 0v-5h4v5" fill="white"/></svg>','4. 人力资源数字化建设','上线人力资源管理系统，实现员工信息管理。通过系统优化，考勤核算准确率提升至100%，薪酬发放周期从5天缩短至2天。'],
    ].map((card,i)=>`<div class="e405-card"><span class="icon">${card[0]}</span><div><b ${attrs(`e405-card-title-${i}`,true)}>${card[1]}</b><span ${attrs(`e405-card-copy-${i}`,true)}>${card[2]}</span></div></div>`).join('')}`, 'e405-list')}
  `,
});

add({
  id: 'e6-05-growth',
  title: '六图排版：个人成长规划',
  width: 1152,
  height: 648,
  relativePath: '图片排版/06-六图/E6-05-六图排版-个人成长规划.html',
  css: photoSharedCss + `
    .photo-header-code{font-size:44px;letter-spacing:-.2px;transform:translateY(-5px) scaleX(.97);transform-origin:left center}
    .photo-header-title{font-size:37px;letter-spacing:.6px;transform:translate(-2px,-5px) scaleX(1.02);transform-origin:left center}
    .e605-label{display:grid;place-items:center;color:#974536;font-family:"Notale Droid",sans-serif;font-size:18px;font-weight:800;isolation:isolate}
    .e605-label:before{content:"";position:absolute;z-index:-1;inset:0;filter:drop-shadow(0 1px 1px rgba(90,58,52,.16))}
    .e605-label.left:before{background:linear-gradient(90deg,#f9d8d0 0%,rgba(249,216,208,0) 90%);clip-path:polygon(10px 0,100% 0,100% 100%,10px 100%,0 50%)}
    .e605-label.right:before{background:linear-gradient(90deg,rgba(249,216,208,0) 0%,#f9d8d0 100%);clip-path:polygon(0 0,calc(100% - 10px) 0,100% 50%,calc(100% - 10px) 100%,0 100%)}
    .e605-label.right{justify-content:center;text-align:center}
    .e605-label>span{display:inline-block;transform:translateY(-1px) scaleX(1.07)}
    .e605-copy{overflow:visible;font-family:"Notale Droid",sans-serif;font-size:15px;line-height:21px;letter-spacing:-.6px;text-align:center}.e605-copy.copy-left{text-align:right}.e605-copy.copy-right{text-align:left}.e605-copy>span{display:block;white-space:nowrap;transform:scaleX(1);transform-origin:center center}.e605-connector{border-top:1px solid #596064}.e605-connector:before{content:"";position:absolute;top:-6px;width:10px;height:10px;border:2px solid #fff;border-radius:50%;background:${C.navy};box-shadow:0 0 0 1px ${C.navy}}
    .e605-connector.left:before{left:0}.e605-connector.right:before{right:0}
    [data-element-id="e605-line-1"]:before,[data-element-id="e605-line-4"]:before,[data-element-id="e605-line-5"]:before{top:-7px}
    .e605-photo{border-radius:0;box-shadow:none}
  `,
  crops: [
    { asset: 'E6-05-六图排版-个人成长规划.assets/building.png', x: 27, y: 83, w: 136, h: 545 },
    { asset: 'E6-05-六图排版-个人成长规划.assets/photo-01.png', x: 707, y: 110, w: 133, h: 80 },
    { asset: 'E6-05-六图排版-个人成长规划.assets/photo-02.png', x: 565, y: 169, w: 153, h: 93 },
    { asset: 'E6-05-六图排版-个人成长规划.assets/photo-03.png', x: 465, y: 253, w: 184, h: 111 },
    { asset: 'E6-05-六图排版-个人成长规划.assets/photo-04.png', x: 618, y: 333, w: 211, h: 122 },
    { asset: 'E6-05-六图排版-个人成长规划.assets/photo-05.png', x: 452, y: 404, w: 228, h: 136 },
    { asset: 'E6-05-六图排版-个人成长规划.assets/photo-06.png', x: 257, y: 478, w: 245, h: 148 },
    { asset: 'E6-05-六图排版-个人成长规划.assets/building-right.png', x: 1060, y: 445, w: 92, h: 203 },
  ],
  body: `
    ${photoHeader('E6-05', '六图排版：个人成长规划')}
    ${photo('e605-building','E6-05-六图排版-个人成长规划.assets/building.png',27,83,136,545,'','background:transparent;','object-fit:cover;')}
    ${el('e605-swoosh', 0, 80, 1152, 568, `<svg viewBox="0 0 1152 568" preserveAspectRatio="none" aria-hidden="true"><path d="M710 95C650 105 585 130 545 175C505 218 503 254 546 286C581 312 604 339 570 375C515 431 369 445 282 487C235 510 207 535 194 568H704C701 530 713 489 755 451C808 402 844 361 831 318C818 277 753 253 683 233C627 217 621 191 659 167C704 139 770 140 848 123C824 105 770 93 710 95Z" fill="#e5e8ef"/><ellipse cx="765" cy="122" rx="112" ry="25" fill="#e5e9ef"/></svg>`, 'e605-swoosh')}
    ${photo('e605-building-right','E6-05-六图排版-个人成长规划.assets/building-right.png',1060,445,92,203,'','background:transparent;','object-fit:cover;')}
    ${[
      ['photo-01.png',707,110,133,80],['photo-02.png',565,169,153,93],['photo-03.png',465,253,184,111],['photo-04.png',618,333,211,122],['photo-05.png',452,404,228,136],['photo-06.png',257,478,245,148],
    ].map((p,i)=>photo(`e605-photo-${i}`,`E6-05-六图排版-个人成长规划.assets/${p[0]}`,p[1],p[2],p[3],p[4],'e605-photo')).join('')}
    ${[
      ['能力培养','主动跨部门沟通，清晰传递研发逻<br>辑，理解业务需求，确保产品设计<br>与市场目标一致。',378,96,163,34,280,147,216,63,319,134,388,'left'],
      ['高效执行','拆分任务优先级，使用甘特图或<br>番茄工作法管理进度，定期同步<br>成果，减少无效返工。',234,277,153,34,146,329,202,63,171,315,294,'left'],
      ['技术精进','持续学习前沿技术、参与行业培<br>训、阅读专业文档、保持技术敏<br>锐度、提升核心竞争力。',113,477,152,34,25,530,202,63,57,517,200,'left'],
      ['用户导向','持续学习前沿技术，参与行业培训、<br>阅读专业文档，保持技术敏锐度，提<br>升核心竞争力。',862,190,152,34,900,242,230,63,840,227,242,'right'],
      ['创新实践','鼓励尝试新工具、方法论，允许合理<br>试错，通过快速原型验证可行性，积<br>累实战经验。',837,339,158,34,879,391,230,63,829,376,232,'right'],
      ['沟通协作','持续学习前沿技术，参与行业培训、<br>阅读专业文档，保持技术敏锐度，提<br>升核心竞争力。',775,503,155,34,816,555,230,63,680,540,317,'right'],
    ].map((d,i)=>`${el(`e605-label-${i}`,d[2],d[3],d[4],d[5],`<span>${d[0]}</span>`,`e605-label ${d[13]}`)}${text(`e605-copy-${i}`,d[6],d[7],d[8],d[9],`<span>${d[1]}</span>`,`e605-copy copy-${d[13]}`)}${el(`e605-line-${i}`,d[10],d[11],d[12],1,'',`e605-connector ${d[13]}`)}`).join('')}
  `,
});

const e606Path = '图片排版/06-六图/E6-06-六图排版-项目发展策略.html';
const e606EdgeStrips = (() => {
  const strips = [];
  const addArea = (x1, y1, x2, y2, exclusions = []) => {
    for (let row = y1; row < y2; row += 1) {
      let segments = [[x1, x2]];
      for (const [x, y, width, height] of exclusions) {
        if (row < y || row >= y + height) continue;
        const next = [];
        for (const [start, end] of segments) {
          if (x >= end || x + width <= start) {
            next.push([start, end]);
            continue;
          }
          if (start < x) next.push([start, x]);
          if (x + width < end) next.push([x + width, end]);
        }
        segments = next;
      }
      for (const [start, end] of segments) {
        if (end > start) strips.push({ row, start, end });
      }
    }
  };

  addArea(0, 89, 675, 313, [
    [5, 145, 295, 148], [319, 108, 139, 183], [479, 108, 187, 142],
  ]);
  addArea(478, 403, 1152, 628, [
    [493, 473, 177, 129], [694, 423, 149, 181], [870, 423, 273, 153],
  ]);
  addArea(710, 86, 1134, 288, [
    [860, 96, 215, 43], [1072, 91, 62, 58], [1018, 157, 110, 38], [724, 198, 404, 70],
  ]);
  addArea(19, 429, 443, 631, [
    [25, 434, 59, 58], [78, 439, 220, 48], [31, 501, 110, 38], [31, 542, 406, 71],
  ]);
  addArea(875, 302, 1138, 389, [
    [890, 323, 48, 45], [979, 323, 48, 45], [1068, 323, 48, 45],
  ]);
  addArea(22, 333, 285, 419, [
    [37, 354, 48, 45], [126, 354, 48, 45], [215, 354, 48, 45],
  ]);
  addArea(450, 287, 485, 322);
  addArea(669, 392, 704, 427);
  return strips;
})();

add({
  id: 'e6-06-strategy',
  title: '六图排版：项目发展策略',
  width: 1152,
  height: 648,
  relativePath: e606Path,
  css: photoSharedCss + `
    .slide:before{content:"";position:absolute;z-index:20;inset:0;pointer-events:none;background:${nativeEdgeStripBackground(e606Path, e606EdgeStrips)}}
    .slide:after{border:0!important;background:${nativeEdgeStripBackground(e606Path, [
      { row: 0, start: 0, end: 1152 }, { row: 647, start: 0, end: 1152 },
      { column: 0, start: 0, end: 648 }, { column: 1151, start: 0, end: 648 },
    ])}!important}
    .photo-page-header{color:#284159}
    .photo-header-code{font-size:43px;letter-spacing:-.6px;transform:translateY(-5px) scaleX(1.02);transform-origin:center center}
    .photo-header-title{font-size:36px;letter-spacing:.6px;transform:translate(-1px,-5px) scaleX(1.04);transform-origin:left center}
    .photo-header-rule{bottom:-2px}.photo-header-rule:before{background:#284159}
    .slide{background:radial-gradient(ellipse at 88% 88%,rgba(228,234,241,.65),rgba(255,255,255,0) 31%),#fff}
    .e606-film{background:var(--film);border:0;box-shadow:0 3px 10px rgba(36,57,70,.14);overflow:hidden}
    .e606-film .photo{border:0;background:transparent}
    .e606-perf{position:absolute;inset:0;z-index:5;pointer-events:none}
    .e606-perf rect{fill:#fff}
    .e606-card{font-size:14px;line-height:1.55;overflow:hidden}
    .e606-card h3{position:relative;display:flex;width:278px;height:56px;align-items:center;justify-content:flex-start;margin:0;padding:0 66px 0 18px;border-radius:6px 6px 0 0;background:var(--tone);color:#fff;text-align:left;font-size:20px}
    .e606-card .copy{position:relative;height:138px;padding:0;text-align:right}
    .e606-card .copy b{position:absolute;z-index:1;top:19px;font-size:20px;line-height:1;letter-spacing:-.7px;white-space:nowrap}
    .e606-card .copy .paragraph{position:absolute;display:block;font-size:14.5px;line-height:21px;letter-spacing:-1px;white-space:nowrap;transform:translateY(5px) scaleX(1.06)}
    [data-element-id="e606-top-card"]{border-width:0 1px 1px 0;border-style:solid;border-color:#ad746b;border-radius:0 6px 12px 0;background:linear-gradient(90deg,#fffdfd 0%,#fdf8f8 25%,#fbf3f2 50%,#f8ecea 75%,#f5e6e1 100%)}
    [data-element-id="e606-top-card"] h3{width:276px;margin-left:auto;padding-left:18px;background:radial-gradient(ellipse 220px 55px at 8% 130%,#a96b62 0%,rgba(150,57,45,0) 72%),linear-gradient(180deg,#9e3b2d,#963a2e);font-size:20.5px}
    [data-element-id="e606-top-card"] .copy b{right:20px}
    [data-element-id="e606-top-card"] .copy b{color:#7f392f;font-size:19px;transform:translate(-3px,0) scaleX(1.04);transform-origin:right center}
    [data-element-id="e606-top-card"] .copy .paragraph{left:10px;right:20px;top:41px;text-align:right;transform-origin:right top}
    [data-element-id="e606-bottom-card"]{border-width:0 0 1px 1px;border-style:solid;border-color:rgba(30,66,116,.45);border-radius:6px 0 0 12px;background:linear-gradient(90deg,#e4e8f0 0%,#e8ebf2 24%,#eff2f7 48%,#f8f9fc 72%,#fff 100%)}
    [data-element-id="e606-bottom-card"] h3{width:275px;height:55px;padding-left:62px!important;background:linear-gradient(168deg,#1e4274 0 68%,#294d7a 82%,#47658b 100%)}
    [data-element-id="e606-bottom-card"] .copy{transform:translateY(1px)}
    [data-element-id="e606-bottom-card"] .copy b{left:18px;color:#284159}
    [data-element-id="e606-bottom-card"] .copy .paragraph{left:18px;right:8px;top:41px;text-align:left;transform-origin:left top}
    [data-element-id="e606-bottom-card"] .e606-card-icon{left:9px;top:6px;width:44px;height:44px}
    [data-element-id="e606-bottom-card"] .e606-card-icon svg{width:36px;height:36px}
    [data-element-id="e606-bottom-card"] h3{font-size:23px;letter-spacing:-1px}
    .e606-bottom-title-copy{display:inline-block;font-family:"Notale CJK",sans-serif;font-size:21px;letter-spacing:-.3px;transform:translate(2px,-1px) scaleX(1.04);transform-origin:left center}
    .e606-card-icon{position:absolute;top:9px;display:grid;width:40px;height:40px;place-items:center;border-radius:50%;background:#fff;color:var(--tone)}
    .e606-card-icon.right{right:10px;top:6px;width:45px;height:45px}.e606-card-icon.left{left:9px}.e606-card-icon svg{width:24px;height:24px}.e606-card-icon.right svg{width:36px;height:36px}
    .e606-metrics{display:flex;gap:22px;justify-content:flex-start}
    .e606-metrics:before{content:"";position:absolute;z-index:0;left:34px;top:27px;width:182px;height:34px;background:color-mix(in srgb,var(--tone) 25%,white);opacity:.8;clip-path:polygon(0 0,50% 67%,100% 0,100% 38%,50% 100%,0 38%)}
    .e606-metric{position:relative;z-index:1;display:grid;width:68px;height:68px;place-items:center;border:6px solid rgba(255,255,255,.66);border-radius:50%;background:var(--metric-gradient);color:#fff;text-align:center;font-size:11px;line-height:1.15;box-shadow:0 0 0 2px color-mix(in srgb,var(--tone) 22%,white),0 3px 9px color-mix(in srgb,var(--tone) 17%,transparent)}
    [data-element-id="e606-top-metrics"]{left:881px!important;top:309px!important;gap:21px}
    [data-element-id="e606-bottom-metrics"]{gap:21px}
    [data-element-id="e606-top-metrics"] .e606-metric{border:5px solid rgba(255,255,255,.85);background:linear-gradient(135deg,rgba(255,255,255,.2) 0 22%,transparent 46%),linear-gradient(150deg,#d0a09b,#b36b63 55%,#873026);line-height:1.35;box-shadow:0 0 0 3px #f7e9e7,0 2px 6px rgba(169,70,52,.16)}
    [data-element-id="e606-bottom-metrics"] .e606-metric{border:5px solid rgba(255,255,255,.82);background:linear-gradient(135deg,rgba(255,255,255,.16) 0 22%,transparent 46%),linear-gradient(160deg,#91a7bb,#5b7c9d 55%,#1b416f);font-family:"Notale Droid",sans-serif;line-height:1.35;box-shadow:0 0 0 3px #e5eaf0,0 2px 5px rgba(36,74,123,.12)}
    .e606-title-copy{display:inline-block;transform-origin:left center}
    [data-element-id="e606-top-card"] .e606-title-copy{font-family:"Notale Droid",sans-serif;font-size:21px;transform:translate(-2px,-1px) scaleX(1.02)}
    .e606-card .copy .paragraph{font-family:"Notale Droid",sans-serif;font-size:14px;letter-spacing:-.2px;transform:translate(-2px,5px) scaleX(1.06)}
    [data-element-id="e606-bottom-card"] .copy .paragraph{transform:translate(-1px,5px) scaleX(1.05)}
    .e606-meta{display:flex;align-items:center;justify-content:flex-end;gap:18px;color:#111;font-size:17px;font-weight:400;letter-spacing:0;white-space:nowrap}.e606-meta span{display:flex;align-items:center;gap:6px}.e606-meta i{display:grid;width:21px;height:21px;place-items:center;border:1.6px solid #111;font-family:Arial,sans-serif;font-size:21px;font-style:normal;line-height:1}.e606-credit{justify-content:flex-end;color:#777;font-size:13px;letter-spacing:0;white-space:nowrap}
    [data-element-id="e606-center-title"]{color:#284159!important;font-size:38px!important;letter-spacing:.5px;-webkit-text-stroke:.35px #284159;text-shadow:3px 5px 3px rgba(100,130,140,.22)}
    .e606-flow-arrow{z-index:3;height:3px;background:var(--tone)}.e606-flow-arrow:after{content:"";position:absolute;right:-1px;top:-6px;border-left:12px solid var(--tone);border-top:7px solid transparent;border-bottom:7px solid transparent}
    .e606-bracket{border-color:${C.navy};border-style:solid}
    [data-element-id="header-title"]{scale:1 1.03}
    [data-element-id="e606-top-title"]{translate:0 .25px}
    [data-element-id="e606-top-metric-0"]{translate:-1.25px .75px;font-weight:500}
    [data-element-id="e606-top-metric-1"]{translate:-.5px .5px}
    [data-element-id="e606-top-metric-2"]{translate:0 .75px;font-weight:600}
    [data-element-id="e606-bottom-metric-0"]{translate:-1.25px 0}
    [data-element-id="e606-bottom-metric-1"]{translate:-.25px 0}
    [data-element-id="e606-bottom-metric-2"]{translate:0 0}
  `,
  crops: [
    { asset: 'E6-06-六图排版-项目发展策略.assets/photo-01.png', x: 5, y: 145, w: 295, h: 148 },
    { asset: 'E6-06-六图排版-项目发展策略.assets/photo-02.png', x: 319, y: 108, w: 139, h: 183, mask: [[0,32],[139,0],[139,142],[0,183]] },
    { asset: 'E6-06-六图排版-项目发展策略.assets/photo-03.png', x: 479, y: 108, w: 187, h: 142 },
    { asset: 'E6-06-六图排版-项目发展策略.assets/photo-04.png', x: 493, y: 473, w: 177, h: 129 },
    { asset: 'E6-06-六图排版-项目发展策略.assets/photo-05.png', x: 694, y: 423, w: 149, h: 181, mask: [[0,36],[149,0],[149,156],[0,181]] },
    { asset: 'E6-06-六图排版-项目发展策略.assets/photo-06.png', x: 870, y: 423, w: 273, h: 153 },
  ],
  body: `
    ${photoHeader('E6-06', '六图排版：项目发展策略')}
    ${el('e606-meta', 758, 25, 364, 25, '<span><i>✓</i>全部可编辑</span><span><i>✓</i>一键换色</span><span><i>✓</i>高效省事</span>', 'e606-meta')}
    ${text('e606-credit', 1017, 55, 103, 20, '@月升ppt', 'e606-credit')}
    ${el('e606-top-swoosh', 0, 78, 500, 50, '<svg viewBox="0 0 500 50" preserveAspectRatio="none"><defs><linearGradient id="e606-swoosh-gradient" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f8eaea"/><stop offset=".52" stop-color="#f5e4e5"/><stop offset="1" stop-color="#fbf4f3"/></linearGradient></defs><path d="M0 32C45 22 80 12 120 11C170 9 210 23 270 43C335 51 410 45 500 31V50H0Z" fill="url(#e606-swoosh-gradient)"/></svg>')}
    ${el('e606-top-film', 0, 89, 675, 224, `${photo('e606-photo-1','E6-06-六图排版-项目发展策略.assets/photo-01.png',5,56,295,148)}${photo('e606-photo-2','E6-06-六图排版-项目发展策略.assets/photo-02.png',319,19,139,183)}${photo('e606-photo-3','E6-06-六图排版-项目发展策略.assets/photo-03.png',479,19,187,142)}<svg class="e606-perf" viewBox="0 0 675 224"><g>${filmPerforationStrip(10,40,305,40,{step:20.1})}${filmPerforationStrip(311.5,40,452,12.5,{step:20.5,offset:20.5})}${filmPerforationStrip(452.7,9,663,9,{offset:20})}${filmPerforationStrip(10,213.6,305,213.6,{step:20.1})}${filmPerforationStrip(311.5,213.6,472,168.2,{step:20.75,offset:20.75})}${filmPerforationStrip(472,169.5,663,169.5,{step:20.1})}</g></svg>`, 'e606-film', '--film:#904434;clip-path:polygon(0 13.8%,45.5% 13.8%,69.5% 0,100% 0,100% 80%,70% 80%,45.5% 99.8%,0 99.8%);')}
    ${el('e606-top-arrow', 725, 109, 96, 3, '', 'e606-flow-arrow', '--tone:#983b2e;transform:rotate(180deg);')}
    ${el('e606-top-card', 713, 89, 418, 196, `<h3 ${attrs('e606-top-title',true)}><span class="e606-title-copy">竞品突发新品冲击战</span><span class="e606-card-icon right"><svg viewBox="0 0 44 44" aria-hidden="true"><rect x="8" y="10" width="22" height="5" rx="1.8" fill="currentColor"/><rect x="8" y="18" width="22" height="5" rx="1.8" fill="currentColor"/><path d="M8.5 25.2c1.2-1.4 3-1.5 4.6-.4l7 5h6.2l-1.5-1.7c-1.3-1.6-.2-3.9 1.9-3.9h4.1c2.4 0 4.6 1.3 5.8 3.4l4.3 7.8c1.1 2-.3 4.4-2.6 4.4h-3.9c-1.1 0-2.2-.4-3-1.2l-5.1-4.5h-7.5c-1.4 0-2.8-.5-3.9-1.4l-6.1-5c-.8-.7-1-1.7-.3-2.5z" fill="currentColor"/></svg></span></h3><div class="copy" ${attrs('e606-top-copy',true)}><b>场景说明</b><span class="paragraph">竞品在618前夕推出同配置轻薄本，价格比我方低200元，且<br>搭载最新处理器，同时发布“旧机折价换购”活动，导致我方预<br>售订单量下降30%。</span></div>`, 'e606-card', '--tone:#983b2e;')}
    ${el('e606-top-metrics', 881, 310, 250, 72, `${['亲密粉<br>浓度','活跃会员<br>浓度','品牌搜索<br>热度'].map((m,i)=>`<span class="e606-metric" ${attrs(`e606-top-metric-${i}`,true)}>${m}</span>`).join('')}`, 'e606-metrics', '--tone:#a94634;--metric-gradient:linear-gradient(160deg,#d38f88,#bb594a 55%,#a83222);')}
    ${text('e606-center-title', 454, 304, 246, 105, '规模复制与\n动态调优', 'center navy-title', 'font-size:38px;line-height:1.2;transform:translate(-1px,1px);')}
    ${el('e606-bracket-tl', 455, 292, 25, 25, '', 'e606-bracket', 'border-width:4px 0 0 4px;border-color:#983b2e;')}
    ${el('e606-bracket-br', 674, 397, 25, 25, '', 'e606-bracket', 'border-width:0 4px 4px 0;')}
    ${el('e606-bottom-metrics', 28, 340, 250, 72, `${['先锋人群<br>浓度','先锋人群<br>渗透','品牌卖点<br>关联度'].map((m,i)=>`<span class="e606-metric" ${attrs(`e606-bottom-metric-${i}`,true)}>${m}</span>`).join('')}`, 'e606-metrics', '--tone:#244a7b;--metric-gradient:linear-gradient(160deg,#6589ad,#345c88 55%,#173e70);')}
    ${el('e606-bottom-card', 22, 432, 418, 196, `<h3 style="justify-content:flex-start;padding-right:10px;text-align:left" ${attrs('e606-bottom-title',true)}><span class="e606-card-icon left"><svg viewBox="0 0 54 54" aria-hidden="true"><circle cx="27" cy="16" r="8" fill="currentColor"/><path d="M14 42c0-10 5-17 13-17 6 0 10 3 12 8-8 0-13 4-15 9z" fill="currentColor"/><g transform="translate(37 38)" fill="none" stroke="currentColor" stroke-width="2"><circle r="7"/><circle r="2.5"/><path d="M0-10v3M0 7v3M-10 0h3M7 0h3M-7-7l2 2M5 5l2 2M7-7L5-5M-5 5l-2 2"/></g></svg></span><span class="e606-bottom-title-copy">产品定位与用户需求</span></h3><div class="copy" ${attrs('e606-bottom-copy',true)}><b>场景说明</b><span class="paragraph">假设目标用户是大学生群体，但营销重点过度强调“RTX4090<br>游戏显卡”“16英寸大屏”等性能卖点，而忽略学生核心需求，<br>结果导致广告点击率仅0.8%，转化率不足2%。</span></div>`, 'e606-card', '--tone:#1e4274;')}
    ${el('e606-bottom-film', 478, 403, 674, 225, `${photo('e606-photo-4','E6-06-六图排版-项目发展策略.assets/photo-04.png',15,70,177,129)}${photo('e606-photo-5','E6-06-六图排版-项目发展策略.assets/photo-05.png',216,20,149,181)}${photo('e606-photo-6','E6-06-六图排版-项目发展策略.assets/photo-06.png',392,20,273,153)}<svg class="e606-perf" viewBox="0 0 674 225"><g>${filmPerforationStrip(21,53.7,201,53.7,{step:20.07})}${filmPerforationStrip(201,53.2,201,53.2)}${filmPerforationStrip(201.5,55.7,372.5,7,{step:20.65,offset:20.65})}${filmPerforationStrip(372.2,10.2,664,10.2,{step:20.1,offset:10})}${filmPerforationStrip(21,215,201,215,{step:20.07})}${filmPerforationStrip(201,213.7,201,213.7)}${filmPerforationStrip(201,215,372,184,{step:20.55,offset:20.55})}${filmPerforationStrip(372,183.9,664,183.9,{step:20.1,offset:10})}</g></svg>`, 'e606-film', '--film:#284464;clip-path:polygon(0 20%,30% 20%,54.5% 0,100% 0,100% 85.8%,54.5% 85.8%,30% 99.6%,0 99.6%);')}
    ${el('e606-arrow-1', 331, 452, 97, 3, '', 'e606-flow-arrow', `--tone:${C.navy};`)}
  `,
});

const e901Path = '图片排版/09-多图/E9-01-多图排版-企业发展愿景.html';
const e901EdgeStrips = (() => {
  const strips = [];
  for (let row = 69; row < 80; row += 1) strips.push({ row, start: 0, end: 700 });
  for (const [x, y, width, height] of [
    [162, 89, 268, 92], [57, 215, 268, 93], [29, 359, 268, 91],
    [57, 497, 268, 91], [390, 536, 267, 91], [722, 536, 269, 91],
    [864, 395, 268, 92], [866, 231, 267, 92], [812, 89, 267, 92],
  ]) {
    for (const row of [
      ...Array.from({ length: 4 }, (_, i) => y - 2 + i),
      ...Array.from({ length: 4 }, (_, i) => y + height - 1 + i),
    ]) strips.push({ row, start: Math.max(0, x - 2), end: Math.min(1152, x + width + 2) });
  }
  return strips;
})();

add({
  id: 'e9-01-ecosystem',
  title: '多图排版：企业发展愿景',
  width: 1152,
  height: 648,
  relativePath: e901Path,
  css: photoSharedCss + `
    .slide:before{content:"";position:absolute;z-index:20;inset:0;pointer-events:none;background:${nativeEdgeStripBackground(e901Path, e901EdgeStrips)}}
    .slide:after{border:0!important;background:${nativeEdgeStripBackground(e901Path, [
      { row: 0, start: 0, end: 1152 }, { row: 647, start: 0, end: 1152 },
      { column: 0, start: 0, end: 648 }, { column: 1151, start: 0, end: 648 },
    ])}!important}
    .slide{background:radial-gradient(ellipse 235px 250px at 15% 50%,rgba(232,198,198,.32),rgba(242,218,216,.17) 45%,rgba(255,255,255,0) 82%),radial-gradient(ellipse 175px 245px at 88% 88%,rgba(212,222,232,.54),rgba(255,255,255,0) 73%),#fff}
    [data-element-id="e901-building"]{z-index:3}
    .e901-building-side{z-index:0;background:transparent}
    [data-element-id="e901-curve"],[data-element-id="e901-lines"]{z-index:1}
    [data-element-id="e901-key-tech"]{z-index:2;overflow:hidden}
    [data-element-id="e901-key-data"],.e901-card{z-index:2}
    .e901-card{padding:0;border:1px solid #3d464b;border-radius:5px;background:#fff;font-size:14px;line-height:1.38}
    .e901-card-text{position:absolute;top:8px;right:6px}
    .e901-card b{display:block;color:${C.navy};font-family:"Notale Droid",sans-serif;font-size:17px;line-height:1.35;margin:0 0 var(--body-gap,2px);font-weight:700;transform:scaleX(.96);transform-origin:left center}
    .e901-card-copy{display:block;white-space:nowrap;color:#121715;font-family:"Notale Droid",sans-serif;font-size:14px;line-height:1.38;transform:translateY(-1px) scaleX(.92);transform-origin:left top}
    .e901-card-photo{z-index:3;border-radius:3px;background:transparent}
    .e901-key{display:flex;flex-direction:column;align-items:center;color:${C.rust};font-size:22px;font-weight:800;line-height:1;text-align:center}
    .e901-key svg{display:block;width:42px;height:38px;margin:0 auto 3px;color:${C.rust}}
    .e901-key b{font-size:22px;line-height:1.1;white-space:nowrap}
    [data-element-id="e901-key-tech"] svg{position:absolute;left:31px;top:0;margin:0}
    [data-element-id="e901-key-tech"] b{position:absolute;left:3px;top:39px;width:90px;text-align:left}
    .e901-meta{display:flex;align-items:center;justify-content:flex-end;gap:18px;color:#111;font-family:"Notale CJK",sans-serif;font-size:17px;font-weight:400;letter-spacing:0;white-space:nowrap}
    .e901-meta span{display:flex;align-items:center;gap:6px}.e901-meta i{display:grid;width:21px;height:21px;place-items:center;border:1.6px solid #111;font-family:Arial,sans-serif;font-size:21px;font-style:normal;line-height:1}
    .e901-credit{justify-content:flex-end;color:#777;font-size:13px;letter-spacing:0;white-space:nowrap}
    [data-element-id="header-code"]{font-size:44px;transform:translate(-1px,-5px) scaleX(.98);transform-origin:left center}
    [data-element-id="header-title"]{font-size:39px;transform:translate(-3px,-5px);transform-origin:left center}
    [data-element-id="header-code"]{scale:1 .98}
    [data-element-id="header-title"]{scale:1 .98;font-weight:500}
    [data-element-id="e901-key-tech"]{translate:1px -1px}
    [data-element-id="e901-key-data"]{translate:-1px -2px;scale:.98 1}
    [data-element-id="e901-card-title-0"]{translate:0 1px;scale:1 .98;font-weight:400}
    [data-element-id="e901-card-title-1"]{scale:1.02 .98}
    [data-element-id="e901-card-copy-1"]{translate:1px 1px}
    [data-element-id="e901-card-title-2"]{translate:1px 0;scale:1 1.02;font-weight:400}
    [data-element-id="e901-card-copy-2"]{translate:1px 1px}
    [data-element-id="e901-card-title-3"]{translate:-2px 0;scale:1 .98;font-size:17.5px;font-weight:400}
    [data-element-id="e901-card-copy-3"]{translate:-2px -1px}
    [data-element-id="e901-card-title-4"]{translate:-1px 1px;scale:1 .98;font-size:17.5px;font-weight:400}
    [data-element-id="e901-card-copy-4"]{translate:0 -1px}
    [data-element-id="e901-card-title-5"]{translate:-1px 1px;scale:1 .98;font-size:17.5px;font-weight:400}
    [data-element-id="e901-card-copy-5"]{translate:0 -1px}
    [data-element-id="e901-card-title-6"]{translate:0 1px;scale:1 .98}
    [data-element-id="e901-card-title-7"]{translate:-1px 0;scale:1.02 .98;font-weight:400}
    [data-element-id="e901-card-title-8"]{scale:1.02 .98}
    [data-element-id="e901-card-copy-8"]{translate:1px 0}
  `,
  crops: [
    { asset: 'E9-01-多图排版-企业发展愿景.assets/building-left.png', x: 340, y: 345, w: 121, h: 143, mask: [[0,143],[5,25],[39,31],[47,110],[55,56],[90,64],[121,55],[121,143]] },
    { asset: 'E9-01-多图排版-企业发展愿景.assets/building-right.png', x: 676, y: 305, w: 105, h: 161, mask: [[0,161],[12,30],[73,0],[105,142],[105,161]] },
    { asset: 'E9-01-多图排版-企业发展愿景.assets/building.png', x: 461, y: 58, w: 204, h: 430 },
    { asset: 'E9-01-多图排版-企业发展愿景.assets/photo-01.png', x: 164, y: 93, w: 98, h: 85 },
    { asset: 'E9-01-多图排版-企业发展愿景.assets/photo-02.png', x: 58, y: 219, w: 102, h: 86 },
    { asset: 'E9-01-多图排版-企业发展愿景.assets/photo-03.png', x: 29, y: 361, w: 101, h: 88 },
    { asset: 'E9-01-多图排版-企业发展愿景.assets/photo-04.png', x: 57, y: 500, w: 102, h: 83 },
    { asset: 'E9-01-多图排版-企业发展愿景.assets/photo-05.png', x: 390, y: 538, w: 99, h: 87 },
    { asset: 'E9-01-多图排版-企业发展愿景.assets/photo-06.png', x: 722, y: 538, w: 99, h: 87 },
    { asset: 'E9-01-多图排版-企业发展愿景.assets/photo-07.png', x: 865, y: 398, w: 101, h: 86 },
    { asset: 'E9-01-多图排版-企业发展愿景.assets/photo-08.png', x: 867, y: 234, w: 100, h: 87 },
    { asset: 'E9-01-多图排版-企业发展愿景.assets/photo-09.png', x: 813, y: 92, w: 100, h: 88 },
  ],
  body: `
    ${photoHeader('E9-01', '多图排版：企业发展愿景')}
    ${el('e901-meta', 758, 25, 364, 25, '<span><i>✓</i>全部可编辑</span><span><i>✓</i>一键换色</span><span><i>✓</i>高效省事</span>', 'e901-meta')}
    ${text('e901-credit', 1017, 55, 103, 20, '@月升ppt', 'e901-credit')}
    ${photo('e901-building-left','E9-01-多图排版-企业发展愿景.assets/building-left.png',340,345,121,143,'e901-building-side','background:transparent;','object-fit:cover;')}
    ${photo('e901-building-right','E9-01-多图排版-企业发展愿景.assets/building-right.png',676,305,105,161,'e901-building-side','background:transparent;','object-fit:cover;')}
    ${photo('e901-building','E9-01-多图排版-企业发展愿景.assets/building.png',461,58,204,430,'','background:transparent;','object-fit:cover;')}
    ${el('e901-curve', 329, 156, 550, 343, `<svg viewBox="0 0 550 343"><defs><linearGradient id="e901-upper" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8d2f24"/><stop offset=".78" stop-color="#a33d2d"/><stop offset="1" stop-color="#c98f7a" stop-opacity="0"/></linearGradient><linearGradient id="e901-lower" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8a2f25"/><stop offset=".56" stop-color="#9f3829"/><stop offset="1" stop-color="#8f352b"/></linearGradient></defs><path class="connector" d="M18 230 C18.5 203 37.4 177 86 132 C137 95 226 49 321 22 C342 16 380 5 410 6" transform="translate(4 1)" stroke="#edb8ad" stroke-width="3" opacity=".68"/><path class="connector" d="M18 230 C11 275 30 304 71 314 C119 335 189 338 246 325 C346 309 452 261 523 201" transform="translate(3 -2)" stroke="#edb8ad" stroke-width="3" opacity=".62"/><path class="connector" d="M18 230 C18.5 203 37.4 177 86 132 C137 95 226 49 321 22 C342 16 380 5 410 6" stroke="url(#e901-upper)" stroke-width="9"/><path class="connector" d="M18 230 C11 275 30 304 71 314 C119 335 189 338 246 325 C346 309 452 261 523 201" stroke="url(#e901-lower)" stroke-width="9"/>${[[18,230],[86,132],[197,63],[346,17],[71,314],[190,332],[313,309],[426,265],[523,202]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="9" fill="#fff" stroke="#943527" stroke-width="2"/><circle cx="${x}" cy="${y}" r="6" fill="#a44838"/>`).join('')}</svg>`)}
    ${el('e901-key-tech', 407, 347, 54, 72, '<svg viewBox="0 0 44 38" aria-hidden="true"><path fill="currentColor" d="M4 4h25v29H4zM9 8v5h4V8zm8 0v5h4V8zM9 17v5h4v-5zm8 0v5h4v-5zM9 26v5h4v-5zm8 0v5h4v-5z"/><circle cx="33" cy="27" r="9" fill="currentColor"/><path d="M33 21v12M27 27h12" stroke="#fff" stroke-width="2"/></svg><b>技术整合</b>', 'e901-key')}
    ${el('e901-key-data', 669, 232, 88, 70, '<svg viewBox="0 0 44 38" aria-hidden="true"><path fill="currentColor" d="M22 1 8 13h3v4h22v-4h3zM7 19h30v4H7zm3 6h5v8h4v-8h6v8h4v-8h5v8h4v4H6v-4h4z"/><rect x="20" y="8" width="4" height="6" fill="#fff"/></svg><b>数据整合</b>', 'e901-key')}
    ${el('e901-lines', 114, 128, 915, 460, `<svg viewBox="0 0 915 460">${['M315 7H353L412 91','M210 135H235L301 160','M182 277H203L233 258','M210 413H244L286 342','M405 408V360','M608 456H575L528 337','M751 316H699L641 293','M896 195L816 230H738','M698 7H617L561 45'].map(d=>`<path class="connector" d="${d}" stroke="#7e8581" stroke-width="1" stroke-dasharray="5 4"/>`).join('')}</svg>`)}
    ${[
      ['合作品牌','行业大品牌的供应商，大<br>型国际国内活动的供应商',162,89,268,92,164,93,98,85,272,11,4],
      ['品质控制','行业高标准的质量管理体<br>系，把关步骤严格',57,215,268,93,58,219,102,86,167,13,2],
      ['品牌效应','各种正式的榜单荣誉，各<br>种部门授予的资质',29,359,268,91,29,361,101,88,139,12,2],
      ['企业资质','广告投播情况、媒体合作<br>情况、宣传推广情况',57,497,268,91,57,500,102,83,169,11,3],
      ['项目复盘','具有规模化生产优势等客<br>观原因、自带价格优势',390,536,267,91,390,538,99,87,500,10,4],
      ['评估价值','使用周期更长、使用后更<br>容易得到下游认可',722,536,269,91,722,538,99,87,834,10,4],
      ['按时交付','生产效率快、同时能调动<br>多台生产机器等',864,395,268,92,865,398,101,86,974,11,4],
      ['售后服务','支持免费有样免费打样，<br>支持售后上门服务',866,231,267,92,867,234,100,87,975,13,3],
      ['门店经营','及时更新产品到不同门店<br>中，确保新品上市',812,89,267,92,813,92,100,88,921,13,3],
    ].map((c,i)=>`${el(`e901-card-${i}`,c[2],c[3],c[4],c[5],`<div class="e901-card-text" style="left:${c[10]-c[2]}px;top:${c[11]}px;--body-gap:${c[12]}px"><b ${attrs(`e901-card-title-${i}`,true)}>${c[0]}</b><span class="e901-card-copy" ${attrs(`e901-card-copy-${i}`,true)}>${c[1]}</span></div>`,'e901-card')}${photo(`e901-photo-${i}`,`E9-01-多图排版-企业发展愿景.assets/photo-0${i+1}.png`,c[6],c[7],c[8],c[9],'e901-card-photo','','object-fit:cover;')}`).join('')}
  `,
});

add({
  id: 'e9-02-promotion',
  title: '多图排版高端机型推广',
  width: 1152,
  height: 648,
  relativePath: '图片排版/09-多图/E9-02-多图排版-高端机型推广.html',
  css: photoSharedCss + `
    .slide>.el{z-index:2}
    [data-element-id="e902-mosaic-bg"]{z-index:0!important;pointer-events:none}
    .e902-mosaic .photo{border:0;background:transparent}
    .e902-meta{display:flex;align-items:center;justify-content:flex-end;gap:18px;color:#111;font-size:17px;font-weight:400;letter-spacing:0;white-space:nowrap}.e902-meta span{display:flex;align-items:center;gap:6px}.e902-meta i{display:grid;width:21px;height:21px;place-items:center;border:1.6px solid #111;font-family:Arial,sans-serif;font-size:21px;font-style:normal;line-height:1}.e902-credit{justify-content:flex-end;color:#777;font-size:13px;letter-spacing:0;white-space:nowrap}
    [data-element-id="e902-title"]{transform:translateY(-2px) scaleX(1.015);transform-origin:left center}
    [data-element-id="e902-copy"]{align-items:flex-start;padding-top:5px;line-height:1.62;transform:scaleX(.98);transform-origin:left top}
    [data-element-id="e902-subtitle"]{transform:translateY(-6px);transform-origin:left center}
    [data-element-id="e902-subcopy"]{align-items:flex-start;padding-top:7px;line-height:1.65;transform:scaleX(.99);transform-origin:left top}
    [data-element-id="e902-icon"] svg{display:block;width:34px;height:28px}
    .e902-stat{color:${C.rust}}
    .e902-stat .laurel{position:absolute;top:0;width:36px;height:58px}
    .e902-stat .laurel.left{left:0}.e902-stat .laurel.right{right:0;transform:scaleX(-1)}
    .e902-stat .value{position:absolute;left:54px;top:-3px;font-size:35px;line-height:1}
    .e902-stat .value small{font-size:15px}
    .e902-stat .label{position:absolute;left:32px;right:25px;top:34px;text-align:center;font-size:15px;color:#773e34;white-space:nowrap}
    .e902-stat.wide .value{left:70px}.e902-stat.wide .label{left:38px;right:24px}
  `,
  crops: [
    { asset: 'E9-02-多图排版-高端机型推广.assets/photo-01.png', x: 484, y: 186, w: 245, h: 120 },
    { asset: 'E9-02-多图排版-高端机型推广.assets/photo-02.png', x: 729, y: 130, w: 215, h: 153 },
    { asset: 'E9-02-多图排版-高端机型推广.assets/photo-03.png', x: 944, y: 103, w: 207, h: 151 },
    { asset: 'E9-02-多图排版-高端机型推广.assets/photo-04.png', x: 484, y: 308, w: 245, h: 109 },
    { asset: 'E9-02-多图排版-高端机型推广.assets/photo-05.png', x: 729, y: 284, w: 215, h: 132 },
    { asset: 'E9-02-多图排版-高端机型推广.assets/photo-06.png', x: 944, y: 255, w: 207, h: 150 },
    { asset: 'E9-02-多图排版-高端机型推广.assets/photo-07.png', x: 484, y: 419, w: 245, h: 115 },
    { asset: 'E9-02-多图排版-高端机型推广.assets/photo-08.png', x: 729, y: 418, w: 215, h: 175 },
    { asset: 'E9-02-多图排版-高端机型推广.assets/photo-09.png', x: 944, y: 407, w: 207, h: 207 },
  ],
  body: `
    ${photoHeader('E9-02', '多图排版')}
    ${el('e902-meta', 758, 25, 364, 25, '<span><i>✓</i>全部可编辑</span><span><i>✓</i>一键换色</span><span><i>✓</i>高效省事</span>', 'e902-meta')}
    ${text('e902-credit', 1017, 55, 103, 20, '@月升ppt', 'e902-credit')}
    ${text('e902-title', 43, 169, 400, 54, '高端机型推广突破', 'navy-title', 'font-size:38px;')}
    ${text('e902-copy', 43, 222, 405, 91, '主导“旗舰机型体验活动”，通过场景化演示<br>（如摄影功能户外实测、性能游戏对比）提升<br>客户转化率', 'body-copy', 'font-size:17px;')}
    ${el('e902-icon', 43, 347, 49, 40, '<svg viewBox="0 0 34 28" aria-hidden="true"><rect x="1" y="2" width="32" height="22" rx="1" fill="none" stroke="currentColor" stroke-width="2"/><path d="M5 18l6-6 5 4 6-8 7 5M12 26h10M17 23v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>', 'matrix-cell', `background:${C.rust};color:#fff;border-radius:4px;`)}
    ${text('e902-subtitle', 101, 344, 250, 45, '商家效能提升', 'rust-title', 'font-size:22px;')}
    ${el('e902-subline', 101, 382, 328, 2, '', '', `background:${C.rust};`)}
    ${text('e902-subcopy', 44, 389, 390, 61, '商家平均动销率从 42% 提升至 68%，增长<br>62%，中小商家月均营收增长58%。', 'body-copy', 'font-size:16px;')}
    ${el('e902-stat-1', 43, 476, 159, 63, `<svg class="laurel left" viewBox="0 0 36 58" aria-hidden="true"><path d="M29 4C9 17 5 39 18 55" fill="none" stroke="${C.rust}" stroke-width="1.4"/>${[[27,7,42],[22,11,36],[17,16,30],[13,22,23],[10,29,15],[9,37,5],[11,45,-8],[16,52,-20]].map(v=>`<ellipse cx="${v[0]}" cy="${v[1]}" rx="2.5" ry="5.4" fill="${C.rust}" transform="rotate(${v[2]} ${v[0]} ${v[1]})"/>`).join('')}</svg><span class="value" ${attrs('e902-stat-value-1',true)}>68<small>%</small></span><span class="label" ${attrs('e902-stat-label-1',true)}>高端机型占比</span><svg class="laurel right" viewBox="0 0 36 58" aria-hidden="true"><path d="M29 4C9 17 5 39 18 55" fill="none" stroke="${C.rust}" stroke-width="1.4"/>${[[27,7,42],[22,11,36],[17,16,30],[13,22,23],[10,29,15],[9,37,5],[11,45,-8],[16,52,-20]].map(v=>`<ellipse cx="${v[0]}" cy="${v[1]}" rx="2.5" ry="5.4" fill="${C.rust}" transform="rotate(${v[2]} ${v[0]} ${v[1]})"/>`).join('')}</svg>`, 'e902-stat')}
    ${el('e902-stat-2', 230, 476, 207, 63, `<svg class="laurel left" viewBox="0 0 36 58" aria-hidden="true"><path d="M29 4C9 17 5 39 18 55" fill="none" stroke="${C.rust}" stroke-width="1.4"/>${[[27,7,42],[22,11,36],[17,16,30],[13,22,23],[10,29,15],[9,37,5],[11,45,-8],[16,52,-20]].map(v=>`<ellipse cx="${v[0]}" cy="${v[1]}" rx="2.5" ry="5.4" fill="${C.rust}" transform="rotate(${v[2]} ${v[0]} ${v[1]})"/>`).join('')}</svg><span class="value" ${attrs('e902-stat-value-2',true)}>89<small>万元</small></span><span class="label" ${attrs('e902-stat-label-2',true)}>门店高端机销售额</span><svg class="laurel right" viewBox="0 0 36 58" aria-hidden="true"><path d="M29 4C9 17 5 39 18 55" fill="none" stroke="${C.rust}" stroke-width="1.4"/>${[[27,7,42],[22,11,36],[17,16,30],[13,22,23],[10,29,15],[9,37,5],[11,45,-8],[16,52,-20]].map(v=>`<ellipse cx="${v[0]}" cy="${v[1]}" rx="2.5" ry="5.4" fill="${C.rust}" transform="rotate(${v[2]} ${v[0]} ${v[1]})"/>`).join('')}</svg>`, 'e902-stat wide')}
    ${el('e902-mosaic-bg', 300, 40, 852, 608, `<svg viewBox="0 0 852 608" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="e902-top" x1="0" x2="1"><stop stop-color="#fff"/><stop offset=".72" stop-color="#e8f0f7"/><stop offset="1" stop-color="#dce8f2"/></linearGradient><linearGradient id="e902-bottom" x1="0" x2="1"><stop stop-color="#fff"/><stop offset=".34" stop-color="#faeeec"/><stop offset="1" stop-color="#dfa099"/></linearGradient></defs><path d="M0 24C270 11 565 -10 852 17V69C565 41 292 52 0 116Z" fill="url(#e902-top)"/><path d="M0 468C183 483 389 510 568 560C676 590 772 590 852 565V597C756 617 650 612 521 590C337 559 157 519 0 495Z" fill="url(#e902-bottom)"/></svg>`, '', 'z-index:1;')}
    ${el('e902-mosaic', 484, 103, 668, 511, `${[
      ['photo-01.png',0,83,245,120],['photo-02.png',245,27,215,153],['photo-03.png',460,0,207,151],
      ['photo-04.png',0,205,245,109],['photo-05.png',245,181,215,132],['photo-06.png',460,152,207,150],
      ['photo-07.png',0,316,245,115],['photo-08.png',245,315,215,175],['photo-09.png',460,304,207,207],
    ].map((p,i)=>photo(`e902-photo-${i}`,`E9-02-多图排版-高端机型推广.assets/${p[0]}`,p[1],p[2],p[3],p[4])).join('')}`, 'e902-mosaic')}
  `,
});

// Page definitions are grouped below by visual family.

function pageCode(page) {
  const name = path.basename(page.relativePath, '.html');
  if (/^P\d{3}/.test(name)) return name.match(/^P\d{3}/)[0];
  if (/^00/.test(name)) return '00';
  return name.match(/^[A-Z]\d+-\d+/)?.[0] || page.id;
}

function watermarkMasks(page) {
  if (page.relativePath.startsWith('图片排版/')) {
    return [{ x: 742, y: 8, width: 399, height: 69 }];
  }
  if (page.width >= 1200) {
    const masks = [{ x: 963, y: 5, width: 226, height: 58 }];
    if (['P003', 'P008', 'P015', 'P017', 'P021'].includes(pageCode(page))) {
      masks.push({ x: 820, y: 632, width: 369, height: 51 });
    }
    return masks;
  }
  if (page.width >= 800) {
    return [{ x: 625, y: 3, width: 177, height: 35 }];
  }
  return [{ x: 309, y: 2, width: 82, height: 28 }];
}

ensureSharedFonts();

for (const page of pages) {
  const target = path.join(organizedRoot, page.relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  cropAssets(page);
  fs.writeFileSync(target, renderPage(page));
}

const auditManifest = {
  version: 1,
  generatedAt: new Date().toISOString(),
  pages: pages.map((page) => ({
    id: page.id,
    code: pageCode(page),
    title: page.title,
    category: page.relativePath.startsWith('思维模型/') ? 'mind' : 'photo',
    width: page.width,
    height: page.height,
    html: page.relativePath,
    source: page.relativePath.replace(/\.html$/, '.png'),
    prompt: page.relativePath.replace(/\.html$/, '.md'),
    watermarkMasks: watermarkMasks(page),
  })),
};
fs.writeFileSync(path.join(organizedRoot, 'native-template-manifest.json'), `${JSON.stringify(auditManifest, null, 2)}\n`);

console.log(`Built ${pages.length} native HTML templates.`);
