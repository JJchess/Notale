import type { VectorMutation } from '../domain/vector-schema.js';
import { svgReferenceValue } from '../domain/svg-references.js';
export const SVG_NS = 'http://www.w3.org/2000/svg',
  VID = 'data-notale-id';
export const vectorId = (n: Element) => n.getAttribute(VID)!;
export const vectorNode = (id: string, root: ParentNode = document) =>
  root.querySelector<SVGElement>(`[${VID}="${CSS.escape(id)}"]`);
export function createSvg(tag: string, attrs: Record<string, string | number> = {}) {
  const n = document.createElementNS(SVG_NS, tag);
  n.setAttribute(VID, crypto.randomUUID());
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
}
export function cleanVector(root: Element) {
  const copy = root.cloneNode(true) as Element;
  for (const n of [copy, ...copy.querySelectorAll('*')]) {
    n.removeAttribute('data-notale-selected');
    n.removeAttribute('data-notale-hover');
  }
  return copy;
}
export function vectorNodes(root: Element) {
  return [root, ...root.querySelectorAll(`[${VID}]`)].filter(
    (n) => n.namespaceURI === SVG_NS && n.hasAttribute(VID),
  );
}
export function vectorDiff(before: Element, after: Element): VectorMutation[] {
  const a = new Map(vectorNodes(before).map((n) => [vectorId(n), n])),
    b = new Map(vectorNodes(after).map((n) => [vectorId(n), n]));
  const out: VectorMutation[] = [];
  const replaced = new Set(
    [...b].filter(([id, n]) => a.has(id) && a.get(id)!.localName !== n.localName).map(([id]) => id),
  );
  const covered = (n: Element) => {
    for (let p = n.parentElement; p; p = p.parentElement)
      if (replaced.has(vectorId(p))) return true;
    return false;
  };
  // Insert new containers before moving existing children into them. Never duplicate an authored ID.
  for (const [id, n] of b)
    if (!covered(n) && !a.has(id) && n.parentElement && a.has(vectorId(n.parentElement))) {
      const copy = n.cloneNode(true) as Element;
      for (const child of [...copy.querySelectorAll(`[${VID}]`)])
        if (a.has(vectorId(child))) child.remove();
      out.push({
        op: 'insert',
        parent: vectorId(n.parentElement),
        index: [...n.parentElement.childNodes].indexOf(n),
        html: copy.outerHTML,
      });
    }
  for (const [id, n] of b) {
    const old = a.get(id);
    if (!old || covered(n)) continue;
    if (old.localName !== n.localName) {
      out.push({ op: 'replace', target: id, html: n.outerHTML });
      continue;
    }
    if (
      n !== after &&
      n.parentElement &&
      (vectorId(n.parentElement) !== vectorId(old.parentElement!) ||
        [...n.parentElement.children].indexOf(n) !== [...old.parentElement!.children].indexOf(old))
    )
      out.push({
        op: 'move',
        target: id,
        parent: vectorId(n.parentElement),
        index: [...n.parentElement.childNodes].indexOf(n),
      });
    const attributes: Record<string, string | null> = {};
    for (const key of new Set([...old.attributes, ...n.attributes].map((x) => x.name)))
      if (
        ![VID, 'id', 'data-notale-selected', 'data-notale-hover'].includes(key) &&
        old.getAttribute(key) !== n.getAttribute(key)
      )
        attributes[key] = n.getAttribute(key);
    const text =
      !old.children.length && !n.children.length && old.textContent !== n.textContent
        ? (n.textContent ?? '')
        : undefined;
    if (Object.keys(attributes).length || text !== undefined)
      out.push({
        op: 'set',
        target: id,
        ...(Object.keys(attributes).length ? { attributes } : {}),
        ...(text !== undefined ? { text } : {}),
      });
  }
  for (const [id, n] of a)
    if (!covered(n) && !b.has(id) && (!n.parentElement || b.has(vectorId(n.parentElement))))
      out.push({ op: 'remove', target: id });
  return out;
}
export function paintVector(changes: VectorMutation[]) {
  for (const c of changes) {
    if (c.op === 'insert') {
      const p = vectorNode(c.parent);
      if (!p) continue;
      const wrap = document.createElementNS(SVG_NS, 'svg');
      wrap.innerHTML = c.html;
      for (const n of [...wrap.childNodes]) {
        if (n instanceof Element && n.hasAttribute(VID) && vectorNode(vectorId(n))) continue;
        p.insertBefore(n, p.childNodes[c.index] ?? null);
      }
      continue;
    }
    const n = vectorNode(c.target);
    if (!n) continue;
    if (c.op === 'remove') {
      n.remove();
      continue;
    }
    if (c.op === 'replace') {
      const wrap = document.createElementNS(SVG_NS, 'svg');
      wrap.innerHTML = c.html;
      if (wrap.firstElementChild) n.replaceWith(wrap.firstElementChild);
      continue;
    }
    if (c.op === 'move') {
      const p = vectorNode(c.parent);
      if (p) p.insertBefore(n, p.childNodes[c.index] ?? null);
    }
    for (const [k, v] of Object.entries(c.attributes ?? {}))
      if (v === null) n.removeAttribute(k);
      else n.setAttribute(k, v);
    if (c.op === 'set' && c.text !== undefined) n.textContent = c.text;
  }
}
/** Undo a failed local preview without overwriting newer authored changes. */
export function rollbackVectorPreview(before:Element,preview:Element):boolean {
  const live=vectorNode(vectorId(before));
  if(!live)return false;
  const inverse=vectorDiff(preview,before);
  if(cleanVector(live).outerHTML===preview.outerHTML){paintVector(inverse);return true;}
  const expected=new Map(vectorNodes(preview).map(n=>[vectorId(n),n]));
  let complete=true;
  for(const change of inverse){
    if(change.op==='insert'){complete=false;continue;}
    const node=vectorNode(change.target),was=expected.get(change.target);
    if(!node||!was){complete=false;continue;}
    if(change.op==='set'){
      const attributes:Record<string,string|null>={};
      for(const [key,value] of Object.entries(change.attributes??{})){
        if(node.getAttribute(key)===was.getAttribute(key))attributes[key]=value;
        else complete=false;
      }
      let text:string|undefined;
      if(change.text!==undefined){
        if(!node.children.length&&node.textContent===was.textContent)text=change.text;
        else complete=false;
      }
      if(Object.keys(attributes).length||text!==undefined)paintVector([{op:'set',target:change.target,attributes,...(text===undefined?{}:{text})}]);
    }else if(change.op==='replace'&&cleanVector(node).outerHTML===was.outerHTML){
      paintVector([change]);
    }else complete=false;
  }
  return complete;
}
export function freshVector(root: Element) {
  const copy = cleanVector(root),
    ids = new Map<string, string>();
  for (const n of [copy, ...copy.querySelectorAll('*')]) {
    n.setAttribute(VID, crypto.randomUUID());
    if (n.id) {
      const id = 'v_' + crypto.randomUUID().replaceAll('-', '');
      ids.set(n.id, id);
      n.id = id;
    }
    for (const a of [...n.attributes]) if (/^on/i.test(a.name)) n.removeAttribute(a.name);
  }
  for (const n of [copy, ...copy.querySelectorAll('*')]) {
    for (const a of [...n.attributes])
      n.setAttribute(
        a.name,
        svgReferenceValue(n.localName, a.name, a.value, (id) => ids.get(id) ?? id),
      );
    if (n.localName === 'style')
      n.textContent = (n.textContent ?? '').replace(/#([\w-]+)/g, (all, id) =>
        ids.has(id) ? '#' + ids.get(id) : all,
      );
  }
  return copy as SVGElement;
}
export function pointIn(node: SVGGraphicsElement, x: number, y: number) {
  const m = node.getScreenCTM();
  if (!m) throw Error('图形坐标不可用');
  return new DOMPoint(x, y).matrixTransform(m.inverse());
}
export function shapePath(el: Element): string {
  const n = (k: string, d = 0) => Number(el.getAttribute(k) ?? d),
    x = n('x'),
    y = n('y'),
    w = n('width'),
    h = n('height');
  switch (el.localName) {
    case 'path':
      return el.getAttribute('d') ?? '';
    case 'line':
      return `M${n('x1')} ${n('y1')}L${n('x2')} ${n('y2')}`;
    case 'polyline':
    case 'polygon':
      return 'M' + (el.getAttribute('points') ?? '') + (el.localName === 'polygon' ? 'Z' : '');
    case 'rect': {
      const r = Math.min(n('rx'), w / 2, h / 2);
      return `M${x + r} ${y}H${x + w - r}Q${x + w} ${y} ${x + w} ${y + r}V${y + h - r}Q${x + w} ${y + h} ${x + w - r} ${y + h}H${x + r}Q${x} ${y + h} ${x} ${y + h - r}V${y + r}Q${x} ${y} ${x + r} ${y}Z`;
    }
    case 'circle':
    case 'ellipse': {
      const rx = n('rx', n('r')),
        ry = n('ry', n('r')),
        cx = n('cx'),
        cy = n('cy');
      return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${rx * 2} 0a${rx} ${ry} 0 1 0 ${-rx * 2} 0Z`;
    }
  }
  throw Error('请选择路径或基础形状');
}
