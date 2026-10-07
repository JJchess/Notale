import { sameModel, type ModelRef } from "./models";
import type { Entry, SessionSnapshot, TurnEvent } from "./session-protocol";

export type Connection = "loading" | "ready" | "streaming" | "reconnecting" | "offline";
export interface SessionState {
  snapshot?: SessionSnapshot;
  live: Entry[];
  typing: string;
  step?: { label: string; status?: string };
  draft?: { page: string; revision: number };
  landing?: { runId: string; page: string };
  connection: Connection;
  sending: boolean;
  uncertain: boolean;
  error: string;
}
export interface SessionTransport {
  get(): Promise<SessionSnapshot>;
  send(text: string, files: string[], onEvent: (event: TurnEvent) => void, signal: AbortSignal, model?: ModelRef): Promise<void>;
  follow(onEvent: (event: TurnEvent) => void, signal: AbortSignal): Promise<void>;
}
const recorded = new Set(["understood", "question", "reply", "run", "result"]);
const message = (cause: unknown) => cause instanceof Error ? cause.message : String(cause);
export const initialSessionState = (): SessionState => ({ live: [], typing: "", connection: "loading", sending: false, uncertain: false, error: "" });
export function selectedVersion<T extends { runId: string }>(finished: T[], picked?: string): T | undefined {
  return finished.find(run => run.runId === picked) ?? finished.at(-1);
}
export function acceptedMessage(snapshot: SessionSnapshot, baseline: number, text: string, files: string[], model?: ModelRef) {
  return snapshot.entries.slice(baseline).some(entry => entry.type === "user" && sameModel(entry.model, model) && entry.text === text && entry.files.length === files.length && entry.files.every((id, index) => id === files[index]));
}

/** One mounted session owns one subscription. Reconnection always reads the server record and
 * follows the existing turn; a failed POST is never automatically sent again. */
export class SessionClient {
  state = initialSessionState();
  private closed = false;
  private controller?: AbortController;
  private timer?: ReturnType<typeof setTimeout>;
  private generation = 0;
  private attempt = 0;
  private draftPage = "";
  private refreshing = false;
  private submitting = false;
  private refreshAgain = false;
  private pending?: { model?: ModelRef; text: string; files: string[]; baseline: number; accept?: () => void; accepted: boolean };

