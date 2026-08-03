import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nativeSceneJsonSchema, normalizeNativeScene, validateNativeScene } from './native-scene.mjs';
import { MODEL_POLICY } from './model-policy.mjs';
import { sha256File, sha256Text } from './lib/io.mjs';
import { proxyAwareFetch } from './lib/network.mjs';

function parseEnv(text) {
  const result = {};
  for (const raw of String(text).split(/\r?\n/)) {
    const match = raw.trim().match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    result[match[1]] = value;
  }
  return result;
}

async function secretFor(config, cwd) {
  const name = config.apiKeyEnv;
  if (process.env[name]) return process.env[name];
  const envFile = path.resolve(cwd, config.envFile || '.env');
  const value = parseEnv(await readFile(envFile, 'utf8'))[name];
  if (!value) throw new Error(`${envFile} 缺少 ${name}`);
  return value;
}

function mimeFor(file) {
  const extension = path.extname(file).toLowerCase();
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.webp') return 'image/webp';
  if (extension === '.svg') return 'image/svg+xml';
  return 'image/png';
}

async function imageDataUrl(file) {
  const binary = await readFile(file);
  return `data:${mimeFor(file)};base64,${binary.toString('base64')}`;
}

async function croppedReferenceDataUrl(file, bbox) {
  const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'crop_reference.py');
  const args = [script, file, bbox.x, bbox.y, bbox.w, bbox.h].map(String);
  const binary = await new Promise((resolve, reject) => {
    const child = spawn('python', args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const chunks = [];
    let stderr = '';
    child.stdout.on('data', chunk => chunks.push(chunk));
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => code === 0
      ? resolve(Buffer.concat(chunks))
      : reject(new Error(`参考图局部裁切失败 (${code}): ${stderr.slice(0, 300)}`)));
  });
  if (binary.length < 128) throw new Error('参考图局部裁切结果为空');
  return { dataUrl: `data:image/png;base64,${binary.toString('base64')}`, sha256: sha256Text(binary.toString('base64')), bytes: binary.length };
}

function parseJsonText(text) {
  if (typeof text !== 'string') throw new Error('模型响应缺少文本 JSON');
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  return JSON.parse(cleaned);
}

async function checkedJson(response, label) {
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = null; }
  if (!response.ok) {
    const detail = body?.error?.message || body?.message || text || response.statusText;
    throw new Error(`${label}失败 (${response.status}): ${String(detail).slice(0, 500)}`);
  }
  if (!body) throw new Error(`${label}返回的不是 JSON`);
  return body;
}

async function retryNetwork(operation, { attempts = 3, delays = [800, 2400] } = {}) {
  let lastError;
  for (let index = 0; index < attempts; index += 1) {
    try { return await operation(index); }
    catch (error) {
      lastError = error;
      if (index + 1 >= attempts || /\((?:400|401|403|404|409|422)\)/.test(String(error.message))) throw error;
      await new Promise(resolve => setTimeout(resolve, delays[Math.min(index, delays.length - 1)] || 2400));
    }
  }
  throw lastError;
}

function semanticBindingCatalog(page) {
  return {
    title: page.title,
    purpose: page.purpose,
    coreLogic: page.coreLogic || null,
    displayCopy: (page.displayCopy || []).map((item, index) => ({ index, role: item.role, text: item.text })),
    claims: (page.claims || []).map((item, index) => ({ index, text: item.text })),
    graphNodes: (page.graph?.nodes || []).map(item => ({ key: item.id, text: item.label })),
    graphEdges: page.graph?.edges || [],
    series: (page.series || []).map((item, index) => ({ index, label: item.label, value: item.value })),
    hasCode: Boolean(page.code?.source),
  };
}

