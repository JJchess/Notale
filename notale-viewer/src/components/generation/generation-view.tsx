"use client";

import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import type { PageProgress } from "../../lib/protocol";
import type { progressState } from "../../lib/progress-state";
import { useLocale } from "../locale";
import { PlanningView } from "./planning-view";
import { PagePreview } from "./page-preview";
import { PageRail } from "./page-rail";
import styles from "./generation.module.css";

type State = ReturnType<typeof progressState>;
const working = new Set<PageProgress["state"]>(["generating", "checking", "reworking"]);
const urlOf = (page: PageProgress) => page.previewUrl ? `/notale-api${page.previewUrl}?embed=1` : undefined;

export function GenerationView({ state, status, onViewing }: { state: State; phase?: string; status: string; onViewing?: (pageId: string) => void }) {
  const { t } = useLocale();
  const [picked, setPicked] = useState<string>();
  const ready = state.pages.filter(page => page.state === "ready" && urlOf(page));
  const newest = [...ready].sort((a, b) => (a.updatedAt ?? "").localeCompare(b.updatedAt ?? "")).at(-1);
  const shown = ready.find(page => page.pageId === picked) ?? newest;
  useEffect(() => { if (shown) onViewing?.(shown.pageId); }, [shown?.pageId, onViewing]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!state.pages.length) return <PlanningView state={state} status={status} />;

  const building = state.pages.filter(page => working.has(page.state));
  const current = building[0], pageIndex = current ? state.pages.indexOf(current) + 1 : 0;
  const activeLabel = current?.state === "checking" ? t(`正在检查第 ${pageIndex} 页`, `Checking page ${pageIndex}`) : current?.state === "reworking" ? t(`正在调整第 ${pageIndex} 页`, `Refining page ${pageIndex}`) : t(`正在生成第 ${pageIndex} 页`, `Generating page ${pageIndex}`);
  const completed = state.pages.filter(page => page.state === "ready").length;
  const at = shown ? ready.indexOf(shown) : -1;
  const src = shown && urlOf(shown);
  return <div className={`generation-view ${styles.view}`}>
    <header className={styles.bar}>
      {!state.terminal && <LoaderCircle className={styles.spin} size={14} aria-hidden="true" />}
      <span role="status">{state.terminal || !building.length ? status : building.length > 1 ? t(`${building.length} 页正在处理中`, `Working on ${building.length} pages`) : activeLabel}</span>
      <span className={styles.count}>{t(`${completed} / ${state.total} 页已完成`, `${completed} / ${state.total} pages ready`)}</span>
      <span className={styles.track} role="progressbar" aria-label={t("已完成页面", "Completed pages")} aria-valuemin={0} aria-valuemax={state.total} aria-valuenow={completed}><i style={{ transform: `scaleX(${completed / state.total})` }} /></span>
    </header>
    <div className={styles.body}>
      <PageRail pages={state.pages} selected={shown?.pageId} urlOf={urlOf} onSelect={setPicked} />
      {shown && src ? <PagePreview src={src} title={shown.pageTitle} position={{ index: state.pages.indexOf(shown) + 1, total: state.total }}
        onPrevious={at > 0 ? () => setPicked(ready[at - 1]!.pageId) : undefined}
        onNext={at >= 0 && at < ready.length - 1 ? () => setPicked(ready[at + 1]!.pageId) : undefined} /> : <div className={styles.waiting} aria-hidden="true" />}
    </div>
  </div>;
}
