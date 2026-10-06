"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArchiveRestore, ArrowDown, ChevronLeft, ChevronRight, Download, Maximize, MessageSquare, Minimize, PanelRightClose, PanelRightOpen, Presentation, RefreshCw } from "lucide-react";
import { Composer } from "./composer";
import { IstarCard, UserBubble, exchanges, type RunView } from "./talk";
import { VersionMenu, type VersionItem } from "./version-menu";
import { EditInEditor } from "./edit-in-editor";
import { SplitHandle } from "./split-handle";
import { LecturePane } from "./lecture-pane";
import { GenerationView } from "./generation/generation-view";
import { PageRail } from "./generation/page-rail";
import { publicPhase } from "./run-experience";
import { useLocale } from "./locale";
import { UrlSource } from "../lib/live/live-draft";
import { ackPendingTurn, claimPendingTurn, peekPendingTurn, releasePendingTurn, type PendingTurn } from "../lib/pending-turn";
import { cancelRun, getRun, previewUrl } from "../lib/api";
import { useRun } from "../lib/use-run";
import { useSession } from "../lib/use-session";
import { acceptedMessage, selectedVersion } from "../lib/session-state";
import { useReadingFollow } from "../lib/use-reading-follow";
import { draftUrl, interruptTurn, updateSession } from "../lib/session-api";
import type { Entry } from "../lib/session-protocol";
import type { PageProgress } from "../lib/protocol";
import "./workbench.css";

const TALK = { key: "notale-talk-width", initial: 408, min: 320, share: 0.55 };
const done = (status?: string) => status === "completed";
const slideOf = (page: string) => Math.max(0, Number(/page-(\d+)/.exec(page)?.[1] ?? 1) - 1);
const EMBED = "?embed=1";

export function SessionView({ sessionId }: { sessionId: string }) {
  return <SessionWorkspace key={sessionId} sessionId={sessionId} />;
}

