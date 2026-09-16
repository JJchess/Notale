import { parse as parseScript } from 'acorn';
import { simple as walkScript } from 'acorn-walk';
import { NOTALE_FORMAT, pageRuntime, discoverCodeLessons, codeResourcePath } from '@notale/format';
import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { RESOURCES } from '../core/guidance.js';
import { parse, serialize, type DefaultTreeAdapterMap } from 'parse5';
import type { RunService } from '../core/run-service.js';

export const archiveContentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.wasm': 'application/wasm', '.zip': 'application/zip', '.whl': 'application/zip',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf',
};

function editorHtml(html: string) {
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
      if (node.tagName === 'iframe' && !node.attrs.some(a => a.name === 'src')) { const source = node.attrs.find(a => a.name === 'data-src'); if (source) node.attrs.push({name:'src',value:source.value}); }
      insideConnector ||= node.attrs.some(attr => attr.name === 'data-notale-connector');
    }
    if ('childNodes' in node) for (const child of node.childNodes) visit(child, insideConnector);
  }
  visit(root);
  const all: DefaultTreeAdapterMap['element'][] = [];
  function collect(node: DefaultTreeAdapterMap['node']) {
    if ('tagName' in node) all.push(node);
    if ('childNodes' in node) node.childNodes.forEach(collect);
  }
  const text = (node: DefaultTreeAdapterMap['node']): string => node.nodeName === '#text' ? (node as DefaultTreeAdapterMap['textNode']).value : 'childNodes' in node ? node.childNodes.map(text).join('') : '';
  collect(root);
  const attr = (el: DefaultTreeAdapterMap['element'], name: string) => el.attrs.find(a => a.name === name)?.value;
  const title = all.find(el => el.tagName === 'h1' && text(el).trim()) ?? all.find(el => el.tagName === 'title');
  const notes = all.find(el => el.tagName === 'aside' && (attr(el, 'class') ?? '').split(/\s+/).includes('notes'));
  const steps = all.map(el => Number(attr(el, 'data-deck-step') ?? 0)).filter(Number.isFinite);
  for (const script of all.filter(el => el.tagName === 'script' && !attr(el, 'src'))) {
    try {
      walkScript(parseScript(text(script), {ecmaVersion:'latest',sourceType:'module'}), {CallExpression(node) {
        const callee = node.callee, count = node.arguments[1];
        if (callee.type === 'MemberExpression' && callee.object.type === 'Identifier' && callee.object.name === 'Deck' && callee.property.type === 'Identifier' && callee.property.name === 'onStep' && count?.type === 'Literal' && typeof count.value === 'number' && Number.isInteger(count.value) && count.value >= 0 && count.value <= 500) steps.push(count.value);
      }});
    } catch { /* Computed maxima are provided by Deck at runtime. */ }
  }
  return { html: serialize(root), name: title ? text(title).trim().slice(0, 300) : '讲义', notes: notes ? text(notes).trim() : '', nativeStepCount: Math.min(500, Math.max(0, ...steps)) };

}

/** A static lecture plus the editor's existing project manifest; author files stay intact. */
export async function lectureArchive(service: RunService, id: string, mime: Record<string, string>): Promise<Uint8Array> {
  const run = await service.store.get(id);
  if (run.status !== 'completed') throw new Error('lecture_not_completed');
  const manifest = await service.manifest(id);
  const root = path.join(service.store.runDir(id), 'output');
  const files: Record<string, Uint8Array> = Object.create(null);
  const assets: Record<string, { hash: string; size: number; mime: string }> = Object.create(null);
  const slides: (ReturnType<typeof editorHtml> & {id:string;sourcePath:string})[] = [];
  const names = new Set(manifest.files);
  for (const name of manifest.files) {
    if (name.startsWith('/') || name.includes('\\') || /[\x00-\x1f?#]/.test(name) || name.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('unsafe_archive_path');
    // HTTP encodings are delivery caches, not editor assets. Keep their originals.
    if (/\.(br|gz)$/.test(name) && names.has(name.replace(/\.(br|gz)$/, ''))) continue;
    if (name === 'notale-project.json') throw new Error('reserved_project_manifest');
    const bytes = await readFile(path.join(root, name));
    files[name] = bytes;
    if (/^page-\d+\.html$/.test(name)) {
      slides.push({ id: randomUUID(), sourcePath: name, ...editorHtml(bytes.toString('utf8')) });
    } else if (name !== 'index.html') {
      assets[name] = { hash: createHash('sha256').update(bytes).digest('hex'), size: bytes.length,
        mime: mime[path.extname(name)] ?? 'application/octet-stream' };
    }
  }
  if (!slides.length) throw new Error('lecture_has_no_pages');
  slides.sort((a, b) => a.sourcePath.localeCompare(b.sourcePath, 'en', { numeric: true }));
  const codeLessons=discoverCodeLessons(files,assets,text=>createHash('sha256').update(text).digest('hex'));
  files['notale-project.json'] = Buffer.from(JSON.stringify({
    ...NOTALE_FORMAT,
    pageRuntimes: Object.fromEntries(slides.map(slide => {
      const frames: {target:string;entry:string}[] = [];
      function visit(node: DefaultTreeAdapterMap['node']) {
        if ('tagName' in node && node.tagName === 'iframe' && node.attrs.some(a => a.name === 'class' && a.value.split(/\s+/).includes('code-workbench-frame'))) frames.push({target:node.attrs.find(a => a.name === 'data-notale-id')!.value,entry:node.attrs.find(a => a.name === 'src')?.value ?? ''});
        if ('childNodes' in node) node.childNodes.forEach(visit);
      }
      visit(parse(slide.html));
      return [slide.id,pageRuntime(slide.nativeStepCount,frames.map(frame=>{
        const lesson = codeLessons[codeResourcePath(frame.entry,slide.sourcePath)];
        return {...frame,...(lesson?{lesson}:{})};
      }))];
    })),
    document: {
    schemaVersion: 1, id: randomUUID(), title: run.request.query.slice(0, 300) || '讲义',
    width: 1600, height: 900, slides, assets, codeLessons,
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
