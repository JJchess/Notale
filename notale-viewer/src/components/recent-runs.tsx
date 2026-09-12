"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listRuns, type RunSnapshot } from "../lib/api";

const labels = { queued: "排队中", running: "生成中", completed: "已完成", failed: "失败", cancelled: "已取消" } as const;

export function RecentRuns() {
  const [runs, setRuns] = useState<RunSnapshot[]>([]);
  useEffect(() => { void listRuns().then((rows) => setRuns(rows.slice(0, 5))).catch(() => undefined); }, []);
  if (!runs.length) return null;
  return (
    <section className="recent-runs" aria-label="最近任务">
      <p>最近任务</p>
      {runs.map((run) => (
        <Link href={`/runs/${run.id}`} key={run.id}>
          <span>{run.request.query}</span><small>{labels[run.status]}</small>
        </Link>
      ))}
    </section>
  );
}
