import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

/** A conversation, kept the way pi keeps one: an append-only jsonl of what happened. What the
 * session has produced -- its artifacts -- are the runs it dispatched; a fix may only touch those. */
export type Entry =
  | { type: 'session'; id: string; createdAt: string }
  | { type: 'user'; text: string; files: string[]; at: string }
  | { type: 'understood'; route: import('./understand.js').Route; at: string }
  | { type: 'run'; runId: string; kind: 'generate' | 'fix'; basedOn?: string; at: string }
  | { type: 'finished'; runId: string; status: string; at: string }
  | { type: 'reply'; text: string; at: string }
  | { type: 'question'; text: string; options?: string[]; at: string };

const ID = /^[0-9a-f-]{36}$/;
export class Session {
  constructor(readonly id: string, readonly dir: string, public entries: Entry[]) {}
  async append(entry: Entry) { await appendFile(join(this.dir, 'session.jsonl'), JSON.stringify(entry) + '\n'); this.entries.push(entry); }
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
    const dir = join(this.root, id);
    const text = await readFile(join(dir, 'session.jsonl'), 'utf8').catch(() => { throw Object.assign(new Error('会话不存在'), { status: 404 }); });
    const session = new Session(id, dir, text.split('\n').filter(Boolean).map(line => JSON.parse(line) as Entry));
    this.open.set(id, session);
    return session;
  }
}