function sceneSystemPrompt() {
  return `You are a presentation scene analyst. Convert the supplied reference slide into a deterministic, editable native HTML scene specification.

Hard ownership rules:
- Never request a whole-slide screenshot or a crop containing text, labels, tables, charts, connectors, or data.
- Every visible word must be a text node bound to the provided semantic binding catalog. Never transcribe OCR text and never invent copy.
- Semantic diagrams, charts, axes, nodes, connectors, callout lines, cards, borders, gradients, and grids must be DOM/SVG nodes.
- Raster assets are allowed only for photos, portraits, painterly illustrations, textures, complex cutouts, or a text-free decorative background.
- Prefer dom2d. Use css3d for exploded/layered spatial explanations. Use webgl-exception only for a non-semantic object that CSS3D cannot express.
- Asset prompts must explicitly prohibit text, letters, numbers, logos, labels, and watermarks.
- Use normalized bboxes. Keep all boxes inside the canvas. Keep connectors short and away from text.
- For every node, provide one normalized bbox plus anchors, geometryConfidence, and layerConfidence. Pixel-space evidence is derived locally; do not emit sourceBBox.
- parentId and z must reproduce observable containment and occlusion; do not invent hidden layers that are not visually evidenced.
- Reconstruct the observable composition, not a generic substitute. Inventory every major panel, illustration cluster, visual object, connector, badge and divider. A normal teaching slide should usually contain 10-35 nodes; "sparse" means uncluttered, not incomplete.
- Use svg only for a supported simple motif (dna-helix, arrow, brace, connector) or provide svgPaths. svgPaths use a 0 0 1000 1000 coordinate system and may contain up to 64 sanitized SVG path primitives. Approximate visible silhouettes, icon geometry and connector routes with multiple paths; never use a generic curve as a stand-in for a diagram.
- If a complex text-free visual cannot be faithfully expressed with paths, create an image asset and matching image node. Set useReference=true so the runtime supplies only the locally cropped reference region, never the entire slide.
- Repeated objects (blocks, peas, chromosomes, puzzle pieces) must be represented by explicit repeated shape/svg/image nodes at their observed positions; do not collapse an explanatory sequence into one empty container.
- Before returning, count the visible major elements in observedElementCount (text blocks, panels, object clusters and connector groups) and report reconstructionCoverage from 0 to 1. Coverage means the fraction of those observed elements represented by a node or asset; confidence is not a substitute for coverage.
- For a semantic graph backed by graphNodes, emit one diagram node; the renderer will use graph truth from the content pack. For reference-only explanatory diagrams without graphNodes, decompose them into SVG paths, shapes and cropped assets.
- For quantitative data, emit one chart node; the renderer will use series truth from the content pack.
- For an exploded stack, emit one css3d node and interactions for hover, click, drag, touch, and keyboard.
Return only JSON matching the supplied schema.`;
}

function sceneUserPrompt({ page, pagePlan, design }) {
  return `Analyze this reference slide as layout evidence, not as a source of wording.

PAGE ID: ${page.id}
CANVAS: ${design.canvas.width} × ${design.canvas.height}
SEMANTIC BINDINGS (use kind/index/key; do not copy strings into an unbound field):
${JSON.stringify(semanticBindingCatalog(page), null, 2)}

PLANNED COMMUNICATION:
${JSON.stringify({
    role: pagePlan?.role,
    message: pagePlan?.message,
    archetype: pagePlan?.archetype,
    layoutIntent: pagePlan?.layoutIntent,
    readingPath: pagePlan?.qualityContract?.readingPath,
    renderOwnership: pagePlan?.renderOwnership,
    creativeFreedom: pagePlan?.creativeFreedom,
  }, null, 2)}

DESIGN BASELINE:
${JSON.stringify({ styleLine: design.styleLine, colors: design.colors, antiSlop: design.antiSlop }, null, 2)}

EXACT JSON CONTRACT (use these exact keys; do not rename nodes to elements or omit required fields):
{
  "version":"1.0", "pageId":"${page.id}", "mode":"dom2d|asset-assisted|css3d",
  "canvas":{"width":${design.canvas.width},"height":${design.canvas.height}},
  "theme":{"background":"#hex","foreground":"#hex","muted":"#hex","accent":"#hex","secondary":"#hex","surface":"#hex"},
  "nodes":[{
    "id":"unique-id", "type":"text|shape|image|svg|chart|diagram|css3d|hotspot", "role":"observed-role", "parentId":null,
    "bbox":{"x":0.0,"y":0.0,"w":0.1,"h":0.1}, "anchors":["top-left"], "geometryConfidence":0.9, "layerConfidence":0.9, "z":1,
    "binding":{"kind":"title|purpose|coreLogic|displayCopy|claim|graphNode|seriesLabel|seriesValue|code|none","index":null,"key":null},
    "style":{"color":null,"background":null,"fontSize":null,"fontWeight":null,"borderRadius":null,"borderWidth":null,"borderColor":null,"opacity":1,"align":null,"shadow":null,"rotation":null},
    "svgPaths":[], "variant":null, "shape":"rect|circle|pill|line|none", "assetId":null, "depth":0, "tilt":0
  }],
  "assets":[{"id":"asset-id","role":"background|photo|portrait|illustration|texture|cutout|decorative-vector","prompt":"text-free asset prompt","bbox":{"x":0,"y":0,"w":0.2,"h":0.2},"transparent":true,"providerPreference":"gpt-image-2|seedream|recraft","useReference":true}],
  "interactions":[], "observedElementCount":12, "reconstructionCoverage":0.95, "confidence":0.9, "rationale":"brief explanation"
}

Rebuild the full presentation composition at high visual fidelity. Preserve major region boundaries, density, alignment, silhouettes, connector direction, color blocks and foreground/background layering. Do not reproduce garbled or pseudo-text from the image.`;
}

