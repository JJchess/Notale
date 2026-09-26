/** What changed between two versions of a page, marked on the newer one. Pure: page sources in,
 * page source out. It compares the files the agent wrote -- not the live page, which the page's own
 * scripts have already rewritten (rendered math, drawn charts). */
export const NEW = "data-live-new";
export const CHANGED = "data-live-changed";
export interface Marked { html: string; added: number; changed: number }
export type Parse = (html: string) => Document;
const parseHtml: Parse = html => new DOMParser().parseFromString(html, "text/html");

/** Not content: never marked, and their changes show up by themselves once the page reloads. */
const SKIP = new Set(["SCRIPT", "STYLE", "LINK", "META", "TEMPLATE", "NOSCRIPT", "TITLE", "BASE"]);
/** Elements are matched by tag and stable id; a class or style change is a change, not a new element. */
const signature = (el: Element) => `${el.tagName}#${el.getAttribute("data-notale-id") ?? el.id ?? ""}`;
const ownText = (el: Element) => [...el.childNodes].filter(node => node.nodeType === 3).map(node => node.textContent ?? "").join("").trim();
const attributes = (el: Element) => [...el.attributes].map(a => `${a.name}=${a.value}`).sort().join("\n");
const children = (el: Element) => [...el.children].filter(child => !SKIP.has(child.tagName));

/** Longest common subsequence of two signature lists, as matched index pairs. */
function align(a: string[], b: string[]): [number, number][] {
  const table = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--)
    table[i]![j] = a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
  const pairs: [number, number][] = [];
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    if (a[i] === b[j]) pairs.push([i++, j++]);
    else if (table[i + 1]![j]! >= table[i]![j + 1]!) i++;
    else j++;
  }
  return pairs;
}

function walk(before: Element, after: Element, count: { added: number; changed: number }) {
  const old = children(before), next = children(after);
  const matched = new Map(align(old.map(signature), next.map(signature)).map(([i, j]) => [j, i]));
  next.forEach((el, j) => {
    const i = matched.get(j);
    if (i === undefined) { el.setAttribute(NEW, ""); count.added++; return; }
    const was = old[i]!;
    if (attributes(was) !== attributes(el) || ownText(was) !== ownText(el)) { el.setAttribute(CHANGED, ""); count.changed++; }
    walk(was, el, count);
  });
}

/** `next` with its new elements marked `data-live-new` (only the outermost of a new subtree) and its
 * changed ones `data-live-changed` (own attributes or own text differ). */
export function markChanges(previous: string, next: string, parse: Parse = parseHtml): Marked {
  const before = parse(previous), after = parse(next), count = { added: 0, changed: 0 };
  walk(before.body, after.body, count);
  const doctype = /^\s*<!doctype[^>]*>/i.exec(next)?.[0] ?? "<!doctype html>";
  return { html: doctype + after.documentElement.outerHTML, ...count };
}
