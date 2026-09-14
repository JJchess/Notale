import { observedStep, workflowNotice } from './workflow-progress.js';
/** Plan publication and Builder handoff from Python's plan_run/main. */
import { existsSync, statSync } from 'node:fs';
import { constants } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { decodeText } from './text.js';
import { parsePythonJson, jsonText, sumIntegers, rememberNumber } from './json.js';
import { RESOURCES, WORKFLOWS, PAGE_WORKFLOWS } from './guidance.js';
import { deckCall, type PlannerPorts } from './planning.js';
import { direct, type DirectorPorts, type DirectorRequest } from './director.js';
import { plannerPrompt, splitPages, PAGES_REL } from './planner-contract.js';
import { mediaSources, writeCredits } from '../tools/media-execution.js';
import { Page, routePage, buildOne, auditDelivery, type BuilderPorts } from './builder.js';
import { chapterPreloads, environmentContext, instructionBlocks, type InstructionOptions } from './builder-context.js';
import { referenceImages } from './theme-runtime.js';
import { images } from './style-assets.js';
import type { ResolvedProfile } from '../adapters/models/profiles.js';
import { isWithin } from './theme.js';

export interface Brief { description: string; prompt: string }
export async function seed(root: string, chassis = path.join(RESOURCES, 'chassis'), lib = path.join(chassis, 'lib')): Promise<void> {
  const assets = path.join(root, 'pages/assets'); await mkdir(assets, { recursive: true });
  for (const file of ['base.css', 'base.js', 'CHASSIS.md']) {
    const source = path.join(chassis, file);
    if (!existsSync(source)) throw new Error(`底盘缺 ${source} —— 它是 harness 的输入,不能缺`);
    await cp(source, path.join(assets, file));
  }
  // The same Check implementation is bundled for inspection after relocation.
  const diagnostics = path.resolve(RESOURCES, '../dist/diagnostics');
  if (!existsSync(path.join(diagnostics, 'selfcheck.mjs'))) throw new Error('缺少独立检查器；请先运行 npm run build');
  await cp(diagnostics, assets, { recursive: true });
  // Preserve explicitly supplied legacy chassis diagnostics as an extension.
  if (existsSync(path.join(chassis, 'selfcheck.py'))) await cp(path.join(chassis, 'selfcheck.py'), path.join(assets, 'selfcheck.py'));
  // Browser libraries are copied, never linked to the repository.
  if (!existsSync(path.join(assets, 'lib'))) await cp(lib, path.join(assets, 'lib'), { recursive: true });
}
export async function briefs(run: DirectorRequest, numbers: string[], mapping: Record<string, string[]> = {}): Promise<Brief[]> {
  const records = await mediaSources(path.join(run.root, 'pages'));
  return numbers.map(number => {
    const pid = `page-${number}`;
    let prompt = plannerPrompt('brief', { query: run.query, pid, total: numbers.length }, run.styleDirector ?? true, run.prompts);
    const paths = mapping[pid] ?? [];
    if (paths.length) prompt += '\n\n本页可用素材（按内容需要选用）：\n' + paths.map(file => {
      const row = records[file] ?? {}, parts = ['title', row.page_url ? 'page_url' : 'url', 'author', 'license', 'model'].filter(key => row[key]).map(key => String(row[key]));
      return `- \`${file}\`` + (parts.length ? ' — ' + parts.join(' · ') : '');
    }).join('\n');
    return { description: `Build ${pid}`, prompt };
  });
}
export async function planRun(run: DirectorRequest, ports: { planner: PlannerPorts; director: DirectorPorts }, options: { chassis?: string; lib?: string; signal?: AbortSignal; onPlanned?(pagesDoc: string): void } = {}): Promise<{ pages: number; root: string }> {
  ports.director.theme.checkOptions(run.template, run.style, run.styleDirector ?? true);
  await seed(run.root, options.chassis, options.lib);
  // Neither branch consumes the other's planning context. Wait for both even on failure.
  if (run.styleDirector === false) workflowNotice(ports.director.progress, 'director', 'overall', 'skipped', '未启用独立视觉设计，沿用规划主题');
  const director = run.styleDirector === false ? Promise.resolve() : observedStep(ports.director.progress, 'director', 'overall', '视觉设计', () => direct(run, ports.director, options.signal));
  const planning = observedStep(ports.planner.progress, 'planner', 'overall', '课程规划', () => deckCall(run, ports.planner, options.signal)).then(result => {
    try { options.onPlanned?.(result.pagesDoc); } catch {}
    return result;
  });
  const [planned, styled] = await Promise.allSettled([planning, director]);
  if (planned.status === 'rejected') throw planned.reason;
  if (styled.status === 'rejected') throw new Error(`style director 失败:${styled.reason instanceof Error ? styled.reason.message : String(styled.reason)}`);
  options.signal?.throwIfAborted();
  const { css, pagesDoc, mapping } = planned.value, assets = path.join(run.root, 'pages/assets');
  if (run.styleDirector !== false) decodeText(await readFile(path.join(assets, 'theme.css')));
  await mkdir(path.dirname(path.join(run.root, PAGES_REL)), { recursive: true });
  await writeFile(path.join(run.root, PAGES_REL), pagesDoc);
  if (run.styleDirector === false) await writeFile(path.join(assets, 'theme.css'), css);
  const pages = splitPages(pagesDoc), numbers = Object.keys(pages).sort();
  await mkdir(path.join(run.root, 'pages/plan'), { recursive: true });
  for (const number of numbers) await writeFile(path.join(run.root, 'pages/plan', `p${number}.md`), pages[number] + '\n');
  const chassis = path.join(assets, 'CHASSIS.md'), text = decodeText(await readFile(chassis));
  if (!text.includes('Deck.fmt(v, d)')) await writeFile(chassis, text.trimEnd() + '\n`Deck.fmt(v, d)` **给非负数加 `+`**，只用于增量（`+3.2%`）；年代、质量、温度、距离等\n绝对量一律 `v.toFixed(d)`。\n');
  await writeFile(path.join(run.root, 'briefs.json'), JSON.stringify(await briefs(run, numbers, mapping), null, 2));
  try { await writeCredits(path.join(run.root, 'pages')); } catch (error) { console.warn(`  素材来源汇总失败（不影响交付）：${(error as Error).message}`); }
  return { pages: numbers.length, root: run.root };
}
async function themeReferences(root: string): Promise<Record<string, any>[]> {
  const assets = path.join(root, 'pages/assets'), css = decodeText(await readFile(path.join(assets, 'theme.css')));
  let selected = await referenceImages(css, assets);
  if (!selected.length) {
    const shots = path.join(assets, 'style/shots');
    const files: string[] = [];
    const walk = async (directory: string): Promise<void> => {
      if (!existsSync(directory)) return;
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) await walk(file);
        else if (/\.(png|jpe?g|gif|webp)$/i.test(file) && (await stat(file)).isFile()) files.push(file);
      }
    };
    await walk(shots); selected = files.sort().map(shot => ({ id: '用户/主题包参考', shot }));
  }
  return (await images(selected)).map(block => block.type === 'text' ? { type: 'input_text', text: block.text } : { type: 'input_image', image_url: block.image_url.url });
}
export interface BuildOptions extends InstructionOptions {
  label: string; profile: ResolvedProfile; profiles: Record<string, ResolvedProfile>;
  concurrency?: number; only?: string[]; sampleShots?: boolean; signal?: AbortSignal;
  onRetry?(page: Page): void;
  onPlan?(pages: Page[]): Promise<void>;
  onPage?(page: Page, state: 'started' | 'finished'): Promise<void>;
}
export async function buildRun(root: string, ports: Record<string, BuilderPorts>, options: BuildOptions): Promise<Page[]> {
  const raw: Brief[] = parsePythonJson(decodeText(await readFile(path.join(root, 'briefs.json'))));
  const workflows = options.workflowRoot ?? WORKFLOWS;
  const missing = PAGE_WORKFLOWS.filter(name => {
    const file = path.join(workflows, name, 'SKILL.md');
    return !existsSync(file) || !statSync(file).isFile();
  });
  if (missing.length) throw Object.assign(new Error('生产 workflow 未安装完整: ' + missing.join(', ')), { name: 'FileNotFoundError' });
  let pages = raw.map(brief => routePage(root, new Page(brief.description.replaceAll('Build ', ''), brief.prompt)));
  for (const page of pages) page.total = raw.length;
  if (options.only) pages = pages.filter(page => options.only!.includes(page.pid));
  const manifestFile = path.join(root, 'builder-manifest.json'), directory = path.join(root, 'pages');
  if (existsSync(manifestFile)) throw Object.assign(new Error(`${manifestFile} 已存在；新实验请使用新的 run label`), { name: 'FileExistsError' });
  for (const page of pages) if (existsSync(path.join(directory, page.pid + '.html')) || existsSync(path.join(directory, 'assets/lessons', page.pid))) throw Object.assign(new Error(`${page.pid} 已有构建产物；新实验必须从 absent target 开始`), { name: 'FileExistsError' });
  await options.onPlan?.(pages);
  const refs = pages.some(page => page.workflow !== 'build-code') ? await themeReferences(root) : [];
  const profile = options.profile, samples = options.samples ?? 'mini', auxiliary = options.includeAux ?? samples !== 'none';
  const manifest: Record<string, any> = { schemaVersion: 3, label: options.label, profile: profile.id, model: profile.model, baseUrl: profile.base_url,
    apiKeyEnv: profile.api_key_env, adapter: profile.adapter, reasoningEffort: profile.reasoning_effort, visionInput: profile.vision_input,
    workflowProfiles: Object.fromEntries(Object.entries(options.profiles).map(([name, profile]) => [name, profile.id])), auxiliarySamples: auxiliary,
    samples, sampleShots: options.sampleShots ?? false, visualFocus: options.visualFocus ?? false, notesMode: options.notes ?? 'cap',
    refShots: refs.some(ref => ref.type === 'input_image'), themeReferences: refs.filter(ref => ref.type === 'input_text').map(ref => ref.text),
    pages: pages.map(page => page.pid), startedAt: new Date().toISOString() };
  await writeFile(manifestFile, jsonText(manifest, { indent: 2 }) + '\n');
  const chapters = chapterPreloads(root, raw.length), instructions = Object.fromEntries(PAGE_WORKFLOWS.map(name => [name, Object.values(instructionBlocks(root, raw.length, name, { ...options, includeAux: auxiliary })).join('\n\n')]));
  for (const page of pages) page.prompt = environmentContext(directory, page.pid, path.join(workflows, page.workflow)) + '\n\n' + page.prompt + '\n\n' + chapters[page.pid];
  const started = performance.now(), concurrency = options.concurrency ?? 100;
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('max_workers must be greater than 0');
  let cursor = 0;
  const workers = await Promise.allSettled(Array.from({ length: Math.min(concurrency, pages.length) }, async () => {
    for (;;) {
      options.signal?.throwIfAborted();
      const page = pages[cursor++]; if (!page) return;
      const port = ports[page.workflow]!, runtime = options.profiles[page.workflow]!;
      await options.onPage?.(page, 'started');
      try { await buildOne(page, directory, path.join(root, 'trace.jsonl'), instructions[page.workflow]!, port,
        { ...(options.onRetry ? { onRetry: options.onRetry } : {}), workflowRoot: workflows, visionInput: runtime.vision_input, textReport: ['notes', 'only'].includes(options.notes ?? 'cap'), sampleShots: options.sampleShots ?? false, refs, ...(options.signal ? { signal: options.signal } : {}) }); }
      catch (error) {
        if (options.signal?.aborted) throw options.signal.reason;
        const exception = error as Error; page.why = `${exception.name}: ${[...exception.message].slice(0, 160).join('')}`; page.termination = 'agent_exception';
        const target = path.join(directory, page.pid + '.html'); page.artifact_present = existsSync(target) && (await stat(target)).isFile() && (await stat(target)).size > 0;
        page.audit = await auditDelivery({ cwd: directory, pid: page.pid, resourceRoot: path.join(workflows, page.workflow), textReport: ['notes', 'only'].includes(options.notes ?? 'cap') }, page, port, options.signal);
      }
      await options.onPage?.(page, 'finished');
    }
  }));
  for (const worker of workers) if (worker.status === 'rejected') throw worker.reason;
  try { await writeCredits(directory); } catch (error) { console.warn(`  素材来源汇总失败（不影响页面产物）：${(error as Error).message}`); }
  const results = Object.fromEntries(pages.map(page => [page.pid, { calls: page.calls, within_response_target: page.calls <= 11, seconds: Math.round(page.seconds * 10) / 10,
    label: page.label, workflow: page.workflow, profile: options.profiles[page.workflow]!.id, termination: page.termination, premature_stops: page.premature_stops, last_stop_error: page.last_stop_error, artifact_present: page.artifact_present, audit: page.audit,
    steps: page.steps, args: page.steps_arg, reference_reads: page.reference_reads, images: page.images, evicted: page.evicted,
    tok_in: page.tok_in, tok_cached: page.tok_cached, tok_write: page.tok_write, tok_out: page.tok_out, tok_max: page.tok_max, cache_reported: page.cache_seen, why: page.why }]));
  for (const result of Object.values(results)) rememberNumber(result, 'seconds', result.seconds, '0.0');
  await writeFile(path.join(root, 'builder-results.json'), jsonText(results, { indent: 2 }) + '\n');
  Object.assign(manifest, { completedAt: new Date().toISOString(), wallSeconds: Math.round((performance.now() - started) / 100) / 10, artifacts: pages.filter(page => page.artifact_present).length,
    attempted: pages.length, fatalAuditPages: pages.filter(page => page.audit?.fatal_errors.length).map(page => page.pid), visualWarningPages: pages.filter(page => page.audit?.visual_warnings.length).map(page => page.pid), overResponseTargetPages: pages.filter(page => page.calls > 11).map(page => page.pid),
    inputTokens: sumIntegers(...pages.map(page => page.tok_in)), outputTokens: sumIntegers(...pages.map(page => page.tok_out)), checkCalls: pages.reduce((sum, page) => sum + page.steps.filter(step => step === 'Check').length, 0) });
  await writeFile(manifestFile, jsonText(manifest, { indent: 2 }) + '\n');
  return pages;
}

