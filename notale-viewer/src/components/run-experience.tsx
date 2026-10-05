"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Download, Maximize, Minimize, Square } from "lucide-react";
import { cancelRun, previewUrl } from "../lib/api";
import { useRun } from "../lib/use-run";
import { useLocale } from "./locale";
import { GenerationView } from "./generation/generation-view";
import styles from "./generation/run.module.css";

export const publicPhase: Record<string, string> = { starting: "准备", ideate: "构思", create: "创作", polish: "整理讲义", complete: "完成" };
const phasesEn: Record<string, string> = { starting: "Preparing", ideate: "Planning", create: "Creating", polish: "Assembling lecture", complete: "Completed" };
const connectionEn: Record<string, string> = { "正在连接": "Connecting", "连接中断，正在重试": "Connection interrupted. Reconnecting", "正在恢复任务记录": "Restoring task history", "实时同步中": "Live updates", "任务已结束": "Task ended" };

export function RunExperience({ runId }: { runId: string }) {
  const { t } = useLocale();
  const { run, setRun, connection, progress } = useRun(runId);
  const [cancelBusy, setCancelBusy] = useState(false), [actionError, setActionError] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const shell = useRef<HTMLElement>(null);
  const finished = run?.status === "completed", stopped = run?.status === "failed" || run?.status === "cancelled";
  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === shell.current);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  async function cancel() {
    if (cancelBusy) return;
    setCancelBusy(true); setActionError("");
    try { setRun(await cancelRun(runId)); }
    catch (error) { setActionError(error instanceof Error ? error.message : t("取消失败，请重试", "Could not cancel. Please retry.")); }
    finally { setCancelBusy(false); }
  }
  async function full() {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await shell.current?.requestFullscreen(); }
    catch { setActionError(t("浏览器无法进入全屏", "Fullscreen is unavailable in this browser")); }
  }
  const status = finished ? t("已完成", "Completed") : run?.status === "failed" ? t("生成失败", "Generation failed") : run?.status === "cancelled" ? t("已取消", "Cancelled") : run?.status === "queued" ? t("等待生成", "Queued") : t(publicPhase[run?.phase ?? "starting"] ?? "生成中", phasesEn[run?.phase ?? "starting"] ?? "Generating");
  return <main ref={shell} className={styles.run}>
    <header className={styles.toolbar}>
      <Link href="/" className={styles.icon} aria-label={t("返回首页", "Back to home")} title={t("返回首页", "Back to home")}><ArrowLeft size={17} /></Link>
      <h1>{t("讲义", "Lecture")}</h1><span className={styles.status} role="status">{status}</span>
      <div className={styles.actions}>
        {finished && <a href={`/notale-api/v1/runs/${encodeURIComponent(runId)}/download?format=notale`} download className={styles.icon} aria-label={t("下载讲义", "Download lecture")} title={t("下载讲义", "Download lecture")}><Download size={17} /></a>}
        <button type="button" className={styles.icon} onClick={() => void full()} aria-label={t(fullscreen ? "退出全屏" : "全屏预览", fullscreen ? "Exit fullscreen" : "Fullscreen preview")} title={t(fullscreen ? "退出全屏" : "全屏预览", fullscreen ? "Exit fullscreen" : "Fullscreen preview")}>{fullscreen ? <Minimize size={17} /> : <Maximize size={17} />}</button>
        {run && !finished && !stopped && <button type="button" className={styles.cancel} disabled={cancelBusy} onClick={() => void cancel()}><Square size={11} fill="currentColor" />{cancelBusy ? t("正在停止", "Stopping") : t("停止生成", "Stop generation")}</button>}
      </div>
    </header>
    <div className={styles.content}>
      {finished && !progress.pages.length ? <iframe src={`${previewUrl(runId)}?embed=1`} title={t("讲义预览", "Lecture preview")} allowFullScreen /> : <GenerationView state={progress} phase={run?.phase} status={status} />}
    </div>
    {!finished && <footer className={styles.footer}><span role="status">{t(connection, connectionEn[connection] ?? connection)}</span>{stopped && <Link href="/">{t("创建新讲义", "Create a lecture")}</Link>}</footer>}
    {(run?.error || actionError) && <p className={styles.error} role="alert">{actionError || run?.error}</p>}
  </main>;
}
