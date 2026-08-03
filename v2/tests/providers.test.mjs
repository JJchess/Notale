import test from 'node:test';
import assert from 'node:assert/strict';
import { access, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  buildSeedreamReferencePrompt,
  hybridReferencePageProvider,
  layeredReferencePageProvider,
  parateraReferenceProvider,
  preflightReferenceProvider,
  staticImageReferenceProvider,
} from '../src/providers.mjs';

const page = {
  id: 'page-002',
  title: '真实邻接关系决定树的形状',
  purpose: '准确呈现节点与边。',
  coreLogic: '邻接关系决定结构。',
  claims: [{ text: 'A 是根节点。', sourceIds: ['src-01'] }],
  graph: {
    nodes: [{ id: 'a', label: 'A · 根' }, { id: 'b', label: 'B' }],
    edges: [{ from: 'a', to: 'b' }],
  },
};

const design = {
  styleLine: '深色技术讲义，结构优先。',
  referenceMood: '编辑式信息图。',
  colors: { primary: '#7DD3FC', secondary: '#C084FC', accent: '#FBBF24' },
  antiSlop: ['禁止卡片堆叠'],
  canvas: { width: 1440, height: 900, safeInset: 56 },
};

test('Seedream prompt 携带真实 graph、反模板与无文字约束', () => {
  const prompt = buildSeedreamReferencePrompt({ page, design, ledger: [] });
  assert.match(prompt, /a->b/);
  assert.match(prompt, /A · 根/);
  assert.match(prompt, /避免均匀卡片阵列/);
  assert.match(prompt, /16:10/);
  assert.match(prompt, /NO TEXT, NO LETTERS, NO NUMBERS/);
  assert.match(prompt, /不要显示色值/);
});

