"use client";

import type { KeyboardEvent } from "react";
import { CircleAlert, CircleStop, LoaderCircle } from "lucide-react";
import type { PageProgress } from "../../lib/protocol";
import { useLocale } from "../locale";
import { PageThumb } from "./page-thumb";
import styles from "./generation.module.css";

const working = new Set<PageProgress["state"]>(["generating", "checking", "reworking"]);
export function PageRail({ pages, selected, urlOf, onSelect }: { pages: PageProgress[]; selected?: string; urlOf: (page: PageProgress) => string | undefined; onSelect: (pageId: string) => void }) {
  const { t } = useLocale();
  const labels: Record<PageProgress["state"], string> = { pending: t("待生成", "Pending"), generating: t("生成中", "Generating"), checking: t("检查中", "Checking"), reworking: t("调整中", "Refining"), ready: t("已完成", "Ready"), failed: t("失败", "Failed"), cancelled: t("已取消", "Cancelled"), unknown: t("状态未确认", "Unconfirmed") };
  const move = (event: KeyboardEvent<HTMLOListElement>) => {
    if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    const ready = pages.filter(page => page.state === "ready"), at = ready.findIndex(page => page.pageId === selected);
    if (!ready.length) return;
    event.preventDefault();
    const direction = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1;
    const index = event.key === "Home" ? 0 : event.key === "End" ? ready.length - 1 : Math.min(ready.length - 1, Math.max(0, at + direction));
    const next = ready[index]!;
    onSelect(next.pageId);
    const button = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("[data-page]")).find(node => node.dataset.page === next.pageId);
    button?.focus(); button?.scrollIntoView({ block: "nearest", inline: "nearest" });
  };
  const firstReady = pages.find(page => page.state === "ready")?.pageId;
  const keyboardPage = pages.some(page => page.pageId === selected && page.state === "ready") ? selected : firstReady;
  return <ol className={`page-rail ${styles.rail}`} data-page-rail aria-label={t("页面缩略图", "Page thumbnails")} onKeyDown={move}>
    {pages.map(page => {
      const ready = page.state === "ready", active = page.pageId === selected;
      return <li key={page.pageId}>
        <button type="button" data-page={page.pageId} className={`page-row ${styles.row}${active ? ` is-selected ${styles.selected}` : ""}`} disabled={!ready}
          tabIndex={page.pageId === keyboardPage ? 0 : -1} aria-current={active ? "page" : undefined}
          aria-label={`${page.pageTitle} · ${labels[page.state]}`} title={page.pageTitle} onClick={() => onSelect(page.pageId)}>
          <PageThumb src={ready ? urlOf(page) : undefined} active={active} />
          {!ready && <span className={styles.state} aria-hidden="true">{working.has(page.state) ? <LoaderCircle className={styles.spin} size={15} /> : page.state === "failed" || page.state === "unknown" ? <CircleAlert size={15} /> : page.state === "cancelled" ? <CircleStop size={15} /> : null}</span>}
        </button>
      </li>;
    })}
  </ol>;
}
