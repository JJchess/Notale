"use client";

import { useEffect, useRef } from 'react';
import type { PageProgress } from '../lib/protocol';
import { duration, type progressState } from '../lib/progress-state';

const labels: Record<PageProgress['state'], string> = { pending: '待创作', generating: '生成中', checking: '检查中', reworking: '生成中', ready: '完成', failed: '失败', cancelled: '已取消', unknown: '已停止，状态未确认' };
const stages = [{ id: 'ideate', label: '构思' }, { id: 'create', label: '创作' }, { id: 'polish', label: '整理' }];

type State = ReturnType<typeof progressState>;
export function GenerationProgress({ state, phase, status }: { state: State; phase?: string; status: string }) {
  const list = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  useEffect(() => { if (follow.current && list.current) list.current.scrollTop = list.current.scrollHeight; }, [state.feed.at(-1)?.key]);
  const current = stages.findIndex(stage => stage.id === phase);
  const samples = state.samples;
  const first = samples[0]?.t ?? 0, span = Math.max(1, (samples.at(-1)?.t ?? first) - first);
  const points = samples.map(sample => `${((sample.t - first) / span * 156 + 2).toFixed(1)},${(30 - sample.fraction * 27).toFixed(1)}`).join(' ');
  return (
    <div className={`generation-progress ${state.terminal ? 'is-terminal' : ''}`}>
      <div className="gp-heading"><h2>讲义生成</h2><span>{status}</span></div>
      <div className="gp-bar" role="progressbar" aria-label="讲义生成进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={state.percent}><i style={{ width: `${state.percent}%` }} /></div>
      <ol className="gp-stages">{stages.map((stage, i) => <li key={stage.id} className={state.completed || i < current ? 'done' : i === current ? 'active' : ''}><i />{stage.label}</li>)}</ol>
      {state.total === 0 && <p className="gp-wait">{state.terminal ? '本次任务尚未留下确定的页表。' : '正在构思整体结构，规划确定后会在这里显示页面方块。'}</p>}
      <div className="gp-strip" aria-label="页面生成状态">{state.pages.map((page, i) => <span className="gp-cell-wrap" key={page.pageId}>
        <span role="img" className={`gp-cell ${page.state === 'reworking' ? 'generating' : page.state}`} aria-label={`第 ${i + 1} 页 · ${page.pageTitle} · ${labels[page.state]}`} title={`第 ${i + 1} 页 · ${page.pageTitle} · ${labels[page.state]}`}>{page.state === 'ready' ? '✓' : page.state === 'failed' ? '!' : ''}</span>
      </span>)}</div>
      <div className="gp-legend"><span><i />待创作</span><span><i className="active" />生成中</span><span><i className="ready" />完成</span>{state.terminal && !state.completed && <span>未完成页面保持原状态</span>}</div>
      <div className="gp-metrics"><div className="gp-page-count"><strong>{state.ready.length}</strong><span>/ {state.total} 页完成</span></div><span>已用时 <b>{duration(state.elapsed)}</b></span><span>预计剩余 <b>{state.completed ? '完成' : duration(state.eta)}</b></span><svg className="gp-spark" viewBox="0 0 160 32" role="img" aria-label="页面完成进度曲线">{samples.length > 1 && <><polygon points={`2,32 ${points} 158,32`} /><polyline points={points} /></>}</svg></div>
      <section className="gp-feed" aria-label="生成详情"><h3>进展</h3><div className="gp-feed-list" ref={list} onScroll={event => { const el = event.currentTarget; follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 20; }}>{state.feed.length ? state.feed.map(item => <div className={`gp-feed-item ${item.kind.replaceAll('.', '-')}`} key={item.key}><i aria-hidden>{['page.ready', 'workflow-completed'].includes(item.kind) ? '✓' : ['failed', 'run.failed'].includes(item.kind) ? '!' : '·'}</i><span>{item.text}</span></div>) : <p>等待任务进展…</p>}</div></section>
    </div>
  );
}
