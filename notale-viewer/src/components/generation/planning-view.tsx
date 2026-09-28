"use client";

import type { CSSProperties } from "react";
import type { progressState } from "../../lib/progress-state";

type State = ReturnType<typeof progressState>;
const names: Record<string, string> = { planner: "课程规划", sources: "资料准备", director: "视觉设计" };
const clock = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };

/** The first act, before there is a page plan: the workstreams Valar runs side by side, and the
 * tail of what they just did. */
export function PlanningView({ state, status }: { state: State; status: string }) {
  return (
    <div className={"planning" + (state.terminal ? " is-terminal" : "")}>
      <section className="planning-panel" aria-label="生成进展">
        <header className="planning-head">
          <span><b>VALAR</b>{state.terminal ? status : "规划中"}</span>
          <time>{clock(state.elapsed)}</time>
        </header>
        <ol className="planning-lanes">
          {state.lanes.map(lane => (
            <li key={lane.module} className={`is-${lane.status}`}>
              <i aria-hidden="true">{lane.status === "done" ? <svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7" /></svg> : lane.status === "failed" ? <svg viewBox="0 0 16 16"><path d="M8 4v5M8 11.5v.5" /></svg> : null}</i>
              <strong>{names[lane.module] ?? lane.module}</strong>
              <span>{lane.text}</span>
              {lane.status !== "running" && <time>{clock(lane.ms)}</time>}
            </li>
          ))}
        </ol>
        <ol className="planning-log" aria-live="polite">
          {state.log.map((line, i) => (
            <li key={line.key} style={{ "--fade": (i + 1 + 6 - state.log.length) / 6 } as CSSProperties}>
              <time>{clock(line.t)}</time><b>{names[line.module] ?? line.module}</b><span>{line.text}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
