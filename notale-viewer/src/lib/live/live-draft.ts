import { markChanges } from "./page-diff";
import { PlayerFrame } from "./player-frame";
import { FadeUp, NoMotion, Revealer, type RevealEffect } from "./reveal";

/** Where a page's source comes from. Today: a URL (the draft, or the run being changed). Later, the
 * same interface can hand over a half-written page streamed from the model. */
export interface PageSource {
  page(file: string, signal?: AbortSignal): Promise<string>;
  /** The page's own URL, for resolving its relative links. */
  url(file: string): string;
}
export class UrlSource implements PageSource {
  constructor(private readonly urlOf: (file: string) => string) {}
  url(file: string) { return this.urlOf(file); }
  async page(file: string, signal?: AbortSignal) {
    const response = await fetch(this.urlOf(file), { cache: "no-store", signal });
    if (!response.ok) throw new Error(`${file}: ${response.status}`);
    return response.text();
  }
}

/** The draft, kept live: each time the agent's files change, the page on screen is replaced by the
 * new one (loaded unseen, then swapped in) and what is new in it appears element by element.
 * Composition only -- the diff decides what is new, the frame swaps pages, the revealer times it. */
export class LiveDraft {
  /** The last source seen of each page: what the next change is compared with. */
  private readonly seen = new Map<string, Promise<string>>();
  private readonly revealer = new Revealer();
  private job?: AbortController;
  private revision = 0;

  constructor(
    private readonly frame: PlayerFrame,
    private readonly sources: { draft: PageSource; original: PageSource },
    private readonly effect: RevealEffect = matchMedia("(prefers-reduced-motion: reduce)").matches ? NoMotion : FadeUp,
  ) {}

  /** The agent is on `page`; at `revision` its files last changed. */
  update({ page, revision }: { page: string; revision: number }) {
    // Before anything changes, remember this page as it was (the draft starts as the original).
    if (!this.seen.has(page)) this.seen.set(page, this.sources.original.page(page).catch(() => ""));
    if (revision <= this.revision) return;
    this.revision = revision;
    // Never queue: what is still appearing appears now, and a fetch for an older change is dropped.
    this.settle();
    const job = this.job = new AbortController();
    void this.show(page, job.signal).catch(() => { if (!job.signal.aborted) this.frame.reloadPage(); });
  }
  private async show(page: string, signal: AbortSignal) {
    const next = await this.sources.draft.page(page, signal);
    const previous = await this.seen.get(page)!;
    this.seen.set(page, Promise.resolve(next));
    // Only the page on screen can be replaced live; another page will load fresh when turned to.
    if (this.frame.current() !== page) return;
    const marked = markChanges(previous, next);
    const html = marked.html.replace(/<\/head>/i, `<style data-live>${this.effect.css}</style></head>`);
    const doc = await this.frame.replacePage(html, this.sources.draft.url(page), signal);
    if (!signal.aborted) await this.revealer.play(doc, this.effect);
  }
  /** Shows whatever is still appearing, at once (before a new version takes over). */
  settle() { this.job?.abort(); this.revealer.finish(); }
  dispose() { this.settle(); }
}
