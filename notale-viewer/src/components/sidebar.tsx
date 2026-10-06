"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, BookOpen, ChevronDown, CircleHelp, Languages, PanelLeftClose, PanelLeftOpen, Plus, Search, Settings2, X } from "lucide-react";
import { useSessionList } from "../lib/use-session-list";
import { useLocale } from "./locale";
import { QuickSearch } from "./shell/quick-search";
import { RecentRow } from "./shell/recent-row";
import { Dialog } from "./ui/dialog";
import styles from "./shell/shell.module.css";

const KEY = "notale-sidebar-expanded";
const RECENT_KEY = "notale-recent-expanded";

export function Sidebar() {
  const path = usePathname(), { t, locale, setLocale } = useLocale(), catalog = useSessionList();
  const [collapsed, setCollapsed] = useState(false), [drawer, setDrawer] = useState(false);
  const [search, setSearch] = useState(false), [help, setHelp] = useState(false), [settings, setSettings] = useState(false);
  const [mobile, setMobile] = useState(false), [recentOpen, setRecentOpen] = useState(true);
  const nav = useRef<HTMLElement>(null), toggleRef = useRef<HTMLButtonElement>(null), collapseRef = useRef<HTMLButtonElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null), settingsButton = useRef<HTMLButtonElement>(null);
  const hidden = mobile ? !drawer : collapsed;
  const returnToToggle = useCallback(() => requestAnimationFrame(() => toggleRef.current?.focus()), []);
  const closeDrawer = useCallback(() => { setDrawer(false); setSettings(false); returnToToggle(); }, [returnToToggle]);
  const navigate = () => { if (mobile) closeDrawer(); };
  const toggle = useCallback(() => {
    setSettings(false);
    if (mobile) { if (drawer) closeDrawer(); else setDrawer(true); return; }
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(KEY, String(!next)); } catch { /* in-memory preference */ }
    requestAnimationFrame(() => (next ? toggleRef : collapseRef).current?.focus());
  }, [mobile, drawer, collapsed, closeDrawer]);

  useEffect(() => {
    const media = matchMedia("(max-width: 899px)");
    const update = () => { setMobile(media.matches); setDrawer(false); setSettings(false); };
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    try { setCollapsed(localStorage.getItem(KEY) === "false"); setRecentOpen(localStorage.getItem(RECENT_KEY) !== "false"); } catch { /* defaults */ }
  }, []);
  useEffect(() => { setDrawer(false); setSettings(false); }, [path]);
  useEffect(() => {
    const main = document.querySelector<HTMLElement>(".app-main");
    if (main) main.inert = mobile && drawer;
    return () => { if (main) main.inert = false; };
  }, [mobile, drawer]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.isComposing || event.defaultPrevented || !(event.metaKey || event.ctrlKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "k") {
        // Let a rename dialog keep its own focus and editing state.
        if (!search && document.querySelector("dialog[open]")) return;
        event.preventDefault(); setDrawer(false); setSettings(false); setSearch(current => !current);
      }
      if (key === "b") {
        const target = event.target;
        if (document.querySelector("dialog[open]") || target instanceof HTMLElement && target.closest('input,textarea,[contenteditable="true"]')) return;
        event.preventDefault(); toggle();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [toggle, search]);
  useEffect(() => {
    if (!drawer || !mobile) return;
    const el = nav.current;
    el?.querySelector<HTMLElement>("a,button")?.focus();
    const keys = (event: KeyboardEvent) => {
      if (event.defaultPrevented || document.querySelector("dialog[open]")) return;
      if (event.key === "Escape") { event.preventDefault(); closeDrawer(); }
      if (event.key !== "Tab" || !el) return;
      const focusable = [...el.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled])')].filter(node => node.getClientRects().length > 0 && !node.closest("[inert]"));
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keys);
    return () => document.removeEventListener("keydown", keys);
  }, [drawer, mobile, closeDrawer]);
  useEffect(() => {
    if (!settings) return;
    settingsRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !settingsRef.current?.contains(event.target)) setSettings(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [settings]);

  const toggleRecent = () => {
    const next = !recentOpen; setRecentOpen(next);
    try { localStorage.setItem(RECENT_KEY, String(next)); } catch { /* in-memory preference */ }
  };
  const openSearch = () => { setDrawer(false); setSettings(false); setSearch(true); };
  return <>
    <button ref={toggleRef} data-navigation-toggle className={`${styles.iconButton} ${styles.navigationToggle} ${hidden ? styles.toggleVisible : ""}`} tabIndex={hidden ? 0 : -1}
      title={t("展开导航", "Expand navigation")} aria-label={t("展开导航", "Expand navigation")} aria-expanded={!hidden} aria-controls="primary-navigation" onClick={toggle}><PanelLeftOpen size={18} /></button>
    {mobile && drawer && <button className={styles.scrim} aria-label={t("关闭导航", "Close navigation")} tabIndex={-1} onClick={closeDrawer} />}
    <nav id="primary-navigation" ref={nav} inert={hidden} data-navigation-collapsed={!mobile && collapsed ? "true" : undefined}
      className={`${styles.sidebar} ${!mobile && collapsed ? styles.collapsed : ""} ${drawer ? styles.drawer : ""}`} aria-label={t("主导航", "Navigation")}>
      <div className={styles.sidebarInner}>
        <header className={styles.brandRow}>
          <Link href="/" onClick={navigate} aria-label={t("Notale 首页", "Notale home")}><img src="/brand/notale-lockup.svg" alt="Notale" width={116} height={32} /></Link>
          <div className={styles.topActions}>
            <button type="button" className={styles.iconButton} title={t("查找讲义（⌘ / Ctrl K）", "Find a lecture (⌘ / Ctrl K)")} aria-label={t("查找讲义", "Find a lecture")} onClick={openSearch}><Search size={18} /></button>
            <button ref={collapseRef} type="button" className={styles.iconButton} title={mobile ? t("关闭导航", "Close navigation") : t("收起导航（⌘ / Ctrl B）", "Collapse navigation (⌘ / Ctrl B)")} aria-label={mobile ? t("关闭导航", "Close navigation") : t("收起导航", "Collapse navigation")} onClick={toggle}>{mobile ? <X size={18} /> : <PanelLeftClose size={18} />}</button>
          </div>
        </header>
        <div className={styles.primaryNav}>
          <Link href="/" onClick={navigate} className={`${styles.navItem} ${path === "/" ? styles.active : ""}`} aria-current={path === "/" ? "page" : undefined}><Plus size={18} /><span>{t("新建讲义", "New lecture")}</span></Link>
          <Link href="/library" onClick={navigate} className={`${styles.navItem} ${path === "/library" ? styles.active : ""}`} aria-current={path === "/library" ? "page" : undefined}><BookOpen size={18} /><span>{t("我的讲义", "My lectures")}</span></Link>
          <Link href="/archive" onClick={navigate} className={`${styles.navItem} ${path === "/archive" ? styles.active : ""}`} aria-current={path === "/archive" ? "page" : undefined}><Archive size={18} /><span>{t("归档", "Archive")}</span></Link>
        </div>
        <section className={styles.history} aria-label={t("最近讲义", "Recent lectures")}>
          {catalog.items.length > 0 && <button type="button" className={styles.historyHeading} aria-expanded={recentOpen} aria-controls="recent-lectures" onClick={toggleRecent}><span>{t("最近", "Recent")}</span><ChevronDown size={14} className={!recentOpen ? styles.chevronClosed : ""} /></button>}
          <div id="recent-lectures" className={styles.historyList} hidden={!recentOpen}>
            {!hidden && recentOpen && catalog.items.map(item => <RecentRow key={item.id} session={item} selected={path === `/s/${item.id}`} onNavigate={navigate} />)}
            {catalog.hasMore && <button type="button" className={styles.historyMore} disabled={catalog.loading} onClick={() => void catalog.more()}>{catalog.loading ? t("加载中…", "Loading…") : t("加载更多", "Load more")}</button>}
          </div>
          {catalog.error && <button className={styles.historyRetry} title={catalog.error} onClick={() => void catalog.refresh()}>{t("重新读取讲义", "Reload lectures")}</button>}
        </section>
        <footer className={styles.footer}>
          <div ref={settingsRef} className={styles.settings} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setSettings(false); }}>
            <button ref={settingsButton} type="button" className={styles.iconButton} aria-label={t("设置", "Settings")} title={t("设置", "Settings")} aria-haspopup="menu" aria-expanded={settings} aria-controls="navigation-settings" onClick={() => setSettings(value => !value)}><Settings2 size={18} /></button>
            {settings && <div className={styles.settingsMenu} id="navigation-settings" role="menu" aria-label={t("设置", "Settings")} onKeyDown={event => {
              if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setSettings(false); settingsButton.current?.focus(); }
              if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
                event.preventDefault(); const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
                const index = items.indexOf(document.activeElement as HTMLButtonElement);
                items[event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
              }
            }}>
              <button role="menuitem" onClick={() => { setLocale(locale === "en" ? "zh-CN" : "en"); setSettings(false); settingsButton.current?.focus(); }}><Languages size={16} /><span>{t("切换为 English", "切换为简体中文")}</span></button>
              <button role="menuitem" onClick={() => { settingsButton.current?.focus(); setSettings(false); setDrawer(false); setHelp(true); }}><CircleHelp size={16} /><span>{t("键盘快捷键", "Keyboard shortcuts")}</span></button>
            </div>}
          </div>
        </footer>
      </div>
    </nav>
    {search && <QuickSearch onClose={() => setSearch(false)} />}
    <Dialog open={help} title={t("键盘快捷键", "Keyboard shortcuts")} onClose={() => setHelp(false)}><dl className={styles.shortcuts}>
      <div><dt>{t("查找讲义", "Find a lecture")}</dt><dd><kbd>⌘ / Ctrl K</kbd></dd></div>
      <div><dt>{t("展开／收起导航", "Toggle navigation")}</dt><dd><kbd>⌘ / Ctrl B</kbd></dd></div>
      <div><dt>{t("发送消息", "Send a message")}</dt><dd><kbd>Enter</kbd></dd></div>
      <div><dt>{t("换行", "New line")}</dt><dd><kbd>Shift Enter</kbd></dd></div>
      <div><dt>{t("关闭弹窗", "Close dialog")}</dt><dd><kbd>Esc</kbd></dd></div>
      <div><dt>{t("调整分栏（聚焦分隔线）", "Resize split (focus divider)")}</dt><dd><kbd>← →</kbd></dd></div>
    </dl></Dialog>
  </>;
}
