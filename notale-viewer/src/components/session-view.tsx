"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Composer } from "./composer";
import { IstarCard, UserBubble, exchanges, type RunView } from "./talk";
import { VersionMenu, type VersionItem } from "./version-menu";
import { EditInEditor } from "./edit-in-editor";
import { PixelWordmark } from "./start/pixel-wordmark";
import { SplitHandle } from "./split-handle";
import { LecturePane } from "./lecture-pane";
import { UrlSource } from "../lib/live/live-draft";
import { rememberSession } from "../lib/recent-sessions";
import { GenerationView } from "./generation/generation-view";
import { publicPhase } from "./run-experience";
import { pendingKey } from "./home-composer";
import { cancelRun, previewUrl } from "../lib/api";
import { useRun } from "../lib/use-run";
import { draftUrl, followTurn, getSession, interruptTurn, sendTurn } from "../lib/session-api";
import type { Entry, SessionSnapshot, TurnEvent } from "../lib/session-protocol";

type Step = { label: string; status?: string };
type Draft = { page: string; revision: number };
/** Reveal's slide index for a page file. ponytail: assumes page-NN numbering has no gaps, which is
 * how the generator writes it; a gap only lands the draft one page off. */
const slideOf = (page: string) => Math.max(0, Number(/page-(\d+)/.exec(page)?.[1] ?? 1) - 1);
/** The conversation panel: 380 px by default, between 300 px and 55 % of the window. */
const TALK = { key: "notale-talk-width", initial: 380, min: 300, share: 0.55 };
const done = (status?: string) => status === "completed";
/** Lectures shown inside the viewer: the player drops its own backdrop and lets the stage show through. */
const EMBED = "?embed=1";

/** A conversation about lectures: the lecture on the left, what was said on the right. Every
 * generation or change is a version; the newest finished one is shown unless the author picks
 * another. While a change is being made, the left shows its draft as it is written. A message runs
 * on the server: a reload rebuilds the record and picks the message in flight up again. */
