"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { relativeTime } from "../lib/recent-sessions";

export interface VersionItem { runId: string; version: number; kind: "generate" | "fix"; basedOn?: number; at: string }

/** The versions of a lecture, newest first, and what can be done with the one on screen. One
 * button (`v11 ▾`) rather than a row that grows with every change. */
export function VersionMenu({ versions, shown, onPick, download }: { versions: VersionItem[]; shown: string; onPick: (runId: string) => void; download: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null), button = useRef<HTMLButtonElement>(null);
  const current = versions.find(item => item.runId === shown);
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    // Focus the version on screen, the way a native select opens on its value.
    box.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  const items = () => [...(box.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];
  const onKey = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") { event.preventDefault(); setOpen(false); button.current?.focus(); return; }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const list = items(), at = list.indexOf(document.activeElement as HTMLElement);
    list[(at + (event.key === "ArrowDown" ? 1 : list.length - 1)) % list.length]?.focus();
  };
  const choose = (runId: string) => { onPick(runId); setOpen(false); button.current?.focus(); };
  return (
    <div ref={box} className="version-menu" onKeyDown={onKey}>
      <button ref={button} type="button" className="version-button" aria-haspopup="menu" aria-expanded={open} title="版本与下载" onClick={() => setOpen(value => !value)}>
        <span>v{current?.version ?? "?"}</span>
        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && <div className="version-list" role="menu" aria-label="版本">
        <div className="version-rows">{[...versions].reverse().map(item => (
          <button key={item.runId} type="button" role="menuitemradio" aria-checked={item.runId === shown} onClick={() => choose(item.runId)}>
            <b>v{item.version}</b>
            <span>{item.kind === "generate" ? "生成" : `修改${item.basedOn ? ` · 基于 v${item.basedOn}` : ""}`}</span>
            <time dateTime={item.at}>{relativeTime(item.at)}</time>
            <svg className="version-check" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.2 5 8.6 9.5 3.6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </button>
        ))}</div>
        <hr />
        <a role="menuitem" href={download} download>下载 v{current?.version} · .notale</a>
        <Link role="menuitem" href="/">新会话</Link>
      </div>}
    </div>
  );
}
