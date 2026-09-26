import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { lookup } from 'mime-types';
import { sha256 } from '../../domain/hash.js';
import { filePath, identifier, type Asset, type Command, type DeckDocument, type Slide } from '../../domain/model.js';
import { importHtml } from '../../domain/html.js';

/** The deck as files an agent can edit. Every page sits at its own `sourcePath` and every asset at
 * its own path, so relative references inside the html stay valid as written. `deck.json` is the
 * only list of which html files are pages and in what order; everything else under the root that is
 * not bookkeeping is an asset. A page's non-html fields live next to it in `<page>.notale.json`. */
export const DECK_FILE = 'deck.json';
export const RULES_FILE = 'AGENTS.md';
const SIDE = '.notale.json';
const sidecar = (sourcePath: string) => sourcePath.replace(/\.html?$/i, '') + SIDE;
interface DeckFile { title?: string; theme: Record<string, string>; pages: string[] }

/** What the model is told about the directory: facts, not preferences. */
export function rules(doc: DeckDocument) {
  const sheets = Object.entries(doc.assets).filter(([path, asset]) => asset.mime === 'text/css' || path.endsWith('.css')).map(([path]) => path);
  return `# 这份讲义

这个目录就是一份讲义。直接改文件；改完不再调用工具，写一两句话告诉作者改了什么。

## 目录
- \`deck.json\`：\`pages\` 是页面文件的列表，顺序就是页序；\`theme\` 是讲义级的 CSS 变量。
  新建一页 = 新建一个 .html 并把路径加进 \`pages\`；删一页 = 从 \`pages\` 去掉；调页序 = 调 \`pages\` 的顺序。
- 每个页面 \`*.html\` 旁边的 \`*.notale.json\` 是这一页 html 以外的数据：名称 \`name\`、备注 \`notes\`、交互组件 \`components\`、动画 \`animations\` 等。
  新页可以不建它。
- 其余文件都是讲义的素材，页面按相对路径引用。以点开头的路径和 \`node_modules\` 不算讲义，可以放临时文件。
${sheets.length ? `- 全局样式表：${sheets.map(path => `\`${path}\``).join('、')}。` : ''}

## notale editor 能解析的前提
- 画布 ${doc.width}×${doc.height}，页面内容在 \`<main id="stage">\` 里。
- 已有对象的 \`data-notale-id\` 保留原样：组件、动画、批注靠它指向对象。新元素不用写 id，会自动补。
- 引用的都是讲义里的文件：放映和截图拿不到外网。要用第三方库，下载进目录再相对引用。
- 每次改文件后都会校验一遍，解析不了会在那次工具结果里告诉你原因。
- Look 看一页渲染出来的样子，附带版面问题和页面报错。
`;
}

/** Files that are not the deck's: dot-paths and node_modules, the way git leaves `.git` and ignored
 * trees alone. They stay in the workspace across turns and never become assets -- unless the deck
 * already has them: a generated code page carries `.notale-code-lesson.json`, and dropping it would
 * break the page's code lesson. */
export const ignored = (path: string) => path.split('/').some(part => part.startsWith('.') || part === 'node_modules');

/** Brings `dir` to the document: every deck file written, deck files the document no longer has
 * removed, ignored files left where they are. The directory itself stays (the sandbox mounts it). */
export async function exportWorkspace(dir: string, doc: DeckDocument, blob: (hash: string) => Promise<Buffer>) {
  const wanted = new Set([DECK_FILE, RULES_FILE, ...doc.slides.flatMap(slide => [slide.sourcePath, sidecar(slide.sourcePath)]), ...Object.keys(doc.assets)]);
  for (const path of await walk(dir)) if (!wanted.has(path) && !ignored(path)) await rm(join(dir, path), { force: true });
  const put = async (path: string, data: string | Buffer) => {
    const target = join(dir, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, data);
  };
  const deck: DeckFile = { title: doc.title, theme: doc.theme, pages: doc.slides.map(slide => slide.sourcePath) };
  await put(DECK_FILE, JSON.stringify(deck, null, 2) + '\n');
  await put(RULES_FILE, rules(doc));
  for (const slide of doc.slides) {
    const { html, ...rest } = slide;
    await put(slide.sourcePath, html);
    await put(sidecar(slide.sourcePath), JSON.stringify(rest, null, 2) + '\n');
  }
  for (const [path, asset] of Object.entries(doc.assets)) await put(path, await blob(asset.hash));
}

