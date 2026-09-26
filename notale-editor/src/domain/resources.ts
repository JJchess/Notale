import { references, type Reference } from '@notale/format/page';
import type { DeckDocument } from './model.js';
export { references, type Reference } from '@notale/format/page';
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