export function SessionView({ sessionId }: { sessionId: string }) {
  const [snapshot, setSnapshot] = useState<SessionSnapshot>();
  const [live, setLive] = useState<Entry[]>([]);
  const [step, setStep] = useState<Step>();
  const [draft, setDraft] = useState<Draft>();
  const [typing, setTyping] = useState("");
  // A change's new version opens on the page the draft was last on.
  const [landing, setLanding] = useState<{ runId: string; page: string }>();
  const draftPage = useRef("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<string>();
  // Names of files sent from this page, shown before the session record has them.
  const [sentNames, setSentNames] = useState<Map<string, string>>(new Map());
  const log = useRef<HTMLDivElement>(null), sentPending = useRef(false), following = useRef(false), shell = useRef<HTMLElement>(null);
  const [talkWidth, setTalkWidth] = useState(TALK.initial), [resizing, setResizing] = useState(false), [viewport, setViewport] = useState(0);
  const maxTalk = Math.max(TALK.min, Math.round((viewport || 1400) * TALK.share));
  const clampTalk = useCallback((width: number) => Math.min(Math.max(width, TALK.min), maxTalk), [maxTalk]);
  useEffect(() => {
    try { const saved = Number(localStorage.getItem(TALK.key)); if (saved) setTalkWidth(saved); } catch { /* the default width */ }
    const measure = () => setViewport(shell.current?.clientWidth ?? window.innerWidth);
    measure(); window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  const resize = useCallback((input: { clientX: number } | { width: number }) => {
    const box = shell.current?.getBoundingClientRect();
    const width = clampTalk("width" in input ? input.width : (box ? box.right - input.clientX : TALK.initial));
    setTalkWidth(width);
    try { localStorage.setItem(TALK.key, String(width)); } catch { /* kept for this visit only */ }
  }, [clampTalk]);

  const reload = useCallback(async () => { const next = await getSession(sessionId); setSnapshot(next); setLive([]); return next; }, [sessionId]);
  useEffect(() => { void reload().catch(cause => setError(cause instanceof Error ? cause.message : "会话打不开")); }, [reload]);

  const entries = useMemo(() => [...(snapshot?.entries ?? []), ...live], [snapshot, live]);
  // Named by the title the first generation got, else by the first message (here and on the start page).
  const named = entries.find(entry => entry.type === "understood" && entry.route.action === "generate");
  const firstWords = (named?.type === "understood" && named.route.action === "generate" ? named.route.title : undefined)
    ?? entries.find(entry => entry.type === "user")?.text;
  const names = useMemo(() => new Map([...sentNames, ...(snapshot?.files ?? []).map(file => [file.id, file.name] as const)]), [snapshot, sentNames]);
  // Versions in the order they were made; a run's status comes from its finished entry.
  const runs = useMemo(() => {
    const ended = new Map(entries.flatMap(entry => entry.type === "finished" ? [[entry.runId, entry.status] as const] : []));
    return entries.flatMap(entry => entry.type === "run" ? [{ ...entry, status: ended.get(entry.runId) }] : []);
  }, [entries]);
  const version = (runId?: string) => runs.findIndex(run => run.runId === runId) + 1;
  const running = runs.findLast(run => !run.status);
  const followed = useRun(running?.runId);
  const runningDone = running && ["completed", "failed", "cancelled"].includes(followed.run?.status ?? "") ? followed.run!.status : undefined;
  const finished = runs.filter(run => done(run.status) || (run.runId === running?.runId && done(runningDone)));
  const shown = finished.find(run => run.runId === picked) ?? finished.at(-1);

  // A new finished version replaces what is shown, unless the author is looking at an older one on purpose.
  const newest = finished.at(-1)?.runId;
  useEffect(() => { setPicked(undefined); }, [newest]);
  useEffect(() => { const node = log.current; if (node) node.scrollTop = node.scrollHeight; }, [entries.length, typing]);
  // A generated lecture opens on the page the author was looking at while it was being made.
  const genPage = useRef("");
  const viewing = useCallback((pageId: string) => { genPage.current = pageId; }, []);
  useEffect(() => { if (running?.kind === "generate" && done(runningDone) && genPage.current) setLanding({ runId: running.runId, page: genPage.current }); }, [running, runningDone]);
  // A run followed to its end outside a turn stream (after a reload): refresh the record.
  useEffect(() => { if (runningDone && !sending) void reload(); }, [runningDone, sending, reload]);

  const onEvent = useCallback((event: TurnEvent) => {
    const stamp = new Date().toISOString();
    if (event.type === "understood") setLive(current => [...current, { type: "understood", route: event.route, at: stamp }]);
    else if (event.type === "question") setLive(current => [...current, { type: "question", text: event.text, ...(event.options ? { options: event.options } : {}), at: stamp }]);
    else if (event.type === "reply") { setTyping(""); setLive(current => [...current, { type: "reply", text: event.text, at: stamp }]); }
    else if (event.type === "run") setLive(current => [...current, { type: "run", runId: event.runId, kind: event.kind, ...(event.basedOn ? { basedOn: event.basedOn } : {}), at: stamp }]);
    else if (event.type === "result") { if (draftPage.current) setLanding({ runId: event.runId, page: draftPage.current }); setDraft(undefined); setLive(current => [...current, { type: "finished", runId: event.runId, status: event.status, at: stamp }]); }
    else if (event.type === "working") {
      const work = event.event;
      if (work.type === "step" && work.label) setStep({ label: work.label, status: work.status });
      else if (work.type === "text") setTyping(current => work.reset ? "" : current + (work.delta ?? ""));
      else if (work.type === "draft" && work.page) { draftPage.current = work.page; setDraft({ page: work.page, revision: work.revision ?? 0 }); }
    } else if (event.type === "error") setError(event.message);
  }, []);
  /** Listens to one message to its end, then rebuilds from the record. */
  const listen = useCallback(async (stream: () => Promise<void>) => {
    setSending(true); setError(""); setStep(undefined); setTyping(""); setDraft(undefined); draftPage.current = "";
    try { await stream(); await reload(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "发送失败"); await reload().catch(() => {}); }
    finally { setSending(false); setStep(undefined); setTyping(""); setDraft(undefined); }
  }, [reload]);
  const send = useCallback(async (text: string, files: { id: string; name: string }[]) => {
    setSentNames(current => new Map([...current, ...files.map(file => [file.id, file.name] as const)]));
    setLive(current => [...current, { type: "user", text, files: files.map(file => file.id), at: new Date().toISOString() }]);
    await listen(() => sendTurn(sessionId, text, files.map(file => file.id), onEvent));
  }, [sessionId, listen, onEvent]);
  // A message still running (sent before a reload, or from another tab): replay it and follow the rest.
  useEffect(() => {
    if (!snapshot?.busy || sending || following.current) return;
    following.current = true;
    // What already happened is in the record; a replayed record event only means "read it again".
    const replayed = (event: TurnEvent) => {
      if (!["understood", "question", "reply", "run", "result"].includes(event.type)) return onEvent(event);
      if (event.type === "result") { if (draftPage.current) setLanding({ runId: event.runId, page: draftPage.current }); setDraft(undefined); }
      if (event.type === "reply") setTyping("");
      void reload();
    };
    void listen(() => followTurn(sessionId, replayed)).finally(() => { following.current = false; });
  }, [snapshot, sending, sessionId, listen, onEvent, reload]);
  const stop = useCallback(async () => {
    try { await interruptTurn(sessionId); }
    catch { if (running && !runningDone) await cancelRun(running.runId).catch(cause => setError(cause instanceof Error ? cause.message : "停止失败")); }
  }, [sessionId, running, runningDone]);

  // The first message, handed over by the home page.
  useEffect(() => {
    if (!snapshot || sentPending.current) return;
    sentPending.current = true;
    let pending: { text: string; files: { id: string; name: string }[] } | undefined;
    try { const raw = sessionStorage.getItem(pendingKey(sessionId)); if (raw) { pending = JSON.parse(raw); sessionStorage.removeItem(pendingKey(sessionId)); } } catch { /* nothing handed over */ }
    if (pending && !snapshot.busy && !snapshot.entries.some(entry => entry.type === "user")) void send(pending.text, pending.files ?? []);
  }, [snapshot, sessionId, send]);

  const lastUser = entries.findLastIndex(entry => entry.type === "user");
  // The run being changed right now: the draft starts as a copy of it.
  const fixing = entries.slice(lastUser).findLast(entry => entry.type === "understood" && entry.route.action === "fix");
  const target = fixing?.type === "understood" && fixing.route.action === "fix" ? fixing.route.target : undefined;
  const sources = useMemo(() => target ? {
    draft: new UrlSource(file => draftUrl(sessionId, file)),
    original: new UrlSource(file => previewUrl(target, file)),
  } : undefined, [sessionId, target]);
  const busy = sending || !!snapshot?.busy || !!running && !runningDone;
  // What each run came to, for its badge and the version menu.
  const stateOf = (run: (typeof runs)[number]): RunView["state"] => {
    const status = run.status ?? (run.runId === running?.runId ? runningDone : undefined);
    return done(status) ? "done" : status === "cancelled" ? "stopped" : status ? "failed" : "working";
  };
  const progressOf = (run: (typeof runs)[number]) => run.kind === "generate" && run.runId === running?.runId && followed.run
    ? `${publicPhase[followed.run.phase ?? "starting"] ?? "生成中"} · ${followed.progress.pages.filter(page => page.state === "ready").length}/${followed.progress.pages.length || "?"} 页` : undefined;
  const turns = exchanges(entries);
  const title = firstWords?.replace(/\s+/g, " ").trim();
  const versions: VersionItem[] = finished.map(run => ({ runId: run.runId, version: version(run.runId), kind: run.kind, at: run.at, ...(run.basedOn ? { basedOn: version(run.basedOn) } : {}) }));
  useEffect(() => { if (firstWords) rememberSession(sessionId, firstWords.slice(0, 80), finished.length, busy); }, [sessionId, firstWords, finished.length, busy]);
  return (
    <main ref={shell} className={"session-shell" + (resizing ? " is-resizing" : "")} style={{ "--talk-width": `${clampTalk(talkWidth)}px` } as CSSProperties}>
      <section className="session-stage">
        {(draft || shown) && <LecturePane
          src={draft ? `${draftUrl(sessionId)}${EMBED}#/${slideOf(draft.page)}` : previewUrl(shown!.runId) + EMBED + (landing?.runId === shown!.runId ? `#/${slideOf(landing.page)}` : "")}
          title={draft ? "修改中的草稿" : `讲义 v${version(shown!.runId)}`}
          {...(draft && sources ? { live: { index: draftUrl(sessionId) + EMBED, ...sources, page: draft.page, revision: draft.revision } } : {})} />}
        {draft ? <>
          <div className="stage-draft" role="status"><i /><span>{step?.label ?? "准备草稿"}</span><em>草稿</em></div>
        </> : shown ? <>
          {busy && <div className="stage-busy" role="status" aria-label="处理中"><i /></div>}
          <div className="stage-bar">
            <VersionMenu versions={versions} shown={shown.runId} onPick={setPicked} download={`/notale-api/v1/runs/${encodeURIComponent(shown.runId)}/download?format=notale`} />
            <EditInEditor key={shown.runId} runId={shown.runId} sessionId={sessionId} version={version(shown.runId)} />
          </div>
        </> : running && running.kind === "generate" ? <div className="stage-progress" id="generation-panel">
          <GenerationView state={followed.progress} phase={followed.run?.phase} status={publicPhase[followed.run?.phase ?? "starting"] ?? "生成中"} onViewing={viewing} />
        </div> : <div className="stage-empty">{snapshot && <div className="stage-mark" aria-hidden="true"><PixelWordmark /></div>}</div>}
      </section>
      <SplitHandle value={clampTalk(talkWidth)} min={TALK.min} max={maxTalk} label="调整对话面板宽度" onResize={resize} onDragging={setResizing} onReset={() => resize({ width: TALK.initial })} />
      <aside className="session-talk">
        <header className="session-head">
          {title && <h1 className="session-title" title={title}>{title}</h1>}
        </header>
        <div ref={log} className="session-log" aria-live="polite" aria-busy={!snapshot}>
          {!snapshot && !error && <div className="talk-skeleton" aria-hidden="true"><i /><i /><i /></div>}
          {turns.map((turn, index) => {
            const last = index === turns.length - 1;
            const views: RunView[] = turn.runs.map(entry => {
              const run = runs.find(item => item.runId === entry.runId)!;
              return { runId: entry.runId, kind: entry.kind, version: version(entry.runId), state: stateOf(run), shown: shown?.runId === entry.runId,
                ...(entry.basedOn ? { basedOn: version(entry.basedOn) } : {}), ...(progressOf(run) ? { progress: progressOf(run)! } : {}) };
            });
            const route = turn.understood, why = route && (route.action === "generate" || route.action === "fix") ? route.reason : undefined;
            const hasIstar = views.length || turn.replies.length || turn.question || (last && (sending || typing || error));
            return <Fragment key={index}>
              {turn.user && <UserBubble entry={turn.user} names={names} />}
              {hasIstar && <IstarCard runs={views} replies={turn.replies} {...(turn.question ? { question: turn.question.text } : {})} {...(why ? { understood: why } : {})}
                {...(last && typing ? { typing } : {})} thinking={last && sending} {...(last && error ? { error } : {})} onPick={setPicked}
                options={last && turn.question?.options?.length ? <div className="talk-options">{turn.question.options.map(option => <button key={option} type="button" disabled={busy} onClick={() => void send(option, [])}>{option}</button>)}</div> : undefined} />}
            </Fragment>;
          })}
          {error && !turns.length && <p className="talk-error" role="alert">{error}</p>}
        </div>
        <div className="session-compose">
          <Composer session={async () => sessionId} busy={busy} onStop={() => void stop()} placeholder={finished.length ? "想怎么改？比如：把第 3 页改成两栏" : "想做一份什么样的讲义？"} onSend={send} />
        </div>
      </aside>
    </main>
  );
}
