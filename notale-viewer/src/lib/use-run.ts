"use client";

import { useEffect, useMemo, useState } from "react";
import { eventUrl, getRun, type RunEvent, type RunSnapshot } from "./api";
import { progressState } from "./progress-state";

const terminal = (status: string) => ["completed", "failed", "cancelled"].includes(status);
const KINDS = ["run.started", "phase.changed", "workflow.progress", "plan.ready", "page.progress", "page.started", "page.ready", "artifact.ready", "run.completed", "run.failed", "run.cancelled"];

/** One run, followed live: snapshot, replayed and live events (SSE resumed with ?after=), and the
 * derived progress. Survives reloads by replaying from the server. `runId` undefined follows nothing. */
export function useRun(runId: string | undefined) {
  const [now, setNow] = useState(Date.now);
  const [run, setRun] = useState<RunSnapshot>();
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [connection, setConnection] = useState("正在连接");
  useEffect(() => {
    setRun(undefined); setEvents([]); setConnection("正在连接");
    if (!runId) return;
    let closed = false, source: EventSource | undefined, retry: ReturnType<typeof setTimeout> | undefined, lastSequence = 0;
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
        const snapshot = await getRun(runId!);
        if (closed) return;
        applySnapshot(snapshot);
        source = new EventSource(eventUrl(runId!, lastSequence));
        source.onopen = () => { if (!closed) setConnection(terminal(snapshot.status) ? "正在恢复任务记录" : "实时同步中"); };
        const accept = (message: MessageEvent<string>) => {
          if (closed) return;
          const event = JSON.parse(message.data) as RunEvent;
          lastSequence = Math.max(lastSequence, event.sequence);
          setEvents(current => current.some(row => row.sequence === event.sequence) ? current : [...current, event].sort((a, b) => a.sequence - b.sequence));
          if (event.kind !== "workflow.progress") void getRun(runId!).then(applySnapshot).catch(reconnect);
          if (["run.completed", "run.failed", "run.cancelled"].includes(event.kind)) { setConnection("任务已结束"); source?.close(); }
        };
        for (const kind of KINDS) source.addEventListener(kind, accept as EventListener);
        source.onerror = () => {
          if (closed) return;
          if (terminal(snapshot.status)) { setConnection("任务已结束"); source?.close(); } else reconnect();
        };
      } catch { reconnect(); }
    }
    void connect();
    return () => { closed = true; clearTimeout(retry); source?.close(); };
  }, [runId]);
  const progress = useMemo(() => progressState(run, events, now), [run, events, now]);
  useEffect(() => {
    if (!runId || progress.terminal) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [runId, progress.terminal]);
  return { run, setRun, events, connection, progress };
}
