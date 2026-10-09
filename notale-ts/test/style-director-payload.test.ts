import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import type { AssistantTurn, ChatInputBlock, ChatMessage, ChatModel, ModelRequestOptions } from '../src/adapters/models/chat-model.js';
import { ModelHttpError, ModelRequestBudgetError, ModelRuntime } from '../src/adapters/models/runtime.js';
import { direct, type DirectorPorts, type SelectionImageOptions } from '../src/core/director.js';
import type { WorkflowTrace } from '../src/core/planner.js';
import { StyleCatalog, STYLE_ROOT, images } from '../src/core/style-assets.js';

const image = (id: string): ChatInputBlock => ({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${Buffer.from(id).toString('base64')}` } });
const imageUrls = (messages: ChatMessage[]) => messages.flatMap(message => Array.isArray(message.content) ? message.content.flatMap(block => block.type === 'image_url' ? [block.image_url.url] : []) : []);
const turn = (name: string, args: object, id = 'tool'): AssistantTurn => ({ id, inputTokens: 1, outputTokens: 1, message: { role: 'assistant', content: '', tool_calls: [{ id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } });
function ports(model: ChatModel): DirectorPorts {
  const detail = async () => ({ text: 'selected detail', images: [image('selected-detail')] });
  return {
    model, visionInput: true, trace: () => {}, images: async () => [], media: async () => ({ text: '', images: [] }),
    catalog: {
      rows: () => [['01-minimalism', '极简', '清楚']], match: () => undefined, identify: () => '01-minimalism', readPath: () => 'catalog.png',
      selectionInputs: async (options?: SelectionImageOptions) => ({ text: '01-minimalism', images: Array.from({ length: 10 }, (_, i) => image(`${options ? 'small' : 'normal'}-${i}`)) }),
      selectedInputs: detail, inputs: detail, detail,
    },
    theme: {
      checkOptions: () => {}, importInput: async () => ({ css: '', shots: [] }), importedAssets: async () => [], prepareFonts: async () => undefined,
      referenceImages: async () => undefined, references: () => [['style', '01-minimalism']], gates: async () => [], publish: async () => {},
    },
  };
}
const run = (root: string) => ({ root, query: '讲清楚注意力机制', audience: '大学一年级', minutes: 20 });

test('real ten overview images fit the pick wire budget, match their labels, and leave full detail images intact', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'notale-style-payload-'));
  try {
    const catalog = new StyleCatalog();
    const files = Array.from({ length: 10 }, (_, i) => path.join(STYLE_ROOT, 'contact-sheets', `${String(i + 1).padStart(2, '0')}.png`));
    const hash = async (file: string) => createHash('sha256').update(await readFile(file)).digest('hex');
    const before = await Promise.all(files.map(hash));
    const first = await catalog.selectionInputs(), small = await catalog.selectionInputs({ width: 1000, quality: 50 });
    assert.equal(catalog.rows().length, 40);
    for (const [input, edge] of [[first, 1200], [small, 1000]] as const) {
      assert.equal(input.images.filter(block => block.type === 'image_url').length, 10);
      for (let i = 1; i < input.images.length; i += 2) {
        const label = input.images[i - 1]!, block = input.images[i]!;
        assert.equal(label.type, 'text'); assert.equal(block.type, 'image_url');
        if (label.type !== 'text' || block.type !== 'image_url') throw new Error('missing image pair');
        assert.ok(block.image_url.url.startsWith('data:image/jpeg;base64,'));
        const data = Buffer.from(block.image_url.url.split(',')[1]!, 'base64'), metadata = await sharp(data).metadata();
        assert.ok(metadata.width! <= edge && metadata.height! <= edge);
        assert.ok(label.text.includes(`${metadata.width}×${metadata.height}`));
        assert.ok(label.text.includes(createHash('sha256').update(data).digest('hex')));
      }
      for (const row of catalog.rows()) assert.ok(input.text.includes(row[0]!));
    }
    assert.ok(JSON.stringify(small.images).length < JSON.stringify(first.images).length * 0.75);
    const detail = await catalog.detail('01-minimalism');
    assert.deepEqual(detail.images, await images([{ id: '01-minimalism', shot: catalog.readPath('01-minimalism') }], 1600));
    assert.deepEqual(await Promise.all(files.map(hash)), before);

    // Reuse these exact image buffers while exercising each actual wire adapter.
    catalog.selectionInputs = async options => options ? small : first;
    const wireImageCount = (value: unknown): number => {
      if (Array.isArray(value)) return value.reduce<number>((sum, item) => sum + wireImageCount(item), 0);
      if (!value || typeof value !== 'object') return 0;
      const row = value as Record<string, unknown>;
      if (['image_url', 'input_image', 'image'].includes(String(row.type))) return 1;
      return Object.values(row).reduce<number>((sum, item) => sum + wireImageCount(item), 0);
    };
    for (const [adapter, rejectFirst] of [['chat', false], ['messages', false], ['responses', false], ['chat', true]] as const) {
      const caseRoot = path.join(root, `${adapter}-${rejectFirst}`), bodies: string[] = [], bytes: number[] = [], traces: WorkflowTrace[] = [];
      const model = new ModelRuntime({ id: 'test', model: 'test', adapter, api_key_env: 'TEST_STYLE_KEY', base_url: 'https://example.invalid/v1', reasoning_effort: 'low', vision_input: true, http_timeout_sec: 1, max_output_tokens: 1024, request_options: {}, replay_reasoning: false }, {
        env: { TEST_STYLE_KEY: 'test' }, fetch: async (_url, init) => {
          const body = String(init?.body); bytes.push(Buffer.byteLength(body)); bodies.push(body);
          if (rejectFirst && bodies.length === 1) return new Response('Request too large', { status: 413 });
          const pick = bodies.length === (rejectFirst ? 2 : 1);
          const args = pick ? { file_path: path.join(caseRoot, 'style-picks.tsv'), content: '01-minimalism\t留出清楚的图文关系' } : { file_path: path.join(caseRoot, 'pages/assets/theme.css'), content: ':root { --bg: #fff; }' };
          const id = String(bodies.length), usage = { input_tokens: 1, output_tokens: 1 };
          const response = adapter === 'chat'
            ? { id, choices: [{ finish_reason: 'stop', message: turn('Write', args, id).message }], usage: { prompt_tokens: 1, completion_tokens: 1 } }
            : adapter === 'messages'
              ? { id, content: [{ type: 'tool_use', id, name: 'Write', input: args }], stop_reason: 'tool_use', usage }
              : { id, status: 'completed', output: [{ type: 'function_call', call_id: id, name: 'Write', arguments: JSON.stringify(args) }], usage };
          return new Response(JSON.stringify(response), { status: 200 });
        },
      });
      const p = ports(model); p.catalog = catalog; p.images = images; p.trace = record => { traces.push(record); };
      await direct(run(caseRoot), p);
      assert.equal(bodies.length, rejectFirst ? 3 : 2);
      assert.ok(bytes[0]! <= 1024 * 1024, `${adapter} actual pick body is ${bytes[0]} bytes`);
      assert.equal(wireImageCount(JSON.parse(bodies[0]!)), 10);
      assert.equal(wireImageCount(JSON.parse(bodies.at(-1)!)), 1);
      assert.ok(bodies.at(-1)!.includes('留出清楚的图文关系'));
      if (rejectFirst) {
        assert.ok(bytes[1]! <= bytes[0]! * 0.75 && bytes[1]! <= 768 * 1024, `retry sizes ${bytes[0]} -> ${bytes[1]}`);
        assert.equal(wireImageCount(JSON.parse(bodies[1]!)), 10);
        const firstTrace = traces[0]!;
        assert.deepEqual(firstTrace.submitted, firstTrace.request[1]!.content, 'trace must describe the actual reduced request');
        assert.deepEqual(imageUrls(firstTrace.request), imageUrls([{ role: 'user', content: small.images }]));
      }
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

for (const failure of ['local', 'gateway'] as const) test(`${failure} size rejection replaces overview images once and keeps selection tool pairs`, async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'notale-style-retry-'));
  try {
    const seen: { messages: ChatMessage[]; options: ModelRequestOptions | undefined }[] = [];
    const model: ChatModel = { respond: async (messages, _tools, _signal, options) => {
      seen.push({ messages, options });
      if (seen.length === 1) {
        const request = { stage: 'style-pick', adapter: 'chat', requestBytes: 1000000, maxRequestBytes: 900000, imageCount: 10 };
        throw failure === 'local' ? new ModelRequestBudgetError(request) : new ModelHttpError(413, '413', '413', request);
      }
      if (seen.length === 2) return turn('Write', { file_path: path.join(root, 'style-picks.tsv'), content: '01-minimalism\t清楚的图文关系' }, 'pick');
      if (seen.length === 3) return turn('Read', { file_path: '01-minimalism' }, 'read-again');
      return turn('Write', { file_path: path.join(root, 'pages/assets/theme.css'), content: ':root { --bg: #fff; }' }, 'theme');
    } };
    await direct(run(root), ports(model));
    assert.equal(seen.length, 4);
    assert.deepEqual(seen[0]!.options, { stage: 'style-pick', maxRequestBytes: 1024 * 1024 });
    assert.deepEqual(seen[1]!.options, { stage: 'style-pick', maxRequestBytes: 750000 });
    assert.equal(imageUrls(seen[0]!.messages).length, 10);
    assert.deepEqual(imageUrls(seen[1]!.messages), Array.from({ length: 10 }, (_, i) => (image(`small-${i}`) as Extract<ChatInputBlock, { type: 'image_url' }>).image_url.url));
    for (const request of seen.slice(2)) {
      assert.deepEqual(request.options, { stage: 'style-theme' });
      assert.deepEqual(imageUrls(request.messages), [(image('selected-detail') as Extract<ChatInputBlock, { type: 'image_url' }>).image_url.url]);
      assert.ok(request.messages.some(message => message.role === 'assistant' && message.tool_calls?.[0]?.id === 'pick'));
      assert.ok(request.messages.some(message => message.role === 'tool' && message.tool_call_id === 'pick'));
      assert.ok(JSON.stringify(request.messages).includes('清楚的图文关系'));
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('a second 413 is surfaced without a third request or losing images', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'notale-style-rejected-'));
  try {
    let calls = 0;
    const model: ChatModel = { respond: async messages => {
      calls++; assert.equal(imageUrls(messages).length, 10);
      throw new ModelHttpError(413, '413', '413', { stage: 'style-pick', adapter: 'chat', requestBytes: calls === 1 ? 1000000 : 700000, imageCount: 10 });
    } };
    await assert.rejects(direct(run(root), ports(model)), (error: unknown) => error instanceof ModelHttpError && error.status === 413);
    assert.equal(calls, 2);
  } finally { await rm(root, { recursive: true, force: true }); }
});
