/** What the editor accepts as one page, shared so the harness and the editor read pages the same way.
 * Node-only (parse5, acorn): the root export stays browser-safe, this lives at `@notale/format/page`. */
import { parse as parseScript } from 'acorn';
import { simple as walkScript } from 'acorn-walk';
import valueParser from 'postcss-value-parser';
import { parse, serialize, type DefaultTreeAdapterMap } from 'parse5';
import { randomUUID } from 'node:crypto';
import { posix } from 'node:path';

type Element = DefaultTreeAdapterMap['element'];
type Node = DefaultTreeAdapterMap['node'];
export const NODE_ID = 'data-notale-id';
const attr = (el: Element, name: string) => el.attrs.find(a => a.name === name)?.value;
function elements(node: Node): Element[] {
  const out: Element[] = [];
  const walk = (n: Node) => { if ('tagName' in n) out.push(n); if ('childNodes' in n) for (const child of n.childNodes) walk(child); };
  walk(node); return out;
}
function textOf(node: Node): string {
  if (node.nodeName === '#text') return (node as DefaultTreeAdapterMap['textNode']).value;
  return 'childNodes' in node ? node.childNodes.map(textOf).join('') : '';
}
const excluded = new Set(['html', 'head', 'body', 'script', 'style', 'link', 'meta', 'title', 'base', 'noscript']);
/** Elements the editor can select: everything visible, except inside a connector. */
export function editableElements(root: Node): Element[] {
  return elements(root).filter(e => {
    if (excluded.has(e.tagName)) return false;
    for (let parent = e.parentNode; parent && 'tagName' in parent; parent = parent.parentNode)
      if (attr(parent, 'data-notale-connector') !== undefined) return false;
    return true;
  });
}
/** Every editable element gets a unique, well-formed `data-notale-id`; existing good ones are kept. */
export function assignIds(root: Node, uid: () => string = randomUUID, fresh = false) {
  const used = new Set<string>();
  for (const el of editableElements(root)) {
    let id = attr(el, NODE_ID);
    if (fresh || !id || used.has(id) || !/^[\w-]{1,100}$/.test(id)) id = uid();
    used.add(id);
    el.attrs = el.attrs.filter(a => a.name !== NODE_ID);
    el.attrs.push({ name: NODE_ID, value: id });
    if (el.tagName === 'iframe' && !attr(el, 'src') && attr(el, 'data-src')) el.attrs.push({ name: 'src', value: attr(el, 'data-src')! });
  }
}

/** One page as the editor imports it: ids assigned, title, speaker notes and step count read. */
export function readPage(html: string, options: { uid?: () => string; untitled?: string } = {}) {
  const root = parse(html);
  assignIds(root, options.uid);
  const normalized = serialize(root), all = elements(parse(normalized));
  const notes = all.find(e => e.tagName === 'aside' && (attr(e, 'class') ?? '').split(/\s+/).includes('notes'));
  const title = all.find(e => e.tagName === 'h1' && textOf(e).trim()) ?? all.find(e => e.tagName === 'title');
  const steps = all.map(e => Number(attr(e, 'data-deck-step') ?? attr(e, 'data-step') ?? 0)).filter(Number.isFinite);
  for (const script of all.filter(el => el.tagName === 'script' && !attr(el, 'src'))) {
    try {
      walkScript(parseScript(textOf(script), { ecmaVersion: 'latest', sourceType: 'module' }), { CallExpression(node) {
        const callee = node.callee, count = node.arguments[1];
        if (callee.type === 'MemberExpression' && callee.object.type === 'Identifier' && callee.object.name === 'Deck' && callee.property.type === 'Identifier' && callee.property.name === 'onStep' && count?.type === 'Literal' && typeof count.value === 'number' && Number.isInteger(count.value) && count.value >= 0 && count.value <= 500) steps.push(count.value);
      } });
    } catch { /* Runtime-reported maxima remain authoritative for computed scripts. */ }
  }
  return {
    html: normalized,
    notes: notes ? textOf(notes).trim() : '',
    name: title ? textOf(title).trim().slice(0, 300) : options.untitled ?? 'Untitled slide',
    nativeStepCount: Math.min(500, Math.max(0, ...steps)),
  };
}

/** Rewrite candidate URLs without splitting commas inside data URLs or descriptors. */
export function rewriteSrcset(source: string, rewrite: (url: string) => string): string {
  const space = (char: string) => /[\t\n\f\r ]/.test(char);
  let at = 0, copied = 0, result = '';
  while (at < source.length) {
    while (at < source.length && (space(source[at]!) || source[at] === ',')) at++;
    const start = at;
    while (at < source.length && !space(source[at]!)) at++;
    let end = at;
    while (end > start && source[end - 1] === ',') end--;
    if (end > start) {
      result += source.slice(copied, start) + rewrite(source.slice(start, end));
      copied = end;
    }
    if (end < at) continue;
    let parentheses = 0;
    while (at < source.length) {
      const char = source[at++];
      if (char === '(') parentheses++;
      else if (char === ')') parentheses = Math.max(0, parentheses - 1);
      else if (char === ',' && !parentheses) break;
    }
  }
  return result + source.slice(copied);
}

export interface Reference { from: string; url: string; path?: string; external: boolean }
/** Every URL a page or stylesheet points at, resolved against the file that holds it. */
export function references(from: string, source: string, kind: 'html' | 'css'): Reference[] {
  const urls: string[] = [];
  const css = (text: string) => {
    const parsed = valueParser(text);
    parsed.walk(node => {
      if (node.type !== 'function' || node.value.toLowerCase() !== 'url') return;
      const first = node.nodes[0];
      urls.push(node.nodes.length === 1 && first?.type === 'string' ? first.value : valueParser.stringify(node.nodes).trim());
      return false;
    });
    for (let i = 0; i < parsed.nodes.length; i++) {
      const node = parsed.nodes[i]!;
      if (node.type === 'word' && node.value.toLowerCase() === '@import') {
        const next = parsed.nodes.slice(i + 1).find(n => n.type !== 'space' && n.type !== 'comment');
        if (next?.type === 'string') urls.push(next.value);
      }
    }
  };
  if (kind === 'css') css(source);
  else
    for (const e of elements(parse(source))) {
      for (const name of ['src', 'href', 'poster', 'data-src']) { const value = attr(e, name); if (value) urls.push(value); }
      const srcset = attr(e, 'srcset');
      if (srcset) rewriteSrcset(srcset, url => { urls.push(url); return url; });
      if (e.tagName === 'style') css(textOf(e));
      if (attr(e, 'style')) css(attr(e, 'style')!);
    }
  return urls
    .filter(u => u && !u.startsWith('#') && !/^(data:|blob:|mailto:|tel:|javascript:)/i.test(u))
    .map(url => {
      if (/^(https?:)?\/\//.test(url)) return { from, url, external: true };
      let decoded = url.split(/[?#]/)[0]!;
      try { decoded = decodeURIComponent(decoded); } catch { /* kept as written */ }
      return { from, url, path: decoded ? posix.normalize(posix.join(posix.dirname(from), decoded)) : from, external: false };
    });
}

/** The `src` of every code workbench (`iframe.code-workbench-frame`) on a page. */
export function workbenchFrames(html: string): string[] {
  return elements(parse(html)).filter(el => el.tagName === 'iframe' && (attr(el, 'class') ?? '').split(/\s+/).includes('code-workbench-frame'))
    .map(el => attr(el, 'src') ?? attr(el, 'data-src') ?? '');
}
