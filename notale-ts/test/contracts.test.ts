import assert from "node:assert/strict";
import { mkdtemp, cp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createRunRequestSchema } from "../src/protocol/index.js";
import { RunService } from "../src/core/run-service.js";
import { RunStore } from "../src/core/run-store.js";
import { starterPipeline } from "../src/core/starter-pipeline.js";

test("a run persists ordered events and produces movable files without symlinks", async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "notale-ts-"));
  const store = new RunStore(path.join(temporary, "runs"));
  const service = new RunService(store, starterPipeline);
  const run = await service.start(createRunRequestSchema.parse({ query: "梯度下降" }));
  let snapshot = await store.get(run.id);
  while (snapshot.status === "queued" || snapshot.status === "running") {
    await new Promise((resolve) => setTimeout(resolve, 10));
    snapshot = await store.get(run.id);
  }
  assert.equal(snapshot.status, "completed");
  const events = await store.events(run.id);
  assert.deepEqual(events.map((event) => event.sequence), events.map((_, index) => index + 1));
  assert.equal(events.at(-1)?.kind, "run.completed");
  const manifest = await service.manifest(run.id);
  assert.ok(manifest.files.includes("index.html"));
  const moved = path.join(temporary, "moved-output");
  await cp(path.join(store.runDir(run.id), "output"), moved, { recursive: true, dereference: false });
  assert.ok(manifest.files.every((file) => !path.isAbsolute(file) && !file.includes("..")));
});