function assertRawSceneContract(raw, pageId) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`${pageId}: 场景响应不是对象`);
  if (!Array.isArray(raw.nodes) || !raw.nodes.length) throw new Error(`${pageId}: 场景响应缺少 nodes`);
  const required = ['id', 'type', 'role', 'bbox', 'binding', 'style', 'z'];
  const malformed = raw.nodes.filter(node => !node || typeof node !== 'object' || required.some(key => node[key] == null));
  if (malformed.length) throw new Error(`${pageId}: ${malformed.length}/${raw.nodes.length} 个节点未遵守原生场景契约`);
  if (!raw.nodes.some(node => node.type === 'text' && ['title', 'displayCopy'].includes(node.binding?.kind))) {
    throw new Error(`${pageId}: 场景响应缺少绑定标题文字节点`);
  }
  if (!Number.isFinite(raw.observedElementCount) || !Number.isFinite(raw.reconstructionCoverage)) {
    throw new Error(`${pageId}: 场景响应缺少元素清点与覆盖率`);
  }
}

function providerDefaults(provider, cwd) {
  if (provider === 'siliconflow') return {
    provider,
    baseUrl: MODEL_POLICY.vision.baseUrl,
    apiKeyEnv: MODEL_POLICY.vision.apiKeyEnv,
    envFile: path.join(cwd, '.env'),
    model: MODEL_POLICY.vision.model,
    responseMode: 'json_object',
    timeoutMs: 180_000,
  };
  throw new Error(`不受支持的 VLM provider: ${provider}`);
}

