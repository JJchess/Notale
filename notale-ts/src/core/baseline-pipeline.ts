import { splitPages } from './planner-contract.js';
import type { ProgressObserver } from './workflow-progress.js';
/** Service adapter for the migrated Python workflow. No alternative generation prompts. */
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { loadConfig, configValue, resolveBuilderProfile } from '../adapters/models/profiles.js';
import { workflowModels, type TransportOptions, type PlannerOverrides } from '../adapters/models/runtime.js';
import { RESOURCES } from './guidance.js';
import { planRun, buildRun, type BuildOptions } from './orchestration.js';
import { builderPorts, lessonTitle, Page } from './builder.js';
import { directorPorts } from './theme-runtime.js';
import { inspect } from './theme.js';
import { TraceWriter } from './trace.js';
import { jsonText, type WorkflowTrace } from './planning.js';
import { mediaPorts, generationScriptFor } from '../tools/media-execution.js';
import { acquireVisualChecker } from '../tools/visual-check.js';
import { lecturePreview, queueLectureThumbnail } from './lecture-preview.js';
import type { GenerationPipeline } from './run-service.js';
import { observeBuilder } from './progress.js';
import { publishLecture } from './publication.js';

export interface PipelineOptions {
  planner?: PlannerOverrides; config?: Record<string, any>; env?: NodeJS.ProcessEnv; envFile?: string; profile?: string;
  skillsRoot?: string; chassis?: string; lib?: string; uniform?: boolean; transport?: TransportOptions; styleDirector?: boolean; template?: string;
  build?: Pick<BuildOptions, 'samples' | 'sampleShots' | 'includeAux' | 'notes' | 'visualFocus' | 'concurrency' | 'workflowRoot' | 'prompts' | 'only'>;
}
export function runtimeEnvironment(env: NodeJS.ProcessEnv = process.env, file?: string): NodeJS.ProcessEnv {
  const own = path.resolve(RESOURCES, '../.env.local');
  const source = file ?? (existsSync(own) ? own : path.resolve(RESOURCES, '../../notale-v2/.env.local'));
  if (!existsSync(source)) return { ...env };
  if (['1', 'true', 't', 'yes', 'y'].includes((env.PYTHON_DOTENV_DISABLED ?? '').toLowerCase())) return { ...env };
  return dotenvEnvironment(readFileSync(source, 'utf8'), env);
}
/** Preserve python-dotenv's ordered bindings, quoting and override=False expansion. */
export function dotenvEnvironment(source: string, env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const text = source.replace(/^\uFEFF/, '').replace(/\r\n|\r/g, '\n');
  const values = new Map<string, string | null>();
  let cursor = 0;
  const take = (pattern: RegExp): RegExpExecArray => {
    pattern.lastIndex = cursor;
    const match = pattern.exec(text);
    if (!match) throw new Error('invalid dotenv binding');
    cursor = pattern.lastIndex;
    return match;
  };
  const escapes: Record<string, string> = { a: '\x07', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v', "'": "'", '"': '"', '\\': '\\' };
  while (cursor < text.length) {
    const start = cursor;
    try {
      take(/\s*/y);
      if (cursor === text.length) break;
      take(/(?:export[^\S\n]+)?/y);
      const key = text[cursor] === '#' ? null : text[cursor] === "'" ? take(/'([^']+)'/y)[1]! : take(/([^=#\s]+)/y)[1]!;
      take(/[^\S\n]*/y);
      let value: string | null = null;
      if (text[cursor] === '=') {
        take(/=[^\S\n]*/y);
        if (text[cursor] === "'") value = take(/'((?:\\.|[^'\\])*)'/sy)[1]!.replace(/\\([\\'])/g, (_, char) => escapes[char]!);
        else if (text[cursor] === '"') value = take(/"((?:\\.|[^"\\])*)"/sy)[1]!.replace(/\\([\\'"abfnrtv])/g, (_, char) => escapes[char]!);
        else value = take(/[^\n]*/y)[0].replace(/\s+#.*/, '').trimEnd();
      }
      take(/(?:[^\S\n]*#[^\n]*)?/y);
      take(/[^\S\n]*(?:\n|$)/y);
      if (key !== null) values.set(key, value === null ? null : value.replace(/\$\{([^}:]*)(?::-([^}]*))?\}/g, (_, name, fallback) => {
        if (Object.hasOwn(env, name)) return env[name] ?? '';
        return values.has(name) ? values.get(name) ?? '' : fallback ?? '';
      }));
    } catch {
      take(/[^\n]*(?:\n|$)/y);
      const line = 1 + (text.slice(0, start).match(/\n/g)?.length ?? 0);
      process.stderr.write(`python-dotenv could not parse statement starting at line ${line}\n`);
    }
  }
  return { ...Object.fromEntries([...values].filter((entry): entry is [string, string] => entry[1] !== null)), ...env };
}

