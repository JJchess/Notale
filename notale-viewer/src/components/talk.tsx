"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowUpRight, Check, ChevronRight, Copy, FileText, LoaderCircle } from "lucide-react";
import { FileKind } from "./file-kind";
import { useLocale } from "./locale";
import { renderMarkdown } from "../lib/markdown";
import type { Entry, Route } from "../lib/session-protocol";

export function RichText({ text }: { text: string }) {
  const html = useMemo(() => renderMarkdown(text), [text]);
  return <div className="talk-markdown" dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Everything said and produced between two user messages. */
export interface Exchange {
  user?: Extract<Entry, { type: "user" }>;
  understood?: Route;
  question?: Extract<Entry, { type: "question" }>;
  runs: Extract<Entry, { type: "run" }>[];
  replies: string[];
}
export function exchanges(entries: Entry[]): Exchange[] {
  const out: Exchange[] = [];
  let current: Exchange | undefined;
  for (const entry of entries) {
    if (entry.type === "session" || entry.type === "finished") continue;
    if (entry.type === "user" || !current) { current = { runs: [], replies: [] }; out.push(current); }
    if (entry.type === "user") current.user = entry;
    else if (entry.type === "understood") current.understood = entry.route;
    else if (entry.type === "question") current.question = entry;
    else if (entry.type === "run") current.runs.push(entry);
    else if (entry.type === "reply") current.replies.push(entry.text);
  }
  return out;
}

export interface RunView { runId: string; kind: "generate" | "fix"; version: number; basedOn?: number; state: "working" | "done" | "stopped" | "failed"; progress?: string; shown: boolean }

export function UserBubble({ entry, names, sessionId }: { entry: Extract<Entry, { type: "user" }>; names: Map<string, string>; sessionId: string }) {
  const { t } = useLocale();
  return <div className="talk-user"><p>{entry.text}</p>
    {!!entry.files.length && <ul>{entry.files.map(id => <li key={id}>
      <a href={`/notale-session/v1/sessions/${encodeURIComponent(sessionId)}/files/${encodeURIComponent(id)}`} target="_blank" rel="noreferrer" title={names.get(id)}>
        <FileKind name={names.get(id) ?? ""} /><span>{names.get(id) ?? t("附件", "Attachment")}</span>
      </a>
    </li>)}</ul>}
  </div>;
}

function Reply({ text }: { text: string }) {
  const { t } = useLocale();
  const [copied, setCopied] = useState(false), [failed, setFailed] = useState(false);
  async function copy() {
    try { await navigator.clipboard.writeText(text); setCopied(true); setFailed(false); }
    catch { setFailed(true); }
  }
  return <div className="talk-reply"><RichText text={text} /><button className="talk-copy" type="button" onClick={() => void copy()}
    onBlur={() => setCopied(false)} aria-label={copied ? t("已复制", "Copied") : t("复制回复", "Copy reply")} title={copied ? t("已复制", "Copied") : t("复制回复", "Copy reply")}>
    {copied ? <Check size={14} /> : <Copy size={14} />}</button>
    {failed && <span className="talk-error" role="alert">{t("复制失败，请选择文本复制", "Copy failed. Select the text to copy it.")}</span>}
  </div>;
}

export function IstarCard({ runs, replies, question, understood, typing, thinking, step, error, onPick, options }: {
  runs: RunView[]; replies: string[]; question?: string; understood?: string; typing?: string; thinking?: boolean; step?: string; error?: string;
  onPick: (runId: string) => void; options?: ReactNode;
}) {
  const { t } = useLocale();
  const working = runs.find(run => run.state === "working");
  return <div className="talk-card">
    <div className="talk-card-head"><img className="talk-assistant-mark" src="/brand/notale-mark.svg" alt="" /><span className="talk-card-name">Notale</span>
      {(thinking || working) && <LoaderCircle className="talk-spinner" size={13} aria-hidden="true" />}
    </div>
    {(understood || step || working?.progress) && <details className="talk-task">
      <summary><ChevronRight size={13} aria-hidden="true" /><span>{step ?? working?.progress ?? t("任务详情", "Task details")}</span></summary>
      {understood && <p>{understood}</p>}{working?.progress && step && <p>{working.progress}</p>}
    </details>}
    {question && <RichText text={question} />}{options}
    {replies.map((text, index) => <Reply key={index} text={text} />)}
    {typing && <div className="talk-stream"><RichText text={typing} /><i className="caret" aria-hidden="true" /></div>}
    {thinking && !typing && !replies.length && !question && !working && !step && <p className="talk-progress">{t("正在理解你的需求", "Understanding your request")}</p>}
    {runs.map(run => run.state === "done" ? <button key={run.runId} type="button" className={"talk-result" + (run.shown ? " is-shown" : "")} aria-pressed={run.shown} onClick={() => onPick(run.runId)}>
      <span className="talk-result-icon"><FileText size={20} aria-hidden="true" /></span><span className="talk-result-text"><b>{t(`讲义 · 版本 ${run.version}`, `Lecture · Version ${run.version}`)}</b>
        <span>{run.basedOn ? t(`基于版本 ${run.basedOn} 修改`, `Revised from version ${run.basedOn}`) : t("讲义已生成", "Lecture ready")}</span></span>
      {run.shown ? <Check size={16} aria-label={t("正在查看", "Viewing")} /> : <ArrowUpRight size={16} aria-hidden="true" />}
    </button> : <div className={`talk-run-state is-${run.state}`} key={run.runId} role="status">
      {run.state === "working" && <LoaderCircle size={14} className="talk-spinner" aria-hidden="true" />}
      {run.state === "working" ? (run.progress ?? (run.kind === "generate" ? t("正在生成讲义", "Generating lecture") : t("正在修改讲义", "Revising lecture")))
        : run.state === "stopped" ? t("已停止", "Stopped") : t("任务未完成", "Task failed")}
    </div>)}
    {error && <p className="talk-error" role="alert">{error}</p>}
  </div>;
}
