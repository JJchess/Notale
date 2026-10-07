import type { ModelRef } from '../adapters/models/selection.js';
import { readFile } from 'node:fs/promises';
import { loadAttachment, preview } from './attachments.js';
import { understand, type Artifact, type Complete, type Route } from './understand.js';
import type { Session } from './session.js';

/** The two wholes this layer hands work to. Neither knows about the other or about sessions. */
export interface GenerateRequest {
  model?: ModelRef;
  query: string; title?: string; minutes?: number; audience?: string; scenario?: string; style?: string;
  materials: { name: string; file: string; kind: string }[];
  template?: { name: string; file: string };
  styleImages: { name: string; file: string }[];
}
export interface Generator {
  start(request: GenerateRequest): Promise<{ runId: string }>;
  /** Waits for the run to finish, relaying its progress. */
  follow(runId: string, onEvent: (event: Record<string, unknown>) => void): Promise<{ status: string }>;
  cancel(runId: string): Promise<void>;
  /** A finished run as the understanding stage sees it. */
  describe(runId: string): Promise<{ title: string; pages: string[] }>;
}
/** `images` go in the message itself (pi); `files` are documents and videos the agent reads with
 * read, from its workspace (Kimi Code: the prompt names the file, the agent pulls it). */
export interface FixRequest { model?: ModelRef; session: Session; target: string; instruction: string; page?: number; images: { mime: string; data: string }[]; files: { file: string; name: string; kind: string }[] }
export interface Fixer {
  /** Changes a copy of `target` and delivers it as a new run based on it. No change (the agent only
   * answered, or asked back) is no run: `runId` is absent and `text` is its answer. */
  run(request: FixRequest, onEvent: (event: Record<string, unknown>) => void, signal?: AbortSignal): Promise<{ runId?: string; status: string; text?: string }>;
}
export type TurnEvent =
  | { type: 'understood'; route: Route }
  | { type: 'question'; text: string; options?: string[] }
  | { type: 'reply'; text: string }
  | { type: 'run'; runId: string; kind: 'generate' | 'fix'; basedOn?: string }
  | { type: 'progress'; runId: string; event: Record<string, unknown> }
  /** The fix agent at work, before there is a run to speak of: its steps, streamed words and
   * where its draft is (`{type:'draft', page, revision}`). */
  | { type: 'working'; event: Record<string, unknown> }
  | { type: 'result'; runId: string; status: string };

