"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUp, FileText, LoaderCircle, Paperclip, RotateCcw, Square, X } from "lucide-react";
import { uploadAttachment } from "../lib/session-api";
import { attachmentPreviewUrl, readComposerDraft, writeComposerDraft } from "../lib/composer-drafts";
import { useLocale } from "./locale";
import styles from "./composer/composer.module.css";

const ACCEPT = /\.(pdf|docx|pptx|png|jpe?g|webp|mp4|mov|webm)$/i;
const IMAGE = /\.(png|jpe?g|webp)$/i;
const MAX_FILES = 10, MAX_BYTES = 100 * 1024 * 1024;
export interface PromptSeed { id: string; text: string }
interface Item {
  key: string; name: string; size?: number; type?: string; file?: File;
  state: "uploading" | "ready" | "failed"; id?: string; error?: string;
  controller?: AbortController; preview?: string;
}
interface RejectedAttachment { name: string; reason: "format" | "size" | "count" }
interface ComposerProps {
  session: () => Promise<string>;
  /** onAccepted clears the captured draft early; only invoke after durable server acceptance. */
  onSend: (text: string, files: { id: string; name: string }[], onAccepted?: () => void) => Promise<void> | void;
  busy?: boolean;
  onStop?: () => void;
  status?: ReactNode;
  tone?: "start";
  placeholder: string;
  autoFocus?: boolean;
  draftKey?: string;
  initialText?: string;
  promptSeed?: PromptSeed;
  onSessionResolved?: (id: string) => void;
}

/** Shared home/conversation input. A submitted draft remains editable until the server accepts it.
 * Acceptance removes only the submitted revision and attachment keys, preserving newer edits. */
