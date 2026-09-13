import {causalBase} from '../domain/causal-base.js';
import {authorChanges, type AuthorChangeSet, type AuthorChangesPage, type SyncAcknowledgement} from '../domain/author-changes.js';
import {withStableIds} from '../domain/html.js';
import { mergeDocuments } from '../domain/sync-merge.js';
import { materializeLayout } from '../domain/layouts.js';
import { Pool, type PoolClient } from 'pg';
import { createHash } from 'node:crypto';
import { applyCommands, validateDocument } from '../domain/commands.js';
import {
  type DeckDocument,
  type Snapshot,
  type Commit,
  type Command,
  invariant,
  DomainError,
  documentSchema,
} from '../domain/model.js';
import { missingReferences, references, type Reference } from '../domain/resources.js';

export const sha256 = (value: string | Uint8Array) =>
  createHash('sha256').update(value).digest('hex');
export interface Context {
  actor: string;
  scope: string;
}
export interface AssetInput {
  data: Buffer;
  mime: string;
}
export class Store {
  constructor(
    public pool: Pool,
    private fault?: (stage: string) => void,
  ) {}
  async migrate() {
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      await c.query('SELECT pg_advisory_xact_lock(921704381)');
      await c.query(`
        CREATE TABLE IF NOT EXISTS editor_documents (
          id text PRIMARY KEY, scope text NOT NULL, head integer NOT NULL CHECK(head>0),
          created_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS editor_scope_idx ON editor_documents(scope);
        CREATE TABLE IF NOT EXISTS editor_revisions (
          document_id text NOT NULL REFERENCES editor_documents(id), version integer NOT NULL,
          document jsonb NOT NULL, actor text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY(document_id,version)
        );
        ALTER TABLE editor_revisions ADD COLUMN IF NOT EXISTS author_changes jsonb;
        CREATE TABLE IF NOT EXISTS editor_mutations (
          document_id text NOT NULL REFERENCES editor_documents(id), mutation_id text NOT NULL,
          actor text NOT NULL, request_hash text NOT NULL, version integer NOT NULL,
          PRIMARY KEY(document_id,mutation_id), FOREIGN KEY(document_id,version) REFERENCES editor_revisions(document_id,version)
        );
        CREATE TABLE IF NOT EXISTS editor_blobs (
          hash text PRIMARY KEY, data bytea NOT NULL, size integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS editor_revision_assets (
          document_id text NOT NULL,version integer NOT NULL,path text NOT NULL,hash text NOT NULL REFERENCES editor_blobs(hash),
          PRIMARY KEY(document_id,version,path), FOREIGN KEY(document_id,version) REFERENCES editor_revisions(document_id,version)
        );
        CREATE TABLE IF NOT EXISTS editor_preview_leases (
          token_hash text PRIMARY KEY, scope text NOT NULL, document_id text NOT NULL,
          version integer NOT NULL, expires_at timestamptz NOT NULL,
          FOREIGN KEY(document_id,version) REFERENCES editor_revisions(document_id,version) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS editor_preview_expiry_idx ON editor_preview_leases(expires_at);
        CREATE TABLE IF NOT EXISTS editor_uploads (
          scope text NOT NULL, hash text NOT NULL REFERENCES editor_blobs(hash), created_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY(scope,hash)
        );
      `);
      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }
  async transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const c = await this.pool.connect();
    try {
      await c.query('BEGIN');
      const result = await work(c);
      await c.query('COMMIT');
      return result;
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }
  private async requireDoc(c: Pool | PoolClient, ctx: Context, id: string, lock = false) {
    const result = await c.query(
      `SELECT * FROM editor_documents WHERE id=$1 AND scope=$2 ${lock ? 'FOR UPDATE' : ''}`,
      [id, ctx.scope],
    );
    invariant(result.rowCount, 'NOT_FOUND', 'Document not found', 404);
    return result.rows[0] as { id: string; head: number; scope: string };
  }
  /** Call only after host read authorization. Renewal keeps original URLs valid
   * across app instances without resetting an active browser runtime. */
  async renewPreview(ctx: Context, id: string, version: number, tokenHash: string) {
    await this.get(ctx, id, version);
    const result = await this.pool.query(
      `INSERT INTO editor_preview_leases(token_hash,scope,document_id,version,expires_at)
       VALUES($1,$2,$3,$4,clock_timestamp()+interval '1 hour')
       ON CONFLICT(token_hash) DO UPDATE SET expires_at=GREATEST(editor_preview_leases.expires_at,EXCLUDED.expires_at)
       WHERE editor_preview_leases.scope=EXCLUDED.scope AND editor_preview_leases.document_id=EXCLUDED.document_id AND editor_preview_leases.version=EXCLUDED.version
       RETURNING expires_at`,
      [tokenHash, ctx.scope, id, version],
    );
    invariant(result.rowCount, 'FORBIDDEN', 'Preview lease does not cover this revision', 403);
    // Expired tokens can be renewed only by an authorized host call, so deleting
    // old lease rows cannot grant content access or remove document history.
    await this.pool.query(
      "DELETE FROM editor_preview_leases WHERE expires_at<clock_timestamp()-interval '1 day'",
    );
    return (result.rows[0].expires_at as Date).getTime();
  }
  async previewActive(tokenHash: string, scope: string, id: string, version: number) {
    const result = await this.pool.query(
      'SELECT 1 FROM editor_preview_leases WHERE token_hash=$1 AND scope=$2 AND document_id=$3 AND version=$4 AND expires_at>clock_timestamp()',
      [tokenHash, scope, id, version],
    );
    return !!result.rowCount;
  }
  async upload(ctx: Context, input: AssetInput) {
    invariant(input.data.length <= 50_000_000, 'TOO_LARGE', 'Asset exceeds 50 MB', 413);
    const hash = sha256(input.data);
    await this.transaction(async (c) => {
      await c.query(
        'INSERT INTO editor_blobs(hash,data,size) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
        [hash, input.data, input.data.length],
      );
      await c.query('INSERT INTO editor_uploads(scope,hash) VALUES($1,$2) ON CONFLICT DO NOTHING', [
        ctx.scope,
        hash,
      ]);
    });
    return { hash, mime: input.mime, size: input.data.length };
  }
  async stylesheets(
    ctx: Context,
    doc: Pick<DeckDocument, 'assets'>,
    client: Pool | PoolClient = this.pool,
  ): Promise<Record<string, string>> {
    const assets = Object.entries(doc.assets).filter(
      ([path, a]) => /\.css$/i.test(path) || a.mime.startsWith('text/css'),
    );
    if (!assets.length) return {};
    const result = await client.query(
      'SELECT b.hash,b.data FROM editor_blobs b JOIN editor_uploads u ON u.hash=b.hash WHERE u.scope=$1 AND b.hash=ANY($2::text[])',
      [ctx.scope, assets.map(([, a]) => a.hash)],
    );
    const byHash = new Map<string, Buffer>(result.rows.map((r) => [r.hash, r.data]));
    return Object.fromEntries(
      assets
        .filter(([, a]) => byHash.has(a.hash))
        .map(([path, a]) => [path, byHash.get(a.hash)!.toString()]),
    );
  }
  private async saveRevision(c: PoolClient, ctx: Context, doc: DeckDocument, version: number) {
    const hashes = [...new Set(Object.values(doc.assets).map((a) => a.hash))];
    if (hashes.length) {
      const permitted = await c.query(
        'SELECT b.hash,b.size FROM editor_blobs b JOIN editor_uploads u ON u.hash=b.hash WHERE u.scope=$1 AND b.hash=ANY($2::text[])',
        [ctx.scope, hashes],
      );
      const found = new Map<string, number>(permitted.rows.map((r) => [r.hash, r.size]));
      invariant(
        Object.values(doc.assets).every((a) => found.get(a.hash) === a.size),
        'MISSING_ASSET',
        'An asset is missing, belongs to another scope, or has incorrect size',
      );
    }
    const textAssets = Object.entries(doc.assets).filter(
      ([path, a]) => /\.(css|html?)$/i.test(path) || /^(text\/css|text\/html)/.test(a.mime),
    );
    const refs: Reference[] = [];
    const cssAssets: Record<string, string> = {};
    if (textAssets.length) {
      const blobs = await c.query('SELECT hash,data FROM editor_blobs WHERE hash=ANY($1::text[])', [
        [...new Set(textAssets.map(([, a]) => a.hash))],
      ]);
      const data = new Map<string, Buffer>(blobs.rows.map((r) => [r.hash, r.data]));
      for (const [path, a] of textAssets) {
        if (/\.css$/i.test(path) || a.mime.startsWith('text/css'))
          cssAssets[path] = data.get(a.hash)!.toString();
        refs.push(
          ...references(
            path,
            data.get(a.hash)!.toString(),
            /\.css$/i.test(path) || a.mime.startsWith('text/css') ? 'css' : 'html',
          ),
        );
      }
    }
    const missing = missingReferences(doc, refs);
    invariant(
      !missing.length,
      'MISSING_RESOURCE',
      `Unresolved local resource: ${missing
        .slice(0, 5)
        .map((r) => `${r.from} → ${r.url}`)
        .join('; ')}`,
    );
    for (const layout of doc.layouts)
      materializeLayout(doc, { ...doc.slides[0], layoutId: layout.id }, false, cssAssets);
    await c.query(
      'INSERT INTO editor_revisions(document_id,version,document,actor) VALUES($1,$2,$3,$4)',
      [doc.id, version, doc, ctx.actor],
    );
    this.fault?.('after-revision');
    if (Object.keys(doc.assets).length)
      await c.query(
        `INSERT INTO editor_revision_assets(document_id,version,path,hash) SELECT $1,$2,x.path,x.hash FROM jsonb_to_recordset($3::jsonb) AS x(path text,hash text)`,
        [
          doc.id,
          version,
          JSON.stringify(Object.entries(doc.assets).map(([path, a]) => ({ path, hash: a.hash }))),
        ],
      );
    this.fault?.('after-assets');
  }
  async create(ctx: Context, input: DeckDocument): Promise<Snapshot> {
    const doc = validateDocument(input);
    try {
      await this.transaction(async (c) => {
        await c.query('INSERT INTO editor_documents(id,scope,head) VALUES($1,$2,1)', [
          doc.id,
          ctx.scope,
        ]);
        await this.saveRevision(c, ctx, doc, 1);
      });
    } catch (e) {
      if ((e as { code: string }).code === '23505')
        throw new DomainError('EXISTS', 'Document ID already exists', 409);
      throw e;
    }
    return this.get(ctx, doc.id, 1);
  }
  async get(ctx: Context, id: string, version?: number): Promise<Snapshot> {
    const result = await this.pool.query(
      `SELECT r.* FROM editor_documents d JOIN editor_revisions r ON r.document_id=d.id AND r.version=COALESCE($3::int,d.head) WHERE d.id=$1 AND d.scope=$2`,
      [id, ctx.scope, version ?? null],
    );
    invariant(result.rowCount, 'NOT_FOUND', 'Document or revision not found', 404);
    return this.toSnapshot(result.rows[0]);
  }
  private toSnapshot(row: {
    version: number;
    document: DeckDocument;
    created_at: Date;
    actor: string;
  }): Snapshot {
    return {
      version: row.version,
      document: documentSchema.parse(row.document),
      createdAt: row.created_at.toISOString(),
      actor: row.actor,
    };
  }
  async list(ctx: Context) {
    const r = await this.pool.query(
      `SELECT d.id,d.head AS version,r.document->>'title' AS title,jsonb_array_length(r.document->'slides') AS slides,r.created_at FROM editor_documents d JOIN editor_revisions r ON r.document_id=d.id AND r.version=d.head WHERE d.scope=$1 ORDER BY r.created_at DESC`,
      [ctx.scope],
    );
    return r.rows;
  }
  async history(ctx: Context, id: string) {
    await this.requireDoc(this.pool, ctx, id);
    const r = await this.pool.query(
      'SELECT version,actor,created_at FROM editor_revisions WHERE document_id=$1 ORDER BY version DESC',
      [id],
    );
    return r.rows;
  }
  async commit(ctx: Context, id: string, input: Commit) {
    // schemaVersion 1 previously parsed embedded slides without nativeCharts.
    // Accept that historical hash only when this additive field is empty; retain
    // the exact current hash for writes and all actor/content mismatch checks.
    const legacy = {
      ...input,
      commands: input.commands.map((command) => {
        const slide =
          command.type === 'slide.insert'
            ? command.slide
            : command.type === 'elements.transfer'
              ? command.sourceSnapshot
              : undefined;
        if (!slide?.nativeCharts || Object.keys(slide.nativeCharts).length) return command;
        const { nativeCharts: _empty, ...previous } = slide;
        return command.type === 'slide.insert'
          ? { ...command, slide: previous }
          : { ...command, sourceSnapshot: previous };
      }),
    };
    return this.change(
      ctx,
      id,
      input.baseVersion,
      input.mutationId,
      sha256(JSON.stringify(input)),
      async (doc, c) => {
        const assets = { ...doc.assets };
        for (const command of input.commands) {
          if (command.type === 'asset.put') assets[command.path] = command.asset;
          if (command.type === 'asset.remove') delete assets[command.path];
        }
        const stylesheets = input.commands.some((command) => command.type === 'layout.detach')
          ? await this.stylesheets(ctx, { assets }, c)
          : undefined;
        return applyCommands(doc, input.commands, { stylesheets });
      },
      [sha256(JSON.stringify(legacy))],
    );
  }
  async restore(
    ctx: Context,
    id: string,
    version: number,
    baseVersion: number,
    mutationId: string,
  ) {
    const target = await this.get(ctx, id, version);
    return this.change(
      ctx,
      id,
      baseVersion,
      mutationId,
      sha256(JSON.stringify({ restore: version, baseVersion })),
      () => target.document,
    );
  }
  async syncHead(ctx:Context,id:string){return {version:(await this.requireDoc(this.pool,ctx,id)).head};}
  async recoverSync(ctx:Context,id:string,input:Commit & {inverseVersion?:number;restoreVersion?:number}){
    const source=await this.get(ctx,id,input.baseVersion);
    // History recovery creates an isolated copy of the intended historical
    // state, without replaying an inverse onto the conflicting current head.
    const intended=input.inverseVersion?(await this.get(ctx,id,input.inverseVersion-1)).document
      :input.restoreVersion?(await this.get(ctx,id,input.restoreVersion)).document
      :applyCommands(source.document,input.commands);
    // Stable recovery identity makes repeated clicks/retries return the same copy.
    const recoveryId=input.mutationId;
    const exists=await this.pool.query('SELECT id FROM editor_documents WHERE id=$1 AND scope=$2',[recoveryId,ctx.scope]);
    if(exists.rowCount)return this.get(ctx,recoveryId);
    return this.create(ctx,{...intended,id:recoveryId,title:(intended.title+'（恢复副本）').slice(0,300)});
  }
  async revisionChanges(ctx: Context, id: string, version: number): Promise<AuthorChangeSet> {
    await this.requireDoc(this.pool,ctx,id);
    const row=await this.pool.query('SELECT author_changes,(SELECT mutation_id FROM editor_mutations m WHERE m.document_id=editor_revisions.document_id AND m.version=editor_revisions.version LIMIT 1) AS mutation_id FROM editor_revisions WHERE document_id=$1 AND version=$2',[id,version]);
    invariant(row.rowCount,'VERSION_NOT_FOUND','变化版本不存在',404);
    if(row.rows[0].author_changes)return row.rows[0].author_changes;
    const before=await this.get(ctx,id,version-1),after=await this.get(ctx,id,version);
    const change={...authorChanges(before,after),mutationId:row.rows[0].mutation_id??undefined};
    await this.pool.query('UPDATE editor_revisions SET author_changes=$3 WHERE document_id=$1 AND version=$2 AND author_changes IS NULL',[id,version,change]);
    return change;
  }
  async changes(ctx: Context,id: string,after: number): Promise<AuthorChangesPage> {
    const head=await this.requireDoc(this.pool,ctx,id);
    invariant(after<=head.head,'VERSION_CONFLICT','编辑版本超过服务器版本',409);
    const through=Math.min(head.head,after+100),changes:AuthorChangeSet[]=[];
    for(let version=after+1;version<=through;version++)changes.push(await this.revisionChanges(ctx,id,version));
    return {changes,headVersion:head.head,throughVersion:through,hasMore:through<head.head};
  }
  async prepareSync(ctx:Context,id:string,input:Commit) {
    const source=await this.get(ctx,id,input.baseVersion);
    const stylesheets=input.commands.some(c=>c.type==='layout.detach')?await this.stylesheets(ctx,source.document):undefined;
    const document=withStableIds(input.mutationId,()=>applyCommands(source.document,input.commands,{stylesheets}));
    return authorChanges(source,{...source,document});
  }
  async syncV2(ctx:Context,id:string,input:Commit & {dependencies?:string[];inverseVersion?:number;restoreVersion?:number;geometry?:boolean;inverseMutationId?:string}):Promise<SyncAcknowledgement> {
    const {inverseMutationId,...request}=input;
    if(inverseMutationId){
      await this.requireDoc(this.pool,ctx,id);
      const row=await this.pool.query('SELECT version,actor FROM editor_mutations WHERE document_id=$1 AND mutation_id=$2',[id,inverseMutationId]);
      invariant(row.rowCount&&row.rows[0].actor===ctx.actor,'VERSION_NOT_FOUND','待撤销操作尚未确认',409);
      request.inverseVersion=row.rows[0].version;
    }
    const snapshot=await this.sync(ctx,id,request);
    return {mutationId:input.mutationId,committedVersion:snapshot.version,change:await this.revisionChanges(ctx,id,snapshot.version)};
  }
  async sync(ctx:Context,id:string,input:Commit & {dependencies?:string[];inverseVersion?:number;restoreVersion?:number;geometry?:boolean}) {
    return this.change(ctx,id,input.baseVersion,input.mutationId,sha256(JSON.stringify(input)),async(base,c)=>{
      if(input.restoreVersion){const target=await c.query('SELECT document FROM editor_revisions WHERE document_id=$1 AND version=$2',[id,input.restoreVersion]);invariant(target.rowCount,'VERSION_NOT_FOUND','恢复版本不存在',404);return target.rows[0].document;}
      if(input.inverseVersion){
        const rows=await c.query('SELECT version,document FROM editor_revisions WHERE document_id=$1 AND version=ANY($2::int[])',[id,[input.inverseVersion-1,input.inverseVersion]]);
        invariant(rows.rowCount===2,'VERSION_NOT_FOUND','撤销所需的版本不存在',404);
        return mergeDocuments(rows.rows.find(r=>r.version===input.inverseVersion).document,rows.rows.find(r=>r.version===input.inverseVersion!-1).document,base);
      }
      const stylesheets=input.commands.some(c=>c.type==='layout.detach')?await this.stylesheets(ctx,base,c):undefined;
      const latest=await c.query('SELECT r.document FROM editor_documents d JOIN editor_revisions r ON r.document_id=d.id AND r.version=d.head WHERE d.id=$1',[id]);
      // Locks and structural preconditions must also hold on the current head.
      try{withStableIds(input.mutationId,()=>applyCommands(latest.rows[0].document,input.commands,{stylesheets}));}catch(error){if(error instanceof DomainError)throw new DomainError('SYNC_RECOVERY_REQUIRED',error.message,409);throw error;}
      return withStableIds(input.mutationId,()=>applyCommands(base,input.commands,{stylesheets}));
    },input.restoreVersion?[sha256(JSON.stringify({restore:input.restoreVersion,baseVersion:input.baseVersion}))]:[],true,(doc)=>applyCommands(doc,input.commands.flatMap<Command>(c=>c.type==='element.patch'?(c.patch.style||c.patch.attributes?[{...c,patch:{...(c.patch.style?{style:c.patch.style}:{}),...(c.patch.attributes?{attributes:c.patch.attributes}:{})}}]:[]):input.geometry&&c.type==='element.transform'?[c]:[])),async(source,c)=>{
      if(!input.dependencies?.length)return source;
      const ids=[...new Set(input.dependencies)];
      invariant(!ids.includes(input.mutationId),'INVALID_DEPENDENCY','操作不能依赖自身',409);
      const revisions=await c.query('SELECT m.mutation_id,m.actor,m.version,b.document AS before,a.document AS after FROM editor_mutations m JOIN editor_revisions a ON a.document_id=m.document_id AND a.version=m.version JOIN editor_revisions b ON b.document_id=m.document_id AND b.version=m.version-1 WHERE m.document_id=$1 AND m.mutation_id=ANY($2::text[]) ORDER BY m.version',[id,ids]);
      invariant(revisions.rowCount===ids.length&&revisions.rows.every(row=>row.actor===ctx.actor),'DEPENDENCY_NOT_READY','前序操作尚未确认，修改仍保留在本机',409);
      return causalBase(source,input.baseVersion,revisions.rows);
    });
  }
  private async change(
    ctx: Context,
    id: string,
    base: number,
    mutationId: string,
    hash: string,
    apply: (doc: DeckDocument, client: PoolClient) => DeckDocument | Promise<DeckDocument>,
    compatibleHashes: string[] = [],
    mergeConcurrent = false,
    finishMerge?: (doc:DeckDocument)=>DeckDocument,
    projectBase?: (doc:DeckDocument,client:PoolClient)=>Promise<DeckDocument>,
  ) {
    const version = await this.transaction(async (c) => {
      const row = await this.requireDoc(c, ctx, id, true);
      const duplicate = await c.query(
        'SELECT * FROM editor_mutations WHERE document_id=$1 AND mutation_id=$2',
        [id, mutationId],
      );
      if (duplicate.rowCount) {
        const previous = duplicate.rows[0];
        invariant(
          (previous.request_hash === hash || compatibleHashes.includes(previous.request_hash)) &&
            previous.actor === ctx.actor,
          'IDEMPOTENCY_MISMATCH',
          'Mutation ID was used for a different request',
          409,
        );
        return previous.version as number;
      }
      if (row.head !== base && !mergeConcurrent)
        throw new DomainError(
          'VERSION_CONFLICT',
          `Expected version ${base}, current version is ${row.head}`,
          409,
          { currentVersion: row.head },
        );
      const current = await c.query(
        'SELECT document FROM editor_revisions WHERE document_id=$1 AND version=$2',
        [id, base],
      );
      invariant(current.rowCount,'VERSION_NOT_FOUND','编辑基准版本不存在',404);
      const source=projectBase?await projectBase(current.rows[0].document,c):current.rows[0].document;
      const intended=await apply(source,c);
      const head=row.head===base?source:(await c.query('SELECT document FROM editor_revisions WHERE document_id=$1 AND version=$2',[id,row.head])).rows[0].document;
      const combined=row.head===base?intended:mergeDocuments(source,intended,head);
      let next:DeckDocument;
      try { next=validateDocument(finishMerge?finishMerge(combined):combined); }
      catch(error){
        // A concurrent relationship can reference an object removed by this
        // transaction. Preserve the operation for recovery instead of leaving
        // the client permanently blocked on an unretryable validation error.
        if(mergeConcurrent&&error instanceof DomainError&&error.code==='DANGLING_OBJECT')
          throw new DomainError('SYNC_RECOVERY_REQUIRED','对象引用已被其他修改改变，操作已保留供恢复',409);
        throw error;
      }
      const version = row.head + 1;
      await this.saveRevision(c, ctx, next, version);
      const delta={...authorChanges({document:head,version:row.head} as Snapshot,{document:next,version} as Snapshot),mutationId};
      await c.query('UPDATE editor_revisions SET author_changes=$3 WHERE document_id=$1 AND version=$2',[id,version,delta]);
      await c.query('UPDATE editor_documents SET head=$1 WHERE id=$2 AND head=$3', [
        version,
        id,
        row.head,
      ]);
      await c.query(
        'INSERT INTO editor_mutations(document_id,mutation_id,actor,request_hash,version) VALUES($1,$2,$3,$4,$5)',
        [id, mutationId, ctx.actor, hash, version],
      );
      this.fault?.('before-commit');
      return version;
    });
    return this.get(ctx, id, version);
  }
  async asset(ctx: Context, id: string, version: number, path: string) {
    await this.requireDoc(this.pool, ctx, id);
    const result = await this.pool.query(
      `SELECT b.data,b.hash,b.size FROM editor_revision_assets a JOIN editor_blobs b ON b.hash=a.hash WHERE a.document_id=$1 AND a.version=$2 AND a.path=$3`,
      [id, version, path],
    );
    invariant(result.rowCount, 'NOT_FOUND', 'Asset not found in this revision', 404);
    return result.rows[0] as { data: Buffer; hash: string; size: number };
  }
}
