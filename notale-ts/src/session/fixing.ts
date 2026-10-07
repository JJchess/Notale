import { execFile } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { dirname, join, relative } from 'node:path';
import { readPage } from '@notale/format/page';
import { createRunRequestSchema } from '../protocol/index.js';
import { publishPages } from '../core/publication.js';
import type { RunService } from '../core/run-service.js';
import { fixModel, lectureFiles, PAGE, runFix, Transcript, type FixModel, type FixDeps } from '../fix/istar.js';
import { SandboxPool } from '../fix/sandbox.js';
import type { FixRequest, Fixer, Generator } from './turn.js';

/** What a finished run delivered, as the files an author would edit: its output without the player
 * (`index.html`) and the HTTP encodings (`.br`/`.gz`) publishing adds back. */
async function checkout(service: RunService, runId: string, dir: string) {
  const run = await service.store.get(runId);
  if (run.status !== 'completed') throw new Error('只能修改已完成的讲义');
  const output = join(service.store.runDir(runId), 'output');
  // Emptied, not recreated: the sandbox has this directory mounted. The author's attachments
  // (.inputs/) stay: earlier messages of the conversation still point at them.
  await mkdir(dir, { recursive: true });
  for (const entry of await readdir(dir)) if (entry !== INPUTS) await rm(join(dir, entry), { recursive: true, force: true });
  for (const file of await lectureFiles(output)) {
    if (file === 'index.html' || /\.(br|gz)$/.test(file)) continue;
    await mkdir(dirname(join(dir, file)), { recursive: true });
    await copyFile(join(output, file), join(dir, file));
  }
}

const INPUTS = '.inputs';
const run = promisify(execFile);
/** Puts the message's documents and videos into the workspace, where read finds them. DOCX and PPTX
 * are turned into PDF on the host (LibreOffice), so the agent only ever reads PDFs and videos. */
async function stage(dir: string, files: FixRequest['files']) {
  const inputs = join(dir, INPUTS), staged: { path: string; name: string; kind: string }[] = [];
  await mkdir(inputs, { recursive: true });
  for (const file of files) {
    const safe = file.name.replace(/[^\w.\-\u4e00-\u9fff]+/g, '_').slice(0, 120) || 'file';
    const folder = await mkdtemp(join(inputs, 'in-'));
    const target = join(folder, safe);
    await copyFile(file.file, target);
    if (file.kind === 'docx' || file.kind === 'pptx') {
      await run('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', folder, target], { timeout: 180_000 });
      staged.push({ path: relative(dir, target.replace(/\.(docx|pptx)$/i, '.pdf')), name: `${file.name}（已转为 PDF）`, kind: 'pdf' });
    } else staged.push({ path: relative(dir, target), name: file.name, kind: file.kind });
  }
  return staged;
}

/** Where a session's fix agent works, and which run that copy came from (for the draft preview). */
export const draftDir = (session: { dir: string }) => join(session.dir, 'istar', 'work');
export const draftTarget = (session: { dir: string }) => readFile(join(session.dir, 'istar', 'target'), 'utf8').then(text => text.trim(), () => undefined);

/** Istar on a copy of a run this session made. It runs first; only if it changed something is the
 * result published as a new run based on the target (same preview, same .notale, `basedOn` set). */
export function istarFixer(options: { service: RunService; generator: Generator; owner: string; model?: (request: FixRequest) => FixModel; env?: NodeJS.ProcessEnv; media?: FixDeps['media'] | false }): Fixer & { close(): Promise<void> } {
  if (options.env !== undefined && !options.model) throw new Error('An explicit environment requires a fix model');
  const env = options.env ?? process.env, model = options.model ?? (() => fixModel(env));
  const media = options.media === false ? undefined : options.media ?? (env.GEMINI_API_KEY || env.PARATERA_API_KEY ? { env } : undefined);
  const sandboxes = new SandboxPool(options.owner);
  let swept: Promise<void> | undefined;
  // One agent conversation per session, so "the title I just changed" still means something.
  const transcripts = new Map<string, Promise<Transcript>>();
  return {
    async close() { await sandboxes.close(); },
    async run(request, onEvent, signal) {
      const root = join(request.session.dir, 'istar'), dir = draftDir(request.session);
      await checkout(options.service, request.target, dir);
      await writeFile(join(root, 'target'), request.target);
      const inputs = await stage(dir, request.files);
      if (!transcripts.has(request.session.id)) transcripts.set(request.session.id, Transcript.open(join(root, 'transcript.jsonl')));
      const transcript = await transcripts.get(request.session.id)!;
      const result = await runFix({ instruction: request.instruction, images: request.images, inputs, ...(request.page ? { page: request.page } : {}) }, {
        model: model(request), transcript, dir,
        sandbox: async () => { swept ??= sandboxes.sweep(); await swept; return sandboxes.get(request.session.id, dir); },
        ...(media ? { media } : {}),
        report: step => onEvent({ type: 'step', ...step }),
        text: delta => onEvent({ type: 'text', ...(delta === null ? { reset: true } : { delta }) }),
        draft: draft => onEvent({ type: 'draft', ...draft }),
        ...(signal ? { signal } : {}),
      });
      const said = [result.status === 'interrupted' && result.changed ? '已停止，保留了停下前的改动。' : '', result.text, result.note].filter(Boolean).join('\n');
      if (!result.changed) return { status: result.status === 'complete' ? 'no-change' : result.status, text: [result.text, result.note].filter(Boolean).join('\n') };
      const title = (await options.generator.describe(request.target)).title;
      const snapshot = await options.service.start(createRunRequestSchema.parse({ query: title, title, basedOn: request.target, model: request.model }), {
        pipeline: async ({ outputDir, signal: runSignal, emit }) => {
          const pages = join(dirname(outputDir), 'work', 'pages');
          await mkdir(pages, { recursive: true });
          const files = await lectureFiles(dir), titles: Record<string, string> = {};
          for (const file of files) {
            await mkdir(dirname(join(pages, file)), { recursive: true });
            await copyFile(join(dir, file), join(pages, file));
            if (PAGE.test(file)) titles[file.replace(/\.html$/, '')] = readPage(await readFile(join(dir, file), 'utf8'), { untitled: file }).name;
          }
          // The same page events a generated run reports, so the run lists its pages (the understanding
          // stage reads them the next time the author asks for a change).
          const listed = Object.entries(titles).sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))
            .map(([pageId, pageTitle]) => ({ pageId, pageTitle, state: 'pending' as const }));
          await emit('plan.ready', '修改后的页面', { pages: listed });
          await publishPages(pages, outputDir, { title, titles, ...(runSignal ? { signal: runSignal } : {}) });
          for (const page of listed) await emit('page.ready', page.pageTitle, { pageId: page.pageId, pageTitle: page.pageTitle });
        },
      });
      onEvent({ runId: snapshot.id, type: 'published' });
      const { status } = await options.generator.follow(snapshot.id, onEvent);
      return { runId: snapshot.id, status, text: said };
    },
  };
}
