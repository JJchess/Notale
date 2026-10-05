"use client";

import { useEffect, useState } from "react";
import { Search, RotateCw } from "lucide-react";
import { useSessionList } from "../../lib/use-session-list";
import { useLocale } from "../locale";
import { LibraryList } from "./library-list";
import styles from "./library.module.css";

export function LibraryScreen({ archived = false }: { archived?: boolean }) {
  const { t } = useLocale();
  const [input, setInput] = useState(""), [query, setQuery] = useState("");
  useEffect(() => { const timer = setTimeout(() => setQuery(input), 180); return () => clearTimeout(timer); }, [input]);
  const catalog = useSessionList(query, archived);
  return <main className={styles.screen}>
    <header className={styles.heading}><div><p>NOTALE / {archived ? "ARCHIVE" : "LIBRARY"}</p><h1>{archived ? t("归档", "Archive") : t("我的讲义", "My lectures")}</h1></div><button className="icon-button" title={t("刷新", "Refresh")} aria-label={t("刷新", "Refresh")} onClick={() => void catalog.refresh()} disabled={catalog.loading}><RotateCw size={17} /></button></header>
    <label className={styles.search}><Search size={18} /><input type="search" value={input} onChange={event => setInput(event.target.value)} placeholder={t("搜索讲义", "Search lectures")} aria-label={t("搜索讲义", "Search lectures")} /></label>
    <section aria-busy={catalog.loading}>
      {catalog.error && <p role="alert" className={styles.error}>{catalog.error} <button onClick={() => void catalog.refresh()}>{t("重试", "Retry")}</button></p>}
      <LibraryList items={catalog.items} />
      {catalog.loading && !catalog.items.length && <div className={styles.skeleton} aria-label={t("正在读取讲义", "Loading lectures")}><i /><i /><i /></div>}
      {!catalog.loading && !catalog.error && query && !catalog.items.length && <p className={styles.noMatch}>{t("没有找到匹配的讲义", "No matching lectures")}</p>}
      {catalog.hasMore && <button className={styles.more} disabled={catalog.loading} onClick={() => void catalog.more()}>{catalog.loading ? t("加载中…", "Loading…") : t("加载更多", "Load more")}</button>}
    </section>
  </main>;
}
