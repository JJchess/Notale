import { escapeHtml } from './lib/io.mjs';
import { resolveBinding, validateNativeScene } from './native-scene.mjs';

function px(value) { return `${Math.round(value * 1000) / 1000}px`; }
function safeColor(value, fallback = 'transparent') {
  const text = String(value || '').trim();
  return /^(?:#[0-9a-f]{3,8}|rgba?\([\d.,%\s]+\)|hsla?\([\d.,%\s]+\)|transparent|white|black)$/i.test(text) ? text : fallback;
}
function safeShadow(value) {
  const text = String(value || '').trim();
  return text && !/[;{}<>]/.test(text) ? text : 'none';
}
function rect(node, canvas) {
  return {
    x: node.bbox.x * canvas.width,
    y: node.bbox.y * canvas.height,
    w: node.bbox.w * canvas.width,
    h: node.bbox.h * canvas.height,
  };
}
function nodeStyle(node, canvas) {
  const box = rect(node, canvas);
  const style = node.style || {};
  return [
    `left:${px(box.x)}`, `top:${px(box.y)}`, `width:${px(box.w)}`, `height:${px(box.h)}`, `z-index:${Number(node.z || 0)}`,
    style.color ? `color:${safeColor(style.color, '#14243a')}` : '',
    style.background ? `background:${safeColor(style.background)}` : '',
    style.fontSize ? `font-size:${px(style.fontSize)}` : '',
    style.fontWeight ? `font-weight:${Math.round(style.fontWeight)}` : '',
    style.borderRadius != null ? `border-radius:${style.borderRadius >= 999 ? '999px' : px(style.borderRadius)}` : '',
    style.borderWidth ? `border:${px(style.borderWidth)} solid ${safeColor(style.borderColor, '#cbd5e1')}` : '',
    style.opacity != null ? `opacity:${style.opacity}` : '',
    style.align ? `text-align:${style.align}` : '',
    style.shadow ? `box-shadow:${safeShadow(style.shadow)}` : '',
    style.rotation ? `transform:rotate(${Number(style.rotation)}deg)` : '',
  ].filter(Boolean).join(';');
}

function textNode(node, page, canvas) {
  const value = resolveBinding(page, node.binding);
  const tag = node.role === 'title' ? 'h1' : node.role === 'code' ? 'pre' : 'div';
  return `<${tag} class="native-node native-text role-${escapeHtml(node.role)}" data-native-node-id="${escapeHtml(node.id)}" data-binding-kind="${escapeHtml(node.binding.kind)}" data-editable="text" contenteditable="true" spellcheck="false" style="${nodeStyle(node, canvas)}">${escapeHtml(value)}</${tag}>`;
}

function shapeNode(node, canvas) {
  const shape = node.shape || 'rect';
  const variant = String(node.variant || '');
  const count = Math.max(1, Math.min(12, Number(variant.match(/-(\d+)$/)?.[1] || 1)));
  let body = '';
  const signature = `${node.id} ${node.role} ${variant}`.toLowerCase();
  if (/punnett|棋盘/.test(signature)) body = Array.from({ length: 4 }, (_, index) => `<i class="native-punnett-cell"><b></b><b></b></i>`).join('');
  else if (variant.startsWith('native-lego-')) body = Array.from({ length: count }, (_, index) => `<i class="native-lego-piece" style="--item:${index}"><b></b><b></b><b></b><b></b></i>`).join('');
  else if (variant.startsWith('native-puzzle-')) body = Array.from({ length: count }, (_, index) => `<i class="native-puzzle-piece" style="--item:${index}"></i>`).join('');
  else if (variant.startsWith('native-orb-')) body = Array.from({ length: count }, (_, index) => `<i class="native-orb" style="--item:${index}"></i>`).join('');
  else if (variant.includes('painterly') || /fusion-illustration|融合遗传隐喻/.test(signature)) body = '<i class="native-paint red"></i><strong>+</strong><i class="native-paint white"></i><em>↓</em><i class="native-paint pink"></i>';
  else if (shape === 'line' || variant.includes('arrow')) body = '<i class="native-line-arrow"></i>';
  const cluster = body ? ' native-object-cluster' : '';
  const semantic = body ? ' data-semantic-owner="dom-svg"' : '';
  const columns = /punnett|棋盘/.test(signature) ? 2 : variant.startsWith('native-orb-') ? Math.ceil(Math.sqrt(count)) : variant.startsWith('native-lego-') && count >= 6 ? 4 : null;
  return `<div class="native-node native-shape shape-${escapeHtml(shape)}${cluster}" data-native-node-id="${escapeHtml(node.id)}" data-native-variant="${escapeHtml(variant)}"${semantic} aria-hidden="true" style="${nodeStyle(node, canvas)}${columns ? `;grid-template-columns:repeat(${columns},1fr)` : ''}">${body}</div>`;
}

function assetNode(node, assetById, outputById, canvas) {
  const asset = assetById.get(node.assetId);
  const output = outputById.get(node.assetId);
  if (!asset || !output?.file) return `<div class="native-node native-asset-fallback" data-native-node-id="${escapeHtml(node.id)}" aria-hidden="true" style="${nodeStyle(node, canvas)}"></div>`;
  return `<img class="native-node native-asset role-${escapeHtml(asset.role)}" data-native-node-id="${escapeHtml(node.id)}" data-native-asset-id="${escapeHtml(asset.id)}" data-asset-role="${escapeHtml(asset.role)}" src="${escapeHtml(output.file)}" alt="" draggable="false" style="${nodeStyle(node, canvas)}">`;
}

function graphLayout(graph, width, height) {
  const nodes = graph?.nodes || [];
  if (!nodes.length) return [];
  const incoming = new Map(nodes.map(item => [item.id, 0]));
  const outgoing = new Map(nodes.map(item => [item.id, []]));
  for (const edge of graph.edges || []) {
    incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1);
    outgoing.get(edge.from)?.push(edge.to);
  }
  const roots = nodes.filter(item => incoming.get(item.id) === 0);
  const queue = (roots.length ? roots : [nodes[0]]).map(item => [item.id, 0]);
  const depth = new Map();
  while (queue.length) {
    const [id, level] = queue.shift();
    if ((depth.get(id) ?? -1) >= level) continue;
    depth.set(id, level);
    for (const next of outgoing.get(id) || []) queue.push([next, level + 1]);
  }
  nodes.forEach(item => { if (!depth.has(item.id)) depth.set(item.id, 0); });
  const groups = new Map();
  for (const item of nodes) {
    const level = depth.get(item.id);
    if (!groups.has(level)) groups.set(level, []);
    groups.get(level).push(item);
  }
  const levels = [...groups.keys()].sort((a, b) => a - b);
  const radius = Math.max(42, Math.min(76, width / Math.max(nodes.length * 2.2, 8)));
  const result = [];
  for (const [columnIndex, level] of levels.entries()) {
    const items = groups.get(level);
    for (const [rowIndex, item] of items.entries()) {
      result.push({
        ...item,
        x: levels.length === 1 ? width / 2 : radius + columnIndex * ((width - radius * 2) / Math.max(1, levels.length - 1)),
        y: height * (rowIndex + 1) / (items.length + 1),
        radius,
      });
    }
  }
  return result;
}

