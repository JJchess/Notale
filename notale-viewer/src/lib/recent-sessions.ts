/** The sessions this browser has opened, newest first: a per-viewer convenience, so storage failing
 * (private mode, blocked site data) just means an empty list. */
const KEY = "notale-recent-sessions", LIMIT = 8;
export interface RecentSession { id: string; title: string; at: string; versions?: number }
export function recentSessions(): RecentSession[] {
  try { const list = JSON.parse(localStorage.getItem(KEY) ?? "[]"); return Array.isArray(list) ? list.filter(entry => typeof entry?.id === "string" && typeof entry?.title === "string") : []; }
  catch { return []; }
}
/** Moves the session to the top; `versions` is how many lectures it has made so far. */
export function rememberSession(id: string, title: string, versions?: number) {
  try { localStorage.setItem(KEY, JSON.stringify([{ id, title, at: new Date().toISOString(), ...(versions ? { versions } : {}) }, ...recentSessions().filter(entry => entry.id !== id)].slice(0, LIMIT))); }
  catch { /* nothing to remember with */ }
}
export function relativeTime(iso: string, now = Date.now()) {
  const minutes = Math.round((now - Date.parse(iso)) / 60_000);
  if (!Number.isFinite(minutes) || minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} 小时前`;
  if (minutes < 60 * 48) return "昨天";
  const date = new Date(iso);
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}
