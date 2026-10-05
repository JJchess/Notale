"use client";

import { useState } from "react";
import { useLocale } from "./locale";

/** Opens the version on screen in the editor, in this tab. Waits in place; a failure turns the
 * icon into a mark whose tooltip says why, and clicking again retries. */
export function EditInEditor({ runId, sessionId, version }: { runId: string; sessionId: string; version: number }) {
  const { t } = useLocale();
  const [state, setState] = useState<"idle" | "opening" | { error: string }>("idle");
  const label = typeof state === "object" ? t(`没能打开编辑器：${state.error}`, `Could not open editor: ${state.error}`) : t(`在编辑器中打开版本 ${version}`, `Open version ${version} in editor`);
  async function open() {
    setState("opening");
    try {
      const response = await fetch(`/open-in-editor/${encodeURIComponent(runId)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ session: sessionId }) });
      const body = await response.json().catch(() => ({})) as { url?: string; message?: string };
      if (!response.ok || !body.url) throw new Error(body.message ?? t("编辑器没有响应", "Editor did not respond"));
      location.assign(body.url);
    } catch (cause) { setState({ error: cause instanceof Error ? cause.message : t("编辑器没有响应", "Editor did not respond") }); }
  }
  return (
    <button type="button" className={"edit-in-editor" + (typeof state === "object" ? " is-failed" : "")} aria-label={label} title={label}
      aria-busy={state === "opening"} disabled={state === "opening"} onClick={() => void open()}>
      {state === "opening" ? <i aria-hidden="true" /> : typeof state === "object"
        ? <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 4.5v4.2M8 11.3v.2" /></svg>
        : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5zM15 5l4 4" /></svg>}
    </button>
  );
}
