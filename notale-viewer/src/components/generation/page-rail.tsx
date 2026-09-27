"use client";

import type { PageProgress } from "../../lib/protocol";
import { PageThumb } from "./page-thumb";

const working = new Set<PageProgress["state"]>(["generating", "checking", "reworking"]);

/** The lecture's pages as planned, each with how far it got. Finished pages can be looked at. */
export function PageRail({ pages, selected, urlOf, onSelect }: { pages: PageProgress[]; selected?: string; urlOf: (page: PageProgress) => string | undefined; onSelect: (pageId: string) => void }) {
  const move = (event: React.KeyboardEvent<HTMLOListElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const ready = pages.filter(page => page.state === "ready"), at = ready.findIndex(page => page.pageId === selected);
    const next = ready[Math.min(ready.length - 1, Math.max(0, at + (event.key === "ArrowDown" ? 1 : -1)))];
    if (!next) return;
    onSelect(next.pageId);
    event.currentTarget.querySelector<HTMLElement>(`[data-page="${next.pageId}"]`)?.focus();
  };
  return (
    <ol className="page-rail" aria-label="页面" onKeyDown={move}>
      {pages.map((page, index) => {
        const ready = page.state === "ready";
        return <li key={page.pageId}>
          <button type="button" data-page={page.pageId} className={"page-row" + (page.pageId === selected ? " is-selected" : "")} disabled={!ready}
            aria-current={page.pageId === selected ? "page" : undefined} title={page.pageTitle} onClick={() => onSelect(page.pageId)}>
            <span className="page-index">{index + 1}</span>
            <PageThumb {...(ready && urlOf(page) ? { src: urlOf(page) } : {})} />
            <span className="page-title">{page.pageTitle}</span>
            <span className={"page-state is-" + (ready ? "ready" : working.has(page.state) ? "working" : page.state)}>
              {ready ? <svg viewBox="0 0 16 16" aria-label="已完成"><circle cx="8" cy="8" r="7" /><path d="M4.8 8.3 7 10.4l4.2-4.6" /></svg>
                : working.has(page.state) ? <><i aria-hidden="true" /><em>生成中</em></>
                : page.state === "failed" ? <b aria-label="失败">!</b> : null}
            </span>
          </button>
        </li>;
      })}
    </ol>
  );
}
