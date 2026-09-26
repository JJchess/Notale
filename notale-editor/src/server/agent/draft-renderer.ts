import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../../domain/hash.js';
import { filePath, type DeckDocument } from '../../domain/model.js';
import { renderSlide } from '../render.js';
import { PosterService } from '../posters.js';
import type { TurnDeps } from './run.js';

type Render = NonNullable<TurnDeps['render']>;
export interface DraftSource {
  blob: (hash: string) => Promise<Buffer>;
  stylesheets: (doc: DeckDocument) => Promise<Record<string, string>>;
  runtimeDir: string;
}
const RUNTIME = /^__notale_runtime__\/(bridge\.js|chart-engine\.js|text-editor\.js|vector-editor\.js|vector-worker\.js|pathkit\.wasm)$/;

/** One file of a draft deck, by its path in the deck: a runtime script, a page, or an asset. */
export async function draftFile(document: DeckDocument, path: string, source: DraftSource): Promise<{ type: string; body: Buffer | string } | undefined> {
  const runtime = RUNTIME.exec(path)?.[1];
  if (runtime) return { type: runtime.endsWith('.wasm') ? 'application/wasm' : 'text/javascript; charset=utf-8', body: await readFile(resolve(source.runtimeDir, runtime)) };
  const slide = document.slides.find(page => page.sourcePath === path);
  if (slide) return { type: 'text/html; charset=utf-8', body: await renderSlide(document, slide, 'draft', slide.layoutId ? await source.stylesheets(document) : undefined, 'poster') };
  const metadata = document.assets[path];
  return metadata && { type: metadata.mime, body: await source.blob(metadata.hash) };
}

/** Screenshot (and layout warnings) of a draft page. `register` makes the document reachable and
 * returns the base URL its files are served under, ending in '/'. */
export async function renderDraftPage(posters: PosterService, scope: string, register: (document: DeckDocument) => string, { slide, document, probe, image }: Parameters<Render>[0]): ReturnType<Render> {
  const key = sha256(JSON.stringify(['draft-1', scope, document.id, slide, document.width, document.height, document.theme, document.layouts.find(layout => layout.id === slide.layoutId), document.assets]));
  const create = async () => {
    const url = `${register(document)}${slide.sourcePath.split('/').map(encodeURIComponent).join('/')}?notaleMode=poster`;
    // One-to-one with the canvas, so a position on the picture is a position in the style.
    return { key, url, width: document.width, height: document.height, step: 0, outWidth: document.width, probe: true };
  };
  // ponytail: polls the shared single-browser queue; urgent puts it ahead of thumbnails, a busy AI burst still serialises.
  const deadline = Date.now() + 15_000;
  for (;;) {
    const bytes = await posters.request(key, create, true);
    if (bytes) return { ...(image ? { image: bytes } : {}), ...(probe ? { warnings: await posters.warnings(key) } : {}) };
    if (Date.now() >= deadline) return undefined;
    await new Promise(done => setTimeout(done, 300));
  }
}

/** The stylesheets a layout page needs, straight from the deck's css assets. */
const assetStylesheets = (blob: DraftSource['blob']) => async (doc: DeckDocument) =>
  Object.fromEntries((await Promise.all(Object.entries(doc.assets)
    .filter(([path, a]) => /\.css$/i.test(path) || a.mime.startsWith('text/css'))
    .map(async ([path, a]) => [path, (await blob(a.hash).catch(() => undefined))?.toString()] as const)))
    .filter(([, css]) => css !== undefined)) as Record<string, string>;

/** `TurnDeps.render` without the editor app: a loopback server for draft pages plus its own poster browser
 * (Chromium from EDITOR_CHROMIUM_PATH). Runtime scripts come from `runtimeDir`, default the package's dist. */
export async function createDraftRenderer(options: {
  blob: (hash: string) => Promise<Buffer>;
  stylesheets?: (doc: DeckDocument) => Promise<Record<string, string>>;
  runtimeDir?: string;
  cacheDir?: string;
}): Promise<{ render: Render; close(): Promise<void> }> {
  const source: DraftSource = {
    blob: options.blob,
    stylesheets: options.stylesheets ?? assetStylesheets(options.blob),
    runtimeDir: options.runtimeDir ?? process.env.EDITOR_RUNTIME_DIR ?? fileURLToPath(new URL('../../../dist/', import.meta.url)),
  };
  const drafts = new Map<string, { document: DeckDocument; expires: number }>();
  const server = createServer(async (req, res) => {
    try {
      const [, token = '', ...rest] = new URL(req.url ?? '/', 'http://x').pathname.split('/');
      const entry = drafts.get(token), path = filePath.safeParse(rest.map(decodeURIComponent).join('/'));
      const file = entry && entry.expires > Date.now() && path.success ? await draftFile(entry.document, path.data, source) : undefined;
      res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Cache-Control', 'no-store');
      if (!file) { res.writeHead(entry ? 404 : 403).end(); return; }
      res.writeHead(200, { 'content-type': file.type }).end(file.body);
    } catch { if (!res.headersSent) res.writeHead(500); res.end(); }
  });
  await new Promise<void>((done, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', done); });
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const posters = new PosterService(options.cacheDir ?? join(tmpdir(), 'notale-draft-posters'));
  const register = (document: DeckDocument) => {
    const now = Date.now(); for (const [token, entry] of drafts) if (entry.expires < now) drafts.delete(token);
    const token = randomBytes(24).toString('base64url'); drafts.set(token, { document, expires: now + 120_000 });
    return `${origin}/${token}/`;
  };
  return {
    render: input => renderDraftPage(posters, 'standalone', register, input),
    close: async () => { posters.close(); server.closeAllConnections(); await new Promise(done => server.close(done)); },
  };
}
