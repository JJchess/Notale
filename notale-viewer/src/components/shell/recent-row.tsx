"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, LoaderCircle } from "lucide-react";
import { previewUrl } from "../../lib/api";
import type { SessionSummary } from "../../lib/session-protocol";
import { SessionActions, SESSION_MENU_EVENT } from "../library/session-actions";
import { useLocale } from "../locale";
import styles from "./recent-row.module.css";

const PREVIEW_EVENT = "notale-recent-preview-open";
type Anchor = { top: number; left: number };

function HoverPreview({ session, title, anchor }: { session: SessionSummary; title: string; anchor: Anchor }) {
  const [failed, setFailed] = useState(false), [top, setTop] = useState(anchor.top);
  const card = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const height = card.current?.getBoundingClientRect().height ?? 0;
    setTop(Math.max(8, Math.min(anchor.top - height / 2, innerHeight - height - 8)));
  }, [anchor.top, failed]);
  return <div ref={card} className={styles.preview} style={{ top, left: anchor.left }} aria-hidden="true">
    {session.latestCompletedRunId && !failed && <img src={previewUrl(session.latestCompletedRunId, "assets/preview/thumbnails/page-01.png")} alt="" draggable={false} decoding="async" onError={() => setFailed(true)} />}
    <p>{title}</p>
  </div>;
}

export function RecentRow({ session, selected, onNavigate }: { session: SessionSummary; selected: boolean; onNavigate: () => void }) {
  const { t } = useLocale();
  const row = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null), [actionsOpen, setActionsOpen] = useState(false);
  const title = session.title || t("未命名讲义", "Untitled lecture");
  const closePreview = useCallback(() => setAnchor(null), []);
  const actionChanged = useCallback((open: boolean) => { setActionsOpen(open); if (open) setAnchor(null); }, []);
  useEffect(() => {
    const claimed = (event: Event) => { if ((event as CustomEvent<string>).detail !== session.id) closePreview(); };
    window.addEventListener(PREVIEW_EVENT, claimed);
    window.addEventListener(SESSION_MENU_EVENT, closePreview);
    return () => { window.removeEventListener(PREVIEW_EVENT, claimed); window.removeEventListener(SESSION_MENU_EVENT, closePreview); };
  }, [session.id, closePreview]);
  useEffect(() => {
    if (!anchor) return;
    document.addEventListener("scroll", closePreview, true);
    window.addEventListener("resize", closePreview);
    window.addEventListener("blur", closePreview);
    return () => {
      document.removeEventListener("scroll", closePreview, true);
      window.removeEventListener("resize", closePreview);
      window.removeEventListener("blur", closePreview);
    };
  }, [anchor, closePreview]);
  const openPreview = () => {
    if (actionsOpen || !matchMedia("(min-width: 900px) and (hover: hover) and (pointer: fine)").matches || document.querySelector('[data-session-menu-open="true"]')) return;
    const box = row.current?.getBoundingClientRect();
    if (!box || row.current?.closest("[inert]")) return;
    window.dispatchEvent(new CustomEvent(PREVIEW_EVENT, { detail: session.id }));
    setAnchor({ top: box.top + box.height / 2, left: Math.max(8, Math.min(box.right + 24, innerWidth - 224)) });
  };
  return <div ref={row} data-recent-row className={`${styles.row} ${selected ? styles.selected : ""} ${actionsOpen ? styles.actionsOpen : ""}`}
    onPointerEnter={event => { if (event.pointerType !== "touch") openPreview(); }} onPointerLeave={closePreview}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) closePreview(); }}>
    <Link href={`/s/${session.id}`} className={styles.open} aria-current={selected ? "page" : undefined} onFocus={openPreview} onClick={() => { closePreview(); onNavigate(); }}>
      <span className={styles.icon}>{session.busy ? <LoaderCircle size={16} className={styles.spinning} aria-label={t("进行中", "In progress")} /> : <FileText size={16} aria-hidden="true" />}</span>
      <span className={styles.title}>{title}</span>
    </Link>
    <SessionActions session={session} variant="menu" onOpenChange={actionChanged} />
    {anchor && !actionsOpen && createPortal(<HoverPreview key={session.latestCompletedRunId ?? session.id} session={session} title={title} anchor={anchor} />, document.body)}
  </div>;
}
