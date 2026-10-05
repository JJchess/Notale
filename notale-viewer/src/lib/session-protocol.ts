/** The session layer's HTTP boundary (notale-ts `src/session/`), declared locally like protocol.ts: the
 * viewer builds on its own and has no dependency on the sibling package. */
export type Route =
  | { action: "generate"; reason: string; query: string; title?: string; minutes?: number; audience?: string; scenario?: string; language?: string; style?: string; files: { id: string; role: string }[] }
  | { action: "fix"; reason: string; target: string; instruction: string; page?: number; files: { id: string; role: string }[] }
  | { action: "ask"; reason: string; question: string; options?: string[] }
  | { action: "reply"; reason: string; text: string };

export type Entry =
  | { type: "session"; id: string; createdAt: string }
  | { type: "user"; text: string; files: string[]; at: string }
  | { type: "understood"; route: Route; at: string }
  | { type: "run"; runId: string; kind: "generate" | "fix"; basedOn?: string; at: string }
  | { type: "finished"; runId: string; status: string; at: string }
  | { type: "reply"; text: string; at: string }
  | { type: "question"; text: string; options?: string[]; at: string };

export interface SessionRun { runId: string; kind: "generate" | "fix"; basedOn?: string; status?: string }
/** `busy`: a message is in flight; `GET …/turn` replays it and follows the rest. */
export interface SessionSnapshot { id: string; title?: string; archived?: boolean; updatedAt?: string; busy: boolean; runs: SessionRun[]; entries: Entry[]; files: Attachment[] }
export interface SessionSummary { id: string; title: string; createdAt: string; updatedAt: string; archived: boolean; busy: boolean; versions: number; latestCompletedRunId?: string }
export interface SessionPage { items: SessionSummary[]; nextCursor?: string }
export interface Attachment { id: string; name: string; kind: "pdf" | "docx" | "pptx" | "image" | "video"; size: number }

export type TurnEvent =
  | { type: "understood"; route: Route }
  | { type: "question"; text: string; options?: string[] }
  | { type: "reply"; text: string }
  | { type: "run"; runId: string; kind: "generate" | "fix"; basedOn?: string }
  | { type: "progress"; runId: string; event: Record<string, unknown> }
  /** The fix agent at work: a step, streamed words, or where its draft is (`draft`: page file + revision). */
  | { type: "working"; event: { type?: string; label?: string; status?: string; delta?: string; reset?: boolean; page?: string; revision?: number } }
  | { type: "result"; runId: string; status: string }
  | { type: "done" }
  | { type: "error"; message: string };
