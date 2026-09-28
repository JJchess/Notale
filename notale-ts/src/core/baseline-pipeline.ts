import { splitPages } from './planner-contract.js';
import type { ProgressObserver } from './workflow-progress.js';
/** Service adapter for the generation workflow. No alternative generation prompts. */

/** The generation stage by name, as the author sees it: the Valar shape the whole lecture to one
 * plan, many hands at once (the planner, then a builder per page). Changes go to Istar. */
export const GENERATOR_NAME = 'Valar';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { loadConfig, resolveBuilderProfile, type ModelConfig } from '../adapters/models/profiles.js';
import { skillModels, type PlannerOverrides } from '../adapters/models/runtime.js';
import { RESOURCES } from './guidance.js';
import { planRun, buildRun, type BuildOptions } from './orchestration.js';
import { builderPorts, delivered, lessonTitle, Page } from './builder.js';
import { directorPorts } from './theme-runtime.js';
import { TraceWriter } from './trace.js';
import type { WorkflowTrace } from './planner.js';
import { mediaPorts } from '../tools/media-execution.js';
import { acquireVisualChecker } from '../tools/visual-check.js';
import { lecturePreview, queueLectureThumbnail } from './lecture-preview.js';
import type { GenerationPipeline } from './run-service.js';
import type { CreateRunRequest } from '../protocol/index.js';
import { observeBuilder } from './progress.js';
import { publishLecture } from './publication.js';
import { publicReason } from './public-text.js';

export interface PipelineOptions {
  planner?: PlannerOverrides; config?: ModelConfig; envFile?: string; profile?: string; template?: string;
  build?: Pick<BuildOptions, 'samples' | 'includeAux' | 'notes' | 'prompts' | 'only'>;
}
export function runtimeEnvironment(env: NodeJS.ProcessEnv = process.env, file?: string): NodeJS.ProcessEnv {
  // One secrets file for the whole Notale workspace, at its root (see .env.example there).
  const own = path.resolve(RESOURCES, '../../.env.local');
  const source = file ?? own;
  if (!existsSync(source)) return { ...env };
  if (['1', 'true', 't', 'yes', 'y'].includes((env.NOTALE_DOTENV_DISABLED ?? '').toLowerCase())) return { ...env };
  return dotenvEnvironment(readFileSync(source, 'utf8'), env);
}
/** Parse a dotenv file; the caller's values win, and `${VAR}` / `${VAR:-default}` expand against them, then earlier file values. */
export function dotenvEnvironment(source: string, env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const values: Record<string, string> = {};
  for (const [key, value = ''] of Object.entries(parseEnv(source.replace(/^\uFEFF/, ''))))
    values[key] = value.replace(/\$\{([^}:]*)(?::-([^}]*))?\}/g, (_, name: string, fallback?: string) =>
      Object.hasOwn(env, name) ? env[name] ?? '' : values[name] ?? fallback ?? '');
  return { ...values, ...env };
}

/** Director records this call's submitted content, not a guessed last user message. */
export function workflowTraceText({ step, request, submitted }: WorkflowTrace): string {
  const history = request.slice(1);
  if (step === 'deck') return history.length === 1 ? String(history[0]?.content ?? '') : '(tool results)';
  const recent = typeof submitted === 'string' ? submitted : (submitted ?? []).map(block => 'text' in block ? block.text : '[image supplied]').join('\n');
  return recent || JSON.stringify(history.filter(message => message.role === 'tool').slice(-5).map(message => ({ type: 'function_call_output', call_id: message.tool_call_id, output: message.content })));
}
/** Shared production ports for the service and separate Planner/Builder commands. */
export function baselineRuntime(root: string, options: PipelineOptions = {}, signal?: AbortSignal) {
    const env = runtimeEnvironment(process.env, options.envFile), cfg = options.config ?? loadConfig();
    const models = skillModels(cfg, options.profile, { env }, options.planner);
    const media = mediaPorts({ env, backend: cfg.media?.image_search_backend ?? 'gemini' }), writer = new TraceWriter(path.join(root, 'trace.jsonl'), randomUUID(), env);
    const trace = (record: WorkflowTrace) => {
      const { step, started, finished, response } = record;
      const recent = workflowTraceText(record);
      writer.add([{ type: 'text', text: recent }], typeof response.message.content === 'string' ? response.message.content : '',
        { input_tokens: response.inputTokens, output_tokens: response.outputTokens, cache_read_input_tokens: response.cachedTokens ?? 0 }, response.id || randomUUID().replaceAll('-', ''), started, finished,
        { step, tools: (response.message.tool_calls ?? []).map(call => ({ name: call.function.name, arguments: call.function.arguments })) });
    };
    return { env, cfg, models,
      get planner() { return { model: models.planner, visionInput: models.planner.profile.vision_input, media: media.workflow, trace }; },
      get director() { return directorPorts(models.director, trace, media.workflow, signal); },
      get builders() { return Object.fromEntries(Object.entries(models.builders).map(([skill, model]) => [skill, builderPorts(model, media.workspace, env)])); },
    };
}

