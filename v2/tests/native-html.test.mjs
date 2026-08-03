import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditNativePage } from '../src/native-audit.mjs';
import { buildNativeHtmlFromReferenceRun } from '../src/native-pipeline.mjs';
import { analyzeReferenceScene, generateNativeAsset } from '../src/native-providers.mjs';
import { renderNativeScene } from '../src/native-renderer.mjs';
import { buildDeterministicNativeScene, normalizeNativeScene, validateNativeScene } from '../src/native-scene.mjs';
import { buildPipeline } from '../src/pipeline.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const design = {
  styleLine: '编辑式教学设计', referenceMood: '清晰关系图',
  colors: { primary: '#10233c', secondary: '#2563eb', accent: '#f97316' },
  antiSlop: ['禁止整页截图'], canvas: { width: 1600, height: 900, safeInset: 56 },
};
const page = {
  id: 'page-001', title: '遗传信息的传递', purpose: '说明从亲代到子代的信息路径。',
  coreLogic: '基因通过配子从亲代传向子代。',
  claims: [{ text: '等位基因在配子形成时发生分离。', sourceIds: ['src-01'] }],
  graph: {
    nodes: [{ id: 'parent', label: '亲代' }, { id: 'gamete', label: '配子' }, { id: 'child', label: '子代' }],
    edges: [{ from: 'parent', to: 'gamete' }, { from: 'gamete', to: 'child' }],
  },
};

test('native-scene 拒绝未绑定文字和未授权 WebGL', () => {
  const scene = buildDeterministicNativeScene({ page, pagePlan: {}, design });
  scene.nodes.push({
    id: 'bad-copy', type: 'text', role: 'body', parentId: null, bbox: { x: .1, y: .1, w: .2, h: .1 }, z: 4,
    binding: { kind: 'none', index: null, key: null }, style: {}, variant: null, shape: 'none', assetId: null, depth: 0, tilt: 0,
  });
  assert.throws(() => validateNativeScene(scene, { pageId: page.id }), /必须绑定 content-pack/);
  scene.nodes.pop();
  scene.mode = 'webgl-exception';
  assert.throws(() => validateNativeScene(scene, { pageId: page.id }), /WebGL 默认关闭/);
});

test('native-scene 从单一归一化坐标派生源像素证据，并允许确定性布局修正', () => {
  const scene = normalizeNativeScene(buildDeterministicNativeScene({ page, pagePlan: {}, design }), { page, design });
  const title = scene.nodes.find(node => node.id === 'title');
  assert(title.sourceBBox.w > 0);
  assert.equal(Array.isArray(title.anchors), true);
  validateNativeScene(scene, { pageId: page.id });
  title.bbox.h = Math.max(.04, title.bbox.h / 2);
  validateNativeScene(scene, { pageId: page.id });
  title.sourceBBox.x = design.canvas.width - 1;
  assert.throws(() => validateNativeScene(scene, { pageId: page.id }), /越出原始像素画布/);
});

test('素材所有权编译器把基础图形归还 DOM/SVG，只保留复杂视觉素材', () => {
  const raw = buildDeterministicNativeScene({ page, pagePlan: {}, design });
  raw.assets = [
    { id: 'header', role: 'decorative-vector', prompt: 'rounded rectangle header, no text', bbox: { x: .1, y: .1, w: .3, h: .1 }, transparent: true, providerPreference: 'seedream', useReference: false },
    { id: 'flower', role: 'decorative-vector', prompt: 'detailed botanical pea flower illustration, no text', bbox: { x: .1, y: .2, w: .3, h: .4 }, transparent: true, providerPreference: 'seedream', useReference: false },
    { id: 'unused-title', role: 'decorative-vector', prompt: 'golden serif title font', bbox: { x: .1, y: .1, w: .3, h: .1 }, transparent: true, providerPreference: 'seedream', useReference: false },
    { id: 'small_flower', role: 'illustration', prompt: 'same as flower, smaller version', bbox: { x: .6, y: .2, w: .15, h: .2 }, transparent: true, providerPreference: 'gpt-image-2', useReference: false },
  ];
  raw.nodes.push(
    { id: 'header-node', type: 'image', role: 'header', parentId: null, bbox: { x: .1, y: .1, w: .3, h: .1 }, z: 3, binding: { kind: 'none', index: null, key: null }, style: {}, variant: null, shape: 'none', assetId: 'header', depth: 0, tilt: 0 },
    { id: 'flower-node', type: 'image', role: 'illustration', parentId: null, bbox: { x: .1, y: .2, w: .3, h: .4 }, z: 4, binding: { kind: 'none', index: null, key: null }, style: {}, variant: null, shape: 'none', assetId: 'flower', depth: 0, tilt: 0 },
    { id: 'small-flower-node', type: 'image', role: 'illustration', parentId: null, bbox: { x: .6, y: .2, w: .15, h: .2 }, z: 5, binding: { kind: 'none', index: null, key: null }, style: {}, variant: null, shape: 'none', assetId: 'small_flower', depth: 0, tilt: 0 },
  );
  const scene = normalizeNativeScene(raw, { page, design });
  assert.equal(scene.nodes.find(node => node.id === 'header-node').type, 'shape');
  assert.equal(scene.nodes.find(node => node.id === 'header-node').assetId, null);
  assert.equal(scene.nodes.find(node => node.id === 'flower-node').type, 'image');
  assert.equal(scene.nodes.find(node => node.id === 'small-flower-node').assetId, 'flower');
  assert.equal(scene.assets.length, 1);
  assert.equal(scene.assets[0].id, 'flower');
  assert.equal(scene.assets[0].role, 'illustration');
  assert.equal(scene.assets[0].providerPreference, 'gpt-image-2');
  validateNativeScene(scene, { pageId: page.id });
});

