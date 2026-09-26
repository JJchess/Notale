"use client";

import Link from "next/link";
import { useState } from "react";
import { cancelRun, previewUrl } from "../lib/api";
import { useRun } from "../lib/use-run";

import { GenerationProgress } from "./generation-progress";

export const publicPhase: Record<string, string> = { starting: "准备", ideate: "构思", create: "创作", polish: "整理讲义", complete: "完成" };

export function RunExperience({ runId }: { runId: string }) {
  const { run, setRun, connection, progress } = useRun(runId);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const finished = run?.status === "completed";

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