/** Director records this call's submitted content, not a guessed last user message. */
export function workflowTraceText({ step, request, submitted }: WorkflowTrace): string {
  const history = request.slice(1);
  if (step === 'deck') return history.length === 1 ? String(history[0]?.content ?? '') : '(tool results)';
  const recent = typeof submitted === 'string' ? submitted : (submitted ?? []).map(block => 'text' in block ? block.text : '[image supplied]').join('\n');
  return recent || jsonText(history.filter(message => message.role === 'tool').slice(-5).map(message => ({ type: 'function_call_output', call_id: message.tool_call_id, output: message.content })));
}
/** Shared production ports for the service and separate Planner/Builder commands. */
export function baselineRuntime(root: string, options: PipelineOptions = {}, signal?: AbortSignal) {
    const env = runtimeEnvironment(options.env, options.envFile), cfg = options.config ?? loadConfig();
    const models = workflowModels(cfg, options.profile, options.uniform ?? false, { ...options.transport, env }, options.planner);
    const script = generationScriptFor(options.skillsRoot);
    const media = mediaPorts({ env, backend: configValue(configValue(cfg, 'media'), 'image_search_backend', 'gemini'), ...(script ? { imageGenScript: script } : {}) }), writer = new TraceWriter(path.join(root, 'trace.jsonl'), randomUUID(), env);
    const trace = (record: WorkflowTrace) => {
      const { step, started, finished, response } = record;
      const recent = workflowTraceText(record);
      writer.add([{ type: 'text', text: recent }], typeof response.message.content === 'string' ? response.message.content : '',
        { input_tokens: response.inputTokens, output_tokens: response.outputTokens, cache_read_input_tokens: response.cachedTokens ?? 0 }, response.id || randomUUID().replaceAll('-', ''), started, finished,
        { step, tools: (response.message.tool_calls ?? []).map(call => ({ name: call.function.name, arguments: call.function.arguments })) });
    };
    return { env, cfg, models,
      get planner() { return { model: models.planner, media: media.workflow, trace, validateCss: (css: string) => inspect(css).bad.join('；') }; },
      get director() { return directorPorts(models.director, trace, media.workflow, signal); },
      get builders() { return Object.fromEntries(Object.entries(models.builders).map(([workflow, model]) => [workflow, builderPorts(model, media.workspace, env)])); },
    };
}