function diagramNode(node, page, canvas) {
  const box = rect(node, canvas);
  const layout = graphLayout(page.graph, box.w, box.h);
  const byId = new Map(layout.map(item => [item.id, item]));
  const marker = `arrow-${page.id}-${node.id}`.replace(/[^a-z0-9_-]/gi, '-');
  const edges = (page.graph?.edges || []).map(edge => {
    const from = byId.get(edge.from), to = byId.get(edge.to);
    if (!from || !to) return '';
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const x1 = from.x + Math.cos(angle) * from.radius;
    const y1 = from.y + Math.sin(angle) * from.radius;
    const x2 = to.x - Math.cos(angle) * (to.radius + 12);
    const y2 = to.y - Math.sin(angle) * (to.radius + 12);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" marker-end="url(#${marker})"></line>`;
  }).join('');
  const labels = layout.map(item => `<div class="native-graph-node" data-graph-node-id="${escapeHtml(item.id)}" data-editable="graph-label" contenteditable="true" spellcheck="false" style="left:${px(item.x - item.radius)};top:${px(item.y - item.radius)};width:${px(item.radius * 2)};height:${px(item.radius * 2)}">${escapeHtml(item.label)}</div>`).join('');
  return `<div class="native-node native-diagram" data-native-node-id="${escapeHtml(node.id)}" data-semantic-owner="svg" style="${nodeStyle(node, canvas)}">
    <svg class="native-edge-layer" viewBox="0 0 ${box.w} ${box.h}" aria-hidden="true"><defs><marker id="${marker}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z"></path></marker></defs>${edges}</svg>${labels}
  </div>`;
}

function chartNode(node, page, canvas) {
  const series = page.series || [];
  const box = rect(node, canvas);
  const numeric = series.map(item => Number(item.value)).filter(Number.isFinite);
  const max = Math.max(1, ...numeric);
  const bars = series.map((item, index) => {
    const ratio = Number.isFinite(Number(item.value)) ? Number(item.value) / max : .25;
    return `<div class="native-bar-column" style="width:${100 / Math.max(series.length, 1)}%">
      <div class="native-bar-value" data-editable="metric" contenteditable="true">${escapeHtml(item.value)}</div>
      <div class="native-bar" style="height:${Math.max(6, ratio * 100)}%"></div>
      <div class="native-bar-label" data-editable="series-label" contenteditable="true">${escapeHtml(item.label)}</div>
    </div>`;
  }).join('');
  return `<div class="native-node native-chart" data-native-node-id="${escapeHtml(node.id)}" data-semantic-owner="dom-svg" style="${nodeStyle(node, canvas)}"><svg viewBox="0 0 ${box.w} ${box.h}" aria-hidden="true"><line x1="44" y1="10" x2="44" y2="${box.h - 48}"></line><line x1="44" y1="${box.h - 48}" x2="${box.w - 10}" y2="${box.h - 48}"></line></svg><div class="native-bars">${bars}</div></div>`;
}

function decorativeSvg(node, canvas) {
  const box = rect(node, canvas);
  const variant = `${node.variant || ''} ${node.id || ''} ${node.role || ''}`.toLowerCase();
  let body;
  if (node.svgPaths?.length) {
    body = node.svgPaths.map(item => `<path d="${escapeHtml(item.d)}" fill="${safeColor(item.fill, 'none')}" stroke="${safeColor(item.stroke, 'none')}" stroke-width="${Number(item.strokeWidth || 0)}" opacity="${Number(item.opacity ?? 1)}"></path>`).join('');
  } else if (variant.includes('dna') || variant.includes('helix')) {
    const pointsA = [], pointsB = [], rungs = [];
    for (let i = 0; i <= 16; i += 1) {
      const y = i * box.h / 16;
      const a = box.w * (.5 + .32 * Math.sin(i * Math.PI / 4));
      const b = box.w * (.5 - .32 * Math.sin(i * Math.PI / 4));
      pointsA.push(`${a},${y}`); pointsB.push(`${b},${y}`);
      if (i % 2 === 0) rungs.push(`<line x1="${a}" y1="${y}" x2="${b}" y2="${y}"></line>`);
    }
    body = `<polyline class="strand-a" points="${pointsA.join(' ')}"></polyline><polyline class="strand-b" points="${pointsB.join(' ')}"></polyline>${rungs.join('')}`;
  } else if (variant.includes('chromosome')) {
    const count = Math.max(1, Math.min(6, Number(variant.match(/-(\d+)$/)?.[1] || 2)));
    const chromosomes = Array.from({ length: count }, (_, index) => {
      const cx = (index + 1) * 1000 / (count + 1);
      const spread = Math.min(95, 360 / count);
      return `<path d="M ${cx - spread} 150 C ${cx - spread * .35} 330 ${cx + spread * .35} 670 ${cx + spread} 850 M ${cx + spread} 150 C ${cx + spread * .35} 330 ${cx - spread * .35} 670 ${cx - spread} 850" stroke="${safeColor(index % 2 ? node.style?.borderColor : node.style?.color, '#f97316')}" stroke-width="42"></path><circle cx="${cx}" cy="500" r="34" fill="${safeColor(node.style?.background, '#fbbf24')}"></circle>`;
    }).join('');
    body = `<circle cx="500" cy="500" r="450" fill="rgba(190,225,245,.16)" stroke="rgba(190,225,245,.52)" stroke-width="18"></circle>${chromosomes}`;
  } else if (variant.includes('pedigree')) {
    body = `<path d="M 500 120 V 300 M 220 300 H 780 M 220 300 V 520 M 500 300 V 520 M 780 300 V 520" stroke-width="20"></path><circle cx="500" cy="110" r="72"></circle><rect x="148" y="500" width="144" height="144" rx="24"></rect><circle cx="500" cy="572" r="72"></circle><rect x="708" y="500" width="144" height="144" rx="24"></rect>`;
  } else if (variant.includes('gene-puzzle') || variant.includes('central-diagram')) {
    body = `<path d="M 110 390 H 410 V 160 H 590 V 390 H 890 V 610 H 590 V 840 H 410 V 610 H 110 Z" fill="rgba(251,191,36,.72)" stroke-width="24"></path><circle cx="500" cy="500" r="94" fill="rgba(37,99,235,.84)"></circle>`;
  } else if (variant.includes('arrow') || variant.includes('connector') || variant.includes('line')) {
    body = `<path d="M 18 ${box.h * .5} H ${Math.max(24, box.w - 42)}"></path><path d="M ${Math.max(18, box.w - 72)} ${box.h * .25} L ${Math.max(24, box.w - 18)} ${box.h * .5} L ${Math.max(18, box.w - 72)} ${box.h * .75}"></path>`;
  } else if (variant.includes('brace')) {
    body = `<path d="M ${box.w - 8} 6 C ${box.w * .35} 6 ${box.w * .7} ${box.h * .42} 8 ${box.h * .5} C ${box.w * .7} ${box.h * .58} ${box.w * .35} ${box.h - 6} ${box.w - 8} ${box.h - 6}"></path>`;
  } else {
    body = `<path d="M 8 ${box.h * .72} C ${box.w * .24} ${box.h * .12}, ${box.w * .58} ${box.h * .86}, ${box.w - 8} ${box.h * .25}"></path><circle cx="${box.w * .2}" cy="${box.h * .45}" r="9"></circle><circle cx="${box.w * .65}" cy="${box.h * .61}" r="12"></circle>`;
  }
  const viewBox = node.svgPaths?.length || /chromosome|pedigree|gene-puzzle|central-diagram/.test(variant) ? '0 0 1000 1000' : `0 0 ${box.w} ${box.h}`;
  return `<svg class="native-node native-decorative-svg" data-native-node-id="${escapeHtml(node.id)}" viewBox="${viewBox}" preserveAspectRatio="none" aria-hidden="true" style="${nodeStyle(node, canvas)}">${body}</svg>`;
}

function css3dNode(node, page, canvas, outputById) {
  const labels = (page.displayCopy || []).map(item => item.text).filter(Boolean);
  if (!labels.length) labels.push(page.title, page.coreLogic || page.purpose);
  const visualAsset = [...outputById.values()].find(item => ['illustration', 'cutout', 'photo'].includes(item.role));
  const cells = Array.from({ length: 6 }, (_, index) => `<div class="native-copy-cell cell-${index + 1}" aria-hidden="true"></div>`).join('');
  const bricks = Array.from({ length: 8 }, (_, index) => `<i style="--brick:${index}" aria-hidden="true"></i>`).join('');
  const art = visualAsset?.file
    ? `<img src="${escapeHtml(visualAsset.file)}" alt="" draggable="false">`
    : '<svg viewBox="0 0 600 300" aria-hidden="true"><path d="M30 210 C130 10 260 280 350 75 S520 45 570 180"></path><circle cx="178" cy="110" r="45"></circle><circle cx="410" cy="155" r="62"></circle></svg>';
  const callouts = labels.slice(0, 3).map((label, index) => `<div class="native-3d-callout callout-${index + 1}" data-editable="callout" contenteditable="true">${escapeHtml(label)}</div>`).join('');
  return `<div class="native-node native-3d" data-native-node-id="${escapeHtml(node.id)}" data-native-interactive="css3d" tabindex="0" role="group" aria-label="可交互分层结构：拖动旋转，点击展开，方向键调整" style="${nodeStyle(node, canvas)};--native-rx:${Number(node.tilt || 56)}deg;--native-rz:-12deg">
    <div class="native-3d-stage">
      <div class="native-plane native-plane-base">${bricks}<b class="native-plane-label" data-editable="layer-copy" contenteditable="true">${escapeHtml(labels[0] || page.title)}</b></div>
      <div class="native-plane native-plane-copy">${cells}<b class="native-plane-label" data-editable="layer-copy" contenteditable="true">${escapeHtml(labels[1] || labels[0] || page.title)}</b></div>
      <div class="native-plane native-plane-art">${art}<b class="native-plane-label" data-editable="layer-copy" contenteditable="true">${escapeHtml(labels[2] || labels[1] || labels[0] || page.title)}</b></div>
    </div>
    <svg class="native-callout-lines" viewBox="0 0 1000 600" aria-hidden="true"><path d="M160 390 L75 470 L20 470"></path><path d="M730 170 L870 70 L980 70"></path><path d="M710 360 L875 445 L980 445"></path></svg>
    ${callouts}
  </div>`;
}

function materializedNodes(scene) {
  const css3dIds = new Set(scene.nodes.filter(node => node.type === 'css3d').map(node => node.id));
  const result = scene.nodes.filter(node => !node.parentId || !css3dIds.has(node.parentId));
  const used = new Set(result.map(node => node.assetId).filter(Boolean));
  for (const [index, asset] of scene.assets.entries()) {
    if (used.has(asset.id)) continue;
    result.push({
      id: `asset-node-${asset.id}`, type: 'image', role: asset.role, parentId: null, bbox: asset.bbox,
      z: asset.role === 'background' ? 0 : Math.min(20, 4 + index), binding: { kind: 'none', index: null, key: null },
      style: {}, variant: null, shape: 'none', assetId: asset.id, depth: 0, tilt: 0,
    });
  }
  return result;
}

export function renderNativeScene({ scene, page, design, assetManifest = [] }) {
  validateNativeScene(scene, { pageId: page.id, allowWebgl: scene.mode === 'webgl-exception' });
  const prefix = `[data-page-id="${page.id}"]`;
  const canvas = scene.canvas;
  const assetById = new Map(scene.assets.map(item => [item.id, item]));
  const outputById = new Map(assetManifest.filter(item => item.status === 'pass').map(item => [item.id, item]));
  const body = materializedNodes(scene).sort((a, b) => a.z - b.z).map(node => {
    if (node.type === 'text') return textNode(node, page, canvas);
    if (node.type === 'shape') return shapeNode(node, canvas);
    if (node.type === 'image') return assetNode(node, assetById, outputById, canvas);
    if (node.type === 'diagram') return diagramNode(node, page, canvas);
    if (node.type === 'chart') return chartNode(node, page, canvas);
    if (node.type === 'svg') return decorativeSvg(node, canvas);
    if (node.type === 'css3d') return css3dNode(node, page, canvas, outputById);
    return '';
  }).join('\n');
  const html = `<section data-page-id="${escapeHtml(page.id)}" data-native-scene="1.0" data-scene-mode="${escapeHtml(scene.mode)}" aria-label="${escapeHtml(page.title)}">
  <style>
    ${prefix}{box-sizing:border-box;position:relative;width:${canvas.width}px;height:${canvas.height}px;margin:0;padding:0;overflow:hidden;background:${safeColor(scene.theme.background, '#f4f7fb')};color:${safeColor(scene.theme.foreground, '#10233c')};font-family:Inter,"Segoe UI","Microsoft YaHei",sans-serif;isolation:isolate}
    ${prefix} *{box-sizing:border-box}
    ${prefix} .native-node{position:absolute;margin:0}
    ${prefix} .native-text{display:flex;align-items:flex-start;line-height:1.18;letter-spacing:-.025em;overflow:hidden;white-space:pre-wrap;outline:none;padding:0}
    ${prefix} .native-text[contenteditable="true"]:focus{outline:3px solid color-mix(in srgb, ${safeColor(scene.theme.accent, '#f97316')} 55%, transparent);outline-offset:4px}
    ${prefix} .native-text.role-subtitle{line-height:1.45;letter-spacing:0}
    ${prefix} .native-text.role-claim{padding:28px;line-height:1.45;align-items:center}
    ${prefix} .native-text.role-takeaway{padding:12px 28px;align-items:center;justify-content:center;letter-spacing:0}
    ${prefix} pre.native-text{padding:26px;font-family:"Cascadia Code",Consolas,monospace;line-height:1.45;white-space:pre-wrap}
    ${prefix} .native-shape.shape-circle{border-radius:50%!important}
    ${prefix} .native-shape.shape-pill{border-radius:999px!important}
    ${prefix} .native-object-cluster{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(22px,1fr));align-items:center;gap:7px;padding:4px;background:transparent!important;border:0!important;overflow:visible}
    ${prefix} .native-line-arrow{position:absolute;left:0;top:50%;width:100%;height:4px;transform:translateY(-50%);border-radius:99px;background:currentColor}
    ${prefix} .native-line-arrow::after{content:"";position:absolute;right:-1px;top:50%;width:13px;height:13px;border-top:4px solid currentColor;border-right:4px solid currentColor;transform:translateY(-50%) rotate(45deg)}
    ${prefix} .native-lego-piece{position:relative;display:grid;grid-template-columns:1fr 1fr;gap:2px;min-width:22px;height:72%;padding:5px;border-radius:7px;background:var(--cluster-a,currentColor);background:color-mix(in srgb,currentColor 78%,#fff);box-shadow:inset 0 -8px 10px rgba(0,0,0,.22),0 5px 9px rgba(0,0,0,.22)}
    ${prefix} .native-lego-piece:nth-child(even){background:color-mix(in srgb,var(--cluster-b,currentColor) 72%,#fff)}
    ${prefix} .native-lego-piece b{display:block;border-radius:50%;background:rgba(255,255,255,.28);box-shadow:inset 0 -2px 2px rgba(0,0,0,.25)}
    ${prefix} .native-puzzle-piece{display:block;height:72%;min-width:24px;border-radius:8px;background:color-mix(in srgb,currentColor 78%,#fff);box-shadow:inset 0 -7px 10px rgba(0,0,0,.18),0 4px 8px rgba(0,0,0,.2);clip-path:polygon(0 0,38% 0,38% 14%,62% 14%,62% 0,100% 0,100% 38%,86% 38%,86% 62%,100% 62%,100% 100%,62% 100%,62% 86%,38% 86%,38% 100%,0 100%,0 62%,14% 62%,14% 38%,0 38%)}
    ${prefix} .native-puzzle-piece:nth-child(even),${prefix} .native-orb:nth-child(even){filter:hue-rotate(95deg)}
    ${prefix} .native-orb{display:block;aspect-ratio:1;border-radius:50%;background:radial-gradient(circle at 32% 28%,#fff 0 7%,color-mix(in srgb,currentColor 80%,#fff) 14%,currentColor 62%,#26311a 100%);box-shadow:0 5px 10px rgba(0,0,0,.25)}
    ${prefix} .native-punnett-cell{display:flex;align-items:center;justify-content:center;gap:7px;min-height:54px;border:2px solid color-mix(in srgb,currentColor 50%,#fff);background:rgba(255,255,255,.1)}
    ${prefix} .native-punnett-cell b{width:34%;aspect-ratio:1;border-radius:50%;background:radial-gradient(circle at 32% 28%,#fff 0 8%,#fbbf24 18%,#d97706 100%)}
    ${prefix} .native-punnett-cell:nth-child(2) b:last-child,${prefix} .native-punnett-cell:nth-child(3) b:first-child,${prefix} .native-punnett-cell:nth-child(4) b{background:radial-gradient(circle at 32% 28%,#fff 0 8%,#84cc16 18%,#3f6212 100%)}
    ${prefix} .native-paint{display:block;width:23%;aspect-ratio:1.35;border-radius:48% 54% 45% 58%/54% 44% 60% 46%;box-shadow:inset -8px -10px 14px rgba(0,0,0,.18),0 8px 16px rgba(0,0,0,.24)}
    ${prefix} .native-paint.red{background:#dc2626}${prefix} .native-paint.white{background:#f8fafc}${prefix} .native-paint.pink{background:#f9a8d4}
    ${prefix} .native-object-cluster>strong,${prefix} .native-object-cluster>em{align-self:center;color:#fff;font:800 34px/1 sans-serif;text-align:center;font-style:normal}
    ${prefix} .native-shape[data-native-variant*="painterly"]{grid-template-columns:1fr auto 1fr!important;grid-template-rows:1fr auto 1fr!important;justify-items:center}
    ${prefix} .native-shape[data-native-variant*="painterly"]>.red{grid-area:1/1}${prefix} .native-shape[data-native-variant*="painterly"]>strong{grid-area:1/2}${prefix} .native-shape[data-native-variant*="painterly"]>.white{grid-area:1/3}${prefix} .native-shape[data-native-variant*="painterly"]>em{grid-area:2/2}${prefix} .native-shape[data-native-variant*="painterly"]>.pink{grid-area:3/2;width:70%}
    ${prefix} .native-asset{object-fit:cover;display:block}
    ${prefix} .native-asset.role-cutout,${prefix} .native-asset.role-portrait,${prefix} .native-asset.role-illustration{object-fit:contain}
    ${prefix} .native-asset-fallback{background:radial-gradient(circle at 35% 35%,color-mix(in srgb,${safeColor(scene.theme.accent, '#f97316')} 32%,transparent),transparent 58%)}
    ${prefix} .native-diagram{overflow:hidden;border-radius:22px}
    ${prefix} .native-edge-layer{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
    ${prefix} .native-edge-layer line{stroke:${safeColor(scene.theme.secondary, '#2563eb')};stroke-width:5;stroke-linecap:round}
    ${prefix} .native-edge-layer marker path{fill:${safeColor(scene.theme.secondary, '#2563eb')};stroke:none}
    ${prefix} .native-graph-node{position:absolute;display:flex;align-items:center;justify-content:center;padding:12px;border:3px solid ${safeColor(scene.theme.secondary, '#2563eb')};border-radius:50%;background:${safeColor(scene.theme.surface, '#fff')};color:${safeColor(scene.theme.foreground, '#10233c')};font-size:20px;font-weight:750;text-align:center;line-height:1.2;box-shadow:0 10px 26px rgba(15,36,62,.12);outline:none}
    ${prefix} .native-chart{overflow:hidden;padding:12px 20px 8px 56px}
    ${prefix} .native-chart>svg{position:absolute;inset:0;width:100%;height:100%}
    ${prefix} .native-chart>svg line{stroke:#a9b8c8;stroke-width:2}
    ${prefix} .native-bars{position:relative;display:flex;align-items:flex-end;width:100%;height:100%;gap:18px}
    ${prefix} .native-bar-column{height:100%;display:grid;grid-template-rows:36px 1fr 54px;align-items:end;text-align:center;min-width:0}
    ${prefix} .native-bar{width:64%;justify-self:center;border-radius:14px 14px 3px 3px;background:linear-gradient(180deg,${safeColor(scene.theme.accent, '#f97316')},${safeColor(scene.theme.secondary, '#2563eb')})}
    ${prefix} .native-bar-value{font-size:20px;font-weight:800;color:${safeColor(scene.theme.foreground, '#10233c')};align-self:center}
    ${prefix} .native-bar-label{font-size:18px;font-weight:650;color:${safeColor(scene.theme.muted, '#53657a')};line-height:1.2;padding-top:8px;align-self:start}
    ${prefix} .native-decorative-svg{overflow:hidden;fill:none;stroke:${safeColor(scene.theme.secondary, '#2563eb')};stroke-width:6;stroke-linecap:round;stroke-linejoin:round}
    ${prefix} .native-decorative-svg .strand-b{stroke:${safeColor(scene.theme.accent, '#f97316')}}
    ${prefix} .native-decorative-svg circle{fill:${safeColor(scene.theme.surface, '#fff')};stroke-width:5}
    ${prefix} .native-3d{perspective:1400px;touch-action:none;cursor:grab;outline:none;--native-spread:0px}
    ${prefix} .native-3d:active{cursor:grabbing}
    ${prefix} .native-3d:focus-visible{outline:4px solid ${safeColor(scene.theme.accent, '#f97316')};outline-offset:8px}
    ${prefix} .native-3d-stage{position:absolute;left:14%;top:11%;width:72%;height:72%;transform-style:preserve-3d;transform:rotateX(var(--native-rx)) rotateZ(var(--native-rz)) rotateY(var(--native-ry,0deg));transition:transform .22s ease}
    ${prefix} .native-plane{position:absolute;inset:0;transform-style:preserve-3d;transition:transform .45s cubic-bezier(.2,.8,.2,1),filter .3s ease}
    ${prefix} .native-plane-base{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;transform:translate3d(0,28px,0)}
    ${prefix} .native-plane-base i{display:block;background:linear-gradient(145deg,#d8c5a7,#a98d67);border:1px solid #8e7657;border-radius:7px;box-shadow:inset -10px -12px 18px rgba(83,58,29,.2),0 16px 18px rgba(18,33,51,.2)}
    ${prefix} .native-plane-copy{display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(2,1fr);gap:2px;padding:8px;background:rgba(246,249,252,.92);border:3px solid rgba(27,74,116,.7);transform:translate3d(0,-6px,42px)}
    ${prefix} .native-copy-cell{background:rgba(255,255,255,.88);border:1px solid #9fb2c5}
    ${prefix} .native-plane-label{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:block;min-width:150px;padding:9px 15px;border-radius:999px;background:#10233c;color:#fff;font-size:19px;font-weight:800;line-height:1;text-align:center;white-space:nowrap;box-shadow:0 8px 18px rgba(11,35,57,.2);z-index:5}
    ${prefix} .native-plane-art{padding:16px;background:rgba(220,240,244,.72);border:3px solid rgba(22,97,113,.72);backdrop-filter:blur(3px);transform:translate3d(0,-38px,88px)}
    ${prefix} .native-plane-art img,${prefix} .native-plane-art svg{display:block;width:100%;height:100%;object-fit:contain;fill:none;stroke:${safeColor(scene.theme.accent, '#f97316')};stroke-width:12}
    ${prefix} .native-plane-art .native-plane-label{top:14%;background:${safeColor(scene.theme.accent, '#f97316')};color:#10233c}
    ${prefix} .native-plane-base .native-plane-label{background:#6f5639}
    ${prefix} .native-3d:hover .native-plane-base,${prefix} .native-3d.is-expanded .native-plane-base,html[data-native-capture="true"] ${prefix} .native-plane-base{transform:translate3d(0,74px,-28px)}
    ${prefix} .native-3d:hover .native-plane-copy,${prefix} .native-3d.is-expanded .native-plane-copy,html[data-native-capture="true"] ${prefix} .native-plane-copy{transform:translate3d(0,-22px,74px)}
    ${prefix} .native-3d:hover .native-plane-art,${prefix} .native-3d.is-expanded .native-plane-art,html[data-native-capture="true"] ${prefix} .native-plane-art{transform:translate3d(0,-118px,148px)}
    ${prefix} .native-callout-lines{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;fill:none;stroke:${safeColor(scene.theme.secondary, '#2563eb')};stroke-width:6}
    ${prefix} .native-3d-callout{position:absolute;max-width:29%;padding:8px 12px;background:#fff;border-left:5px solid ${safeColor(scene.theme.secondary, '#2563eb')};color:#10233c;font-size:18px;font-weight:750;line-height:1.25;box-shadow:0 7px 18px rgba(11,35,57,.12)}
    ${prefix} .native-3d-callout.callout-1{left:1%;bottom:12%}
    ${prefix} .native-3d-callout.callout-2{right:1%;top:2%}
    ${prefix} .native-3d-callout.callout-3{right:1%;bottom:11%}
    ${prefix} .native-3d::after{content:"";position:absolute;left:18px;top:18px;width:42px;height:42px;border-radius:50%;background-color:#10233c;background-image:radial-gradient(circle,#fff 2px,transparent 3px);background-size:10px 10px;background-position:6px 6px;box-shadow:0 8px 20px rgba(11,35,57,.2);cursor:move}
    ${prefix} aside.notes{display:none}
  </style>
  ${body}
  ${page.speakerNotes ? `<aside class="notes">${escapeHtml(page.speakerNotes)}</aside>` : ''}
</section>`;
  return { html, compositionUsed: { source: 'native-scene', mode: scene.mode, editableText: true, semanticGraphics: 'dom-svg', rasterAssets: assetManifest.length } };
}
