import { Sources, sourceTools } from './sources.js';
import { sumIntegers, type PythonInt } from './json.js';
import { decodeText, PYTHON_SPACE, stripText, splitLines } from './text.js';
import { parsePythonJson } from './json.js';
/** Builder natural-stop loop and separate delivery audit from core/builder.py. */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { RESOURCES, WORKFLOWS } from './guidance.js';
import { ModelRuntime, cacheWriteOf, textOf } from '../adapters/models/runtime.js';
import { TraceWriter } from './trace.js';
import { firstGuidanceOnly, resolveReadPath, runTool, toolSpecs, type ToolOutput, type Workspace, type WorkspacePorts } from '../tools/workspace.js';
import { check, imageOutput } from '../tools/check.js';
import { scaffold } from '../tools/code-scaffold.js';
import { runBrowserCheck } from '../tools/code-check.js';
import { pageEntries } from './builder-context.js';
import { resolvePath } from './planner-contract.js';
import { isWithin } from './theme.js';
import { CODE_FILES, CODE_PAGE_SECONDS, CODE_REQUEST_SECONDS } from './code-observer.js';

const constants = JSON.parse(readFileSync(path.join(RESOURCES, 'builder-instructions.json'), 'utf8'));
type Item = Record<string, any>;
export interface DeliveryAudit { fatal_errors: string[]; visual_warnings: string[]; code_result: string | null }
export class Page {
  calls = 0; steps: string[] = []; steps_arg: Record<string, string[]> = {}; reference_reads: string[] = [];
  premature_stops = 0; last_stop_error = '';
  why = ''; seconds = 0; images = 0; evicted = 0;
  tok_in: PythonInt = 0; tok_cached: PythonInt = 0; tok_write: PythonInt = 0; tok_out: PythonInt = 0; tok_max: PythonInt = 0;
  artifact_present = false; audit: DeliveryAudit | null = null; cache_seen = false;
  label = ''; workflow = ''; spec_text = ''; total = 0; termination = '';
  constructor(readonly pid: string, public prompt: string) {}
}
export function routePage(root: string, page: Page): Page {
  const file = path.join(root, 'pages/plan', page.pid.replaceAll('page-', 'p') + '.md');
  if (!existsSync(file) || !statSync(file).isFile()) throw Object.assign(new Error(`cannot route ${page.pid}: missing planner spec ${file}`), { name: 'FileNotFoundError' });
  const text = decodeText(readFileSync(file), false), entries = pageEntries(text);
  if (entries.length !== 1) throw Object.assign(new Error(`cannot route ${page.pid}: expected one '# page-NN [标题页|内容页|交互页|代码页]' heading`), { name: 'ValueError' });
  const entry = entries[0]!;
  if (entry.pid !== page.pid) throw Object.assign(new Error(`planner spec id '${entry.pid}' does not match '${page.pid}'`), { name: 'ValueError' });
  page.label = entry.label; page.workflow = constants.LABEL_WORKFLOWS[entry.label]; page.spec_text = text;
  return page;
}
export function lessonTitle(page: Page): string {
  for (const raw of splitLines(page.spec_text)) {
    let line = stripText(raw); if (!line || line.startsWith('#') || line.startsWith('<')) continue;
    line = line.replace(new RegExp(`^[\\-*]${PYTHON_SPACE}*`, 'u'), ''); return [...line].slice(0, 80).join('');
  }
  return page.pid;
}
export function evictImages(history: Item[], tokens: PythonInt): number {
  if (tokens <= constants.CONTEXT_SOFT) return 0;
  const indexes = history.flatMap((item, index) => item.role === 'user' && Array.isArray(item.content) && item.content.some((block: Item) => block?.type === 'input_image') ? [index] : []);
  const removed = indexes.slice(0, Math.max(0, indexes.length - constants.KEEP_IMAGES));
  for (const index of removed) history[index] = { role: 'user', content: [{ type: 'input_text', text: '（这里原来有一张图，为了不撑爆上下文已经拿掉了。要再看就重新 Check，需要局部细节时指定 box。）' }] };
  return removed.length;
}
export function auditLines(report: string): [string[], string[]] {
  const fatal: string[] = [], visual: string[] = [];
  for (const raw of report.split('\n')) {
    const line = raw.trim(); if (!line) continue;
    if (/^(?:失败:|拒绝[：:]|Traceback|TimeoutExpired:|[A-Za-z]+Error:)/.test(line) || /✗.*(?:JS 报错|console\.error|资源加载失败|无法渲染|代码工作台自检失败|底盘契约)/.test(line)) fatal.push(line);
    else if (line.startsWith('✗')) visual.push(line);
  }
  return [fatal, visual];
}
export function codeGuard(name: string, args: Item, context: Workspace): string | undefined {
  if (['ImageSearch', 'ImageGen'].includes(name)) return undefined;
  const editable = path.join(context.cwd, 'assets/lessons', context.pid, 'lesson');
  if (['Read', 'Write', 'Edit'].includes(name)) {
    const raw = String(args.file_path || ''); if (!raw) return 'file_path is required';
    const target = resolvePath(raw, context.cwd);
    if (name === 'Read' && isWithin(target, path.join(context.cwd, 'assets/img')) && ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(path.extname(target).toLowerCase())) return undefined;
    if (name === 'Read' && context.resourceRoot && isWithin(target, context.resourceRoot)) return undefined;
    if (!isWithin(target, editable)) return `${target} is fixed or belongs to another page; edit only ${editable}`;
    if (name !== 'Read') {
      if (!CODE_FILES.some(file => {
        const allowed = path.join(editable, file);
        return target === allowed && resolvePath(allowed) === allowed;
      })) return 'Only the four declared observer course files are editable';
    }
    return undefined;
  }
  if (name === 'Check') return String(args.page || '') === `${context.pid}.html` ? undefined : `check only ${context.pid}.html`;
  return `${name} is not available while authoring a code lesson`;
}
export interface BuilderPorts {
  env?: NodeJS.ProcessEnv;
  model: Pick<ModelRuntime, 'respondCanonical'>;
  run(name: string, args: Item, context: Workspace, signal?: AbortSignal): Promise<string | ToolOutput>;
  scaffold(cwd: string, pid: string, title: string, total: number, signal?: AbortSignal): Promise<unknown>;
  codeCheck(cwd: string, pid: string, shot: boolean, signal?: AbortSignal): Promise<{ report: string; shots: string[] }>;
  image(file: string): Promise<ToolOutput>;
}
/** Real Builder dependencies; media remains mandatory until its migration is wired. */
export function builderPorts(model: BuilderPorts['model'], media: WorkspacePorts['media'], env: NodeJS.ProcessEnv = process.env): BuilderPorts {
  const workspace: WorkspacePorts = { image: imageOutput, check, media };
  return { model, env, scaffold, codeCheck: runBrowserCheck, image: imageOutput,
    run: (name, args, context, signal) => runTool(name, args, context, workspace, signal) };
}
export async function auditDelivery(context: Workspace, page: Page, ports: BuilderPorts, signal?: AbortSignal): Promise<DeliveryAudit> {
  const target = path.join(context.cwd, page.pid + '.html');
  if (!existsSync(target) || !statSync(target).isFile() || statSync(target).size === 0) return { fatal_errors: [`target missing: ${target}`], visual_warnings: [], code_result: null };
  const checked = await ports.run('Check', { page: path.basename(target), shot: false }, context, signal);
  const [fatal, visual] = auditLines(typeof checked === 'string' ? checked : checked.text);
  let codeResult: string | null = null;
  if (page.workflow === 'build-code') {
    codeResult = (await ports.codeCheck(context.cwd, page.pid, false, signal)).report;
    const [codeFatal, codeVisual] = auditLines(codeResult); fatal.push(...codeFatal); visual.push(...codeVisual);
  }
  return { fatal_errors: fatal, visual_warnings: visual, code_result: codeResult };
}
function tagOf(call: Item): string {
  let args: Item;
  try { args = parsePythonJson(call.arguments || '{}'); } catch { return ''; }
  if (call.name === 'Bash') return [...String(args.command ?? '')].slice(0, 120).join('');
  if (call.name === 'Check') return String(args.page ?? '') + (args.after?.length ? ` +after×${args.after.length}` : '') + (args.shot ? ' +shot' : '') + (args.box ? ` @[${args.box.join(', ')}]` : '');
  if (call.name === 'Patch') return `${args.page ?? ''} ×${args.edits?.length ?? 0}`;
  return String(args.file_path ?? '').split('/').at(-1)!;
}
export async function buildOne(...args: Parameters<typeof buildOneLoop>): Promise<Page> {
  const [page, pagesDir, trace, instructions, ports, options = {}] = args;
  if (page.workflow !== 'build-code') return buildOneLoop(...args);
  const deadline = AbortSignal.timeout(CODE_PAGE_SECONDS * 1000), started = performance.now();
  const signal = AbortSignal.any([deadline, ...(options.signal ? [options.signal] : [])]);
  try { return await buildOneLoop(page, pagesDir, trace, instructions, ports, { ...options, signal }); }
  catch (error) {
    if (options.signal?.aborted) throw options.signal.reason;
    if (!deadline.aborted) throw error;
    page.termination = 'max_seconds'; page.why = `超过单页时限 ${CODE_PAGE_SECONDS}s`;
    page.artifact_present = existsSync(path.join(pagesDir, page.pid + '.html'));
    page.audit = { fatal_errors: [page.why], visual_warnings: [], code_result: null };
    return page;
  } finally { page.seconds = (performance.now() - started) / 1000; }
}
async function buildOneLoop(page: Page, pagesDir: string, trace: string, instructions: string, ports: BuilderPorts, options: { workflowRoot?: string; visionInput?: boolean; textReport?: boolean; sampleShots?: boolean; refs?: Item[]; signal?: AbortSignal; now?: () => number; onRetry?(page: Page): void } = {}): Promise<Page> {
  const log = new TraceWriter(trace, randomUUID(), ports.env);
  const root = options.workflowRoot ?? WORKFLOWS;
  const context: Workspace = { cwd: pagesDir, pid: page.pid, resourceRoot: resolvePath(page.workflow ? path.join(root, page.workflow) : root), ...(options.textReport ? { textReport: true } : {}), ...(options.sampleShots ? { sampleShots: true } : {}) };
  const vision = options.visionInput ?? true, refs = options.refs ?? [];
  const history: Item[] = [];
  if (page.workflow === 'build-code') {
    const created = await ports.scaffold(pagesDir, page.pid, lessonTitle(page), page.total, options.signal);
    page.prompt = page.prompt.replace('<target_state>absent</target_state>', '<target_state>host scaffold ready</target_state>')
      + '\n\nCURRENT FILES (host-created; use these exact paths):\n' + JSON.stringify(created, null, 2);
  }
  if (refs.length && vision && page.workflow !== 'build-code') {
    history.push({ role: 'user', content: [{ type: 'input_text', text: page.prompt + '\n\n' + (existsSync(path.join(pagesDir, '../template-spec.json')) ? '以下是模板原始版式预览。保留固定骨架，用新内容替换示例文字；不照抄旧主题。' : constants.REF_SHOTS_NOTE) }, ...refs] });
    page.images += refs.filter(block => block.type === 'input_image').length;
  } else {
    if (refs.length && !vision && page.workflow !== 'build-code') throw new Error('本次有视觉参考，但 Builder 模型未启用 vision_input；不能声称看过参考');
    history.push({ role: 'user', content: page.prompt });
  }
  const sources = await Sources.load(path.dirname(pagesDir), page.pid);
  const specs = toolSpecs(page.workflow, vision);
  if (sources) specs.push(...sourceTools);
  const now = options.now ?? (() => Date.now() / 1000), start = now(), seen = new Set<string>();
  for (;;) {
    options.signal?.throwIfAborted();
    if (now() - start > constants.MAX_SECONDS) { page.why = `超过单页时限 ${constants.MAX_SECONDS}s` + (page.last_stop_error ? `；最近结束检查：${page.last_stop_error}` : ''); page.termination = 'max_seconds'; break; }
    const started = new Date().toISOString();
    const requestSignal = page.workflow === 'build-code'
      ? AbortSignal.any([AbortSignal.timeout(CODE_REQUEST_SECONDS * 1000), ...(options.signal ? [options.signal] : [])]) : options.signal;
    const response = await ports.model.respondCanonical(instructions, history, specs, requestSignal ? { signal: requestSignal } : {});
    page.calls++;
    const usage = response.usage, cached = usage.input_tokens_details.cached_tokens;
    page.tok_in = sumIntegers(page.tok_in, usage.input_tokens); page.tok_out = sumIntegers(page.tok_out, usage.output_tokens); page.tok_write = sumIntegers(page.tok_write, cacheWriteOf(response)); page.tok_max = page.tok_max >= usage.input_tokens ? page.tok_max : usage.input_tokens;
    if (cached !== null) { page.cache_seen = true; page.tok_cached = sumIntegers(page.tok_cached, cached); }
    const calls = response.output.filter(item => item.type === 'function_call'), rid = response.id || 'req_' + randomUUID().replaceAll('-', '').slice(0, 16);
    log.add([{ type: 'text', text: page.calls === 1 ? page.prompt : '(tool results)' }], textOf(response), { input_tokens: usage.input_tokens, output_tokens: usage.output_tokens, cache_read_input_tokens: cached || 0, cache_creation_input_tokens: cacheWriteOf(response) }, rid, started, new Date().toISOString(), { page: page.pid, ...(page.calls === 1 ? { instructions } : {}), tools: calls.map(call => ({ name: call.name, arg: tagOf(call), call_id: call.call_id, arguments: call.arguments })) });
    if (!calls.length) {
      const auditStarted = new Date().toISOString(), auditClock = performance.now();
      page.audit = await auditDelivery(context, page, ports, options.signal);
      options.signal?.throwIfAborted();
      const rejected = page.audit.fatal_errors.length > 0;
      log.tool({ rid, call_id: `${rid}-delivery`, page: page.pid, name: 'DeliveryAudit', arguments: '{}', output: JSON.stringify({ decision: rejected ? 'retry' : 'complete', audit: page.audit }), started: auditStarted, finished: new Date().toISOString(), seconds: (performance.now() - auditClock) / 1000 });
      if (rejected) {
        page.premature_stops++;
        page.last_stop_error = page.audit.fatal_errors.join('；');
        try { Promise.resolve(options.onRetry?.(page)).catch(() => {}); } catch {}
        if (page.workflow === 'build-code') {
          history.push(...ModelRuntime.replay(response));
          history.push({ role: 'user', content: '交付检查结果：\n' + page.last_stop_error });
        }
        // Preserve legacy visual-page natural-stop behavior.
        continue;
      }
      page.why = [...textOf(response).trim()].slice(0, 200).join(''); page.termination = 'no_tool_use'; break;
    }
    history.push(...ModelRuntime.replay(response));
    const pending: Array<[string, string]> = [];
    for (const call of calls) {
      options.signal?.throwIfAborted();
      const toolStarted = new Date().toISOString(), toolClock = performance.now();
      let args: Item;
      try {
        args = parsePythonJson(call.arguments || '{}');
        if (!args || typeof args !== 'object' || Array.isArray(args)) throw new Error('工具参数必须是 JSON 对象');
      } catch (error) {
        const output = `${call.name} arguments 不是合法 JSON：${(error as Error).message}。请缩短内容并重发同一调用。`;
        history.push({ type: 'function_call_output', call_id: call.call_id, output }); page.steps.push(`${call.name}!badjson`);
        log.tool({ rid, call_id: call.call_id, page: page.pid, name: call.name, arguments: call.arguments, output, started: toolStarted, finished: new Date().toISOString(), seconds: (performance.now() - toolClock) / 1000 });
        continue;
      }
      page.steps.push(call.name !== 'Bash' ? call.name : String(args.command ?? '').includes('selfcheck') ? 'SELFCHECK' : 'Bash');
      (page.steps_arg[call.name] ??= []).push(tagOf(call));
      let result: string | ToolOutput;
      if (sources && (call.name === 'SearchSources' || call.name === 'ReadSource')) {
        try { result = await sources.tool(call.name, args, options.signal, vision); }
        catch (error) { options.signal?.throwIfAborted(); result = `资料读取失败：${(error as Error).message}`; }
      } else {
        const actual = { ...args };
        if (call.name === 'Check') {
          if (vision) { if (!Object.hasOwn(actual, 'shot')) actual.shot = true; }
          else { actual.shot = false; delete actual.box; delete actual.zoom; }
        }
        const denied = page.workflow === 'build-code' ? codeGuard(call.name, actual, context) : undefined;
        if (denied) result = '拒绝：' + denied;
        else {
          result = await ports.run(call.name, actual, context, options.signal);
          if (page.workflow === 'build-code' && call.name === 'Check') {
            const text = typeof result === 'string' ? result : result.text, images = typeof result === 'string' ? [] : [...result.images];
            const extra = await ports.codeCheck(pagesDir, page.pid, Boolean(actual.shot) && vision, options.signal);
            for (const shot of extra.shots.slice(0, Math.max(0, 2 - images.length))) images.push(...(await ports.image(shot)).images);
            result = { text: text + '\n\n' + extra.report, images };
          }
        }
      }
      if (call.name === 'Read' && args.file_path) {
        const file = resolveReadPath(String(args.file_path), pagesDir, context.resourceRoot);
        if (isWithin(file, context.resourceRoot!)) {
          const rel = path.relative(context.resourceRoot!, resolvePath(file)).split(path.sep);
          if (rel[0] === 'references' || (rel[0] === 'samples' && rel[1] === 'bundles')) page.reference_reads.push(rel.join('/'));
        }
      }
      let output = firstGuidanceOnly(typeof result === 'string' ? result : result.text, seen), images = typeof result === 'string' ? [] : result.images;
      if (call.name === 'Patch' && output.startsWith('失败')) page.steps[page.steps.length - 1] = 'Patch!miss';
      if (images.length && !vision) { images = []; output += '\n\n（当前模型不接收图片输入；仅保留文本报告。）'; }
      log.tool({ rid, call_id: call.call_id, page: page.pid, name: call.name, arguments: call.arguments, output, images, started: toolStarted, finished: new Date().toISOString(), seconds: (performance.now() - toolClock) / 1000 });
      history.push({ type: 'function_call_output', call_id: call.call_id, output }); pending.push(...images);
    }
    for (const [mime, encoded] of pending) { history.push({ role: 'user', content: [{ type: 'input_image', image_url: `data:${mime};base64,${encoded}` }] }); page.images++; }
    page.evicted += evictImages(history, page.tok_max);
  }
  const target = path.join(pagesDir, page.pid + '.html');
  page.artifact_present = existsSync(target) && statSync(target).isFile() && statSync(target).size > 0;
  if (page.termination !== 'no_tool_use') page.audit = await auditDelivery(context, page, ports, options.signal);
  page.seconds = now() - start;
  return page;
}
