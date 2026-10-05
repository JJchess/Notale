import type { Attachment, SessionPage, SessionSnapshot, SessionSummary, TurnEvent } from "./session-protocol";

const base = "/notale-session/v1";
async function json<T>(response: Response): Promise<T> {
  if (!response.ok) { const detail = await response.json().catch(() => ({})); throw new Error(detail.message || `请求失败（${response.status}）`); }
  return response.json() as Promise<T>;
}
export async function createSession(): Promise<{ id: string }> {
  return json(await fetch(`${base}/sessions`, { method: "POST" }));
}
export async function getSession(id: string): Promise<SessionSnapshot> {
  return json(await fetch(`${base}/sessions/${encodeURIComponent(id)}`, { cache: "no-store" }));
}
/** A file goes up on its own; a message then names it by id. */
export async function uploadAttachment(sessionId: string, file: File, signal?: AbortSignal): Promise<Attachment> {
  return json(await fetch(`${base}/sessions/${encodeURIComponent(sessionId)}/files`, {
    method: "POST", body: file, signal, headers: { "x-file-name": encodeURIComponent(file.name), "content-type": "application/octet-stream" },
  }));
}
/** Reads an ndjson event stream to its end. */
async function events(response: Response, onEvent: (event: TurnEvent) => void) {
  if (!response.ok || !response.body) { const detail = await response.json().catch(() => ({})); throw new Error(detail.message || `请求失败（${response.status}）`); }
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) if (line.trim()) onEvent(JSON.parse(line) as TurnEvent);
  }
}
/** Sends one message and reads its events as they come. The message runs on the server either way:
 * leaving the page only stops listening. */
export async function sendTurn(sessionId: string, text: string, fileIds: string[], onEvent: (event: TurnEvent) => void, signal?: AbortSignal) {
  await events(await fetch(`${base}/sessions/${encodeURIComponent(sessionId)}/turns`, {
    method: "POST", signal, headers: { "content-type": "application/json" }, body: JSON.stringify({ text, fileIds }),
  }), onEvent);
}
/** The message in flight, from its start: what happened so far, then the rest. */
export async function followTurn(sessionId: string, onEvent: (event: TurnEvent) => void, signal?: AbortSignal) {
  await events(await fetch(`${base}/sessions/${encodeURIComponent(sessionId)}/turn`, { cache: "no-store", signal }), onEvent);
}
export async function interruptTurn(sessionId: string) {
  return json(await fetch(`${base}/sessions/${encodeURIComponent(sessionId)}/interrupt`, { method: "POST" }));
}
/** The fix agent's working copy, played like a lecture. */
export function draftUrl(sessionId: string, file = "index.html") {
  return `${base}/sessions/${encodeURIComponent(sessionId)}/draft/${file}`;
}

export const CATALOG_EVENT = "notale-catalog-change";
export function dispatchCatalogChange() { if (typeof window !== "undefined") window.dispatchEvent(new Event(CATALOG_EVENT)); }
export async function listSessions(input: { q?: string; archived?: boolean; cursor?: string; limit?: number } = {}, signal?: AbortSignal): Promise<SessionPage> {
  const query = new URLSearchParams({ archived: String(input.archived ?? false), limit: String(input.limit ?? 50) });
  if (input.q?.trim()) query.set("q", input.q.trim());
  if (input.cursor) query.set("cursor", input.cursor);
  return json(await fetch(`${base}/sessions?${query}`, { cache: "no-store", signal }));
}
export async function updateSession(id: string, patch: { title?: string; archived?: boolean }): Promise<SessionSummary> {
  const result = await json<SessionSummary>(await fetch(`${base}/sessions/${encodeURIComponent(id)}`, {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch),
  }));
  dispatchCatalogChange();
  window.dispatchEvent(new CustomEvent("notale-session-updated", { detail: { id } }));
  return result;
}
export function attachmentUrl(sessionId: string, fileId: string, download = false) {
  return `${base}/sessions/${encodeURIComponent(sessionId)}/files/${encodeURIComponent(fileId)}${download ? "?download=1" : ""}`;
}
