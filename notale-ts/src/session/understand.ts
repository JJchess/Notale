import type { Preview } from './attachments.js';
import { normalizeTitle, TITLE_INSTRUCTION } from '../core/title.js';

/** What one message is: a new deck, a change to one this session made, a question back, or a reply.
 * Decided by one model call that submits `Route` (the way the planner submits Submit); what
 * happens after is plain code. */
export type Route =
  | { action: 'generate'; reason: string; query: string; title?: string; minutes?: number; audience?: string; scenario?: string; language?: string; style?: string;
      files: { id: string; role: 'material' | 'template' | 'style-reference' }[] }
  | { action: 'fix'; reason: string; target: string; instruction: string; page?: number; files: { id: string; role: 'reference' }[] }
  | { action: 'ask'; reason: string; question: string; options?: string[] }
  | { action: 'reply'; reason: string; text: string };

export interface Artifact { runId: string; kind: 'generate' | 'fix'; title: string; pages: string[] }
export interface Understanding { text: string; history: string[]; artifacts: Artifact[]; files: Preview[] }

/** The one tool the model answers with. Every field it can fill is here; `reason` is shown to the
 * author as the reading the system went with. */
export const ROUTE_TOOL = {
  name: 'Route',
  description: '提交你对这条消息的理解。只调用一次。',
  parameters: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['generate', 'fix', 'ask', 'reply'], description: 'generate=做一份新讲义；fix=修改本会话已有的一份讲义；ask=信息不够或有歧义，先问作者；reply=不需要生成也不需要修改' },
      reason: { type: 'string', description: '一句话：你为什么这样理解，会展示给作者' },
      query: { type: 'string', description: 'generate：作者的原话，只去掉已填进 minutes、audience 等字段的部分，不改写、不扩写' },
      title: { type: 'string', description: `generate：${TITLE_INSTRUCTION}` },
      minutes: { type: 'integer', description: 'generate：单位分钟。作者说了时长就填；没说时长但说了场合（如大学一节课、初二物理课），按该场合的一次课填（大学一次课通常两节连上，约 90 分钟；中小学一节约 45 分钟，说了连堂就按连堂），并在 reason 里写出按多少分钟理解；都没说就不填' },
      audience: { type: 'string', description: 'generate：作者说了受众才填' },
      scenario: { type: 'string', description: 'generate：使用场景或其他要求（作者说了才填）' },
      language: { type: 'string', description: 'generate：讲义文字的语言，作者指定或素材明显是某种语言时填，例如 English' },
      style: { type: 'string', description: 'generate：作者用文字描述的风格，没说就不填' },
      target: { type: 'string', description: 'fix：要改的那份讲义的 runId，只能从本会话已有讲义里选' },
      instruction: { type: 'string', description: 'fix：要怎么改，写清楚改哪里' },
      page: { type: 'integer', description: 'fix：主要改第几页（从 1 开始），说不出具体页就不填' },
      question: { type: 'string', description: 'ask：问作者的一句话' },
      options: { type: 'array', items: { type: 'string' }, description: 'ask：可选的回答，2–4 个' },
      text: { type: 'string', description: 'reply：回给作者的话' },
      files: {
        type: 'array', description: '每个附件的用途，每个附件都要出现一次',
        items: { type: 'object', properties: {
          id: { type: 'string' },
          role: { type: 'string', enum: ['material', 'template', 'style-reference', 'reference'], description: 'material=提供内容；template=要照着排版的 PPTX（“照这个样子讲 X”；把 PPT 本身做成讲义则是 material）；style-reference=只借风格的图片；reference=修改时给的参考' },
        }, required: ['id', 'role'] },
      },
    },
    required: ['action', 'reason'],
  },
} as const;

export const SYSTEM = `你是 Notale 的入口：读作者这条消息和附件，调用一次 Route 说明要做什么。只填作者说了的内容，不补作者没提的要求；拿不准就 ask。生成讲义时填写 title，标题可根据作者的主题概括。`;

/** The model's view of this message: what was said before, what exists, what came attached. */
export function brief(input: Understanding): string {
  const artifacts = input.artifacts.length
    ? input.artifacts.map((a, index) => `${index + 1}. runId=${a.runId}（${a.kind === 'generate' ? '生成' : '修改'}）《${a.title}》，${a.pages.length} 页：${a.pages.slice(0, 30).map((t, i) => `${i + 1}.${t}`).join(' ')}`).join('\n')
    : '（还没有）';
  const files = input.files.length ? input.files.map(f => `- id=${f.id}「${f.name}」${f.summary}`).join('\n') : '（没有附件）';
  return `<history>\n${input.history.join('\n') || '（这是第一条消息）'}\n</history>\n\n<本会话的讲义>\n${artifacts}\n</本会话的讲义>\n\n<附件>\n${files}\n</附件>\n\n<作者这条消息>\n${input.text}\n</作者这条消息>`;
}

/** Checks the submitted route against what exists, so a bad route becomes a question, not a wrong
 * dispatch: every attachment has a legal role, a fix targets one of this session's decks. */