/** Publish a portable tree while preserving the protected working run. */
export async function publishOutput(pages: string, output: string, prepare?: (temporary: string) => Promise<void>): Promise<void> {
  const boundary = await realpath(pages);
  const inspect = async (directory: string, ancestors = new Set<string>()): Promise<void> => {
    const resolved = await realpath(directory);
    if (!isWithin(resolved, boundary)) throw new Error(`产物链接指向运行目录之外：${directory}`);
    if (ancestors.has(resolved)) throw new Error(`产物目录包含循环链接：${directory}`);
    const next = new Set([...ancestors, resolved]);
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name), actual = await realpath(target);
      if (!isWithin(actual, boundary)) throw new Error(`产物链接指向运行目录之外：${target}`);
      if ((await stat(target)).isDirectory()) await inspect(target, next);
    }
  };
  await inspect(pages);
  if (existsSync(output) && (await readdir(output)).length) throw new Error(`最终产物目录非空，拒绝覆盖：${output}`);
  await mkdir(path.dirname(output), { recursive: true });
  const temporary = await mkdtemp(path.join(path.dirname(output), '.notale-output-'));
  try {
    await cp(pages, temporary, { recursive: true, dereference: true, mode: constants.COPYFILE_FICLONE });
    await prepare?.(temporary);
    await rename(temporary, output);
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
