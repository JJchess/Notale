"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createRun } from "../lib/api";

export function GenerationForm() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [style, setStyle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!query.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const run = await createRun({ query: query.trim(), minutes: 45, audience: "具备基础知识的学习者", scenario: "课堂讲授与课后复习", style: style.trim() || "根据内容选择克制、清晰的教学视觉" });
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
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  );
}
