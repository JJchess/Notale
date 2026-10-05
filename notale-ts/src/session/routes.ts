import type { FastifyInstance } from 'fastify';
import type { ServerResponse } from 'node:http';
import { realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { SessionStore, sessionPatch } from './session.js';
import { ATTACHMENT_LIMITS, loadAttachment, saveAttachment } from './attachments.js';
import { turn, type Fixer, type Generator, type TurnEvent } from './turn.js';
import { draftDir, draftTarget } from './fixing.js';
import type { Complete } from './understand.js';

/** One message in flight. It belongs to the server, not to the connection that sent it: a client
 * that goes away (a reload) just stops listening, and whoever opens the session again replays what
 * happened so far and follows the rest. Kept in memory, like a running generation's task. */
interface Live { events: (TurnEvent | { type: 'done' } | { type: 'error'; message: string })[]; listeners: Set<ServerResponse>; stop: AbortController }

/** The conversation in front of generation and fixing, on the same server as the runs it makes:
 *   POST /v1/sessions                 → {id}
 *   GET  /v1/sessions                → {items: SessionSummary[], nextCursor?}
 *   PATCH /v1/sessions/:id           {title?, archived?} → SessionSummary
 *   POST /v1/sessions/:id/files       raw bytes, name in `x-file-name` (URI-encoded) → {id, name, kind, size}
 *   GET  /v1/sessions/:id/files/:fileId scoped attachment preview/download
 *   POST /v1/sessions/:id/turns       {text, fileIds} → ndjson TurnEvents, then {type:'done'}
 *   GET  /v1/sessions/:id/turn        the message in flight: what happened so far, then the rest (ndjson); 404 when none
 *   POST /v1/sessions/:id/interrupt   stops it (a fix keeps what it wrote; a generation is cancelled)
 *   GET  /v1/sessions/:id/draft/*     the fix agent's working copy, for a live preview
 *   GET  /v1/sessions/:id             → {id, busy, runs (with status once ended), entries, files (attachment names)}
 * One message at a time per session: a second one while one runs is refused, not queued. */
export function sessionRoutes(app: FastifyInstance, deps: { root: string; complete: Complete; generator: Generator; fixer: Fixer; runOutput: (runId: string) => string }) {
  const sessions = new SessionStore(deps.root), live = new Map<string, Live>();
  const open = (id: string) => sessions.get(id);
  const failure = (cause: unknown) => {
    const status = (cause as { statusCode?: number; status?: number }).statusCode ?? (cause as { status?: number }).status ?? 500;
    return { status, body: { error: (cause as { code?: string }).code === 'SESSION_BUSY' ? 'SESSION_BUSY' : status === 404 ? 'NOT_FOUND' : status === 400 ? 'BAD_REQUEST' : 'FAILED', message: cause instanceof Error ? cause.message : String(cause) } };
  };
  const line = (res: ServerResponse, event: unknown) => { if (!res.writableEnded) res.write(JSON.stringify(event) + '\n'); };
  /** Streams a message to one client: everything so far, then live until it is done. */
  const subscribe = (res: ServerResponse, current: Live) => {
    res.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' });
    for (const event of current.events) line(res, event);
    if (current.events.at(-1)?.type === 'done' || current.events.at(-1)?.type === 'error') { res.end(); return; }
    current.listeners.add(res);
    res.on('close', () => current.listeners.delete(res));
  };
  app.addContentTypeParser('application/octet-stream', { parseAs: 'buffer', bodyLimit: ATTACHMENT_LIMITS.bytes }, (_request, body, done) => done(null, body));

  app.post('/v1/sessions', async (_request, reply) => reply.code(201).send({ id: (await sessions.create()).id }));
  app.get<{ Querystring: { q?: string; archived?: string; limit?: string; cursor?: string } }>('/v1/sessions', async (request, reply) => {
    try {
      const { q, archived, limit, cursor } = request.query;
      if (typeof q !== 'undefined' && typeof q !== 'string' || archived !== undefined && archived !== 'true' && archived !== 'false' || limit !== undefined && !/^\d+$/.test(limit) || cursor !== undefined && typeof cursor !== 'string') return reply.code(400).send({ error: 'BAD_REQUEST', message: '会话列表参数无效' });
      return await sessions.list({ ...(q !== undefined ? { q } : {}), ...(archived !== undefined ? { archived: archived === 'true' } : {}), ...(limit !== undefined ? { limit: Number(limit) } : {}), ...(cursor !== undefined ? { cursor } : {}) }, id => live.has(id));
    } catch (cause) { const { status, body } = failure(cause); return reply.code(status).send(body); }
  });
  app.patch<{ Params: { id: string }; Body: unknown }>('/v1/sessions/:id', async (request, reply) => {
    try {
      const patch = sessionPatch(request.body), session = await open(request.params.id);
      return await session.update(patch, () => live.has(session.id));
    } catch (cause) { const { status, body } = failure(cause); return reply.code(status).send(body); }
  });
  app.get<{ Params: { id: string } }>('/v1/sessions/:id', async (request, reply) => {
    try {
      const session = await open(request.params.id);
      // Names of the files messages carried, so a transcript can show them.
      const files = await Promise.all([...session.usedFiles].map(id => loadAttachment(session, id).then(found => found.meta, () => undefined)));
      return { ...session.summary(live.has(session.id)), runs: session.runs, entries: session.entries, files: files.filter(Boolean) };
    } catch (cause) { const { status, body } = failure(cause); return reply.code(status).send(body); }
  });
  app.get<{ Params: { id: string; fileId: string } }>('/v1/sessions/:id/files/:fileId', async (request, reply) => {
    try {
      const session = await open(request.params.id), { meta, file } = await loadAttachment(session, request.params.fileId);
      const mode = ['image', 'video', 'pdf'].includes(meta.kind) ? 'inline' : 'attachment';
      const name = meta.name.replace(/[\u0000-\u001f\u007f/\\]/gu, '').replace(/[\uD800-\uDFFF]/gu, '\uFFFD');
      const fallback = name.replace(/[^\x20-\x7e]|["\\]/g, '_') || 'attachment';
      const encoded = encodeURIComponent(name).replace(/['()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
      reply.type(meta.mime).header('x-content-type-options', 'nosniff').header('cache-control', 'private, no-store')
        .header('content-disposition', `${mode}; filename="${fallback}"; filename*=UTF-8''${encoded}`);
      return reply.sendFile(path.basename(file), path.dirname(file), { cacheControl: false, contentType: false });
    } catch (cause) { const { status, body } = failure(cause); return reply.code(status).send(body); }
  });
  app.post<{ Params: { id: string } }>('/v1/sessions/:id/files', { bodyLimit: ATTACHMENT_LIMITS.bytes }, async (request, reply) => {
    try {
      const session = await open(request.params.id);
      const name = decodeURIComponent(String(request.headers['x-file-name'] ?? ''));
      if (!name) return reply.code(400).send({ error: 'BAD_FILE', message: '缺少文件名（x-file-name）' });
      if (!Buffer.isBuffer(request.body)) return reply.code(415).send({ error: 'BAD_FILE', message: '文件以 application/octet-stream 上传' });
      return reply.code(201).send(await saveAttachment(session, name, request.body));
    } catch (cause) { const { status, body } = failure(cause); return reply.code(status).send(body); }
  });
  app.post<{ Params: { id: string }; Body: { text?: unknown; fileIds?: unknown } }>('/v1/sessions/:id/turns', { bodyLimit: 1 << 20 }, async (request, reply) => {
    let session;
    try { session = await open(request.params.id); } catch (cause) { const { status, body } = failure(cause); return reply.code(status).send(body); }
    // Validated before the stream starts, so a bad request is an ordinary 4xx.
    const input = request.body ?? {};
    const text = typeof input.text === 'string' ? input.text.trim() : '';
    const fileIds = Array.isArray(input.fileIds) ? input.fileIds as unknown[] : [];
    if (!text || text.length > 20_000) return reply.code(400).send({ error: 'BAD_TEXT', message: '消息不能为空，最长 20000 字' });
    if (fileIds.length > ATTACHMENT_LIMITS.files || fileIds.some(id => typeof id !== 'string' || !/^[0-9a-f-]{36}$/.test(id))) return reply.code(400).send({ error: 'BAD_FILES', message: '最多 10 个附件' });
    const current: Live = { events: [], listeners: new Set(), stop: new AbortController() };
    // Admission and archive writes are serialized, so neither can slip through the other's check.
    const admitted = await session.exclusive(() => {
      if (live.has(session.id)) return 'SESSION_BUSY';
      if (session.archived) return 'SESSION_ARCHIVED';
      live.set(session.id, current);
      return undefined;
    });
    if (admitted) return reply.code(409).send({ error: admitted, message: admitted === 'SESSION_BUSY' ? '这个会话还有一条消息在处理' : '请先恢复已归档的会话' });
    const emit = (event: Live['events'][number]) => { current.events.push(event); for (const res of current.listeners) line(res, event); };
    const finished = turn(session, { text, fileIds: fileIds as string[] }, { complete: deps.complete, generator: deps.generator, fixer: deps.fixer, emit, signal: current.stop.signal })
      .then(() => emit({ type: 'done' }), cause => emit({ type: 'error', message: cause instanceof Error ? cause.message : String(cause) }))
      .finally(() => { live.delete(session.id); for (const res of current.listeners) res.end(); current.listeners.clear(); });
    void finished;
    reply.hijack();
    subscribe(reply.raw, current);
  });
  app.get<{ Params: { id: string } }>('/v1/sessions/:id/turn', async (request, reply) => {
    const current = live.get(request.params.id);
    if (!current) return reply.code(404).send({ error: 'NO_TURN', message: '这个会话没有进行中的消息' });
    reply.hijack();
    subscribe(reply.raw, current);
  });
  app.post<{ Params: { id: string } }>('/v1/sessions/:id/interrupt', async (request, reply) => {
    const current = live.get(request.params.id);
    if (!current) return reply.code(409).send({ error: 'NO_TURN', message: '这个会话没有进行中的消息' });
    current.stop.abort();
    return { stopping: true };
  });
  // The draft is the fix agent's directory as it is right now. The lecture player is not in it
  // (a checkout leaves it out), so it comes from the run being fixed; it loads the pages relatively,
  // which are the draft's.
  app.get<{ Params: { id: string; '*': string } }>('/v1/sessions/:id/draft/*', async (request, reply) => {
    try {
      const session = await open(request.params.id);
      const file = request.params['*'] || 'index.html';
      if (file.split('/').some(part => !part || part === '..' || part.startsWith('.'))) return reply.code(400).send({ error: 'invalid_path' });
      const root = draftDir(session);
      let base = await realpath(root), target = path.resolve(base, file);
      if (file === 'index.html' && !(await stat(target).catch(() => undefined))) {
        const runId = await draftTarget(session);
        if (!runId) return reply.code(404).send({ error: 'NO_DRAFT' });
        base = await realpath(deps.runOutput(runId)); target = path.join(base, 'index.html');
      }
      const resolved = await realpath(target);
      if (!resolved.startsWith(base + path.sep)) return reply.code(400).send({ error: 'invalid_path' });
      reply.header('cache-control', 'no-store');
      return reply.sendFile(path.relative(base, resolved), base, { cacheControl: false });
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return reply.code(404).send({ error: 'NOT_FOUND' });
      const { status, body } = failure(cause); return reply.code(status).send(body);
    }
  });
}
