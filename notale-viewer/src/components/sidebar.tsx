"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Archive, BookOpen, CircleHelp, Languages, LoaderCircle, PanelLeftClose, PanelLeftOpen, Plus, Search, X } from "lucide-react";
import { useSessionList } from "../lib/use-session-list";
import { useLocale } from "./locale";
import { QuickSearch } from "./shell/quick-search";
import { Dialog } from "./ui/dialog";
import styles from "./shell/shell.module.css";

const KEY = "notale-sidebar-expanded";
export function Sidebar() {
  const path = usePathname(), { t, locale, setLocale } = useLocale(), catalog = useSessionList();
  const [collapsed, setCollapsed] = useState(false), [drawer, setDrawer] = useState(false), [search, setSearch] = useState(false), [help, setHelp] = useState(false);
  const [mobile, setMobile] = useState(false);
  useEffect(() => { const media = matchMedia("(max-width: 899px)"); const update = () => setMobile(media.matches); update(); media.addEventListener("change", update); return () => media.removeEventListener("change", update); }, []);
  useEffect(() => { const main = document.querySelector<HTMLElement>(".app-main"); if (main) main.inert = mobile && drawer; return () => { if (main) main.inert = false; }; }, [mobile, drawer]);
  const nav = useRef<HTMLElement>(null), toggleRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { try { setCollapsed(localStorage.getItem(KEY) === "false"); } catch { /* default */ } }, []);
  useEffect(() => { setDrawer(false); }, [path]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setDrawer(false); setSearch(current => !current); }
    };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    if (!drawer || !mobile) return;
    const el = nav.current;
    el?.querySelector<HTMLElement>("a,button")?.focus();
    const keys = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setDrawer(false); toggleRef.current?.focus(); }
      if (event.key !== "Tab" || !el) return;
      const focusable = [...el.querySelectorAll<HTMLElement>('a[href],button:not([disabled])')].filter(node => node.offsetParent !== null);
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keys); return () => document.removeEventListener("keydown", keys);
  }, [drawer, mobile]);
  const toggle = () => { const next = !collapsed; setCollapsed(next); try { localStorage.setItem(KEY, String(!next)); } catch { /* in-memory preference */ } };
  const title = (value: string) => value || t("未命名讲义", "Untitled lecture");
  return <>
    <button ref={toggleRef} data-navigation-toggle className={styles.mobileToggle} title={t("打开导航", "Open navigation")} aria-label={t("打开导航", "Open navigation")} aria-expanded={drawer} aria-controls="primary-navigation" onClick={() => setDrawer(true)}><PanelLeftOpen size={20} /></button>
    {drawer && <button className={styles.scrim} aria-label={t("关闭导航", "Close navigation")} tabIndex={-1} onClick={() => { setDrawer(false); toggleRef.current?.focus(); }} />}
    <nav id="primary-navigation" ref={nav} inert={mobile && !drawer} className={`${styles.sidebar} ${collapsed ? styles.collapsed : ""} ${drawer ? styles.drawer : ""}`} aria-label={t("主导航", "Navigation")}>
      <header className={styles.brandRow}>
        <Link href="/" aria-label={t("Notale 首页", "Notale home")}><img src={collapsed && !drawer ? "/brand/notale-mark.svg" : "/brand/notale-lockup.svg"} alt="Notale" width={collapsed && !drawer ? 30 : 116} height={32} /></Link>
        <button type="button" className={`${styles.collapseButton} icon-button`} title={t("收起导航", "Collapse navigation")} aria-label={t("收起导航", "Collapse navigation")} onClick={toggle}><PanelLeftClose size={17} /></button>
        <button type="button" className={`${styles.drawerClose} icon-button`} aria-label={t("关闭导航", "Close navigation")} onClick={() => { setDrawer(false); toggleRef.current?.focus(); }}><X size={19} /></button>
      </header>
      <div className={styles.primaryNav}>
        <Link href="/" className={`${styles.navItem} ${styles.create} ${path === "/" ? styles.active : ""}`} title={t("新建讲义", "New lecture")} aria-label={t("新建讲义", "New lecture")} aria-current={path === "/" ? "page" : undefined}><Plus size={19} /><span>{t("新建讲义", "New lecture")}</span></Link>
        <button type="button" className={styles.navItem} title={t("查找讲义", "Find a lecture")} aria-label={t("查找讲义", "Find a lecture")} onClick={() => { setDrawer(false); setSearch(true); }}><Search size={18} /><span>{t("查找", "Search")}</span><kbd>⌘ K</kbd></button>
        <Link href="/library" className={`${styles.navItem} ${path === "/library" ? styles.active : ""}`} title={t("我的讲义", "My lectures")} aria-label={t("我的讲义", "My lectures")} aria-current={path === "/library" ? "page" : undefined}><BookOpen size={18} /><span>{t("我的讲义", "My lectures")}</span></Link>
        <Link href="/archive" className={`${styles.navItem} ${path === "/archive" ? styles.active : ""}`} title={t("归档", "Archive")} aria-label={t("归档", "Archive")} aria-current={path === "/archive" ? "page" : undefined}><Archive size={18} /><span>{t("归档", "Archive")}</span></Link>
      </div>
      <div className={styles.history}>
        {catalog.items.length > 0 && <h2>{t("最近", "Recent")}</h2>}
        {catalog.items.slice(0, 20).map(item => <Link key={item.id} href={`/s/${item.id}`} title={title(item.title)} aria-current={path === `/s/${item.id}` ? "page" : undefined} className={`${styles.historyItem} ${path === `/s/${item.id}` ? styles.selected : ""}`}><span>{title(item.title)}</span>{item.busy && <LoaderCircle className={styles.spinning} size={13} aria-label={t("进行中", "In progress")} />}</Link>)}
        {catalog.error && <button className={styles.historyRetry} title={catalog.error} onClick={() => void catalog.refresh()}>{t("重新读取讲义", "Reload lectures")}</button>}
      </div>
      <footer className={styles.footer}>
        <button className={styles.navItem} title={t("切换为英文", "Switch to Chinese")} aria-label={t("切换为英文", "Switch to Chinese")} onClick={() => setLocale(locale === "en" ? "zh-CN" : "en")}><Languages size={18} /><span>{locale === "en" ? "English" : "简体中文"}</span></button>
        <button className={styles.navItem} title={t("键盘快捷键", "Keyboard shortcuts")} aria-label={t("键盘快捷键", "Keyboard shortcuts")} onClick={() => { setDrawer(false); setHelp(true); }}><CircleHelp size={18} /><span>{t("快捷键", "Shortcuts")}</span></button>
        {collapsed && <button className={`${styles.expandButton} icon-button`} aria-label={t("展开导航", "Expand navigation")} title={t("展开导航", "Expand navigation")} onClick={toggle}><PanelLeftOpen size={18} /></button>}
      </footer>
    </nav>
    {search && <QuickSearch onClose={() => setSearch(false)} />}
    <Dialog open={help} title={t("键盘快捷键", "Keyboard shortcuts")} onClose={() => setHelp(false)}><dl className={styles.shortcuts}><div><dt>{t("查找讲义", "Find a lecture")}</dt><dd><kbd>⌘ / Ctrl K</kbd></dd></div><div><dt>{t("发送消息", "Send a message")}</dt><dd><kbd>Enter</kbd></dd></div><div><dt>{t("换行", "New line")}</dt><dd><kbd>Shift Enter</kbd></dd></div><div><dt>{t("关闭弹窗", "Close dialog")}</dt><dd><kbd>Esc</kbd></dd></div><div><dt>{t("调整分栏（聚焦分隔线）", "Resize split (focus divider)")}</dt><dd><kbd>← →</kbd></dd></div></dl></Dialog>
  </>;
}
