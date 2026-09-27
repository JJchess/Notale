"use client";

import { useEffect, useRef, useState } from "react";

/** One thumbnail loads at a time: each is a real page with its own scripts. */
let queue: Promise<void> = Promise.resolve();
const enqueue = (task: () => Promise<void>) => { queue = queue.then(task, task); };

/** A finished page, drawn small: the page itself in an iframe at 0.08 (1600×900 → 128×72), loaded
 * only once scrolled into view and one at a time. Its code workbenches are emptied while it parses,
 * so a thumbnail never starts Python. Unfinished pages are an empty frame. */
export function PageThumb({ src }: { src?: string }) {
  const box = useRef<HTMLSpanElement>(null), frame = useRef<HTMLIFrameElement>(null), loaded = useRef<() => void>(undefined);
  const [load, setLoad] = useState(false), [shown, setShown] = useState(false);
  useEffect(() => {
    const node = box.current;
    if (!src || !node) return;
    let cancelled = false;
    const seen = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      seen.disconnect();
      enqueue(() => new Promise<void>(done => {
        if (cancelled) return done();
        // Done when it has loaded, or after 8 s either way, so one slow page never holds the queue.
        const timer = setTimeout(() => done(), 8000);
        loaded.current = () => { clearTimeout(timer); done(); };
        setLoad(true);
      }));
    }, { rootMargin: "120px" });
    seen.observe(node);
    return () => { cancelled = true; seen.disconnect(); loaded.current?.(); };
  }, [src]);
  // Nested frames (code workbenches) are emptied as the page is parsed, before they can start
  // Python: waiting for `load` would be too late, since `load` waits for them.
  useEffect(() => {
    if (!load) return;
    const timer = setInterval(() => {
      try {
        const doc = frame.current?.contentDocument;
        doc?.querySelectorAll("iframe").forEach(inner => { if (inner.getAttribute("src") !== "about:blank") { inner.removeAttribute("srcdoc"); inner.src = "about:blank"; } });
        if (doc?.readyState === "complete") clearInterval(timer);
      } catch { clearInterval(timer); }
    }, 20);
    return () => clearInterval(timer);
  }, [load]);
  // Grey until it has drawn: an empty white frame reads as a broken page.
  return <span ref={box} className={"page-thumb" + (src && shown ? "" : " is-empty")} aria-hidden="true">
    {src && load && <iframe ref={frame} src={src} tabIndex={-1} title="" onLoad={() => { setShown(true); loaded.current?.(); }} />}
  </span>;
}
