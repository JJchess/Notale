import {codeResourcePath} from '@notale/format';
import { pageRuntime } from '@notale/format';
import { parse as parseScript } from 'acorn';
import { simple as walkScript } from 'acorn-walk';
import {
  parse,
  parseFragment,
  serialize,
  serializeOuter,
  type DefaultTreeAdapterMap,
} from 'parse5';
import { randomUUID } from 'node:crypto';
import { invariant, type Slide } from './model.js';

export type Element = DefaultTreeAdapterMap['element'];
type Node = DefaultTreeAdapterMap['node'];
export const NODE_ID = 'data-notale-id';
let allocation: {seed: string; index: number} | undefined;
export const uid = () => allocation ? allocation.seed + '-' + allocation.index++ : randomUUID();
/** Synchronous author commands use the same identities during preparation and commit. */
export function withStableIds<T>(seed: string, work: () => T): T {
  const previous = allocation; allocation = {seed, index: 0};
  try { return work(); } finally { allocation = previous; }
}
export const attr = (el: Element, name: string) => el.attrs.find((a) => a.name === name)?.value;
export function setAttr(el: Element, name: string, value: string | null) {
  el.attrs = el.attrs.filter((a) => a.name !== name);
  if (value !== null) el.attrs.push({ name, value });
}
export function elements(node: Node): Element[] {
  const out: Element[] = [];
  function walk(n: Node) {
    if ('tagName' in n) out.push(n);
    if ('childNodes' in n) for (const child of n.childNodes) walk(child);
  }
  walk(node);
  return out;
}
export function textOf(node: Node): string {
  if (node.nodeName === '#text') return (node as DefaultTreeAdapterMap['textNode']).value;
  return 'childNodes' in node ? node.childNodes.map(textOf).join('') : '';
}
const excluded = new Set([
  'html',
  'head',
  'body',
  'script',
  'style',
  'link',
  'meta',
  'title',
  'base',
  'noscript',
]);
export function editableElements(root: Node): Element[] {
  return elements(root).filter((e) => {
    if (excluded.has(e.tagName)) return false;
    for (let parent = e.parentNode; parent && 'tagName' in parent; parent = parent.parentNode)
      if (attr(parent, 'data-notale-connector') !== undefined) return false;
    return true;
  });
}
export function assignIds(root: Node, fresh = false) {
  const used = new Set<string>();
  for (const el of editableElements(root)) {
    let id = attr(el, NODE_ID);
    if (fresh || !id || used.has(id) || !/^[\w-]{1,100}$/.test(id)) id = uid();
    used.add(id);
    setAttr(el, NODE_ID, id);
    if (el.tagName === 'iframe' && !attr(el, 'src') && attr(el, 'data-src')) setAttr(el, 'src', attr(el, 'data-src')!);
  }
}
export function normalizeHtml(html: string) {
  const root = parse(html);
  assignIds(root);
  return serialize(root);
}
export function findElement(root: Node, id: string): Element {
  const el = editableElements(root).find((e) => attr(e, NODE_ID) === id);
  invariant(el, 'OBJECT_NOT_FOUND', `Object ${id} does not exist`, 404);
  return el;
}
export function removeElement(el: Element) {
  invariant(el.parentNode, 'INVALID_PARENT', 'Element has no parent');
  el.parentNode.childNodes = el.parentNode.childNodes.filter((n) => n !== el);
}
export function setInner(el: Element, html: string) {
  const fragment = parseFragment(el, html, {});
  el.childNodes = fragment.childNodes;
  for (const n of el.childNodes) n.parentNode = el;
}
export function setText(el: Element, text: string) {
  el.childNodes = [{ nodeName: '#text', value: text, parentNode: el }];
}
export function appendHtml(
  parent: Element,
  html: string,
  index?: number,
  fresh = true,
): DefaultTreeAdapterMap['childNode'][] {
  const fragment = parseFragment(parent, html, {});
  assignIds(fragment, fresh);
  for (const n of fragment.childNodes) n.parentNode = parent;
  parent.childNodes.splice(index ?? parent.childNodes.length, 0, ...fragment.childNodes);
  return fragment.childNodes;
}
export function escaped(text: string) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
// Browser CSS parsing is avoided on the server. Splitting observes strings and parentheses.
export function parseStyle(css: string): Map<string, string> {
  const result = new Map<string, string>();
  let current = '',
    depth = 0,
    quote = '';
  function push() {
    const at = current.indexOf(':');
    if (at > 0) result.set(current.slice(0, at).trim(), current.slice(at + 1).trim());
    current = '';
  }
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (quote) {
      current += c;
      if (c === '\\') {
        current += css[++i] ?? '';
      } else if (c === quote) quote = '';
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    if (c === '(') depth++;
    if (c === ')') depth--;
    if (c === ';' && depth === 0) push();
    else current += c;
  }
  push();
  return result;
}
export function patchStyle(el: Element, patch: Record<string, string>) {
  const style = parseStyle(attr(el, 'style') ?? '');
  for (const [key, value] of Object.entries(patch)) {
    // An explicit patch is the latest declaration, including logical/physical
    // aliases and shorthand/longhand precedence.
    style.delete(key);
    if (value !== '') style.set(key, value);
  }
  setAttr(el, 'style', [...style].map(([k, v]) => `${k}: ${v}`).join('; '));
}
export function inspectSlide(slide: Slide) {
  const root = parse(slide.html);
  return editableElements(root).map((el) => ({
    id: attr(el, NODE_ID)!,
    tag: el.tagName,
    namespace: String(el.namespaceURI),
    domId: attr(el, 'id'),
    parent: el.parentNode && 'tagName' in el.parentNode ? attr(el.parentNode, NODE_ID) : undefined,
    text: textOf(el).slice(0, 500),
    html: serializeOuter(el),
    attributes: Object.fromEntries(el.attrs.map((a) => [a.name, a.value])),
    style: Object.fromEntries(parseStyle(attr(el, 'style') ?? '')),
    locked: slide.locked.includes(attr(el, NODE_ID)!),
    kind:
      el.tagName === 'canvas'
        ? 'interactive'
        : el.tagName === 'svg'
          ? 'vector'
          : ['img', 'video', 'audio', 'iframe'].includes(el.tagName)
            ? 'media'
            : el.tagName === 'table'
              ? 'table'
              : el.childNodes.some((n) => 'tagName' in n)
                ? 'container'
                : 'text',
  }));
}
export function importHtml(html: string) {
  const normalized = normalizeHtml(html),
    root = parse(normalized),
    all = elements(root);
  const notes = all.find(
    (e) => e.tagName === 'aside' && (attr(e, 'class') ?? '').includes('notes'),
  );
  const title = all.find((e) => e.tagName === 'h1') ?? all.find((e) => e.tagName === 'title');
  const steps = all.map((e) => Number(attr(e, 'data-deck-step') ?? attr(e, 'data-step') ?? 0)).filter(Number.isFinite);
  for (const script of all.filter(el => el.tagName === 'script' && !attr(el, 'src'))) {
    try {
      walkScript(parseScript(textOf(script), {ecmaVersion:'latest',sourceType:'module'}), {CallExpression(node) {
        const callee = node.callee, count = node.arguments[1];
        if (callee.type === 'MemberExpression' && callee.object.type === 'Identifier' && callee.object.name === 'Deck' && callee.property.type === 'Identifier' && callee.property.name === 'onStep' && count?.type === 'Literal' && typeof count.value === 'number' && Number.isInteger(count.value) && count.value >= 0 && count.value <= 500) steps.push(count.value);
      }});
    } catch { /* Runtime-reported maxima remain authoritative for computed scripts. */ }
  }
  return {
    html: normalized,
    notes: notes ? textOf(notes).trim() : '',
    name: title ? textOf(title).trim().slice(0, 300) : 'Untitled slide',
    nativeStepCount: Math.max(0, ...steps),
  };
}
export { parse, parseFragment, serialize, serializeOuter };

export function describePageRuntime(slide: Pick<Slide, 'html' | 'nativeStepCount'> & {sourcePath?:string}, doc?: import('./model.js').DeckDocument) {
  return pageRuntime(slide.nativeStepCount, elements(parse(slide.html)).filter(el => el.tagName === 'iframe' && (attr(el, 'class') ?? '').split(/\s+/).includes('code-workbench-frame')).map(el => ({target:attr(el,NODE_ID)!,entry:attr(el,'src') ?? attr(el,'data-src') ?? '',lesson:doc?.codeLessons?.[codeResourcePath(attr(el,'src') ?? attr(el,'data-src') ?? '',slide.sourcePath??'index.html')]} )));
}
