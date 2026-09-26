import type { Preview } from './attachments.js';

/** What one message is: a new deck, a change to one this session made, a question back, or a reply.
 * Decided by one model call that submits `Route` (the way the planner submits FinalizePlan); what
 * happens after is plain code. */
export type Route =
  | { action: 'generate'; reason: string; query: string; minutes?: number; audience?: string; scenario?: string; language?: string; style?: string;
      files: { id: string; role: 'material' | 'template' | 'style-reference' }[] }
  | { action: 'fix'; reason: string; target: string; instruction: string; page?: number; files: { id: string; role: 'reference-image' }[] }
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
      query: { type: 'string', description: 'generate：整理后的讲义主题与要求，不是原话照抄' },
      minutes: { type: 'integer', description: 'generate：作者说了课时/时长才填，单位分钟' },
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
          role: { type: 'string', enum: ['material', 'template', 'style-reference', 'reference-image'] },
        }, required: ['id', 'role'] },
      },
    },
    required: ['action', 'reason'],
  },
} as const;

export const SYSTEM = `你是 Notale 的入口。作者发来一条消息（可能带附件），你判断它要做什么，然后调用 Route 提交。只调用一次，不要输出别的。

两件能做的事：
- generate：做一份新的互动讲义。
- fix：修改这个会话里已经做出来的某一份讲义（只能改下面「本会话的讲义」里列出的，不能改附件里的文件）。

附件的用途：
- material（素材）：提供讲义的内容，例如论文、教材、笔记、数据截图。
- template（模板）：提供版式，讲义要照它的样子排。只可能是 PPTX。作者会说「照这个模板/样式做」，或者这份 PPTX 基本是占位文字和版式。
- style-reference（风格参考）：一张图片，提供配色、字体、气质，不提供内容。作者会说「按这张图的风格」「参考这个感觉」。
- reference-image（fix 时的参考图）：修改时作者给的图，例如「把这页改成图里这样」。

判断依据：
- 会话里还没有讲义时，不可能是 fix。
- 同一份 PPTX，作者说「照它的样子讲 X」是 template；说「把这份 PPT 做成讲义」「根据这份 PPT 的内容」是 material。说不清就 ask。
- 作者说「改一下」「这一页」「上一份」等，指的是本会话最近的一份讲义；有多份又分不清指哪份就 ask。
- 能从消息里读出来的就填，读不出来的字段不填，交给后面的流程按默认处理。不要编造作者没说的要求。
- 上一轮你问过作者一个问题时，这条消息多半是在回答它；上一轮的附件还在，照回答确定它们的用途。
- 拿不准要做什么、或附件用途有两种都说得通的理解时，ask，不要猜。
- 寒暄、问怎么用、问已有讲义的内容而不要求改动：reply。`;

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
      }
      if (roles.filter(r => r.role === 'template').length > 1) return ask('一次只能用一个模板，用哪一份？');
      const optional = { minutes: int('minutes'), audience: str('audience'), scenario: str('scenario'), language: str('language'), style: str('style') };
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
      const extra = input.files.filter(f => f.kind !== 'image');
      if (extra.length) return ask(`修改时只能附图片作参考，「${extra[0]!.name}」要用来做什么？`);
      return { action: 'fix', reason, target: artifact.runId, instruction, ...(page && page <= artifact.pages.length ? { page } : {}),
        files: input.files.map(f => ({ id: f.id, role: 'reference-image' as const })) };
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
export type Complete = (input: { systemPrompt: string; messages: unknown[]; tools: unknown[] }) => Promise<{ content: ({ type: 'text'; text: string } | { type: 'toolCall'; name: string; arguments: Record<string, unknown> } | { type: string })[]; stopReason?: string; errorMessage?: string }>;

export async function understand(input: Understanding, complete: Complete): Promise<Route> {
  const content = [
    { type: 'text', text: brief(input) },
    // The first page of a PDF and every image are shown, not described: a template or a style
    // reference is told apart by how it looks.
    ...input.files.flatMap(f => f.image ? [{ type: 'text', text: `附件 ${f.id} 的样子：` }, { type: 'image', data: f.image.data, mimeType: f.image.mime }] : []),
  ];
  const message = await complete({ systemPrompt: SYSTEM, messages: [{ role: 'user', content, timestamp: Date.now() }], tools: [ROUTE_TOOL] });
  if (message.stopReason === 'error') throw new Error(`理解阶段的模型调用失败：${message.errorMessage ?? ''}`);
  const call = message.content.find((part): part is { type: 'toolCall'; name: string; arguments: Record<string, unknown> } => part.type === 'toolCall' && (part as { name?: string }).name === 'Route');
  if (call) return validate(call.arguments, input);
  // Words and no Route: the model answered instead of deciding -- treat it as a reply.
  const text = message.content.flatMap(part => part.type === 'text' ? [(part as { text: string }).text] : []).join('').trim();
  return { action: 'reply', reason: '', text: text || '能再说具体一点吗？' };
}

/** The understanding stage's one model call, through the fix agent's model (the generator's model;
 * model choice is locked for this project). Resolved per call, so a server starts without a key. */
export function modelComplete(model: () => import('../fix/istar.js').FixModel): Complete {
  return async ({ systemPrompt, messages, tools }) => {
    const runtime = model();
    return await (await runtime.streamFn(runtime.model, { systemPrompt, messages, tools } as never, {})).result() as Awaited<ReturnType<Complete>>;
  };
}
