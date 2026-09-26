/** Native CSS contracts and local resources from core/theme.py. */
import { existsSync, statSync } from 'node:fs';
import { mkdir, mkdtemp, writeFile, rename, rm, open } from 'node:fs/promises';
import path from 'node:path';
import { isIP } from 'node:net';
import { cssComponents, cssRules, cssBlocks, serializeCss, type CssComponent } from './css-tokenizer.js';
import { stripText, splitLines, PYTHON_SPACE } from './text.js';
import { resolvePath } from './planner-contract.js';

export const valueError = (message: string): Error => Object.assign(new Error(message), { name: 'ValueError' });

export const INTERFACE = new RegExp(`/\\*${PYTHON_SPACE}*==== INTERFACE ====(.*?)==== /INTERFACE ====${PYTHON_SPACE}*\\*/`, 'su');
const SURFACE = /^--(?:[sſ]urface|panel|card|board|t[iİı]le|box|ch[iİı]p|well|[sſ]heet|plate)(?:-|$)/iu;
// Python re.M anchors only at LF; its dot includes CR and Unicode line separators.
const LINE_START = '(?:^|(?<=\\n))';
const LINE_END = '(?=\\n|$)';
export const IMAGES = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);
export const FONTS = new Set(['.woff', '.woff2', '.ttf', '.otf']);
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const variants = (contract: string): string[] => [...contract.matchAll(new RegExp(`${LINE_START}${PYTHON_SPACE}*\\*?${PYTHON_SPACE}*variant${PYTHON_SPACE}+([\\p{L}\\p{N}_-]+)`, 'gu'))].map(match => match[1]!);
export const REFERENCE = new RegExp(`${LINE_START}${PYTHON_SPACE}*\\*?${PYTHON_SPACE}*reference(?:${PYTHON_SPACE}*:${PYTHON_SPACE}*|${PYTHON_SPACE}+)(style|user):([^\\n]+?)${PYTHON_SPACE}*${LINE_END}`, 'gu');
export function references(css: string): Array<[string, string]> {
  const contract = css.match(INTERFACE)?.[1] ?? '';
  const rows = [...contract.matchAll(REFERENCE)].map(match => [match[1]!, match[2]!] as [string, string]);
  return [...new Map(rows.map(row => [JSON.stringify(row), row])).values()];
}
function* walkCss(nodes: CssComponent[]): Generator<CssComponent> {
  for (const node of nodes) {
    yield node;
    for (const children of [node.prelude, node.content, node.arguments, node.value]) if (Array.isArray(children)) yield* walkCss(children);
  }
}
function* rulesOf(nodes: CssComponent[]): Generator<CssComponent> {
  for (const node of nodes) {
    if (node.type === 'qualified-rule') yield node;
    else if (node.type === 'at-rule' && node.content && ['media', 'supports', 'layer', 'container', 'scope', 'starting-style'].includes(node.at_keyword!.toLowerCase())) yield* rulesOf(cssRules(node.content, false));
  }
}
export class CssRoot {
  constructor(readonly nodes: CssComponent[]) {}
  toString(): string { return serializeCss(this.nodes); }
}
export function parseCss(css: string): CssRoot {
  return new CssRoot(cssRules(css, true, false, false));
}
/** Preserve empty branches and split only outside CSS component blocks. */
function selectorBranches(selector: string): string[] {
  const branches: string[] = [];
  let branch: ReturnType<typeof cssComponents> = [];
  for (const token of cssComponents(selector)) {
    if (token.type === 'literal' && token.value === ',') {
      branches.push(stripText(serializeCss(branch))); branch = [];
    } else branch.push(token);
  }
  branches.push(stripText(serializeCss(branch)));
  return branches;
}