test('确定性渲染把文字与关系图编译为 DOM/SVG，原生审计通过', () => {
  const scene = buildDeterministicNativeScene({ page, pagePlan: {}, design });
  const { html } = renderNativeScene({ scene, page, design, assetManifest: [] });
  assert.match(html, /contenteditable="true"/);
  assert.match(html, /class="native-edge-layer"/);
  assert.doesNotMatch(html, /<canvas\b|ref\.(?:png|jpg|svg)/i);
  const audit = auditNativePage({ scene, page, html, assetManifest: [], referenceFile: 'evidence/page-001/ref.png' });
  assert.equal(audit.pass, true);
  assert.equal(audit.nativeOwnership.semanticGraph, 'svg+html');
});

test('VLM 多路径几何被安全编译为可缩放内联 SVG', () => {
  const scene = buildDeterministicNativeScene({ page: { ...page, graph: null }, pagePlan: {}, design });
  scene.nodes.push({
    id: 'observed-symbol', type: 'svg', role: 'observed-symbol', parentId: null,
    bbox: { x: .65, y: .35, w: .22, h: .3 }, sourceBBox: null, anchors: ['center'],
    geometryConfidence: .9, layerConfidence: .9, z: 8,
    binding: { kind: 'none', index: null, key: null }, style: {},
    svgPaths: [
      { d: 'M 100 500 C 250 100 750 100 900 500', fill: null, stroke: '#fbbf24', strokeWidth: 24, opacity: 1 },
      { d: 'M 100 500 C 250 900 750 900 900 500 Z', fill: '#2563eb', stroke: '#ffffff', strokeWidth: 12, opacity: .9 },
    ],
    variant: 'observed-paths', shape: 'none', assetId: null, depth: 0, tilt: 0,
  });
  scene.observedElementCount = scene.nodes.length;
  validateNativeScene(scene, { pageId: page.id });
  const { html } = renderNativeScene({ scene, page: { ...page, graph: null }, design, assetManifest: [] });
  assert.match(html, /viewBox="0 0 1000 1000"/);
  assert.match(html, /M 100 500 C 250 100 750 100 900 500/);
  assert.doesNotMatch(html, /<canvas\b/i);
});

test('原生审计拒绝非背景整页位图', () => {
  const scene = buildDeterministicNativeScene({ page, pagePlan: {}, design });
  scene.mode = 'asset-assisted';
  scene.assets.push({
    id: 'hero', role: 'illustration', prompt: 'Editorial illustration, no text, no letters, no numbers, no logo, no watermark.',
    bbox: { x: 0, y: 0, w: 1, h: 1 }, transparent: false, providerPreference: 'seedream', useReference: false,
  });
  scene.nodes.push({
    id: 'hero-image', type: 'image', role: 'illustration', parentId: null, bbox: { x: 0, y: 0, w: 1, h: 1 }, z: 0,
    binding: { kind: 'none', index: null, key: null }, style: {}, variant: null, shape: 'none', assetId: 'hero', depth: 0, tilt: 0,
  });
  const manifest = [{ id: 'hero', pageId: page.id, role: 'illustration', status: 'pass', file: 'assets/native/page-001/hero.png' }];
  const { html } = renderNativeScene({ scene, page, design, assetManifest: manifest });
  const audit = auditNativePage({ scene, page, html, assetManifest: manifest });
  assert.equal(audit.pass, false);
  assert(audit.issues.some(item => item.code === 'whole-slide-raster'));
});

