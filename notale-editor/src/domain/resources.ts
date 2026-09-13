import { rewriteSrcset } from './srcset.js';
import valueParser from 'postcss-value-parser';
import { posix } from 'node:path';
import { parse, elements, attr, textOf } from './html.js';
import type { DeckDocument } from './model.js';
export interface Reference {
  from: string;
  url: string;
  path?: string;
  external: boolean;
}
export function references(from: string, source: string, kind: 'html' | 'css'): Reference[] {
  const urls: string[] = [];
  const css = (text: string) => {
    const parsed = valueParser(text);
    parsed.walk((node) => {
      if (node.type !== 'function' || node.value.toLowerCase() !== 'url') return;
      const first = node.nodes[0];
      urls.push(
        node.nodes.length === 1 && first?.type === 'string'
          ? first.value
          : valueParser.stringify(node.nodes).trim(),
      );
      return false;
    });
    for (let i = 0; i < parsed.nodes.length; i++) {
      const node = parsed.nodes[i];
      if (node.type === 'word' && node.value.toLowerCase() === '@import') {
        const next = parsed.nodes
          .slice(i + 1)
          .find((n) => n.type !== 'space' && n.type !== 'comment');
        if (next?.type === 'string') urls.push(next.value);
      }
    }
  };
  if (kind === 'css') css(source);
  else
    for (const e of elements(parse(source))) {
      for (const name of ['src', 'href', 'poster', 'data-src']) {
        const value = attr(e, name);
        if (value) urls.push(value);
      }
      const srcset = attr(e, 'srcset');
      if (srcset) rewriteSrcset(srcset, url => { urls.push(url); return url; });
      if (e.tagName === 'style') css(textOf(e));
      if (attr(e, 'style')) css(attr(e, 'style')!);
    }
  return urls
    .filter((u) => u && !u.startsWith('#') && !/^(data:|blob:|mailto:|tel:|javascript:)/i.test(u))
    .map((url) => {
      if (/^(https?:)?\/\//.test(url)) return { from, url, external: true };
      let decoded = url.split(/[?#]/)[0];
      try {
        decoded = decodeURIComponent(decoded);
      } catch {}
      return {
        from,
        url,
        path: decoded ? posix.normalize(posix.join(posix.dirname(from), decoded)) : from,
        external: false,
      };
    });
}
export function missingReferences(doc: DeckDocument, extra: Reference[] = []) {
  const files = new Set([...doc.slides.map((s) => s.sourcePath), ...Object.keys(doc.assets)]);
  return [
    ...references('theme.css', Object.values(doc.theme).join(';'), 'css'),
    ...[...doc.slides, ...(doc.componentLibrary ?? []).map((item) => item.source)].flatMap((s) => [
      ...references(s.sourcePath, s.html, 'html'),
      ...references(s.sourcePath, Object.values(s.theme).join(';'), 'css'),
    ]),
    ...(doc.layouts ?? []).flatMap((l) => [
      ...references(l.sourcePath, l.html, 'html'),
      ...references(l.sourcePath, l.css, 'css'),
      ...references(l.sourcePath, Object.values(l.theme).join(';'), 'css'),
    ]),
    ...extra,
  ].filter((r) => !r.external && r.path && !files.has(r.path));
}
