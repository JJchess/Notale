import type { ModelRef } from "./models";
import { parseComposerDraft, type DraftAttachment } from "./composer-drafts";

export interface PendingTurn { model?: ModelRef; id: string; text: string; files: DraftAttachment[]; claimed?: boolean }
const pending = new Map<string, PendingTurn | null>();
export const pendingKey = (sessionId: string) => `notale-pending-${sessionId}`;

function save(sessionId: string, turn: PendingTurn): void {
  pending.set(sessionId, turn);
  try { sessionStorage.setItem(pendingKey(sessionId), JSON.stringify(turn)); } catch { /* Memory carries the turn through client navigation. */ }
}

export function putPendingTurn(sessionId: string, input: Pick<PendingTurn, "text" | "files" | "model">): PendingTurn {
  const turn: PendingTurn = { id: crypto.randomUUID(), text: input.text, ...(input.model ? { model: { ...input.model } } : {}), files: input.files.map(file => ({ ...file })) };
  save(sessionId, turn);
  return turn;
}

/** Reading never consumes the message: StrictMode may read more than once. */
export function peekPendingTurn(sessionId: string): PendingTurn | undefined {
  if (pending.has(sessionId)) return pending.get(sessionId) ?? undefined;
  try {
    const raw = sessionStorage.getItem(pendingKey(sessionId));
    if (!raw) return;
    const value = JSON.parse(raw) as Record<string, unknown>;
    const draft = parseComposerDraft({ ...value, sessionId });
    if (!draft?.text.trim() || typeof value.id !== "string" || !value.id) return;
    const turn: PendingTurn = { id: value.id, text: draft.text, ...(draft.model ? { model: draft.model } : {}), files: draft.files, ...(value.claimed === true ? { claimed: true } : {}) };
    pending.set(sessionId, turn);
    return turn;
  } catch { return; }
}

/** Claim before sending. Persisting the claim also prevents reload from blindly sending again.
 * A claimed turn must be reconciled with the server; only a user-requested safe retry releases it. */
export function claimPendingTurn(sessionId: string): PendingTurn | undefined {
  const turn = peekPendingTurn(sessionId);
  if (!turn || turn.claimed) return;
  const claimed = { ...turn, claimed: true };
  save(sessionId, claimed);
  return claimed;
}

/** Acknowledge only after the server durably accepted this exact turn. */
export function ackPendingTurn(sessionId: string, id: string): void {
  if (peekPendingTurn(sessionId)?.id !== id) return;
  pending.set(sessionId, null);
  try { sessionStorage.removeItem(pendingKey(sessionId)); } catch { /* tombstone protects memory fallback */ }
}

export function releasePendingTurn(sessionId: string, id: string): void {
  const turn = peekPendingTurn(sessionId);
  if (turn?.id === id) save(sessionId, { ...turn, claimed: false });
}
