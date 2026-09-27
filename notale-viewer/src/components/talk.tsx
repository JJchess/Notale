"use client";

import { Fragment, type ReactNode } from "react";
import { FileKind } from "./file-kind";
import type { Entry, Route } from "../lib/session-protocol";

/** Istar's words with the little markup it uses: `code` spans and line breaks. No markdown library;
 * anything else stays plain text. */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/(`[^`\n]+`)/g);
  return <>{parts.map((part, index) => part.startsWith("`") && part.endsWith("`") && part.length > 2
    ? <code key={index}>{part.slice(1, -1)}</code>
    : <Fragment key={index}>{part}</Fragment>)}</>;
}

/** One exchange: what the author said, and everything Istar did about it until the next message. */
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

/** The author's message, right-aligned. */
export function UserBubble({ entry, names }: { entry: Extract<Entry, { type: "user" }>; names: Map<string, string> }) {
  return <div className="talk-user"><p>{entry.text}</p>
    {!!entry.files.length && <ul>{entry.files.map(id => <li key={id} title={names.get(id)}><FileKind name={names.get(id) ?? ""} /><span>{names.get(id) ?? "附件"}</span></li>)}</ul>}
  </div>;
}

/** The reply side of one exchange, as one card: a head with what came of it (a version, or that it
 * is still working), then its words. Signed by who did the work: Valar when it made a new lecture,
 * Istar otherwise (a change, a question, a reply). The reading the router went with is a tooltip, not a line of
 * narration -- it mostly repeats what the author just said. */
export function IstarCard({ runs, replies, question, understood, typing, thinking, error, onPick, options }: {
  runs: RunView[]; replies: string[]; question?: string; understood?: string; typing?: string; thinking?: boolean; error?: string;
  onPick: (runId: string) => void; options?: ReactNode;
}) {
  const badge = (run: RunView) => {
    const label = run.kind === "generate" ? "生成" : "修改";
    if (run.state === "done") return <button key={run.runId} type="button" className={"talk-badge" + (run.shown ? " is-shown" : "")} aria-pressed={run.shown}
      title={run.shown ? `正在查看 v${run.version}` : `查看 v${run.version}`} onClick={() => onPick(run.runId)}>
      v{run.version}{run.basedOn ? <span> · 基于 v{run.basedOn}</span> : null}</button>;
    return <span key={run.runId} className={"talk-badge is-" + run.state}>{run.state === "working" ? `${label}中…` : run.state === "stopped" ? "已停止" : `${label}失败`}</span>;
  };
  const working = runs.find(run => run.state === "working");
  return (
    <div className="talk-card">
      <div className="talk-card-head">
        <span className="talk-card-name">{runs.some(run => run.kind === "generate") ? "Valar" : "Istar"}</span>
        {runs.map(badge)}
        {understood && <button type="button" className="talk-why" aria-label={`理解为：${understood}`} data-tip={`理解为：${understood}`}>
          <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.3" /><path d="M8 7.2v3.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><circle cx="8" cy="5" r=".9" fill="currentColor" /></svg>
        </button>}
      </div>
      {working?.progress && <p className="talk-progress">{working.progress}</p>}
      {question && <p className="talk-text"><RichText text={question} /></p>}
      {options}
      {replies.map((text, index) => <p key={index} className="talk-text"><RichText text={text} /></p>)}
      {typing && <p className="talk-text is-typing"><RichText text={typing} /><i className="caret" aria-hidden /></p>}
      {thinking && !typing && !replies.length && !question && !working && <p className="talk-progress">正在理解…</p>}
      {error && <p className="talk-error" role="alert">{error}</p>}
    </div>
  );
}
