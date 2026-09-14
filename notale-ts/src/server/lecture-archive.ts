import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { RESOURCES } from '../core/guidance.js';
import { parse, serialize, type DefaultTreeAdapterMap } from 'parse5';
import type { RunService } from '../core/run-service.js';

function editorHtml(html: string): string {
  const root = parse(html), used = new Set<string>();
  const excluded = new Set(['html', 'head', 'body', 'script', 'style', 'link', 'meta', 'title', 'base', 'noscript']);
  function visit(node: DefaultTreeAdapterMap['node'], insideConnector = false) {
    if ('tagName' in node) {
      if (!insideConnector && !excluded.has(node.tagName)) {
        let id = node.attrs.find(attr => attr.name === 'data-notale-id')?.value;
        if (!id || used.has(id) || !/^[\w-]{1,100}$/.test(id)) id = randomUUID();
        used.add(id);
        node.attrs = node.attrs.filter(attr => attr.name !== 'data-notale-id');
        node.attrs.push({ name: 'data-notale-id', value: id });
      }
      insideConnector ||= node.attrs.some(attr => attr.name === 'data-notale-connector');
    }
    if ('childNodes' in node) for (const child of node.childNodes) visit(child, insideConnector);
  }
  visit(root);
  return serialize(root);
}

/** A static lecture plus the editor's existing project manifest; author files stay intact. */
export async function lectureArchive(service: RunService, id: string, mime: Record<string, string>): Promise<Uint8Array> {
  const run = await service.store.get(id);
  if (run.status !== 'completed') throw new Error('lecture_not_completed');
  const manifest = await service.manifest(id);
  const root = path.join(service.store.runDir(id), 'output');
  const files: Record<string, Uint8Array> = Object.create(null);
  const assets: Record<string, { hash: string; size: number; mime: string }> = Object.create(null);
  const slides: { id: string; name: string; sourcePath: string; html: string }[] = [];
  const names = new Set(manifest.files);
  for (const name of manifest.files) {
    // HTTP encodings are delivery caches, not editor assets. Keep their originals.
    if (/\.(br|gz)$/.test(name) && names.has(name.replace(/\.(br|gz)$/, ''))) continue;
    if (name === 'notale-project.json') throw new Error('reserved_project_manifest');
    const bytes = await readFile(path.join(root, name));
    files[name] = bytes;
    if (/^page-\d+\.html$/.test(name)) {
      slides.push({ id: randomUUID(), name: name.replace(/\.html$/, ''), sourcePath: name, html: editorHtml(bytes.toString('utf8')) });
    } else if (name !== 'index.html') {
      assets[name] = { hash: createHash('sha256').update(bytes).digest('hex'), size: bytes.length,
        mime: mime[path.extname(name)] ?? 'application/octet-stream' };
    }
  }
  if (!slides.length) throw new Error('lecture_has_no_pages');
  slides.sort((a, b) => a.sourcePath.localeCompare(b.sourcePath, 'en', { numeric: true }));
  files['notale-project.json'] = Buffer.from(JSON.stringify({ document: {
    schemaVersion: 1, id: randomUUID(), title: run.request.query.slice(0, 300) || '讲义',
    width: 1600, height: 900, slides, assets,
  } }));
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(RESOURCES, 'publication/archive-worker.mjs'), { execArgv: [] });
    worker.once('message', (message: { data?: Uint8Array; error?: string }) => {
      void worker.terminate();
      message.error ? reject(new Error(message.error)) : resolve(message.data!);
    });
    worker.once('error', reject);
    worker.once('exit', code => { if (code !== 0) reject(new Error(`Archive worker exited: ${code}`)); });
    worker.postMessage(files);
  });
}
