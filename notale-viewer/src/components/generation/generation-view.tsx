"use client";

import { useEffect, useState } from "react";
import type { PageProgress } from "../../lib/protocol";
import type { progressState } from "../../lib/progress-state";
import { GenerationProgress } from "../generation-progress";
import { PagePreview } from "./page-preview";
import { PageRail } from "./page-rail";

type State = ReturnType<typeof progressState>;
const working = new Set<PageProgress["state"]>(["generating", "checking", "reworking"]);
/** A page's own URL through the viewer's proxy, inside the viewer's chrome. */
const urlOf = (page: PageProgress) => page.previewUrl ? `/notale-api${page.previewUrl}?embed=1` : undefined;

/** A lecture being generated. Before there is a page plan: the stages. Then: every planned page
 * with how far it got, and the finished ones live -- the newest, unless the author picked one.
 * `onViewing` reports the page on screen, so the finished lecture can open on it. */
export function GenerationView({ state, phase, status, onViewing }: { state: State; phase?: string; status: string; onViewing?: (pageId: string) => void }) {
  const [picked, setPicked] = useState<string>();
  const ready = state.pages.filter(page => page.state === "ready");
  const newest = [...ready].sort((a, b) => (a.updatedAt ?? "").localeCompare(b.updatedAt ?? "")).at(-1);
  const shown = ready.find(page => page.pageId === picked) ?? newest;
  useEffect(() => { if (shown) onViewing?.(shown.pageId); }, [shown?.pageId, onViewing]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!state.pages.length) return <GenerationProgress state={state} phase={phase} status={status} />;

  const building = state.pages.findIndex(page => working.has(page.state));
  const at = shown ? ready.indexOf(shown) : -1;
  const src = shown && urlOf(shown);
  return (
    <div className="generation-view">
      <header className="generation-bar">
        {!state.terminal && <i className="spinner" aria-hidden="true" />}
        <span>{state.terminal ? status : building >= 0 ? <>正在生成第 <b>{building + 1}</b> / {state.total} 页</> : status}</span>
        <span className="generation-bar-sep" aria-hidden="true" />
        <span>{ready.length} 页可预览</span>
        <span className="generation-bar-track" role="progressbar" aria-label="讲义生成进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={state.percent}><i style={{ transform: `scaleX(${state.percent / 100})` }} /></span>
      </header>
      <div className="generation-body">
        <PageRail pages={state.pages} {...(shown ? { selected: shown.pageId } : {})} urlOf={urlOf} onSelect={setPicked} />
        {shown && src ? <PagePreview src={src} title={shown.pageTitle} position={{ index: state.pages.indexOf(shown) + 1, total: state.total }}
          {...(at > 0 ? { onPrevious: () => setPicked(ready[at - 1]!.pageId) } : {})}
          {...(at >= 0 && at < ready.length - 1 ? { onNext: () => setPicked(ready[at + 1]!.pageId) } : {})} />
          : <div className="page-preview is-waiting" aria-hidden="true" />}
      </div>
    </div>
  );
}