/** Director template for a service run: uploaded PPTX, else uploaded style images (a `--template` shots directory), else the CLI default. */
export function runTemplate(request: CreateRunRequest, runDir: string, fallback?: string): string | undefined {
  if (request.templateId) return path.join(runDir, 'input/template.pptx');
  if (request.styleImageIds?.length) return path.join(runDir, 'input/style');
  return fallback;
}

export function createBaselinePipeline(options: PipelineOptions = {}): GenerationPipeline {
  return async ({ run, outputDir, emit, signal }) => {
    const root = path.join(path.dirname(outputDir), 'work');
    if (existsSync(root)) throw new Error(`run already exists: ${root}; use a new run for a fresh test`);
    await mkdir(root, { recursive: false });
    const { env, cfg, models, planner, director, builders } = baselineRuntime(root, options, signal);
    const template = runTemplate(run.request, path.dirname(outputDir), options.template);
    let notices = Promise.resolve();
    const report: ProgressObserver = workflow => {
      if (signal.aborted) return;
      notices = notices.then(() => emit('workflow.progress', `${workflow.module === 'planner' ? '课程规划' : workflow.module === 'sources' ? '资料准备' : '视觉设计'} · ${workflow.message}`, { workflow }))
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
      await planRun({ root, ...(run.request.fileIds?.length ? { inputDirectory: path.join(path.dirname(outputDir), 'input/files') } : {}), query: run.request.query, minutes: run.request.minutes, audience: run.request.audience, scenario: run.request.scenario,
        ...(run.request.style ? { style: run.request.style } : {}), ...(options.build?.prompts ? { prompts: options.build.prompts } : {}), ...(template ? { template } : {}) },
      { planner: { ...planner, progress: report }, director: { ...director, progress: report } }, { signal, onPlanned(pagesDoc) {
        const pages = Object.entries(splitPages(pagesDoc)).sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true })).map(([number, spec]) => {
          const page = new Page('page-' + number, ''); page.spec_text = spec;
          return { pageId: page.pid, pageTitle: lessonTitle(page), state: 'pending' as const };
        });
        notices = notices.then(() => emit('plan.ready', `规划完成 · 共 ${pages.length} 页`, { pages })).catch(() => {});
      } });
      await emit('phase.changed', '正在生成讲义页面', { phase: 'create' });
      const pages = await buildRun(root, observed,
        { ...options.build, label: run.id, profile: resolveBuilderProfile(cfg, options.profile, env), profiles: Object.fromEntries(Object.entries(models.builders).map(([skill, model]) => [skill, model.profile])), signal,
          onRetry(page) {
            if (signal.aborted) return;
            states.set(page.pid, 'reworking');
            notices = notices.then(() => emit('page.progress', `${page.pid.replace('page-', '第 ')} 页 · ${page.label}：${publicReason(page)}，正在修正`, { pageId: page.pid, pageTitle: lessonTitle(page), pageState: 'reworking' }))
              .catch(error => { if (!signal.aborted) console.warn('Progress notification unavailable:', error instanceof Error ? error.name : 'error'); });
          },
          async onPage(page, state) {
            if (state === 'started') await emit('page.started', `正在生成 ${lessonTitle(page)}`, { pageId: page.pid, pageTitle: lessonTitle(page) });
            else if (delivered(page)) {
              await emit('page.ready', `${lessonTitle(page)} 已生成`, { pageId: page.pid, pageTitle: lessonTitle(page), previewUrl: `/v1/runs/${run.id}/preview/${page.pid}.html` });
              thumbnails.push(queueLectureThumbnail(path.join(root, 'pages'), page.pid, signal).catch(error => { thumbnailErrors.push(error); }));
            }
            else await emit('page.progress', `${page.pid.replace('page-', '第 ')} 页 · ${page.label} · ${lessonTitle(page)}：${publicReason(page)}，本页未收录`, { pageId: page.pid, pageTitle: lessonTitle(page), pageState: 'failed' });
          } });
      signal.throwIfAborted();
      await emit('phase.changed', '正在整理讲义产物与审计结果', { phase: 'polish' });
      const available = pages.filter(delivered);
      await Promise.all(thumbnails);
      if (thumbnailErrors.length) throw thumbnailErrors[0];
      await writeFile(path.join(root, 'pages/index.html'), lecturePreview(run.request.title ?? run.request.query, available.map(page => page.pid), Object.fromEntries(available.map(page => [page.pid, lessonTitle(page)])), available.filter(page => page.skill === 'build-code').map(page => page.pid)));
      // A deck with some pages is a deliverable; the missing ones are reported per page and kept in work/builder-results.json.
      if (!available.length) throw new Error(`生成未完成：${pages.length} 页均未通过交付检查`);
      await publishLecture(path.join(root, 'pages'), outputDir, { signal });
    } finally { await notices; await Promise.all(thumbnails); await release(); }
  };
}
