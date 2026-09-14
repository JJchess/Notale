import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parse, type DefaultTreeAdapterMap } from 'parse5';
import type { RunService } from '../core/run-service.js';
import { archiveContentTypes, lectureArchive, type ArchiveFormat } from './lecture-archive.js';

const EXPORT_VERSION = 'notale-export-1';
// Limit memory as well as compression concurrency across service instances.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.then(work, work); queue = next.catch(() => undefined); return next;
}
async function atomic(file: string, data: string | Uint8Array): Promise<void> {
  const temporary = file + '.' + randomUUID() + '.tmp';
  try { await writeFile(temporary, data); await rename(temporary, file); }
  finally { await rm(temporary, { force: true }); }
}
type ExportState = { status: 'queued' | 'building' | 'ready' | 'failed'; key?: string; bytes?: number; error?: string };
type Pack = (service: RunService, id: string, mime: Record<string, string>, format: ArchiveFormat) => Promise<Uint8Array>;

export function notaleFilename(title: string, id: string): string {
  const clean = title.replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
  return (Array.from(clean).slice(0, 80).join('') || id) + '.notale';
}

export async function lectureFilename(service: RunService, id: string): Promise<string> {
  const fallback = `讲义-${id}`;
  const manifest = await service.manifest(id);
  const cover = manifest.files.filter(name => /^page-\d+\.html$/.test(name))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))[0];
  if (!cover) return notaleFilename('', fallback);
  const root = parse(await readFile(path.join(service.store.runDir(id), 'output', cover), 'utf8'));
  const headings: string[] = [], titles: string[] = [];
  const text = (node: DefaultTreeAdapterMap['node']): string => {
    if ('value' in node && node.nodeName === '#text') return node.value;
    if ('tagName' in node && ['script', 'style'].includes(node.tagName)) return '';
    if ('tagName' in node && node.tagName === 'br') return ' ';
    return 'childNodes' in node ? node.childNodes.map(text).join('') : '';
  };
  function visit(node: DefaultTreeAdapterMap['node']) {
    if ('tagName' in node && ['h1', 'title'].includes(node.tagName)) {
      const value = text(node).replace(/\s+/g, ' ').trim();
      if (value) (node.tagName === 'h1' ? headings : titles).push(value);
    }
    if ('childNodes' in node) node.childNodes.forEach(visit);
  }
  visit(root);
  return notaleFilename(headings[0] ?? titles[0] ?? '', fallback);
}

/** Durable post-publication exports. Completed output is immutable; never write into it. */
export class LectureExports {
  private readonly pending = new Map<string, Promise<string>>();
  constructor(private readonly service: RunService, private readonly pack: Pack = lectureArchive) {}

  ensure(id: string, format: ArchiveFormat = 'notale'): Promise<string> {
    const job = id + ':' + format, existing = this.pending.get(job);
    if (existing) return existing;
    const promise = this.prepare(id, format).finally(() => { this.pending.delete(job); });
    this.pending.set(job, promise);
    return promise;
  }

  private async prepare(id: string, format: ArchiveFormat): Promise<string> {
    const run = await this.service.store.get(id);
    if (run.status !== 'completed') throw new Error('lecture_not_completed');
    const directory = path.join(this.service.store.runDir(id), 'exports');
    await mkdir(directory, { recursive: true });
    const stateFile = path.join(directory, format + '.json');
    const destination = path.join(directory, 'lecture.' + format);
    const save = (state: ExportState) => atomic(stateFile, JSON.stringify(state) + '\n');
    const manifest = await this.service.manifest(id);
    const rows = await Promise.all(manifest.files.map(async name => {
      const s = await stat(path.join(this.service.store.runDir(id), 'output', name));
      return [name, s.size, s.mtimeMs, s.ctimeMs];
    }));
    const key = createHash('sha256').update(JSON.stringify([EXPORT_VERSION, format, manifest, run.request.query, rows])).digest('hex');
    try {
      const previous: ExportState = JSON.parse(await readFile(stateFile, 'utf8'));
      if (previous.status === 'ready' && previous.key === key && previous.bytes === (await stat(destination)).size) return destination;
    } catch { /* Missing/stale cache is rebuilt, never served as a partial file. */ }
    await save({ status: 'queued', key });
    return serial(async () => {
      try {
        await save({ status: 'building', key });
        for (const name of await readdir(directory)) if (/^lecture\.(zip|notale)\.[\w-]+\.tmp$/.test(name)) await rm(path.join(directory, name), { force: true });
        const bytes = await this.pack(this.service, id, archiveContentTypes, format);
        await atomic(destination, bytes);
        await save({ status: 'ready', key, bytes: bytes.length });
        return destination;
      } catch (error) {
        await save({ status: 'failed', key, error: error instanceof Error ? error.message : String(error) });
        throw error;
      }
    });
  }

  async recover(): Promise<void> {
    let entries;
    try { entries = await readdir(this.service.store.root, { withFileTypes: true }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      for (const format of ['notale', 'zip'] as const) {
        try {
          const state: ExportState = JSON.parse(await readFile(path.join(this.service.store.runDir(entry.name), 'exports', format + '.json'), 'utf8'));
          if (state.status === 'queued' || state.status === 'building') void this.ensure(entry.name, format).catch(() => undefined);
        } catch { /* Historical runs are exported on demand; no bulk backfill. */ }
      }
    }
  }

  async idle(): Promise<void> { while (this.pending.size) await Promise.allSettled([...this.pending.values()]); }
}
