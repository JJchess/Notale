"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { readingIntent } from "./reading-intent";

export function useReadingFollow(contentKey: unknown) {
  const log = useRef<HTMLDivElement>(null), content = useRef<HTMLDivElement>(null);
  const following = useRef(true), lastTop = useRef(0), selectionHeld = useRef(false);
  const [paused, setPaused] = useState(false);
  const setIntent = useCallback((next: boolean) => { following.current = next; setPaused(!next); }, []);
  const pin = useCallback(() => {
    const node = log.current;
    if (!node?.clientHeight || !following.current || selectionHeld.current) return;
    node.scrollTop = node.scrollHeight;
    lastTop.current = node.scrollTop;
  }, []);
  const latest = useCallback(() => { setIntent(true); pin(); }, [setIntent, pin]);
  useLayoutEffect(() => { pin(); }, [contentKey, pin]);
  useEffect(() => {
    const node = log.current, body = content.current;
    if (!node || !body) return;
    const pause = () => setIntent(readingIntent(following.current, { kind: "away" }));
    const scroll = () => {
      if (!node.clientHeight) return;
      const movedUp = node.scrollTop < lastTop.current - 1;
      setIntent(readingIntent(following.current, { kind: "scroll", atBottom: node.scrollHeight - node.scrollTop - node.clientHeight < 6, movedUp }));
      lastTop.current = node.scrollTop;
    };
    const wheel = (event: WheelEvent) => { if (event.deltaY < 0) pause(); };
    let touchY = 0;
    const touchstart = (event: TouchEvent) => { touchY = event.touches[0]?.clientY ?? 0; };
    const touchmove = (event: TouchEvent) => { const next = event.touches[0]?.clientY ?? touchY; if (next > touchY + 2) pause(); touchY = next; };
    const key = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest("input,textarea,[contenteditable]")) return;
      if (["ArrowUp", "PageUp", "Home"].includes(event.key) || event.key === " " && event.shiftKey) pause();
    };
    const selection = () => {
      const selected = document.getSelection();
      selectionHeld.current = !!selected && !selected.isCollapsed && !!selected.anchorNode && node.contains(selected.anchorNode);
      if (!selectionHeld.current) pin();
    };
    node.addEventListener("scroll", scroll, { passive: true });
    node.addEventListener("wheel", wheel, { passive: true });
    node.addEventListener("touchstart", touchstart, { passive: true });
    node.addEventListener("touchmove", touchmove, { passive: true });
    node.addEventListener("keydown", key);
    document.addEventListener("selectionchange", selection);
    const observer = new ResizeObserver(pin); observer.observe(body); observer.observe(node);
    pin();
    return () => {
      observer.disconnect(); node.removeEventListener("scroll", scroll); node.removeEventListener("wheel", wheel);
      node.removeEventListener("touchstart", touchstart); node.removeEventListener("touchmove", touchmove); node.removeEventListener("keydown", key);
      document.removeEventListener("selectionchange", selection);
    };
  }, [pin, setIntent]);
  return { log, content, paused, latest };
}
