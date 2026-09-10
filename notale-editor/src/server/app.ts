import {resolve} from 'node:path';
import { inspectSourceScenes } from '../domain/source-scenes.js';
import { byteRange } from './range.js';
import Fastify, { type FastifyRequest, type FastifyInstance } from 'fastify';
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { lookup } from 'mime-types';
import { Store, sha256, type Context } from './store.js';
import { commitSchema, documentSchema, DomainError, filePath, invariant } from '../domain/model.js';
import { inspectSlide } from '../domain/html.js';
import { renderSlide, playerHtml } from './render.js';

export interface Integration {
  context: (request: FastifyRequest) => Promise<Context>;
  authorize: (
    ctx: Context,
    action: 'read' | 'edit' | 'create' | 'export',
    documentId?: string,
  ) => Promise<boolean>;
}
export interface AppOptions {
  store: Store;
  integration: Integration;
  secret: string;
  contentOrigin: string;
  logger?: boolean;
  api?: FastifyInstance;
  serveWorkbench?: boolean;
}
export function createApps(options: AppOptions) {
  const api = options.api ?? Fastify({ logger: options.logger ?? false, bodyLimit: 75_000_000 });
  const content = Fastify({
    logger: options.logger ?? false,
    routerOptions: { maxParamLength: 2048 },
  });
  const { store, integration } = options;
  async function context(
    req: FastifyRequest,
    action: 'read' | 'edit' | 'create' | 'export',
    id?: string,
  ) {
    const ctx = await integration.context(req);
    invariant(ctx.actor && ctx.scope, 'UNAUTHENTICATED', 'Host identity is required', 401);
    invariant(await integration.authorize(ctx, action, id), 'FORBIDDEN', 'Host denied access', 403);
    return ctx;
  }
  function sign(payload: string) {
    return createHmac('sha256', options.secret).update(payload).digest('base64url');
  }
  function capability(ctx: Context, id: string, version: number) {
    const data = Buffer.from(
      JSON.stringify({
        scope: ctx.scope,
        actor: ctx.actor,
        id,
        version,
        lease: randomUUID(),
        expires: Date.now() + 3600000,
      }),
    ).toString('base64url');
    return `${data}.${sign(data)}`;
  }
  function readCapability(token: string, id: string, version: number) {
    const [data, signature, extra] = token.split('.');
    invariant(data && signature && !extra, 'FORBIDDEN', 'Invalid preview grant', 403);
    const expected = Buffer.from(sign(data)),
      actual = Buffer.from(signature);
    invariant(
      actual.length === expected.length && timingSafeEqual(actual, expected),
      'FORBIDDEN',
      'Invalid preview grant',
      403,
    );
    let grant;
    try {
      grant = JSON.parse(Buffer.from(data, 'base64url').toString());
    } catch {
      throw new DomainError('FORBIDDEN', 'Invalid preview grant', 403);
    }
    invariant(
      grant.id === id && grant.version === version && typeof grant.scope === 'string',
      'FORBIDDEN',
      'Preview grant expired or does not cover this revision',
      403,
    );
    return grant as {
      scope: string;
      actor?: string;
      id: string;
      version: number;
      lease?: string;
      expires: number;
    };
  }
  for (const app of [api, content])
    app.setErrorHandler((error, req, reply) => {
      if (error instanceof DomainError)
        return reply
          .code(error.status)
          .send({ error: error.code, message: error.message, details: error.details });
      if (error instanceof z.ZodError)
        return reply.code(400).send({ error: 'VALIDATION', issues: error.issues });
      const httpError = error as { statusCode?: number; code?: string; message: string };
      if (
        error instanceof Error &&
        httpError.statusCode &&
        httpError.statusCode >= 400 &&
        httpError.statusCode < 500
      )
        return reply
          .code(httpError.statusCode)
          .send({ error: httpError.code ?? 'INVALID_REQUEST', message: error.message });
      req.log.error(error);
      return reply.code(500).send({
        error: 'INTERNAL',
        message: 'Operation failed; no partial revision was committed',
      });
    });
  api.get('/health', async () => {
    await store.pool.query('SELECT 1');
    return { status: 'ok' };
  });
  api.get('/api/sync-context', async req => context(req,'read'));
  api.get('/api/documents', async (req) => store.list(await context(req, 'read')));
  api.post('/api/documents', async (req, reply) => {
    const ctx = await context(req, 'create');
    const result = await store.create(ctx, documentSchema.parse(req.body));
    return reply.code(201).send(result);
  });
  api.get<{ Params: { id: string }; Querystring: { version?: string } }>(
    '/api/documents/:id',
    async (req) =>
      store.get(
        await context(req, 'read', req.params.id),
        req.params.id,
        req.query.version ? z.coerce.number().int().positive().parse(req.query.version) : undefined,
      ),
  );
  api.get<{ Params: { id: string } }>('/api/documents/:id/history', async (req) =>
    store.history(await context(req, 'read', req.params.id), req.params.id),
  );
  api.get<{ Params: { id: string; slideId: string }; Querystring: { version?: string } }>(
    '/api/documents/:id/slides/:slideId/scenes',
    async (req) => {
      const snapshot = await store.get(
        await context(req, 'read', req.params.id),
        req.params.id,
        req.query.version ? z.coerce.number().int().positive().parse(req.query.version) : undefined,
      );
      const slide = snapshot.document.slides.find((slide) => slide.id === req.params.slideId);
      invariant(slide, 'SLIDE_NOT_FOUND', 'Slide does not exist', 404);
      return inspectSourceScenes(slide);
    },
  );
  api.get<{Params:{id:string}}>('/api/documents/:id/sync-head',async req=>store.syncHead(await context(req,'read',req.params.id),req.params.id));
  api.post<{ Params: { id: string } }>('/api/documents/:id/sync-recovery',async req=>{
    const ctx=await context(req,'edit',req.params.id);await context(req,'create');return store.recoverSync(ctx,req.params.id,commitSchema.parse(req.body));
  });
  api.post<{ Params: { id: string } }>('/api/documents/:id/sync', async req =>
    store.sync(await context(req,'edit',req.params.id),req.params.id,
      commitSchema.extend({commands:z.array(commitSchema.shape.commands.element).max(500),geometry:z.boolean().optional(),inverseVersion:z.number().int().min(2).optional(),restoreVersion:z.number().int().positive().optional()}).refine(v=>!!v.inverseVersion||!!v.restoreVersion||v.commands.length>0).refine(v=>!(v.inverseVersion&&v.restoreVersion)).refine(v=>!v.commands.length||(!v.inverseVersion&&!v.restoreVersion)).parse(req.body)));
  api.post<{ Params: { id: string } }>('/api/documents/:id/commits', async (req) =>
    store.commit(
      await context(req, 'edit', req.params.id),
      req.params.id,
      commitSchema.parse(req.body),
    ),
  );
  api.post<{ Params: { id: string } }>('/api/documents/:id/restore', async (req) => {
    const ctx = await context(req, 'edit', req.params.id);
    const b = z
      .object({
        version: z.number().int().positive(),
        baseVersion: z.number().int().positive(),
        mutationId: z.string().uuid(),
      })
      .strict()
      .parse(req.body);
    return store.restore(ctx, req.params.id, b.version, b.baseVersion, b.mutationId);
  });
  api.get<{ Params: { id: string; slideId: string }; Querystring: { version?: string } }>(
    '/api/documents/:id/slides/:slideId/objects',
    async (req) => {
      const snapshot = await store.get(
        await context(req, 'read', req.params.id),
        req.params.id,
        req.query.version ? z.coerce.number().int().positive().parse(req.query.version) : undefined,
      );
      const slide = snapshot.document.slides.find((s) => s.id === req.params.slideId);
      invariant(slide, 'NOT_FOUND', 'Slide not found', 404);
      return inspectSlide(slide);
    },
  );
  api.post('/api/assets', async (req) => {
    const ctx = await context(req, 'edit');
    const b = z
      .object({ data: z.string().max(70_000_000), mime: z.string().max(200) })
      .strict()
      .parse(req.body);
    return store.upload(ctx, { data: Buffer.from(b.data, 'base64'), mime: b.mime });
  });
  api.get<{ Params: { id: string }; Querystring: { version?: string } }>(
    '/api/documents/:id/preview',
    async (req) => {
      const ctx = await context(req, 'read', req.params.id),
        snapshot = await store.get(
          ctx,
          req.params.id,
          req.query.version
            ? z.coerce.number().int().positive().parse(req.query.version)
            : undefined,
        );
      const token = capability(ctx, req.params.id, snapshot.version),
        base = `${options.contentOrigin}/content/${token}/${req.params.id}/${snapshot.version}/`;
      const expiresAt = await store.renewPreview(
        ctx,
        req.params.id,
        snapshot.version,
        sha256(token),
      );
      return {
        version: snapshot.version,
        channel: token,
        expiresAt,
        renewAfterMs: 1800000,
        slides: snapshot.document.slides.map((s) => ({
          id: s.id,
          url: base + s.sourcePath.split('/').map(encodeURIComponent).join('/'),
        })),
      };
    },
  );
  api.post<{ Params: { id: string } }>('/api/documents/:id/preview/renew', async (req) => {
    const ctx = await context(req, 'read', req.params.id);
    const { channel, version } = z
      .object({ channel: z.string().max(2048), version: z.number().int().positive() })
      .strict()
      .parse(req.body);
    const grant = readCapability(channel, req.params.id, version);
    invariant(
      grant.lease && grant.scope === ctx.scope && grant.actor === ctx.actor,
      'FORBIDDEN',
      'Preview renewal requires the original host identity',
      403,
    );
    const expiresAt = await store.renewPreview(ctx, req.params.id, version, sha256(channel));
    return { channel, version, expiresAt, renewAfterMs: 1800000 };
  });
  content.get<{ Params: { token: string; id: string; version: string; '*': string } }>(
    '/content/:token/:id/:version/*',
    async (req, reply) => {
      const { id, token } = req.params,
        version = z.coerce.number().int().positive().parse(req.params.version),
        grant = readCapability(token, id, version),
        ctx = { scope: grant.scope, actor: 'preview' },
        path = filePath.parse(req.params['*']);
      invariant(
        grant.lease
          ? await store.previewActive(sha256(token), grant.scope, id, version)
          : grant.expires > Date.now(),
        'FORBIDDEN',
        'Preview grant expired',
        403,
      );
      if(path==='__notale_runtime__/text-editor.js')return reply.type('text/javascript; charset=utf-8').send(await readFile(resolve(process.env.EDITOR_RUNTIME_DIR??'dist','text-editor.js')));
      if(path==='__notale_runtime__/vector-editor.js'||path==='__notale_runtime__/vector-worker.js'||path==='__notale_runtime__/pathkit.wasm')return reply.type(path.endsWith('.wasm')?'application/wasm':'text/javascript; charset=utf-8').send(await readFile(resolve(process.env.EDITOR_RUNTIME_DIR??'dist',path.split('/').at(-1)!)));
      const snapshot = await store.get(ctx, id, version),
        slide = snapshot.document.slides.find((s) => s.sourcePath === path);
      reply.header('Referrer-Policy', 'no-referrer').header('X-Content-Type-Options', 'nosniff');
      if (slide)
        return reply
          .type('text/html; charset=utf-8')
          .send(
            await renderSlide(
              snapshot.document,
              slide,
              token,
              slide.layoutId ? await store.stylesheets(ctx, snapshot.document) : undefined,
            ),
          );
      const metadata = snapshot.document.assets[path];
      invariant(metadata, 'NOT_FOUND', 'File not found', 404);
      const asset = await store.asset(ctx, id, version, path);
      const etag = `"${asset.hash}"`;
      reply.type(metadata.mime).header('ETag', etag).header('Accept-Ranges', 'bytes');
      const range =
        req.method === 'GET' && (!req.headers['if-range'] || req.headers['if-range'] === etag)
          ? byteRange(req.headers.range, asset.data.length)
          : undefined;
      if (range === null)
        return reply.code(416).header('Content-Range', `bytes */${asset.data.length}`).send();
      if (range)
        return reply
          .code(206)
          .header('Content-Range', `bytes ${range.start}-${range.end}/${asset.data.length}`)
          .send(asset.data.subarray(range.start, range.end + 1));
      return reply.send(asset.data);
    },
  );
  api.get<{ Params: { id: string }; Querystring: { version?: string } }>(
    '/api/documents/:id/export',
    async (req, reply) => {
      const ctx = await context(req, 'export', req.params.id),
        snapshot = await store.get(
          ctx,
          req.params.id,
          req.query.version
            ? z.coerce.number().int().positive().parse(req.query.version)
            : undefined,
        );
      const files: Record<string, Uint8Array> = {
        'notale-project.json': strToU8(JSON.stringify(snapshot)),
        'index.html': strToU8(playerHtml(snapshot.document)),
      };
      const stylesheets = snapshot.document.slides.some((s) => s.layoutId)
        ? await store.stylesheets(ctx, snapshot.document)
        : undefined;
      for (const s of snapshot.document.slides) {
        invariant(!files[s.sourcePath], 'PATH_COLLISION', 'Reserved export path');
        files[s.sourcePath] = strToU8(
          await renderSlide(snapshot.document, s, 'export', stylesheets),
        );
      }
      for (const [path] of Object.entries(snapshot.document.assets)) {
        invariant(!files[path], 'PATH_COLLISION', 'Reserved export path');
        files[path] = (await store.asset(ctx, req.params.id, snapshot.version, path)).data;
      }
      return reply
        .type('application/zip')
        .header(
          'Content-Disposition',
          `attachment; filename="${req.params.id}-v${snapshot.version}.zip"`,
        )
        .send(Buffer.from(zipSync(files, { level: 6 })));
    },
  );
  api.post('/api/import', async (req, reply) => {
    const ctx = await context(req, 'create'),
      body = z
        .object({ data: z.string().max(70_000_000), id: z.string().uuid().optional() })
        .strict()
        .parse(req.body);
    let total = 0;
    const files = unzipSync(Buffer.from(body.data, 'base64'), {
      filter: (entry) => {
        total += entry.originalSize;
        invariant(total <= 150_000_000, 'TOO_LARGE', 'Expanded project exceeds 150 MB', 413);
        filePath.parse(entry.name);
        return true;
      },
    });
    invariant(files['notale-project.json'], 'INVALID_PROJECT', 'Project manifest is missing');
    const manifest = JSON.parse(strFromU8(files['notale-project.json']));
    const doc = documentSchema.parse(manifest.document);
    doc.id = body.id ?? randomUUID();
    for (const [path, a] of Object.entries(doc.assets)) {
      invariant(files[path], 'MISSING_ASSET', `Missing ${path}`);
      const uploaded = await store.upload(ctx, { data: Buffer.from(files[path]), mime: a.mime });
      invariant(
        uploaded.hash === a.hash && uploaded.size === a.size,
        'ASSET_HASH_MISMATCH',
        `Corrupt asset ${path}`,
      );
    }
    return reply.code(201).send(await store.create(ctx, doc));
  });
  api.get('/api/schema', async () => ({
    document: z.toJSONSchema(documentSchema),
    commit: z.toJSONSchema(commitSchema),
  }));
  if (options.serveWorkbench !== false) {
    const staticNames = [
      'workbench.html',
      'workbench.js',
      'workbench.css',
      'show.html',
      'show.js',
      'reveal.css',
    ];
    for (const name of staticNames)
      api.get(`/${name}`, async (_req, reply) =>
        reply
          .type(lookup(name) || 'application/octet-stream')
          .send(await readFile(new URL(`../../dist/${name}`, import.meta.url))),
      );
    api.get('/', async (_req, reply) => reply.redirect('/workbench.html'));
  }
  return { api, content };
}
