/** Deterministic PPTX preparation. LibreOffice renders; all orchestration is native TS. */
import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile, readdir, rename, rm, cp, stat } from 'node:fs/promises';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { unzipSync, strFromU8 } from 'fflate';
import { parseDocument, DomUtils } from 'htmlparser2';
import { browser, staticServer, acquireVisualChecker } from '../tools/visual-check.js';
import { RESOURCES } from './guidance.js';

export const TEMPLATE_MAX_BYTES = 50 * 1024 * 1024;
export const TEMPLATE_SPEC = 'template-spec.json';
const VERSION = 'pptx-native-6';
export const digest = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export const xml = (value: string) => parseDocument(value, { xmlMode: true });
export const elements = (root: ReturnType<typeof xml>) => DomUtils.findAll(() => true, root.children);
export const serialize = (node: Parameters<typeof DomUtils.getOuterHTML>[0]) => DomUtils.getOuterHTML(node, { xmlMode: true });
export const escapeHtml = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
export interface TemplateObject { id: string; text: string; kind: string; box: number[] }
export interface TemplateSlide { id: string; svg: string; preview: string; objects: TemplateObject[]; placeholders?: Array<{ kind: string; index: string; box?: number[] }> }
export interface PreparedTemplate { schemaVersion: 1; sha256: string; width: number; height: number; slides: TemplateSlide[]; warnings: string[]; fontCss: string }

export function inspectPptx(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > TEMPLATE_MAX_BYTES) throw new Error('PPTX 文件须小于 50 MiB');
  let size = 0, count = 0;
  const seen = new Set<string>();
  const files = unzipSync(bytes, { filter(file) {
    if (++count > 10000 || (size += file.originalSize) > 500 * 1024 * 1024) throw new Error('PPTX 解包大小超出限制');
    if (seen.has(file.name) || file.name.startsWith('/') || /[\\\x00-\x1f]/.test(file.name) || file.name.split('/').some(p => p === '..' || p === '.')) throw new Error('PPTX 包含不安全或重复路径');
    seen.add(file.name); return /\.xml$|\.rels$/.test(file.name);
  } });
  const raw = files['ppt/presentation.xml'];
  if (!raw || !files['[Content_Types].xml']) throw new Error('文件不是有效的 PPTX 演示文稿');
  for (const [name, data] of Object.entries(files)) {
    const text = strFromU8(data);
    if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('PPTX 不支持 XML 实体声明');
    if (name.endsWith('.rels')) for (const el of elements(xml(text))) if (el.attribs.TargetMode === 'External' && !el.attribs.Type?.endsWith('/hyperlink')) throw new Error('模板包含外部资源，请先嵌入 PPTX');
  }
  if ([...seen].some(name => /vbaProject|activeX/i.test(name))) throw new Error('模板不支持宏或 ActiveX');
  const nodes = elements(xml(strFromU8(raw))), sizeNode = nodes.find(n => n.name === 'p:sldSz');
  const width = Number(sizeNode?.attribs.cx) / 360, height = Number(sizeNode?.attribs.cy) / 360;
  const pages = nodes.filter(n => n.name === 'p:sldId').length;
  if (!(width > 0 && height > 0) || !pages || pages > 60) throw new Error('模板需要 1–60 张有效示例页');
  const relationships = files['ppt/_rels/presentation.xml.rels'];
  const mapping = relationships ? new Map(elements(xml(strFromU8(relationships))).map(n => [n.attribs.Id, n.attribs.Target])) : new Map<string, string>();
  const slidePaths = nodes.filter(n => n.name === 'p:sldId').map(n => path.posix.normalize('ppt/' + (mapping.get(n.attribs['r:id']) || '')));
  return { width, height, pages, files, slidePaths };
}