test('SiliconFlow VLM 使用图片输入与结构化 JSON，透明素材使用 OpenRouter input_references', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'workflow-native-provider-'));
  const reference = path.join(temp, 'reference.png');
  await writeFile(reference, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(2048)]));
  const envName = `NATIVE_OPENROUTER_${process.pid}`;
  process.env[envName] = 'test-key';
  const scene = buildDeterministicNativeScene({ page, pagePlan: {}, design });
  const calls = [];
  const fakePng = Buffer.alloc(2048, 8);
  fakePng.set(Buffer.from([0x89, 0x50, 0x4e, 0x47]), 0);
  fakePng.writeUInt32BE(1024, 16); fakePng.writeUInt32BE(1024, 20); fakePng[25] = 6;
  const fakeImage = fakePng.toString('base64');
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), request: JSON.parse(options.body) });
    if (String(url).endsWith('/chat/completions')) {
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(scene) } }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ data: [{ b64_json: fakeImage }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const analyzed = await analyzeReferenceScene({
      referenceFile: reference, page, pagePlan: {}, design, cwd: temp, fetchImpl,
      config: {
        primary: { baseUrl: 'https://silicon.test/v1', apiKeyEnv: envName, model: 'Qwen/Qwen3-VL-32B-Instruct' },
        fallback: { baseUrl: 'https://silicon.test/v1', apiKeyEnv: envName, model: 'qwen/fallback' },
      },
    });
    assert.equal(analyzed.scene.pageId, page.id);
    assert.equal(calls[0].request.response_format.type, 'json_object');
    assert.doesNotMatch(calls[0].request.messages[0].content, /provide sourceBBox/i);
    assert.match(calls[0].request.messages[1].content[1].image_url.url, /^data:image\/png;base64,/);
    const asset = {
      id: 'portrait', role: 'portrait', prompt: 'Editorial scientist portrait, no text, no letters, no numbers, no logo, no watermark.',
      bbox: { x: .7, y: .1, w: .25, h: .7 }, transparent: true, providerPreference: 'gpt-image-2', useReference: true,
    };
    const output = await generateNativeAsset({
      asset, pagePlan: {}, referenceFile: reference, cwd: temp, fetchImpl,
      config: { openrouter: { baseUrl: 'https://openrouter.test/api/v1', apiKeyEnv: envName, model: 'openai/gpt-image-2' } },
    });
    assert.equal(output.binary.length, 2048);
    assert.equal(calls[1].request.background, 'transparent');
    assert.match(calls[1].url, /\/images$/);
    assert.equal(calls[1].request.input_references.length, 1);
    assert.equal(calls[1].request.input_references[0].type, 'image_url');
    assert.equal(output.metadata.alphaChannel, true);
  } finally {
    delete process.env[envName];
    await rm(temp, { recursive: true, force: true });
  }
});

