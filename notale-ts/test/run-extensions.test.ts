import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import sharp from 'sharp';
import { unzipSync } from 'fflate';
import { createRunRequestSchema, type RunSnapshot } from '../src/protocol/index.js';
import { createApp, publishPages, type GenerationPipeline } from '../src/index.js';
import { FileInputs } from '../src/core/file-input.js';
import { runTemplate } from '../src/core/baseline-pipeline.js';
import { importInput } from '../src/core/theme-runtime.js';

async function settled(get: () => Promise<RunSnapshot>): Promise<RunSnapshot> {
  let run = await get();
  while (run.status === 'queued' || run.status === 'running') { await new Promise(resolve => setTimeout(resolve, 20)); run = await get(); }
  return run;
}
// Runs here fail on purpose: no completed output means no background .notale export racing the temp-dir cleanup.
const failing: GenerationPipeline = async () => { throw new Error('stub'); };
const post = (app: ReturnType<typeof createApp>['app'], payload: object) => app.inject({ method: 'POST', url: '/v1/runs', payload });

test('basedOn is stored, returned and must name an existing run', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'notale-ext-'));
  const { app, store } = createApp({ runsRoot: root, pipeline: failing, logger: false });
  try {
    const first = (await post(app, { query: '一' })).json() as RunSnapshot;
    await settled(() => store.get(first.id));
    const second = await post(app, { query: '二', basedOn: first.id });
    assert.equal(second.statusCode, 202);
    assert.equal((await store.get(second.json().id)).request.basedOn, first.id);
    assert.equal((await app.inject({ url: '/v1/runs/' + second.json().id })).json().request.basedOn, first.id);
    assert.equal((await post(app, { query: '三', basedOn: '20990101t000000z-deadbeef' })).statusCode, 400);
    assert.equal((await post(app, { query: '三', basedOn: 'Bad/Id' })).statusCode, 400);
    await settled(() => store.get(second.json().id));
  } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
});

test('styleImageIds are validated and snapshotted where the Director reads user reference shots', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'notale-ext-'));
  const { app, store } = createApp({ runsRoot: root, pipeline: failing, logger: false });
  try {
    const inputs = new FileInputs(root);
    const image = await inputs.save('style.png', await sharp({ create: { width: 8, height: 8, channels: 3, background: '#335577' } }).png().toBuffer());
    const pdf = await inputs.save('notes.pdf', Buffer.from('%PDF-1.4\n%%EOF\n'));
    assert.equal((await post(app, { query: 'x', styleImageIds: [pdf.id] })).statusCode, 400, 'non-image rejected');
    assert.equal((await post(app, { query: 'x', styleImageIds: ['00000000-0000-4000-8000-000000000000'] })).statusCode, 400, 'unknown id rejected');
    assert.equal((await post(app, { query: 'x', fileIds: [image.id], styleImageIds: [image.id] })).statusCode, 400, 'overlap rejected');
    assert.equal(createRunRequestSchema.safeParse({ query: 'x', styleImageIds: Array(5).fill(image.id) }).success, false);
    await assert.rejects(store.create(createRunRequestSchema.parse({ query: 'x', styleImageIds: [pdf.id] })));

    const response = await post(app, { query: 'x', fileIds: [pdf.id], styleImageIds: [image.id] });
    assert.equal(response.statusCode, 202);
    const run = response.json() as RunSnapshot, runDir = store.runDir(run.id);
    await settled(() => store.get(run.id));
    assert.deepEqual(await readdir(path.join(runDir, 'input/style/shots')), [image.id + '.png']);
    assert.deepEqual((await readdir(path.join(runDir, 'input/files'))).sort(), [pdf.id + '.pdf', 'index.json'].sort());
    // The baseline pipeline hands this directory to the Director as its template, the same route as `--template dir/`.
    const template = runTemplate(run.request, runDir);
    assert.equal(template, path.join(runDir, 'input/style'));
    const assets = path.join(root, 'scratch-assets');
    const imported = await importInput(template, assets);
    assert.equal(imported.css, '');
    assert.deepEqual(imported.shots, [path.join(assets, 'style/shots', image.id + '.png')]);
    assert.equal(runTemplate(createRunRequestSchema.parse({ query: 'x' }), runDir, '/cli.png'), '/cli.png');
  } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
});

test('a run with a caller-supplied pipeline publishes via publishPages and exports a .notale', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'notale-ext-'));
  const { app, store, service } = createApp({ runsRoot: root, pipeline: async () => { throw new Error('default pipeline must not run'); }, logger: false });
  try {
    const fix: GenerationPipeline = async ({ outputDir, signal, emit }) => {
      const pages = path.join(path.dirname(outputDir), 'work/pages');
      await mkdir(path.join(pages, 'assets'), { recursive: true });
      await writeFile(path.join(pages, 'assets/theme.css'), 'body{margin:0}#stage{width:1600px;height:900px}');
      for (const [pid, title] of [['page-01', '封面'], ['page-02', '要点 &amp; 回顾']]) {
        await writeFile(path.join(pages, pid + '.html'), `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><link rel="stylesheet" href="assets/theme.css"></head><body><div id="stage"><h1>${title}</h1></div></body></html>`);
      }
      await emit('phase.changed', '正在整理讲义产物', { phase: 'polish' });
      assert.deepEqual(await publishPages(pages, outputDir, { title: '修订版', signal }), ['page-01', 'page-02']);
    };
    const run = await service.start(createRunRequestSchema.parse({ query: '修订' }), { pipeline: fix });
    const done = await settled(() => store.get(run.id));
    assert.equal(done.status, 'completed', done.error);
    const output = path.join(store.runDir(run.id), 'output');
    assert.ok(existsSync(path.join(output, 'index.html')) && existsSync(path.join(output, 'assets/preview/thumbnails/page-02.png')));
    assert.ok(existsSync(path.join(store.runDir(run.id), 'artifact.json')));
    assert.ok((await service.manifest(run.id)).files.includes('page-02.html'));
    const download = await app.inject({ url: `/v1/runs/${run.id}/download` });
    assert.equal(download.statusCode, 200);
    const names = Object.keys(unzipSync(new Uint8Array(download.rawPayload)));
    assert.ok(names.some(name => name.endsWith('page-01.html')) && names.some(name => name.endsWith('page-02.html')), names.join(','));
  } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
});
