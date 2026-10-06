"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { Composer } from "./composer";
import { createSession } from "../lib/session-api";
import { HOME_DRAFT_KEY, clearComposerDraft, readComposerDraft, writeComposerDraft } from "../lib/composer-drafts";
import { putPendingTurn } from "../lib/pending-turn";
import { useLocale } from "./locale";

/** The draft's uploaded IDs belong to one session, including after a reload. The typed handoff
 * survives blocked sessionStorage through a document-level memory slot. The session page claims it. */
export function HomeComposer() {
  const { t } = useLocale();
  const router = useRouter();
  const session = useRef<Promise<string> | undefined>(undefined);
  const ensure = () => {
    if (!session.current) {
      const restored = readComposerDraft(HOME_DRAFT_KEY)?.sessionId;
      session.current = restored ? Promise.resolve(restored) : createSession().then(created => created.id).catch(cause => { session.current = undefined; throw cause; });
    }
    return session.current;
  };
  return <Composer session={ensure} autoFocus tone="start" draftKey={HOME_DRAFT_KEY}
    placeholder={t("想把什么内容做成讲义？", "What would you like to teach?")}
    onSend={async (text, files, onAccepted) => {
      const id = await ensure();
      putPendingTurn(id, { text, files });
      // The pending slot now owns this payload, so navigation need not keep the input mounted.
      onAccepted?.();
      const nextDraft = readComposerDraft(HOME_DRAFT_KEY);
      if (nextDraft && (nextDraft.text || nextDraft.files.length)) writeComposerDraft(`session:${id}`, { ...nextDraft, sessionId: id });
      clearComposerDraft(HOME_DRAFT_KEY);
      router.push(`/s/${id}`);
    }} />;
}
