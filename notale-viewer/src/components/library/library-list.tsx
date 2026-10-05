"use client";

import Link from "next/link";
import { useState } from "react";
import { previewUrl } from "../../lib/api";
import { FileText, LoaderCircle, ArrowUpRight } from "lucide-react";
import type { SessionSummary } from "../../lib/session-protocol";
import { useLocale, formatDate } from "../locale";
import { SessionActions } from "./session-actions";
import styles from "./library.module.css";

function Cover({ runId }: { runId: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? <FileText size={21}/> : <img loading="lazy" src={previewUrl(runId, "assets/preview/thumbnails/page-01.png")} alt="" onError={() => setFailed(true)}/>;
}

export function LibraryList({ items, compact = false }: { items: SessionSummary[]; compact?: boolean }) {
  const { locale, t } = useLocale();
  return <ul className={`${styles.list} ${compact ? styles.compact : ""}`}>
    {items.map(item => <li key={item.id} className={styles.row}>
      <Link href={`/s/${item.id}`} className={styles.open}>
        <span className={styles.doc} aria-hidden="true">{item.busy ? <LoaderCircle size={21} className={styles.spinning} /> : item.latestCompletedRunId ? <Cover key={item.latestCompletedRunId} runId={item.latestCompletedRunId}/> : <FileText size={21} />}</span>
        <span className={styles.description}><strong>{item.title || t("未命名讲义", "Untitled lecture")}</strong><span>{item.busy ? t("正在创作", "In progress") : item.versions ? t(`${item.versions} 个版本`, `${item.versions} versions`) : t("对话", "Conversation")}<i aria-hidden="true">·</i><time dateTime={item.updatedAt}>{formatDate(item.updatedAt, locale)}</time></span></span>
        {compact && <ArrowUpRight className={styles.openArrow} size={17} />}
      </Link>
      {!compact && <SessionActions session={item} />}
    </li>)}
  </ul>;
}
