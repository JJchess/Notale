/** The template Director owns a separate model contract; the Planner is unchanged. */
import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { DomUtils } from 'htmlparser2';
import { preparePptx, TEMPLATE_SPEC, elements, xml, serialize, digest, type PreparedTemplate } from './pptx-template.js';
import type { DirectorRequest, DirectorPorts } from './director.js';
import type { ChatMessage, ChatInputBlock } from '../adapters/models/chat-model.js';
import { chatTools, objectArguments } from './planning.js';
import { inventory } from './style-assets.js';
import { RESOURCES, visualSlopBlock, fill, FONT_FLOOR } from './guidance.js';
import { workflowNotice, observedStep } from './workflow-progress.js';

const id = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/);
const slotSchema = z.object({ id, purpose: z.enum(['title', 'body', 'metadata']), x: z.number().nonnegative(), y: z.number().nonnegative(), width: z.number().positive(), height: z.number().positive(), required: z.boolean() }).strict();
const layoutSchema = z.object({ id, source: id, workflows: z.array(z.enum(['build-cover', 'build-page', 'build-interaction'])).min(1), replaceObjects: z.array(id), slots: z.array(slotSchema).min(1) }).strict();
export const templateSubmissionSchema = z.object({ themeCss: z.string().min(1), layouts: z.array(layoutSchema).min(1).max(60) }).strict();
export type TemplateLayout = z.infer<typeof layoutSchema> & { fixedPath: string; fixedHash: string };
export interface TemplateSpec { schemaVersion: 1; mode: 'template'; sourceHash: string; layouts: TemplateLayout[] }

export function validateTemplateSubmission(input: unknown, prepared: PreparedTemplate) {
  const result = templateSubmissionSchema.parse(input), ids = new Set<string>();
  for (const layout of result.layouts) {
    if (ids.has(layout.id)) throw new Error('版式 ID 重复'); ids.add(layout.id);
    const source = prepared.slides.find(s => s.id === layout.source); if (!source) throw new Error(`未知模板页 ${layout.source}`);
    if (new Set(layout.replaceObjects).size !== layout.replaceObjects.length || layout.replaceObjects.some(id => !source.objects.some(o => o.id === id))) throw new Error(`${layout.id} 引用了无效替换对象`);
    const slots = new Set<string>();
    for (const slot of layout.slots) {
      if (slots.has(slot.id) || slot.x + slot.width > 1600 || slot.y + slot.height > 900) throw new Error(`${layout.id} 区域重复或越出画布`);
      slots.add(slot.id);
    }
    if (!layout.slots.some(s => s.purpose === 'title' && s.required)) throw new Error(`${layout.id} 需要必填标题区域`);
    if (layout.workflows.some(w => w !== 'build-cover') && !layout.slots.some(s => s.purpose === 'body' && s.required)) throw new Error(`${layout.id} 需要必填内容区域`);
  }
  for (const workflow of ['build-cover', 'build-page', 'build-interaction']) if (!result.layouts.some(l => (l.workflows as string[]).includes(workflow))) throw new Error(`缺少适用于 ${workflow} 的版式；可复用同一版式`);
  return result;
}