export function validate(args: Record<string, unknown>, input: Understanding): Route {
  const reason = typeof args.reason === 'string' ? args.reason : '';
  const str = (key: string) => typeof args[key] === 'string' && (args[key] as string).trim() ? (args[key] as string).trim() : undefined;
  const int = (key: string) => typeof args[key] === 'number' && Number.isInteger(args[key]) && (args[key] as number) > 0 ? args[key] as number : undefined;
  const ids = new Set(input.files.map(f => f.id));
  const files = Array.isArray(args.files) ? (args.files as { id?: unknown; role?: unknown }[]).filter(f => typeof f.id === 'string' && ids.has(f.id)) : [];
  const roleOf = new Map(files.map(f => [f.id as string, f.role]));
  const ask = (question: string): Route => ({ action: 'ask', reason, question });
  switch (args.action) {
    case 'generate': {
      const query = str('query');
      if (!query) return ask('想做一份关于什么的讲义？');
      const roles = input.files.map(f => ({ id: f.id, role: roleOf.get(f.id) }));
      const bad = roles.find(r => !['material', 'template', 'style-reference'].includes(String(r.role)));
      if (bad) return ask(`「${input.files.find(f => f.id === bad.id)!.name}」是要当素材、模板，还是风格参考？`);
      for (const r of roles) {
        const file = input.files.find(f => f.id === r.id)!;
        if (r.role === 'template' && file.kind !== 'pptx') return ask(`模板只能是 PPTX，「${file.name}」要当素材还是风格参考？`);
        if (r.role === 'style-reference' && file.kind !== 'image') return ask(`风格参考只能是图片，「${file.name}」要当素材吗？`);
        if (file.kind === 'video') return ask(`视频目前只能在修改讲义时作参考，还不能用来生成。「${file.name}」要先做一份讲义，再照视频修改吗？`);
      }
      if (roles.filter(r => r.role === 'template').length > 1) return ask('一次只能用一个模板，用哪一份？');
      const optional = { title: normalizeTitle(args.title), minutes: int('minutes'), audience: str('audience'), scenario: str('scenario'), language: str('language'), style: str('style') };
      return { action: 'generate', reason, query, ...Object.fromEntries(Object.entries(optional).filter(([, v]) => v !== undefined)),
        files: roles.map(r => ({ id: r.id, role: r.role as 'material' | 'template' | 'style-reference' })) };
    }
    case 'fix': {
      const target = str('target'), instruction = str('instruction');
      if (!input.artifacts.length) return ask('这个会话里还没有讲义，要先做一份吗？');
      const artifact = input.artifacts.find(a => a.runId === target) ?? (input.artifacts.length === 1 ? input.artifacts[0] : undefined);
      if (!artifact) return ask('要改的是哪一份讲义？');
      if (!instruction) return ask('想怎么改？');
      const page = int('page');
      // Anything attached to a change is a reference the fix agent reads (images inline, the rest with read).
      return { action: 'fix', reason, target: artifact.runId, instruction, ...(page && page <= artifact.pages.length ? { page } : {}),
        files: input.files.map(f => ({ id: f.id, role: 'reference' as const })) };
    }
    case 'ask': {
      const question = str('question') ?? '能再说具体一点吗？';
      const options = Array.isArray(args.options) ? (args.options as unknown[]).filter((o): o is string => typeof o === 'string').slice(0, 4) : [];
      return { action: 'ask', reason, question, ...(options.length ? { options } : {}) };
    }
    case 'reply': return { action: 'reply', reason, text: str('text') ?? reason };
    default: return ask('能再说具体一点吗？');
  }
}

/** A model call as the pi fork makes it: a system prompt, messages, tools; returns the assistant
 * message. Injected so tests can script it. */
export type Complete = (input: { systemPrompt: string; messages: unknown[]; tools: unknown[] }, signal?: AbortSignal) => Promise<{ content: ({ type: 'text'; text: string } | { type: 'toolCall'; name: string; arguments: Record<string, unknown> } | { type: string })[]; stopReason?: string; errorMessage?: string }>;

export async function understand(input: Understanding, complete: Complete, signal?: AbortSignal): Promise<Route> {
  const content = [
    { type: 'text', text: brief(input) },
    // The first page of a PDF and every image are shown, not described: a template or a style
    // reference is told apart by how it looks.
    ...input.files.flatMap(f => f.image ? [{ type: 'text', text: `附件 ${f.id} 的样子：` }, { type: 'image', data: f.image.data, mimeType: f.image.mime }] : []),
  ];
  const message = await complete({ systemPrompt: SYSTEM, messages: [{ role: 'user', content, timestamp: Date.now() }], tools: [ROUTE_TOOL] }, signal);
  signal?.throwIfAborted();
  if (message.stopReason === 'error') throw new Error(`理解阶段的模型调用失败：${message.errorMessage ?? ''}`);
  const call = message.content.find((part): part is { type: 'toolCall'; name: string; arguments: Record<string, unknown> } => part.type === 'toolCall' && (part as { name?: string }).name === 'Route');
  if (call) return validate(call.arguments, input);
  // Words and no Route: the model answered instead of deciding -- treat it as a reply.
  const text = message.content.flatMap(part => part.type === 'text' ? [(part as { text: string }).text] : []).join('').trim();
  return { action: 'reply', reason: '', text: text || '能再说具体一点吗？' };
}

/** The understanding stage uses the model captured for this turn. */
export function modelComplete(model: () => import('../fix/istar.js').FixModel): Complete {
  return async ({ systemPrompt, messages, tools }, signal) => {
    const runtime = model();
    return await (await runtime.streamFn(runtime.model, { systemPrompt, messages, tools } as never, { signal })).result() as Awaited<ReturnType<Complete>>;
  };
}
