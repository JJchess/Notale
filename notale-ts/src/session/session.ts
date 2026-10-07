import type { ModelRef } from '../adapters/models/selection.js';
import { appendFile, mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { AUTO_TITLE_MAX, normalizeTitle, TITLE_MAX } from '../core/title.js';

/** A conversation, kept the way pi keeps one: an append-only jsonl of what happened. What the
 * session has produced -- its artifacts -- are the runs it dispatched; a fix may only touch those. */
export type Entry =
  | { type: 'session'; id: string; createdAt: string }
  | { type: 'user'; model?: ModelRef; text: string; files: string[]; at: string }
  | { type: 'understood'; route: import('./understand.js').Route; at: string }
  | { type: 'run'; runId: string; kind: 'generate' | 'fix'; basedOn?: string; at: string }
  | { type: 'finished'; runId: string; status: string; at: string }
  | { type: 'reply'; text: string; at: string }
  | { type: 'question'; text: string; options?: string[]; at: string };

const ID = /^[0-9a-f-]{36}$/;
export interface SessionSummary {
  id: string; title: string; createdAt: string; updatedAt: string;
  archived: boolean; busy: boolean; versions: number; latestCompletedRunId?: string;
}
interface SessionMetadata { title?: string; archived?: boolean; updatedAt: string }
export interface SessionPatch { title?: string; archived?: boolean }
const badRequest = (message: string) => Object.assign(new Error(message), { status: 400 });

/** Separate from the transcript: renaming and shelving never rewrite a conversation. */
export function sessionPatch(value: unknown): SessionPatch {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw badRequest('需要会话信息');
  const input = value as Record<string, unknown>;
  if (!Object.keys(input).length || Object.keys(input).some(key => key !== 'title' && key !== 'archived')) throw badRequest('只能修改 title 和 archived');
  const patch: SessionPatch = {};
  if ('title' in input) {
    if (typeof input.title !== 'string' || !input.title.trim() || input.title.length > TITLE_MAX || /[\u0000-\u001f\u007f]/u.test(input.title)) throw badRequest(`标题不能为空，最长 ${TITLE_MAX} 字符`);
    patch.title = normalizeTitle(input.title)!;
  }
  if ('archived' in input) {
    if (typeof input.archived !== 'boolean') throw badRequest('archived 必须是布尔值');
    patch.archived = input.archived;
  }
  return patch;
}

export class Session {
  private queued: Promise<unknown> = Promise.resolve();
  constructor(readonly id: string, readonly dir: string, public entries: Entry[], private metadata?: SessionMetadata) {}
  /** A session's writes and turn admission share one queue. A rejected write does not poison it. */
  exclusive<T>(action: () => Promise<T> | T): Promise<T> {
    const result = this.queued.then(action);
    this.queued = result.catch(() => {});
    return result;
  }
  async append(entry: Entry) { return this.exclusive(async () => { await appendFile(join(this.dir, 'session.jsonl'), JSON.stringify(entry) + '\n'); this.entries.push(entry); }); }
  get archived() { return this.metadata?.archived ?? false; }
  summary(busy = false): SessionSummary {
    const first = this.entries.find(entry => entry.type === 'session');
    const createdAt = first?.createdAt ?? new Date(0).toISOString();
    const timestamps = this.entries.map(entry => entry.type === 'session' ? entry.createdAt : entry.at);
    const updatedAt = [...timestamps, this.metadata?.updatedAt ?? createdAt].sort().at(-1) ?? createdAt;
    const generated = this.entries.find(entry => entry.type === 'understood' && entry.route.action === 'generate' && entry.route.title?.trim());
    const initial = this.entries.find(entry => entry.type === 'user');
    const title = this.metadata?.title
      ?? (generated?.type === 'understood' && generated.route.action === 'generate' ? normalizeTitle(generated.route.title) : undefined)
      ?? (initial?.type === 'user' ? normalizeTitle(initial.text, AUTO_TITLE_MAX) : undefined) ?? '未命名讲义';
    const runs = this.runs;
    const latestCompletedRunId = runs.filter(run => run.status === 'completed').at(-1)?.runId;
    return { id: this.id, title, createdAt, updatedAt, archived: this.archived, busy, versions: runs.length, ...(latestCompletedRunId ? { latestCompletedRunId } : {}) };
  }
  async update(patch: SessionPatch, isBusy: () => boolean): Promise<SessionSummary> {
    return this.exclusive(async () => {
      if (patch.archived === true && isBusy()) throw Object.assign(new Error('请等待当前任务结束后再归档'), { status: 409, code: 'SESSION_BUSY' });
      const metadata: SessionMetadata = { ...this.metadata, ...patch, updatedAt: new Date().toISOString() };
      const temporary = join(this.dir, `.metadata-${randomUUID()}.tmp`);
      try {
        await writeFile(temporary, JSON.stringify(metadata) + '\n', { flag: 'wx', mode: 0o600 });
        await rename(temporary, join(this.dir, 'metadata.json'));
        this.metadata = metadata;
      } finally { await unlink(temporary).catch(() => {}); }
      return this.summary(isBusy());
    });
  }
  /** Runs this session produced, oldest first. */
  get artifacts() { return this.entries.flatMap(entry => entry.type === 'run' ? [entry] : []); }
  /** Each run with how it ended, if it has (a page reloading mid-run picks the live one up again). */
  get runs() {
    const ended = new Map(this.entries.flatMap(entry => entry.type === 'finished' ? [[entry.runId, entry.status] as const] : []));
    return this.artifacts.map(run => ({ ...run, ...(ended.has(run.runId) ? { status: ended.get(run.runId)! } : {}) }));
  }
  /** Files some message already carried: an upload is attached once. */
  get usedFiles() { return new Set(this.entries.flatMap(entry => entry.type === 'user' ? entry.files : [])); }
  /** Files the author attached that no dispatched turn has used yet -- a question about them is
   * still open, so the next message answers it with these files in hand. */
  get pendingFiles() {
    let pending: string[] = [];
    for (const entry of this.entries) {
      if (entry.type === 'user') pending = [...pending, ...entry.files];
      if (entry.type === 'run' || entry.type === 'reply') pending = [];
    }
    return pending;
  }
  /** The last few exchanges, as short text, for the model to read. */
  history(limit = 12) {
    return this.entries.flatMap(entry => {
      if (entry.type === 'user') return [`作者：${entry.text}`];
      if (entry.type === 'question') return [`你问：${entry.text}`];
      if (entry.type === 'reply') return [`你答：${entry.text}`];
      if (entry.type === 'run') return [`（已${entry.kind === 'generate' ? '生成' : '修改'}，产物 ${entry.runId}${entry.basedOn ? `，基于 ${entry.basedOn}` : ''}）`];
      return [];
    }).slice(-limit);
  }
}
export class SessionStore {
  private readonly open = new Map<string, Session>();
  private readonly loading = new Map<string, Promise<Session>>();
  constructor(readonly root: string) {}
  async create() {
    const id = randomUUID(), dir = join(this.root, id);
    await mkdir(join(dir, 'files'), { recursive: true });
    const session = new Session(id, dir, []);
    await session.append({ type: 'session', id, createdAt: new Date().toISOString() });
    this.open.set(id, session);
    return session;
  }
  async get(id: string) {
    if (!ID.test(id)) throw Object.assign(new Error('会话不存在'), { status: 404 });
    const cached = this.open.get(id);
    if (cached) return cached;
    let pending = this.loading.get(id);
    if (!pending) {
      pending = this.read(id).then(session => { this.open.set(id, session); return session; }).finally(() => this.loading.delete(id));
      this.loading.set(id, pending);
    }
    return pending;
  }
  private async read(id: string) {
    const dir = join(this.root, id);
    const text = await readFile(join(dir, 'session.jsonl'), 'utf8').catch(cause => {
      if ((cause as NodeJS.ErrnoException).code === 'ENOENT') throw Object.assign(new Error('会话不存在'), { status: 404 });
      throw cause;
    });
    const metadataText = await readFile(join(dir, 'metadata.json'), 'utf8').catch(cause => {
      if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw cause;
    });
    return new Session(id, dir, text.split('\n').filter(Boolean).map(line => JSON.parse(line) as Entry), metadataText ? JSON.parse(metadataText) as SessionMetadata : undefined);
  }
  async list(input: { q?: string; archived?: boolean; limit?: number; cursor?: string } = {}, isBusy: (id: string) => boolean = () => false) {
    const limit = input.limit ?? 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw badRequest('limit 必须是 1–100 的整数');
    const query = (input.q ?? '').trim().toLocaleLowerCase();
    if (query.length > 200) throw badRequest('搜索词过长');
    let cursor: { updatedAt: string; id: string } | undefined;
    if (input.cursor) {
      try {
        if (!/^[A-Za-z0-9_-]+$/.test(input.cursor) || input.cursor.length > 300) throw new Error();
        const parsed = JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8')) as Record<string, unknown>;
        if (typeof parsed.id !== 'string' || !ID.test(parsed.id) || typeof parsed.updatedAt !== 'string' || !Number.isFinite(Date.parse(parsed.updatedAt))) throw new Error();
        cursor = { id: parsed.id, updatedAt: parsed.updatedAt };
      } catch { throw badRequest('分页游标无效'); }
    }
    const dirs = await readdir(this.root, { withFileTypes: true }).catch(cause => {
      if ((cause as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw cause;
    });
    const all: SessionSummary[] = [];
    for (const dir of dirs) {
      if (!dir.isDirectory() || !ID.test(dir.name)) continue;
      // Cold history stays out of the live-session cache. Listing never creates metadata files.
      const session = this.open.get(dir.name) ?? await this.read(dir.name).catch(cause => {
        if ((cause as { status?: number }).status === 404) return undefined;
        throw cause;
      });
      if (!session) continue;
      const item = session.summary(isBusy(session.id));
      if (item.archived !== (input.archived ?? false) || !item.title.toLocaleLowerCase().includes(query)) continue;
      if (cursor && (item.updatedAt > cursor.updatedAt || (item.updatedAt === cursor.updatedAt && item.id >= cursor.id))) continue;
      all.push(item);
    }
    all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id));
    const items = all.slice(0, limit), last = items.at(-1);
    return { items, ...(all.length > limit && last ? { nextCursor: Buffer.from(JSON.stringify({ updatedAt: last.updatedAt, id: last.id })).toString('base64url') } : {}) };
  }
}
