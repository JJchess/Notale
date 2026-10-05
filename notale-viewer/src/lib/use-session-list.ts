"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CATALOG_EVENT, listSessions } from "./session-api";
import type { SessionPage, SessionSummary } from "./session-protocol";

/** Short-lived, in-memory request sharing for Home and the persistent navigation. */
const shared = new Map<string, { at: number; request: Promise<SessionPage> }>();
let lastInvalidation: Event | undefined;
function firstPage(q: string, archived: boolean, fresh = false) {
  const key = JSON.stringify([q, archived]);
  const hit = shared.get(key);
  if (!fresh && hit && Date.now() - hit.at < 2000) return hit.request;
  const request = listSessions({ q, archived });
  if (shared.size >= 40) shared.delete(shared.keys().next().value!);
  shared.set(key, { at: Date.now(), request });
  void request.catch(() => { if (shared.get(key)?.request === request) shared.delete(key); });
  return request;
}

export function useSessionList(q = "", archived = false) {
  const [items, setItems] = useState<SessionSummary[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const generation = useRef(0), mounted = useRef(false), pending = useRef(false);
  const loadedMore = useRef(false), deferredInvalidation = useRef(false);
  const refresh = useCallback(async (fresh = true) => {
    const request = ++generation.current;
    loadedMore.current = false;
    pending.current = true; setLoading(true); setError("");
    try {
      const page = await firstPage(q, archived, fresh);
      if (mounted.current && request === generation.current) { setItems(page.items); setCursor(page.nextCursor); }
    } catch (cause) { if (mounted.current && request === generation.current) setError(cause instanceof Error ? cause.message : "Service unavailable"); }
    finally { if (mounted.current && request === generation.current) { pending.current = false; setLoading(false); } }
  }, [q, archived]);
  const backgroundRefresh = useCallback(() => {
    if (document.visibilityState !== "visible" || document.querySelector("dialog[open]")) return;
    // A catalog mutation is authoritative, but wait until editing in a dialog is finished.
    if (deferredInvalidation.current) { deferredInvalidation.current = false; void refresh(false); return; }
    // A first-page poll must not discard rows the user explicitly loaded or interrupt paging.
    if (!loadedMore.current && !pending.current) void refresh(false);
  }, [refresh]);
  useEffect(() => {
    mounted.current = true;
    deferredInvalidation.current = false;
    setItems([]); setCursor(undefined);
    void refresh(false);
    const changed = (event: Event) => {
      if (lastInvalidation !== event) { shared.clear(); lastInvalidation = event; }
      if (document.querySelector("dialog[open]")) { deferredInvalidation.current = true; return; }
      deferredInvalidation.current = false;
      void refresh(false);
    };
    const dialogClosed = () => { if (deferredInvalidation.current) backgroundRefresh(); };
    window.addEventListener(CATALOG_EVENT, changed); window.addEventListener("focus", backgroundRefresh);
    window.addEventListener("notale-dialog-closed", dialogClosed); document.addEventListener("visibilitychange", backgroundRefresh);
    return () => {
      mounted.current = false; ++generation.current;
      window.removeEventListener(CATALOG_EVENT, changed); window.removeEventListener("focus", backgroundRefresh);
      window.removeEventListener("notale-dialog-closed", dialogClosed); document.removeEventListener("visibilitychange", backgroundRefresh);
    };
  }, [refresh, backgroundRefresh]);
  useEffect(() => {
    if (!items.some(item => item.busy)) return;
    const timer = setInterval(backgroundRefresh, 10000);
    return () => clearInterval(timer);
  }, [items, backgroundRefresh]);
  const more = async () => {
    if (!cursor || pending.current) return;
    const request = generation.current;
    pending.current = true; setLoading(true); setError("");
    try {
      const page = await listSessions({ q, archived, cursor });
      if (mounted.current && request === generation.current) {
        loadedMore.current = true;
        setItems(current => [...new Map([...current, ...page.items].map(item => [item.id, item])).values()]); setCursor(page.nextCursor);
      }
    } catch (cause) { if (mounted.current && request === generation.current) setError(cause instanceof Error ? cause.message : "Service unavailable"); }
    finally { if (mounted.current && request === generation.current) { pending.current = false; setLoading(false); } }
  };
  return { items, loading, error, hasMore: !!cursor, more, refresh };
}