test('透明素材缺少 Alpha 时自动走同模型绿幕与本地抠图', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'workflow-native-chroma-'));
  const reference = path.join(temp, 'reference.png');
  await writeFile(reference, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(2048)]));
  const envName = `NATIVE_CHROMA_${process.pid}`;
  process.env[envName] = 'test-key';
  const rgbPng = (await readFile(path.join(ROOT, 'examples', 'tree-fidelity', 'assets', 'tree-structure-reference.png'))).toString('base64');
  const requests = [];
  const fetchImpl = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return new Response(JSON.stringify({ data: [{ b64_json: rgbPng, media_type: 'image/png' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const output = await generateNativeAsset({
      asset: { id: 'cutout', role: 'cutout', prompt: 'Scientific object cutout, no text, no letters, no numbers, no logo, no watermark.', bbox: { x: .1, y: .1, w: .3, h: .5 }, transparent: true, providerPreference: 'gpt-image-2', useReference: false },
      pagePlan: {}, referenceFile: reference, cwd: temp, fetchImpl,
      config: { openrouter: { baseUrl: 'https://openrouter.test/api/v1', apiKeyEnv: envName, model: 'openai/gpt-image-2' } },
    });
    assert.equal(requests.length, 2);
    assert.match(requests[1].prompt, /chroma green/i);
    assert.equal(output.metadata.alphaChannel, true);
    assert.equal(output.metadata.postprocess, 'local-chroma-key');
    assert.equal(output.metadata.keyColor, '#00ff00');
  } finally {
    delete process.env[envName];
    await rm(temp, { recursive: true, force: true });
  }
});

test('reference-html 离线模式完成原生场景、四类证据与 deck 装订', { timeout: 120_000 }, async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'workflow-native-e2e-'));
  const projectDir = path.join(temp, 'project');
  const runDir = path.join(temp, 'run');
  await mkdir(path.join(projectDir, 'materials'), { recursive: true });
  await writeFile(path.join(projectDir, 'materials', 'source.md'), '# 遗传规律\n等位基因在配子形成时发生分离。', 'utf8');
  const project = {
    title: '遗传规律', language: 'zh-CN', design: path.join(ROOT, 'config', 'design-baseline.json'), materials: ['materials/source.md'],
    nativeHtml: { offline: true, viewports: [{ width: 1500, height: 844 }], review: { enabled: false }, assets: { enabled: false } },
    providers: { content: { mode: 'local' }, reference: { mode: 'local' }, page: { mode: 'local' }, review: { mode: 'local' } },
    pages: [page],
  };
  const projectFile = path.join(projectDir, 'project.json');
  await writeFile(projectFile, JSON.stringify(project), 'utf8');
  try {
    await buildPipeline({ projectFile, outDir: runDir, through: 'reference' });
    const result = await buildNativeHtmlFromReferenceRun({ sourceRun: runDir, outDir: runDir, options: { offline: true } });
    assert.equal(result.manifest.status, 'pass');
    assert.equal(result.manifest.through, 'native-html');
    assert.equal(result.manifest.nativeGate, 'pass');
    assert.equal(result.manifest.geometryGate, 'pass');
    for (const file of ['deck.html', 'native-audit.json', 'native-probe-summary.json', 'native-interaction-summary.json', 'native-geometry-summary.json', 'native-review-summary.json', 'native-timings-summary.json', 'asset-manifest.json']) {
      await access(path.join(runDir, file));
    }
    const deck = await readFile(path.join(runDir, 'deck.html'), 'utf8');
    assert.match(deck, /data-native-scene="1.0"/);
    assert.match(deck, /native-edge-layer/);
    assert.doesNotMatch(deck, /<img[^>]+evidence\/page-001\/ref/i);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('严格模式隔离单页场景失败并继续生成可检查的完整 deck', { timeout: 120_000 }, async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'workflow-native-quarantine-'));
  const projectDir = path.join(temp, 'project');
  const runDir = path.join(temp, 'run');
  await mkdir(path.join(projectDir, 'materials'), { recursive: true });
  await writeFile(path.join(projectDir, 'materials', 'source.md'), '# 遗传规律\n等位基因在配子形成时发生分离。', 'utf8');
  const secondPage = { ...page, id: 'page-002', title: '测交验证' };
  const project = {
    title: '遗传规律', language: 'zh-CN', design: path.join(ROOT, 'config', 'design-baseline.json'), materials: ['materials/source.md'],
    nativeHtml: { strict: true, viewports: [{ width: 1500, height: 844 }], review: { enabled: false }, assets: { enabled: false } },
    providers: { content: { mode: 'local' }, reference: { mode: 'local' }, page: { mode: 'local' }, review: { mode: 'local' } },
    pages: [page, secondPage],
  };
  const projectFile = path.join(projectDir, 'project.json');
  await writeFile(projectFile, JSON.stringify(project), 'utf8');
  try {
    await buildPipeline({ projectFile, outDir: runDir, through: 'reference' });
    const result = await buildNativeHtmlFromReferenceRun({
      sourceRun: runDir,
      outDir: runDir,
      options: {
        sceneAnalyzer: async ({ page: scenePage, pagePlan, design: sceneDesign }) => {
          if (scenePage.id === 'page-001') throw new Error('synthetic scene protocol failure');
          return {
            scene: buildDeterministicNativeScene({ page: scenePage, pagePlan, design: sceneDesign }),
            metadata: { provider: 'test-vlm', model: 'test-scene-model' },
            attempts: [],
          };
        },
      },
    });
    assert.equal(result.manifest.status, 'fail');
    assert.equal(result.manifest.sceneGate, 'fail');
    assert.equal(result.manifest.failedPages.length, 1);
    assert.equal(result.manifest.failedPages[0].pageId, 'page-001');
    await access(path.join(runDir, 'pages', 'page-001.html'));
    await access(path.join(runDir, 'pages', 'page-002.html'));
    const deck = await readFile(path.join(runDir, 'deck.html'), 'utf8');
    assert.match(deck, /data-page-id="page-001"/);
    assert.match(deck, /data-page-id="page-002"/);
    const meta = JSON.parse(await readFile(path.join(runDir, 'evidence', 'page-001', 'native-scene-meta.json'), 'utf8'));
    assert.equal(meta.provider, 'strict-failure');
    assert.equal(meta.quarantinePreview, true);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