async function callVisionScene({ referenceFile, page, pagePlan, design, config, cwd, fetchImpl }) {
  const apiKey = await secretFor(config, cwd);
  const schema = await nativeSceneJsonSchema();
  delete schema.$schema;
  delete schema.$id;
  // The provider owns visual observation, not redundant coordinate conversion.
  // Keeping sourceBBox out of the response contract shortens the response and
  // makes normalized bbox the only model-authored geometry representation.
  delete schema.properties.nodes.items.properties.sourceBBox;
  const content = [
    { type: 'text', text: sceneUserPrompt({ page, pagePlan, design }) },
    { type: 'image_url', image_url: { url: await imageDataUrl(referenceFile) } },
  ];
  const request = {
    model: config.model,
    messages: [
      { role: 'system', content: sceneSystemPrompt() },
      { role: 'user', content },
    ],
    temperature: Number(config.temperature ?? 0.1),
    max_tokens: Number(config.maxTokens || 12000),
    response_format: config.responseMode === 'json_schema'
      ? { type: 'json_schema', json_schema: { name: 'native_scene', strict: true, schema } }
      : { type: 'json_object' },
  };
  const started = performance.now();
  const body = await retryNetwork(async () => checkedJson(await fetchImpl(`${String(config.baseUrl).replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(Number(config.timeoutMs || 180_000)),
  }), `${config.provider}/${config.model} 场景解析`));
  let payload = body?.choices?.[0]?.message?.content;
  if (Array.isArray(payload)) payload = payload.map(item => item.text || '').join('');
  const rawScene = parseJsonText(payload);
  assertRawSceneContract(rawScene, page.id);
  const scene = normalizeNativeScene(rawScene, { page, design });
  validateNativeScene(scene, { pageId: page.id, allowWebgl: config.allowWebgl === true });
  return {
    scene,
    metadata: {
      provider: config.provider,
      model: config.model,
      durationMs: Math.round(performance.now() - started),
      responseId: body.id || null,
      referenceSha256: await sha256File(referenceFile),
      rawScene: { nodeCount: rawScene.nodes.length, assetCount: rawScene.assets?.length || 0, observedElementCount: rawScene.observedElementCount, reconstructionCoverage: rawScene.reconstructionCoverage },
    },
  };
}

export async function analyzeReferenceScene({ referenceFile, page, pagePlan, design, config = {}, cwd, fetchImpl = proxyAwareFetch }) {
  const primary = { ...providerDefaults('siliconflow', cwd), ...(config.primary || {}), allowWebgl: config.allowWebgl === true };
  const providers = [primary];
  if (config.fallback !== false) providers.push({
    ...providerDefaults('siliconflow', cwd),
    ...(config.fallback || config.primary || {}),
    provider: 'siliconflow', temperature: 0,
    allowWebgl: config.allowWebgl === true,
  });
  const attempts = [];
  for (const provider of providers) {
    try {
      const result = await callVisionScene({ referenceFile, page, pagePlan, design, config: provider, cwd, fetchImpl });
      return { ...result, attempts };
    } catch (error) {
      attempts.push({ provider: provider.provider, model: provider.model, error: error.message });
    }
  }
  const error = new Error(`${page.id}: VLM 场景解析失败；${attempts.map(item => `${item.provider}: ${item.error}`).join(' | ')}`);
  error.attempts = attempts;
  throw error;
}

function assetPrompt(asset, pagePlan) {
  return `${asset.prompt}\n\nUse case: ${asset.role} asset for an editable presentation scene. ${asset.transparent ? 'Return an isolated cutout with a genuinely transparent alpha background and clean edges.' : ''} Composition region: x=${asset.bbox.x}, y=${asset.bbox.y}, width=${asset.bbox.w}, height=${asset.bbox.h}. Visual direction: ${pagePlan?.imageIntent?.visualCue || pagePlan?.message || 'premium editorial lecture visual'}. Match this palette and art direction: ${(pagePlan?.imageIntent?.style || []).join(', ')}. Absolutely no text, no letters, no numbers, no labels, no captions, no logos, no watermarks, no UI, no chart, no table.`;
}

function outputImage(body) {
  const candidate = body?.data?.[0] || body?.images?.[0];
  if (!candidate) throw new Error('图像响应缺少 data[0]');
  if (candidate.b64_json) {
    const contentType = candidate.media_type || 'image/png';
    return { binary: Buffer.from(candidate.b64_json, 'base64'), extension: contentType.includes('svg') ? 'svg' : contentType.includes('jpeg') ? 'jpg' : contentType.includes('webp') ? 'webp' : 'png', contentType };
  }
  if (candidate.image_url?.url?.startsWith('data:')) {
    const match = candidate.image_url.url.match(/^data:([^;]+);base64,(.+)$/s);
    if (match) return { binary: Buffer.from(match[2], 'base64'), extension: match[1].includes('jpeg') ? 'jpg' : 'png', contentType: match[1] };
  }
  return { url: candidate.url || candidate.image_url?.url };
}

async function downloadOutput(result, timeoutMs, fetchImpl) {
  if (result.binary) return result;
  if (!result.url) throw new Error('图像响应缺少 url 或 b64_json');
  const response = await fetchImpl(result.url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`下载生成素材失败 (${response.status})`);
  const contentType = response.headers.get('content-type') || 'image/png';
  return {
    binary: Buffer.from(await response.arrayBuffer()),
    extension: contentType.includes('jpeg') ? 'jpg' : contentType.includes('webp') ? 'webp' : 'png',
    contentType,
  };
}

function imageSizeFor(asset) {
  const ratio = asset.bbox.w / asset.bbox.h;
  if (ratio > 1.25) return '1536x1024';
  if (ratio < .8) return '1024x1536';
  return '1024x1024';
}

function imageAspectFor(asset) {
  const ratio = asset.bbox.w / asset.bbox.h;
  if (ratio > 1.25) return '3:2';
  if (ratio < .8) return '3:4';
  return '1:1';
}

function rasterMetadata(binary, extension) {
  if (extension === 'png' && binary.length >= 29 && binary.subarray(1, 4).toString('ascii') === 'PNG') {
    const colorType = binary[25];
    return { width: binary.readUInt32BE(16), height: binary.readUInt32BE(20), alphaChannel: colorType === 4 || colorType === 6 };
  }
  return { width: null, height: null, alphaChannel: false };
}

function chooseChromaKey(prompt = '') {
  const text = String(prompt).toLowerCase();
  const scores = [
    { color: '#00ff00', name: 'green', score: (text.match(/green|emerald|leaf|plant|pea|foliage|绿色|叶|豌豆/g) || []).length },
    { color: '#ff00ff', name: 'magenta', score: (text.match(/magenta|pink|purple|violet|rose|洋红|粉|紫/g) || []).length },
    { color: '#0000ff', name: 'blue', score: (text.match(/blue|navy|cyan|azure|蓝|青/g) || []).length },
  ];
  return scores.sort((a, b) => a.score - b.score)[0];
}

async function chromaKey(binary, role = 'cutout', keyColor = '#00ff00') {
  const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'chroma_key_asset.py');
  return new Promise((resolve, reject) => {
    const child = spawn('python', [script, role, keyColor], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    const chunks = [];
    let stderr = '';
    child.stdout.on('data', chunk => chunks.push(chunk));
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(`chroma key 失败 (${code}): ${stderr.slice(0, 500)}`)));
    child.stdin.end(binary);
  });
}

export async function reprocessNativeChromaAsset({ binary, role }) {
  const output = await chromaKey(binary, role, '#00ff00');
  const dimensions = rasterMetadata(output, 'png');
  if (!dimensions.alphaChannel) throw new Error('绿幕重处理后缺少 Alpha 通道');
  return { binary: output, extension: 'png', contentType: 'image/png', metadata: { ...dimensions, alphaValidated: true, postprocess: 'local-chroma-key-replay', bytes: output.length } };
}

async function seedreamChromaFallback({ asset, pagePlan, referenceFile, referenceDataUrl, config, cwd, fetchImpl, chroma }) {
  const providerConfig = {
    baseUrl: MODEL_POLICY.transparentFallback.baseUrl, apiKeyEnv: MODEL_POLICY.transparentFallback.apiKeyEnv, envFile: path.join(cwd, '.env'),
    model: MODEL_POLICY.transparentFallback.model, timeoutMs: 180_000, ...(config.seedream || {}),
  };
  const apiKey = await secretFor(providerConfig, cwd);
  const keys = [chroma, ...[
    { color: '#00ff00', name: 'green' }, { color: '#ff00ff', name: 'magenta' }, { color: '#0000ff', name: 'blue' },
  ].filter(item => item.color !== chroma.color)];
  let lastError;
  for (const key of keys) {
    const prompt = `${assetPrompt(asset, pagePlan)} Render the isolated subject on a perfectly flat, evenly lit, pure chroma ${key.name} background (${key.color}). Keep that key color out of the subject and cast no shadow outside it.`;
    const request = {
      model: providerConfig.model, prompt, size: imageSizeFor(asset), response_format: 'url', watermark: false,
      sequential_image_generation: 'disabled', stream: false,
    };
    if (asset.useReference && referenceFile) request.image = [referenceDataUrl || await imageDataUrl(referenceFile)];
    try {
      const body = await retryNetwork(async () => checkedJson(await fetchImpl(`${String(providerConfig.baseUrl).replace(/\/+$/, '')}/images/generations`, {
        method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(request), signal: AbortSignal.timeout(Number(providerConfig.timeoutMs)),
      }), `Seedream ${key.name} chroma-key 素材回退`));
      const generated = await downloadOutput(outputImage(body), Number(providerConfig.timeoutMs), fetchImpl);
      const binary = await chromaKey(generated.binary, asset.role, key.color);
      return { binary, extension: 'png', contentType: 'image/png', provider: 'paratera+local-chroma-key', model: providerConfig.model, fallbackPrompt: prompt, keyColor: key.color };
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error('Seedream 多色绿幕素材回退失败');
}

export async function generateNativeAsset({ asset, pagePlan, referenceFile, config = {}, cwd, fetchImpl = proxyAwareFetch }) {
  const started = performance.now();
  const useSeedream = asset.providerPreference === 'seedream' && config.preferSeedream === true && !asset.transparent;
  const provider = useSeedream ? 'paratera' : 'openrouter';
  const providerConfig = useSeedream
    ? {
        baseUrl: MODEL_POLICY.transparentFallback.baseUrl, apiKeyEnv: MODEL_POLICY.transparentFallback.apiKeyEnv, envFile: path.join(cwd, '.env'),
        model: MODEL_POLICY.transparentFallback.model, timeoutMs: 180_000, ...(config.seedream || {}),
      }
    : {
        baseUrl: MODEL_POLICY.referenceImage.baseUrl, apiKeyEnv: MODEL_POLICY.referenceImage.apiKeyEnv, envFile: path.join(cwd, '.env'),
        model: asset.providerPreference === 'recraft' ? 'recraft-ai/recraft-v4' : MODEL_POLICY.referenceImage.model, timeoutMs: 300_000,
        ...(config.openrouter || {}),
      };
  const apiKey = await secretFor(providerConfig, cwd);
  const prompt = assetPrompt(asset, pagePlan);
  let referenceInput = null;
  if (asset.useReference && referenceFile) {
    try {
      referenceInput = await croppedReferenceDataUrl(referenceFile, asset.bbox);
    } catch {
      referenceInput = { dataUrl: await imageDataUrl(referenceFile), sha256: null, bytes: null, cropFallback: true };
    }
  }
  const request = useSeedream
    ? {
        model: providerConfig.model,
        prompt,
        size: asset.role === 'background' ? '2560x1440' : imageSizeFor(asset),
        response_format: 'url', watermark: false, sequential_image_generation: 'disabled', stream: false,
      }
    : {
        model: providerConfig.model,
        prompt,
        aspect_ratio: imageAspectFor(asset),
        quality: 'high',
        ...(asset.providerPreference === 'recraft' ? { output_format: 'svg' } : {}),
        ...(asset.transparent ? { background: 'transparent' } : {}),
      };
  if (asset.useReference && referenceFile) {
    const data = referenceInput.dataUrl;
    if (useSeedream) request.image = [data];
    else request.input_references = [{ type: 'image_url', image_url: { url: data } }];
  }
  const endpoint = useSeedream ? '/images/generations' : '/images';
  const submit = label => retryNetwork(async () => checkedJson(await fetchImpl(`${String(providerConfig.baseUrl).replace(/\/+$/, '')}${endpoint}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal: AbortSignal.timeout(Number(providerConfig.timeoutMs)),
  }), label));
  let body;
  let result;
  let outputProvider = provider;
  let outputModel = providerConfig.model;
  let keyColor = null;
  let postprocess = 'none';
  let generatedPrompt = prompt;
  const chroma = chooseChromaKey(`${asset.prompt} ${pagePlan?.imageIntent?.visualCue || ''}`);
  const chromaRetry = async () => {
    request.prompt = `${prompt}\n\nRender the isolated subject on a perfectly flat, evenly lit, pure chroma ${chroma.name} background (${chroma.color}). Keep that key color out of the subject. No cast shadow outside the subject.`;
    generatedPrompt = request.prompt;
    delete request.background;
    delete request.output_format;
    const chromaBody = await submit(`${provider}/${providerConfig.model} 绿幕素材重试`);
    const generated = await downloadOutput(outputImage(chromaBody), Number(providerConfig.timeoutMs), fetchImpl);
    const binary = await chromaKey(generated.binary, asset.role, chroma.color);
    keyColor = chroma.color;
    postprocess = 'local-chroma-key';
    outputProvider = `${provider}+local-chroma-key`;
    return { binary, extension: 'png', contentType: 'image/png' };
  };
  try {
    body = await submit(`${provider}/${providerConfig.model} 素材生成`);
  } catch (error) {
    if (!useSeedream && asset.transparent) {
      try {
        result = await chromaRetry();
      } catch {
        result = await seedreamChromaFallback({ asset, pagePlan, referenceFile, referenceDataUrl: referenceInput?.dataUrl, config, cwd, fetchImpl, chroma });
        outputProvider = result.provider; outputModel = result.model;
        keyColor = result.keyColor || chroma.color; postprocess = 'seedream+local-chroma-key'; generatedPrompt = result.fallbackPrompt || prompt;
      }
    } else {
      throw error;
    }
  }
  if (!result) result = await downloadOutput(outputImage(body), Number(providerConfig.timeoutMs), fetchImpl);
  if (result.binary.length < 1024) throw new Error('生成素材数据异常');
  let dimensions = rasterMetadata(result.binary, result.extension);
  if (asset.transparent && !dimensions.alphaChannel && !useSeedream) {
    try {
      result = await chromaRetry();
    } catch {
      result = await seedreamChromaFallback({ asset, pagePlan, referenceFile, referenceDataUrl: referenceInput?.dataUrl, config, cwd, fetchImpl, chroma });
      outputProvider = result.provider; outputModel = result.model;
      keyColor = result.keyColor || chroma.color; postprocess = 'seedream+local-chroma-key'; generatedPrompt = result.fallbackPrompt || prompt;
    }
    dimensions = rasterMetadata(result.binary, result.extension);
  }
  if (asset.transparent && !dimensions.alphaChannel) throw new Error('透明素材后处理完成后仍缺少 Alpha 通道');
  return {
    ...result,
    metadata: {
      provider: outputProvider,
      model: outputModel,
      role: asset.role,
      promptSha256: sha256Text(generatedPrompt),
      sourceReferenceSha256: asset.useReference && referenceFile ? await sha256File(referenceFile) : null,
      sourceReferenceCropSha256: referenceInput?.sha256 || null,
      sourceReferenceCropBytes: referenceInput?.bytes || null,
      sourceReferenceCropFallback: referenceInput?.cropFallback === true,
      alphaRequested: asset.transparent,
      alphaValidated: asset.transparent ? dimensions.alphaChannel : null,
      keyColor,
      postprocess,
      width: dimensions.width,
      height: dimensions.height,
      alphaChannel: dimensions.alphaChannel,
      bytes: result.binary.length,
      durationMs: Math.round(performance.now() - started),
    },
  };
}