export function createBaselinePipeline(options: PipelineOptions = {}): GenerationPipeline {
  return async ({ run, outputDir, emit, signal }) => {
    const root = path.join(path.dirname(outputDir), 'work');
    if (existsSync(root)) throw new Error(`run already exists: ${root}; use a new run for a fresh test`);
    await mkdir(root, { recursive: false });
    const { env, cfg, models, planner, director, builders } = baselineRuntime(root, options, signal);
    let notices = Promise.resolve();
    const report: ProgressObserver = workflow => {
      if (signal.aborted) return;
      notices = notices.then(() => emit('workflow.progress', `${workflow.module === 'planner' ? '课程规划' : '视觉设计'} · ${workflow.message}`, { workflow }))
        .catch(error => { if (!signal.aborted) console.warn('Progress notification unavailable:', error instanceof Error ? error.name : 'error'); });
    };
    const states = new Map<string, string>();
    const thumbnails: Promise<void>[] = [], thumbnailErrors: unknown[] = [];
    const observed = Object.fromEntries(Object.entries(builders).map(([name, ports]) => [name, observeBuilder(ports, (pageId, state, message) => {
      if (signal.aborted || (state === 'checking' && states.get(pageId) === 'reworking') || states.get(pageId) === state) return;
      states.set(pageId, state);
      notices = notices.then(() => emit('page.progress', `${pageId.replace('page-', '第 ')} 页 · ${message}`, { pageId, pageState: state }))
        .catch(error => { if (!signal.aborted) console.warn('Progress notification unavailable:', error instanceof Error ? error.name : 'error'); });
    })]));
    const release = acquireVisualChecker();
    try {
      await emit('phase.changed', '正在规划讲义和视觉方向', { phase: 'ideate' });
      await planRun({ root, query: run.request.query, minutes: run.request.minutes, audience: run.request.audience, scenario: run.request.scenario,
        ...(run.request.style ? { style: run.request.style } : {}), ...(options.build?.workflowRoot ? { workflowRoot: options.build.workflowRoot } : {}), ...(options.build?.prompts ? { prompts: options.build.prompts } : {}), styleDirector: options.styleDirector ?? true, visualFocus: options.build?.visualFocus ?? false, ...(run.request.templateId ? { template: path.join(path.dirname(outputDir), 'input/template.pptx') } : options.template ? { template: options.template } : {}) },
      { planner: { ...planner, progress: report }, director: { ...director, progress: report } }, { signal, onPlanned(pagesDoc) {
        const pages = Object.entries(splitPages(pagesDoc)).sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true })).map(([number, spec]) => {
          const page = new Page('page-' + number, ''); page.spec_text = spec;
          return { pageId: page.pid, pageTitle: lessonTitle(page), state: 'pending' as const };
        });
        notices = notices.then(() => emit('plan.ready', `规划完成 · 共 ${pages.length} 页`, { pages })).catch(() => {});
      }, ...(options.chassis ? { chassis: options.chassis } : {}), ...(options.lib ? { lib: options.lib } : {}) });
      await emit('phase.changed', '正在生成讲义页面', { phase: 'create' });
      const pages = await buildRun(root, observed,
        { ...options.build, label: run.id, profile: resolveBuilderProfile(cfg, options.profile, env), profiles: Object.fromEntries(Object.entries(models.builders).map(([workflow, model]) => [workflow, model.profile])), signal,
          onRetry(page) {
            if (signal.aborted) return;
            states.set(page.pid, 'reworking');
            const reason = page.last_stop_error.includes('target missing:') ? '目标文件尚未生成或为空' : page.last_stop_error;
            notices = notices.then(() => emit('page.progress', `${page.pid.replace('page-', '第 ')} 页 · ${page.label}：模型未调用工具，${reason}，正在按原上下文重试`, { pageId: page.pid, pageTitle: lessonTitle(page), pageState: 'reworking' }))
              .catch(error => { if (!signal.aborted) console.warn('Progress notification unavailable:', error instanceof Error ? error.name : 'error'); });
          },
          async onPage(page, state) {
            if (state === 'started') await emit('page.started', `正在生成 ${lessonTitle(page)}`, { pageId: page.pid, pageTitle: lessonTitle(page) });
            else if (page.artifact_present && page.termination === 'no_tool_use' && page.audit && page.audit.fatal_errors.length === 0) {
              await emit('page.ready', `${lessonTitle(page)} 已生成`, { pageId: page.pid, pageTitle: lessonTitle(page), previewUrl: `/v1/runs/${run.id}/preview/${page.pid}.html` });
              thumbnails.push(queueLectureThumbnail(path.join(root, 'pages'), page.pid, signal).catch(error => { thumbnailErrors.push(error); }));
            }
            else await emit('page.progress', `${page.pid} · ${page.label} · ${lessonTitle(page)} 未完成交付检查：${page.why || page.last_stop_error}`, { pageId: page.pid, pageTitle: lessonTitle(page), pageState: 'failed' });
          } });
      signal.throwIfAborted();
      await emit('phase.changed', '正在整理讲义产物与审计结果', { phase: 'polish' });
      const available = pages.filter(page => page.artifact_present);
      await Promise.all(thumbnails);
      if (thumbnailErrors.length) throw thumbnailErrors[0];
      await writeFile(path.join(root, 'pages/index.html'), lecturePreview(run.request.query, available.map(page => page.pid), Object.fromEntries(available.map(page => [page.pid, lessonTitle(page)])), available.filter(page => page.workflow === 'build-code').map(page => page.pid)));
      const incomplete = pages.filter(page => page.termination !== 'no_tool_use' || !page.artifact_present || page.audit?.fatal_errors.length);
      if (incomplete.length) throw new Error(`生成已结束，但 ${incomplete.length} 页异常终止、缺少产物或存在致命审计错误：${incomplete.map(page => `${page.pid} · ${page.label}：${page.why || page.last_stop_error || page.audit?.fatal_errors.join('；')}`).join('；')}；详见 work/builder-results.json`);
      await publishLecture(path.join(root, 'pages'), outputDir, { signal });
    } finally { await notices; await Promise.all(thumbnails); await release(); }
  };
}