test('Paratera reference provider 下载二进制原图且不依赖 SDK', async () => {
  const envName = `WORKFLOW_TEST_KEY_${process.pid}`;
  process.env[envName] = 'test-secret';
  const calls = [];
  const fakePng = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(2048)]);
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (calls.length === 1) {
      return new Response(JSON.stringify({ data: [{ url: 'https://images.example.test/generated.png' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(fakePng, { status: 200, headers: { 'content-type': 'image/png' } });
  };
  try {
    const result = await parateraReferenceProvider({
      page,
      design,
      ledger: [],
      cwd: process.cwd(),
      config: {
        mode: 'paratera',
        apiKeyEnv: envName,
        baseUrl: 'https://llmapi.paratera.com/v1/',
        model: 'Doubao-Seedream-4.0',
        size: '2560x1600',
      },
      fetchImpl,
    });
    assert.equal(calls[0].url, 'https://llmapi.paratera.com/v1/images/generations');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer test-secret');
    const request = JSON.parse(calls[0].options.body);
    assert.equal(request.model, 'Doubao-Seedream-4.0');
    assert.equal(request.size, '2560x1600');
    assert.equal(result.extension, 'png');
    assert.deepEqual(result.binary, fakePng);
    assert.equal(result.metadata.provider, 'Paratera');
    assert(!JSON.stringify(result.metadata).includes('test-secret'));
  } finally {
    delete process.env[envName];
  }
});

test('OpenRouter image provider 使用专用 Images API 并记录 usage', async () => {
  const envName = `WORKFLOW_OPENROUTER_KEY_${process.pid}`;
  process.env[envName] = 'test-openrouter-secret';
  const calls = [];
  const fakePng = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(2048)]);
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify({
      data: [{ b64_json: fakePng.toString('base64'), media_type: 'image/png' }],
      usage: { total_tokens: 4321, cost: 0.13 },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const result = await parateraReferenceProvider({
      page,
      design,
      ledger: [],
      cwd: process.cwd(),
      config: {
        mode: 'openrouter-image',
        apiKeyEnv: envName,
        baseUrl: 'https://openrouter.ai/api/v1/',
        model: 'openai/gpt-image-2',
        aspectRatio: '16:9',
        quality: 'high',
        background: 'opaque',
      },
      fetchImpl,
    });
    assert.equal(calls[0].url, 'https://openrouter.ai/api/v1/images');
    assert.equal(calls[0].options.headers.Authorization, 'Bearer test-openrouter-secret');
    const request = JSON.parse(calls[0].options.body);
    assert.deepEqual(request, {
      model: 'openai/gpt-image-2',
      prompt: request.prompt,
      n: 1,
      aspect_ratio: '16:9',
      quality: 'high',
      background: 'opaque',
      stream: false,
    });
    assert.equal(result.extension, 'png');
    assert.deepEqual(result.binary, fakePng);
    assert.equal(result.metadata.provider, 'OpenRouter');
    assert.equal(result.metadata.usage.cost, 0.13);
    assert(!JSON.stringify(result.metadata).includes('test-openrouter-secret'));
  } finally {
    delete process.env[envName];
  }
});

test('OpenRouter 前置探针使用低质量请求且不保留图像正文', async () => {
  const envName = `WORKFLOW_PREFLIGHT_KEY_${process.pid}`;
  process.env[envName] = 'test-preflight-secret';
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify({
      data: [{ b64_json: Buffer.alloc(2048).toString('base64'), media_type: 'image/png' }],
      usage: { total_tokens: 300, cost: 0.01 },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const result = await preflightReferenceProvider({
      cwd: process.cwd(),
      config: {
        mode: 'openrouter-image',
        apiKeyEnv: envName,
        model: 'openai/gpt-image-2',
        aspectRatio: '16:9',
        preflightQuality: 'low',
      },
      fetchImpl,
    });
    const request = JSON.parse(calls[0].options.body);
    assert.equal(request.quality, 'low');
    assert.equal(request.aspect_ratio, '16:9');
    assert.equal(result.status, 'pass');
    assert.equal(result.usage.cost, 0.01);
    assert.equal(result.responseBytesApprox > 1000, true);
    assert.equal(Object.hasOwn(result, 'b64_json'), false);
  } finally {
    delete process.env[envName];
  }
});

test('Paratera reference provider 支持按页追加带角色的参考图', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'workflow-page-references-'));
  const envName = `WORKFLOW_PAGE_REF_KEY_${process.pid}`;
  process.env[envName] = 'test-secret';
  const fakeReference = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(2048)]);
  const fakeGenerated = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(4096)]);
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (calls.length === 1) {
      return new Response(JSON.stringify({ data: [{ url: 'https://images.example.test/generated.png' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(fakeGenerated, { status: 200, headers: { 'content-type': 'image/png' } });
  };
  try {
    await writeFile(path.join(temp, 'background.png'), fakeReference);
    await writeFile(path.join(temp, 'layout.png'), fakeReference);
    const result = await parateraReferenceProvider({
      page,
      design,
      ledger: [],
      cwd: temp,
      config: {
        mode: 'paratera',
        apiKeyEnv: envName,
        styleReferences: [{ file: 'background.png', role: 'background-language-reference' }],
        pageStyleReferences: {
          [page.id]: [{
            file: 'layout.png',
            role: 'layout-master',
            instruction: '严格遵循几何位置，但不得复制任何文字。',
          }],
        },
      },
      fetchImpl,
    });
    const request = JSON.parse(calls[0].options.body);
    assert.equal(request.image.length, 2);
    assert.deepEqual(result.metadata.styleReferences.map(reference => reference.role), [
      'background-language-reference',
      'layout-master',
    ]);
  } finally {
    delete process.env[envName];
    await rm(temp, { recursive: true, force: true });
  }
});

test('layered-reference 生成底板、透明节点、SVG 与可编辑文字层', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'workflow-layered-provider-'));
  const cwd = path.join(temp, 'project');
  const runDir = path.join(temp, 'run');
  await mkdir(path.join(cwd, 'nodes'), { recursive: true });
  await mkdir(runDir, { recursive: true });
  const fakeImage = Buffer.alloc(2048, 7);
  const textItem = { x: 10, y: 10, w: 300, h: 80, fontSize: 32, weight: 700, color: '#071a35' };
  const spec = {
    canvas: { width: 2560, height: 1440 },
    text: {
      chapter: { ...textItem, probeBackground: '#d82410' },
      title: textItem,
      subtitle: textItem,
      concepts: [{ ...textItem, text: '概念' }],
      kpiHeader: { ...textItem, text: '指标', probeBackground: '#07345f' },
      kpis: [{ ...textItem, value: '1', label: '节点', valueColor: '#d92512' }],
      banner: { ...textItem, text: '结论', probeBackground: '#0b3b68' },
    },
    graph: {
      radius: 82,
      spritePad: 8,
      nodes: [{ id: 'a', label: 'A', cx: 800, cy: 600 }],
      edges: [],
    },
  };
  await writeFile(path.join(cwd, 'source.jpg'), fakeImage);
  await writeFile(path.join(cwd, 'base.png'), fakeImage);
  await writeFile(path.join(cwd, 'mask.png'), fakeImage);
  await writeFile(path.join(cwd, 'nodes', 'a.png'), fakeImage);
  await writeFile(path.join(cwd, 'spec.json'), JSON.stringify(spec));
  try {
    const reference = await staticImageReferenceProvider({ config: { file: 'source.jpg' }, cwd });
    assert.equal(reference.extension, 'jpg');
    const result = await layeredReferencePageProvider({
      page: { ...page, series: [{ label: '节点数量', value: 1 }] },
      design: { canvas: { width: 1600, height: 900 } },
      reference: { file: 'evidence/page-002/ref.jpg' },
      config: {
        layerSpec: 'spec.json',
        baseImage: 'base.png',
        nodeSpritesDir: 'nodes',
        fidelityMask: 'mask.png',
      },
      cwd,
      runDir,
    });
    assert.match(result.html, /contenteditable="true"/);
    assert.match(result.html, /class="graph-layer"/);
    assert.match(result.html, /data-node-id="a"/);
    assert.equal(result.compositionUsed.movableNodeCount, 1);
    assert.equal(result.compositionUsed.editableTextCount > 0, true);
    await access(path.join(runDir, 'assets', 'page-002', 'base.png'));
    await access(path.join(runDir, 'assets', 'page-002', 'nodes', 'a.png'));
    await access(path.join(runDir, 'assets', 'page-002', 'fidelity-mask.png'));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test('hybrid-reference 使用本地母图、可编辑文本和确定性 SVG 拓扑', async () => {
  const result = await hybridReferencePageProvider({
    page,
    design: { ...design, canvas: { width: 1600, height: 900, safeInset: 56 } },
    reference: { file: 'evidence/page-002/ref.jpg' },
  });
  assert.match(result.html, /class="visual-plate"/);
  assert.match(result.html, /contenteditable="true"/);
  assert.match(result.html, /class="hybrid-graph"/);
  assert.match(result.html, /data-node-id="a"/);
  assert.match(result.html, /<line[^>]+/);
  assert.equal(result.compositionUsed.graphTopology, 'local-svg');
});

test('layered-reference 可直接消费本次生成的 reference 作为基础层', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'workflow-reference-base-'));
  const cwd = path.join(temp, 'project');
  const runDir = path.join(temp, 'run');
  await mkdir(cwd, { recursive: true });
  await mkdir(path.join(runDir, 'evidence', page.id), { recursive: true });
  const fakeImage = Buffer.alloc(2048, 9);
  const textItem = { x: 10, y: 10, w: 300, h: 80, fontSize: 32, weight: 700, color: '#071a35' };
  const spec = {
    canvas: { width: 2560, height: 1440 },
    text: {
      chapter: textItem, title: textItem, subtitle: textItem, concepts: [],
      kpiHeader: { ...textItem, text: '指标' }, kpis: [], banner: { ...textItem, text: '结论' },
    },
    graph: { nodes: [], edges: [] },
  };
  await writeFile(path.join(runDir, 'evidence', page.id, 'ref.png'), fakeImage);
  await writeFile(path.join(cwd, 'spec.json'), JSON.stringify(spec));
  try {
    await layeredReferencePageProvider({
      page,
      design: { canvas: { width: 1600, height: 900 } },
      reference: { file: `evidence/${page.id}/ref.png` },
      config: { layerSpec: 'spec.json', baseImage: '$reference', cssNodes: true },
      cwd,
      runDir,
    });
    await access(path.join(runDir, 'assets', page.id, 'base.png'));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
