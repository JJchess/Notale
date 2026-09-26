import { access, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import sharp from 'sharp';
import { Type } from 'typebox';
import { ZodError } from 'zod';
import { applyCommands } from '../../domain/commands.js';
import { diffDocuments } from '../../domain/document-diff.js';
import { withStableIds } from '../../domain/html.js';
import { commitSchema, DomainError, invariant, type Asset, type Command, type DeckDocument, type Slide } from '../../domain/model.js';
import type { AiRuntime } from '../ai-model.js';
import { ASSISTANT_NAME } from '../../i18n/index.js';
import { exportWorkspace, readWorkspace, rules } from './workspace.js';
import type { Sandbox } from './sandbox.js';
import type { Session } from './session.js';
import {
  Agent, compactIfNeeded, estimateContextTokens, createBashTool, createEditTool, createReadTool, createWriteTool,
  isContextOverflow, isRetryableAssistantError, retryDelayMs,
  type AgentEvent, type AgentMessage, type AgentTool, type AssistantMessage, type ImageContent,
} from './pi/index.js';
import { detectSupportedImageMimeTypeFromFile } from './pi/tools/mime.js';

/** One instruction of a conversation. The deck is a directory of files; the model is pi's coding
 * agent over it; the only rule is that notale editor can parse the result. Everything the turn
 * leaves in the directory becomes one commit of the document -- the same document the author is
 * editing, so there is exactly one state (Codex: the working tree), and review is that state
 * against the session's baseline. The transcript is the session's, kept the way pi keeps it. */
export interface AiStep {
  label: string;
  status: 'active' | 'done';
  /** The node's argument, the way a tool call shows its input: the model name. */
  chip?: string;
  /** What the node did. On a retry the first line is why the last attempt failed. */
  detail?: string[];
}
export interface TurnRequest { slideId: string; instruction: string; targets: string[]; images?: { mime: string; data: string }[] }
export interface TurnDeps {
  runtime: AiRuntime;
  session: Session;
  sandbox: (session: Session) => Promise<Sandbox>;
  snapshot: () => Promise<{ version: number; document: DeckDocument }>;
  /** Commits against `baseVersion`; the store merges concurrent edits. */
  commit: (input: { baseVersion: number; mutationId: string; commands: Command[] }) => Promise<{ version: number }>;
  blob: (hash: string) => Promise<Buffer>;
  upload: (data: Buffer, mime: string) => Promise<Asset>;
  render?: (input: { slide: Slide; document: DeckDocument; version: number; probe: boolean; image: boolean }) => Promise<{ image?: Buffer; warnings?: string[] } | undefined>;
  /** Image search / generation into `outDir`; absent, the tools are not offered. Keys stay server-side. */
  media?: { tools: readonly { name: string; description: string; parameters: Record<string, unknown> }[]; call: (name: string, args: unknown, outDir: string, signal?: AbortSignal) => Promise<{ text: string; images: { path: string; bytes: Buffer }[] }> };
  mutationId: () => string;
  report?: (step: AiStep) => void;
  /** The model's words as they stream; `null` when a new model call starts (earlier words were a preamble to tool calls). */
  text?: (delta: string | null) => void;
  signal?: AbortSignal;
}
export interface TurnResult {
  /** The document version the turn committed, if it changed anything. */
  version?: number;
  status: 'complete' | 'interrupted' | 'incomplete';
  /** The model's closing words to the author. */
  text: string;
  note?: string;
}

/** Cost guard, the one limit pi does not have: a service pays for its users' runs. Past this much
 * input in one instruction the turn stops like an interrupt. The heaviest normal run measured was
 * about 2.7M (32-page deck-wide edit), so this only stops runaway loops. */
export const TURN_TOKEN_BUDGET = Number(process.env.EDITOR_AI_TURN_TOKEN_BUDGET || 5_000_000);
/** pi's `settings.retry` defaults: 3 retries, 2 s doubling. */
const RETRY = { enabled: true, maxRetries: 3, baseDelayMs: 2_000 };
const RESERVE = 16_384;

/** Host-side file tools may only touch the workspace. Paths are checked after resolving symlinks,
 * because the sandbox can create a link inside the workspace that points anywhere on the host. */
function confined(root: string) {
  const inside = async (path: string) => {
    const lexical = resolve(path);
    invariant(lexical === root || lexical.startsWith(root + sep), 'AI_PATH_OUTSIDE', `只能访问讲义目录里的文件：${path}`);
    let probe = lexical;
    for (;;) {
      const real = await realpath(probe).catch(() => undefined);
      if (real !== undefined) {
        invariant(real === root || real.startsWith(root + sep), 'AI_PATH_OUTSIDE', `只能访问讲义目录里的文件：${path}`);
        return lexical;
      }
      const up = dirname(probe);
      if (up === probe) return lexical;
      probe = up;
    }
  };
  return {
    read: { readFile: async (p: string) => readFile(await inside(p)), access: async (p: string) => access(await inside(p)), detectImageMimeType: async (p: string) => detectSupportedImageMimeTypeFromFile(await inside(p)) },
    write: { writeFile: async (p: string, c: string) => writeFile(await inside(p), c, 'utf-8'), mkdir: async (d: string) => { await mkdir(await inside(d), { recursive: true }); } },
    edit: { readFile: async (p: string) => readFile(await inside(p)), writeFile: async (p: string, c: string) => writeFile(await inside(p), c, 'utf-8'), access: async (p: string) => access(await inside(p)) },
  };
}

// The tool lines and rules are pi's own (coding-agent system-prompt.ts buildRules + each tool's
// prompt contribution), verbatim: they are how pi teaches the model to batch edits and read files.
const PI_TOOLS = `- read: Read file contents
- bash: Execute bash commands (ls, grep, find, etc.)
- edit: Make precise file edits with exact text replacement, including multiple disjoint edits in one call
- write: Create or overwrite files`;
const PI_RULES = `- Use bash for file operations like ls, rg, find
- Use read to examine files instead of cat or sed.
- Use write only for new files or complete rewrites.
- Use edit for precise changes (edits[].oldText must match exactly)
- When changing multiple separate locations in one file, use one edit call with multiple entries in edits[] instead of multiple edit calls
- Each edits[].oldText is matched against the original file, not after earlier edits are applied. Do not emit overlapping or nested edits. Merge nearby changes into one edit.
- Keep edits[].oldText as small as possible while still being unique in the file. Do not pad with large unchanged regions.
- Be concise in your responses
- Show file paths clearly when working with files`;
const SYSTEM = (project: string, extra: string) => `你是 ${ASSISTANT_NAME}，Notale 讲义编辑器里的编辑助手。讲义就是当前目录里的一组文件，你像写代码一样直接读改它们。

<tools>
${PI_TOOLS}
- Look: 看一页渲染出来的样子（1600 宽，和画布坐标一比一），附带版面问题和页面报错${extra}
bash 在沙箱里执行：可以用 rg、grep、find、node、python、curl；网络只通 npm 和几个 CDN。
</tools>

<rules>
${PI_RULES}
- 需要看好几个文件时，在同一次回复里一次发起多个 read（或 Look）。
</rules>

做完了就不再调用工具，用一两句话告诉作者改了什么。只是回答问题或拿不准意图时，直接回答。

<project_context>
${project}
</project_context>`;

const TURN_ABORTED = `<turn_aborted>
作者中途停止了上一轮。已经写进讲义的改动保留着；如果有工具被打断，它可能只执行了一部分。
</turn_aborted>`;
const reason = (cause: unknown) => cause instanceof ZodError
  ? cause.issues.slice(0, 5).map(issue => `${issue.path.join('.')}: ${issue.message}`).join('；')
  : cause instanceof Error ? cause.message : String(cause);

export async function runTurn(request: TurnRequest, deps: TurnDeps): Promise<TurnResult> {
  const report = deps.report ?? (() => {});
  const { runtime, session } = deps;
  invariant(runtime.available, 'AI_UNCONFIGURED', runtime.reason, 503);
  invariant(!session.running, 'AI_SESSION_BUSY', '这段对话还有一轮在进行', 409);
  session.running = true;
  // The turn's own stop switch: the interrupt route (pi's RPC abort, Codex's turn/interrupt) and a
  // dropped connection both pull it. Retry waits, compaction, model calls and tools all hang off it.
  const turn = new AbortController(), signal = turn.signal;
  const hangUp = () => turn.abort();
  deps.signal?.addEventListener('abort', hangUp, { once: true });
  let settle!: () => void;
  session.turn = { abort: () => turn.abort(), settled: new Promise<void>(done => { settle = done; }) };
  try {
    const source = await deps.snapshot();
    const head = source.document, baseVersion = source.version, mutationId = deps.mutationId();
    const slide = head.slides.find(entry => entry.id === request.slideId);
    invariant(slide, 'SLIDE_NOT_FOUND', `页面不存在：${request.slideId}`, 404);
    const dir = session.workspace;
    report({ label: '同步讲义目录', status: 'active' });
    await exportWorkspace(dir, head, deps.blob);
    const box = await deps.sandbox(session);
    report({ label: '同步讲义目录', status: 'done', chip: `${head.slides.length} 页` });

    // The directory as a document, and the commands that would commit it. Throws when notale
    // editor cannot parse it -- the one rule.
    const current = async () => {
      const next = await readWorkspace(dir, head, deps.upload);
      const commands = diffDocuments(head, next);
      const parsed = commands.length ? commitSchema.parse({ baseVersion, mutationId, commands }).commands : [];
      const document = parsed.length ? withStableIds(mutationId, () => applyCommands(head, parsed)) : head;
      return { commands: parsed, document };
    };
    const pageOf = (document: DeckDocument, path: string) => {
      const clean = relative(dir, resolve(dir, path.replace(/^\/workspace\//, ''))).split(sep).join('/');
      return document.slides.find(page => page.sourcePath === clean);
    };

    const files = confined(dir);
    const model = runtime.model;
    const tools: AgentTool[] = [
      createReadTool(dir, { operations: files.read, model }) as AgentTool,
      createWriteTool(dir, { operations: files.write }) as AgentTool,
      createEditTool(dir, { operations: files.edit }) as AgentTool,
      createBashTool(dir, { operations: { exec: box.exec } }) as AgentTool,
      {
        name: 'Look', label: 'Look',
        description: '看一页渲染出来的样子（目录里的当前版本，1600 宽，与画布坐标一比一），附带版面问题（超出画布、文字溢出、互相重叠）和页面报错。path 是页面文件路径（deck.json 的 pages 里那样写）。',
        parameters: Type.Object({ path: Type.String({ description: '页面文件路径，例如 pages/03-intuition.html' }) }),
        async execute(_id, params) {
          const { path } = params as { path: string };
          const { document } = await current();
          const page = pageOf(document, path);
          invariant(page, 'AI_PAGE_NOT_FOUND', `deck.json 的 pages 里没有这一页：${path}`);
          const shot = await deps.render?.({ slide: page, document, version: baseVersion, probe: true, image: runtime.vision });
          const found = shot?.warnings?.length ? `\n版面与报错：\n${shot.warnings.map(line => `- ${line}`).join('\n')}` : '\n没有发现版面问题或页面报错。';
          const content: ({ type: 'text'; text: string } | ImageContent)[] = [{ type: 'text', text: shot ? `${path} 的渲染结果：${found}` : `${path} 的截图还没渲染出来。` }];
          if (shot?.image) content.push({ type: 'image', data: shot.image.toString('base64'), mimeType: 'image/webp' });
          return { content, details: {} };
        },
      },
    ];
    // Image tools leave their candidates under .media/ -- not part of the deck -- and the model
    // copies the one it wants into the deck like any other file.
    let fetches = 0, waited = 0;
    for (const spec of deps.media?.tools ?? []) tools.push({
      name: spec.name, label: spec.name, description: spec.description, parameters: Type.Unsafe(spec.parameters),
      async execute(_id, params, signal) {
        const folder = `.media/${mutationId.slice(0, 8)}-${++fetches}`;
        const began = Date.now();
        try {
          await mkdir(join(dir, folder), { recursive: true });
          const out = await deps.media!.call(spec.name, params, join(dir, folder), signal);
          const previews: ImageContent[] = [];
          if (runtime.vision) for (const image of out.images) {
            const preview = await sharp(image.bytes).resize({ width: 800, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer().catch(() => undefined);
            if (preview) previews.push({ type: 'image', data: preview.toString('base64'), mimeType: 'image/webp' });
          }
          const listing = out.images.map(image => `- ${folder}/${image.path}`).join('\n');
          return { content: [{ type: 'text', text: `${out.text}\n\n候选图片（在 .media/ 下，不算讲义）：\n${listing || '（没有可用图片）'}\n要用哪张，就把它复制到讲义目录里（例如 media/），页面按相对路径引用。` }, ...previews], details: {} };
        } finally { waited += Date.now() - began; }
      },
    });
    const extra = deps.media?.tools.length ? '；ImageSearch 找真实照片等证据类图片，ImageGen 生成插画；用了 ImageSearch 的图，说明里写来源和授权' : '';

    const apiKey = runtime.getApiKey?.();
    const streamFn = runtime.streamFn;
    // pi compacts between prompts, at the threshold; the budget is ours (EDITOR_AI_CONTEXT_BUDGET).
    const window = Math.min(model.contextWindow, Number(process.env.EDITOR_AI_CONTEXT_BUDGET || 200_000) + RESERVE);
    const compact = async (messages: AgentMessage[], force = false) => {
      // A stop cancels a compaction in flight (pi's abortCompaction); the transcript stays as it was.
      const next = await compactIfNeeded(messages, { model, streamFn, contextWindow: force ? estimateContextTokens(messages).tokens : window, ...(apiKey ? { apiKey } : {}), signal })
        .catch(cause => { if (signal.aborted) return messages; throw cause; });
      if (next !== messages) report({ label: '压缩上下文', status: 'done', detail: [`${messages.length} 条消息压成 ${next.length} 条`] });
      return next;
    };
    let transcript = await compact(session.messages);
    let rewritten = transcript !== session.messages;

    let spent = 0, stopped = '', lastText = '', lastWasText = false;
    const agent = new Agent({
      initialState: { systemPrompt: SYSTEM(rules(head), extra), model, tools, messages: transcript },
      streamFn,
      toolExecution: 'sequential',
      // The one rule, enforced where pi reports every tool failure: in the result of the call that
      // broke it. A change notale editor cannot parse comes back as that call's error.
      afterToolCall: async ({ toolCall, result }) => {
        if (!['write', 'edit', 'bash'].includes(toolCall.name)) return undefined;
        try { await current(); return undefined; }
        catch (cause) {
          return { content: [...result.content, { type: 'text', text: `\n\nnotale editor 解析不了现在的讲义：${reason(cause)}` }], isError: true };
        }
      },
    });
    let turn = 0;
    const label = () => turn <= 1 ? '请求模型' : `请求模型（第 ${turn} 轮）`;
    const toolLabel = (name: string, args: Record<string, unknown>) => {
      const verb = ({ read: '读', write: '写', edit: '改', bash: '运行命令', Look: '查看', ImageSearch: '搜索图片', ImageGen: '生成插图' } as Record<string, string>)[name] ?? name;
      const target = typeof args.path === 'string' ? args.path : typeof args.command === 'string' ? args.command.slice(0, 60) : '';
      return `${verb} ${target}`.trim();
    };
    const labels = new Map<string, string>();
    agent.subscribe((event: AgentEvent) => {
      if (event.type === 'turn_start') { turn++; deps.text?.(null); report({ label: label(), status: 'active' }); }
      else if (event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta') deps.text?.(event.assistantMessageEvent.delta);
      else if (event.type === 'message_end' && event.message.role === 'assistant') {
        const message = event.message as AssistantMessage;
        const tokens = (message.usage?.input ?? 0) + (message.usage?.cacheRead ?? 0);
        spent += tokens;
        if (spent > TURN_TOKEN_BUDGET && !stopped) { stopped = `这一轮累计输入超过 ${Math.round(TURN_TOKEN_BUDGET / 1e6)}M token，先停在这里`; agent.abort(); }
        if (message.stopReason === 'error' || message.stopReason === 'aborted') return;
        lastText = message.content.flatMap(part => part.type === 'text' ? [part.text] : []).join('\n').trim();
        lastWasText = !message.content.some(part => part.type === 'toolCall');
        report({ label: label(), status: 'done', chip: runtime.model.id, ...(tokens ? { detail: [`上下文 ${Math.round(tokens / 1000)}K token`] } : {}) });
      } else if (event.type === 'tool_execution_start') {
        const text = toolLabel(event.toolName, (event.args ?? {}) as Record<string, unknown>);
        labels.set(event.toolCallId, text);
        report({ label: text, status: 'active' });
      } else if (event.type === 'tool_execution_end') {
        const text = Array.isArray(event.result?.content) ? event.result.content.map((part: { text?: string }) => part.text ?? '').join(' ') : '';
        report({ label: labels.get(event.toolCallId) ?? event.toolName, status: 'done', ...(event.isError ? { detail: [text.slice(-300)] } : {}) });
      }
    });

    // The opening message: the author's words plus what they are looking at, the way an IDE
    // attaches the open file and the selection. The selection is context, not a lock.
    const index = head.slides.findIndex(page => page.id === slide.id) + 1;
    const clip = (text: string, limit: number) => text.length > limit ? text.slice(0, limit) + `\n…（还有 ${text.length - limit} 字符，需要时 read 这个文件）` : text;
    const { html: pageHtml, ...pageData } = slide;
    const selection = request.targets.length ? `\n选中的对象：${request.targets.join(', ')}` : '';
    const opening = `<context>\n作者在第 ${index}/${head.slides.length} 页「${slide.name}」，文件 ${slide.sourcePath}。${selection}\n`
      + `${slide.sourcePath}：\n\`\`\`html\n${clip(pageHtml, 30_000)}\n\`\`\`\n${slide.sourcePath.replace(/\.html?$/i, '')}.notale.json：\n\`\`\`json\n${clip(JSON.stringify(pageData, null, 2), 8_000)}\n\`\`\`\n</context>\n\n${request.instruction}`;

    const stop = () => agent.abort();
    signal.addEventListener('abort', stop, { once: true });
    let fatal = '';
    try {
      // Stopped before the model was asked: the instruction still goes into the transcript.
      if (signal.aborted) (agent.state as { messages: AgentMessage[] }).messages = [...agent.state.messages, { role: 'user', content: [{ type: 'text', text: opening }], timestamp: Date.now() } as AgentMessage];
      else await agent.prompt(opening, (request.images ?? []).map(image => ({ type: 'image' as const, data: image.data, mimeType: image.mime })));
      // Recovery, as pi's AgentSession does it: an overflow is compacted and retried once; a
      // transient provider error is retried with backoff. Both continue the same transcript.
      let overflowRetried = false, retries = 0;
      for (;;) {
        if (signal.aborted || stopped) break;
        const messages = agent.state.messages, last = messages[messages.length - 1] as AssistantMessage | undefined;
        if (last?.role !== 'assistant' || last.stopReason !== 'error') break;
        const state = agent.state as { messages: AgentMessage[] };
        if (isContextOverflow(last, model.contextWindow) && !overflowRetried) {
          overflowRetried = true;
          state.messages = await compact(messages.slice(0, -1), true);
          rewritten = true;
        } else if (!isContextOverflow(last, model.contextWindow) && isRetryableAssistantError(last) && retries < RETRY.maxRetries) {
          retries++;
          const delay = retryDelayMs(RETRY, retries);
          report({ label: `模型服务暂时出错，${Math.round(delay / 1000)} 秒后重试（第 ${retries} 次）`, status: 'done', detail: [(last.errorMessage ?? '').slice(0, 200)] });
          await sleep(delay, undefined, { signal }).catch(() => {});
          if (signal.aborted) break;
          state.messages = messages.slice(0, -1);
        } else { fatal = `模型服务返回错误：${(last.errorMessage ?? '').slice(0, 400)}`; break; }
        await agent.prompt([]);
      }
    } finally { signal.removeEventListener('abort', stop); }
    void waited;

    // What the directory says now is the turn's result -- also when it was stopped (Codex keeps
    // what an interrupted turn already wrote). One commit; the store merges concurrent edits.
    const aborted = signal.aborted || !!stopped;
    let messages = agent.state.messages;
    if (aborted) messages = [...messages, { role: 'user', content: [{ type: 'text', text: TURN_ABORTED }], timestamp: Date.now() } as AgentMessage];
    let version: number | undefined, note = stopped || fatal;
    try {
      const { commands } = await current();
      if (commands.length) {
        report({ label: '写进讲义', status: 'active' });
        version = (await deps.commit({ baseVersion, mutationId, commands })).version;
        report({ label: '写进讲义', status: 'done', chip: `v${version}` });
      }
    } catch (cause) { note = `这一轮的改动没能写进讲义：${reason(cause)}`; }
    // pi compacts again after the run when the transcript crossed the threshold.
    // Not after a stop: pi cancels compaction with the run, and the transcript must be saved either way.
    const kept = aborted ? messages : await compact(messages);
    if (kept !== messages || rewritten) await session.replace(kept);
    else await session.append(messages.slice(session.messages.length));
    const text = lastWasText ? lastText : '';
    return { ...(version !== undefined ? { version } : {}), status: aborted ? 'interrupted' : note ? 'incomplete' : 'complete', text, ...(note ? { note } : {}) };
  } finally {
    session.running = false;
    session.turn = undefined;
    deps.signal?.removeEventListener('abort', hangUp);
    settle();
  }
}
