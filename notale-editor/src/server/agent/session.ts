import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, resolve } from 'node:path';
import { DomainError, identifier, invariant } from '../../domain/model.js';
import type { AgentMessage } from './pi/index.js';
import { openSandbox, type Sandbox } from './sandbox.js';

/** A conversation about one deck, kept the way pi keeps a session: every message (tool calls and
 * results included) in an append-only jsonl file, so the next instruction continues the real
 * transcript instead of a summary of it. A session also owns the review baseline -- the document
 * version everything since is "unreviewed" against (Codex's working tree vs. its git base) -- and
 * a workspace directory the sandbox mounts for the whole conversation. */
type Entry =
  | { type: 'session'; id: string; documentId: string; reviewBase: number; createdAt: string }
  | { type: 'message'; message: AgentMessage }
  | { type: 'compaction'; messages: AgentMessage[] }
  | { type: 'review'; base: number }
  | { type: 'model'; provider: string; id: string };

const SESSION_ID = /^[0-9a-f-]{36}$/;

export class Session {
  running = false;
  /** The model the author last picked in this conversation (pi records a model change the same way). */
  model: { provider: string; id: string } | undefined;
  /** The turn in flight, if any: how to stop it and when it has fully settled (edits committed). */
  turn: { abort: () => void; settled: Promise<void> } | undefined;
  constructor(
    readonly id: string,
    readonly documentId: string,
    public reviewBase: number,
    public messages: AgentMessage[],
    private readonly file: string,
    readonly workspace: string,
  ) {}
  private async write(entry: Entry) { await appendFile(this.file, JSON.stringify(entry) + '\n'); }
  async append(messages: readonly AgentMessage[]) {
    for (const message of messages) await this.write({ type: 'message', message });
    this.messages = [...this.messages, ...messages];
  }
  /** After compaction the transcript restarts from the compacted list; earlier lines stay in the file. */
  async replace(messages: AgentMessage[]) { await this.write({ type: 'compaction', messages }); this.messages = messages; }
  /** Stops the running turn and waits until it has committed and saved its transcript. */
  async interrupt() {
    const turn = this.turn;
    invariant(turn, 'AI_NO_ACTIVE_TURN', '没有进行中的一轮', 409);
    turn.abort();
    await turn.settled;
  }
  async setModel(model: { provider: string; id: string }) { await this.write({ type: 'model', ...model }); this.model = model; }
  async setReviewBase(base: number) { await this.write({ type: 'review', base }); this.reviewBase = base; }
}

export class SessionStore {
  private readonly open_ = new Map<string, Session>();
  constructor(readonly root = resolve(process.env.EDITOR_AI_SESSION_DIR || '.local/ai-sessions')) {}
  private paths(documentId: string, id: string) {
    invariant(identifier.safeParse(documentId).success && SESSION_ID.test(id), 'AI_SESSION_NOT_FOUND', '会话不存在', 404);
    const dir = join(this.root, documentId);
    return { dir, file: join(dir, `${id}.jsonl`), workspace: join(dir, id) };
  }
  async create(documentId: string, reviewBase: number) {
    const id = randomUUID(), { file, workspace } = this.paths(documentId, id);
    await mkdir(workspace, { recursive: true });
    await appendFile(file, JSON.stringify({ type: 'session', id, documentId, reviewBase, createdAt: new Date().toISOString() } satisfies Entry) + '\n');
    const session = new Session(id, documentId, reviewBase, [], file, workspace);
    this.open_.set(`${documentId}/${id}`, session);
    return session;
  }
  async get(documentId: string, id: string) {
    const key = `${documentId}/${id}`, cached = this.open_.get(key);
    if (cached) return cached;
    const { file, workspace } = this.paths(documentId, id);
    const text = await readFile(file, 'utf8').catch(() => { throw new DomainError('AI_SESSION_NOT_FOUND', '会话不存在', 404); });
    let reviewBase = 0, messages: AgentMessage[] = [], model: { provider: string; id: string } | undefined;
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      const entry = JSON.parse(line) as Entry;
      if (entry.type === 'session') { invariant(entry.documentId === documentId, 'AI_SESSION_NOT_FOUND', '会话不存在', 404); reviewBase = entry.reviewBase; }
      else if (entry.type === 'message') messages.push(entry.message);
      else if (entry.type === 'compaction') messages = entry.messages;
      else if (entry.type === 'review') reviewBase = entry.base;
      else if (entry.type === 'model') model = { provider: entry.provider, id: entry.id };
    }
    await mkdir(workspace, { recursive: true });
    const session = new Session(id, documentId, reviewBase, messages, file, workspace);
    session.model = model;
    this.open_.set(key, session);
    return session;
  }
}

/** One sandbox per session, like pi's Gondolin extension keeps one VM per session: started on the
 * first bash of the conversation, reused after, reclaimed when the conversation goes idle, and
 * swept on startup (a crashed server leaves labelled containers behind). */
const run = promisify(execFile);
export const SANDBOX_IDLE_MS = 15 * 60_000;
export class SandboxPool {
  private readonly boxes = new Map<string, { box: Promise<Sandbox>; used: number }>();
  private readonly timer: ReturnType<typeof setInterval>;
  constructor(readonly owner = `port-${process.env.EDITOR_PORT ?? '4310'}`, private readonly open: typeof openSandbox = openSandbox) {
    this.timer = setInterval(() => void this.reap(), 60_000);
    this.timer.unref();
  }
  /** Removes what a previous process of this server left running. */
  async sweep() {
    const { stdout } = await run('docker', ['ps', '-aq', '--filter', `label=notale.agent.owner=${this.owner}`]).catch(() => ({ stdout: '' }));
    const ids = stdout.split(/\s+/).filter(Boolean);
    if (ids.length) await run('docker', ['rm', '-f', ...ids]).catch(() => {});
  }
  get(sessionId: string, workspace: string): Promise<Sandbox> {
    const held = this.boxes.get(sessionId);
    if (held) { held.used = Date.now(); return held.box; }
    const box = this.open(workspace, { 'notale.agent.owner': this.owner, 'notale.agent.session': sessionId });
    box.catch(() => this.boxes.delete(sessionId));
    this.boxes.set(sessionId, { box, used: Date.now() });
    return box;
  }
  async release(sessionId: string) {
    const held = this.boxes.get(sessionId);
    this.boxes.delete(sessionId);
    if (held) await (await held.box.catch(() => undefined))?.close();
  }
  async reap(now = Date.now()) {
    for (const [id, held] of this.boxes) if (now - held.used > SANDBOX_IDLE_MS) await this.release(id);
  }
  async close() { clearInterval(this.timer); for (const id of [...this.boxes.keys()]) await this.release(id); }
}
