import { CHANGED, NEW } from "./page-diff";

/** How one element appears. The effect owns its CSS; the page it is injected into is a draft copy,
 * the lecture's files are never touched. */
export interface RevealEffect {
  /** Injected into the page's head before it first paints (new elements start hidden). */
  readonly css: string;
  /** Hides an element that will be shown later (a descendant of a new element). */
  hide(el: Element): void;
  show(el: Element): void;
}
const HIDDEN = "data-live-hidden";
export const FadeUp: RevealEffect = {
  css: `[${NEW}],[${HIDDEN}]{opacity:0!important;transform:translateY(6px)}`
    + `[data-live-shown]{transition:opacity .22s cubic-bezier(.2,.7,.2,1),transform .22s cubic-bezier(.2,.7,.2,1)}`
    + `@keyframes live-changed{from{outline-color:#9760eecc}to{outline-color:#9760ee00}}`
    + `[${CHANGED}]{outline:2px solid #9760ee00;outline-offset:3px;animation:live-changed .9s ease-out}`,
  hide: el => el.setAttribute(HIDDEN, ""),
  show: el => { el.setAttribute("data-live-shown", ""); el.removeAttribute(NEW); el.removeAttribute(HIDDEN); },
};
/** prefers-reduced-motion: new elements are simply there. */
export const NoMotion: RevealEffect = { css: "", hide: () => {}, show: el => el.removeAttribute(NEW) };

/** Descendants worth showing one by one: blocks, not the spans inside a line of text; nothing inside
 * a drawing (svg, canvas, math), which appears whole. */
const WHOLE = new Set(["SVG", "CANVAS", "MATH", "P", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "TD", "TH", "IMG", "VIDEO", "BUTTON", "INPUT", "LABEL", "SPAN", "A", "B", "STRONG", "EM", "I", "CODE", "PRE", "IFRAME", "SCRIPT", "STYLE"]);
function staggered(el: Element, into: Element[]) {
  for (const child of el.children) {
    if (child.tagName === "SCRIPT" || child.tagName === "STYLE") continue;
    into.push(child);
    if (!WHOLE.has(child.tagName.toUpperCase())) staggered(child, into);
  }
  return into;
}

export interface Clock { wait(ms: number): Promise<void> }
const realClock: Clock = { wait: ms => new Promise(resolve => setTimeout(resolve, ms)) };

/** Shows a page's new elements one after another, in document order: each new subtree first as its
 * outer box, then its blocks. Timing only -- what is new was decided by the diff, how it appears by
 * the effect. At most `budgetMs` per page change (the step shrinks to fit), and `finish()` shows
 * everything left at once, so the screen is never more than one change behind the files. */
export class Revealer {
  private rest: Element[] = [];
  private effect: RevealEffect = NoMotion;
  constructor(private readonly clock: Clock = realClock) {}

  async play(doc: Document, effect: RevealEffect, { budgetMs = 1500, stepMs = 120 } = {}) {
    this.finish();
    const queue: Element[] = [];
    for (const root of doc.querySelectorAll(`[${NEW}]`)) {
      const inner = staggered(root, []);
      inner.forEach(el => effect.hide(el));
      queue.push(root, ...inner);
    }
    this.rest = queue; this.effect = effect;
    const step = queue.length ? Math.min(stepMs, budgetMs / queue.length) : 0;
    while (this.rest === queue && queue.length) {
      effect.show(queue.shift()!);
      if (queue.length) await this.clock.wait(step);
    }
  }
  /** Everything not yet shown, shown now. */
  finish() {
    const left = this.rest;
    this.rest = [];
    for (const el of left) this.effect.show(el);
  }
  get pending() { return this.rest.length; }
}
