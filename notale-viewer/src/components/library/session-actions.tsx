"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Archive, ArchiveRestore, EllipsisVertical, Pencil } from "lucide-react";
import type { SessionSummary } from "../../lib/session-protocol";
import { updateSession } from "../../lib/session-api";
import { useLocale } from "../locale";
import { Dialog } from "../ui/dialog";
import styles from "./library.module.css";
import menuStyles from "./session-actions.module.css";

export const SESSION_MENU_EVENT = "notale-session-menu-open";

export function SessionActions({ session, variant = "inline", onOpenChange }: {
  session: SessionSummary;
  variant?: "inline" | "menu";
  onOpenChange?: (open: boolean) => void;
}) {
  const { t } = useLocale();
  const [rename, setRename] = useState(false), [title, setTitle] = useState(session.title), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const closeMenu = useCallback((restoreFocus = false) => {
    setMenuOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }, []);
  useEffect(() => { onOpenChange?.(menuOpen || rename); }, [menuOpen, rename, onOpenChange]);
  useEffect(() => {
    const opened = (event: Event) => { if ((event as CustomEvent<string>).detail !== menuId) closeMenu(); };
    window.addEventListener(SESSION_MENU_EVENT, opened);
    return () => window.removeEventListener(SESSION_MENU_EVENT, opened);
  }, [menuId, closeMenu]);
  useLayoutEffect(() => {
    if (!menuOpen || !menu.current || !trigger.current) return;
    const panel = menu.current;
    // The top layer escapes the independently scrolling recent list while the
    // menu stays inside navigation for the mobile drawer's focus constraint.
    if (typeof panel.showPopover === "function" && !panel.matches(":popover-open")) panel.showPopover();
    const row = root.current?.closest("[data-recent-row]")?.getBoundingClientRect();
    const button = trigger.current.getBoundingClientRect();
    const box = panel.getBoundingClientRect();
    const desktop = matchMedia("(min-width: 900px)").matches;
    panel.style.left = `${Math.max(8, Math.min(desktop && row ? row.right + 24 : button.right - box.width, innerWidth - box.width - 8))}px`;
    panel.style.top = `${Math.max(8, Math.min(desktop && row ? row.top + row.height / 2 - box.height / 2 : button.bottom + 6, innerHeight - box.height - 8))}px`;
    if (!error) panel.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [menuOpen, error]);
  useEffect(() => {
    if (!menuOpen) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) closeMenu(); };
    const moved = (event: Event) => { if (!menu.current?.contains(event.target as Node)) closeMenu(); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("scroll", moved, true);
    window.addEventListener("resize", moved);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("scroll", moved, true);
      window.removeEventListener("resize", moved);
    };
  }, [menuOpen, closeMenu]);
  const apply = async (patch: { title?: string; archived?: boolean }) => {
    setBusy(true); setError("");
    try {
      await updateSession(session.id, patch);
      if (variant === "menu" && patch.archived !== undefined && root.current?.contains(document.activeElement)) {
        const row = root.current.closest("[data-recent-row]");
        const next = row?.nextElementSibling?.querySelector<HTMLElement>("a[href]") ?? row?.previousElementSibling?.querySelector<HTMLElement>("a[href]") ?? root.current.closest("nav")?.querySelector<HTMLElement>('[aria-controls="recent-lectures"]');
        next?.focus();
      }
      setRename(false); closeMenu();
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : t("更新失败", "Update failed")); }
    finally { setBusy(false); }
  };
  const beginRename = () => {
    // Return focus before showModal captures its return target: the menu item
    // itself is about to unmount, while the three-dot trigger remains valid.
    if (variant === "menu") trigger.current?.focus();
    setMenuOpen(false); setTitle(session.title); setError(""); setRename(true);
  };
  const archiveLabel = session.archived ? t("恢复", "Restore") : t("归档", "Archive");
  return <div ref={root} className={variant === "menu" ? menuStyles.actions : styles.actions} data-session-actions={variant} data-session-menu-open={menuOpen || rename ? "true" : undefined}>
    {variant === "inline" ? <>
    <button type="button" className="icon-button" aria-label={t("重命名", "Rename")} title={t("重命名", "Rename")} onClick={beginRename}><Pencil size={15} /></button>
    <button type="button" className="icon-button" disabled={busy || (!session.archived && session.busy)} aria-label={session.archived ? t("恢复", "Restore") : t("归档", "Archive")}
      title={!session.archived && session.busy ? t("任务结束后可归档", "Archive after the task finishes") : session.archived ? t("恢复", "Restore") : t("归档", "Archive")} onClick={() => void apply({ archived: !session.archived })}>
      {session.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
    </button>
    {error && !rename && <span className={styles.actionError} role="alert">{error}</span>}
    </> : <>
      <button ref={trigger} type="button" className={menuStyles.trigger} aria-label={t("讲义操作", "Lecture actions")} title={t("讲义操作", "Lecture actions")} aria-haspopup="menu" aria-expanded={menuOpen} aria-controls={menuOpen ? menuId : undefined}
        onClick={event => {
          event.stopPropagation();
          if (menuOpen) closeMenu(true);
          else { window.dispatchEvent(new CustomEvent(SESSION_MENU_EVENT, { detail: menuId })); setError(""); setMenuOpen(true); }
        }}><EllipsisVertical size={16} /></button>
      {menuOpen && <div ref={menu} id={menuId} popover="manual" role="menu" aria-label={t("讲义操作", "Lecture actions")} className={menuStyles.menu}
        onClick={event => event.stopPropagation()} onKeyDown={event => {
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeMenu(true); return; }
          if (event.key === "Tab") {
            const nav = root.current?.closest("nav");
            const stops = [...(nav?.querySelectorAll<HTMLElement>('a[href],button:not(:disabled)') ?? [])].filter(node => !menu.current?.contains(node) && node.getClientRects().length > 0);
            const index = stops.indexOf(trigger.current!);
            const next = event.shiftKey ? trigger.current : stops[index + 1] ?? stops[0];
            if (next) { event.preventDefault(); event.stopPropagation(); closeMenu(); next.focus(); }
            return;
          }
          if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
          event.preventDefault(); event.stopPropagation();
          const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
          const current = items.indexOf(document.activeElement as HTMLButtonElement);
          const index = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
          items[index]?.focus();
        }}>
        <button type="button" role="menuitem" disabled={busy} onClick={beginRename}><Pencil size={14} /><span>{t("重命名", "Rename")}</span></button>
        <button type="button" role="menuitem" disabled={busy || (!session.archived && session.busy)} title={!session.archived && session.busy ? t("任务结束后可归档", "Archive after the task finishes") : undefined} onClick={() => void apply({ archived: !session.archived })}>
          {session.archived ? <ArchiveRestore size={14} /> : <Archive size={14} />}<span>{archiveLabel}</span>
        </button>
        {error && <p className={menuStyles.error} role="alert">{error}</p>}
      </div>}
    </>}
    <Dialog open={rename} onClose={() => { if (!busy) setRename(false); }} title={t("重命名讲义", "Rename lecture")}>
      <form onSubmit={event => { event.preventDefault(); if (title.trim()) void apply({ title: title.trim() }); }}>
        <label htmlFor={`${menuId}-title`}>{t("标题", "Title")}</label>
        <input id={`${menuId}-title`} data-autofocus maxLength={300} value={title} onChange={event => setTitle(event.target.value)} onFocus={event => event.target.select()} />
        {error && <p role="alert">{error}</p>}
        <footer><button type="button" className="secondary-button" disabled={busy} onClick={() => setRename(false)}>{t("取消", "Cancel")}</button><button className="primary-button" disabled={busy || !title.trim()}>{busy ? t("保存中…", "Saving…") : t("保存", "Save")}</button></footer>
      </form>
    </Dialog>
  </div>;
}
