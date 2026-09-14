/** Python tool schemas, workspace scope, and text tools. Check/media/scaffold are explicit dependencies. */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { constants as osConstants } from 'node:os';
import path from 'node:path';
import { RESOURCES } from '../core/guidance.js';
import { decodeText } from '../core/text.js';
import { resolvePath } from '../core/planner-contract.js';
import { isWithin } from '../core/theme.js';

const constants = JSON.parse(readFileSync(path.join(RESOURCES, 'builder-instructions.json'), 'utf8'));
export interface ToolOutput { text: string; images: Array<[string, string]> }
export interface Workspace { cwd: string; pid: string; resourceRoot?: string; textReport?: boolean; sampleShots?: boolean }
export interface WorkspacePorts {
  image(file: string): Promise<ToolOutput>;
  check(args: Record<string, any>, context: Workspace, signal?: AbortSignal): Promise<ToolOutput>;
  media(name: string, args: Record<string, any>, context: Workspace, signal?: AbortSignal): Promise<ToolOutput>;
}
const characters = (text: string) => [...text];
export function cap(text: string, maximum = 30000): string {
  const chars = characters(text);
  return chars.length <= maximum ? text : chars.slice(0, maximum).join('') + `\n…（已截断，原文 ${chars.length.toLocaleString('en-US')} 字符）`;
}
export function toolSpecs(workflow?: string, visionInput = true): Record<string, any>[] {
  let specs: Record<string, any>[] = constants.TOOL_SCHEMAS.map((spec: Record<string, unknown>) => ({ type: 'function', ...structuredClone(spec) }));
  if (workflow === 'build-code') specs = specs.filter(spec => ['Read', 'Write', 'Edit', 'Check'].includes(spec.name));
  else if (workflow) specs = specs.filter(spec => spec.name !== 'Edit');
  for (const spec of specs) {
    if (spec.name === 'Check' && !visionInput) {
      delete spec.parameters.properties.box; delete spec.parameters.properties.zoom;
      spec.description = spec.description.replace('默认返回整页截图；需要看局部细节时用 box 指定区域，裁图不改变整页检查范围。', '');
    }
    if (spec.name === 'Write' && workflow) spec.description = `写完整文件，用于创建或整体重构；局部修正用 ${workflow === 'build-code' ? 'Edit' : 'Patch'}。`;
  }
  if (visionInput) specs.push(...structuredClone(constants.MEDIA_SCHEMAS));
  return specs;
}
export function isWorkflowResource(file: string, resourceRoot?: string): boolean {
  if (!resourceRoot || !isWithin(file, resourceRoot)) return false;
  const parts = path.relative(resolvePath(resourceRoot), resolvePath(file)).split(path.sep);
  return path.extname(file).toLowerCase() === '.md' && ((parts.length === 2 && parts[0] === 'references') || (parts.length >= 3 && parts[0] === 'samples' && parts[1] === 'bundles'));
}
export function resolveReadPath(file: string, cwd: string, resourceRoot?: string): string {
  const resolved = resolvePath(file, cwd);
  if (!path.isAbsolute(file) && !existsSync(resolved) && resourceRoot) {
    const alternate = resolvePath(file, resourceRoot);
    if (existsSync(alternate) && statSync(alternate).isFile() && isWorkflowResource(alternate, resourceRoot)) return alternate;
  }
  return resolved;
}
export function outOfBounds(name: string, args: Record<string, any>, context: Workspace): string | undefined {
  const root = resolvePath(context.cwd);
  for (const [key, value] of Object.entries(args)) {
    if (['content', 'old_string', 'new_string', 'edits'].includes(key)) continue;
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    let outside: string[];
    if (key === 'command') outside = [...text.matchAll(/(?:^|[\s'"=(:])(\/[\p{L}\p{N}_./-]+)/gu)].map(match => match[1]!).filter(file => !isWithin(file, root));
    else {
      const target = resolvePath(text, context.cwd);
      if (['Write', 'Edit', 'Patch'].includes(name) && isWithin(target, path.join(root, 'assets/sources'))) return `${text}(资料原图只读；请用 ReadSource 获取裁图)`;
      const imageRoot = path.join(root, 'assets/img');
      if (['Write', 'Edit', 'Patch'].includes(name) && isWithin(target, imageRoot)) {
        const relative = path.relative(imageRoot, target).split(path.sep);
        if (!relative[0]?.startsWith(context.pid + '-')) return `${text}(共享或其他页面的素材只读)`;
      }
      const resource = name === 'Read' && (isWorkflowResource(target, context.resourceRoot) || isWithin(target, path.join(path.dirname(root), '.shots')));
      outside = isWithin(target, root) || resource ? [] : [text];
    }
    if (outside.length) return `${outside[0]}(在本页的 run 目录之外)`;
    for (const page of text.match(/page-\d+\.html/g) ?? []) if (page !== `${context.pid}.html`) return page;
  }
  return undefined;
}
export function firstGuidanceOnly(output: string, seen: Set<string>): string {
  const match = output.match(/^<(check_use|sample_use)\b[^>]*>.*?<\/\1>\s*/s);
  if (!match) return output;
  if (seen.has(match[1]!)) return output.slice(match[0].length);
  seen.add(match[1]!); return output;
}
export async function readText(args: Record<string, any>, context: Workspace, ports: WorkspacePorts): Promise<string | ToolOutput> {
  const file = args.file_path as string;
  if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(path.extname(file).toLowerCase())) return ports.image(file);
  const text = decodeText(await readFile(file), resolvePath(file) === resolvePath(path.join(context.cwd, 'assets/lib/LIBS.md')));
  if (resolvePath(file) === resolvePath(path.join(context.cwd, 'assets/lib/LIBS.md'))) return `（库用法全文开始：LIBS.md）\n${text}\n（库用法全文结束：LIBS.md · EOF）`;
  if (isWorkflowResource(file, context.resourceRoot)) {
    const parts = path.relative(resolvePath(context.resourceRoot!), resolvePath(file)).split(path.sep);
    const visual = ['build-cover', 'build-page', 'build-interaction'].includes(path.basename(context.resourceRoot!)) && parts.length >= 3 && parts[0] === 'samples' && parts[1] === 'bundles' && path.basename(file).endsWith('.mini.md');
    const body = (visual ? constants.VISUAL_SAMPLE_USE + '\n\n' : '') + `（工作流资源全文开始：${path.basename(file)}，共 ${text.split('\n').length} 行）\n${text}\n（工作流资源全文结束：${path.basename(file)} · EOF）`;
    if (context.sampleShots && parts.length === 4 && parts[0] === 'samples' && parts[1] === 'bundles') {
      const sheet = path.join(context.resourceRoot!, 'samples', parts[2]!, path.basename(file).split('.')[0]!, 'shots.png');
      if (existsSync(sheet) && statSync(sheet).isFile()) {
        const shot = await ports.image(sheet);
        return { text: body + '\n\n随附这个 sample 的多态截图拼图（按编号顺序是它的真实状态序列）：' + shot.text, images: shot.images };
      }
    }
    return body;
  }
  const offset = Math.max(0, Math.trunc(Number(args.offset || 1)) - 1), limit = Math.trunc(Number(args.limit || 2000));
  const lines = text.split('\n');
  const end = offset + limit;
  return lines.slice(offset, end < 0 ? Math.max(0, lines.length + end) : end).map((line, index) => `${String(offset + index + 1).padStart(6)}\t${line}`).join('\n');
}
function count(text: string, old: string): number { return old ? text.split(old).length - 1 : characters(text).length + 1; }
/** SequenceMatcher(None,a,b).ratio(), including its automatic popular-element filter. */
function ratio(left: string, right: string): number {
  const a = characters(left), b = characters(right), index = new Map<string, number[]>();
  b.forEach((character, offset) => { if (!index.has(character)) index.set(character, []); index.get(character)!.push(offset); });
  if (b.length >= 200) for (const [character, positions] of index) if (positions.length > Math.floor(b.length / 100) + 1) index.delete(character);
  const queue = [[0, a.length, 0, b.length]];
  let matches = 0;
  while (queue.length) {
    const [alo, ahi, blo, bhi] = queue.pop()! as [number, number, number, number];
    let besti = alo, bestj = blo, size = 0, previous = new Map<number, number>();
    for (let i = alo; i < ahi; i++) {
      const current = new Map<number, number>();
      for (const j of index.get(a[i]!) ?? []) {
        if (j < blo) continue; if (j >= bhi) break;
        const length = (previous.get(j - 1) ?? 0) + 1;
        current.set(j, length);
        if (length > size) { besti = i - length + 1; bestj = j - length + 1; size = length; }
      }
      previous = current;
    }
    while (besti > alo && bestj > blo && a[besti - 1] === b[bestj - 1]) { besti--; bestj--; size++; }
    while (besti + size < ahi && bestj + size < bhi && a[besti + size] === b[bestj + size]) size++;
    if (size) {
      matches += size;
      if (alo < besti && blo < bestj) queue.push([alo, besti, blo, bestj]);
      if (besti + size < ahi && bestj + size < bhi) queue.push([besti + size, ahi, bestj + size, bhi]);
    }
  }
  return a.length + b.length ? 2 * matches / (a.length + b.length) : 1;
}
export function classifyMiss(old: string, source: string): [string, string, number] {
  if (!old.trim()) return ['空 old', '', 0];
  if (source.replace(/\s+/g, '').includes(old.replace(/\s+/g, ''))) return ['空白差异', '', 1];
  const unescaped = old.replaceAll('\\"', '"').replaceAll('\\n', '\n').replaceAll('\\/', '/');
  if (unescaped !== old && source.includes(unescaped)) return ['转义差异', '', 1];
  const lines = source.split(/\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/); if (!lines.at(-1)) lines.pop();
  const probe = characters(old.split(/\r\n|[\n\r]/).find(line => line.trim()) ?? old).slice(0, 200).join('').trim();
  let best = 0, score = lines.length ? -1 : 0;
  lines.forEach((line, index) => { const value = ratio(probe, line.trim()); if (value > score) { score = value; best = index; } });
  const near = lines.slice(Math.max(0, best - 2), best + 3).map((line, index) => `${Math.max(0, best - 2) + index + 1}│${line}`).join('\n');
  return [score >= 0.6 ? '近似' : '不存在', near, Math.round(score * 1000) / 1000];
}
export async function patch(context: Workspace, args: Record<string, any>): Promise<string> {
  const page = String(args.page), file = path.resolve(context.cwd, page);
  if (!existsSync(file)) return `失败:${page} 不存在。页面文件名形如 page-07.html`;
  const edits = args.edits || [];
  if (!edits.length) return '失败:edits 是空的,没有要改的东西';
  let text = decodeText(await readFile(file));
  const hits: number[] = [], missing: string[] = [];
  for (const [index, edit] of edits.entries()) {
    const old = edit.old || '', n = old ? count(text, old) : 0;
    hits.push(n);
    if (!n) {
      missing.push(`第 ${index + 1} 处:«${characters(old).slice(0, 60).join('')}…» 在 ${page} 里找不到`);
      try {
        const [kind, nearest, ratio] = classifyMiss(old, text);
        await appendFile(path.join(path.dirname(context.cwd), 'patch-misses.jsonl'), JSON.stringify({ page, edit: index + 1, kind, ratio, old_len: characters(old).length, old_lines: old.split('\n').length, old: characters(old).slice(0, 400).join(''), nearest: characters(nearest).slice(0, 600).join('') }) + '\n');
      } catch (error) { console.warn(`patch-miss 记录失败:${(error as Error).message}`); }
    }
  }
  if (missing.length) return '失败,一处都没改(整批不写,免得改一半):\n  ' + missing.join('\n  ') + '\n先 Read 一下当前内容,照原文一字不差地给 old。';
  for (const edit of edits) text = text.replaceAll(edit.old, () => edit.new ?? '');
  await writeFile(file, text, 'utf8');
  const tail = hits.map((n, index) => n === 1 ? '' : `第 ${index + 1} 处 ${n} 次`).filter(Boolean).join('、');
  return `${page} 改了 ${edits.length} 处,共 ${hits.reduce((a, b) => a + b, 0)} 次替换` + (tail ? `(注意有的不止一次:${tail})` : '') + '。';
}
export async function shell(command: string, cwd: string, signal?: AbortSignal): Promise<string> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(command, { cwd, shell: '/bin/sh', detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const out: Buffer[] = [], err: Buffer[] = [];
    let timedOut = false;
    const kill = () => { if (child.pid) try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already exited */ } };
    const timer = setTimeout(() => { timedOut = true; kill(); }, 120000);
    const abort = () => kill(); signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', bytes => out.push(bytes));
    child.stderr.on('data', bytes => err.push(bytes));
    child.once('error', reject);
    child.once('close', (code, exitSignal) => {
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
      if (signal?.aborted) return reject(signal.reason);
      if (timedOut) return reject(Object.assign(new Error(`Command '${command}' timed out after 120 seconds`), { name: 'TimeoutExpired' }));
      let stdout: string, stderr: string;
      try { stdout = decodeText(Buffer.concat(out)); stderr = decodeText(Buffer.concat(err)); }
      catch (error) { reject(error); return; }
      const returnCode = code ?? (exitSignal ? -osConstants.signals[exitSignal] : null);
      resolve((stdout + (stderr ? '\n[stderr]\n' + stderr : '')).trim() || `(无输出,退出码 ${returnCode})`);
    });
  });
}
export function toolError(error: unknown): string {
  const e = error as NodeJS.ErrnoException;
  const codes: Record<string, [string, number, string]> = {
    ENOENT: ['FileNotFoundError', 2, 'No such file or directory'],
    EISDIR: ['IsADirectoryError', 21, 'Is a directory'],
    ENOTDIR: ['NotADirectoryError', 20, 'Not a directory'],
    EACCES: ['PermissionError', 13, 'Permission denied'],
    EPERM: ['PermissionError', 1, 'Operation not permitted'],
  };
  const mapped = e.code ? codes[e.code] : undefined;
  if (mapped) return `${mapped[0]}: [Errno ${mapped[1]}] ${mapped[2]}: '${e.path ?? ''}'`;
  return `${e.name === 'Error' ? 'ValueError' : e.name}: ${e.message}`;
}
export async function runTool(name: string, args: Record<string, any>, context: Workspace, ports: WorkspacePorts, signal?: AbortSignal): Promise<string | ToolOutput> {
  if (['ImageSearch', 'ImageGen'].includes(name)) {
    try { return await ports.media(name, args, context, signal); } catch (error) { if (signal?.aborted) throw signal.reason; return toolError(error); }
  }
  const outside = outOfBounds(name, args, context);
  if (outside) return `拒绝:\`${outside}\` 不在当前页面的工作范围内。只能修改 \`${context.pid}.html\` 及宿主明确授予的代码 lesson 文件；当前 workflow 资源只读。`;
  const actual = { ...args };
  if (['Read', 'Write', 'Edit'].includes(name) && actual.file_path) actual.file_path = name === 'Read' ? resolveReadPath(String(actual.file_path), context.cwd, context.resourceRoot) : path.isAbsolute(actual.file_path) ? actual.file_path : resolvePath(actual.file_path, context.cwd);
  try {
    let result: string | ToolOutput;
    if (name === 'Read') result = await readText(actual, context, ports);
    else if (name === 'Write') {
      await mkdir(path.dirname(actual.file_path), { recursive: true }); await writeFile(actual.file_path, actual.content, 'utf8');
      result = `已写入 ${actual.file_path}(${characters(actual.content).length.toLocaleString('en-US')} 字符)`;
    } else if (name === 'Edit') {
      const text = decodeText(await readFile(actual.file_path)), n = count(text, actual.old_string);
      if (!n) result = '失败:old_string 在文件里找不到。先 Read 确认当前内容。';
      else if (n > 1 && !actual.replace_all) result = `失败:old_string 出现了 ${n} 次,不唯一。加长上下文,或用 replace_all。`;
      else { await writeFile(actual.file_path, actual.replace_all ? actual.old_string === '' ? characters(text).map(char => actual.new_string + char).join('') + actual.new_string : text.replaceAll(actual.old_string, () => actual.new_string) : text.replace(actual.old_string, () => actual.new_string), 'utf8'); result = `已替换 ${actual.replace_all ? n : 1} 处`; }
    } else if (name === 'Patch') result = await patch(context, actual);
    else if (name === 'Bash') result = await shell(actual.command, context.cwd, signal);
    else if (name === 'Check') result = await ports.check(actual, context, signal);
    else result = `未知工具 ${name}`;
    const maximum = name === 'Read' && actual.file_path && (isWorkflowResource(actual.file_path, context.resourceRoot) || resolvePath(actual.file_path) === resolvePath(path.join(context.cwd, 'assets/lib/LIBS.md'))) ? 160000 : 30000;
    return typeof result === 'string' ? cap(result, maximum) : { text: cap(result.text, maximum), images: result.images };
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    return toolError(error);
  }
}