  constructor(private transport: SessionTransport, private changed: (state: SessionState) => void, private refreshed?: () => void, private retryDelay = 1000) {}
  private patch(change: Partial<SessionState>) {
    if (this.closed) return;
    this.state = { ...this.state, ...change };
    this.changed(this.state);
  }
  private accept() {
    const pending = this.pending;
    if (!pending || pending.accepted) return;
    pending.accepted = true;
    pending.accept?.();
  }
  private async read() {
    const generation = this.generation;
    const snapshot = await this.transport.get();
    if (this.closed || generation !== this.generation) return snapshot;
    if (this.pending && acceptedMessage(snapshot, this.pending.baseline, this.pending.text, this.pending.files, this.pending.model)) this.accept();
    const recovered = this.state.uncertain && this.pending?.accepted;
    this.patch({ snapshot, live: [], uncertain: false, ...(recovered ? { error: "" } : {}) });
    this.refreshed?.();
    return snapshot;
  }
  /** Replayed record events prompt a canonical read; coalescing guarantees a late event gets a
   * fresh read too, without appending the replay to messages already in the snapshot. */
  private async refreshRecord() {
    this.refreshAgain = true;
    if (this.refreshing) return;
    this.refreshing = true;
    try {
      while (this.refreshAgain && !this.closed) { this.refreshAgain = false; await this.read(); }
    } catch { /* The connection loop reconciles after stream completion or disconnect. */ }
    finally { this.refreshing = false; }
  }
  private event(event: TurnEvent, replay: boolean) {
    if (this.closed) return;
    if (!replay && event.type !== "error") this.accept();
    const at = new Date().toISOString();
    let entry: Entry | undefined;
    if (event.type === "working") {
      const work = event.event;
      if (work.type === "step" && work.label) this.patch({ step: { label: work.label, status: work.status } });
      if (work.type === "text") this.patch({ typing: work.reset ? "" : this.state.typing + (work.delta ?? "") });
      if (work.type === "draft" && work.page) {
        this.draftPage = work.page;
        this.patch({ draft: { page: work.page, revision: work.revision ?? 0 } });
      }
    } else if (event.type === "error") this.patch({ error: event.message });
    else if (event.type === "result") {
      this.patch({ draft: undefined, ...(this.draftPage && event.status === "completed" ? { landing: { runId: event.runId, page: this.draftPage } } : {}) });
      entry = { type: "finished", runId: event.runId, status: event.status, at };
    } else if (event.type === "reply") { this.patch({ typing: "" }); entry = { type: "reply", text: event.text, at }; }
    else if (event.type === "understood") entry = { type: "understood", route: event.route, at };
    else if (event.type === "question") entry = { type: "question", text: event.text, options: event.options, at };
    else if (event.type === "run") entry = { ...event, at };
    if (replay && recorded.has(event.type)) void this.refreshRecord();
    else if (entry) this.patch({ live: [...this.state.live, entry] });
  }
  private schedule() {
    if (this.closed || this.timer) return;
    this.patch({ connection: this.attempt > 2 ? "offline" : "reconnecting" });
    this.timer = setTimeout(() => { this.timer = undefined; void this.connect(); }, Math.min(8000, this.retryDelay * 2 ** Math.min(this.attempt++, 3)));
  }
  async connect() {
    if (this.closed || this.controller || this.submitting) return;
    clearTimeout(this.timer); this.timer = undefined;
    const token = ++this.generation;
    try {
      const snapshot = await this.read();
      if (this.closed || token !== this.generation) return;
      if (!snapshot.busy) {
        this.attempt = 0;
        this.patch({ connection: "ready", sending: false, typing: "", draft: undefined, step: undefined });
        return;
      }
      const controller = this.controller = new AbortController();
      this.patch({ connection: "streaming", sending: true, typing: "" });
      try { await this.transport.follow(event => this.event(event, true), controller.signal); }
      finally { if (this.controller === controller) this.controller = undefined; }
      if (this.closed || token !== this.generation) return;
      const settled = await this.read();
      if (settled.busy) this.schedule();
      else { this.attempt = 0; this.patch({ connection: "ready", sending: false, typing: "", step: undefined, draft: undefined }); }
    } catch {
      if (!this.closed && token === this.generation) this.schedule();
    }
  }
  async send(text: string, files: string[], onAccepted?: () => void, model?: ModelRef) {
    if (this.closed || this.controller || this.state.sending || this.state.uncertain || this.state.snapshot?.busy) throw new Error("A message is already being processed");
    clearTimeout(this.timer); this.timer = undefined;
    ++this.generation;
    const controller = this.controller = new AbortController();
    this.submitting = true;
    this.pending = { text, files, ...(model ? { model: { ...model } } : {}), baseline: this.state.snapshot?.entries.length ?? 0, accept: onAccepted, accepted: false };
    this.draftPage = "";
    this.patch({ sending: true, error: "", connection: "streaming", typing: "", step: undefined, draft: undefined,
      live: [{ type: "user", text, files, ...(model ? { model: { ...model } } : {}), at: new Date().toISOString() }] });
    let failure: unknown;
    try { await this.transport.send(text, files, event => this.event(event, false), controller.signal, this.pending?.model); }
    catch (cause) { failure = cause; }
    finally { if (this.controller === controller) this.controller = undefined; }
    if (this.closed) { this.submitting = false; return; }
    try {
      const snapshot = await this.read();
      this.submitting = false;
      const accepted = this.pending?.accepted;
      this.patch({ sending: snapshot.busy, connection: snapshot.busy ? "reconnecting" : "ready", typing: "", draft: undefined, step: undefined });
      if (snapshot.busy) void this.connect();
      if (!accepted) { this.patch({ error: message(failure ?? "Message was not accepted") }); throw failure ?? new Error("Message was not accepted"); }
    } catch (cause) {
      this.submitting = false;
      if (this.pending?.accepted) { this.schedule(); return; }
      // A completed read proves rejection. A failed read leaves acceptance unknown: block resends
      // until a later canonical read can resolve it, retaining the composer's draft meanwhile.
      const wasRead = this.state.connection === "ready" || this.state.connection === "reconnecting";
      if (!wasRead) { this.patch({ uncertain: true, error: message(failure ?? cause) }); this.schedule(); }
      throw cause;
    }
  }
  /** Refreshes idle records (e.g. a rename from the sidebar); never creates another subscription. */
  async refresh() {
    if (this.controller) {
      // Renaming is allowed during generation. Refresh metadata without replacing the in-flight
      // optimistic transcript or opening a second stream.
      try {
        const snapshot = await this.transport.get();
        if (this.state.snapshot) this.patch({ snapshot: { ...this.state.snapshot, title: snapshot.title, archived: snapshot.archived, updatedAt: snapshot.updatedAt } });
      } catch { /* Existing stream still owns connection recovery. */ }
      return;
    }
    await this.connect();
  }
  dispose() {
    this.closed = true;
    ++this.generation;
    clearTimeout(this.timer);
    this.controller?.abort();
    this.controller = undefined;
  }
}
