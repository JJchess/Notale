"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { createRun, uploadTemplate, uploadFile } from "../lib/api";

type Attachment = { key: string; file: File; controller: AbortController; id?: string; error?: string };

export function GenerationForm() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [style, setStyle] = useState("");
  const [minutes, setMinutes] = useState("90");
  const [audience, setAudience] = useState("学过一点相关基础、但没系统学过这个题目的读者");
  const [scenario, setScenario] = useState("");
  const [template, setTemplate] = useState<File | null>(null);
  const templateInput = useRef<HTMLInputElement>(null);
  const uploaded = useRef<{ file: File; id: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const fileInput = useRef<HTMLInputElement>(null);
  const filesRef = useRef<Attachment[]>([]);
  const [files, setFiles] = useState<Attachment[]>([]);
  const updateFiles = (next: Attachment[]) => { filesRef.current = next; setFiles(next); };
  useEffect(() => () => { for (const item of filesRef.current) item.controller.abort(); }, []);
  async function upload(item: Attachment) {
    try {
      const result = await uploadFile(item.file, item.controller.signal);
      if (!item.controller.signal.aborted) updateFiles(filesRef.current.map(f => f.key === item.key ? { ...f, id: result.id, error: undefined } : f));
    } catch (reason) {
      if (!item.controller.signal.aborted) updateFiles(filesRef.current.map(f => f.key === item.key ? { ...f, error: reason instanceof Error ? reason.message : '上传失败' } : f));
    }
  }
  function addFiles(selected: File[]) {
    if (busy) return;
    const current = filesRef.current;
    if (current.length + selected.length > 10 || [...current.map(f => f.file), ...selected].reduce((n, f) => n + f.size, 0) > 200 * 1024 * 1024) { setError('最多 10 份资料，合计不超过 200 MiB'); return; }
    if (selected.some(f => !/\.(pdf|docx|png|jpe?g|webp)$/i.test(f.name) || !f.size || f.size > 50 * 1024 * 1024)) { setError('支持 PDF、DOCX、PNG、JPEG、WebP，单份不超过 50 MiB'); return; }
    const added = selected.map(file => ({ key: crypto.randomUUID(), file, controller: new AbortController() }));
    setError(''); updateFiles([...current, ...added]); for (const item of added) void upload(item);
  }
  const filesReady = files.every(f => f.id && !f.error);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!query.trim() || busy || !filesReady) return;
    setBusy(true);
    setError("");
    try {
      let templateId: string | undefined;
      if (template) {
        if (uploaded.current?.file !== template) uploaded.current = { file: template, id: (await uploadTemplate(template)).id };
        templateId = uploaded.current.id;
      }
      const run = await createRun({ query, ...(files.length ? { fileIds: files.map(f => f.id!) } : {}), minutes: Number(minutes), audience, scenario, style, ...(templateId ? { templateId } : {}) });
      router.push(`/runs/${run.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "暂时无法开始生成");
      setBusy(false);
    }
  }

  return (
    <form className="generation-form" onSubmit={submit} onDragOver={event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); }} onDrop={event => { event.preventDefault(); addFiles(Array.from(event.dataTransfer.files)); }}>
      <label htmlFor="query">讲义主题</label>
      <div className="query-row">
        <input id="query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例如：用直觉理解梯度下降" autoComplete="off" autoFocus />
        <button disabled={busy || !query.trim() || !filesReady}>{busy ? "正在创建" : "开始生成"}<span aria-hidden>↗</span></button>
      </div>
      <input className="style-input" aria-label="视觉方向" value={style} onChange={(event) => setStyle(event.target.value)} placeholder="视觉方向（可选），例如：深色天文观测手册" autoComplete="off" />
      <div className="source-input">
        <input ref={fileInput} type="file" multiple accept=".pdf,.docx,.png,.jpg,.jpeg,.webp" aria-label="内容资料" hidden disabled={busy} onChange={event => { addFiles(Array.from(event.target.files ?? [])); event.target.value = ''; }} />
        <button type="button" className="source-attach" disabled={busy} onClick={() => fileInput.current?.click()} title="PDF、DOCX、PNG、JPEG、WebP；也可拖入文件">＋ 添加资料</button>
        {files.length > 0 && <ul className="source-files" aria-label="已选资料" aria-live="polite">{files.map(item => <li key={item.key}>
          <span className="source-name" title={item.file.name}>{item.file.name}</span>
          <span className="source-status">{item.error || (item.id ? '已上传' : '上传中…')}</span>
          {item.error && <button type="button" disabled={busy} onClick={() => { const next = { ...item, error: undefined, controller: new AbortController() }; updateFiles(filesRef.current.map(f => f.key === item.key ? next : f)); void upload(next); }}>重试</button>}
          <button type="button" disabled={busy} aria-label={`移除 ${item.file.name}`} title="移除资料" onClick={() => { item.controller.abort(); updateFiles(filesRef.current.filter(f => f.key !== item.key)); }}>×</button>
        </li>)}</ul>}
      </div>
      <div className="template-input-row">
        <input ref={templateInput} type="file" accept=".pptx" aria-label="PPTX 模板" hidden disabled={busy} onChange={event => {
          const file = event.target.files?.[0] ?? null;
          if (file && (!/\.pptx$/i.test(file.name) || file.size > 50 * 1024 * 1024)) { setError("请选择小于 50 MiB 的 .pptx 文件"); event.target.value = ""; return; }
          setError(""); setTemplate(file); uploaded.current = null;
        }} />
        <button type="button" className="template-attach" disabled={busy} onClick={() => templateInput.current?.click()} title="选择 PPTX 模板">{template ? template.name : "添加 PPTX 模板"}</button>
        {template && <button type="button" className="template-remove" disabled={busy} aria-label="移除模板" title="移除模板" onClick={() => { setTemplate(null); uploaded.current = null; if (templateInput.current) templateInput.current.value = ""; }}>×</button>}
      </div>
      <details className="generation-options">
        <summary>课程设置</summary>
        <label htmlFor="minutes">课程时长（分钟）<input className="style-input" id="minutes" type="number" required value={minutes} onChange={event => setMinutes(event.target.value)} /></label>
        <label htmlFor="audience">学习者<input className="style-input" id="audience" value={audience} onChange={event => setAudience(event.target.value)} /></label>
        <label htmlFor="scenario">使用场景<input className="style-input" id="scenario" value={scenario} onChange={event => setScenario(event.target.value)} /></label>
      </details>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  );
}
