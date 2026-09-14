"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { createRun, uploadTemplate } from "../lib/api";

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

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!query.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      let templateId: string | undefined;
      if (template) {
        if (uploaded.current?.file !== template) uploaded.current = { file: template, id: (await uploadTemplate(template)).id };
        templateId = uploaded.current.id;
      }
      const run = await createRun({ query, minutes: Number(minutes), audience, scenario, style, ...(templateId ? { templateId } : {}) });
      router.push(`/runs/${run.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "暂时无法开始生成");
      setBusy(false);
    }
  }

  return (
    <form className="generation-form" onSubmit={submit}>
      <label htmlFor="query">讲义主题</label>
      <div className="query-row">
        <input id="query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例如：用直觉理解梯度下降" autoComplete="off" autoFocus />
        <button disabled={busy || !query.trim()}>{busy ? "正在创建" : "开始生成"}<span aria-hidden>↗</span></button>
      </div>
      <input className="style-input" aria-label="视觉方向" value={style} onChange={(event) => setStyle(event.target.value)} placeholder="视觉方向（可选），例如：深色天文观测手册" autoComplete="off" />
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
