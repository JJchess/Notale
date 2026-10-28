import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, realpath, stat, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { createHmac, createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { chromium } from 'playwright-core';
import path from 'node:path';
import { lookup } from 'mime-types';
import { FilmProcesses, runtimeOptions, scopeDirectory, type FilmServerOptions } from './config.js';
import type { Context, Store } from '../store.js';
import type { Snapshot } from '../../domain/model.js';
import { parseFilmDocument } from '../../film/index.js';
import { byteRange } from '../range.js';
import { createMediaService } from './media-service.mjs';
import { createExportService } from './export-service.mjs';
import { collectResources, mapDocumentResources, resourceName } from './export-resources.mjs';
import { filmEnvelope, filmFromMotale, validFilmMotaleAuthor } from '../../film/index.js';
import { decodeMotale, encodeMotale, motaleFilename, motaleKey } from '../motale-archive.js';

type Action = 'read' | 'edit' | 'create' | 'export';
interface Options {
  api: FastifyInstance; content: FastifyInstance; store: Store;
  context: (req: FastifyRequest, action: Action, id?: string) => Promise<Context>;
  secret: string; contentOrigin: string; film: FilmServerOptions;
}
interface Job { id: string; actor: string; scope: string; doc: { id: string }; state: string }
interface Service {
  close: () => Promise<void>;
  handle: (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;
  store: { ready: Promise<void>; jobs: Map<string, Job>; close: () => Promise<void> };
}
const fail = (message: string, statusCode = 400) => Object.assign(Error(message), { statusCode });
async function replayJson(req: IncomingMessage, limit = 20 * 1024 * 1024): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []; let bytes = 0;
  for await (const chunk of req) { const buffer = Buffer.from(chunk); bytes += buffer.length; if (bytes > limit) throw fail('请求超过大小限制', 413); chunks.push(buffer); }
  const body = Buffer.concat(chunks); let value: unknown; try { value = JSON.parse(body.toString() || '{}'); } catch { throw fail('无效 JSON 请求'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw fail('无效请求');
  req[Symbol.asyncIterator] = async function* () { yield body; };
  return value as Record<string, unknown>;
}
async function bounded(root: string, relative: string) {
  if (!relative || relative.includes('\\') || relative.split('/').some(p => !p || p === '.' || p === '..' || p.includes('\0'))) throw fail('无效素材路径');
  const base = await realpath(root), file = await realpath(path.join(base, relative)).catch(error => { if (error.code === 'ENOENT' || error.code === 'ENOTDIR') throw fail('素材不存在', 404); throw error; });
  if (!file.startsWith(base + path.sep)) throw fail('素材越界', 403);
  return file;
}
async function sendFile(req: IncomingMessage, res: ServerResponse, file: string) {
  const info = await stat(file); if (!info.isFile()) throw fail('素材不存在', 404);
  const range = byteRange(req.headers.range, info.size);
  // Reuse the editor's range validation; authored HTML is admitted separately.
  if (range === null) { res.writeHead(416, { 'content-range': `bytes */${info.size}` }).end(); return; }
  const start = range?.start ?? 0, end = range?.end ?? info.size - 1;
  res.writeHead(range ? 206 : 200, { 'content-type': lookup(file) || 'application/octet-stream', 'content-length': String(Math.max(0, end - start + 1)), 'accept-ranges': 'bytes', 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff', ...(range ? { 'content-range': `bytes ${start}-${end}/${info.size}` } : {}) });
  if (req.method === 'HEAD' || !info.size) { res.end(); return; }
  const stream = createReadStream(file, { start, end }); stream.on('error', () => res.destroy()); res.on('close', () => stream.destroy()); stream.pipe(res);
}

export function registerFilm(options: Options) {
  const { api, content, context, store, film } = options;
  const runtime = runtimeOptions(film), processes = new FilmProcesses(runtime);
  let exportTail: Promise<unknown> = Promise.resolve();
  const schedule = <T>(work: () => Promise<T>): Promise<T> => { const result = exportTail.then(work); exportTail = result.catch(() => undefined); return result; };
  const services = new Map<string, { root: string; media: { handle: Service['handle'] }; exports: Service }>();
  let closing = false;
  async function workspace(ctx: Context) {
    if (closing) throw fail('影片服务正在关闭', 503);
    const key = JSON.stringify([ctx.scope, ctx.actor]); let value = services.get(key);
    if (!value) {
      const root = scopeDirectory(film.dataDir, ctx.scope); await mkdir(root, { recursive: true });
      value = services.get(key); if (value) return value;
      value = { root, media: createMediaService({ root, actor: ctx.actor, spawn: processes.spawn }), exports: createExportService({ root, actor: ctx.actor, scope: ctx.scope, runtime: { ...runtime, schedule } }) as unknown as Service };
      services.set(key, value);
    }
    return value;
  }
  const capabilities = async () => {
    const errors: Record<string, string> = {};
    if (!runtime.playerDir) errors.player = '未配置影片播放器构建产物';
    else for (const name of ['player.js', 'player.css', 'film-overlay.html', 'player-build.json']) {
      try { await stat(path.join(runtime.playerDir, name)); } catch { errors.player = '影片播放器构建产物缺失'; }
    }
    if (!errors.player) {
      try { const manifest = JSON.parse(await readFile(path.join(runtime.playerDir, 'player-build.json'), 'utf8')); for (const name of ['player.js', 'player.css', 'film-overlay.html']) if (manifest.hashes?.[name] !== createHash('sha256').update(await readFile(path.join(runtime.playerDir, name))).digest('hex')) throw Error('hash'); } catch { errors.player = '影片播放器构建校验失败'; }
    }
    try { await stat(runtime.chromium ?? chromium.executablePath()); } catch { errors.chromium = '未找到 Chromium，请配置 EDITOR_CHROMIUM_PATH'; }
    for (const command of ['ffmpeg', 'ffprobe', 'python3', 'zip']) {
      try {
        await new Promise<void>((done, reject) => {
          const child = processes.spawn(command, [command === 'python3' ? '--version' : command === 'zip' ? '-v' : '-version'], { stdio: 'ignore' });
          const timeout = setTimeout(() => { child.kill('SIGTERM'); reject(Error('工具检查超时')); }, 3000);
          child.once('error', error => { clearTimeout(timeout); reject(error); }); child.once('close', code => { clearTimeout(timeout); code === 0 ? done() : reject(Error('工具不可用')); });
        });
      } catch { errors[command] = `未找到可用的 ${command}`; }
    }
    for (const module of ['pptx', 'opentimelineio']) {
      try { await new Promise<void>((done, reject) => { const child = processes.spawn('python3', ['-c', `import ${module}`], { stdio: 'ignore' }); const timeout = setTimeout(() => { child.kill('SIGTERM'); reject(Error('Python 检查超时')); }, 3000); child.once('error', error => { clearTimeout(timeout); reject(error); }); child.once('close', code => { clearTimeout(timeout); code === 0 ? done() : reject(Error('Python 模块缺失')); }); }); }
      catch { errors[module] = `Python 环境缺少 ${module}`; }
    }
    const render = ['player', 'chromium'], video = [...render, 'ffmpeg', 'ffprobe'];
    const requirements: Record<string, string[]> = { mp4: video, gif: video, png: render, 'png-sequence': [...render, 'zip'], wav: video, stems: [...video, 'zip'], loudness: video, subtitles: ['zip'], otio: [...video, 'python3', 'opentimelineio', 'zip'], html: ['player', 'zip'], 'slides-png': [...render, 'zip'], 'slides-pdf': render, 'slides-pptx': [...render, 'python3', 'pptx'] };
    const availability = Object.fromEntries(Object.entries(requirements).map(([format, tools]) => { const reason = tools.map(tool => errors[tool]).find(Boolean); return [format, { available: !reason, ...(reason ? { reason } : {}) }]; }));
    return { errors, availability, trustedLocalFilms: film.trustedLocalFilms === true };
  };
  let capabilityCheck: ReturnType<typeof capabilities> | undefined;
  api.get('/film-export/capabilities', async req => {
    await context(req, 'read'); const value = await (capabilityCheck ??= capabilities());
    return { formats: ['mp4','gif','png','png-sequence','wav','stems','subtitles','otio','html','slides-png','slides-pdf','slides-pptx'], codecs: ['h264','hevc','vp9','prores422hq','prores4444'], unsupported: { 'hevc-alpha': '当前导出器不支持 HEVC Alpha' }, ...value };
  });
  const handle = async (req: FastifyRequest, reply: import('fastify').FastifyReply) => {
    const url = new URL(req.url, 'http://editor.local'), exporting = url.pathname.startsWith('/film-export/');
    let action: Action = req.method === 'GET' || req.method === 'HEAD' ? 'read' : exporting ? 'export' : 'edit';
    if (url.pathname === '/film-media/imports' && req.method === 'POST') action = 'create';
    const ctx = await context(req, action), service = await workspace(ctx);
    let documentId: string | undefined, requestedFormat: string | undefined;
    if (exporting) {
      await service.exports.store.ready;
      const match = /^\/film-export\/jobs\/([a-f0-9-]{36})(?:\/|$)/.exec(url.pathname);
      if (match) {
        const job = service.exports.store.jobs.get(match[1]!);
        if (!job || job.scope !== ctx.scope || job.actor !== ctx.actor) throw fail('任务不存在', 404);
        documentId = job.doc.id;
      } else if (req.method === 'POST' && ['/film-export/jobs', '/film-export/scope-frame'].includes(url.pathname)) {
        const value = await replayJson(req.raw); let doc; try { doc = parseFilmDocument(value.document); } catch (error) { throw fail(error instanceof Error ? error.message : '无效影片文档'); } documentId = doc.id; requestedFormat = url.pathname === '/film-export/scope-frame' ? 'png' : String((value.options as { format?: unknown } | undefined)?.format ?? '');
        if (!runtime.playerDir) throw fail('未配置影片播放器构建产物', 503);
      } else if (url.pathname === '/film-export/jobs/by-request') documentId = url.searchParams.get('documentId') ?? undefined;
      if (documentId) { await context(req, action, documentId); await store.get(ctx, documentId); }
      if (requestedFormat) { const state = (await (capabilityCheck ??= capabilities())).availability[requestedFormat]; if (!state) throw fail('不支持此导出格式'); if (!state.available) throw fail(state.reason ?? '导出工具不可用', 503); }
      if (!film.trustedLocalFilms && /\/files\/.*\.(?:html?|m?js|svg)$/i.test(url.pathname)) throw fail('作者内容须使用隔离的预览地址', 403);
      // Render runtime is only used by an isolated browser with local file fulfillment.
      if (!url.pathname.startsWith('/film-export/jobs') && url.pathname !== '/film-export/scope-frame') throw fail('接口不存在', 404);
    }
    if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/fixtures/motale/')) {
      if (!['GET', 'HEAD'].includes(req.method)) throw fail('不支持此操作', 405);
      const file = await bounded(service.root, decodeURIComponent(url.pathname).slice(1));
      if (!film.trustedLocalFilms && /\.(?:html?|m?js|svg)$/i.test(file)) throw fail('作者内容须使用隔离的预览地址', 403);
      reply.hijack(); await sendFile(req.raw, reply.raw, file); return;
    }
    reply.hijack();
    try { await (exporting ? service.exports : service.media).handle(req.raw, reply.raw); }
    catch (error) { if (!reply.raw.headersSent) reply.raw.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ error: error instanceof Error ? error.message : '影片请求失败' })); else reply.raw.destroy(); }
  };
  for (const url of ['/film-media/*', '/film-export/*', '/assets/*', '/fixtures/motale/*']) {
    api.route({ method: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE'], url, onRequest: handle, handler: async () => undefined });
  }
  const grants = new Map<string, { root: string; names: Set<string>; expires: number }>();
  const signature = (value: string) => createHmac('sha256', options.secret).update(value).digest('base64url');
  // A .motale file (Motale's docs/MOTALE-FORMAT.md) is unpacked into its own folder under assets/motale/, which the preview
  // grants and portable exports already take whole as a Motale bundle (collectResources); its author data goes to the clips.
  async function importMotale(ctx: Context, bytes: Buffer) {
    const { root } = await workspace(ctx);
    const { manifest, files } = await decodeMotale(bytes), key = motaleKey(manifest), folder = path.join(root, 'assets', 'motale', key);
    if (!await stat(folder).then(() => true, () => false)) {
      const partial = `${folder}.partial`; await rm(partial, { recursive: true, force: true });
      for (const [name, bytes] of Object.entries(files)) { await mkdir(path.dirname(path.join(partial, name)), { recursive: true }); await writeFile(path.join(partial, name), bytes); }
      await writeFile(path.join(partial, 'motale-project.json'), JSON.stringify(manifest, null, 2));
      await rename(partial, folder);
    }
    const acts = JSON.parse(Buffer.from(files['acts.json']!).toString('utf8')) as { author?: unknown };
    let author: unknown = null;
    try { if (typeof acts.author === 'string' && files[acts.author]) author = JSON.parse(Buffer.from(files[acts.author]!).toString('utf8')); } catch { /* unreadable: none */ }
    return { title: manifest.film.title, acts, uri: `/assets/motale/${key}/index.html`, author: validFilmMotaleAuthor(author) ? author : null };
  }
  api.post('/api/film/motale-import', async req => {
    const ctx = await context(req, 'create');
    if (!Buffer.isBuffer(req.body)) throw fail('请上传 .motale 文件');
    return importMotale(ctx, req.body);
  });
  api.post('/api/film/motale-export', async (req, reply) => {
    const ctx = await context(req, 'export'), { root } = await workspace(ctx);
    const body = req.body as { uri?: unknown; author?: unknown } | undefined;
    if (typeof body?.uri !== 'string') throw fail('缺少 Motale 素材地址');
    if (body.author !== undefined && body.author !== null && !validFilmMotaleAuthor(body.author)) throw fail('无效 Motale 作者数据');
    const folder = path.posix.dirname(resourceName(body.uri));
    if (!/^(?:assets\/(?!imports$)[^/]+(?:\/[^/]+)*|fixtures\/motale\/(?:motion|manim|whiteboard)(?:\/[^/]+)*)$/.test(folder)) throw fail('Motale 影片必须放在独立素材目录内');
    const base = await bounded(root, folder), files: Record<string, Uint8Array> = {};
    let total = 0;
    for (const entry of await readdir(base, { recursive: true, withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const file = path.join(entry.parentPath, entry.name), name = path.relative(base, file).split(path.sep).join('/');
      files[name] = await readFile(await bounded(base, name));
      if ((total += files[name]!.length) > 150_000_000 || Object.keys(files).length > 10_000) throw fail('Motale 影片超过大小限制', 413);
    }
    const known = files['motale-project.json'] ? JSON.parse(Buffer.from(files['motale-project.json']).toString('utf8')) as { film?: { id?: unknown; cut?: unknown } } : {};
    const film = { id: typeof known.film?.id === 'string' ? known.film.id : path.posix.basename(folder), cut: typeof known.film?.cut === 'number' ? known.film.cut : 1 };
    const bytes = await encodeMotale(files, film, body.author ?? undefined);
    const title = String((JSON.parse(Buffer.from(files['acts.json']!).toString('utf8')) as { title?: unknown }).title ?? film.id);
    return reply.type('application/x-motale').header('cache-control', 'no-store')
      .header('content-disposition', `attachment; filename="Motale.motale"; filename*=UTF-8''${encodeURIComponent(motaleFilename(title))}`).send(Buffer.from(bytes));
  });
  api.post<{ Params: { id: string } }>('/api/documents/:id/film-preview', async req => {
    const ctx = await context(req, 'read', req.params.id); await store.get(ctx, req.params.id);
    let doc; try { doc = parseFilmDocument((req.body as { document?: unknown })?.document); } catch (error) { throw fail(error instanceof Error ? error.message : '无效影片文档'); }
    if (doc.id !== req.params.id) throw fail('文档不匹配');
    const { root } = await workspace(ctx), selected = await collectResources(doc, { root });
    const id = randomUUID(), expires = Date.now() + 3600000;
    for (const [key, grant] of grants) if (grant.expires <= Date.now()) grants.delete(key);
    if (grants.size >= 256) throw fail('预览会话过多，请稍后重试', 429);
    grants.set(id, { root, names: new Set(selected.keys()), expires });
    const token = id + '.' + signature(id), base = options.contentOrigin + '/content/film/' + token + '/';
    return { expiresAt: expires, document: mapDocumentResources(doc, base), sameOriginRequired: doc.sources.some(source => source.kind === 'motale' || source.kind === 'openfilm') };
  });
  content.get<{ Params: { token: string; '*': string } }>('/content/film/:token/*', async (req, reply) => {
    const [id, mac, extra] = req.params.token.split('.'), expected = Buffer.from(signature(id ?? '')), received = Buffer.from(mac ?? '');
    const grant = id && grants.get(id);
    if (extra || !grant || grant.expires <= Date.now() || expected.length !== received.length || !timingSafeEqual(expected, received)) throw fail('预览授权已失效', 403);
    const name = req.params['*']; if (!grant.names.has(name)) throw fail('资源不在预览范围内', 404);
    const file = await bounded(grant.root, name.startsWith('film-media/font-files/') ? 'fonts/' + path.basename(name) : name);
    if (/\.(?:html?|m?js|css|json|svg)$/i.test(file)) {
      const original = await readFile(file, 'utf8'), base = `/content/film/${req.params.token}/`;
      return reply.type(lookup(file) || 'text/plain').header('cache-control', 'no-store').send(mapDocumentResources({ text: original }, base).text);
    }
    reply.hijack(); await sendFile(req.raw, reply.raw, file);
  });
  api.addHook('onClose', async () => { closing = true; await Promise.all([processes.close(), ...[...services.values()].map(value => value.exports.close())]); grants.clear(); });
  return {
    /** A .motale stored as a film document under the caller's id, as the browser's own import saves it; an id already
     * stored in this scope is returned unchanged, so a host can import the same delivered cut again safely. */
    async importMotaleDocument(ctx: Context, bytes: Buffer, id: string): Promise<Snapshot> {
      const existing = await store.get(ctx, id).catch(() => undefined);
      if (existing) return existing;
      const film = filmFromMotale(await importMotale(ctx, bytes), { id, sourceId: randomUUID() });
      return store.create(ctx, filmEnvelope(film));
    },
  };
}
