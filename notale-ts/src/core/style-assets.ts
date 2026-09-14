/** Local style inputs and registered font files; original catalogue pictures use frozen Pillow renditions. */
import { readFileSync, existsSync, statSync, lstatSync } from 'node:fs';
import { mkdir, copyFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { decodeText, stripText, splitLines, caseFold } from './text.js';
import { thumbnailJpeg } from '../tools/image-resample.js';
import { RESOURCES, WORKFLOWS } from './guidance.js';
import { resolvePath } from './planner-contract.js';
import { valueError, cssUrls, isWithin, parseCss, unquoteUrl, splitResourceUrl } from './theme.js';
import type { ReferenceImage, StyleInput } from './director.js';
import type { ChatInputBlock } from '../adapters/models/chat-model.js';

export const FONT_ROOT = path.join(RESOURCES, 'vendor/fonts');
export const STYLE_ROOT = path.join(WORKFLOWS, 'style-director');
const PREFIX = 'fonts/library/';
type FontRow = { files: Array<{ file: string; family: string; weight: string; style: string; sha256: string }>; license: string; notices?: string[] };
export const inventory = (): Record<string, FontRow> => JSON.parse(decodeText(readFileSync(path.join(FONT_ROOT, 'manifest.json'))));
export function family(key: string): string {
  if (!Object.hasOwn(inventory(), key)) throw valueError(`未知字体: ${key}`);
  return 'NTF-' + key;
}
export function snippets(keys: string[]): string {
  const rows = inventory(), result: string[] = [];
  for (const key of new Set(keys)) {
    if (!Object.hasOwn(rows, key)) throw valueError(`未知字体: ${key}`);
    const item = rows[key]!;
    result.push(`/* ${key}: ${item.files[0]!.family}；字重/字姿须匹配以下真实声明 */`);
    for (const face of item.files) result.push(`@font-face {\n  font-family: "NTF-${key}";\n  src: url("${PREFIX}${key}/${face.file}");\n  font-weight: ${face.weight}; font-style: ${face.style}; font-display: swap;\n}`);
  }
  return result.join('\n');
}
export async function prepareFonts(css: string, assets: string): Promise<string[]> {
  const requests: string[] = [];
  for (const { value } of cssUrls(parseCss(css))) {
    const { scheme, netloc, path: pathname, query, fragment } = splitResourceUrl(value);
    const relative = unquoteUrl(pathname);
    if (!relative.startsWith(PREFIX)) continue;
    if (scheme || netloc || query || fragment || value.includes('\\')) throw valueError(`字体库引用必须是明确相对文件: ${value}`);
    requests.push(relative);
  }
  if (!requests.length) return [];
  const rows = inventory();
  const allowed = new Map<string, { key: string; face: FontRow['files'][number] }>(Object.entries(rows).flatMap(([key, row]) => row.files.map(face => [`${PREFIX}${key}/${face.file}`, { key, face }] as const)));
  const copied: string[] = [];
  for (const relative of new Set(requests)) {
    const entry = allowed.get(relative);
    if (!entry) throw valueError(`字体库文件未登记: ${relative}`);
    const { key, face } = entry;
    if (createHash('sha256').update(await readFile(path.join(FONT_ROOT, key, face.file))).digest('hex') !== face.sha256) throw valueError(`字体库文件校验失败: ${key}/${face.file}`);
    for (const name of [face.file, rows[key]!.license, ...(rows[key]!.notices ?? [])]) {
      const source = resolvePath(path.join(FONT_ROOT, key, name));
      if (!isWithin(source, path.join(FONT_ROOT, key))) throw valueError('字体来源越界');
      const dest = path.join(assets, PREFIX, key, name);
      let symlink = false;
      try { symlink = lstatSync(dest).isSymbolicLink(); } catch { /* absent */ }
      if (symlink || !isWithin(dest, assets)) throw valueError(`字体目标越界: ${dest}`);
      await mkdir(path.dirname(dest), { recursive: true });
      if (existsSync(dest)) {
        if (!(await readFile(dest)).equals(await readFile(source))) throw valueError(`已有字体资源不同，不能覆盖: ${dest}`);
      } else await copyFile(source, dest);
    }
    copied.push(relative);
  }
  return copied;
}
const cached: Record<string, { path: string; sha256: string; width: number; height: number }> = JSON.parse(readFileSync(path.join(RESOURCES, 'style-images.json'), 'utf8'));
export async function images(refs: ReferenceImage[], width = 900): Promise<ChatInputBlock[]> {
  const blocks: ChatInputBlock[] = [];
  for (const reference of refs) {
    const source = await readFile(reference.shot);
    const fingerprint = createHash('sha256').update(source).digest('hex');
    const frozen = cached[`${fingerprint}:${width}`];
    let data: Buffer, w: number, h: number;
    if (frozen) {
      data = await readFile(path.join(RESOURCES, frozen.path));
      if (createHash('sha256').update(data).digest('hex') !== frozen.sha256) throw valueError(`参考图缓存校验失败: ${reference.shot}`);
      w = frozen.width; h = frozen.height;
    } else {
      const output = await thumbnailJpeg(source, width).catch(error => {
        // Pillow decoding/encoding failures belong to OSError, not authoring retries of arbitrary exceptions.
        if (error instanceof Error && error.name === 'Error' && !(error as NodeJS.ErrnoException).code) error.name = 'OSError';
        throw error;
      });
      data = output.data; w = output.width; h = output.height;
    }
    const digest = createHash('sha256').update(data).digest('hex');
    blocks.push({ type: 'text', text: `参考 ${reference.id || ''}: ${reference.shot} (${w}×${h}, sha256=${digest})` }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + data.toString('base64') } });
  }
  return blocks;
}
export class StyleCatalog {
  constructor(readonly root = STYLE_ROOT) {}
  rows(): string[][] {
    return splitLines(decodeText(readFileSync(path.join(this.root, 'INDEX.md')))).filter(line => /^\| \p{Nd}{2}-/u.test(line)).map(line => line.replace(/^\|+|\|+$/g, '').split('|').map(value => stripText(value)));
  }
  match(request?: string): string | undefined {
    const normalized = caseFold(stripText(request || ''));
    const chosen = this.rows().filter(row => [row[0]!, row[0]!.slice(row[0]!.indexOf('-') + 1), ...row[1]!.split('·').map(name => stripText(name))].map(value => caseFold(value)).includes(normalized));
    return chosen.length === 1 ? chosen[0]![0] : undefined;
  }
  identify(value: unknown): string {
    if (typeof value !== 'string') throw valueError('需要风格 ID / 详情路径');
    const ids = this.rows().map(row => row[0]!);
    if (ids.includes(value)) return value;
    const target = resolvePath(value, this.root);
    for (const key of ids) if ([`details/${key}.md`, `shots/${key}.png`].some(relative => resolvePath(path.join(this.root, relative)) === target)) return key;
    throw valueError('Read 只允许风格表列出的详情/裁图');
  }
  readPath(value: string): string {
    const file = path.join(this.root, 'shots', this.identify(value) + '.png');
    if (!existsSync(file) || !statSync(file).isFile()) throw valueError(`风格裁图缺失: ${file}`);
    return file;
  }
  async detail(value: unknown): Promise<StyleInput> {
    const key = this.identify(value);
    let text = decodeText(await readFile(path.join(this.root, 'details', `${key}.md`)));
    const keys = [...new Set([...text.matchAll(/\]\(\.\.\/\.\.\/\.\.\/vendor\/fonts\/([a-z0-9-]+)\/\)/g)].map(match => match[1]!))];
    if (!keys.length) throw valueError(`风格详情没有字体资源: ${key}`);
    text += '\n\n## 已备妥的字体声明（按实际选择使用，不需全用）\n```css\n' + snippets(keys) + '\n```\n';
    text += '以上字体文件由宿主按最终 CSS 引用复制进 run，不需另调下载工具。样图只作参考；字体搭配是本项目建议，不声称识别了样图原字体。';
    return { text, images: await images([{ id: key, shot: this.readPath(key) }], 1600) };
  }
  async inputs(request?: string): Promise<StyleInput> {
    const key = this.match(request);
    if (key) return this.detail(key);
    return { text: '风格轻索引：ID | 名称 | 简述 | 详情。先选主要方向并 Read 对应 ID，收到详细资料和参考图后再写主题。用户要求组合可同轮读取多项。这些不是风格上限；自定义方向可借用最接近的资料再创作，不必强称某流派。\n' + this.rows().map(row => row.slice(0, 4).join(' | ')).join('\n'), images: [] };
  }
  async selectedInputs(ids: string[]): Promise<StyleInput> {
    const selected: StyleInput[] = [];
    for (const id of new Set(ids)) selected.push(await this.detail(id));
    return { text: selected.map(input => input.text).join('\n\n'), images: selected.flatMap(input => input.images) };
  }
  async selectionInputs(): Promise<StyleInput> {
    const folder = path.join(this.root, 'contact-sheets');
    const names = [...new Set([...decodeText(readFileSync(path.join(folder, 'README.md'))).matchAll(/!\[[^\]]*\]\(([^)]+\.png)\)/g)].map(match => match[1]!))];
    const refs = names.map(name => {
      const shot = resolvePath(path.join(folder, name));
      if (!isWithin(shot, folder)) throw valueError(`概览路径越界: ${name}`);
      return { id: `风格概览 ${name}`, shot };
    });
    if (!refs.length) throw valueError('风格概览索引为空');
    return { text: this.rows().map(row => row.slice(0, 3).join(' | ')).join('\n'), images: await images(refs, 1600) };
  }
}
