"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type MouseEvent } from "react";
import { RECENT_EVENT, recentSessions, type RecentSession } from "../lib/recent-sessions";

const KEY = "notale-sidebar-expanded";
const DAY = 86_400_000;

function PanelLeft({ size, stroke }: { size: number; stroke: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18" /></svg>;
}
function MessageSquare({ stroke }: { stroke: number }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
}

/** Today / yesterday / this week / earlier, by the day each session was last touched. */
function groups(list: RecentSession[], now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const label = (at: string) => { const t = Date.parse(at); return t >= today ? "今天" : t >= today - DAY ? "昨天" : t >= today - 6 * DAY ? "本周" : "更早"; };
  const out: { label: string; items: RecentSession[] }[] = [];
  for (const entry of list) { const name = label(entry.at); (out.at(-1)?.label === name ? out.at(-1)!.items : (out.push({ label: name, items: [] }), out.at(-1)!.items)).push(entry); }
  return out;
}

/** A long title slides left on hover to show its end, at about 60px/s (edumanus' hover-scroll text). */
function slide(event: MouseEvent<HTMLElement>) {
  const box = event.currentTarget.querySelector<HTMLElement>(".sidebar-title");
  const track = box?.firstElementChild as HTMLElement | null;
  if (!box || !track) return;
  const overflow = track.scrollWidth - box.clientWidth;
  box.style.setProperty("--slide", overflow > 0 ? `${-(overflow + 20)}px` : "0px");
  box.style.setProperty("--slide-time", `${Math.min(4, Math.max(0.6, (overflow + 20) / 60))}s`);
}

/** New chat and the sessions this browser opened, down the left edge. Collapses to nothing but a
 * floating toggle; the choice is remembered per viewer. Styled after edumanus-frontend's navigation. */
export function Sidebar() {
  const path = usePathname();
  const [expanded, setExpanded] = useState<boolean>();
  const [list, setList] = useState<RecentSession[]>([]);
  // Width animates only on a toggle, not when the saved state is first applied.
  const [animate, setAnimate] = useState(false);
  const narrow = () => typeof window !== "undefined" && window.matchMedia("(max-width: 700px)").matches;
  useEffect(() => {
    let saved: string | null = null;
    try { saved = localStorage.getItem(KEY); } catch { /* no storage: fall back to the width */ }
    setExpanded(saved === null || narrow() ? window.matchMedia("(min-width: 900px)").matches : saved === "true");
    const load = () => setList(recentSessions());
    load();
    window.addEventListener(RECENT_EVENT, load);
    window.addEventListener("storage", load);
    return () => { window.removeEventListener(RECENT_EVENT, load); window.removeEventListener("storage", load); };
  }, []);
  const toggle = (next: boolean) => {
    setAnimate(true);
    setExpanded(next);
    if (!narrow()) try { localStorage.setItem(KEY, String(next)); } catch { /* kept for this page only */ }
  };
  const close = () => { if (narrow()) setExpanded(false); };
  const current = path.startsWith("/s/") ? path.slice(3) : undefined;
  const state = expanded === undefined ? "is-auto" : expanded ? "is-open" : "is-closed";
  useEffect(() => { document.documentElement.dataset.sidebar = state; }, [state]);

  return (
    <nav className={`sidebar ${state}${animate ? " is-ready" : ""}`} aria-label="会话">
      {expanded !== false && <div className="sidebar-inner">
        <header className="sidebar-head">
          <Link href="/" className="brand" aria-label="Notale 首页" onClick={close}><span className="brand-mark">N</span><span className="brand-word">NOTALE</span></Link>
          <button type="button" className="sidebar-collapse" aria-label="收起侧边栏" title="收起侧边栏" onClick={() => toggle(false)}><PanelLeft size={20} stroke={2} /></button>
        </header>
        <div className="sidebar-nav">
          <Link href="/" className={"sidebar-nav-row" + (path === "/" ? " is-active" : "")} aria-current={path === "/" ? "page" : undefined} onClick={close}>
            <span className="sidebar-nav-icon"><MessageSquare stroke={path === "/" ? 2 : 1.75} /></span><span>新对话</span>
          </Link>
        </div>
        <div className="sidebar-history">
          {groups(list).map(group => <section key={group.label} aria-label={group.label}>
            <h2>{group.label}</h2>
            <ul>{group.items.map(entry => <li key={entry.id}>
              <Link href={`/s/${entry.id}`} className={"sidebar-row" + (entry.id === current ? " is-selected" : "")} aria-current={entry.id === current ? "page" : undefined} title={entry.title} onMouseEnter={slide} onClick={close}>
                <span className="sidebar-title"><span>{entry.title}</span></span>
                {entry.busy && <i className="sidebar-busy" aria-label="生成中" />}
              </Link>
            </li>)}</ul>
          </section>)}
        </div>
      </div>}
      {expanded === false && <button type="button" className="sidebar-open" aria-label="展开侧边栏" title="展开侧边栏" onClick={() => toggle(true)}><PanelLeft size={18} stroke={1.75} /></button>}
    </nav>
  );
}
