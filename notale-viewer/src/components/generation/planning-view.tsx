"use client";

import { Check, CircleAlert, CircleDot, LoaderCircle } from "lucide-react";
import type { progressState } from "../../lib/progress-state";
import { useLocale } from "../locale";
import styles from "./generation.module.css";

type State = ReturnType<typeof progressState>;
const clock = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };

/** Display only workstreams and updates actually observed on the server. */
export function PlanningView({ state, status }: { state: State; status: string }) {
  const { t } = useLocale();
  const names: Record<string, string> = { planner: t("课程规划", "Course plan"), sources: t("资料准备", "Source material"), director: t("视觉设计", "Visual direction") };
  return <div className={styles.planning}>
    <section className={styles.planningPanel} aria-label={t("生成进展", "Generation progress")}>
      <header className={styles.planningHead}><div><span>{t("讲义生成", "Creating your lecture")}</span><h2 role="status">{status}</h2></div><time aria-label={t("已用时", "Elapsed time")}>{clock(state.elapsed)}</time></header>
      {!!state.lanes.length && <ol className={styles.lanes}>{state.lanes.map(lane => <li key={lane.module}>
        <span className={`${styles.laneIcon} ${lane.status === "failed" ? styles.danger : ""}`} aria-label={lane.status === "done" ? t("已完成", "Completed") : lane.status === "failed" ? t("失败", "Failed") : state.terminal ? t("结束前未确认完成", "Not confirmed complete before task ended") : t("进行中", "In progress")}>
          {lane.status === "done" ? <Check size={16} /> : lane.status === "failed" ? <CircleAlert size={16} /> : state.terminal ? <CircleDot size={16} /> : <LoaderCircle size={16} className={styles.spin} />}
        </span><strong>{names[lane.module] ?? lane.module}</strong><span className={styles.laneText} title={lane.text}>{lane.text}</span><time>{clock(lane.ms)}</time>
      </li>)}</ol>}
      {!!state.log.length && <details className={styles.details}><summary>{t("任务详情", "Task details")}</summary><ol className={styles.log}>{state.log.map(line => <li key={line.key}><time>{clock(line.t)}</time><b>{names[line.module] ?? line.module}</b><span>{line.text}</span></li>)}</ol></details>}
    </section>
  </div>;
}
