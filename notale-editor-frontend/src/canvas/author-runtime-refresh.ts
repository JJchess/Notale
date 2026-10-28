import { parse, serialize, type DefaultTreeAdapterTypes } from 'parse5';
import { runtimeIdentity, type Snapshot, type Slide } from '@notale/editor/browser';

type Node = DefaultTreeAdapterTypes.Node;
type Document = Snapshot['document'];

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => [key, stable(item)]));
  return value;
}

/** Normalize parser/serializer differences without turning an appearance edit
 * into a source change. Text in scripts/styles remains executable input. */
function htmlDependencies(html: string, keepStyles = false) {
  const document = parse(html);
  function visit(node: Node): unknown {
    if ('tagName' in node) {
      node.attrs = node.attrs.filter(attr => keepStyles || attr.name !== 'style')
        .sort((a, b) => `${a.namespace ?? ''}:${a.prefix ?? ''}:${a.name}`.localeCompare(`${b.namespace ?? ''}:${b.prefix ?? ''}:${b.name}`));
      const children = ('content' in node ? node.content.childNodes : node.childNodes).map(visit).filter(child => child !== undefined);
      const source = node.tagName === 'script' || node.tagName === 'style'
        ? node.childNodes.filter((child): child is DefaultTreeAdapterTypes.TextNode => 'value' in child).map(child => child.value).join('')
        : undefined;
      return [node.namespaceURI, node.tagName, node.attrs.map(attr => [attr.namespace, attr.prefix, attr.name, attr.value]), source, children];
    }
    if ('childNodes' in node) return node.childNodes.map(visit).filter(child => child !== undefined);
    if ('publicId' in node) return [node.name, node.publicId, node.systemId];
    // Authored text, comments and indentation are already reconciled in place.
    return undefined;
  }
  const structure = visit(document);
  return { structure, html: serialize(document) };
}

function fingerprint(document: Document, slide: Slide): string {
  const html = htmlDependencies(slide.html);
  const layout = document.layouts.find(item => item.id === slide.layoutId);
  const normalizedLayout = layout ? { ...layout, html: htmlDependencies(layout.html, true).html } : undefined;
  const assets = Object.fromEntries(Object.entries(document.assets).sort(([a], [b]) => a.localeCompare(b)));
  const normalizedDocument = { ...document, assets, layouts: normalizedLayout ? [normalizedLayout] : [] };
  const charts = Object.fromEntries(Object.entries(slide.nativeCharts).map(([id, chart]) => [id, {
    source: chart.source, interaction: chart.interaction, engine: !!chart.authoring && !chart.source,
  }]));
  // Inline modules and stylesheet imports can refer to assets that have no
  // script[src]/iframe[src] entry. Keep these conservative dependencies too.
  const executableAssets = Object.entries(assets).filter(([path, asset]) =>
    /\.(?:[cm]?js|css)$/i.test(path) || /(?:javascript|ecmascript|text\/css)/i.test(asset.mime))
    .map(([path, asset]) => [path, asset.hash]);
  return JSON.stringify(stable({
    execution: runtimeIdentity(normalizedDocument, { ...slide, html: html.html }),
    sourcePath: slide.sourcePath, structure: html.structure,
    layoutId: slide.layoutId, layout: normalizedLayout,
    layoutValues: slide.layoutValues, layoutImages: slide.layoutImages,
    charts, canvasInstances: slide.canvasInstances, scenes: slide.scenes,
    executableAssets,
  }));
}

/** Prepared undo describes how to project a change; it does not imply that its
 * compiled runtime changed. Compare confirmed author inputs, never live DOM. */
export function needsAuthorRuntimeRefresh(before: Snapshot, after: Snapshot, pageId: string): boolean {
  if (before.document.id !== after.document.id) return true;
  const previous = before.document.slides.find(slide => slide.id === pageId);
  const next = after.document.slides.find(slide => slide.id === pageId);
  if (!previous || !next) return true;
  try { return fingerprint(before.document, previous) !== fingerprint(after.document, next); }
  catch { return true; }
}

/** Kernel snapshots are immutable. Retain the original confirmed snapshot until
 * the entire transmission succeeds, including a required preview request. A
 * retry may start after the kernel has already accepted the server's revision. */
export class AuthorRuntimeRefreshBaselines {
  private snapshots = new Map<string, Snapshot>();
  private key(documentId: string, mutationId: string) { return JSON.stringify([documentId, mutationId]); }
  capture(snapshot: Snapshot, mutationId: string): Snapshot {
    const key = this.key(snapshot.document.id, mutationId);
    const previous = this.snapshots.get(key);
    if (previous) return previous;
    this.snapshots.set(key, snapshot);
    return snapshot;
  }
  complete(documentId: string, mutationId: string): void { this.snapshots.delete(this.key(documentId, mutationId)); }
  clear(): void { this.snapshots.clear(); }
}
