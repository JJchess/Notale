"use client";

import { useState } from "react";
import { Archive, ArchiveRestore, Pencil } from "lucide-react";
import type { SessionSummary } from "../../lib/session-protocol";
import { updateSession } from "../../lib/session-api";
import { useLocale } from "../locale";
import { Dialog } from "../ui/dialog";
import styles from "./library.module.css";

export function SessionActions({ session }: { session: SessionSummary }) {
  const { t } = useLocale();
  const [rename, setRename] = useState(false), [title, setTitle] = useState(session.title), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const apply = async (patch: { title?: string; archived?: boolean }) => {
    setBusy(true); setError("");
    try { await updateSession(session.id, patch); setRename(false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t("更新失败", "Update failed")); }
    finally { setBusy(false); }
  };
  return <div className={styles.actions}>
    <button type="button" className="icon-button" aria-label={t("重命名", "Rename")} title={t("重命名", "Rename")} onClick={() => { setTitle(session.title); setError(""); setRename(true); }}><Pencil size={15} /></button>
    <button type="button" className="icon-button" disabled={busy || (!session.archived && session.busy)} aria-label={session.archived ? t("恢复", "Restore") : t("归档", "Archive")}
      title={!session.archived && session.busy ? t("任务结束后可归档", "Archive after the task finishes") : session.archived ? t("恢复", "Restore") : t("归档", "Archive")} onClick={() => void apply({ archived: !session.archived })}>
      {session.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
    </button>
    {error && !rename && <span className={styles.actionError} role="alert">{error}</span>}
    <Dialog open={rename} onClose={() => { if (!busy) setRename(false); }} title={t("重命名讲义", "Rename lecture")}>
      <form onSubmit={event => { event.preventDefault(); if (title.trim()) void apply({ title: title.trim() }); }}>
        <label htmlFor={`title-${session.id}`}>{t("标题", "Title")}</label>
        <input id={`title-${session.id}`} data-autofocus maxLength={300} value={title} onChange={event => setTitle(event.target.value)} onFocus={event => event.target.select()} />
        {error && <p role="alert">{error}</p>}
        <footer><button type="button" className="secondary-button" disabled={busy} onClick={() => setRename(false)}>{t("取消", "Cancel")}</button><button className="primary-button" disabled={busy || !title.trim()}>{busy ? t("保存中…", "Saving…") : t("保存", "Save")}</button></footer>
      </form>
    </Dialog>
  </div>;
}
