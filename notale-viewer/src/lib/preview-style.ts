/** Skin existing preview documents without rewriting saved lectures. Each frame owns
 * its listeners, including lazily loaded pages and LiveDraft's srcdoc replacements. */
export function stylePreviewFrame(frame: HTMLIFrameElement): () => void {
  const stylesheet = new URL("/scrollbars.css", window.location.href).href;
  let document: Document | null = null;
  let observer: MutationObserver | undefined;
  let link: HTMLLinkElement | undefined;
  const children = new Map<HTMLIFrameElement, () => void>();
  const clear = () => {
    observer?.disconnect();
    observer = undefined;
    children.forEach(dispose => dispose());
    children.clear();
    link?.remove();
    link = undefined;
    document?.documentElement.removeAttribute("data-notale-preview");
    document = null;
  };
  const scan = () => {
    if (!document) return;
    for (const [child, dispose] of children) {
      if (!document.contains(child)) { dispose(); children.delete(child); }
    }
    document.querySelectorAll("iframe").forEach(child => {
      if (!children.has(child)) children.set(child, stylePreviewFrame(child));
    });
  };
  const load = () => {
    let next: Document | null;
    try { next = frame.contentDocument; } catch { next = null; }
    if (next === document) return;
    clear();
    if (!next?.documentElement) return;
    document = next;
    document.documentElement.setAttribute("data-notale-preview", "");
    link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = stylesheet;
    (document.head ?? document.documentElement).append(link);
    scan();
    observer = new MutationObserver(records => {
      // Ignore text-only updates and unrelated DOM changes in live lectures.
      if (records.some(record => [...record.addedNodes, ...record.removedNodes].some(node =>
        node.nodeType === 1 && ((node as Element).matches("iframe") || (node as Element).querySelector("iframe"))
      ))) scan();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  };
  frame.addEventListener("load", load);
  load();
  return () => { frame.removeEventListener("load", load); clear(); };
}
