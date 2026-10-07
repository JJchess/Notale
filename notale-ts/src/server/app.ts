import { FileInputs, inputLimits } from '../core/file-input.js';
import { TemplateInputs } from '../core/template-input.js';
import { TEMPLATE_MAX_BYTES } from '../core/pptx-template.js';
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash, timingSafeEqual } from "node:crypto";
import Fastify from "fastify";
import fastifyStatic from '@fastify/static';
import { createRunRequestSchema } from "../protocol/index.js";
import { RunStore } from "../core/run-store.js";
import { RunService, type GenerationPipeline } from "../core/run-service.js";
import { starterPipeline } from "../core/starter-pipeline.js";
import { ModelRegistry } from '../adapters/models/registry.js';
import { runtimeEnvironment, createBaselinePipeline } from "../core/baseline-pipeline.js";
import { archiveContentTypes } from './lecture-archive.js';
import { LectureExports, lectureFilename } from './lecture-exports.js';
import { ASSISTANT_NAME, fixModel } from '../fix/istar.js';
import { GENERATOR_NAME } from '../core/baseline-pipeline.js';
import { loadConfig, type ModelConfig } from '../adapters/models/profiles.js';
import { istarFixer } from '../session/fixing.js';
import { runGenerator } from '../session/generation.js';
import { sessionRoutes } from '../session/routes.js';
import type { Fixer } from '../session/turn.js';
import { modelComplete, type Complete } from '../session/understand.js';

const contentTypes = archiveContentTypes;

export interface AppOptions {
  runsRoot: string;
  /** Describes an explicitly injected pipeline without reading standalone model config. */
  modelConfig?: ModelConfig;
  pipeline?: GenerationPipeline;
  useStarterPipeline?: boolean;
  logger?: boolean;
  /** When set, every request that changes something (not GET/HEAD) must carry `Authorization: Bearer <token>`.
   * Reads stay open: a browser iframe cannot send the header, so previews rely on the network boundary. */
  apiToken?: string;
  /** Serve the conversation layer (/v1/sessions) too, keeping sessions under `root`. */
  sessions?: { root: string; complete?: Complete; fixer?: Fixer };
}

