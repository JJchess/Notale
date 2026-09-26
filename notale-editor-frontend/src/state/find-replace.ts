import type { Command, DeckDocument } from "@notale/editor/browser";
export interface FindHit {
  slideId: string;
  slideName: string;
  target: string;
  text: string;
  html?: string;
}
export interface FindResult {
  documentId: string;
  query: string;
  sensitive: boolean;
  hits: FindHit[];
  pages: Record<string, string>;
}
const INLINE = new Set([
  "A",
  "B",
  "BR",
  "CODE",
  "EM",
  "FONT",
  "I",
  "MARK",
  "S",
  "SMALL",
  "SPAN",
  "STRIKE",
  "STRONG",
  "SUB",
  "SUP",
  "U",
  "WBR",
]);
function searchableText(
  html: string,
): Omit<FindHit, "slideId" | "slideName">[] {
  const parsed = new DOMParser().parseFromString(html, "text/html"),
    covered = new Set<Element>(),
    hits: Omit<FindHit, "slideId" | "slideName">[] = [];
  for (const node of parsed.querySelectorAll<HTMLElement>("[data-notale-id]")) {
    if (
      covered.has(node) ||
      node.querySelector("[data-notale-code],[data-notale-tex]") ||
      Array.from(node.querySelectorAll("*")).some(
        (child) => !INLINE.has(child.tagName),
      ) ||
      node.id === "stage" ||
      node.closest("script,style,template,[data-notale-code],[data-notale-tex]")
    )
      continue;
    const text = node.textContent ?? "";
    if (!text.trim()) continue;
    for (const child of node.querySelectorAll("[data-notale-id]"))
      covered.add(child);
    hits.push({
      target: node.dataset.notaleId!,
      text,
      ...(node.children.length ? { html: node.innerHTML } : {}),
    });
  }
  return hits;
}
/** Per-editor plain-data index. Retains no DOM nodes and never substitutes for save baselines. */
export class TextSearchIndex {
  private documentId = "";
  private pages = new Map<
    string,
    { html: string; hits: ReturnType<typeof searchableText> }
  >();
  clear() {
    this.documentId = "";
    this.pages.clear();
  }
  find(doc: DeckDocument, query: string, sensitive: boolean): FindResult {
    if (this.documentId !== doc.id) {
      this.clear();
      this.documentId = doc.id;
    }
    const ids = new Set(doc.slides.map((slide) => slide.id));
    for (const id of this.pages.keys()) if (!ids.has(id)) this.pages.delete(id);
    const result: FindResult = {
      documentId: doc.id,
      query,
      sensitive,
      hits: [],
      pages: {},
    };
    if (!query) return result;
    const needle = sensitive ? query : query.toLocaleLowerCase();
    for (const slide of doc.slides) {
      let entry = this.pages.get(slide.id);
      if (!entry || entry.html !== slide.html) {
        entry = { html: slide.html, hits: searchableText(slide.html) };
        this.pages.set(slide.id, entry);
      }
      // Touch queried pages; extremely large decks remain bounded.
      this.pages.delete(slide.id);
      this.pages.set(slide.id, entry);
      while (this.pages.size > 128)
        this.pages.delete(this.pages.keys().next().value!);
      for (const hit of entry.hits) {
        if (
          !(sensitive ? hit.text : hit.text.toLocaleLowerCase()).includes(
            needle,
          )
        )
          continue;
        result.hits.push({ ...hit, slideId: slide.id, slideName: slide.name });
        result.pages[slide.id] = slide.html;
      }
    }
    return result;
  }
}
export function findText(
  doc: DeckDocument,
  query: string,
  sensitive: boolean,
): FindResult {
  return new TextSearchIndex().find(doc, query, sensitive);
}
export function replacementCommands(
  doc: DeckDocument,
  result: FindResult,
  replacement: string,
): Command[] {
  if (doc.id !== result.documentId) throw Error("讲义已切换，请重新查找");
  for (const [id, html] of Object.entries(result.pages))
    if (doc.slides.find((s) => s.id === id)?.html !== html)
      throw Error("匹配页面已变化，请重新查找后替换");
  if (!result.query) return [];
  const pattern = new RegExp(
    result.query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    result.sensitive ? "g" : "gi",
  );
  return result.hits.map((hit) => ({
    type: "element.patch",
    slideId: hit.slideId,
    target: hit.target,
    patch:
      hit.html === undefined
        ? { text: hit.text.replace(pattern, () => replacement) }
        : { richText: replaceRichText(hit.html, pattern, replacement) },
  }));
}

/** Replace matching text slices backwards; replacement inherits the first slice's format. */
function replaceRichText(
  html: string,
  pattern: RegExp,
  replacement: string,
): string {
  const doc = new DOMParser().parseFromString(
    "<!doctype html><html><body></body></html>",
    "text/html",
  );
  const fragment = doc.createElement("template");
  fragment.innerHTML = html;
  const walker = doc.createTreeWalker(fragment.content, 4),
    nodes: { node: Text; start: number; end: number }[] = [];
  let next: Node | null,
    offset = 0;
  while ((next = walker.nextNode())) {
    const node = next as Text;
    nodes.push({ node, start: offset, end: offset + node.data.length });
    offset += node.data.length;
  }
  const text = nodes.map((entry) => entry.node.data).join("");
  for (const match of [...text.matchAll(pattern)].reverse()) {
    const from = match.index!,
      to = from + match[0].length;
    for (const entry of nodes) {
      if (entry.end <= from || entry.start >= to) continue;
      const start = Math.max(0, from - entry.start),
        end = Math.min(entry.end - entry.start, to - entry.start);
      entry.node.data =
        entry.node.data.slice(0, start) +
        (from >= entry.start ? replacement : "") +
        entry.node.data.slice(end);
    }
  }
  return fragment.innerHTML;
}