async function office(source: string, directory: string, signal?: AbortSignal) {
  signal?.throwIfAborted();
  const profile = path.join(directory, 'profile');
  await mkdir(path.join(profile, 'user'), { recursive: true });
  await writeFile(path.join(profile, 'user/registrymodifications.xcu'), `<?xml version="1.0"?><oor:items xmlns:oor="http://openoffice.org/2001/registry"><item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item></oor:items>`);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.env.NOTALE_LIBREOFFICE ?? 'libreoffice', ['-env:UserInstallation=' + pathToFileURL(profile).href, '--headless', '--nologo', '--nodefault', '--norestore', '--convert-to', 'svg:impress_svg_Export', '--outdir', directory, source], { detached: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let error = '', timedOut = false;
    const stop = () => { if (child.pid) try { process.kill(-child.pid, 'SIGKILL'); } catch {} };
    const timer = setTimeout(() => { timedOut = true; stop(); }, 90000);
    const abort = () => stop(); signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) stop();
    child.stderr.on('data', data => { error = (error + data).slice(-3000); });
    const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
    child.once('error', e => { cleanup(); reject(e); });
    child.once('close', code => { cleanup(); if (signal?.aborted) reject(signal.reason); else if (timedOut || code !== 0) reject(new Error(timedOut ? '模板转换超过 90 秒' : `LibreOffice 转换失败：${error}`)); else resolve(); });
  });
}