const now = () => new Date().toISOString();
/** One message: keep it, understand it, and hand it to whoever does the work. */
export async function turn(session: Session, message: { text: string; fileIds: string[]; model?: ModelRef },
  deps: { complete: Complete; generator: Generator; fixer: Fixer; emit: (event: TurnEvent) => void; signal?: AbortSignal }) {
  // Files were uploaded on their own (POST …/files); a message only names them, once each.
  const used = session.usedFiles;
  for (const id of message.fileIds) {
    if (used.has(id)) throw Object.assign(new Error('这个附件已经随上一条消息发过了'), { status: 400 });
    await loadAttachment(session, id).catch(() => { throw Object.assign(new Error('附件不存在'), { status: 400 }); });
  }
  await session.append({ type: 'user', ...(message.model ? { model: message.model } : {}), text: message.text, files: message.fileIds, at: now() });

  const artifacts: Artifact[] = [];
  for (const run of session.artifacts) artifacts.push({ runId: run.runId, kind: run.kind, ...(await deps.generator.describe(run.runId).catch(() => ({ title: '（读不到）', pages: [] }))) });
  const files = await Promise.all(session.pendingFiles.map(id => preview(session, id)));
  const route = await understand({ text: message.text, history: session.history().slice(0, -1), artifacts, files }, deps.complete, deps.signal);
  deps.signal?.throwIfAborted();
  await session.append({ type: 'understood', route, at: now() });
  deps.emit({ type: 'understood', route });

  if (route.action === 'ask') {
    await session.append({ type: 'question', text: route.question, ...(route.options ? { options: route.options } : {}), at: now() });
    deps.emit({ type: 'question', text: route.question, ...(route.options ? { options: route.options } : {}) });
    return;
  }
  if (route.action === 'reply') {
    await session.append({ type: 'reply', text: route.text, at: now() });
    deps.emit({ type: 'reply', text: route.text });
    return;
  }
  const relay = (runId: string) => (event: Record<string, unknown>) => deps.emit({ type: 'progress', runId, event });
  if (route.action === 'generate') {
    const byRole = async (role: string) => Promise.all(route.files.filter(f => f.role === role).map(async f => { const { meta, file } = await loadAttachment(session, f.id); return { name: meta.name, file, kind: meta.kind }; }));
    const [materials, templates, styleImages] = await Promise.all([byRole('material'), byRole('template'), byRole('style-reference')]);
    const { action: _action, reason: _reason, files: _files, language, ...fields } = route;
    // The generator has no language field; the scenario carries it.
    const scenario = [fields.scenario, language ? `全部页面文字使用${language}撰写` : undefined].filter(Boolean).join('；');
    deps.signal?.throwIfAborted();
    const { runId } = await deps.generator.start({ ...fields, ...(message.model ? { model: message.model } : {}), ...(scenario ? { scenario } : {}), materials, ...(templates[0] ? { template: templates[0] } : {}), styleImages });
    await session.append({ type: 'run', runId, kind: 'generate', at: now() });
    deps.emit({ type: 'run', runId, kind: 'generate' });
    // A stop cancels the run; following goes on until the run says it has ended.
    const cancel = () => void deps.generator.cancel(runId).catch(() => {});
    if (deps.signal?.aborted) cancel(); else deps.signal?.addEventListener('abort', cancel, { once: true });
    const { status } = await deps.generator.follow(runId, relay(runId)).finally(() => deps.signal?.removeEventListener('abort', cancel));
    await session.append({ type: 'finished', runId, status, at: now() });
    deps.emit({ type: 'result', runId, status });
    return;
  }
  const attached = await Promise.all(route.files.map(f => loadAttachment(session, f.id)));
  const images = await Promise.all(attached.filter(a => a.meta.kind === 'image').map(async ({ meta, file }) => ({ mime: meta.mime, data: (await readFile(file)).toString('base64') })));
  const references = attached.filter(a => a.meta.kind !== 'image').map(({ meta, file }) => ({ file, name: meta.name, kind: meta.kind }));
  let announced = '', recorded: Promise<void> = Promise.resolve();
  deps.signal?.throwIfAborted();
  const fixed = await deps.fixer.run({ session, ...(message.model ? { model: message.model } : {}), target: route.target, instruction: route.instruction, ...(route.page ? { page: route.page } : {}), images, files: references },
    event => {
      // The fixer names its run as soon as it has one; that is the session's new artifact.
      if (typeof event.runId === 'string' && !announced) { announced = event.runId; recorded = session.append({ type: 'run', runId: announced, kind: 'fix', basedOn: route.target, at: now() }); deps.emit({ type: 'run', runId: announced, kind: 'fix', basedOn: route.target }); }
      if (announced) relay(announced)(event); else deps.emit({ type: 'working', event });
    }, deps.signal);
  await recorded;
  const { runId, status } = fixed;
  // What the agent said closes the message: its answer when nothing changed, else what it did.
  const say = async (text: string) => { await session.append({ type: 'reply', text, at: now() }); deps.emit({ type: 'reply', text }); };
  const stopped = status === 'interrupted' ? '已停止。' : '';
  if (!runId) { await say([stopped, fixed.text].filter(Boolean).join('') || '没有需要改动的地方。'); return; }
  if (!announced) { await session.append({ type: 'run', runId, kind: 'fix', basedOn: route.target, at: now() }); deps.emit({ type: 'run', runId, kind: 'fix', basedOn: route.target }); }
  await session.append({ type: 'finished', runId, status, at: now() });
  deps.emit({ type: 'result', runId, status });
  if (fixed.text) await say(fixed.text);
}
