import { z } from 'zod';
import { commitSchema, DomainError, invariant, type Command, type Slide } from '../domain/model.js';
import { inspectSlide } from '../domain/html.js';
import type { AiProvider } from './ai-provider.js';
export const aiEditSchema = z.object({
  slideId: z.string().min(1).max(100),
  intent: z.enum(['insert-interactive', 'edit-selection']),
  instruction: z.string().min(1).max(2000),
  targets: z.array(z.string().min(1).max(100)).max(200).default([]),
  baseVersion: z.number().int().positive().optional(),
});
export type AiEditRequest = z.infer<typeof aiEditSchema>;
/** The model may only reach for commands that change page content. Everything that changes
 * the deck, the masters, the asset store or executes vector/source edits stays out. */
const INSERT_COMMANDS = ['element.insert', 'slide.insert', 'elements.transfer', 'slide.delete', 'component.set'] as const;
const EDIT_COMMANDS = ['element.patch', 'element.content', 'element.insert', 'element.delete', 'component.set', 'component.remove'] as const;
export const aiCommandsFor = (intent: AiEditRequest['intent']): readonly string[] =>
  intent === 'insert-interactive' ? INSERT_COMMANDS : EDIT_COMMANDS;
type Described = { id: string; parent?: string };
/** A local edit may touch the selected objects and whatever lives inside them, nothing else. */
export function scopeIds(objects: readonly Described[], targets: readonly string[]): Set<string> {
  const children = new Map<string, string[]>();
  for (const object of objects)
    if (object.parent) children.set(object.parent, [...(children.get(object.parent) ?? []), object.id]);
  const scope = new Set<string>(), pending = [...targets];
  while (pending.length) {
    const id = pending.pop()!;
    if (scope.has(id)) continue;
    scope.add(id);
    pending.push(...(children.get(id) ?? []));
  }
  return scope;
}
/** Everything the model produced has to survive this before a human ever sees it. */
export function checkAiCommands(
  commands: readonly Command[],
  context: { intent: AiEditRequest['intent']; slideId: string; scope: Set<string> },
) {
  const allowed = new Set<string>(aiCommandsFor(context.intent));
  // Inserting an interaction needs a throwaway page to carry the component definition, so
  // slides created inside this same batch are addressable; no other page is.
  const created = new Set(
    commands.flatMap(command => (command.type === 'slide.insert' ? [command.slide.id] : [])),
  );
  for (const command of commands) {
    invariant(allowed.has(command.type), 'AI_COMMAND_NOT_ALLOWED', `不允许的命令：${command.type}`);
    const slideId = 'slideId' in command ? (command.slideId as string) : undefined;
    if (slideId !== undefined)
      invariant(
        slideId === context.slideId || created.has(slideId),
        'AI_SLIDE_OUT_OF_SCOPE',
        `命令指向了其它页面：${slideId}`,
      );
    if ('sourceSlideId' in command)
      invariant(
        created.has(command.sourceSlideId as string),
        'AI_SLIDE_OUT_OF_SCOPE',
        '搬运只能来自本批新建的临时页面',
      );
    if (command.type === 'slide.delete')
      invariant(created.has(command.slideId), 'AI_SLIDE_OUT_OF_SCOPE', '只能删除本批新建的临时页面');
    if (context.intent !== 'edit-selection') continue;
    const inScope = (id: string, what: string) =>
      invariant(context.scope.has(id), 'AI_TARGET_OUT_OF_SCOPE', `${what}不在选中范围内：${id}`);
    if ('target' in command && typeof command.target === 'string') inScope(command.target, '目标对象');
    if (command.type === 'element.insert' && command.parent) inScope(command.parent, '插入位置');
    if (command.type === 'component.set') inScope(command.component.root, '组件根');
  }
}
/** What the model gets to see: one line per object, no serialized html. */
export function describeSlide(slide: Slide) {
  return inspectSlide(slide).map(object => ({
    id: object.id,
    tag: object.tag,
    parent: object.parent,
    kind: object.kind,
    text: object.text?.slice(0, 120),
    style: object.style,
    attributes: object.attributes,
  }));
}
const SYSTEM = `你是 Notale 讲义编辑器的编辑助手。你只能输出一个 JSON 对象：{"commands":[...]}，不要任何解释文字。

命令词表（其余一律不可用）：
- element.patch {type,slideId,target,patch:{text?,style?,attributes?}} 改一个对象的文字/样式/属性。style 用 kebab-case CSS 属性名。
- element.content {type,slideId,target,html} 替换一个对象的内部结构。
- element.insert {type,slideId,html,parent?} 插入新内容；id 由服务端分配，不要自己写 data-notale-id。
- element.delete {type,slideId,target}
- component.set {type,slideId,component} 定义交互；component 形如
  {id,root,name,initial,states:[{id,name,patches:{对象id:{text?,style?,visible?}}}],events:[{id,target,event:"click"|"pointerenter"|"pointerleave",from?,to}]}
- slide.insert / elements.transfer / slide.delete：插入交互时的三步事务，见下。

硬性限制：
- 不能写 <script>、<base>、任何 on* 事件属性、javascript: 链接。交互一律用 component.set 表达，不要写脚本。
- component 的 root、事件目标、补丁目标必须都在 root 子树内；initial 必须是某个 state 的 id；两个组件不能改同一个对象的同一个属性。
- 对象绝对定位：style 里带 position:absolute 和 left/top/width/height（单位 px）。

插入一个交互元素时，用这个三步事务（因为 element.insert 不能携带 component，且会重分配 id）。
字段必须完全按下面写，多写一个字段就会被拒绝：
1. {"type":"slide.insert","after":"<当前页id>","slide":{"id":"ai-temp","name":"临时","sourcePath":"ai-temp.html",
   "html":"<html><body><main id=\"stage\" data-notale-id=\"ai-stage\">…你的内容，每个元素自己写 data-notale-id…</main></body></html>",
   "components":[…组件定义…]}}
2. {"type":"elements.transfer","slideId":"<当前页id>","sourceSlideId":"ai-temp","targets":["<根对象id>"],"mode":"cut",
   "rectangles":[{"id":"<根对象id>","x":120,"y":160,"width":640,"height":340}]}
   —— 只有这几个字段，没有 parent、没有 index。
3. {"type":"slide.delete","slideId":"ai-temp"}`;
function prompt(request: AiEditRequest, slide: Slide, objects: ReturnType<typeof describeSlide>, width: number, height: number, theme: unknown) {
  const scoped = request.intent === 'edit-selection' && request.targets.length
    ? `\n只允许改这些对象及其内部：${request.targets.join(', ')}。其它对象一律不要动。`
    : '';
  return [
    `页面 ${request.slideId}（画布 ${width}×${height}），主题变量：${JSON.stringify(theme)}`,
    `页面对象：\n${JSON.stringify(objects)}`,
    `要求：${request.instruction}${scoped}`,
  ].join('\n\n');
}
/** Tolerant extraction: models fence JSON even when told not to. */
export function parseCommands(text: string): Command[] {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const body = (fenced ? fenced[1] : text).trim();
  const start = body.indexOf('{');
  invariant(start >= 0, 'AI_BAD_OUTPUT', '模型没有返回 JSON');
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.slice(start));
  } catch {
    throw new DomainError('AI_BAD_OUTPUT', '模型返回的不是合法 JSON', 422);
  }
  const shape = z.object({ commands: z.array(z.unknown()).min(1).max(500) }).safeParse(parsed);
  invariant(shape.success, 'AI_BAD_OUTPUT', '模型返回里没有 commands 数组');
  return shape.data.commands as Command[];
}
export interface AiStep { label: string; status: 'active' | 'done'; }
export interface AiEditDeps {
  provider: AiProvider;
  snapshot: (baseVersion?: number) => Promise<{ version: number; document: { width: number; height: number; theme: unknown; slides: Slide[] } }>;
  prepare: (input: { baseVersion: number; mutationId: string; commands: Command[] }) => Promise<unknown>;
  mutationId: () => string;
  attempts?: number;
  /** Called at each real node the pipeline passes through, in order. Optional: callers that
   * don't care about progress (tests, the offline gate checks) just omit it. */
  report?: (step: AiStep) => void;
}
/** Produce a candidate. This never commits: the caller applies it, or throws it away. */
export async function aiEdit(request: AiEditRequest, deps: AiEditDeps) {
  const report = deps.report ?? (() => {});
  invariant(deps.provider.available, 'AI_UNCONFIGURED', deps.provider.reason, 503);
  const source = await deps.snapshot(request.baseVersion);
  const slide = source.document.slides.find(entry => entry.id === request.slideId);
  invariant(slide, 'SLIDE_NOT_FOUND', `页面不存在：${request.slideId}`, 404);
  report({ label: '读取页面对象', status: 'active' });
  const objects = describeSlide(slide);
  const scope = scopeIds(objects, request.targets);
  if (request.intent === 'edit-selection')
    invariant(scope.size > 0, 'AI_NO_TARGET', '局部修改需要先选中对象');
  report({ label: '读取页面对象', status: 'done' });
  const baseVersion = source.version;
  let failure = '';
  for (let attempt = 0; attempt < (deps.attempts ?? 2); attempt++) {
    const mutationId = deps.mutationId();
    const label = attempt === 0 ? '请求模型' : `请求模型（第 ${attempt + 1} 次尝试）`;
    report({ label, status: 'active' });
    const text = await deps.provider.complete({
      system: SYSTEM,
      user: prompt(request, slide, objects, source.document.width, source.document.height, source.document.theme)
        + (failure ? `\n\n上一次尝试被拒绝：${failure}\n请修正后重新输出。` : ''),
    });
    report({ label, status: 'done' });
    try {
      report({ label: '解析与校验', status: 'active' });
      const commands = parseCommands(text);
      const commit = commitSchema.parse({ baseVersion, mutationId, commands });
      checkAiCommands(commit.commands, { intent: request.intent, slideId: request.slideId, scope });
      report({ label: '解析与校验', status: 'done' });
      report({ label: '服务端试跑', status: 'active' });
      const preview = await deps.prepare(commit);
      report({ label: '服务端试跑', status: 'done' });
      return { mutationId, baseVersion, commands: commit.commands, preview, model: deps.provider.model };
    } catch (cause) {
      failure = cause instanceof Error ? cause.message : String(cause);
      if (cause instanceof DomainError && cause.status >= 500) throw cause;
    }
  }
  throw new DomainError('AI_REJECTED', `模型没能给出可用的修改：${failure}`, 422);
}
