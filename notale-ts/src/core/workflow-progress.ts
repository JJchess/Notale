/** Optional observations: never awaited by generation and never allowed to alter it. */
export interface WorkflowProgress {
  module: 'planner' | 'director';
  step: string;
  status: 'started' | 'completed' | 'reworking' | 'failed' | 'skipped';
  occurredAt: string;
  message: string;
}
export type ProgressObserver = (event: WorkflowProgress) => void;
export function workflowNotice(observer: ProgressObserver | undefined, module: WorkflowProgress['module'], step: string, status: WorkflowProgress['status'], message: string): void {
  if (!observer) return;
  try { Promise.resolve(observer({ module, step, status, message, occurredAt: new Date().toISOString() })).catch(() => {}); } catch {}
}
export async function observedStep<T>(observer: ProgressObserver | undefined, module: WorkflowProgress['module'], step: string, label: string, work: () => Promise<T>): Promise<T> {
  workflowNotice(observer, module, step, 'started', `${label}开始`);
  try { const result = await work(); workflowNotice(observer, module, step, 'completed', `${label}完成`); return result; }
  catch (error) { workflowNotice(observer, module, step, 'failed', `${label}未完成`); throw error; }
}
