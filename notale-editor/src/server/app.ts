import {readCourse,prepareCourse} from './code-lessons.js';
import {describeMessage} from '../i18n/index.js';
import {runtimeIdentity,authorIdentity} from '../domain/page-identity.js';
import {PosterService} from './posters.js';
import {resolve} from 'node:path';
import { inspectSourceScenes } from '../domain/source-scenes.js';
import { byteRange } from './range.js';
import Fastify, { type FastifyRequest, type FastifyInstance } from 'fastify';
import { createHmac, timingSafeEqual, randomUUID, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { strToU8 } from 'fflate';
import { NOTALE_FORMAT, encodeArchive, decodeArchive, notaleFilename } from './notale-archive.js';
import { lookup } from 'mime-types';
import { Store, sha256, type Context } from './store.js';
import { commitSchema, documentSchema, DomainError, filePath, invariant } from '../domain/model.js';
import { inspectSlide, describePageRuntime } from '../domain/html.js';
import { renderSlide, playerHtml } from './render.js';
import { createAiRuntime, ModelRegistry, type AiRuntime } from './ai-model.js';
import { mediaCall, mediaAvailability, IMAGE_TOOL_SCHEMAS } from './media/index.js';
import { runTurn, type AiStep } from './agent/run.js';
import { SessionStore, SandboxPool } from './agent/session.js';
import { diffDocuments } from '../domain/document-diff.js';
import { draftFile, renderDraftPage } from './agent/draft-renderer.js';

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
  ai?: AiRuntime;
  models?: ModelRegistry;
}
export function createApps(options: AppOptions) {
  const api = options.api ?? Fastify({ logger: options.logger ?? false, bodyLimit: 75_000_000 });
  const content = Fastify({
    logger: options.logger ?? false,
    routerOptions: { maxParamLength: 2048 },
  });
  api.addContentTypeParser('application/octet-stream', { parseAs: 'buffer', bodyLimit: 75_000_000 }, (_req, body, done) => done(null, body));
  const { store, integration } = options;
  const ai = options.ai ?? createAiRuntime();
  const models = options.models ?? new ModelRegistry();
  const posters=new PosterService(process.env.EDITOR_POSTER_DIR);
  api.addHook('onClose',async()=>posters.close());
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
          .send({ error: error.code, message: error.message, details: error.details, ...describeMessage(error.message) });
      if (error instanceof z.ZodError)
        return reply.code(400).send({ error: 'VALIDATION', issues: error.issues, messageKey:'输入无效，请检查填写的内容' });
      const httpError = error as { statusCode?: number; code?: string; message: string };
      if (
        error instanceof Error &&
        httpError.statusCode &&
        httpError.statusCode >= 400 &&
        httpError.statusCode < 500
      )
        return reply
          .code(httpError.statusCode)
          .send({ error: httpError.code ?? 'INVALID_REQUEST', message: error.message, ...describeMessage(error.message) });
      req.log.error(error);
      return reply.code(500).send({
        error: 'INTERNAL',
        message: 'Operation failed; no partial revision was committed',messageKey:'操作失败；未提交任何部分修改',
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
  const courseParams = '/api/documents/:id/slides/:slideId/code/:target';
  api.get<{Params:{id:string;slideId:string;target:string};Querystring:{version?:string}}>(courseParams,async req=>{
    const {id,slideId,target}=req.params;
    const value=await readCourse(store,await context(req,'read',id),id,slideId,target,req.query.version?z.coerce.number().int().positive().parse(req.query.version):undefined);
    return {lesson:value.lesson,sources:value.sources,version:value.snapshot.version};
  });
  const courseSource=z.string().max(200000);
  const courseInput=z.object({expectedEntry:z.string(),expectedRevision:z.string(),sources:z.object({'starter.py':courseSource,'observe.py':courseSource,'tests.py':courseSource,'view/render.js':courseSource}).strict(),preview:z.object({sourceRevision:z.string(),runtimeRevision:z.string(),initialStep:z.unknown()}).strict().optional()}).strict();
  api.post<{Params:{id:string;slideId:string;target:string}}>(courseParams+'/prepare',{bodyLimit:5_000_000},async req=>{
    const {id,slideId,target}=req.params;
    return prepareCourse(store,await context(req,'edit',id),id,slideId,target,courseInput.parse(req.body));
  });
  api.get<{Params:{id:string}}>('/api/documents/:id/sync-head',async req=>store.syncHead(await context(req,'read',req.params.id),req.params.id));
  const syncSchema=commitSchema.extend({commands:z.array(commitSchema.shape.commands.element).max(500),geometry:z.boolean().optional(),inverseVersion:z.number().int().min(2).optional(),restoreVersion:z.number().int().positive().optional()}).refine(v=>!!v.inverseVersion||!!v.restoreVersion||v.commands.length>0).refine(v=>!(v.inverseVersion&&v.restoreVersion)).refine(v=>!v.commands.length||(!v.inverseVersion&&!v.restoreVersion));
  api.post<{ Params: { id: string } }>('/api/documents/:id/sync-recovery',async req=>{
    const ctx=await context(req,'edit',req.params.id);await context(req,'create');return store.recoverSync(ctx,req.params.id,syncSchema.parse(req.body));
  });
  api.get<{Params:{id:string};Querystring:{after:string}}>('/api/documents/:id/changes',async req=>
    store.changes(await context(req,'read',req.params.id),req.params.id,z.coerce.number().int().positive().parse(req.query.after)));
  api.post<{Params:{id:string}}>('/api/documents/:id/prepare',async req=>
    store.prepareSync(await context(req,'edit',req.params.id),req.params.id,commitSchema.parse(req.body)));
  // A candidate, never a commit: the author applies it from the editor, or discards it.
  api.get('/api/ai/status',async()=>({available:ai.available,reason:ai.reason,model:ai.model.id,...describeMessage(ai.reason??''),tools:mediaAvailability()}));
  // A conversation is a session (pi's transcript + a sandbox + a review baseline); the deck it
  // edits is the document itself, and review is that document against the session's baseline.
  const sessions=new SessionStore(),sandboxes=new SandboxPool();
  void sandboxes.sweep();
  api.addHook('onClose',async()=>sandboxes.close());
  // Which services this server can reach and the models each key can use (pi's model picker lists
  // only what has auth; one without a key is shown, disabled, so the author knows it exists).
  api.get('/api/ai/models',async()=>({default:{provider:'google',id:ai.model.id},providers:await models.list()}));
  const aiTurnSchema=z.object({sessionId:z.string().uuid().optional(),slideId:z.string().min(1).max(100),instruction:z.string().min(1).max(20_000),targets:z.array(z.string().min(1).max(100)).max(200).default([]),
    model:z.object({provider:z.string().min(1).max(64),id:z.string().min(1).max(200)}).optional(),
    // Pictures the author attaches for the model to look at: a few, of the formats it reads, each ≤5 MB.
    images:z.array(z.object({mime:z.enum(['image/png','image/jpeg','image/webp']),data:z.string().max(7_000_000).regex(/^[A-Za-z0-9+/]+={0,2}$/)})).max(4).default([])});
  api.get<{Params:{id:string;sid:string}}>('/api/documents/:id/ai-sessions/:sid/review',async req=>{
    const ctx=await context(req,'read',req.params.id),session=await sessions.get(req.params.id,req.params.sid);
    const head=await store.get(ctx,req.params.id),base=await store.get(ctx,req.params.id,session.reviewBase);
    const commands=diffDocuments(base.document,head.document);
    // Each touched page's objects at both ends, described the same way, so the list can say "from → to".
    const touched=new Set(commands.flatMap(c=>'slideId' in c&&typeof c.slideId==='string'?[c.slideId]:[]));
    const objects=(doc:typeof head.document)=>Object.fromEntries(doc.slides.filter(s=>touched.has(s.id)).map(s=>[s.id,inspectSlide(s)]));
    return {reviewBase:session.reviewBase,version:head.version,commands,before:objects(base.document),after:objects(head.document)};
  });
  api.post<{Params:{id:string;sid:string}}>('/api/documents/:id/ai-sessions/:sid/accept',async req=>{
    const ctx=await context(req,'edit',req.params.id),session=await sessions.get(req.params.id,req.params.sid);
    const {version}=z.object({version:z.number().int().positive()}).parse(req.body);
    invariant(version<=(await store.get(ctx,req.params.id)).version,'VERSION_NOT_FOUND','版本不存在',404);
    await session.setReviewBase(version);
    return {reviewBase:session.reviewBase};
  });
  api.post<{Params:{id:string;sid:string}}>('/api/documents/:id/ai-sessions/:sid/discard',async req=>{
    const ctx=await context(req,'edit',req.params.id),session=await sessions.get(req.params.id,req.params.sid);
    const head=await store.get(ctx,req.params.id);
    if(head.version===session.reviewBase)return {version:head.version};
    // Back to the baseline, like git checkout: everything since, whoever made it, goes. One commit, undoable.
    const restored=await store.restore(ctx,req.params.id,session.reviewBase,head.version,randomUUID());
    return {version:restored.version};
  });
  // Stop is its own request, like pi's RPC abort and Codex's turn/interrupt: the turn's stream keeps
  // going to its result line, and this answers once the turn has committed and saved.
  api.post<{Params:{id:string;sid:string}}>('/api/documents/:id/ai-sessions/:sid/interrupt',async req=>{
    await context(req,'edit',req.params.id);
    await (await sessions.get(req.params.id,req.params.sid)).interrupt();
    return {};
  });
  api.delete<{Params:{id:string;sid:string}}>('/api/documents/:id/ai-sessions/:sid',async req=>{
    await context(req,'edit',req.params.id);await sessions.get(req.params.id,req.params.sid);
    await sandboxes.release(req.params.sid);
    return {closed:true};
  });
  api.post<{Params:{id:string}}>('/api/documents/:id/ai-edits',{bodyLimit:32_000_000},async(req,reply)=>{
    const ctx=await context(req,'edit',req.params.id);
    const turnRequest=aiTurnSchema.parse(req.body);
    const runtime=turnRequest.model?await models.runtime(turnRequest.model):ai;
    invariant(!turnRequest.images.length||runtime.vision,'AI_MODEL_NO_VISION','这个模型看不了图片',400);
    const session=turnRequest.sessionId?await sessions.get(req.params.id,turnRequest.sessionId):await sessions.create(req.params.id,(await store.get(ctx,req.params.id)).version);
    if(turnRequest.model&&JSON.stringify(turnRequest.model)!==JSON.stringify(session.model))await session.setModel(turnRequest.model);
    reply.hijack();
    reply.raw.writeHead(200,{'content-type':'application/x-ndjson; charset=utf-8','cache-control':'no-store'});
    let closed=false;
    // The author pressing stop closes the connection; that has to stop the model too.
    const gone=new AbortController();
    reply.raw.on('close',()=>{closed=true;gone.abort();});
    const write=(line:unknown)=>{if(closed)return;try{reply.raw.write(JSON.stringify(line)+'\n');}catch{closed=true;}};
    const report=(step:AiStep)=>write({type:'step',...step,...describeMessage(step.label),...(step.chip&&!step.label.startsWith('请求模型')?{chipMessage:describeMessage(step.chip)}:{}),...(step.detail?{detailMessages:step.detail.map(value=>describeMessage(value)??null)}:{})});
    // Streamed as newline-delimited JSON: the session, one line per step, then a result/error line.
    // Auth and body validation happen before the stream starts, so those fail as ordinary 4xx.
    try{
      write({type:'session',id:session.id,reviewBase:session.reviewBase});
      const open=mediaAvailability();
      const result=await runTurn(turnRequest,{
        runtime,session,signal:gone.signal,report,mutationId:()=>randomUUID(),
        text:delta=>write(delta===null?{type:'text',reset:true}:{type:'text',delta}),
        sandbox:s=>sandboxes.get(s.id,s.workspace),
        snapshot:()=>store.get(ctx,req.params.id),
        commit:async commit=>({version:(await store.sync(ctx,req.params.id,commit)).version}),
        render:input=>renderDraft(ctx,input),
        blob:hash=>store.blob(ctx,hash),
        upload:(data,mime)=>store.upload(ctx,{data,mime}),
        media:{tools:IMAGE_TOOL_SCHEMAS.filter(spec=>spec.name==='ImageSearch'?open.imageSearch.available:open.imageGen.available),
          call:async(name,args,outDir,signal)=>{const out=await mediaCall(name,args,outDir,{},signal);return {text:out.text,images:out.images.map(image=>({path:image.path,bytes:image.bytes}))};}},
      });
      write({type:'result',sessionId:session.id,reviewBase:session.reviewBase,...result});
    }catch(cause){
      const domain=cause instanceof DomainError?cause:new DomainError('INTERNAL',cause instanceof Error?cause.message:String(cause),500);
      // After a stop the stream is gone; the log is the only place this failure shows up.
      if(!(cause instanceof DomainError))req.log.error({err:cause},'ai turn failed');
      write({type:'error',error:domain.code,message:domain.message,...describeMessage(domain.message)});
    }finally{
      reply.raw.end();
    }
  });
  const editSchema=commitSchema.extend({dependencies:z.array(commitSchema.shape.mutationId).max(500).optional(),commands:z.array(commitSchema.shape.commands.element).max(500),geometry:z.boolean().optional(),inverseVersion:z.number().int().min(2).optional(),restoreVersion:z.number().int().positive().optional(),inverseMutationId:commitSchema.shape.mutationId.optional()}).refine(v=>Number(!!v.inverseVersion)+Number(!!v.restoreVersion)+Number(!!v.inverseMutationId)+(v.commands.length?1:0)===1);
  api.post<{Params:{id:string}}>('/api/documents/:id/edits',async req=>
    store.syncEdits(await context(req,'edit',req.params.id),req.params.id,editSchema.parse(req.body)));
  api.post<{ Params: { id: string } }>('/api/documents/:id/sync', async req =>
    store.sync(await context(req,'edit',req.params.id),req.params.id,
      syncSchema.parse(req.body)));
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
          contentKey:sha256(authorIdentity(snapshot.document,s)),
          runtimeKey:sha256(runtimeIdentity(snapshot.document,s)),
          objectIndexKey:sha256(JSON.stringify(s)),
          posterUrl:`/api/documents/${req.params.id}/slides/${s.id}/poster?version=${snapshot.version}`,
          url: base + s.sourcePath.split('/').map(encodeURIComponent).join('/'),
        })),
      };
    },
  );
  // The poster cache is content-addressed. The AI edit asks for the same key the sidebar
  // thumbnails do, so a page the rail has already rendered costs nothing to attach.
  function posterFor(ctx:Context,snapshot:{version:number;document:import('../domain/model.js').DeckDocument},slide:import('../domain/model.js').Slide,step=0){
    const doc=snapshot.document,key=sha256(JSON.stringify(['poster-5',step,ctx.scope,doc.id,slide,doc.width,doc.height,doc.theme,doc.layouts.find(layout=>layout.id===slide.layoutId),doc.assets]));
    return {key,bytes:posters.request(key,async()=>{
      const token=capability(ctx,doc.id,snapshot.version);
      await store.renewPreview(ctx,doc.id,snapshot.version,sha256(token));
      const url=`${options.contentOrigin}/content/${token}/${doc.id}/${snapshot.version}/${slide.sourcePath.split('/').map(encodeURIComponent).join('/')}?notaleMode=poster`;
      return {key,url,width:doc.width,height:doc.height,step};})};
  }
  // An AI run's working copy exists only in memory. It is rendered through a short-lived token
  // that names the document itself rather than a stored version; assets resolve by hash.
  const drafts=new Map<string,{ctx:Context;document:import('../domain/model.js').DeckDocument;expires:number}>();
  const renderDraft=(ctx:Context,input:Parameters<typeof renderDraftPage>[3])=>renderDraftPage(posters,ctx.scope,document=>{
    const now=Date.now();for(const [token,entry] of drafts)if(entry.expires<now)drafts.delete(token);
    const token=randomBytes(24).toString('base64url');drafts.set(token,{ctx,document,expires:now+120_000});
    return `${options.contentOrigin}/content/draft/${token}/`;
  },input);
  content.get<{Params:{token:string;'*':string}}>('/content/draft/:token/*',async(req,reply)=>{
    const entry=drafts.get(req.params.token),path=filePath.parse(req.params['*']);
    invariant(entry&&entry.expires>Date.now(),'FORBIDDEN','Draft expired',403);
    reply.header('Referrer-Policy','no-referrer').header('X-Content-Type-Options','nosniff').header('Cache-Control','no-store');
    const {ctx,document}=entry;
    const file=await draftFile(document,path,{blob:hash=>store.blob(ctx,hash),stylesheets:doc=>store.stylesheets(ctx,doc),runtimeDir:process.env.EDITOR_RUNTIME_DIR??'dist'});
    invariant(file,'NOT_FOUND','File not found',404);
    return reply.type(file.type).send(file.body);
  });
  api.get<{Params:{id:string;pageId:string};Querystring:{version?:string;step?:string}}>('/api/documents/:id/slides/:pageId/poster',async(req,reply)=>{
    const ctx=await context(req,'read',req.params.id),snapshot=await store.get(ctx,req.params.id,req.query.version?z.coerce.number().int().positive().parse(req.query.version):undefined);
    const slide=snapshot.document.slides.find(page=>page.id===req.params.pageId);invariant(slide,'NOT_FOUND','Page not found',404);
    const step=z.coerce.number().int().min(0).max(10000).parse(req.query.step??0);
    const {key,bytes:pending}=posterFor(ctx,snapshot,slide,step);const bytes=await pending;
    reply.header('Cache-Control','private, no-cache');
    if(!bytes)return reply.code(202).header('Retry-After','1').send({status:'pending',key});
    return reply.header('ETag',`"${key}"`).type('image/webp').send(bytes);
  });
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
      if(path==='__notale_runtime__/bridge.js'||path==='__notale_runtime__/chart-engine.js'){
        const bytes=await readFile(resolve(process.env.EDITOR_RUNTIME_DIR??'dist',path.split('/').at(-1)!));
        const etag=`"${sha256(bytes)}"`;
        reply.type('text/javascript; charset=utf-8').header('ETag',etag).header('Cache-Control','private, max-age=0, must-revalidate').header('X-Content-Type-Options','nosniff');
        // Capability/lease validation above still runs for conditional requests.
        if(req.headers['if-none-match']===etag)return reply.code(304).send();
        return reply.send(bytes);
      }
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
              (req.query as Record<string,string>).notaleMode==='edit'?'edit':(req.query as Record<string,string>).notaleMode==='poster'?'poster':'play',
            ),
          );
      const metadata = snapshot.document.assets[path];
      invariant(metadata, 'NOT_FOUND', 'File not found', 404);
      const etag = `"${metadata.hash}"`;
      reply.type(metadata.mime).header('ETag', etag).header('Accept-Ranges', 'bytes').header('Cache-Control', 'private, max-age=0, must-revalidate');
      // The scoped revision contains the immutable asset hash; a cache hit needs no blob read.
      if (req.headers['if-none-match'] === etag) return reply.code(304).send();
      const asset = await store.asset(ctx, id, version, path);
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
  api.get<{ Params: { id: string }; Querystring: { version?: string; locale?: string } }>(
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
        'notale-project.json': strToU8(JSON.stringify({ ...NOTALE_FORMAT, document: snapshot.document, pageRuntimes: Object.fromEntries(snapshot.document.slides.map(slide => [slide.id, describePageRuntime(slide,snapshot.document)])) })),
        'index.html': strToU8(playerHtml(snapshot.document,z.enum(['zh-CN','en-US']).default('zh-CN').parse(req.query.locale))),
      };
      const usedPaths = new Set([...Object.keys(files), ...Object.keys(snapshot.document.assets), ...snapshot.document.slides.map(slide => slide.sourcePath)]);
      let noticePath = 'notale-runtime-notices.txt', suffix = 2;
      while (usedPaths.has(noticePath)) noticePath = `notale-runtime-notices-${suffix++}.txt`;
      files[noticePath] = new Uint8Array(await readFile(resolve(process.env.EDITOR_RUNTIME_DIR ?? 'dist', 'runtime-notices.txt')));
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
          `attachment; filename="Notale.notale"; filename*=UTF-8''${encodeURIComponent(notaleFilename(snapshot.document.title))}`,
        )
        .send(Buffer.from(await encodeArchive(files)));
    },
  );
  api.post('/api/import', async (req, reply) => {
    const ctx = await context(req, 'create');
    invariant(Buffer.isBuffer(req.body), 'INVALID_PROJECT', 'Upload a binary Notale file');
    const { document: doc, files } = await decodeArchive(req.body);
    doc.id = randomUUID();
    for (const [path, a] of Object.entries(doc.assets)) {
      invariant(files[path], 'MISSING_ASSET', `Missing ${path}`);
      const data = Buffer.from(files[path]);
      invariant(sha256(data)===a.hash && data.length===a.size,'ASSET_HASH_MISMATCH',`Corrupt asset ${path}`);
      const uploaded = await store.upload(ctx, { data, mime: a.mime });
      invariant(
        uploaded.hash === a.hash && uploaded.size === a.size,
        'ASSET_HASH_MISMATCH',
        `Corrupt asset ${path}`,
      );
      doc.assets[path]=uploaded;
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
