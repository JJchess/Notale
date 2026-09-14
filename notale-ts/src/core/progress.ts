import type { PageProgress, RunEvent } from '../protocol/index.js';
import type { BuilderPorts } from './builder.js';
import { auditLines } from './builder.js';

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

/** Observes existing tools only. Neither tool values nor their exceptions are replaced. */
export function observeBuilder(ports: BuilderPorts, notice: (pid: string, state: 'checking' | 'generating' | 'reworking', message: string) => void): BuilderPorts {
  const report = (pid: string, text: string) => {
    const [fatal, visual] = auditLines(text);
    notice(pid, fatal.length || visual.length ? 'reworking' : 'generating',
      fatal.length || visual.length ? '检查发现问题，正在调整' : '本次检查完成，继续创作');
  };
  const safe = (action: () => void) => { try { action(); } catch { /* Telemetry cannot alter a tool result. */ } };
  return { ...ports,
    async run(name, args, context, signal) {
      if (name === 'Check') safe(() => notice(context.pid, 'checking', '正在检查页面'));
      const result = await ports.run(name, args, context, signal);
      if (name === 'Check') safe(() => report(context.pid, typeof result === 'string' ? result : result.text));
      return result;
    },
    async codeCheck(cwd, pid, shot, signal) {
      safe(() => notice(pid, 'checking', '正在检查代码演示'));
      const result = await ports.codeCheck(cwd, pid, shot, signal);
      safe(() => report(pid, result.report));
      return result;
    },
  };
}