async function walk(root: string, at = root): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(at, { withFileTypes: true })) {
    const full = join(at, entry.name);
    if (entry.isDirectory()) { if (!ignored(relative(root, full).split(sep).join('/'))) out.push(...await walk(root, full)); }
    else if (entry.isFile()) out.push(relative(root, full).split(sep).join('/'));
  }
  return out;
}

/** Reads the directory back as a document: the pages deck.json lists, each laid over what the base
 * had for it, and every other file as an asset (new or changed bytes go through `upload`). What
 * changed is `diffDocuments(base, read)`; whether it is valid is the document's own validation. */
export async function readWorkspace(dir: string, base: DeckDocument, upload: (data: Buffer, mime: string) => Promise<Asset>): Promise<DeckDocument> {
  const deck = JSON.parse(await readFile(join(dir, DECK_FILE), 'utf8')) as DeckFile;
  if (!deck || !Array.isArray(deck.pages) || !deck.pages.every(page => typeof page === 'string')) throw new Error('deck.json 的 pages 必须是页面路径数组');
  const pages = deck.pages.map(page => filePath.parse(page));
  const bySource = new Map(base.slides.map(slide => [slide.sourcePath, slide]));
  const taken = new Set(base.slides.map(slide => slide.id));

  // Assets: every file that is not a page, a page's data, or our bookkeeping.
  const pageSet = new Set(pages);
  const bookkeeping = (path: string) => path === DECK_FILE || path === RULES_FILE || path.endsWith(SIDE) || pageSet.has(path) || bySource.has(path);
  const assets: DeckDocument['assets'] = {};
  const present = new Set(await walk(dir));
  // walk() does not enter ignored directories; the deck's own files there are looked up directly.
  for (const path of Object.keys(base.assets)) if (ignored(path) && await readFile(join(dir, path)).then(() => true, () => false)) present.add(path);
  for (const path of [...present].filter(path => !bookkeeping(path) && (!ignored(path) || path in base.assets))) {
    const data = await readFile(join(dir, path));
    const known = base.assets[path];
    assets[filePath.parse(path)] = known?.hash === sha256(data) ? known : await upload(data, lookup(path) || 'application/octet-stream');
  }

  const slides: Slide[] = [];
  for (const path of pages) {
    const html = await readFile(join(dir, path), 'utf8');
    const side = await readFile(join(dir, sidecar(path)), 'utf8').then(text => JSON.parse(text) as Record<string, unknown>, (): Record<string, unknown> => ({}));
    const old = bySource.get(path);
    if (old) { slides.push({ ...old, ...side, id: old.id, sourcePath: path, html } as Slide); continue; }
    // A new page: what its html says (title, notes, step count) fills in, exactly as a .notale import would.
    const wanted = typeof side.id === 'string' && identifier.safeParse(side.id).success ? side.id
      : (path.split('/').pop() ?? 'page').replace(/\.html?$/i, '').replace(/[^\w-]/g, '-').slice(0, 90) || 'page';
    let id = wanted;
    for (let n = 2; taken.has(id); n++) id = `${wanted}-${n}`;
    taken.add(id);
    const found = importHtml(html);
    slides.push({ name: found.name, notes: found.notes, nativeStepCount: found.nativeStepCount, ...side, id, sourcePath: path, html } as Slide);
  }
  return { ...base, theme: deck.theme ?? base.theme, slides, assets };
}