const REVIEW_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['pass', 'score', 'issues', 'reason'],
  properties: {
    pass: { type: 'boolean' },
    score: { type: 'number', minimum: 0, maximum: 100 },
    issues: { type: 'array', maxItems: 8, items: { type: 'string' } },
    reason: { type: 'string' },
  },
};

export async function reviewNativeScreenshot({ screenshotFile, page, config = {}, cwd, fetchImpl = proxyAwareFetch }) {
  const provider = { ...providerDefaults('siliconflow', cwd), ...(config.primary || {}) };
  const apiKey = await secretFor(provider, cwd);
  const request = {
    model: provider.model,
    temperature: 0,
    max_tokens: 1200,
    response_format: provider.responseMode === 'json_schema'
      ? { type: 'json_schema', json_schema: { name: 'native_review', strict: true, schema: REVIEW_SCHEMA } }
      : { type: 'json_object' },
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: `Review this single rendered lecture slide. Judge hierarchy, legibility, overlap, connector clarity, coherent native composition, and whether it communicates: ${page.purpose}. Do not compare against another image. Fail only for visible blocking defects. Return one JSON object with pass (boolean), score (0-100), issues (string array), and reason (string).` },
        { type: 'image_url', image_url: { url: await imageDataUrl(screenshotFile) } },
      ],
    }],
  };
  const started = performance.now();
  const response = await fetchImpl(`${String(provider.baseUrl).replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(request), signal: AbortSignal.timeout(Number(provider.timeoutMs)),
  });
  const body = await checkedJson(response, '原生 HTML 单图评审');
  const verdict = parseJsonText(body?.choices?.[0]?.message?.content);
  return { ...verdict, durationMs: Math.round(performance.now() - started), provider: provider.provider, model: provider.model };
}
