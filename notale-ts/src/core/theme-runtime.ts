/** Theme import, atomic publication and actual browser gates from core/theme.py. */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { decodeText } from './text.js';
import { RESOURCES } from './guidance.js';
import { resolvePath } from './planner-contract.js';
import { StyleCatalog, prepareFonts, images } from './style-assets.js';
import * as theme from './theme.js';
import { acquireVisualChecker, browser } from '../tools/visual-check.js';

const probe = JSON.parse(readFileSync(path.join(RESOURCES, 'theme-probe.json'), 'utf8'));
const bitmap = (file: string) => theme.IMAGES.has(path.extname(file).toLowerCase()) && path.extname(file).toLowerCase() !== '.svg';
const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
async function walk(root: string): Promise<string[]> {
  if (!existsSync(root)) return [];
  const result: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) result.push(...await walk(file));
    else if (statSync(file).isFile()) result.push(file);
  }
  return result;
}
export async function importInput(source: string | undefined, assets: string, allowRepair = false, request = ''): Promise<{ css: string; shots: string[] }> {
  if (source === undefined) return { css: '', shots: [] };
  source = resolvePath(source);
  const boundary = statSync(source).isDirectory() ? source : path.dirname(source);
  const target = path.join(assets, 'style');
  const copy = async (file: string) => {
    const resolved = resolvePath(file);
    if (!theme.isWithin(resolved, boundary)) throw theme.valueError(`资源越界/外部软链接: ${file}`);
    const dest = path.join(target, path.relative(boundary, file));
    await mkdir(path.dirname(dest), { recursive: true });
    await copyFile(resolved, dest);
    return dest;
  };
  if (statSync(source).isFile()) {
    if (!bitmap(source)) throw theme.valueError('--template 文件须为参考图片；CSS 请放在主题目录');
    await sharp(source, { failOn: 'error' }).raw().toBuffer();
    const dest = path.join(target, 'shots', path.basename(source));
    await mkdir(path.dirname(dest), { recursive: true });
    await copyFile(source, dest);
    return { css: '', shots: [dest] };
  }
  const shots: string[] = [];
  for (const file of (await walk(path.join(source, 'shots'))).filter(bitmap).sort()) shots.push(await copy(file));
  for (const file of await walk(source)) {
    const relative = path.relative(source, file).split(path.sep).join('/');
    if ((theme.IMAGES.has(path.extname(file).toLowerCase()) || theme.FONTS.has(path.extname(file).toLowerCase())) && request.includes(relative)) await copy(file);
  }
  const themeFile = path.join(source, 'theme.css');
  if (!existsSync(themeFile) || !statSync(themeFile).isFile()) {
    if (!shots.length) throw theme.valueError('目录缺 theme.css 且 shots/ 内没有参考图');
    return { css: '', shots };
  }
  if (!theme.isWithin(themeFile, boundary)) throw theme.valueError('theme.css 外部软链接越界');
  const css = decodeText(await readFile(themeFile));
  const errors = theme.inspect(css).bad;
  if (errors.length && !allowRepair) throw theme.valueError('导入主题无效（未授权重写）: ' + errors.join('；'));
  const root = theme.parseCss(css);
  for (const token of theme.cssUrls(root)) {
    const [file, fragment] = theme.localUrl(token.value, source, boundary);
    if (!file) continue;
    const dest = await copy(file);
    if (theme.FONTS.has(path.extname(file).toLowerCase())) {
      for (const notice of await readdir(path.dirname(file), { withFileTypes: true })) if (notice.isFile() && ['OFL.TXT', 'LICENSE', 'LICENSE.TXT', 'LICENSE-OFL', 'NOTICE', 'NOTICE.TXT', 'COPYING'].includes(notice.name.toUpperCase())) await copy(path.join(path.dirname(file), notice.name));
      for (const notice of await walk(path.join(path.dirname(file), 'LICENSES'))) if (notice.endsWith('.txt')) await copy(notice);
    }
    token.replace(path.relative(assets, dest).split(path.sep).map(part => encodeURIComponent(part).replace(/[!'()*]/g, char => '%' + char.charCodeAt(0).toString(16).toUpperCase())).join('/') + fragment);
  }
  let imported = root.toString();
  const matched = imported.match(theme.INTERFACE);
  if (matched) {
    let block = matched[0];
    for (const reference of [...block.matchAll(theme.REFERENCE)].reverse()) {
      if (reference[1] === 'style') continue;
      const [file] = theme.localUrl(reference[2]!, source, boundary);
      if (!file || !bitmap(file)) throw theme.valueError(`主题参考须为本地位图: ${reference[2]}`);
      const dest = await copy(file);
      block = block.slice(0, reference.index) + 'reference user:' + path.relative(assets, dest).split(path.sep).join('/') + block.slice(reference.index! + reference[0].length);
    }
    imported = imported.slice(0, matched.index) + block + imported.slice(matched.index! + matched[0].length);
  }
  return { css: imported, shots };
}
export async function referenceImages(css: string, assets: string, catalog = new StyleCatalog()) {
  return theme.references(css).map(([kind, value]) => {
    let shot: string;
    if (kind === 'style') shot = catalog.readPath(value);
    else {
      const [file] = theme.localUrl(value, assets, assets);
      if (!file || !bitmap(file)) throw theme.valueError(`主题参考须为本地位图: ${value}`);
      shot = file;
    }
    return { id: `${kind}:${value}`, shot };
  });
}
export async function browserCheck(css: string, assets: string, names: string[], resources: Array<[string | null, string]>, signal?: AbortSignal): Promise<string[]> {
  signal?.throwIfAborted();
  await mkdir(assets, { recursive: true });
  const scratch = await mkdtemp(path.join(assets, '.theme-check-'));
  const release = acquireVisualChecker();
  let page: import('playwright').Page | undefined;
  const onAbort = () => { void page?.close().catch(() => {}); };
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    let base = path.join(assets, 'base.css');
    if (!existsSync(base)) { base = path.join(scratch, 'base.css'); await copyFile(path.join(RESOURCES, 'chassis/base.css'), base); }
    const candidate = path.join(scratch, 'candidate.css');
    const html = '<!doctype html><base href="' + escape(pathToFileURL(assets).href + '/') + '"><link rel="stylesheet" href="' + pathToFileURL(base).href + '"><link rel="stylesheet" href="' + pathToFileURL(candidate).href + '"><div id="stage"><span id="probe">中文 Ag</span><button id="control" class="nt-btn">操作</button><span id="hidden" class="nt-title" hidden>隐藏</span></div>';
    await writeFile(path.join(scratch, 'index.html'), html, 'utf8');
    const parsed = theme.parseCss(css);
    for (const token of theme.cssUrls(parsed)) { const [file, fragment] = theme.localUrl(token.value, assets, path.dirname(assets)); if (file) token.replace(pathToFileURL(file).href + fragment); }
    await writeFile(candidate, parsed.toString(), 'utf8');
    page = await (await browser()).newPage();
    signal?.throwIfAborted();
    await page.route('**/*', route => {
      try {
        const url = new URL(route.request().url());
        if (url.protocol === 'file:' && theme.isWithin(fileURLToPath(url), path.dirname(assets))) return route.continue();
      } catch { /* not a permitted file URL */ }
      return route.abort();
    });
    await page.goto(pathToFileURL(path.join(scratch, 'index.html')).href);
    const bad: string[] = [];
    let noImage = false;
    for (const name of ['', ...names]) {
      signal?.throwIfAborted();
      bad.push(...await page.evaluate(`(${probe.tokens})(${JSON.stringify(name)})`) as string[]);
      await page.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      const facts = await page.evaluate(`(${probe.facts})()`) as Record<string, string>;
      if (facts.position !== 'absolute' || facts.transform === 'none' || facts.overflow !== 'hidden') bad.push(`${name || '默认'}: 覆盖了舞台定位/缩放/裁切机制`);
      if (facts.hidden !== 'none' || facts.brand !== 'none') bad.push(`${name || '默认'}: 覆盖 hidden 或品牌指针机制`);
      noImage ||= !facts.background!.includes('url(');
    }
    if (!noImage) bad.push('图片主题必须提供默认或声明的无图状态');
    for (const [file, fragment] of resources) if (file) {
      signal?.throwIfAborted();
      const image = theme.IMAGES.has(path.extname(file).toLowerCase());
      const okay = await page.evaluate(`(${image ? probe.image : probe.font})(${JSON.stringify(pathToFileURL(file).href + (image ? fragment : ''))})`);
      if (!okay) bad.push(`${image ? '图片' : '字体'}无法加载: ${path.basename(file)}`);
    }
    return bad;
  } catch (error) { if (signal?.aborted) throw signal.reason; throw error; }
  finally { signal?.removeEventListener('abort', onAbort); await page?.close().catch(() => {}); await release(); await rm(scratch, { recursive: true, force: true }); }
}
export async function validate(css: string, assets: string, browserEnabled = true, signal?: AbortSignal): Promise<string[]> {
  const { bad, root, contract } = theme.inspect(css);
  let resources: Array<[string | null, string]> = [];
  try { resources = theme.cssUrls(root ?? theme.parseCss(css)).map(token => theme.localUrl(token.value, assets, path.dirname(assets))); }
  catch (error) { if ((error as Error).name !== 'ValueError') throw error; bad.push((error as Error).message); }
  if (bad.length || !browserEnabled) return bad;
  return browserCheck(css, assets, theme.variants(contract), resources, signal);
}
export function themePorts(signal?: AbortSignal) {
  return { checkOptions: theme.checkOptions, importInput, importedAssets: async (assets: string) => (await walk(path.join(assets, 'style'))).filter(file => !path.relative(path.join(assets, 'style'), file).split(path.sep).includes('shots')).sort().map(file => path.relative(assets, file).split(path.sep).join('/')),
    prepareFonts, referenceImages, references: theme.references, gates: (css: string, assets: string) => validate(css, assets, true, signal), publish: theme.publish };
}

/** Production resources for Director; media and model remain explicit per-run dependencies. */
export function directorPorts(
  model: import('../adapters/models/runtime.js').ModelRuntime,
  trace: import('./director.js').DirectorPorts['trace'],
  media: import('./director.js').DirectorPorts['media'],
  signal?: AbortSignal,
): import('./director.js').DirectorPorts {
  return { model, visionInput: model.profile.vision_input, trace, media, catalog: new StyleCatalog(), images, theme: themePorts(signal) };
}
