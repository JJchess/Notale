import type { PageProgress, RunEvent, RunSnapshot } from "./protocol";

export function projectPages(previous: PageProgress[] = [], event: RunEvent): PageProgress[] {
  const pages = new Map(previous.map(page => [page.pageId, { ...page }]));
  if (event.kind === 'plan.ready') for (const page of event.pages ?? []) {
    if (!pages.has(page.pageId)) pages.set(page.pageId, { ...page });
    else pages.get(page.pageId)!.pageTitle = page.pageTitle;
  }
  if (event.pageId && ['page.started', 'page.progress', 'page.ready'].includes(event.kind)) {
    const page = pages.get(event.pageId) ?? { pageId: event.pageId, pageTitle: event.pageTitle ?? event.pageId, state: 'pending' };
    // Ready/failed pages are terminal; late observational notices cannot roll them back.
    if (!['ready', 'failed', 'cancelled'].includes(page.state)) {
      page.state = event.kind === 'page.ready' ? 'ready' : event.kind === 'page.started' ? 'generating' : event.pageState ?? page.state;
      page.message = event.message;
      page.updatedAt = event.timestamp;
    }
    if (event.pageTitle) page.pageTitle = event.pageTitle;
    if (event.kind === 'page.ready') page.previewUrl = event.previewUrl;
    pages.set(page.pageId, page);
  }
  if (['run.cancelled', 'run.failed'].includes(event.kind)) for (const page of pages.values()) {
    if (!['ready', 'failed'].includes(page.state)) {
      page.state = event.kind === 'run.cancelled' ? 'cancelled' : 'unknown';
      page.updatedAt = event.timestamp;
    }
  }
  return [...pages.values()].sort((a, b) => a.pageId.localeCompare(b.pageId, 'en', { numeric: true }));
}

export function orderedEvents(events: RunEvent[]): RunEvent[] {
  return [...new Map(events.map(event => [event.sequence, event])).values()].sort((a, b) => a.sequence - b.sequence);
}

export function progressState(run: RunSnapshot | undefined, events: RunEvent[], now: number) {
  const ordered = orderedEvents(events);
  const pages = ordered.filter(event => !run?.pages || event.sequence > run.lastSequence)
    .reduce(projectPages, run?.pages ?? []);
  const ready = pages.filter(page => page.state === 'ready');
  const completed = run?.status === 'completed';
  const terminal = completed || run?.status === 'failed' || run?.status === 'cancelled';
  const start = run ? Date.parse(run.createdAt) : ordered[0] ? Date.parse(ordered[0].timestamp) : now;
  const end = terminal ? Date.parse(ordered.findLast(event => ['run.completed', 'run.failed', 'run.cancelled'].includes(event.kind))?.timestamp ?? run!.updatedAt) : now;
  const elapsed = Math.max(0, end - start);
  const total = pages.length;
  const fraction = total ? ready.length / total : 0;
  const percent = completed ? 100 : Math.min(99, Math.round(fraction * 100));
  const eta = !terminal && ready.length > 0 && total > ready.length && elapsed > 1500 ? elapsed / ready.length * (total - ready.length) : undefined;
  const doneIds = new Set<string>();
  const samples: { t: number; fraction: number }[] = [];
  for (const event of ordered) if (event.kind === 'page.ready' && event.pageId && !doneIds.has(event.pageId)) {
    doneIds.add(event.pageId);
    samples.push({ t: Math.max(0, Date.parse(event.timestamp) - start), fraction: Math.min(1, doneIds.size / Math.max(1, total)) });
  }
  if (completed && samples.at(-1)?.fraction !== 1) samples.push({ t: elapsed, fraction: 1 });
  const feed = ordered.flatMap<{ key: string; text: string; kind: string }>(event => event.kind === 'plan.ready' ? (event.pages ?? []).map((page, i) => ({
    key: `${event.sequence}:${page.pageId}`, text: `构思出第 ${i + 1} 页 · ${page.pageTitle}`, kind: event.kind,
  })) : [{ key: String(event.sequence), text: event.message, kind: event.kind === 'workflow.progress' ? `workflow-${event.workflow?.status ?? 'started'}` : event.kind === 'page.progress' ? event.pageState ?? event.kind : event.kind }]).slice(-60);
  return { pages, ready, completed, terminal, elapsed, total, percent, eta, samples, feed };
}

export function duration(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms)) return '—';
  const seconds = Math.max(0, Math.round(ms / 1000));
  return seconds >= 60 ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : `${seconds}s`;
}
