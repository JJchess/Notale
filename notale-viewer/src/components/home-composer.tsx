"use client";

import { useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Composer } from "./composer";
import { createSession } from "../lib/session-api";

export const pendingKey = (sessionId: string) => `notale-pending-${sessionId}`;

/** The first message: a session is made on first need (the first upload or the send), and the
 * message is handed to the session page, which sends it -- navigating away would cut its stream. */
export function HomeComposer({ status }: { status?: ReactNode }) {
  const router = useRouter();
  const session = useRef<Promise<string> | undefined>(undefined);
  const ensure = () => (session.current ??= createSession().then(created => created.id).catch(cause => { session.current = undefined; throw cause; }));
  return <Composer session={ensure} autoFocus tone="start" status={status} placeholder="描述讲义的主题、时长与受众，可附论文、PPT 模板或风格参考图"
    onSend={async (text, files) => {
      const id = await ensure();
      try { sessionStorage.setItem(pendingKey(id), JSON.stringify({ text, files })); } catch { /* the page will show an empty session */ }
      router.push(`/s/${id}`);
    }} />;
}
