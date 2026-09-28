import { execFile } from 'node:child_process';
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { createRunRequestSchema, type RunEvent } from '../protocol/index.js';
import { FileInputs } from '../core/file-input.js';
import { TemplateInputs } from '../core/template-input.js';
import type { RunService } from '../core/run-service.js';
import type { Generator } from './turn.js';

const run = promisify(execFile);
const TERMINAL = new Set(['run.completed', 'run.failed', 'run.cancelled']);

/** A PPTX brought as content: the generator reads PDFs, so LibreOffice turns it into one (the same
 * way the generator already turns DOCX into PDF). */
async function pptxToPdf(file: string, name: string) {
  const dir = await mkdtemp(join(tmpdir(), 'notale-pptx-'));
  try {
    const source = join(dir, 'deck.pptx');
    await copyFile(file, source);
    await run('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', dir, source], { timeout: 180_000 });
    return { name: name.replace(/\.pptx$/i, '') + '.pdf', bytes: await readFile(join(dir, 'deck.pdf')) };
  } finally { await rm(dir, { recursive: true, force: true }); }
}

/** Generation, used whole: the same run service the HTTP API starts runs with, its own file and
 * template stores. This layer only decides which input each attachment becomes. */
export function runGenerator(service: RunService, runsRoot: string): Generator {
  const store = service.store;
  const files = new FileInputs(runsRoot), templates = new TemplateInputs(runsRoot);
  const generator: Generator = {
    async start(request) {
      const fileIds: string[] = [], styleImageIds: string[] = [];
      for (const material of request.materials) {
        const input = material.kind === 'pptx' ? await pptxToPdf(material.file, material.name) : { name: material.name, bytes: await readFile(material.file) };
        fileIds.push((await files.save(input.name, input.bytes)).id);
      }
      for (const image of request.styleImages) styleImageIds.push((await files.save(image.name, await readFile(image.file))).id);
      const templateId = request.template ? (await templates.save(request.template.name, await readFile(request.template.file))).id : undefined;
      const { materials: _m, styleImages: _s, template: _t, ...fields } = request;
      const snapshot = await service.start(createRunRequestSchema.parse({
        ...fields, ...(fileIds.length ? { fileIds } : {}), ...(styleImageIds.length ? { styleImageIds } : {}), ...(templateId ? { templateId } : {}),
      }));
      return { runId: snapshot.id };
    },
    // Follows a run to its end, relaying its events (replayed first, then live).
    follow(runId, onEvent) {
      return new Promise((resolve, reject) => {
        let unsubscribe = () => {}, ended = false;
        const finish = (status: string) => { if (ended) return; ended = true; unsubscribe(); resolve({ status }); };
        void store.replayAndSubscribe(runId, 0, (event: RunEvent) => { onEvent(event as unknown as Record<string, unknown>); if (TERMINAL.has(event.kind)) finish(event.kind.slice(4)); })
          .then(({ snapshot, events, unsubscribe: stop }) => {
            unsubscribe = stop;
            if (ended) stop();
            for (const event of events) onEvent(event as unknown as Record<string, unknown>);
            if (['completed', 'failed', 'cancelled'].includes(snapshot.status)) finish(snapshot.status);
          }, reject);
      });
    },
    async cancel(runId) { await service.cancel(runId); },
    async describe(runId) {
      const snapshot = await store.get(runId);
      return { title: snapshot.request.title ?? snapshot.request.query, pages: (snapshot.pages ?? []).map(page => page.pageTitle) };
    },
  };
  return generator;
}
