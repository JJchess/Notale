"use client";

import { useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Composer, type PromptSeed } from "./composer";
import { createSession } from "../lib/session-api";
import { HOME_DRAFT_KEY, clearComposerDraft, readComposerDraft, writeComposerDraft } from "../lib/composer-drafts";
import { putPendingTurn } from "../lib/pending-turn";
import { useLocale } from "./locale";

/** The draft's uploaded IDs belong to one session, including after a reload. The typed handoff
 * survives blocked sessionStorage through a document-level memory slot. The session page claims it. */
export function HomeComposer({ status, promptSeed }: { status?: ReactNode; promptSeed?: PromptSeed }) {
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
  return <Composer session={ensure} autoFocus tone="start" draftKey={HOME_DRAFT_KEY} promptSeed={promptSeed} status={status}
    placeholder={t("描述讲义的主题、时长与受众，可附论文、PPT 模板或风格参考图", "Describe your topic, duration and audience. Add papers, slides or visual references.")}
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
