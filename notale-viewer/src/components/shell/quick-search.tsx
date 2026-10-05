"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ArrowUpRight, Archive } from "lucide-react";
import { useSessionList } from "../../lib/use-session-list";
import { useLocale, formatDate } from "../locale";
import { Dialog } from "../ui/dialog";
import styles from "./shell.module.css";

export function QuickSearch({ onClose }: { onClose: () => void }) {
  const { t, locale } = useLocale(), router = useRouter();
  const [text, setText] = useState(""), [query, setQuery] = useState(""), [archived, setArchived] = useState(false), [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { const timer = setTimeout(() => { setQuery(text); setActive(0); }, 150); return () => clearTimeout(timer); }, [text]);
  const catalog = useSessionList(query, archived);
  useEffect(() => { list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active]);
  const open = (id: string) => { onClose(); router.push(`/s/${id}`); };
  return <Dialog open onClose={onClose} title={t("查找讲义", "Find a lecture")}>
    <div className={styles.searchField}><Search size={19} /><input data-autofocus type="search" role="combobox" aria-expanded="true" aria-controls="lecture-search-results" aria-activedescendant={catalog.items[active] ? `search-${catalog.items[active].id}` : undefined} aria-label={t("搜索标题", "Search titles")} value={text} placeholder={t("输入讲义标题…", "Type a lecture title…")} onChange={event => setText(event.target.value)} onKeyDown={event => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setActive(current => Math.max(0, Math.min(catalog.items.length - 1, current + (event.key === "ArrowDown" ? 1 : -1)))); }
      if (event.key === "Enter" && catalog.items[active]) { event.preventDefault(); open(catalog.items[active].id); }
    }} /></div>
    <button className={styles.archiveFilter} aria-pressed={archived} onClick={() => { setArchived(value => !value); setActive(0); }}><Archive size={14} />{t("归档讲义", "Archived lectures")}</button>
    <div ref={list} className={styles.searchResults} role="listbox" id="lecture-search-results" aria-label={t("搜索结果", "Search results")} aria-busy={catalog.loading}>
      {catalog.items.map((item, index) => <button type="button" role="option" aria-selected={active === index} tabIndex={-1} id={`search-${item.id}`} data-index={index} key={item.id} onMouseMove={() => setActive(index)} onClick={() => open(item.id)}>
        <span><strong>{item.title || t("未命名讲义", "Untitled lecture")}</strong><time>{formatDate(item.updatedAt, locale)}</time></span><ArrowUpRight size={16} />
      </button>)}
      {catalog.error && <p role="alert">{catalog.error}</p>}
      {!catalog.loading && !catalog.error && query && !catalog.items.length && <p>{t("没有找到匹配的讲义", "No matching lectures")}</p>}
    </div>
    {catalog.hasMore && <button className={styles.archiveFilter} disabled={catalog.loading} onClick={() => void catalog.more()}>{t("加载更多", "Load more")}</button>}
  </Dialog>;
}
