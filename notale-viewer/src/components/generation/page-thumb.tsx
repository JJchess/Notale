"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import styles from "./generation.module.css";

let queue: Promise<void> = Promise.resolve();
const enqueue = (task: () => Promise<void>) => { queue = queue.then(task, task); };
/** Existing assembly snapshots share the page's preview route and need no live JavaScript. */
const snapshotOf = (src?: string) => src?.replace(/\/(page-[^/?#]+)\.html(?:[?#].*)?$/, "/assets/preview/thumbnails/$1.png");

/** Only nearby thumbnails are mounted. The selected page stays warm; leaving the viewport
 * releases iframe runtimes instead of accumulating every page visited during a long scroll. */
export function PageThumb({ src, active = false }: { src?: string; active?: boolean }) {
  const box = useRef<HTMLSpanElement>(null), frame = useRef<HTMLIFrameElement>(null);
  const [near, setNear] = useState(false), [scale, setScale] = useState(.055);
  const [missingSnapshot, setMissingSnapshot] = useState<string>(), [imageShown, setImageShown] = useState<string>();
  const [frameSource, setFrameSource] = useState<string>(), [frameShown, setFrameShown] = useState<string>();
  const loaded = useRef<(() => void) | undefined>(undefined);
  const mountedSource = useRef<string | undefined>(undefined);
  const wanted = active || near;
  const candidate = snapshotOf(src), snapshot = candidate !== src ? candidate : undefined;
  const fallback = !snapshot || missingSnapshot === src;

  useEffect(() => {
    const node = box.current; if (!node) return;
    const resize = new ResizeObserver(() => setScale(node.clientWidth / 1600));
    resize.observe(node);
    const root = node.closest("[data-page-rail]");
    const seen = new IntersectionObserver(([entry]) => setNear(!!entry?.isIntersecting), { root, rootMargin: "96px" });
    seen.observe(node);
    return () => { resize.disconnect(); seen.disconnect(); };
  }, []);
  useEffect(() => {
    if (!wanted) { setMissingSnapshot(undefined); setImageShown(undefined); }
  }, [wanted]);
  useEffect(() => {
    if (!src || !wanted || !fallback) {
      mountedSource.current = undefined;
      setFrameSource(undefined); setFrameShown(undefined);
      return;
    }
    // Selecting another visible page changes priority, not the iframe's document.
    // Keep its load state: React can batch clear + same-source updates without remounting it.
    if (mountedSource.current === src) return;
    let cancelled = false;
    const mount = () => new Promise<void>(done => {
      if (cancelled) { done(); return; }
      const timer = setTimeout(done, 8000);
      loaded.current = () => { clearTimeout(timer); done(); };
      mountedSource.current = src;
      setFrameShown(undefined); setFrameSource(src);
    });
    // The active thumbnail never waits behind a slow offscreen request.
    if (active) void mount(); else enqueue(mount);
    return () => { cancelled = true; loaded.current?.(); loaded.current = undefined; };
  }, [src, wanted, fallback, active]);
  useEffect(() => {
    if (!frameSource) return;
    const timer = setInterval(() => {
      try {
        const doc = frame.current?.contentDocument;
        doc?.querySelectorAll("iframe").forEach(inner => {
          if (inner.hasAttribute("srcdoc")) inner.removeAttribute("srcdoc");
          if (inner.getAttribute("src") !== "about:blank") inner.src = "about:blank";
        });
        if (doc?.readyState === "complete") clearInterval(timer);
      } catch { clearInterval(timer); }
    }, 20);
    return () => clearInterval(timer);
  }, [frameSource]);
  const shown = !!src && wanted && (fallback ? frameShown === src : imageShown === src);
  return <span ref={box} data-thumbnail className={`page-thumb ${styles.thumb}${shown ? "" : ` ${styles.empty}`}`} style={{ "--thumb-scale": scale } as CSSProperties} aria-hidden="true">
    {src && wanted && !fallback && <img src={snapshot} alt="" draggable={false} onLoad={() => setImageShown(src)} onError={() => setMissingSnapshot(src)} />}
    {src && wanted && fallback && frameSource === src && <iframe key={src} ref={frame} src={src} tabIndex={-1} title="" onLoad={() => { setFrameShown(src); loaded.current?.(); }} />}
  </span>;
}
