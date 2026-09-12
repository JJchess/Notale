"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { cancelRun, eventUrl, getRun, previewUrl, type RunEvent, type RunSnapshot } from "../lib/api";

const publicPhase: Record<string, string> = { starting: "准备", ideate: "构思", create: "创作", polish: "润色", complete: "完成" };

export function RunExperience({ runId }: { runId: string }) {
  const [run, setRun] = useState<RunSnapshot>();
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [connection, setConnection] = useState("正在连接");
  const lastSequence = useRef(0);

  useEffect(() => {
    let closed = false;
    let source: EventSource | undefined;
    async function connect() {
      try {
        const snapshot = await getRun(runId);
        if (closed) return;
        setRun(snapshot);
        lastSequence.current = 0;
        source = new EventSource(eventUrl(runId, 0));
        source.onopen = () => setConnection(["completed", "failed", "cancelled"].includes(snapshot.status) ? "正在恢复任务记录" : "实时同步中");
        source.onmessage = () => undefined;
        const accept = (message: MessageEvent<string>) => {
          const event = JSON.parse(message.data) as RunEvent;
          lastSequence.current = Math.max(lastSequence.current, event.sequence);
          setEvents((current) => current.some((row) => row.sequence === event.sequence) ? current : [...current, event].sort((a, b) => a.sequence - b.sequence));
          void getRun(runId).then(setRun);
          if (["run.completed", "run.failed", "run.cancelled"].includes(event.kind)) {
            setConnection("任务已结束");
            source?.close();
          }
        };
        for (const kind of ["run.started", "phase.changed", "page.started", "page.ready", "artifact.ready", "run.completed", "run.failed", "run.cancelled"]) source.addEventListener(kind, accept as EventListener);
        source.onerror = () => {
          if (["completed", "failed", "cancelled"].includes(snapshot.status)) {
            setConnection("任务已结束");
            source?.close();
          } else {
            setConnection("连接中断，正在重试");
          }
        };
      } catch (error) {
        setConnection(error instanceof Error ? error.message : "无法读取任务");
      }
    }
    void connect();
    return () => { closed = true; source?.close(); };
  }, [runId]);

  const pages = useMemo(() => events.filter((event) => event.kind === "page.ready"), [events]);
  const activePreview = pages.at(-1)?.previewUrl;
  const finished = run?.status === "completed";

  return (
    <main className="run-shell">
      <header className="run-header">
        <Link href="/" className="brand"><span className="brand-mark">N</span><span>NOTALE</span></Link>
        <div className="run-meta"><span className={`status-dot ${run?.status ?? "queued"}`} /><span>{connection}</span><code>{runId.slice(-8)}</code></div>
      </header>
      <section className="run-grid">
        <aside className="progress-panel">
          <p className="kicker">GENERATION</p>
          <h1>{run?.request.query ?? "正在读取任务"}</h1>
          <div className="phase-line"><span>{publicPhase[run?.phase ?? "starting"] ?? "生成中"}</span><strong>{pages.length}</strong><small>页已就绪</small></div>
          <div className="page-strip" aria-label={`${pages.length} 页已完成`}>
            {pages.length === 0 ? <i className="page-cell active" /> : pages.map((event) => <i className="page-cell done" key={event.sequence} title={event.pageTitle} />)}
          </div>
          <ol className="event-feed">
            {events.slice(-8).reverse().map((event) => <li key={event.sequence}><time>{new Date(event.timestamp).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</time><span>{event.message}</span></li>)}
          </ol>
          {run && !["completed", "failed", "cancelled"].includes(run.status) && <button className="quiet-button" onClick={() => void cancelRun(runId).then(setRun)}>取消生成</button>}
          {run?.error && <p className="run-error">{run.error}</p>}
        </aside>
        <section className="preview-panel">
          <div className="preview-bar"><span>{finished ? "完整讲义" : activePreview ? "最新完成页面" : "等待首个页面"}</span>{finished && <a href={previewUrl(runId)} target="_blank" rel="noreferrer">新窗口打开 ↗</a>}</div>
          <div className="preview-stage">
            {(finished || activePreview) ? <iframe key={finished ? "final" : activePreview} src={finished ? previewUrl(runId) : `/notale-api${activePreview}`} title="讲义预览" /> : <div className="preview-empty"><span /><p>页面生成后会立即出现在这里</p></div>}
          </div>
        </section>
      </section>
    </main>
  );
}
