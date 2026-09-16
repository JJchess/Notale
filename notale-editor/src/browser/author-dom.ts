/** Author DOM reconciliation. Runtime-created nodes and unchanged author nodes survive. */
export type AuthorDomOptions = {
  protect?: (element: Element) => boolean;
  force?: boolean;
  resolve?: (value: string, attribute: string) => string;
};
export type AuthorDomResult = { changed: string[]; structure: boolean; reload?: 'source-script' };
const ID = 'data-notale-id';
const index = (root: Document) => new Map([...root.querySelectorAll<Element>('[' + ID + ']')].map(e => [e.getAttribute(ID)!, e]));
const parentId = (e: Element) => e.parentElement?.getAttribute(ID) ?? e.parentElement?.tagName;
const childIds = (e: Element) => [...e.children].map(n => n.getAttribute(ID)).filter(Boolean).join('|');
const scriptKey = (doc: Document) => JSON.stringify([...doc.querySelectorAll('script:not([data-notale-runtime]):not([data-notale-factories]):not([data-notale-chart-engine]):not(#notale-author-config),base')].map(e => e.outerHTML));
export function reconcileAuthorDom(live: Document, beforeHtml: string, afterHtml: string, options: AuthorDomOptions = {}): AuthorDomResult {
  if (beforeHtml === afterHtml) return { changed: [], structure: false };
  const parser = new DOMParser(), before = parser.parseFromString(beforeHtml, 'text/html'), after = parser.parseFromString(afterHtml, 'text/html');
  if (!options.force && scriptKey(before) !== scriptKey(after)) return { changed: [], structure: false, reload: 'source-script' };
  const old = index(before), next = index(after), current = index(live), changed = new Set<string>();
  let structure = false;
  const resolve = options.resolve ?? ((v: string) => v);
  function attributes(a: Element, b: Element, target: Element) {
    if (options.protect?.(target)) return;
    const x = (a as HTMLElement).style, y = (b as HTMLElement).style, z = (target as HTMLElement).style;
    if (x && y && z) for (const key of new Set([...x, ...y])) {
      if (x.getPropertyValue(key) === y.getPropertyValue(key) && x.getPropertyPriority(key) === y.getPropertyPriority(key)) continue;
      const previous = resolve(x.getPropertyValue(key), 'style');
      if (!options.force && z.getPropertyValue(key) !== previous && z.getPropertyValue(key) !== x.getPropertyValue(key)) continue;
      const value = y.getPropertyValue(key);
      if (value) z.setProperty(key, resolve(value, 'style'), y.getPropertyPriority(key)); else z.removeProperty(key);
      if (target.getAttribute(ID)) changed.add(target.getAttribute(ID)!);
    }
    for (const name of new Set([...a.attributes, ...b.attributes].map(v => v.name))) {
      if (name === 'style' || name === ID || a.getAttribute(name) === b.getAttribute(name)) continue;
      // This layer never introduces executable handlers, even for local previews.
      if (name.startsWith('on') || name === 'srcdoc') continue;
      const previous = a.getAttribute(name), value = b.getAttribute(name);
      // Only authored attribute changes reach here; pending edits are projected by the host.
      if (value === null) target.removeAttribute(name); else target.setAttribute(name, resolve(value, name));
      if (target.getAttribute(ID)) changed.add(target.getAttribute(ID)!);
    }
  }
  function materialize(source: Element): Element {
    const id = source.getAttribute(ID), existing = id ? current.get(id) : undefined;
    if (existing && existing.tagName === source.tagName) return existing;
    const node = live.importNode(source, false);
    if (node.tagName === 'SCRIPT') throw Error('Executable source requires a runtime mount');
    for (const attr of [...node.attributes]) {
      if (attr.name.startsWith('on') || attr.name === 'srcdoc') node.removeAttribute(attr.name);
      else node.setAttribute(attr.name, resolve(attr.value, attr.name));
    }
    for (const child of source.childNodes) node.append(child.nodeType === 1 ? materialize(child as Element) : live.importNode(child, true));
    if (id) current.set(id, node);
    return node;
  }
  function parent(source: Element): Element | undefined {
    const p = source.parentElement;
    return p?.hasAttribute(ID) ? current.get(p.getAttribute(ID)!) : p?.tagName === 'HEAD' ? live.head : live.body;
  }
  // Snapshot authored text before moving descendants into new formatting wrappers.
  // Runtime-only elements remain untouched; divergent runtime text is not overwritten.
  const textUpdates: { target: Element; source: Element; nodes: Node[]; id: string }[] = [];
  const directText = (element: Element) => [...element.childNodes].filter(n => n.nodeType !== 1);
  const textKey = (nodes: Node[]) => JSON.stringify(nodes.map(n => [n.nodeType, n.nodeValue]));
  for (const [id, source] of next) {
    const previous = old.get(id), target = current.get(id);
    if (!previous || !target || previous.tagName !== source.tagName || options.protect?.(target)) continue;
    if (!previous.children.length && !source.children.length) continue;
    if ([...previous.children, ...source.children].some(e => !e.hasAttribute(ID))) continue;
    const beforeText = directText(previous), afterText = directText(source), liveText = directText(target);
    if (textKey(beforeText) === textKey(afterText) && childIds(previous) === childIds(source)) continue;
    if (!options.force && textKey(beforeText) !== textKey(liveText)) continue;
    textUpdates.push({ target, source, nodes: liveText, id });
  }
  // Parents precede children. Reuse existing descendants during insert/reparent.
  for (const [id, node] of next) {
    const previous = old.get(id), target = current.get(id);
    if (!previous || !target || previous.tagName !== node.tagName) {
      const host = parent(node); if (!host) continue;
      const replacement = materialize(node);
      if (target && target !== replacement) target.replaceWith(replacement); else if (!replacement.parentNode) host.append(replacement);
      current.set(id, replacement); changed.add(id); structure = true;
    }
  }
  // Place later siblings first, so inserting a copy never moves an unchanged iframe.
  for (const [id, node] of [...next].reverse()) {
    const previous = old.get(id), target = current.get(id); if (!target) continue;
    const p = node.parentElement, previousParent = previous?.parentElement;
    if (!previous || parentId(previous) !== parentId(node) || p && previousParent && childIds(p) !== childIds(previousParent)) {
      const host = parent(node);
      const following = [...(p?.children ?? [])].slice([...(p?.children ?? [])].indexOf(node) + 1).map(e => current.get(e.getAttribute(ID)!)).find(e => e?.parentElement === host);
      if (host && (target.parentElement !== host || target.nextElementSibling !== (following ?? null))) {
        const movable = host as Element & {moveBefore?:(node:Node,before:Node|null)=>void};
        if (movable.moveBefore && host.isConnected && target.isConnected) movable.moveBefore(target, following ?? null);
        else host.insertBefore(target, following ?? null);
      }
      structure = true; changed.add(id);
    }
    if (!previous || options.protect?.(target)) continue;
    attributes(previous, node, target);
    if (!previous.querySelector('[' + ID + ']') && !node.querySelector('[' + ID + ']') && previous.innerHTML !== node.innerHTML) {
      if (options.force || target.innerHTML === previous.innerHTML) { target.innerHTML = node.innerHTML; changed.add(id); }
    }
  }
  for (const [id] of old) if (!next.has(id)) { current.get(id)?.remove(); changed.add(id); structure = true; }
  for (const { target, source, nodes, id } of textUpdates) {
    for (const node of nodes) if (node.parentNode === target) target.removeChild(node);
    const children = [...source.childNodes];
    for (let i = 0; i < children.length; i++) {
      const node = children[i];
      if (node.nodeType === 1) continue;
      const following = children.slice(i + 1).find(n => n.nodeType === 1) as Element | undefined;
      const anchor = following ? current.get(following.getAttribute(ID)!) : undefined;
      target.insertBefore(live.importNode(node, true), anchor?.parentNode === target ? anchor : null);
    }
    changed.add(id);
  }
  attributes(before.body, after.body, live.body);
  attributes(before.documentElement, after.documentElement, live.documentElement);
  // Author stylesheets are distinct from injected editor/runtime stylesheets.
  const oldHead = [...before.head.querySelectorAll('style,link')], newHead = [...after.head.querySelectorAll('style,link')];
  oldHead.forEach((node, i) => {
    if (node.outerHTML === newHead[i]?.outerHTML) return;
    const target = [...live.head.querySelectorAll('style,link')].find(e => e.outerHTML === node.outerHTML || e.getAttribute('data-notale-author-head') === String(i));
    if (target) { if (newHead[i]) { const replacement = live.importNode(newHead[i], true); replacement.setAttribute('data-notale-author-head', String(i)); target.replaceWith(replacement); } else target.remove(); }
  });
  newHead.slice(oldHead.length).forEach((node, n) => { const target = live.importNode(node, true); target.setAttribute('data-notale-author-head', String(n + oldHead.length)); live.head.append(target); });
  return { changed: [...changed], structure };
}

export function mergeAuthorHtml(before: string, after: string, current: string): string {
  if (before === after) return current;
  if (before === current) return after;
  const doc = new DOMParser().parseFromString(current, 'text/html');
  reconcileAuthorDom(doc, before, after, { force: true });
  return (doc.doctype ? '<!DOCTYPE html>' : '') + doc.documentElement.outerHTML;
}
