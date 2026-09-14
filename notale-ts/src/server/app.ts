import { TemplateInputs } from '../core/template-input.js';
import { TEMPLATE_MAX_BYTES } from '../core/pptx-template.js';
import { createReadStream } from "node:fs";
import { stat, realpath } from "node:fs/promises";
import path from "node:path";
import Fastify from "fastify";
import fastifyStatic from '@fastify/static';
import { createRunRequestSchema } from "../protocol/index.js";
import { RunStore } from "../core/run-store.js";
import { RunService, type GenerationPipeline } from "../core/run-service.js";
import { starterPipeline } from "../core/starter-pipeline.js";
import { createModelPipeline } from "../core/model-pipeline.js";
import { archiveContentTypes } from './lecture-archive.js';
import { LectureExports, lectureFilename } from './lecture-exports.js';

const contentTypes = archiveContentTypes;

export interface AppOptions {
  runsRoot: string;
  pipeline?: GenerationPipeline;
  useStarterPipeline?: boolean;
  logger?: boolean;
}

export function createApp(options: AppOptions) {
  const app = Fastify({ logger: options.logger ?? true });
  app.register(fastifyStatic, { serve: false, preCompressed: true, dotfiles: 'deny' });
  const store = new RunStore(options.runsRoot);
  const service: RunService = new RunService(store, options.pipeline ?? (options.useStarterPipeline ? starterPipeline : createModelPipeline()),
    id => exports.ensure(id).catch(error => { app.log.error({ err: error, runId: id }, 'Lecture export failed'); }));
  const exports = new LectureExports(service);
  app.addHook('onReady', () => exports.recover());
  app.addHook('onClose', () => exports.idle());

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

  app.post("/v1/runs", async (request, reply) => {
    const parsed = createRunRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_request", issues: parsed.error.issues });
    if (parsed.data.templateId) {
      try { await templates.file(parsed.data.templateId); }
      catch { return reply.code(400).send({ error: "invalid_template", message: "模板不存在或校验失败，请重新上传" }); }
    }
    const run = await service.start(parsed.data);
    return reply.code(202).send(run);
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

  return { app, store, service };
}
