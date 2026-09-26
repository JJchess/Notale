/** The lecture player (notale-ts resources/preview) seen from outside. The only code that knows its
 * inner structure: each page is a `section` holding an `iframe.preview-frame`, the current one is
 * `section.present`, and the player marks it `data-preview-state="ready"` once loaded. If the player
 * changes, this file changes. Works because the player is same-origin (through the viewer's proxy). */
export class PlayerFrame {
  constructor(readonly iframe: HTMLIFrameElement) {}

  private get section() { return this.iframe.contentDocument?.querySelector<HTMLElement>("section.present") ?? undefined; }
  private get page() { return this.section?.querySelector<HTMLIFrameElement>("iframe.preview-frame") ?? undefined; }

  ready() {
    try { return this.section?.dataset.previewState === "ready"; } catch { return false; }
  }
  /** The file shown now, e.g. `page-03.html`. */
  current() { return this.section?.dataset.name; }

  /** Replaces the page on screen with `html` without a blank frame: the new page loads in an unseen
   * iframe on top of the old one, takes the old one's step, and only then becomes visible. Resolves
   * with the new page's document once it shows. `base` is the page's own URL, so its relative links
   * (styles, scripts, images, code lessons) resolve as before. */
  replacePage(html: string, base: string, signal?: AbortSignal): Promise<Document> {
    const old = this.page;
    if (!old?.contentWindow) return Promise.reject(new Error("player not ready"));
    const step = (old.contentWindow as Window & { Deck?: { step?: number } }).Deck?.step;
    const next = old.cloneNode(false) as HTMLIFrameElement;
    next.removeAttribute("src");
    Object.assign(next.style, { position: "absolute", left: "0", top: "0", visibility: "hidden" });
    next.srcdoc = html.replace(/<head([^>]*)>/i, `<head$1><base href="${new URL(base, location.href).href}">`);
    old.after(next);
    return new Promise((resolve, reject) => {
      const drop = () => { next.remove(); reject(new Error("replaced")); };
      signal?.addEventListener("abort", drop, { once: true });
      next.addEventListener("load", async () => {
        try {
          const doc = next.contentDocument!, deck = (next.contentWindow as Window & { Deck?: { stepTo?: (n: number) => void } }).Deck;
          if (typeof step === "number" && deck?.stepTo) deck.stepTo(step);
          await doc.fonts?.ready;
          if (signal?.aborted) return;
          signal?.removeEventListener("abort", drop);
          Object.assign(next.style, { position: "", left: "", top: "", visibility: "" });
          old.remove();
          resolve(doc);
        } catch (cause) { next.remove(); reject(cause); }
      }, { once: true });
    });
  }
  /** Plain reload of the page on screen (the fallback when a live update cannot be made). */
  reloadPage() { this.page?.contentWindow?.location.reload(); }
}