/** Extract one SFNT face from a font collection, preserving all original tables. */
function fontFace(bytes: Buffer, index: number): Buffer {
  if (bytes.toString('ascii', 0, 4) !== 'ttcf') return bytes;
  const offset = bytes.readUInt32BE(12 + index * 4), count = bytes.readUInt16BE(offset + 4);
  const header = Buffer.from(bytes.subarray(offset, offset + 12 + 16 * count));
  let next = header.length;
  const chunks: Buffer[] = [header];
  for (let i = 0; i < count; i++) {
    const pos = 12 + 16 * i, start = header.readUInt32BE(pos + 8), length = header.readUInt32BE(pos + 12);
    const table = Buffer.alloc(Math.ceil(length / 4) * 4); bytes.copy(table, 0, start, start + length);
    header.writeUInt32BE(next, pos + 8); next += table.length; chunks.push(table);
  }
  return Buffer.concat(chunks);
}
const subsetFont = createRequire(import.meta.url)('subset-font') as (bytes: Buffer, text: string, options: { targetFormat: string }) => Promise<Buffer>;
async function embedFonts(roots: ReturnType<typeof xml>[], assets: string, warnings: string[]) {
  const families = new Map<string, string>();
  for (const root of roots) for (const node of elements(root)) if (node.attribs['font-family']) {
    const name = node.attribs['font-family']; families.set(name, (families.get(name) ?? '') + DomUtils.textContent(node));
  }
  const css: string[] = [];
  for (const [family, text] of families) {
    const requested = family.split(',')[0]!.replace(/["']/g, '').trim();
    const match = (await promisify(execFile)('fc-match', ['-f', '%{file}\n%{family}\n%{index}', requested + ':charset=' + [...new Set([...text].map(c => c.codePointAt(0)!.toString(16)))].join(' ')])).stdout.split('\n');
    const bytes = fontFace(await readFile(match[0]!), Number(match[2] || 0));
    const tables = bytes.readUInt16BE(4);
    let restricted = false;
    for (let i = 0; i < tables; i++) if (bytes.toString('ascii', 12 + i * 16, 16 + i * 16) === 'OS/2') restricted = Boolean(bytes.readUInt16BE(bytes.readUInt32BE(20 + i * 16) + 8) & 0x302);
    if (restricted) throw new Error(`模板字体 ${requested} 不允许嵌入或子集化，请替换字体`);
    const alias = `PptxStatic${css.length}`, data = await subsetFont(bytes, text || ' ', { targetFormat: 'woff2' }), file = digest(data).slice(0, 24) + '.woff2';
    await writeFile(path.join(assets, file), data);
    const notices = [path.join(path.dirname(match[0]!), 'OFL.txt'), path.join(path.dirname(match[0]!), 'LICENSE')];
    try {
      const owner = (await promisify(execFile)('dpkg-query', ['-S', match[0]!])).stdout.split(':')[0]!;
      if (/^[a-z0-9+.-]+$/.test(owner)) notices.push(path.join('/usr/share/doc', owner, 'copyright'));
    } catch { /* Non-Debian installs can keep their license beside the font. */ }
    if (match[1]?.split(',').includes('Noto Sans CJK SC')) notices.push(path.join(RESOURCES, 'vendor/fonts/noto-sans-sc/OFL.txt'));
    let noticeCopied = false;
    for (const notice of notices) if (existsSync(notice)) { await cp(notice, path.join(assets, alias + '-LICENSE.txt')); noticeCopied = true; break; }
    if (!noticeCopied) warnings.push(`字体 ${requested} 的本地授权说明未找到`);
    css.push(`@font-face{font-family:${alias};src:url("assets/${file}") format("woff2");font-display:swap}`);
    if (!match[1]?.split(',').includes(requested)) warnings.push(`字体替代：${requested} → ${match[1]}`);
    for (const root of roots) for (const node of elements(root)) if (node.attribs['font-family'] === family) node.attribs['font-family'] = alias;
  }
  return css.join('\n');
}

function extractSlides(raw: string, width: number, height: number) {
  const original = xml(raw), byId = new Map(elements(original).filter(n => n.attribs.id).map(n => [n.attribs.id!, n]));
  const metadata = elements(original).filter(n => /^ooo:meta_slide_\d+$/.test(n.attribs.id ?? ''));
  return metadata.map(meta => {
    const master = byId.get(meta.attribs['ooo:master']!), slide = byId.get(meta.attribs['ooo:slide']!);
    if (!master || !slide) throw new Error('模板缺少页面或母版关联');
    const groups = master.children.filter(n => 'attribs' in n && meta.attribs['ooo:' + (n.attribs.class === 'Background' ? 'background-visibility' : 'master-objects-visibility')] !== 'hidden');
    const root = xml(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${width} ${height}" width="1600" height="900">${groups.map(serialize).join('')}${serialize(slide)}</svg>`);
    for (const node of elements(root)) if (node.attribs.visibility === 'hidden') DomUtils.removeElement(node);
    const copied = new Set<string>();
    for (;;) {
      const nodes = elements(root), present = new Set(nodes.map(n => n.attribs.id)), needed = new Set<string>();
      for (const node of nodes) for (const [key, value] of Object.entries(node.attribs)) {
        for (const hit of value.matchAll(/url\(#([^)]*)\)/g)) needed.add(hit[1]!);
        if (key.endsWith('href') && value.startsWith('#')) needed.add(value.slice(1));
      }
      const missing = [...needed].filter(id => !present.has(id));
      if (!missing.length) break;
      for (const id of missing) {
        if (!byId.has(id) || copied.has(id)) throw new Error(`模板 SVG 引用缺失：${id}`);
        copied.add(id);
        const def = xml(`<defs>${serialize(byId.get(id)!)}</defs>`).children[0]!;
        DomUtils.prependChild(root.children[0] as Parameters<typeof DomUtils.prependChild>[0], def);
      }
    }
    return root;
  });
}

const pending = new Map<string, Promise<void>>();
export async function preparePptx(source: string, destination: string, signal?: AbortSignal): Promise<PreparedTemplate> {
  signal?.throwIfAborted();
  const bytes = await readFile(source), info = inspectPptx(bytes);
  const engine = (await promisify(execFile)(process.env.NOTALE_LIBREOFFICE ?? 'libreoffice', ['--version'], { timeout: 10000 })).stdout;
  const fontList = (await promisify(execFile)('fc-list', ['-f', '%{file}:%{family}\n'])).stdout.split('\n').sort().join('\n');
  const fontFiles = [...new Set(fontList.split('\n').filter(Boolean).map(row => row.split(':')[0]!))];
  const fontStamps = await Promise.all(fontFiles.map(async file => { const info = await stat(file); return [file, info.size, info.mtimeMs]; }));
  const key = digest(VERSION + engine + fontList + JSON.stringify(fontStamps) + digest(bytes));
  const cache = path.resolve(RESOURCES, '../.cache/templates', key);
  if (!existsSync(path.join(cache, 'prepared.json'))) {
    const running = pending.get(key);
    if (running) {
      await new Promise<void>((resolve, reject) => {
        const abort = () => reject(signal?.reason); signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) { signal.removeEventListener('abort', abort); reject(signal.reason); return; }
        void running.then(() => resolve(), () => resolve()).finally(() => signal?.removeEventListener('abort', abort));
      });
      signal?.throwIfAborted(); return preparePptx(source, destination, signal);
    }
    const work = build(); pending.set(key, work);
    try { await work; } finally { pending.delete(key); }
  }
  signal?.throwIfAborted();
  await cp(cache, destination, { recursive: true });
  return JSON.parse(await readFile(path.join(destination, 'prepared.json'), 'utf8')) as PreparedTemplate;

  async function build() {
    const temporary = cache + '.' + randomUUID(), raw = path.join(temporary, 'raw'), out = path.join(temporary, 'package'), assets = path.join(out, 'assets');
    await mkdir(raw, { recursive: true }); await mkdir(assets, { recursive: true });
    const release = acquireVisualChecker();
    try {
      const input = path.join(raw, 'source.pptx'); await writeFile(input, bytes); await office(input, raw, signal);
      const svg = (await readdir(raw)).find(name => name.endsWith('.svg')); if (!svg) throw new Error('LibreOffice 未输出模板 SVG');
      const roots = extractSlides(await readFile(path.join(raw, svg), 'utf8'), info.width, info.height);
      if (roots.length !== info.pages) throw new Error('模板转换前后页数不一致');
      const warnings = Object.values(info.files).some(b => /<p:timing|<p:transition/.test(strFromU8(b))) ? ['仅提取静态模板，不迁移 PowerPoint 动画。'] : [];
      for (const [index, root] of roots.entries()) {
        const nodes = elements(root), ids = new Map(nodes.filter(n => n.attribs.id).map((n, i) => [n.attribs.id!, `s${index + 1}-o${i}`]));
        for (const node of nodes) {
          if (['script', 'foreignObject'].includes(node.name)) throw new Error('模板 SVG 包含活动内容');
          if (node.name === 'a') { delete node.attribs['xlink:href']; delete node.attribs.href; }
          for (const [name, original] of Object.entries(node.attribs)) {
            if (name.toLowerCase().startsWith('on')) { delete node.attribs[name]; continue; }
            let value = name === 'id' ? ids.get(original)! : original.replace(/url\(#([^)]*)\)/g, (_, id) => `url(#${ids.get(id) ?? id})`);
            if (name.endsWith('href')) {
              if (value.startsWith('#')) value = '#' + (ids.get(value.slice(1)) ?? value.slice(1));
              else if (value.startsWith('data:')) {
                const match = value.match(/^data:image\/(png|jpeg|gif);base64,([\s\S]+)$/); if (!match) throw new Error('模板图片格式不支持');
                const data = Buffer.from(match[2]!, 'base64'), filename = digest(data).slice(0, 24) + '.' + match[1];
                await writeFile(path.join(assets, filename), data); value = 'assets/' + filename;
              } else throw new Error('模板 SVG 引用了外部资源');
            }
            node.attribs[name] = value;
          }
        }
      }
      restoreGradients(roots, info.files);
      const fontCss = await embedFonts(roots, assets, warnings);
      await writeFile(path.join(out, 'fonts.css'), fontCss);
      const slides: TemplateSlide[] = [];
      const { origin } = await staticServer(out), page = await (await browser()).newPage({ viewport: { width: 1600, height: 900 } });
      const abort = () => { void page.close().catch(() => {}); }; signal?.addEventListener('abort', abort, { once: true });
      try {
        for (const [index, root] of roots.entries()) {
          signal?.throwIfAborted();
          const id = `slide-${index + 1}`, svg = id + '.svg', preview = id + '.png';
          let textId = 0;
          for (const node of elements(root)) if (node.name === 'tspan' && node.attribs.class === 'TextParagraph') node.attribs.id = `s${index + 1}-text${++textId}`;
          const candidates = elements(root).filter(n => (n.name === 'tspan' && n.attribs.class === 'TextParagraph') || (n.name === 'g' && n.attribs.id && n.children.some(c => 'attribs' in c && c.attribs.class === 'BoundingBox')));
          for (const node of candidates) node.attribs['data-template-object'] = node.attribs.id!;
          const content = serialize(root);
          await writeFile(path.join(out, svg), content);
          await writeFile(path.join(out, id + '.html'), `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="fonts.css"><style>html,body{margin:0;width:1600px;height:900px;background:white}svg{display:block}</style>${content}`);
          await page.goto(`${origin}/${id}.html`, { waitUntil: 'load' }); await page.evaluate(() => document.fonts.ready);
          const objects = await page.evaluate(() => [...document.querySelectorAll<SVGGraphicsElement>('[data-template-object]')].map(el => {
            const b = el.getBoundingClientRect(); return { id: el.getAttribute('data-template-object')!, text: (el.textContent ?? '').trim().slice(0, 600), kind: el.parentElement?.getAttribute('class') ?? '', box: [b.x, b.y, b.width, b.height].map(n => Math.round(n * 100) / 100) };
          }));
          await page.screenshot({ path: path.join(out, preview) });
          // LO's invisible construction rectangles are not artwork; retaining them produces false overflow audits.
          for (const node of elements(root)) if (node.name === 'rect' && node.attribs.class === 'BoundingBox' && node.attribs.fill === 'none' && node.attribs.stroke === 'none') DomUtils.removeElement(node);
          await writeFile(path.join(out, svg), serialize(root));
          slides.push({ id, svg, preview, objects, placeholders: placeholders(info.files, info.slidePaths[index]!, info.width, info.height) });
        }
      } finally { signal?.removeEventListener('abort', abort); await page.close().catch(() => {}); }
      const prepared: PreparedTemplate = { schemaVersion: 1, sha256: digest(bytes), width: info.width, height: info.height, slides, warnings, fontCss };
      await writeFile(path.join(out, 'prepared.json'), JSON.stringify(prepared, null, 2));
      await mkdir(path.dirname(cache), { recursive: true }); await rename(out, cache);
    } finally { await release(); await rm(temporary, { recursive: true, force: true }); }
  }
}

/** Match OOXML gradient stops to repair LibreOffice's inverted opacity masks. */
function restoreGradients(roots: ReturnType<typeof xml>[], files: Record<string, Uint8Array>) {
  const stops = new Map<string, number[] | null>();
  for (const [name, bytes] of Object.entries(files)) {
    if (!/^ppt\/(slides|slideLayouts|slideMasters)\//.test(name)) continue;
    for (const fill of elements(xml(strFromU8(bytes))).filter(n => n.name === 'a:gradFill')) {
      const rows = DomUtils.findAll(n => n.name === 'a:gs', fill.children).map(stop => {
        const color = DomUtils.findOne(n => n.name === 'a:srgbClr', stop.children, true);
        if (!color) return undefined;
        const alpha = DomUtils.findOne(n => n.name === 'a:alpha', color.children, true);
        return { p: Number(stop.attribs.pos) / 100000, color: color.attribs.val!.toLowerCase(), alpha: alpha ? Number(alpha.attribs.val) / 100000 : 1 };
      });
      if (!rows.length || rows.some(r => !r)) continue;
      const sorted = rows.map(r => r!).sort((a, b) => a.p - b.p), key = JSON.stringify(sorted.map(r => [r.p, r.color])), values = sorted.map(r => r.alpha);
      if (stops.has(key) && JSON.stringify(stops.get(key)) !== JSON.stringify(values)) stops.set(key, null); else stops.set(key, values);
    }
  }
  for (const root of roots) {
    const fixed = new Set<string>();
    for (const gradient of elements(root).filter(n => n.name === 'linearGradient')) {
      const children = DomUtils.findAll(n => n.name === 'stop', gradient.children);
      const key = children.map(n => {
        const color = (n.attribs['stop-color'] || n.attribs.style || '').match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        return color ? [Number(n.attribs.offset), color.slice(1).map(c => Number(c).toString(16).padStart(2, '0')).join('')] : null;
      });
      const values = stops.get(JSON.stringify(key));
      if (!values) continue;
      children.forEach((n, i) => { n.attribs['stop-opacity'] = String(values[i]); }); fixed.add(gradient.attribs.id!);
    }
    for (const node of elements(root)) if ([...(node.attribs.fill ?? '').matchAll(/url\(#([^)]*)\)/g), ...(node.attribs.style ?? '').matchAll(/url\(#([^)]*)\)/g)].some(m => fixed.has(m[1]!))) {
      let current: typeof node | null = node;
      while (current) {
        if (current.attribs.style) current.attribs.style = current.attribs.style.replace(/mask:\s*url\(#[^)]*\);?/g, '');
        current = current.parent && 'attribs' in current.parent ? current.parent : null;
      }
    }
  }
}

function placeholders(files: Record<string, Uint8Array>, slide: string, width: number, height: number) {
  const chain: ReturnType<typeof xml>[] = [];
  let file: string | undefined = slide;
  while (file && files[file] && chain.length < 3) {
    chain.push(xml(strFromU8(files[file]!)));
    const rel: Uint8Array | undefined = files[path.posix.join(path.posix.dirname(file), '_rels', path.posix.basename(file) + '.rels')];
    const target: string | undefined = rel && elements(xml(strFromU8(rel))).find(n => /\/(slideLayout|slideMaster)$/.test(n.attribs.Type ?? ''))?.attribs.Target;
    file = target ? path.posix.normalize(path.posix.join(path.posix.dirname(file), target)) : undefined;
  }
  if (!chain.length) return [];
  const all = chain.map(root => elements(root).filter(n => n.name === 'p:sp'));
  const scale = Math.min(1600 / (width * 360), 900 / (height * 360)), dx = (1600 - width * 360 * scale) / 2, dy = (900 - height * 360 * scale) / 2;
  return all[0]!.flatMap(shape => {
    const ph = DomUtils.findOne(n => n.name === 'p:ph', shape.children, true); if (!ph) return [];
    const index = ph.attribs.idx ?? '0', kind = ph.attribs.type ?? 'body';
    const candidates = [shape, ...all.slice(1).flatMap(rows => rows.filter(s => {
      const inherited = DomUtils.findOne(n => n.name === 'p:ph', s.children, true);
      return inherited && ((inherited.attribs.idx ?? '0') === index || (inherited.attribs.type ?? 'body') === kind);
    }))];
    for (const candidate of candidates) {
      const transform = DomUtils.findOne(n => n.name === 'a:xfrm', candidate.children, true);
      if (!transform) continue;
      const off = DomUtils.findOne(n => n.name === 'a:off', transform.children, true), ext = DomUtils.findOne(n => n.name === 'a:ext', transform.children, true);
      if (off && ext) return [{ kind, index, box: [dx + Number(off.attribs.x) * scale, dy + Number(off.attribs.y) * scale, Number(ext.attribs.cx) * scale, Number(ext.attribs.cy) * scale].map(n => Math.round(n * 100) / 100) }];
    }
    return [{ kind, index }];
  });
}
