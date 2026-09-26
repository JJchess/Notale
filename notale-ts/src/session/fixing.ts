import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { readPage } from '@notale/format/page';
import { createRunRequestSchema } from '../protocol/index.js';
import { publishPages } from '../core/publication.js';
import type { RunService } from '../core/run-service.js';
import { fixModel, lectureFiles, PAGE, runFix, Transcript, type FixModel } from '../fix/istar.js';
import { SandboxPool } from '../fix/sandbox.js';
import type { Fixer, Generator } from './turn.js';

/** What a finished run delivered, as the files an author would edit: its output without the player
 * (`index.html`) and the HTTP encodings (`.br`/`.gz`) publishing adds back. */
async function checkout(service: RunService, runId: string, dir: string) {
  const run = await service.store.get(runId);
  if (run.status !== 'completed') throw new Error('只能修改已完成的讲义');
  const output = join(service.store.runDir(runId), 'output');
  // Emptied, not recreated: the sandbox has this directory mounted.
  await mkdir(dir, { recursive: true });
  for (const entry of await readdir(dir)) await rm(join(dir, entry), { recursive: true, force: true });
  for (const file of await lectureFiles(output)) {
    if (file === 'index.html' || /\.(br|gz)$/.test(file)) continue;
    await mkdir(dirname(join(dir, file)), { recursive: true });
    await copyFile(join(output, file), join(dir, file));
  }
}

/** Where a session's fix agent works, and which run that copy came from (for the draft preview). */
export const draftDir = (session: { dir: string }) => join(session.dir, 'istar', 'work');
export const draftTarget = (session: { dir: string }) => readFile(join(session.dir, 'istar', 'target'), 'utf8').then(text => text.trim(), () => undefined);

/** Istar on a copy of a run this session made. It runs first; only if it changed something is the
 * result published as a new run based on the target (same preview, same .notale, `basedOn` set). */
export function istarFixer(options: { service: RunService; generator: Generator; owner: string; model?: () => FixModel; env?: NodeJS.ProcessEnv }): Fixer & { close(): Promise<void> } {
  const env = options.env ?? process.env, model = options.model ?? (() => fixModel(env));
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
      if (!transcripts.has(request.session.id)) transcripts.set(request.session.id, Transcript.open(join(root, 'transcript.jsonl')));
      const transcript = await transcripts.get(request.session.id)!;
      const result = await runFix({ instruction: request.instruction, images: request.images, ...(request.page ? { page: request.page } : {}) }, {
        model: model(), transcript, dir,
        sandbox: async () => { swept ??= sandboxes.sweep(); await swept; return sandboxes.get(request.session.id, dir); },
        ...(env.GEMINI_API_KEY || env.PARATERA_API_KEY ? { media: { env } } : {}),
        report: step => onEvent({ type: 'step', ...step }),
        text: delta => onEvent({ type: 'text', ...(delta === null ? { reset: true } : { delta }) }),
        draft: draft => onEvent({ type: 'draft', ...draft }),
        ...(signal ? { signal } : {}),
      });
      const said = [result.status === 'interrupted' && result.changed ? '已停止，保留了停下前的改动。' : '', result.text, result.note].filter(Boolean).join('\n');
      if (!result.changed) return { status: result.status === 'complete' ? 'no-change' : result.status, text: [result.text, result.note].filter(Boolean).join('\n') };
      const title = (await options.generator.describe(request.target)).title;
      const snapshot = await options.service.start(createRunRequestSchema.parse({ query: title, basedOn: request.target }), {
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