export function Composer({ session, onSend, onStop, busy, placeholder, autoFocus, status, tone, draftKey, initialText = "", promptSeed, onSessionResolved }: ComposerProps) {
  const { t } = useLocale();
  const [text, setText] = useState(initialText), [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState(""), [dragging, setDragging] = useState(false), [sending, setSending] = useState(false);
  const [rejected, setRejected] = useState<RejectedAttachment[]>([]);
  const [preview, setPreview] = useState<{ src: string; name: string }>();
  const [ready, setReady] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null), picker = useRef<HTMLInputElement>(null), dialog = useRef<HTMLDialogElement>(null);
  const closePreview = useRef<HTMLButtonElement>(null), previewTrigger = useRef<HTMLElement | null>(null);
  const textRef = useRef(initialText), itemsRef = useRef<Item[]>([]), revision = useRef(0);
  const sessionId = useRef<string | undefined>(undefined), loadedKey = useRef<string | undefined>(undefined);
  const alive = useRef(false), sendLock = useRef(false), composing = useRef(false), compositionEnded = useRef(0);
  const lastSeed = useRef<string | undefined>(undefined);
  const handlers = useRef({ add: (_files: File[]) => {} });
  const tRef = useRef(t); tRef.current = t;
  const persist = useCallback(() => {
    if (!draftKey || loadedKey.current !== draftKey) return;
    writeComposerDraft(draftKey, { text: textRef.current, sessionId: sessionId.current, files: itemsRef.current.flatMap(item => item.state === "ready" && item.id ? [{ id: item.id, name: item.name, size: item.size, type: item.type }] : []) });
  }, [draftKey]);
  const updateItems = useCallback((next: Item[]) => { itemsRef.current = next; setItems(next); persist(); }, [persist]);
  const updateText = useCallback((next: string) => { revision.current++; textRef.current = next; setText(next); persist(); }, [persist]);
  const dispose = (item: Item) => { item.controller?.abort(); if (item.preview?.startsWith("blob:")) URL.revokeObjectURL(item.preview); };

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; for (const item of itemsRef.current) dispose(item); };
  }, []);
  useEffect(() => {
    // Hydrate after mount so a saved local draft cannot change server-rendered markup.
    for (const item of itemsRef.current) dispose(item);
    const saved = draftKey ? readComposerDraft(draftKey) : undefined;
    loadedKey.current = draftKey;
    sessionId.current = saved?.sessionId;
    textRef.current = saved?.text ?? initialText;
    const restored: Item[] = (saved?.files ?? []).map(file => ({ ...file, key: `saved:${file.id}`, state: "ready", ...(saved?.sessionId && IMAGE.test(file.name) ? { preview: attachmentPreviewUrl(saved.sessionId, file.id) } : {}) }));
    itemsRef.current = restored; revision.current++;
    setText(textRef.current); setItems(restored); setReady(true);
    // initialText is a mount seed; promptSeed is the explicit subsequent update API.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);
  useEffect(() => {
    if (!ready || !promptSeed || lastSeed.current === promptSeed.id) return;
    lastSeed.current = promptSeed.id;
    updateText(promptSeed.text);
    field.current?.focus();
  }, [promptSeed, ready, updateText]);
  useEffect(() => { if (ready && autoFocus && !window.matchMedia("(pointer: coarse)").matches && document.activeElement === document.body) field.current?.focus(); }, [ready, autoFocus]);
  useEffect(() => {
    const node = field.current; if (!node) return;
    node.style.height = "auto"; node.style.height = `${Math.min(node.scrollHeight, 200)}px`;
  }, [text]);
  useEffect(() => {
    const node = dialog.current;
    if (!preview || !node) return;
    node.showModal(); closePreview.current?.focus();
    return () => { if (node.open) node.close(); };
  }, [preview]);

  async function upload(key: string) {
    const item = itemsRef.current.find(entry => entry.key === key);
    if (!item?.file) return;
    item.controller?.abort();
    const controller = new AbortController();
    updateItems(itemsRef.current.map(entry => entry.key === key ? { ...entry, controller, state: "uploading", error: undefined } : entry));
    const isCurrent = () => alive.current && !controller.signal.aborted && itemsRef.current.some(entry => entry.key === key && entry.controller === controller);
    try {
      const id = await session();
      if (!isCurrent()) return;
      sessionId.current = id; onSessionResolved?.(id); persist();
      const saved = await uploadAttachment(id, item.file, controller.signal);
      if (!isCurrent()) return;
      updateItems(itemsRef.current.map(entry => entry.key === key ? { ...entry, state: "ready", id: saved.id, controller: undefined } : entry));
    } catch (cause) {
      if (!isCurrent()) return;
      updateItems(itemsRef.current.map(entry => entry.key === key ? { ...entry, state: "failed", controller: undefined, error: cause instanceof Error ? cause.message : tRef.current("上传失败", "Upload failed") } : entry));
    }
  }
  function add(files: File[]) {
    if (!files.length || !ready) return;
    const room = Math.max(0, MAX_FILES - itemsRef.current.length);
    const valid: File[] = [], declined: RejectedAttachment[] = [];
    for (const file of files) {
      const reason = !ACCEPT.test(file.name) ? "format" : file.size > MAX_BYTES ? "size" : valid.length >= room ? "count" : undefined;
      if (reason) declined.push({ name: file.name, reason });
      else valid.push(file);
    }
    setRejected(declined); setError("");
    const added: Item[] = valid.map(file => {
      let preview: string | undefined;
      if (IMAGE.test(file.name)) { try { preview = URL.createObjectURL(file); } catch { /* filename remains usable without a local preview */ } }
      return { key: crypto.randomUUID(), name: file.name, size: file.size, type: file.type, file, state: "uploading", preview };
    });
    updateItems([...itemsRef.current, ...added]);
    for (const item of added) void upload(item.key);
  }
  handlers.current.add = add;
  useEffect(() => {
    let depth = 0;
    const isFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files");
    const enter = (event: DragEvent) => { if (isFiles(event)) { event.preventDefault(); depth++; setDragging(true); } };
    const over = (event: DragEvent) => { if (isFiles(event)) { event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = "copy"; } };
    const leave = (event: DragEvent) => { if (isFiles(event)) { depth = Math.max(0, depth - 1); if (!depth) setDragging(false); } };
    const drop = (event: DragEvent) => { if (!isFiles(event)) return; event.preventDefault(); depth = 0; setDragging(false); handlers.current.add(Array.from(event.dataTransfer?.files ?? [])); };
    const paste = (event: ClipboardEvent) => { const files = Array.from(event.clipboardData?.files ?? []); if (files.length) { event.preventDefault(); handlers.current.add(files); } };
    const reset = () => { depth = 0; setDragging(false); };
    document.addEventListener("dragenter", enter); document.addEventListener("dragover", over); document.addEventListener("dragleave", leave); document.addEventListener("drop", drop); document.addEventListener("paste", paste); window.addEventListener("blur", reset);
    return () => { document.removeEventListener("dragenter", enter); document.removeEventListener("dragover", over); document.removeEventListener("dragleave", leave); document.removeEventListener("drop", drop); document.removeEventListener("paste", paste); window.removeEventListener("blur", reset); };
  }, []);

  const waitingForFiles = items.some(item => item.state !== "ready");
  const canSend = ready && !!text.trim() && !waitingForFiles && !busy && !sending;
  async function send() {
    if (!canSend || sendLock.current) return;
    sendLock.current = true; setSending(true); setError(""); setRejected([]);
    const capturedRevision = revision.current, captured = [...itemsRef.current];
    const words = textRef.current.trim(), files = captured.map(item => ({ id: item.id!, name: item.name }));
    let accepted = false;
    const accept = () => {
      if (accepted) return; accepted = true;
      if (!alive.current) return;
      if (revision.current === capturedRevision) updateText("");
      const keys = new Set(captured.map(item => item.key));
      for (const item of itemsRef.current) if (keys.has(item.key)) dispose(item);
      updateItems(itemsRef.current.filter(item => !keys.has(item.key)));
    };
    try { await onSend(words, files, accept); accept(); }
    catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : t("发送失败，内容和附件已保留。", "Could not send. Your message and attachments are saved.")); }
    finally { sendLock.current = false; if (alive.current) setSending(false); }
  }
  function remove(key: string) {
    const item = itemsRef.current.find(entry => entry.key === key); if (item) dispose(item);
    updateItems(itemsRef.current.filter(entry => entry.key !== key));
    setRejected([]);
  }
  const rejectionText = rejected.map(({ name, reason }) => `${name}${t("：", ": ")}${reason === "format" ? t("不支持此文件格式", "Unsupported file format") : reason === "size" ? t("超过 100 MB", "Exceeds 100 MB") : t("最多添加 10 个附件", "You can add up to 10 attachments")}`).join(t("；", "; "));
  function endPreview() { setPreview(undefined); requestAnimationFrame(() => previewTrigger.current?.focus()); }
  return <div className={`${styles.composer} ${tone === "start" ? styles.start : ""} ${dragging ? styles.dropping : ""}`}>
    {dragging && <div className={styles.dropOverlay} role="status"><Paperclip size={28} /><span>{t("松开以添加附件", "Drop to add attachments")}</span></div>}
    <textarea ref={field} rows={1} value={text} placeholder={placeholder} aria-label={placeholder} disabled={!ready}
      onChange={event => updateText(event.target.value)}
      onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; compositionEnded.current = Date.now(); }}
      onKeyDown={event => {
        if (event.key !== "Enter" || event.shiftKey || composing.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || Date.now() - compositionEnded.current < 50) return;
        event.preventDefault(); void send();
      }} />
    {!!items.length && <ul className={styles.files} aria-label={t("附件", "Attachments")}>
      {items.map(item => <li key={item.key} className={`${styles.file} ${item.state === "failed" ? styles.failed : ""}`}>
        {item.preview ? <button type="button" className={styles.thumbnail} title={t(`预览 ${item.name}`, `Preview ${item.name}`)} aria-label={t(`预览 ${item.name}`, `Preview ${item.name}`)} onClick={event => { previewTrigger.current = event.currentTarget; setPreview({ src: item.preview!, name: item.name }); }}><img src={item.preview} alt="" /></button> : <span className={styles.fileIcon}><FileText size={19} aria-hidden="true" /></span>}
        <div className={styles.fileInfo}><span className={styles.fileName} title={item.name}>{item.name}</span><span className={styles.fileState} title={item.error} role={item.state === "failed" ? "alert" : undefined}>{item.state === "ready" ? t("已上传", "Uploaded") : item.state === "uploading" ? <><LoaderCircle size={12} className={styles.spin} aria-hidden="true" />{t("上传中", "Uploading")}</> : item.error || t("上传失败", "Upload failed")}</span></div>
        {item.state === "failed" && item.file && <button type="button" className={styles.iconButton} title={t("重试上传", "Retry upload")} aria-label={t(`重新上传 ${item.name}`, `Retry uploading ${item.name}`)} onClick={() => void upload(item.key)}><RotateCcw size={15} /></button>}
        <button type="button" className={styles.iconButton} title={t("移除", "Remove")} aria-label={t(`移除 ${item.name}`, `Remove ${item.name}`)} onClick={() => remove(item.key)}><X size={15} /></button>
      </li>)}
    </ul>}
    <div className={styles.bar}>
      <button type="button" className={styles.attach} aria-label={t("添加附件", "Add attachments")} title={t("添加论文、PPT 模板、图片或视频", "Add a paper, PPT template, image or video")} disabled={!ready || items.length >= MAX_FILES} onClick={() => picker.current?.click()}><Paperclip size={19} aria-hidden="true" /></button>
      <input ref={picker} type="file" multiple hidden accept=".pdf,.docx,.pptx,.png,.jpg,.jpeg,.webp,.mp4,.mov,.webm" onChange={event => { add(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
      <div className={styles.status}>{error || rejectionText ? <span className={styles.error} role="alert">{error || rejectionText}</span> : status}</div>
      {(busy || sending) && onStop ? <button type="button" className={styles.stop} aria-label={t("停止生成", "Stop generation")} title={t("停止生成", "Stop generation")} onClick={onStop}><Square size={13} fill="currentColor" aria-hidden="true" /></button> : <button type="button" className={styles.send} aria-label={t("发送", "Send")} title={t("发送（Enter）", "Send (Enter)")} disabled={!canSend} onClick={() => void send()}>{sending ? <LoaderCircle size={18} className={styles.spin} aria-hidden="true" /> : <ArrowUp size={19} aria-hidden="true" />}</button>}
    </div>
    <dialog ref={dialog} className={styles.preview} aria-label={preview?.name} onCancel={endPreview} onClose={endPreview} onClick={event => { if (event.target === event.currentTarget) endPreview(); }}>
      <div className={styles.previewHead}><span>{preview?.name}</span><button ref={closePreview} type="button" className={styles.iconButton} aria-label={t("关闭预览", "Close preview")} onClick={endPreview}><X size={20} /></button></div>
      {preview && <img src={preview.src} alt={preview.name} />}
    </dialog>
  </div>;
}
