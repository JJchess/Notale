"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { uploadAttachment } from "../lib/session-api";
import { FileKind } from "./file-kind";

const ACCEPT = /\.(pdf|docx|pptx|png|jpe?g|webp|mp4|mov|webm)$/i, MAX_FILES = 10, MAX_BYTES = 100 * 1024 * 1024;
type Item = { key: string; file: File; state: "uploading" | "ready" | "failed"; id?: string; error?: string; controller?: AbortController };

/** One box: what you want, plus whatever you drop in (material, a template, a style picture). The
 * understanding stage decides what each file is for, so there are no separate fields. Files upload
 * as soon as they are added; sending waits until every one is up. */
export function Composer({ session, onSend, onStop, busy, placeholder, autoFocus, status, tone }: {
  /** The session to upload into, created on first need. */
  session: () => Promise<string>;
  onSend: (text: string, files: { id: string; name: string }[]) => Promise<void> | void;
  busy?: boolean;
  /** Offered in place of send while busy. */
  onStop?: () => void;
  /** A line beside the send button: who answers, with which model. */
  status?: ReactNode;
  /** "start": the start page's box, marked by an accent rule on the left. */
  tone?: "start";
  placeholder: string;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState(""), [items, setItems] = useState<Item[]>([]), [error, setError] = useState(""), [dragging, setDragging] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null), picker = useRef<HTMLInputElement>(null);
  useEffect(() => { const node = field.current; if (!node) return; node.style.height = "auto"; node.style.height = Math.min(node.scrollHeight, 200) + "px"; }, [text]);
  const patch = (key: string, change: Partial<Item>) => setItems(current => current.map(item => item.key === key ? { ...item, ...change } : item));
  async function upload(item: Item) {
    const controller = new AbortController();
    patch(item.key, { state: "uploading", error: undefined, controller });
    try { const saved = await uploadAttachment(await session(), item.file, controller.signal); patch(item.key, { state: "ready", id: saved.id }); }
    catch (cause) { if (!controller.signal.aborted) patch(item.key, { state: "failed", error: cause instanceof Error ? cause.message : "上传失败" }); }
  }
  function add(files: FileList | File[] | null) {
    const list = [...(files ?? [])];
    if (!list.length) return;
    const room = MAX_FILES - items.length;
    const good = list.filter(file => ACCEPT.test(file.name) && file.size <= MAX_BYTES).slice(0, Math.max(0, room));
    setError(good.length < list.length ? `支持 PDF、DOCX、PPTX、图片和视频（MP4、MOV、WebM），单个不超过 100 MB，最多 ${MAX_FILES} 个` : "");
    const added = good.map(file => ({ key: crypto.randomUUID(), file, state: "uploading" as const }));
    setItems(current => [...current, ...added]);
    for (const item of added) void upload(item);
  }
  const uploading = items.some(item => item.state !== "ready");
  const canSend = !!text.trim() && !uploading && !busy;
  async function send() {
    if (!canSend) return;
    const words = text.trim(), files = items.map(item => ({ id: item.id!, name: item.file.name }));
    setText(""); setItems([]); setError("");
    try { await onSend(words, files); }
    catch (cause) { setText(words); setError(cause instanceof Error ? cause.message : "发送失败，请重试"); }
  }
  return (
    <div className={"composer" + (tone ? ` is-${tone}` : "") + (dragging ? " is-dropping" : "")}
      onDragOver={event => { if ([...event.dataTransfer.items].some(item => item.kind === "file")) { event.preventDefault(); setDragging(true); } }}
      onDragLeave={() => setDragging(false)}
      onDrop={event => { event.preventDefault(); setDragging(false); add(event.dataTransfer.files); }}>
      <textarea ref={field} rows={1} value={text} placeholder={placeholder} aria-label={placeholder} autoFocus={autoFocus}
        onChange={event => setText(event.target.value)}
        onPaste={event => { if (event.clipboardData.files.length) { event.preventDefault(); add(event.clipboardData.files); } }}
        onKeyDown={event => {
          // Enter confirms a Chinese candidate while composing; it only sends once composition ends.
          if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
          event.preventDefault(); void send();
        }} />
      {!!items.length && <ul className="composer-files">
        {items.map(item => <li key={item.key} className={"is-" + item.state} title={item.error ?? item.file.name}>
          <FileKind name={item.file.name} /><span className="composer-file-name">{item.file.name}</span>
          <span className="composer-file-state">{item.state === "ready" ? "已上传" : item.state === "uploading" ? "上传中…" : item.error}</span>
          {item.state === "failed" && <button type="button" onClick={() => void upload(item)}>重试</button>}
          <button type="button" aria-label={`移除 ${item.file.name}`} onClick={() => { item.controller?.abort(); setItems(current => current.filter(entry => entry.key !== item.key)); }}>×</button>
        </li>)}
      </ul>}
      <div className="composer-bar">
        <button type="button" className="composer-attach" aria-label="添加附件" title="添加附件：素材、PPTX 模板、风格参考图或视频" onClick={() => picker.current?.click()}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></button>
        <input ref={picker} type="file" multiple hidden accept=".pdf,.docx,.pptx,.png,.jpg,.jpeg,.webp,.mp4,.mov,.webm" onChange={event => { add(event.target.files); event.target.value = ""; }} />
        {error ? <span className="composer-error" role="alert">{error}</span> : status}
        {busy && onStop
          ? <button type="button" className="composer-send is-stop" aria-label="停止" title="停止" onClick={onStop}><i /></button>
          : <button type="button" className="composer-send" aria-label="发送" title="发送（回车）" disabled={!canSend} onClick={() => void send()}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg></button>}
      </div>
    </div>
  );
}
