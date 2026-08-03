import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODES = new Set(['dom2d', 'asset-assisted', 'css3d', 'webgl-exception']);
const NODE_TYPES = new Set(['text', 'shape', 'image', 'svg', 'chart', 'diagram', 'css3d', 'hotspot']);
const BINDING_TYPES = new Set(['title', 'purpose', 'coreLogic', 'displayCopy', 'claim', 'graphNode', 'seriesLabel', 'seriesValue', 'code', 'none']);
const ASSET_ROLES = new Set(['background', 'photo', 'portrait', 'illustration', 'texture', 'cutout', 'decorative-vector']);
const ASSET_PROVIDERS = new Set(['seedream', 'gpt-image-2', 'recraft']);

export async function nativeSceneJsonSchema() {
  return JSON.parse(await readFile(path.join(ROOT, 'schemas', 'native-scene.schema.json'), 'utf8'));
}

function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} 必须是对象`);
  return value;
}

function finite(value, label, min = -Infinity, max = Infinity) {
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${label} 超出范围`);
  return value;
}

function string(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} 必须是非空字符串`);
  return value;
}

function validateBbox(bbox, label) {
  object(bbox, label);
  finite(bbox.x, `${label}.x`, 0, 1);
  finite(bbox.y, `${label}.y`, 0, 1);
  finite(bbox.w, `${label}.w`, Number.EPSILON, 1);
  finite(bbox.h, `${label}.h`, Number.EPSILON, 1);
  if (bbox.x + bbox.w > 1.001 || bbox.y + bbox.h > 1.001) throw new Error(`${label} 越出归一化画布`);
}

function validateSourceBbox(sourceBBox, canvas, label) {
  if (sourceBBox == null) return;
  object(sourceBBox, label);
  finite(sourceBBox.x, `${label}.x`, 0, canvas.width);
  finite(sourceBBox.y, `${label}.y`, 0, canvas.height);
  finite(sourceBBox.w, `${label}.w`, Number.EPSILON, canvas.width);
  finite(sourceBBox.h, `${label}.h`, Number.EPSILON, canvas.height);
  if (sourceBBox.x + sourceBBox.w > canvas.width + 1 || sourceBBox.y + sourceBBox.h > canvas.height + 1) throw new Error(`${label} 越出原始像素画布`);
}

export function validateNativeScene(scene, { pageId, allowWebgl = false } = {}) {
  object(scene, 'native-scene');
  if (scene.version !== '1.0') throw new Error('native-scene.version 必须是 1.0');
  string(scene.pageId, 'native-scene.pageId');
  if (pageId && scene.pageId !== pageId) throw new Error(`native-scene.pageId 应为 ${pageId}`);
  if (!MODES.has(scene.mode)) throw new Error(`native-scene.mode 无效: ${scene.mode}`);
  if (scene.mode === 'webgl-exception' && !allowWebgl) throw new Error('WebGL 默认关闭，当前运行未授权例外');
  object(scene.canvas, 'native-scene.canvas');
  finite(scene.canvas.width, 'native-scene.canvas.width', 1);
  finite(scene.canvas.height, 'native-scene.canvas.height', 1);
  object(scene.theme, 'native-scene.theme');
  for (const key of ['background', 'foreground', 'muted', 'accent', 'secondary', 'surface']) {
    string(scene.theme[key], `native-scene.theme.${key}`);
  }
  if (!Array.isArray(scene.nodes) || !scene.nodes.length) throw new Error('native-scene.nodes 至少需要一个节点');
  if (!Array.isArray(scene.assets)) throw new Error('native-scene.assets 必须是数组');
  if (!Array.isArray(scene.interactions)) throw new Error('native-scene.interactions 必须是数组');
  const nodeIds = new Set();
  for (const [index, node] of scene.nodes.entries()) {
    object(node, `nodes[${index}]`);
    string(node.id, `nodes[${index}].id`);
    if (nodeIds.has(node.id)) throw new Error(`native-scene node id 重复: ${node.id}`);
    nodeIds.add(node.id);
    if (!NODE_TYPES.has(node.type)) throw new Error(`nodes[${index}].type 无效`);
    validateBbox(node.bbox, `nodes[${index}].bbox`);
    validateSourceBbox(node.sourceBBox, scene.canvas, `nodes[${index}].sourceBBox`);
    finite(node.z, `nodes[${index}].z`, 0, 100);
    if (node.anchors != null && (!Array.isArray(node.anchors) || node.anchors.some(anchor => typeof anchor !== 'string'))) throw new Error(`nodes[${index}].anchors 必须是字符串数组`);
    if (node.geometryConfidence != null) finite(node.geometryConfidence, `nodes[${index}].geometryConfidence`, 0, 1);
    if (node.layerConfidence != null) finite(node.layerConfidence, `nodes[${index}].layerConfidence`, 0, 1);
    object(node.binding, `nodes[${index}].binding`);
    if (!BINDING_TYPES.has(node.binding.kind)) throw new Error(`nodes[${index}].binding.kind 无效`);
    if (node.type === 'text' && node.binding.kind === 'none') throw new Error(`${node.id}: 文本节点必须绑定 content-pack`);
    object(node.style, `nodes[${index}].style`);
  }
  const assetIds = new Set();
  for (const [index, asset] of scene.assets.entries()) {
    object(asset, `assets[${index}]`);
    string(asset.id, `assets[${index}].id`);
    if (assetIds.has(asset.id)) throw new Error(`asset id 重复: ${asset.id}`);
    assetIds.add(asset.id);
    if (!ASSET_ROLES.has(asset.role)) throw new Error(`assets[${index}].role 无效`);
    if (!ASSET_PROVIDERS.has(asset.providerPreference)) throw new Error(`assets[${index}].providerPreference 无效`);
    validateBbox(asset.bbox, `assets[${index}].bbox`);
    string(asset.prompt, `assets[${index}].prompt`);
    if (/\b(text|caption|label|logo|watermark)\b|文字|标题|标签|水印/i.test(asset.prompt)
      && !/no text|without text|禁止文字|无文字|不要文字/i.test(asset.prompt)) {
      throw new Error(`${asset.id}: 素材提示词疑似要求生成文字`);
    }
  }
  for (const node of scene.nodes) {
    if (node.parentId && !nodeIds.has(node.parentId)) throw new Error(`${node.id}: parentId 不存在`);
    if (node.assetId && !assetIds.has(node.assetId)) throw new Error(`${node.id}: assetId 不存在`);
    if (node.type === 'image' && !node.assetId) throw new Error(`${node.id}: image 节点必须引用 assetId`);
  }
  for (const interaction of scene.interactions) {
    if (!nodeIds.has(interaction.targetId)) throw new Error(`interaction target 不存在: ${interaction.targetId}`);
  }
  finite(scene.confidence, 'native-scene.confidence', 0, 1);
  return scene;
}

export function resolveBinding(page, binding) {
  if (!binding || binding.kind === 'none') return '';
  const index = Number.isInteger(binding.index) ? binding.index : 0;
  switch (binding.kind) {
    case 'title': return page.title || '';
    case 'purpose': return page.purpose || '';
    case 'coreLogic': return page.coreLogic || page.purpose || '';
    case 'displayCopy': return page.displayCopy?.[index]?.text || '';
    case 'claim': return page.claims?.[index]?.text || '';
    case 'graphNode': return page.graph?.nodes?.find(node => node.id === binding.key)?.label || '';
    case 'seriesLabel': return page.series?.[index]?.label || '';
    case 'seriesValue': return String(page.series?.[index]?.value ?? '');
    case 'code': return page.code?.source || '';
    default: return '';
  }
}

export function semanticTextWhitelist(page) {
  return [...new Set([
    page.title,
    page.purpose,
    page.coreLogic,
    ...(page.displayCopy || []).map(item => item.text),
    ...(page.claims || []).map(item => item.text),
    ...(page.graph?.nodes || []).map(item => item.label),
    ...(page.series || []).flatMap(item => [item.label, String(item.value ?? '')]),
    page.code?.source,
  ].filter(value => typeof value === 'string' && value.trim()))];
}

function style(overrides = {}) {
  return {
    color: null,
    background: null,
    fontSize: null,
    fontWeight: null,
    borderRadius: null,
    borderWidth: null,
    borderColor: null,
    opacity: null,
    align: null,
    shadow: null,
    rotation: null,
    ...overrides,
  };
}

function binding(kind, index = null, key = null) {
  return { kind, index, key };
}

function node(id, type, role, bbox, z, options = {}) {
  return {
    id,
    type,
    role,
    parentId: null,
    bbox,
    sourceBBox: null,
    anchors: [],
    geometryConfidence: .55,
    layerConfidence: .55,
    z,
    binding: binding('none'),
    style: style(),
    variant: null,
    shape: 'none',
    assetId: null,
    depth: 0,
    tilt: 0,
    ...options,
  };
}

export function buildDeterministicNativeScene({ page, pagePlan, design }) {
  const hasGraph = Boolean(page.graph?.nodes?.length);
  const hasSeries = Boolean(page.series?.length);
  const hasCode = Boolean(page.code?.source);
  const nodes = [
    node('header-rule', 'shape', 'decorative-rule', { x: .055, y: .065, w: .055, h: .008 }, 2, {
      shape: 'pill', style: style({ background: design.colors.accent, borderRadius: 12 }),
    }),
    node('title', 'text', 'title', { x: .055, y: .095, w: .62, h: .16 }, 10, {
      binding: binding('title'), style: style({ color: '#10233c', fontSize: 62, fontWeight: 800 }),
    }),
    node('purpose', 'text', 'subtitle', { x: .058, y: .26, w: .58, h: .08 }, 10, {
      binding: binding('purpose'), style: style({ color: '#4f6478', fontSize: 24, fontWeight: 500 }),
    }),
    node('hero-surface', 'shape', 'hero-surface', { x: .055, y: .39, w: .89, h: .43 }, 1, {
      shape: 'rect', style: style({ background: '#ffffff', borderRadius: 28, borderWidth: 2, borderColor: '#dbe5ef', shadow: '0 24px 70px rgba(8,31,56,.12)' }),
    }),
  ];
  if (hasGraph) {
    nodes.push(node('semantic-graph', 'diagram', 'semantic-graph', { x: .085, y: .43, w: .83, h: .34 }, 5, {
      variant: 'directed', style: style({ color: '#10233c', background: '#f7fbff' }),
    }));
  } else if (hasSeries) {
    nodes.push(node('semantic-chart', 'chart', 'semantic-chart', { x: .085, y: .43, w: .83, h: .34 }, 5, {
      variant: 'bars', style: style({ color: '#10233c', background: '#f7fbff' }),
    }));
  } else if (hasCode) {
    nodes.push(node('code', 'text', 'code', { x: .085, y: .43, w: .83, h: .34 }, 5, {
      binding: binding('code'), style: style({ color: '#e5eef8', background: '#0a1930', fontSize: 22, fontWeight: 500, borderRadius: 18 }),
    }));
  } else {
    const claimCount = Math.min(3, page.claims?.length || 0);
    if (claimCount) {
      for (let index = 0; index < claimCount; index += 1) {
        nodes.push(node(`claim-${index}`, 'text', 'claim', { x: .09 + index * (.8 / claimCount), y: .47, w: .72 / claimCount, h: .23 }, 5, {
          binding: binding('claim', index),
          style: style({ color: '#10233c', background: index === 0 ? '#eef5ff' : '#f7f9fc', fontSize: 25, fontWeight: 600, borderRadius: 18 }),
        }));
      }
    } else {
      nodes.push(node('core-logic', 'text', 'core-logic', { x: .1, y: .48, w: .8, h: .2 }, 5, {
        binding: binding('coreLogic'), style: style({ color: '#10233c', fontSize: 34, fontWeight: 650, align: 'center' }),
      }));
    }
  }
  if (page.coreLogic) {
    nodes.push(node('takeaway', 'text', 'takeaway', { x: .12, y: .86, w: .76, h: .075 }, 10, {
      binding: binding('coreLogic'), style: style({ color: '#ffffff', background: '#10233c', fontSize: 23, fontWeight: 650, borderRadius: 999, align: 'center' }),
    }));
  }
  return validateNativeScene({
    version: '1.0',
    pageId: page.id,
    mode: 'dom2d',
    canvas: { width: design.canvas.width, height: design.canvas.height },
    theme: {
      background: '#f4f7fb',
      foreground: '#10233c',
      muted: '#4f6478',
      accent: design.colors.accent,
      secondary: '#2563eb',
      surface: '#ffffff',
    },
    nodes,
    assets: [],
    interactions: [],
    confidence: .55,
    rationale: `确定性降级布局；${pagePlan?.archetype || '保留语义层级'}`,
  }, { pageId: page.id });
}

function clamp(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function compileAssetOwnership(nodes, assets) {
  const simpleRole = /(?:connector|arrow|brace|line|label|banner|container|overlay|header|frame|border|panel|divider|badge|icon)/i;
  const simplePrompt = /(?:rounded rectangle|banner|container|overlay|header|frame|border|curly brace|arrow|divider|straight line|simple badge|shield badge)/i;
  const complexPrompt = /(?:photo|portrait|illustration|botanical|plant|flower|cell|mitochond|bacter|chromosome|dna|human|scientist|organic|texture|lego|brick)/i;
  const assetById = new Map(assets.map(asset => [asset.id, asset]));

  for (const node of nodes) {
    if (node.type !== 'image' || !node.assetId) continue;
    const asset = assetById.get(node.assetId);
    if (!asset || asset.role === 'background') continue;
    const signature = `${node.id} ${node.role} ${node.variant || ''}`;
    const primitive = simpleRole.test(signature) || (simplePrompt.test(asset.prompt) && !complexPrompt.test(asset.prompt));
    if (primitive) {
      node.type = /(?:connector|arrow|brace|line)/i.test(signature) ? 'svg' : 'shape';
      node.variant = node.variant || (/arrow/i.test(signature) ? 'arrow' : /brace/i.test(signature) ? 'brace' : 'panel');
      node.shape = node.type === 'shape' ? (/label|banner|header|badge/i.test(signature) ? 'pill' : 'rect') : 'none';
      node.assetId = null;
      continue;
    }
    // Models often call complex illustrations “decorative vectors”.  The
    // ownership compiler, rather than a prompt, routes those to the raster
    // branch and selects an alpha-capable provider when isolation is required.
    if (asset.role === 'decorative-vector') {
      asset.role = 'illustration';
      asset.providerPreference = asset.transparent ? 'gpt-image-2' : 'seedream';
    }
  }

  // Collapse explicit visual variants onto one generated master.  Size,
  // placement and repetition belong to HTML/CSS, not to separate image calls.
  const familyKey = asset => {
    const explicit = asset.prompt.match(/(?:same as|identical to|version of)\s+([a-z0-9_-]+)/i)?.[1];
    return String(explicit || asset.id)
      .toLowerCase()
      .replace(/^(?:small|mini|result|large)[-_]+/, '')
      .replace(/[-_]\d+$/, '');
  };
  const masterByFamily = new Map();
  const replacement = new Map();
  for (const asset of assets) {
    const family = familyKey(asset);
    const master = masterByFamily.get(family);
    if (master && master.role === asset.role) replacement.set(asset.id, master.id);
    else masterByFamily.set(family, asset);
  }
  for (const node of nodes) {
    if (node.assetId && replacement.has(node.assetId)) node.assetId = replacement.get(node.assetId);
  }

  const referenced = new Set(nodes.filter(node => node.type === 'image' && node.assetId).map(node => node.assetId));
  for (let index = assets.length - 1; index >= 0; index -= 1) {
    if (!referenced.has(assets[index].id)) assets.splice(index, 1);
  }
}

export function normalizeNativeScene(raw, { page, design }) {
  const theme = raw?.theme || {};
  const normalizeBox = input => {
    const x = clamp(input?.x, 0, .98, .1);
    const y = clamp(input?.y, 0, .98, .1);
    return {
      x,
      y,
      w: clamp(input?.w, .01, 1 - x, .3),
      h: clamp(input?.h, .01, 1 - y, .2),
    };
  };
  const nodes = (Array.isArray(raw?.nodes) ? raw.nodes : []).slice(0, 80).map((item, index) => {
    const bbox = normalizeBox(item?.bbox);
    // V2 has one geometric source of truth: the model reports a normalized
    // observation and the runtime derives pixel evidence.  A second model-made
    // coordinate system is deliberately ignored because it can only disagree.
    // Later deterministic layout corrections may change bbox while sourceBBox
    // remains the original visual observation used for fidelity diagnostics.
    const sourceBBox = {
      x: bbox.x * design.canvas.width,
      y: bbox.y * design.canvas.height,
      w: bbox.w * design.canvas.width,
      h: bbox.h * design.canvas.height,
    };
    return ({
    id: String(item?.id || `node-${index + 1}`),
    type: NODE_TYPES.has(item?.type) ? item.type : 'shape',
    role: String(item?.role || 'decorative'),
    parentId: item?.parentId ? String(item.parentId) : null,
    bbox,
    sourceBBox,
    anchors: (Array.isArray(item?.anchors) ? item.anchors : []).slice(0, 8).map(value => String(value)),
    geometryConfidence: clamp(item?.geometryConfidence, 0, 1, .5),
    layerConfidence: clamp(item?.layerConfidence, 0, 1, .5),
    z: Math.round(clamp(item?.z, 0, 100, index + 1)),
    binding: {
      kind: BINDING_TYPES.has(item?.binding?.kind) ? item.binding.kind : 'none',
      index: Number.isInteger(item?.binding?.index) ? Math.max(0, item.binding.index) : null,
      key: item?.binding?.key == null ? null : String(item.binding.key),
    },
    style: style({
      color: item?.style?.color == null ? null : String(item.style.color),
      background: item?.style?.background == null ? null : String(item.style.background),
      fontSize: item?.style?.fontSize == null ? null : clamp(item.style.fontSize, item?.type === 'text' ? 18 : 10, 180, 24),
      fontWeight: item?.style?.fontWeight == null ? null : Math.round(clamp(item.style.fontWeight, 100, 900, 500)),
      borderRadius: item?.style?.borderRadius == null ? null : clamp(item.style.borderRadius, 0, 200, 0),
      borderWidth: item?.style?.borderWidth == null ? null : clamp(item.style.borderWidth, 0, 20, 0),
      borderColor: item?.style?.borderColor == null ? null : String(item.style.borderColor),
      opacity: item?.style?.opacity == null ? null : clamp(item.style.opacity, 0, 1, 1),
      align: ['left', 'center', 'right'].includes(item?.style?.align) ? item.style.align : null,
      shadow: item?.style?.shadow == null ? null : String(item.style.shadow),
      rotation: item?.style?.rotation == null ? null : clamp(item.style.rotation, -180, 180, 0),
    }),
    variant: item?.variant == null ? null : String(item.variant),
    shape: ['rect', 'circle', 'pill', 'line', 'none'].includes(item?.shape) ? item.shape : 'none',
    assetId: item?.assetId == null ? null : String(item.assetId),
    depth: clamp(item?.depth, -500, 500, 0),
    tilt: clamp(item?.tilt, -60, 60, 0),
  }); });
  const assets = (Array.isArray(raw?.assets) ? raw.assets : []).slice(0, 12).map((item, index) => ({
    id: String(item?.id || `asset-${index + 1}`),
    role: ASSET_ROLES.has(item?.role) ? item.role : 'illustration',
    prompt: String(item?.prompt || 'Abstract editorial illustration, no text, no letters, no numbers, no logo, no watermark.'),
    bbox: normalizeBox(item?.bbox),
    transparent: item?.role === 'background' ? false : Boolean(item?.transparent),
    providerPreference: ASSET_PROVIDERS.has(item?.providerPreference) ? item.providerPreference : (item?.transparent ? 'gpt-image-2' : 'seedream'),
    useReference: Boolean(item?.useReference),
  }));
  const interactions = (Array.isArray(raw?.interactions) ? raw.interactions : []).slice(0, 20).map(item => ({
    targetId: String(item?.targetId || ''),
    type: ['expand', 'rotate', 'toggle', 'reset'].includes(item?.type) ? item.type : 'toggle',
    trigger: ['hover', 'click', 'drag', 'keyboard', 'touch'].includes(item?.trigger) ? item.trigger : 'click',
    label: String(item?.label || '交互查看'),
  })).filter(item => item.targetId);
  const assetIds = new Set(assets.map(item => item.id));
  const assetById = new Map(assets.map(item => [item.id, item]));
  for (const item of nodes) {
    if (item.type !== 'image') {
      item.assetId = null;
      continue;
    }
    const assigned = item.assetId ? assetById.get(item.assetId) : null;
    if (assigned?.role === 'background' && item.role !== 'background') item.assetId = null;
  }
  for (const item of nodes) {
    if (!item.assetId || assetIds.has(item.assetId)) continue;
    const candidate = assets.find(asset => asset.role === item.role)
      || assets.find(asset => asset.role !== 'background' && (asset.id.includes(item.assetId) || item.assetId.includes(asset.id)));
    item.assetId = candidate?.id || null;
  }
  for (const item of nodes) {
    if (item.type === 'image' && !item.assetId) {
      const signature = `${item.id} ${item.role} ${item.variant || ''}`.toLowerCase();
      if (/dna|helix|double.?helix|双螺旋/.test(signature)) {
        item.type = 'svg';
        item.variant = 'dna-helix';
      } else if (/portrait|person|scientist|人物|肖像|mendel/.test(signature)) {
        const id = `${item.id}-asset`;
        const asset = {
          id,
          role: 'portrait',
          prompt: 'A museum-quality sepia editorial portrait cutout of a nineteenth-century genetics scientist, dignified historical engraving texture, isolated subject, no text, no letters, no numbers, no labels, no logo, no watermark.',
          bbox: item.bbox,
          transparent: true,
          providerPreference: 'gpt-image-2',
          useReference: true,
        };
        assets.push(asset); assetIds.add(id); item.assetId = id; item.role = 'portrait';
      } else {
        item.type = 'svg';
        item.variant = item.variant || item.role || 'decorative-flow';
      }
    }
  }
  if (page.graph?.nodes?.length) {
    for (const item of nodes) {
      const signature = `${item.id} ${item.role} ${item.variant || ''}`.toLowerCase();
      if ((item.type === 'svg' || item.type === 'shape') && /graph|topology|network|关系|拓扑/.test(signature)) {
        item.type = 'diagram'; item.variant = 'directed'; item.assetId = null;
      }
    }
  }
  const title = nodes.find(item => item.type === 'text' && item.role === 'title');
  if (title) {
    const titleHeight = Math.max(.075, Math.min(.16, (Number(title.style.fontSize || 48) / design.canvas.height) * 2.2));
    title.bbox.h = Math.min(title.bbox.h, titleHeight);
    title.z = Math.max(20, title.z);
  }
  const purpose = nodes.find(item => item.type === 'text' && ['subtitle', 'body'].includes(item.role) && item.binding.kind === 'purpose');
  if (purpose) {
    purpose.bbox.h = Math.min(purpose.bbox.h, .055);
    purpose.z = Math.max(20, purpose.z);
    if (title && purpose.bbox.y < title.bbox.y + title.bbox.h) {
      purpose.bbox.y = Math.min(.88, title.bbox.y + title.bbox.h + .012);
      purpose.bbox.h = Math.min(purpose.bbox.h, 1 - purpose.bbox.y);
    }
  }
  const css3dTargets = nodes.filter(item => item.type === 'css3d').map(item => item.id);
  if (purpose) {
    const contentTop = purpose.bbox.y + purpose.bbox.h;
    for (const item of nodes.filter(node => ['css3d', 'diagram', 'chart'].includes(node.type) && !node.parentId)) {
      const requiredTop = contentTop + (item.type === 'css3d' ? .14 : .015);
      if (item.bbox.y < requiredTop) {
        const bottom = item.bbox.y + item.bbox.h;
        item.bbox.y = requiredTop;
        item.bbox.h = Math.max(.15, Math.min(1 - item.bbox.y, bottom - requiredTop));
      }
    }
  }
  const css3dSet = new Set(css3dTargets);
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    if (nodes[index].parentId && css3dSet.has(nodes[index].parentId)) nodes.splice(index, 1);
  }
  if (css3dTargets.length && !interactions.some(item => css3dTargets.includes(item.targetId))) {
    for (const targetId of css3dTargets) {
      interactions.push(
        { targetId, type: 'expand', trigger: 'hover', label: '悬停展开' },
        { targetId, type: 'toggle', trigger: 'click', label: '点击锁定' },
        { targetId, type: 'rotate', trigger: 'drag', label: '拖动旋转' },
        { targetId, type: 'rotate', trigger: 'touch', label: '触摸旋转' },
        { targetId, type: 'reset', trigger: 'keyboard', label: '键盘控制' },
      );
    }
  }
  compileAssetOwnership(nodes, assets);
  const mode = css3dTargets.length ? 'css3d' : MODES.has(raw?.mode) ? raw.mode : (assets.length ? 'asset-assisted' : 'dom2d');
  return {
    version: '1.0',
    pageId: page.id,
    mode,
    canvas: { width: design.canvas.width, height: design.canvas.height },
    theme: {
      background: String(theme.background || '#f4f7fb'),
      foreground: String(theme.foreground || design.colors.primary),
      muted: String(theme.muted || design.colors.secondary),
      accent: String(theme.accent || design.colors.accent),
      secondary: String(theme.secondary || design.colors.secondary),
      surface: String(theme.surface || '#ffffff'),
    },
    nodes,
    assets,
    interactions,
    confidence: clamp(raw?.confidence, 0, 1, .5),
    rationale: String(raw?.rationale || 'VLM scene analysis'),
  };
}
