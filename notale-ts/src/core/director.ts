import { workflowNotice, observedStep, type ProgressObserver } from './workflow-progress.js';
import { parsePythonJson } from './json.js';
/** Style Director orchestration port. Resource and browser gates are required ports, never bypassed. */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ChatInputBlock, ChatMessage, ChatModel, ToolCall } from '../adapters/models/chat-model.js';
import { PLANNER_IDENTITY, plannerPrompt, resolvePath } from './planner-contract.js';
import { chatTools, errorOutput, objectArguments, plannerInstructions, type MediaOutput, type PlanningRequest, type WorkflowTrace } from './planning.js';
import { stripText, splitLines } from './text.js';
import { valueError } from './theme.js';
import * as guidance from './guidance.js';

const TRIES = 3;
const resourceFailure = (error: unknown): boolean => error instanceof Error && (['ValueError', 'UnicodeDecodeError', 'UnicodeEncodeError', 'JSONDecodeError', 'OSError', 'FileNotFoundError', 'PermissionError', 'IsADirectoryError', 'NotADirectoryError', 'FileExistsError', 'TimeoutError'].includes(error.name) || /^E[A-Z]+$/.test((error as NodeJS.ErrnoException).code ?? ''));
const runtimeError = (message: string): Error => Object.assign(new Error(message), { name: 'RuntimeError' });
export interface DirectorRequest extends PlanningRequest { style?: string; template?: string }
export interface StyleInput { text: string; images: ChatInputBlock[] }
export interface ReferenceImage { id: string; shot: string }
export interface DirectorPorts {
  progress?: ProgressObserver;
  model: Pick<ChatModel, 'respond'>;
  visionInput: boolean;
  trace(record: WorkflowTrace): void | Promise<void>;
  catalog: {
    rows(): string[][];
    match(request?: string): string | undefined;
    identify(value: unknown): string;
    readPath(value: string): string;
    selectionInputs(): Promise<StyleInput>;
    selectedInputs(ids: string[]): Promise<StyleInput>;
    inputs(request?: string): Promise<StyleInput>;
    detail(value: unknown): Promise<StyleInput>;
  };
  images(refs: ReferenceImage[], width?: number): Promise<ChatInputBlock[]>;
  media(name: string, args: Record<string, unknown>, pages: string, owner: string, signal?: AbortSignal): Promise<MediaOutput>;
  theme: {
    checkOptions(template: string | undefined, style: string | undefined, enabled: boolean): void;
    importInput(source: string | undefined, assets: string, allowRepair: boolean, request: string): Promise<{ css: string; shots: string[] }>;
    importedAssets(assets: string): Promise<string[]>;
    prepareFonts(css: string, assets: string): Promise<unknown>;
    referenceImages(css: string, assets: string): Promise<unknown>;
    references(css: string): Array<[string, string]>;
    gates(css: string, assets: string): Promise<string[]>;
    publish(css: string, target: string): Promise<void>;
  };
}
export function writeSpec(target: string) {
  return chatTools([{ type: 'function', name: 'Write', description: '提交完整文件，不是补丁', parameters: {
    type: 'object', properties: { file_path: { type: 'string', description: `只能是 ${target}` }, content: { type: 'string' } },
    required: ['file_path', 'content'], additionalProperties: false,
  } }]);
}
export function oneWrite(calls: ToolCall[], target: string): { css: string | undefined; bad: string[] } {
  const writes = calls.filter(call => call.function.name === 'Write');
  if (writes.length !== 1) return { css: undefined, bad: [`每次提交恰好一个 Write；实际 ${writes.length} 个`] };
  try {
    const args: unknown = parsePythonJson(writes[0]!.function.arguments);
    if (!args || typeof args !== 'object' || Array.isArray(args) || Object.keys(args).sort().join(',') !== 'content,file_path') throw valueError('Write 参数必须是含 file_path/content 的 JSON 对象');
    const input = args as Record<string, unknown>;
    if (typeof input.file_path !== 'string' || typeof input.content !== 'string') throw valueError('Write 路径和内容必须是字符串');
    if (resolvePath(input.file_path) !== resolvePath(target)) throw valueError(`只能写 ${target}`);
    if (!stripText(input.content)) throw valueError('Write 内容不能为空');
    return { css: input.content, bad: [] };
  } catch (error) { if (!resourceFailure(error) && !(error instanceof TypeError) && (error as Error)?.name !== 'TypeError') throw error; return { css: undefined, bad: [(error as Error).message] }; }
}
export async function direct(run: DirectorRequest, ports: DirectorPorts, signal?: AbortSignal) {
  if (run.template && path.extname(run.template).toLowerCase() === '.pptx') {
    ports.theme.checkOptions(run.template, run.style, run.styleDirector ?? true);
    const { directTemplate } = await import('./template-style.js');
    return directTemplate(run, ports, signal);
  }
  const assets = path.join(run.root, 'pages/assets');
  const target = path.join(assets, 'theme.css');
  const workflowRoot = run.workflowRoot ?? guidance.WORKFLOWS;
  const styleDirector = run.styleDirector ?? true;
  ports.theme.checkOptions(run.template, run.style, styleDirector);
  const originalTheme = ports.theme;
  ports = { ...ports, theme: { ...ports.theme,
    prepareFonts: (...args) => observedStep(ports.progress, 'director', 'fonts', '字体准备', () => originalTheme.prepareFonts(...args)),
    gates: async (...args) => {
      workflowNotice(ports.progress, 'director', 'theme-validation', 'started', '开始校验主题');
      try { const result = await originalTheme.gates(...args); workflowNotice(ports.progress, 'director', 'theme-validation', result.length ? 'reworking' : 'completed', result.length ? '主题检查发现问题' : '主题校验通过'); return result; }
      catch (error) { workflowNotice(ports.progress, 'director', 'theme-validation', 'failed', '主题校验未完成'); throw error; }
    },
    publish: (...args) => observedStep(ports.progress, 'director', 'publish', '主题发布', () => originalTheme.publish(...args)),
  } };
  const original = await ports.theme.importInput(run.template, assets, Boolean(run.style), run.style ?? '');
  let modelCalls = 0;
  if (original.css && !run.style) {
    workflowNotice(ports.progress, 'director', 'reuse', 'started', '复用已有主题，开始检查');
    const bad = await ports.theme.gates(original.css, assets);
    if (bad.length) throw valueError('导入主题无效（未授权重写）: ' + bad.join('；'));
    await ports.theme.publish(original.css, target);
    return { route: 'reuse', model_calls: 0, css_chars: [...original.css].length };
  }
  if (!ports.visionInput) throw valueError('Style Director 需要启用 vision_input 的模型，不能盲写参考主题');
  const history: ChatMessage[] = [];
  const request = async (content: string | ChatInputBlock[] | undefined, tools: ReturnType<typeof writeSpec>, step: string) => {
    signal?.throwIfAborted();
    if (content !== undefined) history.push({ role: 'user', content });
    const started = new Date().toISOString();
    const messages: ChatMessage[] = [{ role: 'system', content: PLANNER_IDENTITY }, ...history];
    workflowNotice(ports.progress, 'director', step, 'started', step === 'style-pick' ? '开始选择参考风格' : '开始生成主题');
    const response = await ports.model.respond(messages, tools, signal);
    workflowNotice(ports.progress, 'director', step, 'completed', step === 'style-pick' ? '本轮选样响应已返回' : '本轮主题响应已返回');
    modelCalls++;
    await ports.trace({ step, started, finished: new Date().toISOString(), request: messages, response, ...(content !== undefined ? { submitted: content } : {}) });
    history.push(response.message);
    return response.message.tool_calls ?? [];
  };
  const result = (call: ToolCall, output: string) => history.push({ role: 'tool', tool_call_id: call.id, content: output });
  const prompt = (name: string, values: Record<string, string | number>) => plannerPrompt(name, values, styleDirector, run.prompts);
  let picks: string[] = [];
  if (!run.template && !ports.catalog.match(run.style)) {
    const out = path.join(run.root, 'style-picks.tsv');
    const selection = await ports.catalog.selectionInputs();
    const body = prompt('style-pick', { query: run.query, audience: run.audience, scenario: run.scenario || '（没写）', request: run.style || '按本次交流目的选择', index: selection.text, out_path: out, theme_bans: guidance.themeSlopBlock(workflowRoot) });
    const by = new Set(ports.catalog.rows().map(row => row[0]));
    let bad: string[] = [];
    for (let attempt = 0; attempt < TRIES; attempt++) {
      const calls = await request(attempt === 0 ? [{ type: 'text', text: body }, ...selection.images] : undefined, writeSpec(out), 'style-pick');
      const submission = oneWrite(calls, out);
      bad = submission.bad;
      const ids = splitLines(submission.css ?? '').filter(line => stripText(line)).map(line => stripText(line.split('\t')[0]!));
      if (!ids.length || new Set(ids).size !== ids.length || ids.some(id => !by.has(id))) bad.push('需要真实且唯一的风格 ID，首行为主方向');
      if (calls.some(call => call.function.name !== 'Write')) bad.push('选样只使用 Write');
      if (!bad.length) {
        try { await ports.images(ids.map(id => ({ id, shot: ports.catalog.readPath(id) }))); }
        catch (error) { if (!resourceFailure(error)) throw error; bad.push(`参照图片不可读: ${(error as Error).message}`); }
      }
      for (const call of calls) result(call, bad.length ? bad.join('；') : '选样已接收，下一步读取图片写主题');
      if (!bad.length) {
        await mkdir(run.root, { recursive: true });
        await writeFile(out, stripText(submission.css!) + '\n', 'utf8');
        workflowNotice(ports.progress, 'director', 'selection', 'completed', '参考风格已确定');
        picks = ids;
        break;
      }
      workflowNotice(ports.progress, 'director', 'selection', 'reworking', '参考风格未通过检查，继续调整');
      if (!calls.length) history.push({ role: 'user', content: bad.join('；') });
      if (attempt === TRIES - 1) throw runtimeError('选参照失败: ' + bad.join('；'));
    }
  }
  const match = ports.catalog.match(run.style);
  const selected = picks.length ? picks : match ? [match] : [];
  const catalog = await observedStep(ports.progress, 'director', 'references', '参考资料准备', () => selected.length ? ports.catalog.selectedInputs(selected) : ports.catalog.inputs(run.style));
  let body = prompt('style-theme', {
    query: run.query, audience: run.audience, scenario: run.scenario || '（没写）', canvas_w: run.canvas?.[0] ?? 1600, canvas_h: run.canvas?.[1] ?? 900,
    direction: guidance.directionBlock(run.prompts), theme_bans: history.length ? '' : guidance.themeSlopBlock(workflowRoot), font_floor: guidance.FONT_FLOOR, out_path: target,
  });
  body += '\n\n明确风格要求：' + (run.style || '按内容选择');
  body += '\n\n风格表（创作参考，不是页面资产）：\n' + catalog.text;
  if (original.css) body += '\n\n待修改完整原主题（按明确要求生成完整新版本）：\n' + original.css;
  const imported = await ports.theme.importedAssets(assets);
  if (imported.length) body += '\n\n已导入的本地素材，CSS 必须用重定位后的路径（不是来源目录路径）：\n' + imported.join('\n');
  const available = [...selected.map(key => `style:${key}`), ...original.shots.map(shot => `user:${path.relative(assets, shot).split(path.sep).join('/')}`)];
  if (available.length) body += '\n\n已加载参考（主参考在 INTERFACE 中用 reference 行指认）：\n' + available.join('\n');
  body += '\n\n用户图默认只是参考，不得擅自用作背景。工具媒体路径相对 pages/；CSS URL 相对 assets/。';
  let content: ChatInputBlock[] | undefined = [{ type: 'text', text: body }, ...await ports.images(original.shots.map(shot => ({ id: '用户参考，优先于自动偏好', shot }))), ...catalog.images];
  const tools = [...writeSpec(target), ...chatTools([...plannerInstructions.media, plannerInstructions.styleRead])];
  let rejected = 0;
  let bad: string[] = [];
  while (rejected < TRIES) {
    const calls = await request(content, tools, 'style-theme');
    content = undefined;
    if (!calls.length) throw runtimeError('Director 结束但没有有效 Write');
    const writes = calls.filter(call => call.function.name === 'Write');
    let css: string | undefined;
    ({ css, bad } = writes.length ? oneWrite(calls, target) : { css: undefined, bad: [] });
    if (writes.length && calls.some(call => call.function.name !== 'Write')) bad.push('先接收/查看工具结果，再在下一次响应提交 Write');
    if (css && !bad.length) {
      try {
        await ports.theme.prepareFonts(css, assets);
        await ports.theme.referenceImages(css, assets);
        bad.push(...await ports.theme.gates(css, assets));
      } catch (error) { if (signal?.aborted) throw signal.reason; if (!resourceFailure(error)) throw error; bad.push((error as Error).message); }
    }
    const pending: ChatInputBlock[] = [];
    for (const call of calls) {
      signal?.throwIfAborted();
      if (call.function.name === 'Write') { result(call, bad.length ? bad.join('；') : '技术校验通过'); continue; }
      let output: string;
      try {
        const args = objectArguments(call.function.arguments);
        if (call.function.name === 'Read') {
          const detail = await ports.catalog.detail(args.file_path);
          output = detail.text + '\n可在 INTERFACE 指认：reference style:' + ports.catalog.identify(args.file_path);
          pending.push(...detail.images);
        } else if (['ImageSearch', 'ImageGen'].includes(call.function.name)) {
          const media = await ports.media(call.function.name, args, path.join(run.root, 'pages'), 'director', signal);
          output = media.text;
          pending.push({ type: 'text', text: output }, ...media.images.map(image => ({ type: 'image_url' as const, image_url: { url: `data:${image.mime};base64,${image.data}` } })));
        } else throw valueError(`未知工具 ${call.function.name}`);
      } catch (error) { if (signal?.aborted) throw signal.reason; if (!resourceFailure(error) && !['TypeError', 'KeyError'].includes((error as Error)?.name)) throw error; output = errorOutput(error); }
      result(call, output);
    }
    if (pending.length) history.push({ role: 'user', content: pending });
    if (writes.length) {
      if (!bad.length) {
        if (!ports.theme.references(css!).length && available.length) css = css!.replace('==== /INTERFACE ====', `reference ${available[0]}\n==== /INTERFACE ====`);
        signal?.throwIfAborted();
        await ports.theme.publish(css!, target);
        return { route: original.css ? 'modify' : run.template ? 'reference' : 'auto', picks, css_chars: [...css!].length, model_calls: modelCalls };
      }
      workflowNotice(ports.progress, 'director', 'theme-validation', 'reworking', '主题提交未通过检查，继续调整');
      rejected++;
      await mkdir(run.root, { recursive: true });
      await writeFile(path.join(run.root, 'style.rejected.json'), JSON.stringify({ bad, css: css ?? null, submissions: rejected }, null, 2), 'utf8');
    }
  }
  throw runtimeError('主题技术校验失败: ' + bad.join('；'));
}
