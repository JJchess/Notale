import { access, appendFile, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import path, { dirname, join, relative, resolve, sep } from 'node:path';
import { Type } from 'typebox';
import { references, workbenchFrames } from '@notale/format/page';
import { codeResourcePath, discoverCodeLessons } from '@notale/format';
import { loadConfig } from '../adapters/models/profiles.js';
import { RESOURCES } from '../core/guidance.js';
import { check } from '../tools/check.js';
import { mediaCall } from '../tools/media-execution.js';
import { acquireVisualChecker } from '../tools/visual-check.js';
import type { Sandbox } from './sandbox.js';
import { GeminiFiles } from './pi/ai/gemini-files.js';
import {
  Agent, compactIfNeeded, estimateContextTokens, createBashTool, createEditTool, createReadTool, createWriteTool,
  isContextOverflow, isRetryableAssistantError, retryDelayMs, streamGoogle,
  type AgentEvent, type AgentMessage, type AgentTool, type Api, type AssistantMessage, type ImageContent, type Model, type StreamFn,
} from './pi/index.js';
import { detectSupportedImageMimeTypeFromFile } from './pi/tools/mime.js';

/** Istar, forked from notale-editor's AI edit (src/server/agent/run.ts) to work on a run's files.
 * A lecture is a directory of files; the model is pi's coding agent over it. The one rule is that
 * the editor can import the result -- checked with the same page reader the editor uses
 * (`@notale/format/page`) -- and every changed page also goes through notale-ts's own Check. */
export const ASSISTANT_NAME = 'Istar';

export interface FixStep { label: string; status: 'active' | 'done'; chip?: string; detail?: string[] }
export interface FixModel { model: Model<Api>; streamFn: StreamFn; apiKey: string; vision: boolean }

/** The generator's model (config.yaml `model`, locked to gemini-3.8-flash / low), on Gemini's own
 * API rather than its OpenAI-compatible one: pi's Google provider keeps thought signatures. */
export function fixModel(env: NodeJS.ProcessEnv = process.env): FixModel {
  const section = loadConfig().model;
  const id = section.name, keyEnv = section.api_key_env;
  const key = env[keyEnv];
  if (!key) throw Object.assign(new Error(`未配置模型服务：设置环境变量 ${keyEnv} 后可用`), { status: 503 });
  const baseUrl = section.base_url.replace(/\/$/, '').replace(/\/openai$/, '');
  const model = {
    id, name: id, api: 'google-generative-ai', provider: 'google', baseUrl, reasoning: true, input: ['text', 'image', 'pdf', 'video'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1_048_576, maxTokens: 65_536,
  } as Model<Api>;
  // pi's httpIdleTimeoutMs / Codex's stream_idle_timeout_ms: 5 minutes without data, then retry.
  const streamFn: StreamFn = (target, context, options) => streamGoogle(target, context, { ...options, apiKey: key, temperature: 0, timeoutMs: 300_000 });
  return { model, streamFn, apiKey: key, vision: section.vision_input !== false };
}

/** One conversation's messages, kept the way pi keeps a session: append-only jsonl, a compaction
 * restarts the list. The next instruction continues the real transcript, not a summary of it. */
export class Transcript {
  running = false;
  private constructor(private readonly file: string, public messages: AgentMessage[]) {}
  static async open(file: string) {
    await mkdir(dirname(file), { recursive: true });
    let messages: AgentMessage[] = [];
    for (const line of (await readFile(file, 'utf8').catch(() => '')).split('\n')) {
      if (!line.trim()) continue;
      const entry = JSON.parse(line) as { type: 'message'; message: AgentMessage } | { type: 'compaction'; messages: AgentMessage[] };
      if (entry.type === 'message') messages.push(entry.message); else messages = entry.messages;
    }
    return new Transcript(file, messages);
  }
  async append(messages: readonly AgentMessage[]) {
    for (const message of messages) await appendFile(this.file, JSON.stringify({ type: 'message', message }) + '\n');
    this.messages = [...this.messages, ...messages];
  }
  async replace(messages: AgentMessage[]) { await appendFile(this.file, JSON.stringify({ type: 'compaction', messages }) + '\n'); this.messages = messages; }
}

/** Not the lecture's: dot-paths and node_modules, the way git leaves `.git` alone. Scratch space.
 * Except the format's own markers (`.notale-code-lesson.json`): a code page is not one without it. */
export const ignored = (file: string) => file.split('/').some(part => (part.startsWith('.') && !part.startsWith('.notale-')) || part === 'node_modules');
export const PAGE = /^page-\d+\.html$/;
/** Lecture files under `dir`, relative, `/`-separated. */
export async function lectureFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (at: string) => {
    for (const entry of await readdir(join(dir, at), { withFileTypes: true })) {
      const file = at ? `${at}/${entry.name}` : entry.name;
      if (ignored(file)) continue;
      if (entry.isDirectory()) await walk(file); else if (entry.isFile()) out.push(file);
    }
  };
  await walk('');
  return out.sort();
}
/** Why the editor would refuse this directory as a lecture, if it would: no pages, or a local
 * reference (in a page, stylesheet or other HTML) to a file that is not there -- the editor's
 * MISSING_RESOURCE, read with the editor's own page reader. */
export async function importProblems(dir: string): Promise<string[]> {
  const files = await lectureFiles(dir), present = new Set(files), problems: string[] = [];
  if (!files.some(file => PAGE.test(file))) problems.push('讲义里没有页面（page-NN.html）');
  const frames: { page: string; entry: string }[] = [];
  for (const file of files.filter(file => /\.(html?|css)$/i.test(file))) {
    const source = await readFile(join(dir, file), 'utf8');
    if (PAGE.test(file)) frames.push(...workbenchFrames(source).map(src => ({ page: file, entry: src })));
    for (const ref of references(file, source, /\.css$/i.test(file) ? 'css' : 'html'))
      if (!ref.external && ref.path && !present.has(ref.path)) problems.push(`${file} 引用的 ${ref.url} 不存在`);
  }
  // Code pages: the editor rebuilds each lesson from its marker and refuses a page whose workbench
  // points at no lesson, or a lesson whose files no longer match what the marker describes.
  const markers = files.filter(file => file.endsWith('/.notale-code-lesson.json'));
  if (frames.length || markers.length) {
    try {
      const hashes = await digest(dir), assets = Object.fromEntries([...hashes].map(([file, hash]) => [file, { hash }]));
      const contents: Record<string, Uint8Array> = Object.fromEntries(files.map(file => [file, new Uint8Array()]));
      for (const marker of markers) contents[marker] = await readFile(join(dir, marker));
      const lessons = discoverCodeLessons(contents, assets, text => createHash('sha256').update(text).digest('hex'));
      for (const frame of frames) if (!lessons[codeResourcePath(frame.entry, frame.page)]) problems.push(`${frame.page} 的代码工作台指向的课程 ${frame.entry} 不存在`);
    } catch (cause) { problems.push(`代码课程：${cause instanceof Error ? cause.message : String(cause)}`); }
  }
  return problems;
}
const digest = async (dir: string) => new Map(await Promise.all((await lectureFiles(dir)).map(async file =>
  [file, createHash('sha256').update(await readFile(join(dir, file))).digest('hex')] as const)));

/** Host-side file tools may only touch the workspace; symlinks are resolved first (the sandbox can
 * make a link inside the workspace that points anywhere on the host). */
function confined(root: string) {
  const outside = (p: string) => Object.assign(new Error(`只能访问讲义目录里的文件：${p}`), { status: 400 });
  const inside = async (p: string) => {
    const lexical = resolve(p);
    if (lexical !== root && !lexical.startsWith(root + sep)) throw outside(p);
    for (let probe = lexical; ;) {
      const real = await realpath(probe).catch(() => undefined);
      if (real !== undefined) { if (real !== root && !real.startsWith(root + sep)) throw outside(p); return lexical; }
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

// pi's own tool lines and rules (coding-agent system-prompt.ts buildRules), verbatim.
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
const RULES = (pages: string[]) => `# 这份讲义

这个目录就是一份讲义。直接改文件；改完不再调用工具，写一两句话告诉作者改了什么。

## 目录
- 页面是根目录下的 \`page-NN.html\`，按编号排序就是页序（现在有 ${pages.length} 页：${pages.join('、')}）。
  新建一页 = 新建一个 page-NN.html（编号决定位置）；删一页 = 删掉文件；调页序 = 改文件名的编号。
- \`page-NN/\` 目录是那一页的代码课程；\`assets/\` 是共用的样式、脚本和图片，页面按相对路径引用。
- 以点开头的路径和 \`node_modules\` 不算讲义，可以放临时文件。
- \`.inputs/\` 是作者附来的参考文件（文档、视频），用 read 看；它们不是讲义的一部分，要用里面的图就复制进 \`assets/\` 再引用。

## 编辑器能导入的前提
- 画布 1600×900；页面结构、样式表和脚本沿用已有页面的写法。
- 已有元素的 \`data-notale-id\` 保留原样；新元素不用写，导入时会自动补。
- 引用的都是讲义里的文件：放映和截图拿不到外网。要用第三方库，下载进目录再相对引用。
- 每次改文件后都会检查一遍：引用了不存在的文件、改过的页面渲染出错，会在那次工具结果里告诉你。`;
const SYSTEM = (pages: string[], extra: string) => `你是 ${ASSISTANT_NAME}，Notale 讲义的编辑助手。讲义就是当前目录里的一组文件，你像写代码一样直接读改它们。

<tools>
${PI_TOOLS}
- Look: 看一页渲染出来的样子（1600×900），附带版面问题和页面报错${extra}
bash 在沙箱里执行：可以用 rg、grep、find、node、python、curl；网络只通 npm 和几个 CDN。
</tools>

<rules>
${PI_RULES}
- 需要看好几个文件时，在同一次回复里一次发起多个 read（或 Look）。
</rules>

做完了就不再调用工具，用一两句话告诉作者改了什么。只是回答问题或拿不准意图时，直接回答。

<project_context>
${RULES(pages)}
</project_context>`;
const TURN_ABORTED = `<turn_aborted>
作者中途停止了上一轮。已经写进讲义的改动保留着；如果有工具被打断，它可能只执行了一部分。
</turn_aborted>`;
/** Past this much input in one instruction the turn stops like an interrupt (the editor's budget). */
export const TURN_TOKEN_BUDGET = Number(process.env.NOTALE_FIX_TURN_TOKEN_BUDGET || 5_000_000);
const RETRY = { enabled: true, maxRetries: 3, baseDelayMs: 2_000 };
const RESERVE = 16_384, CONTEXT_BUDGET = 200_000;
const MEDIA = (JSON.parse(readFileSync(path.join(RESOURCES, 'builder-instructions.json'), 'utf8')) as { MEDIA_SCHEMAS: { name: string; description: string; parameters: Record<string, unknown> }[] }).MEDIA_SCHEMAS;

/** `inputs`: the author's documents and videos, already in the workspace (paths relative to it). */
export interface FixTurn { instruction: string; page?: number; images?: { mime: string; data: string }[]; inputs?: { path: string; name: string; kind: string }[] }
export interface FixDeps {
  model: FixModel;
  transcript: Transcript;
  /** The directory the agent edits; the sandbox mounts it. */
  dir: string;
  sandbox: () => Promise<Sandbox>;
  /** Offer ImageSearch / ImageGen (they need keys the host may not have). */
  media?: { env: NodeJS.ProcessEnv };
  report?: (step: FixStep) => void;
  /** The model's words as they stream; `null` when a new model call starts. */
  text?: (delta: string | null) => void;
  /** Where to look in the working copy: the page the agent is on, and a revision that moves each
   * time its pages change on disk (so a live preview knows to reload). */
  draft?: (at: { page: string; revision: number }) => void;
  signal?: AbortSignal;
}
export interface FixResult { changed: boolean; status: 'complete' | 'interrupted' | 'incomplete'; text: string; note?: string }

export async function runFix(request: FixTurn, deps: FixDeps): Promise<FixResult> {
  const report = deps.report ?? (() => {});
  const { model: runtime, transcript, dir } = deps, model = runtime.model;
  if (transcript.running) throw Object.assign(new Error('这段对话还有一轮在进行'), { status: 409 });
  transcript.running = true;
  const turn = new AbortController(), signal = turn.signal;
  const hangUp = () => turn.abort();
  deps.signal?.addEventListener('abort', hangUp, { once: true });
  const release = acquireVisualChecker();
  try {
    const before = await digest(dir);
    const pages = [...before.keys()].filter(file => PAGE.test(file));
    const files = confined(dir);
    // Documents and video go to Gemini's Files API once; the transcript keeps only the references,
    // cached per conversation (its .inputs/ outlives each checkout).
    const uploads = new GeminiFiles({ apiKey: runtime.apiKey, cacheFile: join(dir, '.inputs', '.gemini-files.json') });
    const streamFn: StreamFn = (target, context, options) => runtime.streamFn(target, context, { ...options, files: uploads } as never);
    // Pages changed since the last check get notale-ts's Check (render errors, overflow).
    let checked = new Map(before);
    let focus = pages[(request.page ?? 1) - 1] ?? pages[0] ?? '', revision = 0;
    const verify = async () => {
      const problems = await importProblems(dir);
      const now = await digest(dir), changed = [...now].filter(([file, hash]) => PAGE.test(file) && checked.get(file) !== hash).map(([file]) => file);
      const warnings: string[] = [];
      for (const page of changed) {
        const { diagnostics } = await check({ page, shot: false }, { cwd: dir, pid: page.replace(/\.html$/, '') }, signal);
        problems.push(...(diagnostics?.fatal_errors ?? []).map(line => `${page}：${line}`));
        warnings.push(...(diagnostics?.visual_warnings ?? []).map(line => `${page}：${line}`));
      }
      checked = now;
      if (changed.length) { focus = changed.includes(focus) ? focus : changed[0]!; deps.draft?.({ page: focus, revision: ++revision }); }
      return { problems, warnings };
    };
    const tools: AgentTool[] = [
      createReadTool(dir, { operations: files.read, model, media: { uploader: uploads, scratch: join(dir, '.inputs', '.derived') } }) as AgentTool,
      createWriteTool(dir, { operations: files.write }) as AgentTool,
      createEditTool(dir, { operations: files.edit }) as AgentTool,
      createBashTool(dir, { operations: { exec: async (command, cwd, options) => (await deps.sandbox()).exec(command, cwd, options) } }) as AgentTool,
      {
        name: 'Look', label: 'Look',
        description: '看一页渲染出来的样子（目录里的当前版本，1600×900），附带版面问题（超出画布、文字溢出、互相重叠）和页面报错。path 是页面文件名，例如 page-03.html。',
        parameters: Type.Object({ path: Type.String({ description: '页面文件名，例如 page-03.html' }) }),
        async execute(_id, params) {
          const page = relative(dir, resolve(dir, (params as { path: string }).path.replace(/^\/workspace\//, ''))).split(sep).join('/');
          if (!PAGE.test(page)) throw new Error(`不是页面文件：${page}（页面形如 page-03.html）`);
          const shot = await check({ page, shot: runtime.vision }, { cwd: dir, pid: page.replace(/\.html$/, '') }, signal);
          const content: ({ type: 'text'; text: string } | ImageContent)[] = [{ type: 'text', text: `${page} 的渲染结果：\n${shot.text}` }];
          for (const [mimeType, data] of shot.images) content.push({ type: 'image', data, mimeType });
          return { content, details: {} };
        },
      },
    ];
    // Media lands in assets/img/ like the generator's; the model references what it keeps.
    for (const spec of deps.media ? MEDIA : []) tools.push({
      name: spec.name, label: spec.name, description: spec.description, parameters: Type.Unsafe(spec.parameters),
      async execute(_id, params, toolSignal) {
        const out = await mediaCall(spec.name, params as Record<string, unknown>, dir, 'fix', { env: deps.media!.env }, toolSignal);
        return { content: [{ type: 'text', text: `${out.text}\n\n要用哪张，页面按相对路径引用（path 是相对讲义目录的）。` },
          ...(runtime.vision ? out.images.map(([mimeType, data]) => ({ type: 'image' as const, data, mimeType })) : [])], details: {} };
      },
    });
    const extra = deps.media ? '；ImageSearch 找真实照片等证据类图片，ImageGen 生成插画；用了 ImageSearch 的图，说明里写来源和授权' : '';

    const window = Math.min(model.contextWindow, CONTEXT_BUDGET + RESERVE);
    const compact = async (messages: AgentMessage[], force = false) => {
      const next = await compactIfNeeded(messages, { model, streamFn, contextWindow: force ? estimateContextTokens(messages).tokens : window, apiKey: runtime.apiKey, signal })
        .catch(cause => { if (signal.aborted) return messages; throw cause; });
      if (next !== messages) report({ label: '压缩上下文', status: 'done', detail: [`${messages.length} 条消息压成 ${next.length} 条`] });
      return next;
    };
    const transcriptStart = transcript.messages;
    let rewritten = false;
    const opened = await compact(transcriptStart);
    if (opened !== transcriptStart) rewritten = true;

    let spent = 0, stopped = '', lastText = '', lastWasText = false;
    const agent = new Agent({
      initialState: { systemPrompt: SYSTEM(pages, extra), model, tools, messages: opened, thinkingLevel: 'low' },
      streamFn,
      toolExecution: 'sequential',
      // The one rule, enforced in the result of the call that broke it.
      afterToolCall: async ({ toolCall, result }) => {
        if (!['write', 'edit', 'bash'].includes(toolCall.name)) return undefined;
        const { problems, warnings } = await verify().catch(cause => ({ problems: [cause instanceof Error ? cause.message : String(cause)], warnings: [] as string[] }));
        if (problems.length) return { content: [...result.content, { type: 'text', text: `\n\n编辑器导入不了现在的讲义：\n${problems.slice(0, 8).map(line => `- ${line}`).join('\n')}` }], isError: true };
        if (warnings.length) return { content: [...result.content, { type: 'text', text: `\n\n版面提示：\n${warnings.slice(0, 8).map(line => `- ${line}`).join('\n')}` }] };
        return undefined;
      },
    });
    let round = 0;
    const label = () => round <= 1 ? '请求模型' : `请求模型（第 ${round} 轮）`;
    const toolLabel = (name: string, args: Record<string, unknown>) => {
      const verb = ({ read: '读', write: '写', edit: '改', bash: '运行命令', Look: '查看', ImageSearch: '搜索图片', ImageGen: '生成插图' } as Record<string, string>)[name] ?? name;
      const target = typeof args.path === 'string' ? args.path : typeof args.command === 'string' ? args.command.slice(0, 60) : '';
      return `${verb} ${target}`.trim();
    };
    const labels = new Map<string, string>();
    agent.subscribe((event: AgentEvent) => {
      if (event.type === 'turn_start') { round++; deps.text?.(null); report({ label: label(), status: 'active' }); }
      else if (event.type === 'message_update' && event.assistantMessageEvent.type === 'text_delta') deps.text?.(event.assistantMessageEvent.delta);
      else if (event.type === 'message_end' && event.message.role === 'assistant') {
        const message = event.message as AssistantMessage;
        const tokens = (message.usage?.input ?? 0) + (message.usage?.cacheRead ?? 0);
        spent += tokens;
        if (spent > TURN_TOKEN_BUDGET && !stopped) { stopped = `这一轮累计输入超过 ${Math.round(TURN_TOKEN_BUDGET / 1e6)}M token，先停在这里`; agent.abort(); }
        if (message.stopReason === 'error' || message.stopReason === 'aborted') return;
        lastText = message.content.flatMap(part => part.type === 'text' ? [part.text] : []).join('\n').trim();
        lastWasText = !message.content.some(part => part.type === 'toolCall');
        report({ label: label(), status: 'done', chip: model.id, ...(tokens ? { detail: [`上下文 ${Math.round(tokens / 1000)}K token`] } : {}) });
      } else if (event.type === 'tool_execution_start') {
        const args = (event.args ?? {}) as Record<string, unknown>;
        const text = toolLabel(event.toolName, args);
        const at = typeof args.path === 'string' ? relative(dir, resolve(dir, args.path.replace(/^\/workspace\//, ''))).split(sep).join('/') : '';
        if (PAGE.test(at) && at !== focus) { focus = at; deps.draft?.({ page: focus, revision }); }
        labels.set(event.toolCallId, text);
        report({ label: text, status: 'active' });
      } else if (event.type === 'tool_execution_end') {
        const text = Array.isArray(event.result?.content) ? event.result.content.map((part: { text?: string }) => part.text ?? '').join(' ') : '';
        report({ label: labels.get(event.toolCallId) ?? event.toolName, status: 'done', ...(event.isError ? { detail: [text.slice(-300)] } : {}) });
      }
    });

    // The opening message: the instruction plus the page it is about, the way an IDE attaches the open file.
    const page = pages[(request.page ?? 1) - 1] ?? pages[0];
    if (page) deps.draft?.({ page, revision });
    const clip = (text: string, limit: number) => text.length > limit ? text.slice(0, limit) + `\n…（还有 ${text.length - limit} 字符，需要时 read 这个文件）` : text;
    const attached = (request.inputs ?? []).map(input => `<file path="${input.path}" kind="${input.kind}" name="${input.name.replace(/"/g, "'")}"/>`).join('\n');
    const opening = (attached ? `<attachments>\n作者附了这些文件，需要时用 read 看：\n${attached}\n</attachments>\n\n` : '') + (page
      ? `<context>\n${request.page ? `作者说的是第 ${request.page}/${pages.length} 页` : `讲义共 ${pages.length} 页，第一页`}，文件 ${page}：\n\`\`\`html\n${clip(await readFile(join(dir, page), 'utf8'), 30_000)}\n\`\`\`\n</context>\n\n${request.instruction}`
      : request.instruction);

    const stop = () => agent.abort();
    signal.addEventListener('abort', stop, { once: true });
    let fatal = '';
    try {
      if (signal.aborted) (agent.state as { messages: AgentMessage[] }).messages = [...agent.state.messages, { role: 'user', content: [{ type: 'text', text: opening }], timestamp: Date.now() } as AgentMessage];
      else await agent.prompt(opening, (request.images ?? []).map(image => ({ type: 'image' as const, data: image.data, mimeType: image.mime })));
      // Recovery as pi's AgentSession does it: an overflow is compacted and retried once; a
      // transient provider error is retried with backoff.
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

    // What the directory says now is the turn's result, also when it was stopped.
    const aborted = signal.aborted || !!stopped;
    let messages = agent.state.messages;
    if (aborted) messages = [...messages, { role: 'user', content: [{ type: 'text', text: TURN_ABORTED }], timestamp: Date.now() } as AgentMessage];
    const after = await digest(dir);
    let changed = after.size !== before.size || [...after].some(([file, hash]) => before.get(file) !== hash), note = stopped || fatal;
    if (changed) {
      const problems = await importProblems(dir).catch(cause => [cause instanceof Error ? cause.message : String(cause)]);
      if (problems.length) { changed = false; note = `这一轮的改动编辑器导入不了，没有发布：${problems.slice(0, 3).join('；')}`; }
    }
    const kept = aborted ? messages : await compact(messages);
    if (kept !== messages || rewritten) await transcript.replace(kept);
    else await transcript.append(messages.slice(transcript.messages.length));
    return { changed, status: aborted ? 'interrupted' : note ? 'incomplete' : 'complete', text: lastWasText ? lastText : '', ...(note ? { note } : {}) };
  } finally {
    transcript.running = false;
    deps.signal?.removeEventListener('abort', hangUp);
    await release();
  }
}