export function inspect(css: string): { bad: string[]; root?: CssRoot; contract: string } {
  const bad: string[] = [], matched = css.match(INTERFACE);
  if (!matched || !stripText(css).startsWith('/*')) bad.push('缺少完整的 INTERFACE 接口块');
  if (!stripText(css) || stripText(css).startsWith('```')) bad.push('主题必须是非空纯 CSS，不能有代码围栏');
  const bare = css.replace(/\/\*.*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/gs, '');
  const stack: string[] = [];
  for (const char of bare) {
    if ('([{'.includes(char)) stack.push(char);
    else if (')]}'.includes(char) && stack.pop() !== ({ ')': '(', ']': '[', '}': '{' } as Record<string, string>)[char]) { bad.push('CSS 括号不匹配'); break; }
  }
  if (stack.length || bare.includes('/*')) bad.push('CSS 块/注释未闭合');
  const contract = matched?.[1] ?? '';
  const nodes = cssRules(css);
  for (const node of walkCss(nodes)) {
    if (node.type === 'error') bad.push(`CSS 语法错误 ${node.source_line}:${node.source_column}: ${node.message}`);
    if (node.type === 'at-rule' && node.at_keyword!.toLowerCase() === 'import') bad.push('不支持 @import；资源必须本地自包含');
  }
  const selectors: string[] = [], defined = new Set<string>(), defaults = new Set<string>();
  for (const rule of rulesOf(nodes)) {
    const selector = stripText(serializeCss(rule.prelude!));
    selectors.push(selector);
    const branches = selectorBranches(selector);
    for (const branch of branches) if (!/\.nt-[\p{L}\p{N}_-]+|#stage|:root|(?<![\p{L}\p{N}_])(?:html|body)(?![\p{L}\p{N}_])/u.test(branch)) bad.push(`共享样式须挂具名 .nt-*，不全局重写: ${stripText(branch)}`);
    for (const declaration of cssBlocks(rule.content!)) {
      if (declaration.type === 'error') bad.push(`CSS 声明错误 ${declaration.source_line}: ${declaration.message}`);
      if (declaration.type !== 'declaration') continue;
      const name = declaration.name!;
      defined.add(name);
      if (branches.some(branch => [':root', 'html'].includes(branch))) defaults.add(name);
      if (branches.some(branch => !/\.nt-[\p{L}\p{N}_-]+/u.test(branch)) && SURFACE.test(name)) bad.push(`不许定义承载面 token 于公共作用域: ${name}`);
      if (branches.some(branch => new RegExp(`#stage${PYTHON_SPACE}*$`, 'u').test(branch)) && ['transform', 'transform-origin', 'position', 'left', 'top', 'width', 'height', 'overflow'].includes(name.toLowerCase())) bad.push(`不覆盖底盘 #stage 的 ${name}`);
    }
  }
  for (const name of ['--bg', '--text', '--font-sans']) if (!defaults.has(name)) bad.push(`缺少必需 token: ${name}`);
  for (const name of variants(contract)) if (!selectors.some(selector => new RegExp(`data-variant${PYTHON_SPACE}*=${PYTHON_SPACE}*["']?${escapeRegex(name)}(?:["']|\\])`, 'u').test(selector))) bad.push(`接口 variant 未定义: ${name}`);
  for (const line of splitLines(contract)) if (new RegExp(`^${PYTHON_SPACE}*\\*?${PYTHON_SPACE}*token${PYTHON_SPACE}+`, 'u').test(line)) for (const name of line.match(/--[\p{L}\p{N}_-]+/gu) ?? []) {
    if (!defined.has(name)) bad.push(`接口 token 未定义: ${name}`);
    if (SURFACE.test(name)) bad.push(`接口块不发布公共承载面 token: ${name}`);
  }
  for (const match of contract.matchAll(new RegExp(`${LINE_START}${PYTHON_SPACE}*\\*?${PYTHON_SPACE}*class${PYTHON_SPACE}+(\\.nt-[\\p{L}\\p{N}_-]+)`, 'gu'))) if (!selectors.some(selector => new RegExp(escapeRegex(match[1]!) + '(?![\\p{L}\\p{N}_-])', 'u').test(selector))) bad.push(`接口 class 未定义: ${match[1]}`);
  return { bad: [...new Set(bad)], root: new CssRoot(nodes), contract };
}
export function decodeCss(text: string): string {
  return text.replace(/\\([0-9a-f]{1,6})(?:\r\n|[\n\r\t\f ])?|\\([^\n\r\f])/gi, (_all, hex, escaped) => {
    if (!hex) return escaped;
    const code = parseInt(hex, 16);
    return String.fromCodePoint(code === 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff) ? 0xfffd : code);
  });
}
export interface CssUrl { value: string; replace(value: string): void }
export function cssUrls(root: CssRoot): CssUrl[] {
  const result: CssUrl[] = [];
  const append = (node: CssComponent, value: string) => result.push({ value, replace(value) {
    const encoded = '"' + value.replaceAll('\\', '\\\\').replaceAll('"', '\\"') + '"';
    if (node.type === 'url') { node.value = value; node.representation = 'url(' + encoded + ')'; }
    else if (node.type === 'string') { node.value = value; node.representation = encoded; }
    else node.arguments = cssComponents(encoded);
  } });
  for (const node of walkCss(root.nodes)) {
    if (node.type === 'url') append(node, String(node.value));
    else if (node.type === 'function' && node.name!.toLowerCase() === 'url') {
      const args = node.arguments!.filter(token => token.type !== 'whitespace' && token.type !== 'comment');
      if (args.length !== 1 || args[0]!.type !== 'string') throw Object.assign(new Error('url() 必须是本地文件或 fragment'), { name: 'ValueError' });
      append(node, String(args[0]!.value));
    } else if (node.type === 'function' && ['image-set', '-webkit-image-set'].includes(node.name!.toLowerCase())) {
      for (const child of node.arguments!) if (child.type === 'string') append(child, String(child.value));
    }
  }
  return result;
}
export function isWithin(file: string, boundary: string): boolean {
  const relative = path.relative(resolvePath(boundary), resolvePath(file));
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
export const unquoteUrl = (value: string): string => value.replace(/(?:%[0-9a-f]{2})+/gi, bytes => Buffer.from(bytes.replaceAll('%', ''), 'hex').toString('utf8'));
/** String URL splitting and netloc validation used by Python resource tools. */
export function splitResourceUrl(value: string): { scheme: string; netloc: string; path: string; query: string; fragment: string } {
  const fail = (message: string): never => { throw Object.assign(new Error(message), { name: 'ValueError' }); };
  let rest = value.replace(/^[\x00-\x20]+/, '').replace(/[\t\r\n]/g, '');
  const prefix = rest.match(/^[a-z][a-z0-9+.-]*:/i)?.[0] ?? '';
  const scheme = prefix.slice(0, -1).toLowerCase(); rest = rest.slice(prefix.length);
  let netloc = '', query = '', fragment = '';
  if (rest.startsWith('//')) {
    const end = rest.slice(2).search(/[/?#]/), length = end < 0 ? rest.length : end + 2;
    netloc = rest.slice(2, length); rest = rest.slice(length);
    if (netloc.includes('[') !== netloc.includes(']')) fail('Invalid IPv6 URL');
    if (netloc.includes('[') && netloc.includes(']')) {
      const authority = netloc.slice(netloc.lastIndexOf('@') + 1), open = authority.indexOf('[');
      let hostname: string;
      if (open >= 0) {
        if (open > 0) fail('Invalid IPv6 URL');
        const close = authority.indexOf(']', open + 1);
        hostname = close < 0 ? authority.slice(open + 1) : authority.slice(open + 1, close);
        const port = close < 0 ? '' : authority.slice(close + 1);
        if (port && !port.startsWith(':')) fail('Invalid IPv6 URL');
      } else hostname = authority.split(':')[0]!;
      if (hostname.startsWith('v')) {
        if (!/^v[0-9a-fA-F]+\..+$/.test(hostname)) fail('IPvFuture address is invalid');
      } else {
        const [address, ...zone] = hostname.split('%');
        const family = isIP(address!);
        if (!family || (family === 4 && zone.length) || zone.length > 1 || (zone.length === 1 && !zone[0])) {
          const quote = hostname.includes("'") && !hostname.includes('"') ? '"' : "'";
          const repr = [...hostname].map(c => c === quote || c === '\\' ? '\\' + c : /[\p{C}\p{Z}]/u.test(c) && c !== ' ' ? (c.codePointAt(0)! <= 255 ? '\\x' : c.codePointAt(0)! <= 65535 ? '\\u' : '\\U') + c.codePointAt(0)!.toString(16).padStart(c.codePointAt(0)! <= 255 ? 2 : c.codePointAt(0)! <= 65535 ? 4 : 8, '0') : c).join('');
          fail(quote + repr + quote + ' does not appear to be an IPv4 or IPv6 address');
        }
        if (family === 4) fail('An IPv4 address cannot be in brackets');
      }
    }
  }
  const hash = rest.indexOf('#'); if (hash >= 0) { fragment = rest.slice(hash + 1); rest = rest.slice(0, hash); }
  const question = rest.indexOf('?'); if (question >= 0) { query = rest.slice(question + 1); rest = rest.slice(0, question); }
  const check = netloc.replace(/[@:#?]/g, ''), normalized = check.normalize('NFKC');
  if (normalized !== check && /[/?#@:]/.test(normalized)) fail("netloc '" + netloc + "' contains invalid characters under NFKC normalization");
  return { scheme, netloc, path: rest, query, fragment };
}
export function localUrl(value: string, origin: string, boundary: string): [string | null, string] {
  if (value.startsWith('#')) return [null, value];
  const { scheme, netloc, path: pathname, query, fragment } = splitResourceUrl(value);
  if (scheme || netloc || query || !pathname || value.includes('\\') || pathname.startsWith('/')) throw valueError(`只支持本地相对资源及 fragment: ${value}`);
  // urllib.unquote decodes valid percent bytes even alongside malformed escapes,
  // replacing invalid UTF-8 instead of falling back to the original entire path.
  const decoded = unquoteUrl(pathname);
  const file = resolvePath(decoded, origin);
  if (!isWithin(file, boundary)) throw valueError(`资源越界: ${value}`);
  if (!existsSync(file) || !statSync(file).isFile()) throw valueError(`缺少资源: ${file}`);
  if (!IMAGES.has(path.extname(file).toLowerCase()) && !FONTS.has(path.extname(file).toLowerCase())) throw valueError(`不支持的资源类型: ${path.basename(file)}`);
  return [file, fragment ? '#' + fragment : ''];
}
export function checkOptions(template: string | undefined, style: string | undefined): void {
  if (style !== undefined && !stripText(style)) throw valueError('--style 不得为空；修改成品主题请明确填写要求');
  if (template !== undefined && !existsSync(template)) throw valueError(`--template 不存在: ${template}`);
}
export async function publish(css: string, target: string): Promise<void> {
  await mkdir(path.dirname(target), { recursive: true });
  const scratch = await mkdtemp(path.join(path.dirname(target), '.theme-publish-'));
  const temporary = path.join(scratch, 'theme.css');
  try {
    await writeFile(temporary, css, 'utf8');
    const handle = await open(temporary, 'r+');
    try { await handle.sync(); } finally { await handle.close(); }
    await rename(temporary, target);
  } finally { await rm(scratch, { recursive: true, force: true }); }
}
