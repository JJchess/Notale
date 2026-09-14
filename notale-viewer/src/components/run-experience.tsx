"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { cancelRun, eventUrl, getRun, previewUrl, type RunEvent, type RunSnapshot } from "../lib/api";

import { GenerationProgress } from "./generation-progress";
import { progressState } from "../lib/progress-state";

const publicPhase: Record<string, string> = { starting: "准备", ideate: "构思", create: "创作", polish: "整理讲义", complete: "完成" };

export function RunExperience({ runId }: { runId: string }) {
  const [now, setNow] = useState(Date.now);
  const [run, setRun] = useState<RunSnapshot>();
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [connection, setConnection] = useState("正在连接");
  const [cancelBusy, setCancelBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    let closed = false;
    let source: EventSource | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let lastSequence = 0;
    const terminal = (status: string) => ["completed", "failed", "cancelled"].includes(status);
    setRun(undefined);
    setActionError("");
    setEvents([]);
    setConnection("正在连接");
    function applySnapshot(snapshot: RunSnapshot) {
      if (closed) return;
      setRun(current => current && (current.lastSequence > snapshot.lastSequence ||
        (terminal(current.status) && !terminal(snapshot.status))) ? current : snapshot);
    }
    function reconnect() {
      if (closed || retry) return;
      source?.close();
      setConnection("连接中断，正在重试");
      retry = setTimeout(() => { retry = undefined; void connect(); }, 1500);
    }
    async function connect() {
      try {
        const snapshot = await getRun(runId);
        if (closed) return;
        applySnapshot(snapshot);
        source = new EventSource(eventUrl(runId, lastSequence));
        source.onopen = () => { if (!closed) setConnection(terminal(snapshot.status) ? "正在恢复任务记录" : "实时同步中"); };
        const accept = (message: MessageEvent<string>) => {
          if (closed) return;
          const event = JSON.parse(message.data) as RunEvent;
          lastSequence = Math.max(lastSequence, event.sequence);
          setEvents(current => current.some(row => row.sequence === event.sequence) ? current : [...current, event].sort((a, b) => a.sequence - b.sequence));
          if (event.kind !== "workflow.progress") void getRun(runId).then(applySnapshot).catch(reconnect);
          if (["run.completed", "run.failed", "run.cancelled"].includes(event.kind)) {
            setConnection("任务已结束");
            source?.close();
          }
        };
        for (const kind of ["run.started", "phase.changed", "workflow.progress", "plan.ready", "page.progress", "page.started", "page.ready", "artifact.ready", "run.completed", "run.failed", "run.cancelled"]) source.addEventListener(kind, accept as EventListener);
        source.onerror = () => {
          if (closed) return;
          if (terminal(snapshot.status)) {
            setConnection("任务已结束");
            source?.close();
          } else reconnect();
        };
      } catch { reconnect(); }
    }
    void connect();
    return () => { closed = true; clearTimeout(retry); source?.close(); };
  }, [runId]);

  const progress = useMemo(() => progressState(run, events, now), [run, events, now]);
  const finished = run?.status === "completed";
  useEffect(() => {
    if (progress.terminal) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [progress.terminal]);

  async function cancel() {
    if (cancelBusy) return;
    setCancelBusy(true);
    setActionError("");
    try { setRun(await cancelRun(runId)); }
    catch (error) { setActionError(error instanceof Error ? error.message : "取消失败，请重试"); }
    finally { setCancelBusy(false); }
  }

  const stopped = run?.status === "failed" || run?.status === "cancelled";
  const status = finished ? "已完成" : run?.status === "failed" ? "生成失败" : run?.status === "cancelled" ? "已取消" : publicPhase[run?.phase ?? "starting"] ?? "生成中";

  if (finished) return (
    <main className="linear-lecture">
      <iframe src={previewUrl(runId)} title="讲义预览" allowFullScreen />
      <details className="lecture-actions"><summary>讲义 ⋯</summary><div><a href={`/notale-api/v1/runs/${encodeURIComponent(runId)}/download?format=notale`} download>下载 .notale</a><Link href="/">返回首页</Link></div></details>
    </main>
  );

  return (
    <main className="linear-generation" id="generation-panel">
      <GenerationProgress state={progress} phase={run?.phase} status={status} />
      <footer className="generation-footer">
        <span role="status">{connection}</span>
        {run && !stopped && <button className="lecture-cancel" disabled={cancelBusy} onClick={() => void cancel()}>{cancelBusy ? "正在取消…" : "取消生成"}</button>}
        {stopped && <Link href="/">返回首页</Link>}
      </footer>
      {run?.error && <p className="generation-error" role="alert">{run.error}</p>}
      {actionError && <p className="generation-error" role="alert">{actionError}</p>}
    </main>
  );
}