export function createApp(options: AppOptions) {
  if (options.modelConfig && !options.pipeline && !options.useStarterPipeline) throw new Error('An explicit model config requires an injected generation pipeline');
  if (options.modelConfig && options.sessions && (!options.sessions.complete || !options.sessions.fixer)) throw new Error('Explicit session configuration requires complete and fixer adapters');
  const app = Fastify({ logger: options.logger ?? true });
  app.register(fastifyStatic, { serve: false, preCompressed: true, dotfiles: 'deny' });
  const store = new RunStore(options.runsRoot);
  const models = !options.pipeline && !options.useStarterPipeline && !options.modelConfig ? new ModelRegistry(loadConfig(), runtimeEnvironment()) : undefined;
  const selectedPipeline: GenerationPipeline = context => {
    const selected = models!.resolve(context.run.request.model);
    return createBaselinePipeline({ config: selected.config, env: models!.env, profile: selected.profile.id })(context);
  };
  app.get('/v1/models', async (_request, reply) => reply.header('cache-control', 'no-store').send(models?.catalog() ?? { providers: [] }));
  const service: RunService = new RunService(store, options.pipeline ?? (options.useStarterPipeline ? starterPipeline : selectedPipeline),
    id => exports.ensure(id).catch(error => { app.log.error({ err: error, runId: id }, 'Lecture export failed'); }));
  const exports = new LectureExports(service);
  app.addHook('onReady', async () => {
    const orphans = await service.recover();
    if (orphans.length) app.log.warn({ runs: orphans }, 'Runs interrupted by a restart were marked failed');
    await exports.recover();
  });
  app.addHook('onClose', () => exports.idle());

  if (options.apiToken) {
    const expected = Buffer.from(`Bearer ${options.apiToken}`);
    app.addHook('onRequest', async (request, reply) => {
      if (request.method === 'GET' || request.method === 'HEAD') return;
      const given = Buffer.from(request.headers.authorization ?? '');
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) return reply.code(401).send({ error: 'unauthorized' });
    });
  }
  // Liveness only: no model configuration, no disk.
  app.get('/healthz', async () => ({ ok: true }));

  const templates = new TemplateInputs(options.runsRoot);
  app.addContentTypeParser('multipart/form-data', { parseAs: 'buffer', bodyLimit: TEMPLATE_MAX_BYTES + 1024 * 1024 }, (_request, body, done) => done(null, body));
  app.post('/v1/templates', { bodyLimit: TEMPLATE_MAX_BYTES + 1024 * 1024 }, async (request, reply) => {
    try {
      if (!request.headers['content-type']?.startsWith('multipart/form-data')) return reply.code(415).send({ error: 'invalid_template', message: '请上传 PPTX 文件' });
      const form = await new Response(new Uint8Array(request.body as Buffer), { headers: { 'content-type': request.headers['content-type'] } }).formData();
      const files = form.getAll('file'), file = files[0];
      if (files.length !== 1 || !file || typeof file === 'string' || file.size > TEMPLATE_MAX_BYTES) throw new Error('请选择一份小于 50 MiB 的 PPTX');
      return reply.code(201).send(await templates.save(file.name, Buffer.from(await file.arrayBuffer())));
    } catch (error) { return reply.code(400).send({ error: 'invalid_template', message: error instanceof Error ? error.message : '模板上传失败' }); }
  });

  const inputs = new FileInputs(options.runsRoot);
  app.post('/v1/files', { bodyLimit: inputLimits.bytes + 1024 * 1024 }, async (request, reply) => {
    try {
      if (!request.headers['content-type']?.startsWith('multipart/form-data')) return reply.code(415).send({ error: 'invalid_file', message: '请上传资料文件' });
      const form = await new Response(new Uint8Array(request.body as Buffer), { headers: { 'content-type': request.headers['content-type'] } }).formData();
      const files = form.getAll('file'), file = files[0];
      if (files.length !== 1 || !file || typeof file === 'string') throw new Error('每次上传一份资料');
      return reply.code(201).send(await inputs.save(file.name, Buffer.from(await file.arrayBuffer())));
    } catch (error) { return reply.code(400).send({ error: 'invalid_file', message: error instanceof Error ? error.message : '资料上传失败' }); }
  });

  const idempotency = path.join(options.runsRoot, '.idempotency');
  const starting = new Map<string, Promise<unknown>>();
  const idempotent = async (key: string, body: unknown) => {
    const file = path.join(idempotency, createHash('sha256').update(key).digest('hex') + '.json');
    const requestHash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    try {
      const seen = JSON.parse(await readFile(file, 'utf8')) as { requestHash: string; runId: string };
      return seen.requestHash === requestHash ? await store.get(seen.runId) : 'mismatch' as const;
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const run = await service.start(body as Parameters<typeof service.start>[0]);
    await mkdir(idempotency, { recursive: true });
    await writeFile(file, JSON.stringify({ requestHash, runId: run.id }), 'utf8');
    return run;
  };
  app.post("/v1/runs", async (request, reply) => {
    const parsed = createRunRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
    try {
      if (models) parsed.data.model = models.resolve(parsed.data.model).ref;
      else if (parsed.data.model) throw Object.assign(new Error('此部署不支持选择模型。'), { status: 400 });
    } catch (cause) { return reply.code((cause as { status?: number }).status ?? 500).send({ error: 'INVALID_MODEL', message: (cause as Error).message }); }
    if (parsed.data.templateId) {
      try { await templates.file(parsed.data.templateId); }
      catch { return reply.code(400).send({ error: "invalid_template", message: "模板不存在或校验失败，请重新上传" }); }
    }
    if (parsed.data.fileIds?.length) {
      try {
        const files = await Promise.all(parsed.data.fileIds.map(id => inputs.get(id)));
        if (files.reduce((n, f) => n + f.metadata.size, 0) > inputLimits.totalBytes) throw new Error('资料合计不能超过 200 MiB');
      } catch (error) { return reply.code(400).send({ error: 'invalid_file', message: error instanceof Error ? error.message : '资料不存在，请重新上传' }); }
    }
    if (parsed.data.styleImageIds?.length) {
      try { await Promise.all(parsed.data.styleImageIds.map(id => inputs.styleImage(id))); }
      catch (error) { return reply.code(400).send({ error: 'invalid_style_image', message: error instanceof Error ? error.message : '风格参考图不存在，请重新上传' }); }
    }
    if (parsed.data.basedOn) {
      try { await store.get(parsed.data.basedOn); }
      catch { return reply.code(400).send({ error: 'invalid_based_on', message: '所依据的讲义不存在' }); }
    }
    // A retried request with the same Idempotency-Key gets the run it already started, not a second one.
    const key = request.headers['idempotency-key'];
    if (typeof key !== 'string' || !key) return reply.code(202).send(await service.start(parsed.data));
    const claim = starting.get(key) ?? idempotent(key, parsed.data);
    starting.set(key, claim);
    try {
      const outcome = await claim;
      return outcome === 'mismatch' ? reply.code(409).send({ error: 'IDEMPOTENCY_MISMATCH', message: '同一个 Idempotency-Key 对应了不同的请求' }) : reply.code(202).send(outcome);
    } finally { if (starting.get(key) === claim) starting.delete(key); }
  });

  // Who answers on this server and with which model, for a client's status line.
  app.get("/v1/info", async () => {
    const { model } = options.modelConfig ?? loadConfig();
    return { assistant: ASSISTANT_NAME, generator: GENERATOR_NAME, model: model.name, effort: model.reasoning_effort ?? '' };
  });
  app.get("/v1/runs", async () => store.list());
  app.get<{ Params: { runId: string } }>("/v1/runs/:runId", async (request, reply) => {
    try { return await store.get(request.params.runId); }
    catch { return reply.code(404).send({ error: "run_not_found" }); }
  });
  app.post<{ Params: { runId: string } }>("/v1/runs/:runId/cancel", async (request, reply) => {
    try { return await service.cancel(request.params.runId); }
    catch { return reply.code(404).send({ error: "run_not_found" }); }
  });
  app.get<{ Params: { runId: string } }>("/v1/runs/:runId/artifacts", async (request, reply) => {
    try { return await service.manifest(request.params.runId); }
    catch { return reply.code(404).send({ error: "artifact_not_found" }); }
  });
  app.get<{ Params: { runId: string }; Querystring: { format?: string } }>("/v1/runs/:runId/download", async (request, reply) => {
    if (request.query.format !== undefined && request.query.format !== 'notale') return reply.code(400).send({ error: 'invalid_export_format' });
    let run;
    try { run = await store.get(request.params.runId); }
    catch { return reply.code(404).send({ error: 'run_not_found' }); }
    if (run.status !== 'completed') return reply.code(409).send({ error: 'lecture_not_completed' });
    try {
      const file = await exports.ensure(run.id);
      const filename = await lectureFilename(service, run.id);
      const encoded = encodeURIComponent(filename).replace(/['()*]/g, char => '%' + char.charCodeAt(0).toString(16).toUpperCase());
      return reply.type('application/octet-stream')
        .header('content-disposition', `attachment; filename="${run.id}.notale"; filename*=UTF-8''${encoded}`)
        .header('content-length', (await stat(file)).size).header('cache-control', 'no-store')
        .send(createReadStream(file));
    } catch (error) {
      app.log.error({ err: error, runId: run.id }, 'Lecture export failed');
      return reply.code(503).send({ error: 'lecture_export_failed', message: '讲义文件打包失败，预览不受影响，请重试下载。' });
    }
  });
  app.get<{ Params: { runId: string }; Querystring: { after?: string } }>("/v1/runs/:runId/events", async (request, reply) => {
    const header = request.headers["last-event-id"];
    const cursors = [request.query.after, Array.isArray(header) ? header[0] : header].map(Number);
    const after = Math.max(0, ...cursors.filter(value => Number.isSafeInteger(value) && value >= 0));
    try { await store.get(request.params.runId); }
    catch { return reply.code(404).send({ error: "run_not_found" }); }
    reply.hijack();
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    let replaying = true;
    const pending: Awaited<ReturnType<typeof store.events>> = [];
    const send = (event: Awaited<ReturnType<typeof store.events>>[number]) => {
      reply.raw.write(`id: ${event.sequence}\nevent: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`);
    };
    const connection = await store.replayAndSubscribe(request.params.runId, after, (event) => replaying ? pending.push(event) : send(event));
    for (const event of connection.events) send(event);
    const replayedThrough = connection.events.at(-1)?.sequence ?? after;
    for (const event of pending.filter((row) => row.sequence > replayedThrough)) send(event);
    replaying = false;
    const snapshot = connection.snapshot;
    if (["completed", "failed", "cancelled"].includes(snapshot.status)) {
      reply.raw.end();
      return;
    }
    const heartbeat = setInterval(() => reply.raw.write(": heartbeat\n\n"), 15_000);
    request.raw.on("close", () => { clearInterval(heartbeat); connection.unsubscribe(); });
  });
  app.get<{ Params: { runId: string; "*": string } }>("/v1/runs/:runId/preview/*", async (request, reply) => {
    const output = path.join(store.runDir(request.params.runId), "output");
    const requested = path.resolve(output, request.params["*"] || "index.html");
    if (requested !== output && !requested.startsWith(`${output}${path.sep}`)) return reply.code(400).send({ error: "invalid_path" });
    try {
      let target = requested, boundary = output;
      try { await stat(target); } catch {
        const run = await store.get(request.params.runId);
        if (run.status === 'completed') throw new Error('final asset missing');
        boundary = path.join(store.runDir(request.params.runId), 'work/pages');
        target = path.resolve(boundary, request.params['*'] || 'index.html');
      }
      const resolved = await realpath(target), allowed = await realpath(boundary);
      if (resolved !== allowed && !resolved.startsWith(allowed + path.sep)) throw new Error('asset outside output');
      const info = await stat(resolved);
      if (!info.isFile()) throw new Error("not a file");
      const published = boundary === output;
      // The run URL is immutable after atomic publication. Mutable work files
      // must never leave a cache entry that survives publication at that URL.
      if (!published) {
        reply.header('cache-control', 'no-store');
        reply.type(contentTypes[path.extname(target)] ?? "application/octet-stream");
        return reply.send(createReadStream(resolved));
      }
      // Validate compressed siblings as well as the original before the static
      // plugin chooses a negotiated representation.
      for (const extension of ['.br', '.gz']) {
        try {
          const sibling = await realpath(resolved + extension);
          if (!sibling.startsWith(allowed + path.sep)) throw new Error('compressed asset outside output');
        } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      }
      const html = path.extname(target) === '.html';
      reply.header('cache-control', html ? 'no-cache' : 'public, max-age=31536000, immutable');
      return reply.sendFile(path.relative(allowed, resolved), allowed, { cacheControl: false, etag: true });
    } catch { return reply.code(404).send({ error: "asset_not_found" }); }
  });

  if (options.sessions) {
    const generator = runGenerator(service, options.runsRoot);
    const fixer = options.sessions.fixer ?? istarFixer({ service, generator, ...(models ? { model: request => models.agent(request.model), env: models.env } : {}), owner: 'notale-ts-' + createHash('sha256').update(path.resolve(options.sessions.root)).digest('hex').slice(0, 8) });
    if ('close' in fixer && typeof fixer.close === 'function') app.addHook('onClose', () => (fixer as { close(): Promise<void> }).close());
    sessionRoutes(app, { root: options.sessions.root, ...(models ? { resolveModel: (value: unknown) => { const { ref } = models.resolve(value); return { model: ref, complete: modelComplete(() => models.agent(ref)) }; } } : {}), complete: options.sessions.complete ?? modelComplete(() => fixModel()), generator, fixer, runOutput: id => path.join(store.runDir(id), 'output') });
  }

  return { app, store, service };
}
