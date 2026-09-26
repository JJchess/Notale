"use client";

import { useEffect, useRef, useState } from "react";
import { LiveDraft, type PageSource } from "../lib/live/live-draft";
import { PlayerFrame } from "../lib/live/player-frame";

type Frame = { id: number; src: string };
const base = (src: string) => src.split("#")[0];
/** A draft kept live: its player URL, where its pages come from, and where the agent is. */
export interface Live { index: string; draft: PageSource; original: PageSource; page: string; revision: number }

/** A lecture player that never goes blank. The player's shell is black while it loads, so a new
 * lecture (another version, the draft) loads hidden underneath and is swapped in once its page is
 * ready; the same lecture only turns the page (`#/N`, a same-document navigation). While it shows a
 * draft, `live` keeps it current: a changed page is swapped in place and what is new in it appears
 * element by element (LiveDraft). */
export function LecturePane({ src, title, live }: { src: string; title: string; live?: Live }) {
  const [frames, setFrames] = useState<Frame[]>([{ id: 0, src }]);
  const refs = useRef(new Map<number, HTMLIFrameElement>()), next = useRef(1), draft = useRef<LiveDraft | undefined>(undefined);
  const shown = frames[0]!;
  const sources = live && base(shown.src) === base(live.index) ? live : undefined;

  // Another lecture: load it underneath. The same one at another page: only the hash changes.
  useEffect(() => {
    const top = frames.at(-1)!;
    if (top.src === src) return;
    if (base(top.src) === base(src) && frames.length === 1) { setFrames([{ ...top, src }]); return; }
    setFrames(current => [current[0]!, { id: next.current++, src }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);
  // A pending lecture replaces the one on screen once ready (or after 8 s, whatever it shows).
  useEffect(() => {
    if (frames.length < 2) return;
    const pending = frames.at(-1)!, started = Date.now();
    const timer = setInterval(() => {
      const frame = refs.current.get(pending.id);
      if (!(frame && new PlayerFrame(frame).ready()) && Date.now() - started < 8000) return;
      clearInterval(timer);
      draft.current?.settle();
      setFrames(current => current.includes(pending) ? [pending] : current);
    }, 100);
    return () => clearInterval(timer);
  }, [frames]);
  // The draft on screen has a LiveDraft for as long as it is on screen.
  useEffect(() => {
    const frame = refs.current.get(shown.id);
    if (!sources || !frame) return;
    const current = draft.current = new LiveDraft(new PlayerFrame(frame), { draft: sources.draft, original: sources.original });
    return () => { current.dispose(); if (draft.current === current) draft.current = undefined; };
  }, [shown.id, sources?.draft, sources?.original]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (sources) draft.current?.update({ page: sources.page, revision: sources.revision });
  }, [shown.id, sources?.draft, sources?.page, sources?.revision]); // eslint-disable-line react-hooks/exhaustive-deps

  return <>{frames.map((frame, index) => (
    <iframe key={frame.id} ref={node => { if (node) refs.current.set(frame.id, node); else refs.current.delete(frame.id); }}
      src={frame.src} title={title} allowFullScreen className={index ? "is-pending" : undefined} aria-hidden={index ? true : undefined} tabIndex={index ? -1 : undefined} />
  ))}</>;
}