test("concurrent snapshot updates preserve persisted event sequence and status", async () => {
  const { rm } = await import('node:fs/promises');
  const root = await mkdtemp(path.join(os.tmpdir(), 'notale-store-concurrency-'));
  const store = new RunStore(root);
  try {
    const run = await store.create(createRunRequestSchema.parse({ query: 'concurrent events' }));
    const operations: Promise<unknown>[] = [];
    for (let i = 0; i < 12; i++) {
      operations.push(store.emit(run.id, 'phase.changed', `phase ${i}`, { phase: 'create' }));
      operations.push(store.update(run.id, { status: 'running' }));
    }
    await Promise.all(operations);
    await store.update(run.id, { status: 'cancelled' });
    const events = await store.events(run.id);
    assert.deepEqual(events.map(event => event.sequence), Array.from({ length: 12 }, (_, i) => i + 1));
    const snapshot = await store.get(run.id);
    assert.equal(snapshot.lastSequence, 12);
    assert.equal(snapshot.status, 'cancelled');
    assert.equal(snapshot.phase, 'create');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("cancellation waits for workers and wins during manifest preparation without contradictory terminal events", async () => {
  const { writeFile, rm } = await import('node:fs/promises');
  const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; };
  for (const phase of ['worker', 'manifest']) {
    const root = await mkdtemp(path.join(os.tmpdir(), 'notale-cancel-'));
    const store = new RunStore(root), entered = deferred(), release = deferred(), aborted = deferred();
    let signal!: AbortSignal;
    class PausedService extends RunService {
      override async manifest(id: string) {
        if (phase === 'manifest') { entered.resolve(); await release.promise; }
        return super.manifest(id);
      }
    }
    const service = new PausedService(store, async context => {
      signal = context.signal;
      signal.addEventListener('abort', aborted.resolve, { once: true });
      await writeFile(path.join(context.outputDir, 'index.html'), '<p>fixture</p>');
      if (phase === 'worker') { entered.resolve(); await release.promise; }
    });
    try {
      const run = await service.start(createRunRequestSchema.parse({ query: phase }));
      await entered.promise;
      let returned = false;
      const first = service.cancel(run.id).then(snapshot => { returned = true; return snapshot; });
      const second = service.cancel(run.id);
      await aborted.promise;
      assert.equal(returned, false);
      assert.equal((await store.get(run.id)).status, 'running');
      release.resolve();
      assert.equal((await first).status, 'cancelled');
      assert.equal((await second).status, 'cancelled');
      const events = await store.events(run.id);
      assert.deepEqual(events.filter(event => ['run.completed', 'run.failed', 'run.cancelled'].includes(event.kind)).map(event => event.kind), ['run.cancelled']);
      assert.equal(events.at(-1)?.kind, 'run.cancelled');
      assert.equal((await service.cancel(run.id)).status, 'cancelled');
    } finally { release.resolve(); await rm(root, { recursive: true, force: true }); }
  }
});

test("SSE replay honors Last-Event-ID even when the original URL says after=0", async () => {
  const { rm } = await import('node:fs/promises');
  const { createApp } = await import('../src/server/app.js');
  const root = await mkdtemp(path.join(os.tmpdir(), 'notale-reconnect-'));
  const { app, store } = createApp({ runsRoot: root, useStarterPipeline: true, logger: false });
  try {
    const run = await store.create(createRunRequestSchema.parse({ query: 'replay' }));
    await store.emit(run.id, 'run.started', 'start');
    await store.emit(run.id, 'page.ready', 'page');
    await store.update(run.id, { status: 'completed' });
    await store.emit(run.id, 'run.completed', 'done');
    for (const [query, header, expected] of [['0', '2', [3]], ['2', '1', [3]], ['Infinity', 'NaN', [1, 2, 3]]] as const) {
      const result = await app.inject({ url: `/v1/runs/${run.id}/events?after=${query}`, headers: { 'last-event-id': header } });
      assert.equal(result.statusCode, 200);
      assert.deepEqual([...result.body.matchAll(/^id: (\d+)$/gm)].map(match => Number(match[1])), expected);
    }
  } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
});

test("invalid requests fail at the protocol boundary", () => {
  assert.equal(createRunRequestSchema.safeParse({}).success, false);
  assert.equal(createRunRequestSchema.safeParse({ query: "x", minutes: 1.5 }).success, false);
  for (const minutes of [0, -1, 999, 9007199254740992, 10000000000000000, -10000000000000000]) {
    assert.equal(createRunRequestSchema.parse({ query: "x", minutes }).minutes, minutes);
  }
  for (const minutes of [NaN, Infinity, -Infinity]) assert.equal(createRunRequestSchema.safeParse({ query: "x", minutes }).success, false);
  assert.deepEqual(createRunRequestSchema.parse({ query: " x " }), { query: " x ", minutes: 90, audience: "学过一点相关基础、但没系统学过这个题目的读者", scenario: "", style: "" });
});

test('preview serves in-progress pages and refuses links outside the working artifact', async () => {
  const { mkdir, writeFile, symlink, rm } = await import('node:fs/promises');
  const { createApp } = await import('../src/server/app.js');
  const root = await mkdtemp(path.join(os.tmpdir(), 'notale-preview-'));
  const { app, store } = createApp({ runsRoot: root, useStarterPipeline: true });
  try {
    const run = await store.create(createRunRequestSchema.parse({ query: 'preview fixture' }));
    const pages = path.join(store.runDir(run.id), 'work/pages');
    await mkdir(path.join(pages, 'assets'), { recursive: true });
    await writeFile(path.join(pages, 'page-01.html'), '<p>in progress</p>');
    await writeFile(path.join(root, 'outside.txt'), 'outside');
    await symlink(path.join(root, 'outside.txt'), path.join(pages, 'assets/outside.txt'));
    const url = `/v1/runs/${run.id}/preview/`;
    assert.equal((await app.inject({ url: url + 'page-01.html' })).body, '<p>in progress</p>');
    assert.equal((await app.inject({ url: url + 'assets/outside.txt' })).statusCode, 404);
    await store.update(run.id, { status: 'completed' });
    assert.equal((await app.inject({ url: url + 'page-01.html' })).statusCode, 404);
  } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
});

test('lecture archive preserves files and produces an importable editor manifest', async () => {
  const { writeFile, rm, readFile } = await import('node:fs/promises');
  const { createHash } = await import('node:crypto');
  const { unzipSync } = await import('fflate');
  const { lectureArchive } = await import('../src/server/lecture-archive.js');
  const root = await mkdtemp(path.join(os.tmpdir(), 'notale-archive-'));
  const store = new RunStore(root), service = new RunService(store, starterPipeline);
  try {
    const run = await store.create(createRunRequestSchema.parse({ query: 'archive fixture' }));
    await assert.rejects(lectureArchive(service, run.id, {}), /lecture_not_completed/);
    const output = path.join(store.runDir(run.id), 'output');
    await writeFile(path.join(output, 'index.html'), '<p>assembled</p>');
    await writeFile(path.join(output, 'page-02.html'), '<p>second</p>');
    await writeFile(path.join(output, 'page-01.html'), '<p>first</p>');
    await writeFile(path.join(output, 'base.js'), 'window.Deck = {};');
    await store.update(run.id, { status: 'completed' });
    const files = unzipSync(await lectureArchive(service, run.id, { '.js': 'text/javascript' }));
    const { document } = JSON.parse(Buffer.from(files['notale-project.json']!).toString());
    const nativeManifest = JSON.parse(Buffer.from(files['notale-project.json']!).toString());
    assert.equal(nativeManifest.format, 'notale');
    assert.equal(nativeManifest.formatVersion, 1);
    assert.equal(nativeManifest.entry, 'index.html');
    assert.equal(nativeManifest.document.schemaVersion, 1);
    assert.deepEqual(document.slides.map((s: any) => s.sourcePath), ['page-01.html', 'page-02.html']);
    assert.match(document.slides[0].html, /<p data-notale-id="[\w-]+">first<\/p>/);
    assert.equal(document.assets['index.html'], undefined, 'editor reserves the assembled entry');
    assert.equal(document.assets['base.js'].hash, createHash('sha256').update(files['base.js']!).digest('hex'));
    for (const name of ['index.html', 'page-01.html', 'page-02.html', 'base.js']) {
      assert.deepEqual(Buffer.from(files[name]!), await readFile(path.join(output, name)));
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('notale exports do not block completion, coalesce downloads, persist cache and recover interrupted jobs', async () => {
  const { writeFile, readFile, rm } = await import('node:fs/promises');
  const { LectureExports } = await import('../src/server/lecture-exports.js');
  const { lectureArchive } = await import('../src/server/lecture-archive.js');
  const root = await mkdtemp(path.join(os.tmpdir(), 'notale-exports-'));
  const store = new RunStore(root);
  let enter!: () => void, release!: () => void, calls = 0;
  const entered = new Promise<void>(resolve => { enter = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const service: RunService = new RunService(store, async ({ outputDir }) => {
    await writeFile(path.join(outputDir, 'index.html'), '<p>lecture</p>');
    await writeFile(path.join(outputDir, 'page-01.html'), '<p>page</p>');
  }, id => exports.ensure(id));
  const pack: typeof lectureArchive = async (...args) => { calls++; enter(); await gate; return lectureArchive(...args); };
  const exports = new LectureExports(service, pack);
  try {
    const run = await service.start(createRunRequestSchema.parse({ query: '原生讲义' }));
    await entered;
    assert.equal((await store.get(run.id)).status, 'completed');
    assert.equal((await store.events(run.id)).at(-1)?.kind, 'run.completed');
    const a = exports.ensure(run.id), b = exports.ensure(run.id);
    assert.equal(a, b); assert.equal(calls, 1);
    release();
    const file = await a, bytes = await readFile(file);
    assert.equal(await exports.ensure(run.id), file); assert.equal(calls, 1);
    const restarted = new LectureExports(service, pack);
    assert.deepEqual(await readFile(await restarted.ensure(run.id)), bytes); assert.equal(calls, 1);
    await writeFile(path.join(store.runDir(run.id), 'exports/notale.json'), JSON.stringify({ status: 'building' }));
    await restarted.recover(); await restarted.idle();
    assert.equal(calls, 2);
    assert.equal(JSON.parse(await readFile(path.join(store.runDir(run.id), 'exports/notale.json'), 'utf8')).status, 'ready');
    assert.ok(!(await service.manifest(run.id)).files.some(name => name.endsWith('.notale')));
  } finally { release(); await exports.idle(); await rm(root, { recursive: true, force: true }); }
});

test('notale failed exports stay separate from generation and retry on demand', async () => {
  const { writeFile, readFile, rm } = await import('node:fs/promises');
  const { LectureExports, notaleFilename } = await import('../src/server/lecture-exports.js');
  const { lectureArchive } = await import('../src/server/lecture-archive.js');
  const root = await mkdtemp(path.join(os.tmpdir(), 'notale-export-failed-'));
  const store = new RunStore(root), service = new RunService(store, starterPipeline);
  let calls = 0;
  const exports = new LectureExports(service, async (...args) => { if (++calls === 1) throw new Error('fixture compression failure'); return lectureArchive(...args); });
  try {
    const run = await store.create(createRunRequestSchema.parse({ query: 'fixture' }));
    await writeFile(path.join(store.runDir(run.id), 'output/index.html'), '<p>lecture</p>');
    await writeFile(path.join(store.runDir(run.id), 'output/page-01.html'), '<p>page</p>');
    await store.update(run.id, { status: 'completed' });
    await assert.rejects(exports.ensure(run.id), /fixture compression failure/);
    assert.equal((await store.get(run.id)).status, 'completed');
    await assert.rejects(readFile(path.join(store.runDir(run.id), 'exports/lecture.notale')), { code: 'ENOENT' });
    await exports.recover(); await exports.idle(); assert.equal(calls, 1, 'failed tasks do not retry in the background');
    await exports.ensure(run.id); assert.equal(calls, 2);
    assert.equal(notaleFilename(' 你好/世界:课程\r\n', 'fallback'), '你好 世界 课程.notale');
    assert.equal(notaleFilename('...', 'fallback'), 'fallback.notale');
  } finally { await exports.idle(); await rm(root, { recursive: true, force: true }); }
});

test('notale download API defaults to v1 and rejects ZIP or unfinished exports', async () => {
  const { writeFile, rm } = await import('node:fs/promises');
  const { unzipSync } = await import('fflate');
  const { createApp } = await import('../src/server/app.js');
  const root = await mkdtemp(path.join(os.tmpdir(), 'notale-download-'));
  const { app, store } = createApp({ runsRoot: root, useStarterPipeline: true, logger: false });
  try {
    const run = await store.create(createRunRequestSchema.parse({ query: '中文讲义' }));
    const url = '/v1/runs/' + run.id + '/download';
    assert.equal((await app.inject(url + '?format=other')).statusCode, 400);
    assert.equal((await app.inject(url + '?format=zip')).statusCode, 400);
    assert.equal((await app.inject(url + '?format=notale')).statusCode, 409);
    await writeFile(path.join(store.runDir(run.id), 'output/index.html'), '<p>lecture</p>');
    await writeFile(path.join(store.runDir(run.id), 'output/page-01.html'), '<p>page</p>');
    await store.update(run.id, { status: 'completed' });
    const native = await app.inject(url + '?format=notale');
    assert.equal(native.statusCode, 200); assert.match(native.headers['content-disposition']!, /\.notale/);
    assert.match(native.headers['content-disposition']!, /filename\*=UTF-8''/);
    assert.ok(native.headers['content-disposition']!.includes(encodeURIComponent(`讲义-${run.id}.notale`)));
    assert.equal(native.headers['content-type'], 'application/octet-stream');
    assert.equal(JSON.parse(Buffer.from(unzipSync(native.rawPayload)['notale-project.json']!).toString()).format, 'notale');
    const defaultDownload = await app.inject(url);
    assert.equal(defaultDownload.statusCode, 200);
    assert.match(defaultDownload.headers['content-disposition']!, /\.notale/);
    assert.equal(defaultDownload.headers['content-type'], 'application/octet-stream');
    assert.deepEqual(defaultDownload.rawPayload, native.rawPayload);
  } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
});

test('publication serves cached compressed assets without caching mutable work or following compressed symlinks', async () => {
  const { mkdir, writeFile, symlink, rm } = await import('node:fs/promises');
  const { gzipSync } = await import('node:zlib');
  const { createApp } = await import('../src/server/app.js');
  const root = await mkdtemp(path.join(os.tmpdir(), 'notale-publish-http-'));
  const { app, store } = createApp({ runsRoot: root, useStarterPipeline: true, logger: false });
  try {
    const run = await store.create(createRunRequestSchema.parse({ query: 'cache fixture' }));
    const working = path.join(store.runDir(run.id), 'work/pages'); await mkdir(working, { recursive: true });
    await writeFile(path.join(working, 'index.html'), 'working');
    const url = `/v1/runs/${run.id}/preview/`;
    assert.equal((await app.inject(url + 'index.html')).headers['cache-control'], 'no-store');
    const output = path.join(store.runDir(run.id), 'output'), body = 'window.data = "' + 'cached '.repeat(1000) + '";';
    await writeFile(path.join(output, 'index.html'), 'published');
    await writeFile(path.join(output, 'shared.js'), body); await writeFile(path.join(output, 'shared.js.gz'), gzipSync(body));
    await store.update(run.id, { status: 'completed' });
    const response = await app.inject({ url: url + 'shared.js', headers: { 'accept-encoding': 'gzip' } });
    assert.equal(response.statusCode, 200); assert.equal(response.headers['content-encoding'], 'gzip');
    assert.match(String(response.headers['cache-control']), /immutable/);
    assert.match(String(response.headers.vary), /Accept-Encoding/i);
    const again = await app.inject({ url: url + 'shared.js', headers: { 'accept-encoding': 'gzip', 'if-none-match': String(response.headers.etag) } });
    assert.equal(again.statusCode, 304);
    assert.equal((await app.inject(url + 'index.html')).headers['cache-control'], 'no-cache');
    await writeFile(path.join(root, 'private.br'), 'private');
    await symlink(path.join(root, 'private.br'), path.join(output, 'shared.js.br'));
    assert.equal((await app.inject({ url: url + 'shared.js', headers: { 'accept-encoding': 'br' } })).statusCode, 404);
  } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
});

test('failed publication transforms preserve author files and never expose a partial output', async () => {
  const { mkdir, writeFile, readFile, readdir, rm } = await import('node:fs/promises');
  const { publishOutput } = await import('../src/core/orchestration.js');
  const root = await mkdtemp(path.join(os.tmpdir(), 'notale-publish-atomic-'));
  try {
    const pages = path.join(root, 'pages'), output = path.join(root, 'output');
    await mkdir(pages); await mkdir(output); await writeFile(path.join(pages, 'index.html'), 'original');
    await assert.rejects(publishOutput(pages, output, async temporary => {
      await writeFile(path.join(temporary, 'index.html'), 'partial'); throw new Error('cancelled publication');
    }), /cancelled publication/);
    assert.equal(await readFile(path.join(pages, 'index.html'), 'utf8'), 'original');
    assert.deepEqual(await readdir(output), []);
    assert.deepEqual((await readdir(root)).sort(), ['output', 'pages']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('planned page progress survives replay and observations preserve tool values and errors', async () => {
  const { observeBuilder, projectPages } = await import('../src/core/progress.js');
  const { rm } = await import('node:fs/promises');
  const root = await mkdtemp(path.join(os.tmpdir(), 'notale-progress-'));
  const store = new RunStore(root);
  try {
    const run = await store.create(createRunRequestSchema.parse({ query: 'progress contract' }));
    await store.emit(run.id, 'plan.ready', 'planned', { pages: [
      { pageId: 'page-01', pageTitle: 'first', state: 'pending' }, { pageId: 'page-02', pageTitle: 'second', state: 'pending' },
    ] });
    const planned = await store.get(run.id);
    assert.deepEqual(planned.pages?.map(p => p.state), ['pending', 'pending']);
    await store.emit(run.id, 'page.started', 'started', { pageId: 'page-01' });
    await store.emit(run.id, 'page.progress', 'repairing', { pageId: 'page-01', pageState: 'reworking' });
    assert.equal((await new RunStore(root).get(run.id)).pages?.[0]?.state, 'reworking');
    await store.emit(run.id, 'page.ready', 'ready', { pageId: 'page-01', previewUrl: '/page-01.html' });
    await store.emit(run.id, 'page.progress', 'stale observation', { pageId: 'page-01', pageState: 'checking' });
    await store.emit(run.id, 'run.cancelled', 'cancelled');
    const final = await store.get(run.id), events = await store.events(run.id);
    assert.deepEqual(final.pages?.map(p => p.state), ['ready', 'cancelled']);
    assert.deepEqual(events.reduce(projectPages, []), final.pages);
    assert.deepEqual(events.concat(events).reduce(projectPages, []), final.pages);
    const notices: string[] = [], value = { text: '✗ JS 报错', images: [] }, failure = new Error('original tool error');
    const original = { run: async (name: string) => { if (name === 'Bash') throw failure; return value; }, codeCheck: async () => ({ report: 'ok', shots: [] }) } as unknown as import('../src/core/builder.js').BuilderPorts;
    const observed = observeBuilder(original, (_pid, state) => { notices.push(state); });
    assert.equal(await observed.run('Check', {}, { cwd: root, pid: 'page-01' }), value);
    assert.deepEqual(notices, ['checking', 'reworking']);
    await assert.rejects(observed.run('Bash', {}, { cwd: root, pid: 'page-01' }), error => error === failure);
    const brokenNotice = observeBuilder(original, () => { throw new Error('notification failed'); });
    assert.equal(await brokenNotice.run('Check', {}, { cwd: root, pid: 'page-01' }), value);
  } finally { await rm(root, { recursive: true, force: true }); }
});


test("workflow observers never delay work and preserve result/error identity", async () => {
  const { observedStep } = await import('../src/core/workflow-progress.js');
  const events: string[] = [];
  const result = {};
  assert.equal(await observedStep(event => { events.push(event.status); return new Promise<void>(() => {}); }, 'planner', 'draft', '规划', async () => result), result);
  assert.deepEqual(events, ['started', 'completed']);
  const failure = new Error('original');
  await assert.rejects(observedStep(event => { events.push(event.status); throw new Error('observer'); }, 'director', 'theme', '主题', async () => { throw failure; }), error => error === failure);
  assert.deepEqual(events.slice(-2), ['started', 'failed']);
});

test('Builder premature stops are retried with the audit reason, bounded, and respect cancellation/time', async () => {
  const { buildOne, Page } = await import('../src/core/builder.js');
  const { writeFile, readFile, rm } = await import('node:fs/promises');
  const root = await mkdtemp(path.join(os.tmpdir(), 'notale-stop-'));
  type MockItem = { type: 'function_call'; name: string; arguments: string; call_id: string } | { type: 'message'; role: string; content: { type: string; text: string }[] };
  const output = (calls: boolean, content = 'ok'): MockItem[] => calls
    ? [{ type: 'function_call', name: 'Write', arguments: JSON.stringify({ content }), call_id: 'write' }]
    : [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Action:default_api:Read{file_path:references/general.md}' }] }];
  try {
    // Every page type now hears why the audit rejected it; the same-context repair is bounded by MAX_PREMATURE_STOPS.
    for (const mode of ['missing', 'modified', 'timeout', 'cancel', 'max_stops']) {
      const target = path.join(root, 'page-01.html'); await rm(target, { force: true });
      const page = new Page('page-01', 'brief'); page.workflow = 'build-page';
      const history: unknown[] = []; let turn = 0, checks = 0, retries = 0, clock = 0;
      const controller = new AbortController();
      const sequence = mode === 'modified' ? [output(true, 'bad'), output(false), output(true), output(false)]
        : mode === 'max_stops' ? Array.from({ length: 12 }, () => output(false))
        : [...Array.from({length: 5}, () => output(false)), output(true), output(false)];
      if (mode === 'modified') sequence[0] = [...output(true), { type: 'function_call', name: 'Check', arguments: '{}', call_id: 'check-before-modification' }, ...output(true, 'bad').map(item => ({...item, call_id: 'modify'}))];
      if (mode === 'missing') sequence[1] = [];
      const work = buildOne(page, root, path.join(root, `${mode}.jsonl`), 'instructions', {
        model: { async respondCanonical(instructions, messages, tools) {
          history.push(structuredClone({ instructions, messages, tools }));
          return { id: String(++turn), output: sequence[turn - 1]!, replay_items: [], raw: {}, status: 'completed', incomplete_details: null, usage: { input_tokens: 150001, output_tokens: 18, input_tokens_details: { cached_tokens: 0 } } };
        } },
        async run(name, args) {
          if (name === 'Write') { await writeFile(target, args.content); return 'written'; }
          checks++;
          const bad = await readFile(target, 'utf8') === 'bad';
          return { text: bad ? '✗ JS 报错' : '✗ 页面溢出', images: [], diagnostics: { fatal_errors: bad ? ['JS 报错'] : [], visual_warnings: bad ? [] : ['页面溢出'] } };
        },
        codeCheck: async () => ({ report: await readFile(target, 'utf8') === 'bad' ? '失败:代码工作台自检失败' : 'ok', shots: [] }),
        scaffold: async () => { await writeFile(target, turn === 1 ? 'bad' : 'ok'); return {}; }, image: async () => ({ text: '', images: [] }),
      }, { signal: controller.signal, now: () => clock, refs: [{type: 'input_image', image_url: 'data:image/png;base64,YQ=='}], onRetry() {
        retries++;
        if (mode === 'timeout' && retries === 3) clock = 3601;
        if (mode === 'cancel') controller.abort();
        if (mode === 'missing') throw new Error('observer failure');
      } });
      if (mode === 'cancel') { await assert.rejects(work, error => error === controller.signal.reason); assert.equal(turn, 1); continue; }
      await work;
      assert.equal(page.premature_stops, retries);
      assert.equal(page.stop_reasons.length, retries);
      if (mode === 'max_stops') { assert.equal(page.termination, 'max_stops'); assert.equal(turn, 10); assert.equal(page.artifact_present, false); assert.match(page.why, /连续 10 次/); continue; }
      if (mode === 'timeout') { assert.equal(page.termination, 'max_seconds'); assert.equal(turn, 3); assert.ok(page.last_stop_error.includes('target missing')); }
      else {
        assert.equal(page.termination, 'no_tool_use'); assert.equal(page.artifact_present, true); assert.deepEqual(page.audit?.fatal_errors, []);
        assert.equal(checks, mode === 'missing' ? 1 : mode === 'modified' ? 3 : 2);
        assert.equal(retries, mode === 'missing' ? 5 : 1);
      }
      // Each rejection adds the audit verdict to the same conversation instead of replaying an identical request.
      const verdicts = (history.at(-1) as { messages: Array<{ role?: string; content?: unknown }> }).messages.filter(m => m.role === 'user' && String(m.content).startsWith('交付检查结果')).length;
      // The verdict after the final rejection is pushed but never sent when the time budget ends the loop.
      assert.equal(verdicts, mode === 'timeout' ? retries - 1 : retries);
      assert.equal(page.calls, turn); assert.equal(page.tok_out, turn * 18);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('PPTX uploads validate input and snapshot it before the task starts', async () => {
  const { createApp } = await import('../src/server/app.js');
  const { zipSync } = await import('fflate');
  const { readFile, rm } = await import('node:fs/promises');
  const { inspectPptx } = await import('../src/core/pptx-template.js');
  const { TemplateInputs } = await import('../src/core/template-input.js');
  const root = await mkdtemp(path.join(os.tmpdir(), 'notale-template-input-'));
  const bytes = Buffer.from(zipSync({ '[Content_Types].xml': Buffer.from('<Types/>'), 'ppt/presentation.xml': Buffer.from('<p:presentation><p:sldSz cx="12192000" cy="6858000"/><p:sldIdLst><p:sldId id="1"/></p:sldIdLst></p:presentation>') }));
  const { app } = createApp({ runsRoot: root, pipeline: async () => {}, logger: false });
  try {
    assert.equal(inspectPptx(bytes).pages, 1);
    assert.throws(() => inspectPptx(Buffer.from('invalid')));
    assert.throws(() => inspectPptx(zipSync({ '../escape.xml': Buffer.from('x') })), /路径/);
    const form = new FormData(); form.append('file', new Blob([bytes]), '示例.pptx');
    const request = new Request('http://localhost', { method: 'POST', body: form });
    const response = await app.inject({ method: 'POST', url: '/v1/templates', headers: { 'content-type': request.headers.get('content-type')! }, payload: Buffer.from(await request.arrayBuffer()) });
    assert.equal(response.statusCode, 201, response.body);
    const id: string = response.json().id;
    const store = new RunStore(root), run = await store.create(createRunRequestSchema.parse({ query: '测试', templateId: id }));
    assert.deepEqual(await readFile(path.join(store.runDir(run.id), 'input/template.pptx')), bytes);
    await rm(await new TemplateInputs(root).file(id));
    assert.deepEqual(await readFile(path.join(store.runDir(run.id), 'input/template.pptx')), bytes, 'snapshot survives removal of upload');
    assert.equal((await app.inject({ method: 'POST', url: '/v1/runs', payload: { query: '测试', templateId: id } })).statusCode, 400);
  } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
});

test('template layout submission and idempotent assembly reject invalid or changed artifacts', async () => {
  const { mkdir, writeFile, readFile, rm } = await import('node:fs/promises');
  const { validateTemplateSubmission } = await import('../src/core/template-style.js');
  const { digest } = await import('../src/core/pptx-template.js');
  const { assembleTemplatePage } = await import('../src/core/template-page.js');
  const root = await mkdtemp(path.join(os.tmpdir(), 'notale-template-page-')), pages = path.join(root, 'pages');
  const prepared = { schemaVersion: 1 as const, sha256: 'sample', width: 1600, height: 900, slides: [{ id: 'slide-1', svg: 'slide-1.svg', preview: 'slide-1.png', objects: [] }], warnings: [], fontCss: '' };
  const submission = { themeCss: 'css', layouts: [{ id: 'content', source: 'slide-1', workflows: ['build-cover', 'build-page', 'build-interaction'], replaceObjects: [], slots: [{ id: 'title', purpose: 'title', x: 20, y: 20, width: 1200, height: 100, required: true }, { id: 'body', purpose: 'body', x: 20, y: 140, width: 1400, height: 700, required: true }] }] };
  try {
    const parsed = validateTemplateSubmission(submission, prepared);
    assert.throws(() => validateTemplateSubmission({ ...submission, layouts: [{ ...submission.layouts[0], replaceObjects: ['unknown'] }] }, prepared), /替换对象/);
    assert.throws(() => validateTemplateSubmission({ ...submission, layouts: [{ ...submission.layouts[0], slots: [{ ...submission.layouts[0]!.slots[0], x: 1000 }] }] }, prepared), /越出画布/);
    const fixed = '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><text x="1450" y="30">品牌</text></svg>';
    await mkdir(path.join(pages, 'assets/template'), { recursive: true });
    await writeFile(path.join(pages, 'assets/template/content.svg'), fixed);
    await writeFile(path.join(root, 'template-spec.json'), JSON.stringify({ schemaVersion: 1, mode: 'template', sourceHash: 'sample', layouts: parsed.layouts.map(l => ({ ...l, fixedPath: 'assets/template/content.svg', fixedHash: digest(fixed) })) }));
    const source = '<!doctype html><html><head></head><body><main id="stage" data-notale-template="content"><section data-notale-slot="title"><h1>主题</h1></section><section data-notale-slot="body"><p data-deck-step="1">步骤</p></section></main></body></html>';
    await writeFile(path.join(pages, 'page-01.html'), source);
    assert.deepEqual(await assembleTemplatePage(pages, 'page-01.html', 'build-page'), []);
    const first = await readFile(path.join(pages, 'page-01.html'), 'utf8');
    assert.match(first, /品牌/); assert.match(first, /data-deck-step="1"/);
    assert.deepEqual(await assembleTemplatePage(pages, 'page-01.html', 'build-page'), []);
    assert.equal(await readFile(path.join(pages, 'page-01.html'), 'utf8'), first);
    await writeFile(path.join(pages, 'page-01.html'), source.replace('data-notale-slot="body"', 'data-notale-slot="unknown"'));
    assert.ok((await assembleTemplatePage(pages, 'page-01.html', 'build-page')).length);
    await writeFile(path.join(pages, 'page-01.html'), source);
    await writeFile(path.join(pages, 'assets/template/content.svg'), fixed + 'changed');
    assert.match((await assembleTemplatePage(pages, 'page-01.html', 'build-page')).join(''), /被修改/);
    assert.deepEqual(await assembleTemplatePage(pages, 'page-01.html', 'build-code'), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('template and free Builders share teaching and visual rules without changing Planner or code', async () => {
  const { mkdir, writeFile, readFile, rm } = await import('node:fs/promises');
  const { deckPrompt } = await import('../src/core/planning.js');
  const { instructionBlocks } = await import('../src/core/builder-context.js');
  const { routedWorkflow, WORKFLOWS, FONT_FLOOR } = await import('../src/core/guidance.js');
  const root = await mkdtemp(path.join(os.tmpdir(), 'notale-template-prompts-'));
  try {
    const request = { root, query: '种子发芽', minutes: 15, audience: '小学生' };
    assert.equal(deckPrompt(request), deckPrompt({ ...request, ...{ template: 'input.pptx' } }));
    await mkdir(path.join(root, 'pages/assets/lib'), { recursive: true }); await mkdir(path.join(root, 'pages/plan'), { recursive: true });
    await writeFile(path.join(root, 'pages/assets/CHASSIS.md'), '共享底盘');
    await writeFile(path.join(root, 'pages/assets/lib/LIBS.md'), '## 按「要做的事」查\n本地依赖');
    await writeFile(path.join(root, 'pages/assets/theme.css'), '/* ==== INTERFACE ====\n主题\n==== /INTERFACE ==== */');
    await writeFile(path.join(root, 'pages/plan/pages.md'), '## Audience\n小学生\n\n# page-01 [标题页]\n种子发芽');
    const workflows = ['build-cover', 'build-page', 'build-interaction'];
    const before = Object.fromEntries(workflows.map(w => [w, instructionBlocks(root, 1, w)])), code = instructionBlocks(root, 1, 'build-code');
    await writeFile(path.join(root, 'template-spec.json'), JSON.stringify({ layouts: [{ id: 'body', workflows, slots: [] }] }));
    for (const workflow of workflows) {
      const after = instructionBlocks(root, 1, workflow), original = before[workflow]!;
      for (const key of ['notes', 'steps', 'philosophy', 'anti_slop']) assert.equal(after[key], original[key]);
      assert.ok(after.shared!.startsWith(original.shared!));
      assert.match(after.shared!, /## 构图/); assert.match(after.shared!, /## 主题承接/);
      assert.ok(after.shared!.includes(FONT_FLOOR));
      assert.doesNotMatch(after.notes!, /解释、推导、背景不上画面/);
      assert.match(after.notes!, /关键推导、条件和单位/);
      assert.match(after.anti_slop!, /border-left/);
      assert.equal(after.anti_slop!.split('<anti_ai_slop_visual>').length, 2);
      const teaching = (await readFile(path.join(WORKFLOWS, workflow, 'SKILL.md'), 'utf8')).match(/<!--teaching:start-->\s*([\s\S]*?)\s*<!--teaching:end-->/)![1]!;
      for (const text of [after.workflow!, original.workflow!]) assert.equal(text.split(teaching).length, 2, `${workflow} teaching occurs exactly once`);
      assert.match(original.workflow!, /choose Main/);
      if (workflow === 'build-interaction') assert.ok(after.workflow!.startsWith(original.workflow!));
      else assert.doesNotMatch(after.workflow!, /aux_sample_catalog|choose Main/);
      assert.doesNotMatch(after.workflow!, /<!--teaching/);
      assert.match(after.workflow!, /template_constraints/);
      assert.match(after.workflow!, /color:var\(--text\)/);
      assert.match(after.workflow!, /color:var\(--muted\)/);
    }
    assert.deepEqual(instructionBlocks(root, 1, 'build-code'), code);
    const custom = path.join(root, 'workflows');
    await mkdir(path.join(custom, 'build-page'), { recursive: true });
    await writeFile(path.join(custom, 'build-page/SKILL.md'), '# Missing teaching');
    assert.throws(() => routedWorkflow('build-page', custom, { template: true }), /exactly one teaching/);
    await rm(path.join(root, 'template-spec.json')); assert.deepEqual(instructionBlocks(root, 1, 'build-page'), before['build-page']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('content uploads snapshot originals and reject invalid, duplicate and missing files', async () => {
  const { FileInputs, inspectInput } = await import('../src/core/file-input.js');
  const { createApp } = await import('../src/server/app.js');
  const { readFile, rm } = await import('node:fs/promises');
  const sharp = (await import('sharp')).default;
  const root = await mkdtemp(path.join(os.tmpdir(), 'notale-content-'));
  const { app } = createApp({ runsRoot: root, pipeline: async () => {}, logger: false });
  try {
    const bytes = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#123456' } }).png().toBuffer();
    await assert.rejects(inspectInput('x.pdf', bytes));
    await assert.rejects(inspectInput('x.docx', bytes));
    const form = new FormData(); form.append('file', new Blob([new Uint8Array(bytes)]), '图.png');
    const request = new Request('http://localhost', { method: 'POST', body: form });
    const response = await app.inject({ method: 'POST', url: '/v1/files', headers: { 'content-type': request.headers.get('content-type')! }, payload: Buffer.from(await request.arrayBuffer()) });
    assert.equal(response.statusCode, 201, response.body);
    const id = response.json().id as string;
    assert.equal(createRunRequestSchema.safeParse({ query: 'q', fileIds: [id, id] }).success, false);
    const store = new RunStore(root), run = await store.create(createRunRequestSchema.parse({ query: 'q', fileIds: [id] }));
    await rm((await new FileInputs(root).get(id)).file);
    assert.deepEqual(await readFile(path.join(store.runDir(run.id), 'input/files', id + '.png')), bytes);
    assert.equal((await app.inject({ method: 'POST', url: '/v1/runs', payload: { query: 'q', fileIds: [id] } })).statusCode, 400);
    assert.equal(createRunRequestSchema.parse({ query: 'q' }).fileIds, undefined);
  } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
});

test('source reader tracks complete reading, caches recognition and exports only used immutable evidence', async () => {
  const { FileInputs } = await import('../src/core/file-input.js');
  const { Sources, publishSources, inputCommand } = await import('../src/core/sources.js');
  const { readFile, writeFile, mkdir, rm, readdir } = await import('node:fs/promises');
  const sharp = (await import('sharp')).default;
  const root = await mkdtemp(path.join(os.tmpdir(), 'notale-source-reader-'));
  let calls = 0;
  const model = { profile: { model: root }, async respond() { calls++; return { id: 'ocr', inputTokens: 1, outputTokens: 1, message: { role: 'assistant' as const, content: JSON.stringify({ text: 'A'.repeat(13000), warnings: ['uncertain symbol'] }) } }; } };
  try {
    const inputs = new FileInputs(root), bytes = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#778899' } }).png().toBuffer();
    const file = await inputs.save('reference.png', bytes); await inputs.snapshot([file.id], root);
    const work = path.join(root, 'work');
    const sources = (await Sources.prepare(work, path.join(root, 'input/files'), model, true))!;
    assert.equal(calls, 1); assert.equal(JSON.parse(sources.preload()).completeText, false);
    const ref = sources.manifest.pages[0]!.ref;
    await sources.tool('SearchSources', { query: 'AAAA' });
    assert.throws(() => sources.validateMapping({ 'page-01': [ref] }, ['page-01']));
    const first = JSON.parse((await sources.tool('ReadSource', { ref })).text);
    assert.equal(first.nextOffset, 12000);
    assert.throws(() => sources.validateMapping({ 'page-01': [ref] }, ['page-01']));
    await sources.tool('ReadSource', { ref, offset: first.nextOffset });
    assert.deepEqual(sources.validateMapping({ 'page-01': [ref] }, ['page-01']), { 'page-01': [ref] });
    await assert.rejects(sources.tool('ReadSource', { ref: '../outside' }));
    await assert.rejects(sources.tool('ReadSource', { ref, crop: [0.9, 0, 0.9, 1] }));
    const used = JSON.parse((await sources.tool('ReadSource', { ref, crop: [0, 0, 0.5, 1] })).text).asset as string;
    const unused = JSON.parse((await sources.tool('ReadSource', { ref, image: true })).text).asset as string;
    await mkdir(path.join(work, 'pages'), { recursive: true });
    await writeFile(path.join(work, 'pages/page-01.html'), `<img src="${used}">`);
    await writeFile(path.join(work, 'sources/by-page.json'), JSON.stringify({ 'page-01': [ref] }));
    await publishSources(work);
    assert.deepEqual((await readdir(path.join(work, 'pages/assets/sources'))).sort(), ['CREDITS.md', path.basename(used)].sort());
    assert.match(await readFile(path.join(work, 'pages/assets/sources/CREDITS.md'), 'utf8'), /reference.png/);
    await assert.rejects(readFile(path.join(work, 'pages', unused)));
    await writeFile(path.join(work, 'pages', used), 'modified');
    await assert.rejects(publishSources(work), /被修改/);
    await Sources.prepare(path.join(root, 'second'), path.join(root, 'input/files'), model, true); assert.equal(calls, 1);
    const controller = new AbortController();
    const command = inputCommand(process.execPath, ['-e', 'setInterval(()=>{},1000)'], controller.signal); controller.abort();
    await assert.rejects(command, /abort/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('source recognition cancellation does not poison another task waiting on the same cache', async () => {
  const { FileInputs } = await import('../src/core/file-input.js');
  const { Sources } = await import('../src/core/sources.js');
  const { rm } = await import('node:fs/promises');
  const sharp = (await import('sharp')).default;
  const root = await mkdtemp(path.join(os.tmpdir(), 'notale-source-cancel-'));
  const controller = new AbortController(); let entered!: () => void, calls = 0;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const model = { profile: { model: root }, async respond(_messages: unknown, _tools: unknown, signal?: AbortSignal) {
    if (++calls === 1) { entered(); await new Promise((_, reject) => { signal!.addEventListener('abort', () => reject(signal!.reason), { once: true }); }); }
    return { id: 'ocr', inputTokens: 1, outputTokens: 1, message: { role: 'assistant' as const, content: JSON.stringify({ text: 'visible evidence', warnings: [] }) } };
  } };
  try {
    const inputs = new FileInputs(root), bytes = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#ddddaa' } }).png().toBuffer();
    const file = await inputs.save('scan.png', bytes); await inputs.snapshot([file.id], root);
    const first = Sources.prepare(path.join(root, 'first'), path.join(root, 'input/files'), model, true, controller.signal);
    const rejected = assert.rejects(first, /abort/i);
    await started;
    const second = Sources.prepare(path.join(root, 'second'), path.join(root, 'input/files'), model, true);
    controller.abort(); await rejected;
    assert.equal((await second)!.manifest.pages[0]!.text, 'visible evidence'); assert.equal(calls, 2);
  } finally { controller.abort(); await rm(root, { recursive: true, force: true }); }
});


test('Check structured diagnostics survive the tool envelope and preserve fatal errors', async () => {
  const { checkDiagnostics } = await import('../src/tools/selfcheck.js');
  const { selectCheckShots } = await import('../src/tools/check.js');
  const { runTool } = await import('../src/tools/workspace.js');
  const { auditDelivery, evictImages, Page } = await import('../src/core/builder.js');
  const { writeFile, rm } = await import('node:fs/promises');
  const base = { label: null, probe: {}, errs: [], bad: [], png: 'full.png', step_pngs: ['initial.png', 'middle.png'] };
  assert.deepEqual(selectCheckShots([base]), ['initial.png', 'full.png']);
  assert.deepEqual(selectCheckShots([base, {...base, png: 'after.png'}]), ['full.png', 'after.png']);
  assert.deepEqual(selectCheckShots([base, {...base, png: null}]), ['full.png']);
  const history = [{role: 'user', content: [{type: 'input_text', text: 'task and continuity'}, {type: 'input_image', image_url: 'reference'}]}, ...['a','b'].map(image_url => ({role: 'user', content: [{type: 'input_image', image_url}]}))];
  assert.equal(evictImages(history, 150000), 0);
  assert.equal(evictImages(history, 150001), 1);
  assert.equal(history[0]!.content[0]!.text, 'task and continuity');
  const root = await mkdtemp(path.join(os.tmpdir(), 'notale-diagnostic-'));
  try {
    await writeFile(path.join(root, 'page-01.html'), '<html></html>');
    const context = {cwd: root, pid: 'page-01'}, page = new Page('page-01', 'brief');
    for (const state of [{...base, probe: {fatal: 'navigation failed'}}, {...base, js_error: 'after failed'}, {...base, errs: ['console.error: broken']}, {...base, bad: ['missing.js']}, {...base, probe: {contract: ['invalid Deck']}}]) {
      const diagnostics = checkDiagnostics([state]);
      assert.equal(diagnostics.fatal_errors.length, 1);
      const out = await runTool('Check', {page: 'page-01.html'}, context, {check: async () => ({text: 'human wording is not the gate', images: [], diagnostics})} as unknown as import('../src/tools/workspace.js').WorkspacePorts);
      const ports = {run: async () => out} as unknown as import('../src/core/builder.js').BuilderPorts;
      assert.deepEqual((await auditDelivery(context, page, ports)).fatal_errors, diagnostics.fatal_errors);
    }
    const warnings = checkDiagnostics([{...base, step_issues: ['visual concern']}]);
    assert.deepEqual(warnings, {fatal_errors: [], visual_warnings: ['visual concern']});
    const missing = await auditDelivery(context, page, {run: async () => ({text: 'looks fine', images: []})} as unknown as import('../src/core/builder.js').BuilderPorts);
    assert.equal(missing.fatal_errors.length, 1);
  } finally { await rm(root, {recursive: true, force: true}); }
});


test('sample policy keeps Main and Aux modes explicit in free and template interaction inputs', async () => {
  const { routedWorkflow, PAGE_WORKFLOWS } = await import('../src/core/guidance.js');
  for (const name of PAGE_WORKFLOWS.filter(n => n !== 'build-code')) {
    const main = routedWorkflow(name, undefined, { includeAux: false });
    assert.match(main, /exactly one reference and one Main/);
    assert.doesNotMatch(main, /<aux_sample_catalog workflow=/);
    const without = routedWorkflow(name, undefined, { samples: 'none' });
    assert.doesNotMatch(without, /## Samples|samples\/bundles|choose Main/);
    assert.match(without, /no worked sample/);
    assert.throws(() => routedWorkflow(name, undefined, { samples: 'none', includeAux: true }));
    const defaults = routedWorkflow(name);
    assert.equal(defaults, routedWorkflow(name, undefined, { includeAux: true }));
    assert.equal((defaults.match(/^<sample_read_policy>$/gm) ?? []).length, 1);
    if (name === 'build-interaction') {
      assert.match(defaults, /zero to three/);
      for (const options of [{}, { includeAux: false }, { samples: 'none' }]) {
        assert.equal(routedWorkflow(name, undefined, options), routedWorkflow(name, undefined, { ...options, template: true }));
      }
    }
  }
});

test('Check reports identifiable evidence without anonymous repair counts or mutating raw measurements', async () => {
  const { report, checkDiagnostics } = await import('../src/tools/selfcheck.js');
  const state = { label: null, errs: ['real script error'], bad: ['missing.png'], png: 'page.png', result: { measured: 0.498, conclusion: 'falling' },
    probe: { sizes: [], escaped: [], clipped: [], overlap: 7, overlap_pairs: [['Loss', 'Epoch']], intrude: [{ el: '#caption', band: 'footer', px: 12, text: 'caption' }] } };
  const before = structuredClone(state), text = report('page', [state]);
  assert.match(text, /Loss.*Epoch/); assert.match(text, /#caption.*12px/);
  assert.doesNotMatch(text, /文字叠压 7 处|侵入页眉页脚带 1 处/);
  assert.match(text, /0.498/); assert.match(text, /page.png/);
  assert.ok(checkDiagnostics([state]).fatal_errors.length >= 2);
  assert.deepEqual(state, before);
});

test('chassis protects inherited SVG text stroke while preserving explicit styles and Deck/control navigation', async () => {
  const { readFile } = await import('node:fs/promises');
  const { RESOURCES } = await import('../src/core/guidance.js');
  const { browser, acquireVisualChecker } = await import('../src/tools/visual-check.js');
  const release = acquireVisualChecker();
  try {
    const page = await (await browser()).newPage({ viewport: { width: 1600, height: 900 } });
    try {
      await page.setContent(`<style>:root{--bg:white;--text:black;--font-sans:Arial}svg{stroke:blue;stroke-width:2.5px}.intentional{stroke:green}</style><div id="stage"><svg><path id="line" d="M0 0L100 100"/><text id="plain" fill="red">Label</text><text id="attr" stroke="red">Attribute</text><text id="css" class="intentional">CSS</text></svg><span data-deck-step="1">Evidence</span><input aria-label="value" type="range" min="0" max="10" value="4"></div>`);
      await page.addStyleTag({ content: await readFile(path.join(RESOURCES, 'chassis/base.css'), 'utf8') });
      await page.addScriptTag({ content: await readFile(path.join(RESOURCES, 'chassis/base.js'), 'utf8') });
      await page.evaluate('Deck.init({index:1,total:2})');
      assert.deepEqual(await page.evaluate(() => ['plain','attr','css','line'].map(id => getComputedStyle(document.getElementById(id)!).stroke)), ['none','rgb(255, 0, 0)','rgb(0, 128, 0)','rgb(0, 0, 255)']);
      assert.equal(await page.locator('#plain').evaluate(el => getComputedStyle(el).fill), 'rgb(255, 0, 0)');
      await page.keyboard.press('ArrowRight'); assert.equal(await page.evaluate('Deck.step'), 1);
      await page.keyboard.press('ArrowLeft'); assert.equal(await page.evaluate('Deck.step'), 0);
      await page.locator('input').focus(); await page.keyboard.press('ArrowRight');
      assert.equal(await page.locator('input').inputValue(), '5'); assert.equal(await page.evaluate('Deck.step'), 0);
    } finally { await page.close(); }
  } finally { await release(); }
});

test('header intrusion needs overlap on both axes, not just vertical', async () => {
  const { readFileSync } = await import('node:fs');
  const { cp, mkdtemp, writeFile } = await import('node:fs/promises');
  const os = await import('node:os');
  const { pathToFileURL } = await import('node:url');
  const { RESOURCES } = await import('../src/core/guidance.js');
  const { browser, acquireVisualChecker } = await import('../src/tools/visual-check.js');
  const probes = JSON.parse(readFileSync(path.join(RESOURCES, 'selfcheck-probe.json'), 'utf8'));
  const root = await mkdtemp(path.join(os.tmpdir(), 'intrude-'));
  await cp(path.join(RESOURCES, 'chassis/base.css'), path.join(root, 'base.css'));
  await cp(path.join(RESOURCES, 'chassis/base.js'), path.join(root, 'base.js'));
  const release = acquireVisualChecker();
  const intrusions = async (body: string) => {
    const file = path.join(root, 'page.html');
    await writeFile(file, `<link rel="stylesheet" href="base.css"><script src="base.js"></script><div id="stage">${body}</div>`);
    const page = await (await browser()).newPage({ viewport: { width: 1600, height: 900 } });
    try {
      await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
      const probe = await page.evaluate(`(${probes.PROBE})()`) as { contract?: string[]; intrude?: Array<{ text: string }> };
      assert.deepEqual(probe.contract ?? [], [], 'fixture must satisfy the chassis contract or the probe never measures');
      assert.ok(probe.intrude, 'probe must reach layout measurement');
      const old = probes.PROBE.replace('ov > 4 && hov > 4', 'ov > 4');
      const oldProbe = await page.evaluate(`(${old})()`) as { intrude: Array<{ text: string }> };
      assert.ok(oldProbe.intrude.some(item => item.text === 'Beside'), 'old implementation must reproduce the false positive');
      return probe.intrude.map(item => item.text);
    } finally { await page.close(); }
  };
  const band = '<header style="position:absolute;left:0;top:0;width:1000px;height:80px">Title</header>';
  try {
    // The band spans x=0..1000; the aside sits beside it at the same height and never touches it.
    assert.deepEqual(await intrusions(band + '<aside style="position:absolute;left:1100px;top:10px;width:400px;height:60px">Beside</aside>'), []);
    // The same aside moved under the band is a real collision and must still be reported.
    assert.deepEqual(await intrusions(band + '<aside style="position:absolute;left:200px;top:10px;width:400px;height:60px">Beside</aside>'), ['Beside']);
  } finally { await release(); }
});

test('buildRun rebuilds a page that did not deliver from a clean slate and keeps every reason', async () => {
  const { buildRun } = await import('../src/core/orchestration.js');
  const { loadConfig, resolveBuilderProfile, workflowProfiles } = await import('../src/adapters/models/profiles.js');
  const { mkdir, writeFile, readFile, rm } = await import('node:fs/promises');
  const root = await mkdtemp(path.join(os.tmpdir(), 'notale-rebuild-'));
  try {
    await mkdir(path.join(root, 'pages/plan'), { recursive: true }); await mkdir(path.join(root, 'pages/assets/lib'), { recursive: true });
    await writeFile(path.join(root, 'pages/plan/pages.md'), '## Audience\n学生\n\n# page-01 [内容页]\n一个概念\n');
    await writeFile(path.join(root, 'briefs.json'), JSON.stringify([{ description: 'Build page-01', prompt: 'brief' }]));
    await writeFile(path.join(root, 'pages/assets/CHASSIS.md'), '底盘');
    await writeFile(path.join(root, 'pages/assets/theme.css'), '/* ==== INTERFACE ====\n主题\n==== /INTERFACE ==== */');
    await writeFile(path.join(root, 'pages/assets/lib/LIBS.md'), '## 按「要做的事」查\n无\n');
    const cfg = loadConfig(), profile = resolveBuilderProfile(cfg), profiles = workflowProfiles(cfg, profile);
    const target = path.join(root, 'pages/page-01.html');
    let attempt = 0, calls = 0; const started: string[] = [];
    const port: import('../src/core/builder.js').BuilderPorts = {
      model: { async respondCanonical(_instructions, history) {
        calls++;
        if (history.length === 1) attempt++;
        // First attempt: the model refuses and never writes. Second attempt: a clean history, it writes and stops.
        if (attempt === 1) throw Object.assign(new Error('provider closed the stream at /var/run/provider.sock'), { name: 'ModelConnectionError' });
        const output = calls === 2 ? [{ type: 'function_call', name: 'Write', call_id: 'w', arguments: JSON.stringify({ file_path: 'page-01.html', content: '<html>ok</html>' }) }] : [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'done' }] }];
        return { id: String(calls), output, replay_items: [], raw: {}, status: 'completed', incomplete_details: null, usage: { input_tokens: 1, output_tokens: 1, input_tokens_details: { cached_tokens: 0 } } };
      } },
      async run(name, args) { if (name === 'Write') { await writeFile(target, String(args.content)); return '已写入'; } return { text: 'ok', images: [], diagnostics: { fatal_errors: [], visual_warnings: [] } }; },
      scaffold: async () => { throw new Error('unused'); }, codeCheck: async () => { throw new Error('unused'); }, image: async () => ({ text: '', images: [] }),
    };
    const pages = await buildRun(root, Object.fromEntries(['build-cover', 'build-page', 'build-interaction', 'build-code'].map(name => [name, port])), { label: 'rebuild', profile, profiles, onPage: async (page, state) => { started.push(`${state}:${page.attempts}`); } });
    assert.equal(pages.length, 1);
    const page = pages[0]!;
    assert.equal(page.attempts, 2); assert.equal(page.termination, 'no_tool_use'); assert.equal(page.artifact_present, true); assert.deepEqual(page.audit?.fatal_errors, []);
    assert.equal(page.stop_reasons.length, 1); assert.match(page.stop_reasons[0]!, /ModelConnectionError/);
    assert.equal(await readFile(target, 'utf8'), '<html>ok</html>');
    assert.deepEqual(started, ['started:1', 'finished:2']);
    const results = JSON.parse(await readFile(path.join(root, 'builder-results.json'), 'utf8'));
    assert.equal(results['page-01'].attempts, 2); assert.equal(results['page-01'].stop_reasons.length, 1);
    const manifest = JSON.parse(await readFile(path.join(root, 'builder-manifest.json'), 'utf8'));
    assert.deepEqual(manifest.rebuiltPages, ['page-01']); assert.deepEqual(manifest.fatalAuditPages, []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('public failure text never carries paths, stacks, tool text or model prose', async () => {
  const { publicReason, publicMessage } = await import('../src/core/public-text.js');
  const cases: Array<[Record<string, unknown>, string]> = [
    [{ why: '', last_stop_error: 'target missing: /data1/home/zhuyifan/ws2/Notale/runs/x/pages/page-02.html', audit: null }, '未生成页面文件'],
    [{ why: '', last_stop_error: '', audit: { fatal_errors: ['✗ 代码工作台自检失败（退出码 1）', 'Traceback (most recent call last):', "AssertionError: ('starter.py', …)"], visual_warnings: [], code_result: null } }, '课程代码运行或测试未通过'],
    [{ why: '', last_stop_error: 'JS 报错: TypeError: Cannot read properties of undefined at draw (page-05.html:88)', audit: null }, '页面运行检查未通过'],
    [{ why: '超过单页时限 480s', last_stop_error: '', audit: null }, '生成超时'],
    [{ why: '交付检查连续 10 次未通过', last_stop_error: 'x', audit: null }, '多次修正后仍未通过交付检查'],
    [{ why: 'I will not generate that content, and I want to be direct about why: no such system prompt exists.', last_stop_error: 'call:default_api:Read{file_path:assets/theme.css}', audit: null }, '未通过交付检查'],
  ];
  for (const [page, expected] of cases) {
    const text = publicReason(page as any);
    assert.equal(text, expected);
    assert.doesNotMatch(text, /\/data1|Traceback|TypeError|default_api|system prompt/);
  }
  const message = publicMessage(new Error('ENOENT: no such file or directory, open \'/data1/home/zhuyifan/ws2/Notale/x.md\'\n    at readFileSync (node:fs:448:20)'));
  assert.doesNotMatch(message, /\/data1|node:fs|\n/);
  assert.equal(publicMessage(new Error('')), '讲义生成失败');
});