function SessionWorkspace({ sessionId }: { sessionId: string }) {
  const { t } = useLocale();
  const session = useSession(sessionId), { snapshot, live, typing, step, sending, connection, uncertain, reload } = session;
  const [picked, setPicked] = useState<string>(), [sentNames, setSentNames] = useState<Map<string, string>>(new Map());
  const [localError, setLocalError] = useState(""), [stopping, setStopping] = useState(false), [restoring, setRestoring] = useState(false);
  const [pendingRetry, setPendingRetry] = useState<PendingTurn>();
  const shell = useRef<HTMLElement>(null), stage = useRef<HTMLElement>(null);
  const [talkWidth, setTalkWidth] = useState(TALK.initial), [resizing, setResizing] = useState(false), [viewport, setViewport] = useState(0);
  const [focused, setFocused] = useState(false), [fullscreen, setFullscreen] = useState(false), [tab, setTab] = useState<"lecture" | "chat">("chat");
  const [pageRecord, setPageRecord] = useState<Record<string, string>>({}), [pageList, setPageList] = useState<{ runId: string; pages: PageProgress[] }>();
  const [pageError, setPageError] = useState(false), [pageRetry, setPageRetry] = useState(0);
  const maxTalk = Math.max(TALK.min, Math.round((viewport || 1400) * TALK.share));
  const clampTalk = useCallback((width: number) => Math.min(Math.max(width, TALK.min), maxTalk), [maxTalk]);
  useEffect(() => {
    try { const saved = Number(localStorage.getItem(TALK.key)); if (saved) setTalkWidth(saved); } catch { /* default */ }
    const measure = () => setViewport(shell.current?.clientWidth ?? window.innerWidth);
    const observer = new ResizeObserver(measure); if (shell.current) observer.observe(shell.current);
    measure();
    const full = () => setFullscreen(document.fullscreenElement === stage.current);
    document.addEventListener("fullscreenchange", full);
    return () => { observer.disconnect(); document.removeEventListener("fullscreenchange", full); };
  }, []);
  useEffect(() => {
    const renamed = (event: Event) => { if ((event as CustomEvent<{ id: string }>).detail.id === sessionId) reload(); };
    window.addEventListener("notale-session-updated", renamed);
    return () => window.removeEventListener("notale-session-updated", renamed);
  }, [sessionId, reload]);
  const resize = useCallback((input: { clientX: number } | { width: number }) => {
    const box = shell.current?.getBoundingClientRect();
    const width = clampTalk("width" in input ? input.width : (box ? box.right - input.clientX : TALK.initial));
    setTalkWidth(width);
    try { localStorage.setItem(TALK.key, String(width)); } catch { /* kept in memory */ }
  }, [clampTalk]);
  const entries = useMemo(() => [...(snapshot?.entries ?? []), ...live], [snapshot, live]);
  const reading = useReadingFollow(`${entries.length}:${typing}:${step?.label ?? ""}:${tab}`);
  const names = useMemo(() => new Map([...sentNames, ...(snapshot?.files ?? []).map(file => [file.id, file.name] as const)]), [snapshot, sentNames]);
  const runs = useMemo(() => {
    const ended = new Map(entries.flatMap(entry => entry.type === "finished" ? [[entry.runId, entry.status] as const] : []));
    return entries.flatMap(entry => entry.type === "run" ? [{ ...entry, status: ended.get(entry.runId) }] : []);
  }, [entries]);
  const version = (runId?: string) => runs.findIndex(run => run.runId === runId) + 1;
  const running = runs.findLast(run => !run.status), followed = useRun(running?.runId);
  const runningDone = running && ["completed", "failed", "cancelled"].includes(followed.run?.status ?? "") ? followed.run!.status : undefined;
  const finished = runs.filter(run => done(run.status) || (run.runId === running?.runId && done(runningDone)));
  const shown = selectedVersion(finished, picked), shownId = shown?.runId;
  const busy = sending || uncertain || !!snapshot?.busy || !!running && !runningDone;
  const genPage = useRef(""), [generationLanding, setGenerationLanding] = useState<{ runId: string; page: string }>();
  const viewing = useCallback((pageId: string) => { genPage.current = pageId; }, []);
  useEffect(() => {
    if (running?.kind === "generate" && done(runningDone) && genPage.current) setGenerationLanding({ runId: running.runId, page: genPage.current });
  }, [running?.runId, running?.kind, runningDone]);
  useEffect(() => { if (runningDone && !sending) reload(); }, [runningDone, sending, reload]);
  useEffect(() => {
    if (!shownId) return;
    let stopped = false;
    setPageError(false);
    void getRun(shownId).then(run => { if (!stopped) setPageList({ runId: shownId, pages: run.pages ?? [] }); }).catch(() => { if (!stopped) setPageError(true); });
    return () => { stopped = true; };
  }, [shownId, pageRetry]);
  const pages = pageList && pageList.runId === shownId ? pageList.pages : [];
  const landing = session.landing?.runId === shownId ? session.landing : generationLanding?.runId === shownId ? generationLanding : undefined;
  const selectedPage = shownId ? pageRecord[shownId] ?? landing?.page.replace(/\.html$/, "") ?? pages[0]?.pageId : undefined;
  const pageIndex = Math.max(0, pages.findIndex(page => page.pageId === selectedPage));
  const setPage = useCallback((page: string) => { if (shownId) setPageRecord(current => current[shownId] === page ? current : { ...current, [shownId]: page }); }, [shownId]);
  const playerViewing = useCallback((page: string) => setPage(page.replace(/\.html$/, "")), [setPage]);
  const pick = (runId: string) => { setPicked(runId); setTab("lecture"); };
  const send = useCallback(async (text: string, files: { id: string; name: string }[], onAccepted?: () => void) => {
    setLocalError("");
    setSentNames(current => new Map([...current, ...files.map(file => [file.id, file.name] as const)]));
    reading.latest();
    await session.send(text, files.map(file => file.id), onAccepted);
  }, [session.send, reading.latest]);
  useEffect(() => {
    if (!snapshot) return;
    const pending = peekPendingTurn(sessionId);
    if (!pending) return;
    if (acceptedMessage(snapshot, 0, pending.text, pending.files.map(file => file.id))) { ackPendingTurn(sessionId, pending.id); setPendingRetry(undefined); return; }
    if (snapshot.busy || sending || uncertain) return;
    if (pending.claimed) { setPendingRetry(pending); return; }
    if (snapshot.entries.some(entry => entry.type === "user")) { setPendingRetry(pending); return; }
    const claimed = claimPendingTurn(sessionId);
    if (claimed) void send(claimed.text, claimed.files).catch(() => setPendingRetry(claimed));
  }, [snapshot, sessionId, sending, uncertain, send]);
  const retryPending = async () => {
    if (!pendingRetry || busy) return;
    releasePendingTurn(sessionId, pendingRetry.id);
    const pending = claimPendingTurn(sessionId);
    if (pending) { setPendingRetry(undefined); try { await send(pending.text, pending.files); } catch { setPendingRetry(pending); } }
  };
  const stop = async () => {
    if (stopping) return;
    setStopping(true); setLocalError("");
    try { await interruptTurn(sessionId); }
    catch (cause) {
      if (running && !runningDone) { try { await cancelRun(running.runId); } catch (fallback) { setLocalError(fallback instanceof Error ? fallback.message : t("停止失败", "Could not stop")); } }
      else setLocalError(cause instanceof Error ? cause.message : t("停止失败", "Could not stop"));
    } finally { setStopping(false); }
  };
  const restore = async () => {
    setRestoring(true);
    try { await updateSession(sessionId, { archived: false }); reload(); }
    catch (cause) { setLocalError(cause instanceof Error ? cause.message : t("恢复失败", "Could not restore")); }
    finally { setRestoring(false); }
  };
  const toggleFullscreen = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await stage.current?.requestFullscreen(); }
    catch { setLocalError(t("浏览器无法进入全屏，可使用专注预览", "Fullscreen is unavailable. Use focus view instead.")); }
  };
  const lastUser = entries.findLastIndex(entry => entry.type === "user");
  const fixing = entries.slice(lastUser).findLast(entry => entry.type === "understood" && entry.route.action === "fix");
  const target = fixing?.type === "understood" && fixing.route.action === "fix" ? fixing.route.target : undefined;
  const sources = useMemo(() => target ? { draft: new UrlSource(file => draftUrl(sessionId, file)), original: new UrlSource(file => previewUrl(target, file)) } : undefined, [sessionId, target]);
  const draft = session.draft && (!picked || picked === target) ? session.draft : undefined;
  const showGeneration = !draft && running?.kind === "generate" && !runningDone && !picked;
  const stateOf = (run: (typeof runs)[number]): RunView["state"] => {
    const status = run.status ?? (run.runId === running?.runId ? runningDone : undefined);
    return done(status) ? "done" : status === "cancelled" ? "stopped" : status ? "failed" : "working";
  };
  const progressOf = (run: (typeof runs)[number]) => run.kind === "generate" && run.runId === running?.runId && followed.run
    ? t(`${publicPhase[followed.run.phase ?? "starting"] ?? "生成中"} · ${followed.progress.pages.filter(page => page.state === "ready").length}/${followed.progress.pages.length || "?"} 页`, `${followed.progress.pages.filter(page => page.state === "ready").length}/${followed.progress.pages.length || "?"} pages ready`) : undefined;
  const turns = exchanges(entries);
  const generated = entries.find(entry => entry.type === "understood" && entry.route.action === "generate");
  const inferred = generated?.type === "understood" && generated.route.action === "generate" ? generated.route.title : undefined;
  const title = snapshot?.title || inferred || (entries.find(entry => entry.type === "user") as Extract<Entry, { type: "user" }> | undefined)?.text || t("新讲义", "New lecture");
  const versions: VersionItem[] = finished.map(run => ({ runId: run.runId, version: version(run.runId), kind: run.kind, at: run.at, ...(run.basedOn ? { basedOn: version(run.basedOn) } : {}) }));
  const error = localError || session.error;
  const download = shownId ? `/notale-api/v1/runs/${encodeURIComponent(shownId)}/download?format=notale` : "";
  const canPreview = !!(draft || shown || showGeneration);
  return <main ref={shell} className={`session-shell workbench${resizing ? " is-resizing" : ""}${focused ? " is-focused" : ""}`} data-mobile-tab={tab} style={{ "--talk-width": `${clampTalk(talkWidth)}px` } as CSSProperties}>
    <header className="workbench-header"><h1 title={title}>{title}</h1>
      {snapshot?.archived && <button type="button" className="workbench-restore" onClick={() => void restore()} disabled={restoring}><ArchiveRestore size={14} />{t("恢复讲义", "Restore lecture")}</button>}
      <span className={`workbench-connection is-${connection}`} role="status">{stopping ? t("正在停止", "Stopping") : connection === "reconnecting" ? t("正在恢复连接", "Reconnecting") : connection === "offline" ? t("连接中断", "Disconnected") : busy ? t("正在处理", "Working") : snapshot?.archived ? t("已归档", "Archived") : ""}</span>
    </header>
    <div className="workbench-tabs" role="tablist" aria-label={t("工作区", "Workspace")} onKeyDown={event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? "lecture" : event.key === "End" ? "chat" : tab === "lecture" ? "chat" : "lecture";
      setTab(next); event.currentTarget.querySelector<HTMLButtonElement>(`#${next}-tab`)?.focus();
    }}>
      <button type="button" role="tab" id="lecture-tab" tabIndex={tab === "lecture" ? 0 : -1} aria-selected={tab === "lecture"} aria-controls="lecture-panel" onClick={() => setTab("lecture")}><Presentation size={16} />{t("讲义", "Lecture")}</button>
      <button type="button" role="tab" id="chat-tab" tabIndex={tab === "chat" ? 0 : -1} aria-selected={tab === "chat"} aria-controls="chat-panel" onClick={() => setTab("chat")}><MessageSquare size={16} />{t("对话", "Chat")}</button>
    </div>
    <div className="workbench-body">
      <section ref={stage} className="session-stage workbench-stage" id="lecture-panel" aria-label={t("讲义预览", "Lecture preview")}>
        <div className="workbench-toolbar">
          {shown && !draft ? <VersionMenu versions={versions} shown={shown.runId} onPick={pick} download={download} /> : draft ? <span className="workbench-draft" role="status"><i />{t("修改中的草稿", "Live draft")}</span> : <span />}
          <div className="workbench-actions">
            {shown && !draft && <><a className="workbench-icon" href={download} download aria-label={t("下载讲义", "Download lecture")} title={t("下载讲义", "Download lecture")}><Download size={16} /></a><EditInEditor key={shown.runId} runId={shown.runId} sessionId={sessionId} version={version(shown.runId)} /></>}
            {canPreview && <><button type="button" className="workbench-icon" aria-pressed={focused} aria-label={t(focused ? "显示对话" : "专注预览", focused ? "Show chat" : "Focus preview")} title={t(focused ? "显示对话" : "专注预览", focused ? "Show chat" : "Focus preview")} onClick={() => setFocused(value => !value)}>{focused ? <PanelRightOpen size={16} /> : <PanelRightClose size={16} />}</button>
              <button type="button" className="workbench-icon" aria-label={t(fullscreen ? "退出全屏" : "全屏预览", fullscreen ? "Exit fullscreen" : "Fullscreen preview")} title={t(fullscreen ? "退出全屏" : "全屏预览", fullscreen ? "Exit fullscreen" : "Fullscreen preview")} onClick={() => void toggleFullscreen()}>{fullscreen ? <Minimize size={16} /> : <Maximize size={16} />}</button></>}
          </div>
        </div>
        <div className={"workbench-canvas" + (shown && !draft && !showGeneration && pages.length ? " has-pages" : "")}>
          {shown && !draft && !showGeneration && !!pages.length && <PageRail pages={pages} selected={selectedPage} onSelect={setPage} urlOf={page => page.previewUrl ? `/notale-api${page.previewUrl}?embed=1` : previewUrl(shown.runId, `${page.pageId}.html`) + EMBED} />}
          <div className="workbench-player">
            {(draft || shown && !showGeneration) && <LecturePane src={draft ? `${draftUrl(sessionId)}${EMBED}#/${slideOf(draft.page)}` : `${previewUrl(shown!.runId)}${EMBED}#/${pages.length ? pageIndex : slideOf(selectedPage ?? "page-01")}`}
              title={draft ? t("修改中的草稿", "Live draft") : t(`讲义 · 版本 ${version(shown!.runId)}`, `Lecture · Version ${version(shown!.runId)}`)}
              {...(draft && sources ? { live: { index: draftUrl(sessionId) + EMBED, ...sources, page: draft.page, revision: draft.revision } } : { onViewing: playerViewing })} />}
            {showGeneration ? <GenerationView state={followed.progress} phase={followed.run?.phase} status={t(publicPhase[followed.run?.phase ?? "starting"] ?? "生成中", "Generating lecture")} onViewing={viewing} />
              : !draft && !shown && <div className="workbench-empty" aria-hidden="true"><img src="/brand/notale-mark.svg" alt="" /></div>}
          </div>
        </div>
        {shown && !draft && !showGeneration && pages.length > 0 && <nav className="workbench-page-nav" aria-label={t("翻页", "Page navigation")}>
          <button type="button" className="workbench-icon" disabled={pageIndex === 0} onClick={() => setPage(pages[pageIndex - 1]!.pageId)} aria-label={t("上一页", "Previous page")} title={t("上一页", "Previous page")}><ChevronLeft size={16} /></button>
          <span>{pageIndex + 1} / {pages.length}</span><button type="button" className="workbench-icon" disabled={pageIndex >= pages.length - 1} onClick={() => setPage(pages[pageIndex + 1]!.pageId)} aria-label={t("下一页", "Next page")} title={t("下一页", "Next page")}><ChevronRight size={16} /></button>
        </nav>}
        {pageError && <button type="button" className="workbench-retry-pages" onClick={() => setPageRetry(value => value + 1)}>{t("页面列表加载失败，重试", "Page list could not load. Retry")}</button>}
      </section>
      <SplitHandle value={clampTalk(talkWidth)} min={TALK.min} max={maxTalk} label={t("调整对话面板宽度", "Resize conversation panel")} onResize={resize} onDragging={setResizing} onReset={() => resize({ width: TALK.initial })} />
      <aside className="session-talk workbench-talk" id="chat-panel" aria-label={t("对话", "Conversation")}>
        <header className="workbench-chat-head"><span>{t("与 Notale 对话", "Chat with Notale")}</span>{(connection === "offline" || connection === "reconnecting") && <button type="button" className="workbench-icon" onClick={session.reconnect} aria-label={t("重新连接", "Reconnect")} title={t("重新连接", "Reconnect")}><RefreshCw size={14} /></button>}</header>
        <div className="workbench-log-wrap"><div ref={reading.log} className="session-log" tabIndex={0} aria-label={t("对话记录", "Conversation history")} aria-busy={!snapshot}>
          <div ref={reading.content} className="workbench-messages">
            {!snapshot && !error && <div className="talk-skeleton" aria-hidden="true"><i /><i /><i /></div>}
            {turns.map((turn, index) => {
              const last = index === turns.length - 1;
              const views: RunView[] = turn.runs.map(entry => {
                const run = runs.find(item => item.runId === entry.runId)!;
                return { runId: entry.runId, kind: entry.kind, version: version(entry.runId), state: stateOf(run), shown: shown?.runId === entry.runId,
                  ...(entry.basedOn ? { basedOn: version(entry.basedOn) } : {}), ...(progressOf(run) ? { progress: progressOf(run)! } : {}) };
              });
              const why = turn.understood?.reason;
              const hasReply = views.length || turn.replies.length || turn.question || last && (sending || typing || error);
              return <Fragment key={index}>
                {turn.user && <UserBubble entry={turn.user} names={names} sessionId={sessionId} />}
                {hasReply && <IstarCard runs={views} replies={turn.replies} question={turn.question?.text} understood={why} typing={last ? typing : undefined}
                  thinking={last && sending} step={last ? step?.label : undefined} error={last ? error : undefined} onPick={pick}
                  options={last && turn.question?.options?.length ? <div className="talk-options" role="group" aria-label={t("回答澄清问题", "Answer clarification")}>{turn.question.options.map(option => <button key={option} type="button" disabled={busy || snapshot?.archived} onClick={() => { void send(option, []).catch(cause => setLocalError(cause instanceof Error ? cause.message : t("发送失败", "Could not send"))); }}>{option}</button>)}</div> : undefined} />}
              </Fragment>;
            })}
            {error && !turns.length && <p className="talk-error" role="alert">{error}</p>}
            {uncertain && <p className="talk-recovery" role="status">{t("正在确认消息是否已送达，输入与附件已保留。", "Checking whether your message was received. Your draft and attachments are preserved.")}</p>}
            {pendingRetry && !busy && <div className="talk-recovery"><p>{t("首页的输入已保留，消息尚未确认发送。", "Your home-page draft is preserved. Sending has not been confirmed.")}</p><p>{pendingRetry.text}</p><button type="button" onClick={() => void retryPending()}>{t("发送保留的输入", "Send preserved draft")}</button></div>}
          </div>
        </div>{reading.paused && <button type="button" className="workbench-latest" onClick={reading.latest}><ArrowDown size={14} />{t("回到最新", "Jump to latest")}</button>}</div>
        <div className="session-compose"><Composer key={sessionId} draftKey={`session:${sessionId}`} session={async () => sessionId} busy={busy || !snapshot || snapshot.archived}
          onStop={busy && !uncertain && !snapshot?.archived ? () => void stop() : undefined}
          placeholder={snapshot?.archived ? t("恢复讲义后继续对话", "Restore this lecture to continue") : finished.length ? t("修改要求或问题", "Changes or questions") : t("讲义主题或要求", "Topic or instructions")} onSend={send} /></div>
      </aside>
    </div>
  </main>;
}
