/** Pulls an element's text into a point, character by character, along a closing spiral. It flies a
 * copy (split into one span per character) laid over the element and hides the element meanwhile,
 * so markup owned by someone else (React) is never touched; `restore` shows the element again.
 * Knows nothing about what the text is or where the point came from. */
export class Vortex {
  async suck(el: HTMLElement, into: DOMPoint, { duration = 900, turns = 1.4 } = {}) {
    const doc = el.ownerDocument, rect = el.getBoundingClientRect();
    const copy = el.cloneNode(true) as HTMLElement;
    Object.assign(copy.style, { position: "fixed", left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, margin: "0", pointerEvents: "none", zIndex: "10" });
    copy.setAttribute("aria-hidden", "true");
    doc.body.append(copy);
    el.style.visibility = "hidden";
    try {
      // The characters nearest the point go first, so the text looks swallowed from one end.
      const chars = this.split(copy).map(span => ({ span, box: span.getBoundingClientRect() }))
        .sort((a, b) => Math.hypot(a.box.x - into.x, a.box.y - into.y) - Math.hypot(b.box.x - into.x, b.box.y - into.y));
      await Promise.all(chars.map(({ span, box }, index) => {
        const from = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
        const start = Math.atan2(from.y - into.y, from.x - into.x), radius = Math.hypot(from.x - into.x, from.y - into.y);
        const frames: Keyframe[] = [];
        for (let step = 0; step <= 12; step++) {
          const t = step / 12, angle = start + t * turns * 2 * Math.PI, r = radius * (1 - t) ** 1.3;
          const x = into.x + r * Math.cos(angle) - from.x, y = into.y + r * Math.sin(angle) - from.y;
          frames.push({ transform: `translate(${x}px, ${y}px) rotate(${t * 540}deg) scale(${1 - t * 0.9})`, opacity: t < 0.85 ? 1 : (1 - t) / 0.15 });
        }
        return span.animate(frames, { duration, delay: index * 18, easing: "cubic-bezier(.55,0,.8,.5)", fill: "forwards" }).finished;
      }));
    } finally { copy.remove(); }
  }
  /** The element shown again, faded in. */
  restore(el: HTMLElement) {
    if (el.style.visibility !== "hidden") return;
    el.style.visibility = "";
    el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: "ease-out" });
  }
  private split(el: HTMLElement): HTMLElement[] {
    const doc = el.ownerDocument, spans: HTMLElement[] = [], texts: Text[] = [];
    const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) texts.push(node as Text);
    for (const text of texts) {
      const fragment = doc.createDocumentFragment();
      for (const char of text.data) {
        const span = doc.createElement("span");
        span.textContent = char;
        Object.assign(span.style, { display: "inline-block", whiteSpace: "pre" });
        fragment.append(span);
        if (char.trim()) spans.push(span);
      }
      text.replaceWith(fragment);
    }
    return spans;
  }
}
