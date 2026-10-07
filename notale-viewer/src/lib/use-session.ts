"use client";
import type { ModelRef } from "./models";

import { useCallback, useEffect, useRef, useState } from "react";
import { dispatchCatalogChange, followTurn, getSession, sendTurn } from "./session-api";
import { initialSessionState, SessionClient } from "./session-state";

export function useSession(sessionId: string) {
  const [state, setState] = useState(initialSessionState);
  const client = useRef<SessionClient | undefined>(undefined);
  useEffect(() => {
    setState(initialSessionState());
    const current = new SessionClient({
      get: () => getSession(sessionId),
      send: (text, files, event, signal, model) => sendTurn(sessionId, text, files, event, signal, model),
      follow: (event, signal) => followTurn(sessionId, event, signal),
    }, setState, dispatchCatalogChange);
    client.current = current;
    const online = () => { void current.connect(); };
    window.addEventListener("online", online);
    void current.connect();
    return () => { current.dispose(); if (client.current === current) client.current = undefined; window.removeEventListener("online", online); };
  }, [sessionId]);
  const send = useCallback((text: string, files: string[], onAccepted?: () => void, model?: ModelRef) => {
    if (!client.current) return Promise.reject(new Error("Session is still loading"));
    return client.current.send(text, files, onAccepted, model);
  }, []);
  const reconnect = useCallback(() => { void client.current?.connect(); }, []);
  const reload = useCallback(() => { void client.current?.refresh(); }, []);
  return { ...state, send, reconnect, reload };
}
