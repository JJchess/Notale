/** Page-list and submission contracts ported from core/planner.py. */
import { readFileSync, realpathSync, lstatSync, readlinkSync, statSync } from 'node:fs';
import path from 'node:path';
import { decodeText } from './text.js';
import { fill, PROMPTS } from './guidance.js';

/** pathlib.Path.resolve(strict=False), including existing symlink ancestors. */
export function resolvePath(file: string, cwd = process.cwd()): string {
  const active = new Set<string>();
  const walk = (input: string, base: string): string => {
    let current = path.isAbsolute(input) ? path.parse(input).root : base;
    for (const part of input.split(path.sep)) {
      if (!part || part === '.') continue;
      if (part === '..') { current = path.dirname(current); continue; }
      const target = path.join(current, part);
      let symbolic = false;
      try { symbolic = lstatSync(target).isSymbolicLink(); }
      catch (error) {
        if (!['ENOENT', 'ENOTDIR', 'ENAMETOOLONG', 'EACCES', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
      }
      if (!symbolic) { current = target; continue; }
      if (active.has(target)) throw Object.assign(new Error(`Symlink loop from '${target}'`), { name: 'RuntimeError' });
      active.add(target);
      current = walk(readlinkSync(target), current);
      active.delete(target);
    }
    return current;
  };
  return walk(file, walk(cwd, process.cwd()));
}

export const N_CEIL = 60;
export const PAGE_LABELS = new Set(['标题页', '内容页', '交互页', '代码页']);
export const PAGES_REL = 'pages/plan/pages.md';
export const DECK_TRIES = 3;
export const PLANNER_IDENTITY = '你在为一套内容做规划。只输出被要求的东西,不写说明、不写总结、不加围栏。';

export function plannerPrompt(name: string, values: Record<string, string | number>, prompts = PROMPTS): string {
  return fill(decodeText(readFileSync(path.join(prompts, `${name}.md`))), values, `${name}.md`);
}
export function stripFence(text: string): string {
  text = text.trim();
  if (!text.startsWith('```')) return text;
  const lines = text.split('\n');
  if (lines.at(-1)!.trim().startsWith('```')) lines.pop();
  return lines.slice(1).join('\n').trim() + '\n';
}
export function splitSpecs(text: string, numbers: Iterable<number>): Record<string, string> {
  const want = new Set([...numbers].map(n => String(n).padStart(2, '0')));
  const body = stripFence(text.trim());
  const hits = [...body.matchAll(/^#\s+page-(\d+)/gm)];
  const result: Record<string, string> = {};
  for (const [index, hit] of hits.entries()) {
    const number = hit[1]!.padStart(2, '0');
    if (want.has(number)) result[number] = body.slice(hit.index, hits[index + 1]?.index ?? body.length).trim();
  }
  return result;
}
export function splitPages(text: string): Record<string, string> {
  return splitSpecs(text, Array.from({ length: N_CEIL }, (_, index) => index + 1));
}
export interface Continuity { id: string; pages: string[]; body: string }
export interface PlanContext { audience: string; continuity: Continuity[] }
export function planContext(text: string, requireAudience = false): PlanContext {
  const body = stripFence(text.trim()).replace(/\r\n?/g, '\n');
  const boundary = body.search(/^#\s+page-\d+/m);
  const endOfHeader = boundary < 0 ? body.length : boundary;
  const headings = [...body.matchAll(/^##[ \t]+(Audience|Continuity)[ \t]*$/gim)];
  const sections = new Map<string, string>();
  for (const [i, hit] of headings.entries()) {
    const key = hit[1]!.toLowerCase();
    if (hit.index >= endOfHeader) throw new Error('Audience 和 Continuity 必须写在第一个页面之前');
    if (sections.has(key)) throw new Error(`${key} 只能定义一次`);
    sections.set(key, body.slice(hit.index + hit[0].length, Math.min(headings[i + 1]?.index ?? endOfHeader, endOfHeader)).trim());
  }
  const audience = sections.get('audience') ?? '';
  if ((requireAudience || headings.length) && !audience) throw new Error('页表开头需要非空的 ## Audience');
  const content = sections.get('continuity') ?? '', continuity: Continuity[] = [];
  if (content && content !== '无') {
    const entries = [...content.matchAll(/^###[ \t]+([^\n]*?)[ \t]*$/gm)];
    if (!entries.length || content.slice(0, entries[0]!.index).trim() || entries.some(hit => !/^[a-z][a-z0-9_-]*$/.test(hit[1]!))) throw new Error('Continuity 使用 ### 条目ID、Pages: 页号列表和约束正文；无共享约束时写“无”');
    const known = new Set(Object.keys(splitPages(text)).map(number => `page-${number}`)), ids = new Set<string>();
    for (const [i, hit] of entries.entries()) {
      const id = hit[1]!;
      if (ids.has(id)) throw new Error(`continuity 条目重复：${id}`);
      ids.add(id);
      const block = content.slice(hit.index + hit[0].length, entries[i + 1]?.index ?? content.length).trim();
      const match = block.match(/^Pages:[ \t]*([^\n]+)\n(.+)$/is);
      if (!match || !match[2]!.trim()) throw new Error(`continuity ${id} 需要 Pages: 页号列表和非空约束`);
      const pages = match[1]!.trim().split(/[,，\s]+/);
      if (pages.some(page => !known.has(page)) || new Set(pages).size !== pages.length) throw new Error(`continuity ${id} 的页号不存在或重复`);
      continuity.push({ id, pages, body: match[2]!.trim() });
    }
  }
  return { audience, continuity };
}
export function validPages(text: string): string {
  const pages = splitPages(text);
  if (!Object.keys(pages).length) return '没有 `# page-NN` 块 —— 每页一个,页号两位、从 01 连续编';
  const numbers = Object.keys(pages).map(Number).sort((a, b) => a - b);
  if (numbers.some((number, index) => number !== index + 1)) {
    const missing = Array.from({ length: Math.max(...numbers) }, (_, index) => index + 1).filter(number => !numbers.includes(number));
    return `页号不连续,缺 ${missing.map(number => `page-${String(number).padStart(2, '0')}`).join(' ')} —— 从 01 编到 N,不跳号`;
  }
  // Python insertion order matters for the first reported error, including pages >= 10.
  const order = [...new Set([...stripFence(text.trim()).matchAll(/^#\s+page-(\d+)/gm)].map(hit => hit[1]!.padStart(2, '0')).filter(key => key in pages))];
  for (const key of order) {
    const match = pages[key]!.match(new RegExp(`^#\\s+page-${key}\\s+\\[([^\\]]+)\\]\\s*\\n(.+)`, 's'));
    if (!match) return `page-${key} 必须只有 \`[标签]\` 标题行和非空主题`;
    const label = match[1]!.trim();
    if (!PAGE_LABELS.has(label)) return `page-${key} 使用未知标签 \`[${label}]\``;
    if (!match[2]!.trim()) return `page-${key} 的主题为空`;
  }
  try { planContext(text); } catch (error) { return (error as Error).message; }
  return '';
}
export function validateMedia(mapping: unknown, pagesDoc: string, available: Record<string, unknown>, pages: string): Record<string, string[]> {
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) throw new Error('media_by_page 必须是页号到路径列表');
  const ids = new Set(Object.keys(splitPages(pagesDoc)).map(number => `page-${number}`));
  const normalized: Record<string, string[]> = {};
  for (const [original, paths] of Object.entries(mapping)) {
    const match = original.match(/^(?:page[-_])?([0-9]{1,2})$/);
    const pid = match ? `page-${String(Number(match[1])).padStart(2, '0')}` : original;
    if (!ids.has(pid) || !Array.isArray(paths)) throw new Error(`无效页面或路径列表：${pid}`);
    if (pid in normalized) throw new Error(`页面映射重复：${pid}`);
    for (const file of paths) {
      if (typeof file !== 'string' || !Object.hasOwn(available, file)) throw new Error(`图片尚未在此前工具结果中返回：${file}`);
      const target = path.resolve(pages, file);
      let resolved: string;
      try { resolved = realpathSync(target); } catch { throw new Error(`图片不存在：${file}`); }
      const relative = path.relative(realpathSync(pages), resolved);
      if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(`图片路径越出 pages：${file}`);
      if (!statSync(resolved).isFile()) throw new Error(`图片不存在：${file}`);
    }
    normalized[pid] = paths;
  }
  return normalized;
}
export function finalizePlan(args: { pages_md: string; media_by_page?: unknown }, available: Record<string, unknown>, root: string): { pagesDoc: string; mapping: Record<string, string[]>; output: string } {
  const error = validPages(args.pages_md);
  if (error) throw new Error(error);
  planContext(args.pages_md, true);
  const mapping = validateMedia(args.media_by_page === undefined ? {} : args.media_by_page, args.pages_md, available, path.join(root, 'pages'));
  return { pagesDoc: args.pages_md, mapping, output: '定稿已接收' };
}
