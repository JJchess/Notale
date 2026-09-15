/** Deterministic publication; authored files and model/tool contracts are untouched. */
import { createHash, randomUUID } from 'node:crypto';
import { constants, existsSync } from 'node:fs';
import { cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { promisify } from 'node:util';
import { brotliCompress, gzip, constants as zlib } from 'node:zlib';
import { create as openFont } from 'fontkit';
import postcss from 'postcss';
import { RESOURCES } from './guidance.js';
import { inventory, FONT_ROOT } from './style-assets.js';
import { publishOutput } from './orchestration.js';

const VERSION = 'publication-1-subset-font-2.7.0';
export const publicationCache = path.resolve(process.env.NOTALE_PUBLICATION_CACHE ?? path.join(RESOURCES, '../.cache/publication'));
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const jobs = new Map<string, Promise<unknown>>();
async function once<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (jobs.has(key)) return jobs.get(key) as Promise<T>;
  const work = fn().finally(() => jobs.delete(key)); jobs.set(key, work); return work;
}
async function atomic(file: string, bytes: string | Buffer) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = file + '.' + randomUUID() + '.tmp';
  try { await writeFile(temporary, bytes); await rename(temporary, file); }
  finally { await rm(temporary, { force: true }); }
}
async function copy(source: string, target: string) {
  await mkdir(path.dirname(target), { recursive: true });
  await cp(source, target, { mode: constants.COPYFILE_FICLONE });
}
export async function publicationFiles(root: string): Promise<string[]> {
  const result: string[] = [];
  async function walk(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Publication contains a symbolic link: ${file}`);
      if (entry.isDirectory()) await walk(file); else if (entry.isFile()) result.push(file);
    }
  }
  await walk(root); return result.sort();
}

type FontJob = { source: string; digest: string; text: string; resolve: (value: Buffer) => void; reject: (error: Error) => void };
const queue: FontJob[] = [];
const workers: Array<{ worker: Worker; job?: FontJob }> = [];
function pump() {
  while (queue.length) {
    let slot = workers.find(item => !item.job);
    if (!slot) {
      if (workers.length === 2) break;
      slot = { worker: new Worker(path.join(RESOURCES, 'publication/font-worker.mjs'), { execArgv: [] }) };
      const current = slot; workers.push(current);
      current.worker.on('message', (message: { result?: Uint8Array; error?: string }) => {
        const job = current.job; delete current.job; current.worker.unref();
        if (message.error) job?.reject(new Error(message.error)); else job?.resolve(Buffer.from(message.result!));
        pump();
      });
      current.worker.on('error', error => {
        current.job?.reject(error); workers.splice(workers.indexOf(current), 1); void current.worker.terminate(); pump();
      });
    }
    slot.job = queue.shift()!; slot.worker.ref(); slot.worker.postMessage({ source: slot.job.source, digest: slot.job.digest, text: slot.job.text });
  }
}
async function subset(source: string, sourceHash: string, characters: number[]): Promise<string> {
  const text = String.fromCodePoint(...characters), key = hash(VERSION + sourceHash + text);
  const file = path.join(publicationCache, 'fonts', key + '.woff2');
  if (existsSync(file)) return file;
  return once(file, async () => {
    const bytes = await new Promise<Buffer>((resolve, reject) => { queue.push({ source, digest: sourceHash, text, resolve, reject }); pump(); });
    await atomic(file, bytes); return file;
  });
}
export function unicodeRanges(characters: number[]): string {
  const rows: string[] = []; let first = -1, last = -1;
  const flush = () => { if (first >= 0) rows.push('U+' + first.toString(16) + (first === last ? '' : '-' + last.toString(16))); };
  for (const value of [...new Set(characters)].sort((a, b) => a - b)) {
    if (value !== last + 1) { flush(); first = value; } last = value;
  }
  flush(); return rows.join(',');
}
type Face = { source: string; digest: string; characters: number[]; chunks: Array<{ characters: number[]; file: string }> };
const faces = new Map<string, Promise<Face>>();
async function fontFace(source: string, digest: string): Promise<Face> {
  if (faces.has(digest)) return faces.get(digest)!;
  const work = (async () => {
    const bytes = await readFile(source);
    if (hash(bytes) !== digest) throw new Error('Registered font checksum mismatch: ' + source);
    const font = openFont(bytes);
    if (!('characterSet' in font)) throw new Error('Font collections are not supported by publication');
    const characters = [...font.characterSet].sort((a, b) => a - b), chunks: Face['chunks'] = [];
    // Full coverage is prepared once, independently of any lecture's character set.
    for (let i = 0; i < characters.length; i += 512) {
      const part = characters.slice(i, i + 512); chunks.push({ characters: part, file: await subset(source, digest, part) });
    }
    return { source, digest, characters, chunks };
  })();
  faces.set(digest, work); work.catch(() => faces.delete(digest)); return work;
}
export async function preparePublicationFonts(): Promise<void> {
  const pending = Object.entries(inventory()).flatMap(([name, row]) => row.files.map(face => ({ source: path.join(FONT_ROOT, name, face.file), digest: face.sha256 })));
  let cursor = 0;
  await Promise.all([0, 1].map(async () => {
    while (cursor < pending.length) { const face = pending[cursor++]!; if ((await stat(face.source)).size > 256 * 1024) await fontFace(face.source, face.digest); }
  }));
}

type Player = { directory: string; preview: string; reveal: string; css: string };
export async function preparePublicationPlayer(): Promise<Player> {
  const root = path.join(RESOURCES, 'preview'), names = ['preview.js', 'reveal.js', 'reveal.css'];
  const sources = await Promise.all(names.map(name => readFile(path.join(root, name))));
  const toolchain = await readFile(path.join(RESOURCES, '../package-lock.json'));
  const directory = path.join(publicationCache, 'player', hash(Buffer.concat([Buffer.from(VERSION), toolchain, ...sources])));
  const manifest = path.join(directory, 'manifest.json');
  if (existsSync(manifest)) return JSON.parse(await readFile(manifest, 'utf8')) as Player;
  return once(manifest, async () => {
    const { build } = await import('vite');
    const output = await build({ configFile: false, publicDir: false, logLevel: 'error', build: {
      write: false, minify: 'esbuild', target: 'es2022', lib: { entry: path.join(root, 'preview.js'), name: 'NotaleLecturePlayer', formats: ['iife'] },
    } });
    const bundle = (Array.isArray(output) ? output[0]! : output) as { output: Array<{ type: string; code?: string }> };
    const code = bundle.output.find(item => item.type === 'chunk')!.code!;
    const player: Player = { directory, preview: 'player-' + hash(code).slice(0, 20) + '.js', reveal: 'reveal-' + hash(sources[1]!).slice(0, 20) + '.js', css: 'reveal-' + hash(sources[2]!).slice(0, 20) + '.css' };
    await atomic(path.join(directory, player.preview), code);
    await atomic(path.join(directory, player.reveal), sources[1]!); await atomic(path.join(directory, player.css), sources[2]!);
    await atomic(manifest, JSON.stringify(player)); return player;
  });
}

async function optimizeFonts(root: string, files: string[], signal?: AbortSignal) {
  const characters = new Set<number>(Array.from({ length: 95 }, (_, i) => 32 + i));
  for (const file of files) {
    const relative = path.relative(root, file).replaceAll('\\', '/');
    if (!/\.(html|css|js|json)$/.test(file) || /\/(lib|code-runtime(?:-observer-v1)?|preview|fonts)\//.test(relative)) continue;
    for (const character of await readFile(file, 'utf8')) characters.add(character.codePointAt(0)!);
  }
  const allowed = new Map(Object.entries(inventory()).flatMap(([name, row]) => row.files.map(face => [face.sha256, path.join(FONT_ROOT, name, face.file)])));
  const targetFonts = path.join(root, 'assets/published/fonts');
  const replacedFonts = new Set<string>();
  let count = 0;
  for (const file of files.filter(file => file.endsWith('.css'))) {
    signal?.throwIfAborted();
    const input = await readFile(file, 'utf8'); if (!input.includes('@font-face')) continue;
    const css = postcss.parse(input), rules: postcss.AtRule[] = []; css.walkAtRules('font-face', rule => { rules.push(rule); });
    let changed = false;
    for (const rule of rules) {
      const src = rule.nodes?.find(node => node.type === 'decl' && node.prop === 'src') as postcss.Declaration | undefined;
      if (!src) continue;
      const urls = [...src.value.matchAll(/url\(\s*(?:"([^"]+)"|'([^']+)'|([^\s)]+))\s*\)/g)];
      if (urls.length !== 1) continue;
      const url = urls[0]![1] ?? urls[0]![2] ?? urls[0]![3]!;
      if (/^(?:[a-z]+:|\/|#)/i.test(url) || /[?#]/.test(url)) continue;
      const source = path.resolve(path.dirname(file), decodeURIComponent(url));
      if (!source.startsWith(root + path.sep) || !existsSync(source) || (await stat(source)).size <= 256 * 1024) continue;
      const digest = hash(await readFile(source)), registered = allowed.get(digest); if (!registered) continue;
      const face = await fontFace(registered, digest), used = face.characters.filter(value => characters.has(value));
      if (!used.length) continue;
      const usedSet = new Set(used), primary = await subset(registered, digest, used);
      const parts = [{ file: primary, characters: used }, ...face.chunks.map(chunk => ({ file: chunk.file, characters: chunk.characters.filter(value => !usedSet.has(value)) })).filter(chunk => chunk.characters.length)];
      for (const part of parts) {
        const dest = path.join(targetFonts, path.basename(part.file)); if (!existsSync(dest)) await copy(part.file, dest);
        const replacement = rule.clone();
        replacement.walkDecls(/^(src|unicode-range)$/, node => { node.remove(); });
        replacement.append({ prop: 'src', value: `url("${path.relative(path.dirname(file), dest).split(path.sep).join('/')}") format("woff2")` });
        replacement.append({ prop: 'unicode-range', value: unicodeRanges(part.characters) });
        rule.before(replacement);
      }
      rule.remove(); changed = true; count++; replacedFonts.add(source);
    }
    if (changed) await writeFile(file, css.toString());
  }
  // Full glyph coverage is now carried by the fallback chunks. Retain an original
  // font if any authored text still mentions it (including dynamic JS references).
  const references = (await Promise.all(files.filter(file => /\.(html|css|js|mjs|json|svg|txt)$/.test(file)).map(file => readFile(file, 'utf8')))).join('\n');
  for (const font of replacedFonts) {
    const name = path.basename(font), familyPath = path.basename(path.dirname(font)) + '/' + name;
    if (!references.includes(familyPath) && !references.includes('"' + name + '"') && !references.includes("'" + name + "'")) await rm(font);
  }
  return count;
}

const brotli = promisify(brotliCompress), gz = promisify(gzip);
async function compress(file: string, signal?: AbortSignal, emit = true) {
  signal?.throwIfAborted();
  if (!/\.(html|css|js|mjs|json|svg|wasm)$/.test(file)) return;
  const bytes = await readFile(file); if (bytes.length < 1024) return;
  const key = hash(bytes);
  for (const encoding of ['br', 'gz'] as const) {
    const cached = path.join(publicationCache, 'compressed', key + '.' + encoding);
    await once(cached, async () => {
      if (!existsSync(cached)) await atomic(cached, encoding === 'br' ? await brotli(bytes, { params: { [zlib.BROTLI_PARAM_QUALITY]: 4 } }) : await gz(bytes, { level: 6 }));
    });
    if (emit && (await stat(cached)).size < bytes.length * 0.95) await copy(cached, file + '.' + encoding);
  }
}
export async function preparePublicationAssets(): Promise<void> {
  const packageRoot = path.resolve(RESOURCES, '..');
  const roots = [path.join(RESOURCES, 'chassis/lib'), path.join(RESOURCES, 'code-observer'), path.join(packageRoot, 'node_modules/monaco-editor/min'), path.join(packageRoot, 'node_modules/pyodide')];
  const files = (await Promise.all(roots.filter(existsSync).map(publicationFiles))).flat(); let cursor = 0;
  await Promise.all([0, 1].map(async () => { while (cursor < files.length) await compress(files[cursor++]!, undefined, false); }));
}
export async function publishLecture(pages: string, output: string, options: { signal?: AbortSignal } = {}) {
  const start = performance.now();
  await publishOutput(pages, output, async temporary => {
    options.signal?.throwIfAborted();
    const files = await publicationFiles(temporary);
    const fontCount = await optimizeFonts(temporary, files, options.signal);
    const player = await preparePublicationPlayer();
    for (const name of [player.preview, player.reveal, player.css]) await copy(path.join(player.directory, name), path.join(temporary, 'assets/preview', name));
    const index = path.join(temporary, 'index.html');
    await writeFile(index, (await readFile(index, 'utf8')).replaceAll('assets/preview/preview.js', 'assets/preview/' + player.preview).replaceAll('assets/preview/reveal.js', 'assets/preview/' + player.reveal).replaceAll('assets/preview/reveal.css', 'assets/preview/' + player.css));
    const finalFiles = await publicationFiles(temporary); let cursor = 0;
    await Promise.all([0, 1].map(async () => { while (cursor < finalFiles.length) await compress(finalFiles[cursor++]!, options.signal); }));
    options.signal?.throwIfAborted();
    await writeFile(path.join(temporary, 'publication.json'), JSON.stringify({ version: VERSION, fonts: fontCount, buildSeconds: (performance.now() - start) / 1000 }) + '\n');
  });
}