export async function directTemplate(run: DirectorRequest, ports: DirectorPorts, signal?: AbortSignal) {
  if (!ports.visionInput) throw new Error('模板 Director 需要支持图像输入的模型');
  const assets = path.join(run.root, 'pages/assets'), input = path.join(run.root, 'template-input');
  const prepared = await observedStep(ports.progress, 'director', 'template-convert', 'PPTX 模板转换', () => preparePptx(run.template!, input, signal));
  for (const warning of prepared.warnings) workflowNotice(ports.progress, 'director', 'template-warning', 'completed', warning);
  const imported = path.join(assets, 'template'); await mkdir(imported, { recursive: true });
  await cp(path.join(input, 'assets'), path.join(imported, 'assets'), { recursive: true });
  const fontRows = Object.entries(inventory()).filter(([key]) => /noto-sans-sc|noto-serif-sc|inter|source-han|source-sans/.test(key));
  const fonts = fontRows.map(([key, row]) => ({ id: key, ...row }));
  const templatePrompt = await readFile(path.join(run.prompts ?? path.join(RESOURCES, 'prompts'), 'style-template.md'), 'utf8');
  const instructions = [fill(templatePrompt, { font_floor: FONT_FLOOR }, 'style-template.md'), visualSlopBlock(run.workflowRoot)].join('\n\n');
  const history: ChatMessage[] = [{ role: 'user', content: [
    { type: 'text', text: `课程：${run.query}\n学习者：${run.audience}\n场合：${run.scenario || '未指定'}\n额外视觉要求：${run.style || '遵循模板'}\n模板对象（坐标已映射到 1600×900；没有列出的背景仍会保留）：\n${JSON.stringify(prepared.slides.map(({ id, objects, placeholders }) => ({ id, objects, placeholders })))}\n可用完整字体（CSS URL 用 fonts/library/<id>/<file>）：\n${JSON.stringify(fonts)}\n转换说明：${prepared.warnings.join('；')}` },
    ...await ports.images(prepared.slides.map(s => ({ id: s.id, shot: path.join(input, s.preview) }))),
  ] as ChatInputBlock[] }];
  const tools = chatTools([{ type: 'function', name: 'SubmitTemplateStyle', description: '共同提交模板主题和完整的可复用版式；保留原始品牌与固定骨架。', parameters: z.toJSONSchema(templateSubmissionSchema) }]);
  for (let attempt = 0; attempt < 3; attempt++) {
    signal?.throwIfAborted();
    workflowNotice(ports.progress, 'director', 'template-style', 'started', '正在识别模板固定元素与可替换区域');
    const request: ChatMessage[] = [{ role: 'system', content: instructions }, ...history], started = new Date().toISOString();
    const response = await ports.model.respond(request, tools, signal);
    await ports.trace({ step: 'template-style', started, finished: new Date().toISOString(), request, response });
    history.push(response.message);
    const calls = response.message.tool_calls ?? [];
    let error = '';
    try {
      if (calls.length !== 1 || calls[0]!.function.name !== 'SubmitTemplateStyle') throw new Error('须调用一次 SubmitTemplateStyle 提交主题和版式');
      const submitted = validateTemplateSubmission(objectArguments(calls[0]!.function.arguments), prepared);
      const css = submitted.themeCss + '\n' + prepared.fontCss.replaceAll('url("assets/', 'url("template/assets/');
      await ports.theme.prepareFonts(css, assets);
      const bad = await ports.theme.gates(css, assets); if (bad.length) throw new Error(bad.join('；'));
      const layouts: TemplateLayout[] = [];
      for (const layout of submitted.layouts) {
        const slide = prepared.slides.find(s => s.id === layout.source)!, root = xml(await readFile(path.join(input, slide.svg), 'utf8'));
        for (const node of elements(root)) if (layout.replaceObjects.includes(node.attribs.id ?? '')) DomUtils.removeElement(node);
        // Keep source SVG URLs relative; assembly rebases them for the HTML page.
        const fixed = serialize(root);
        const fixedPath = `assets/template/${layout.id}.svg`;
        await writeFile(path.join(run.root, 'pages', fixedPath), fixed);
        layouts.push({ ...layout, fixedPath, fixedHash: digest(fixed) });
      }
      const spec: TemplateSpec = { schemaVersion: 1, mode: 'template', sourceHash: prepared.sha256, layouts };
      await ports.theme.publish(css, path.join(assets, 'theme.css'));
      await writeFile(path.join(run.root, TEMPLATE_SPEC), JSON.stringify(spec, null, 2));
      workflowNotice(ports.progress, 'director', 'template-style', 'completed', `模板主题与 ${layouts.length} 种版式已通过校验`);
      return { route: 'template', model_calls: attempt + 1, layouts: layouts.length };
    } catch (cause) { if (signal?.aborted) throw signal.reason; error = cause instanceof Error ? cause.message : String(cause); }
    workflowNotice(ports.progress, 'director', 'template-style', 'reworking', '模板提交未通过检查，继续调整');
    if (calls.length) for (const call of calls) history.push({ role: 'tool', tool_call_id: call.id, content: error });
    else history.push({ role: 'user', content: error });
    await writeFile(path.join(run.root, 'template.rejected.json'), JSON.stringify({ error, attempt: attempt + 1 }));
    if (attempt === 2) throw new Error(`模板 Director 交付失败：${error}`);
  }
  throw new Error('模板 Director 未完成交付');
}
