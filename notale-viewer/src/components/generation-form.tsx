"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createRun } from "../lib/api";

export function GenerationForm() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [style, setStyle] = useState("");
  const [minutes, setMinutes] = useState("90");
  const [audience, setAudience] = useState("学过一点相关基础、但没系统学过这个题目的读者");
  const [scenario, setScenario] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!query.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const run = await createRun({ query, minutes: Number(minutes), audience, scenario, style });
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
