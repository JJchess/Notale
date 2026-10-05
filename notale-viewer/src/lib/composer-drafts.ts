/** Drafts keep server references, never File objects or document-scoped blob URLs. */
export interface DraftAttachment { id: string; name: string; size?: number; type?: string }
export interface ComposerDraft { text: string; sessionId?: string; files: DraftAttachment[] }
export const HOME_DRAFT_KEY = "home";
const drafts = new Map<string, ComposerDraft | null>();
const keyFor = (key: string) => `notale-composer:${key}`;

export function parseComposerDraft(value: unknown): ComposerDraft | undefined {
  if (!value || typeof value !== "object") return;
  const row = value as Record<string, unknown>;
  if (typeof row.text !== "string") return;
  const sessionId = typeof row.sessionId === "string" && row.sessionId ? row.sessionId : undefined;
  const files: DraftAttachment[] = [];
  if (sessionId && Array.isArray(row.files)) {
    for (const value of row.files) {
      if (!value || typeof value !== "object") continue;
      const file = value as Record<string, unknown>;
      if (typeof file.id !== "string" || !file.id || typeof file.name !== "string" || !file.name || files.some(entry => entry.id === file.id)) continue;
      files.push({ id: file.id, name: file.name,
        ...(typeof file.size === "number" && file.size >= 0 && Number.isFinite(file.size) ? { size: file.size } : {}),
        ...(typeof file.type === "string" ? { type: file.type } : {}),
      });
      if (files.length === 10) break;
    }
  }
  return { text: row.text, ...(sessionId ? { sessionId } : {}), files };
}

export function readComposerDraft(key: string): ComposerDraft | undefined {
  if (drafts.has(key)) return drafts.get(key) ?? undefined;
  try {
    const raw = sessionStorage.getItem(keyFor(key));
    const value = raw ? parseComposerDraft(JSON.parse(raw)) : undefined;
    if (value) drafts.set(key, value);
    return value;
  } catch { return; }
}

export function writeComposerDraft(key: string, draft: ComposerDraft): void {
  const safe = parseComposerDraft(draft);
  if (!safe) return;
  drafts.set(key, safe);
  try { sessionStorage.setItem(keyFor(key), JSON.stringify(safe)); } catch { /* The in-memory draft remains available during navigation. */ }
}

export function clearComposerDraft(key: string): void {
  // A tombstone stops an inaccessible, stale persisted draft being revived later this visit.
  drafts.set(key, null);
  try { sessionStorage.removeItem(keyFor(key)); } catch { /* memory is authoritative for this document */ }
}

export function attachmentPreviewUrl(sessionId: string, fileId: string): string {
  return `/notale-session/v1/sessions/${encodeURIComponent(sessionId)}/files/${encodeURIComponent(fileId)}`;
}
