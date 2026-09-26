import type {ClosingSession} from './closing-sessions';

export interface ShutdownProducer {
  name: string;
  /** Stop accepting edits synchronously, then retain any unfinished draft. Retryable. */
  seal: () => Promise<void>;
}

/** Owns shutdown independently of the React tree that initiated it. */
export class SessionShutdown implements ClosingSession {
  private pending?: Promise<void>;
  private finished = false;
  private retained = new Set<ShutdownProducer>();

  constructor(
    private producers: readonly ShutdownProducer[],
    private session: ClosingSession,
  ) {}

  close = (): Promise<void> => {
    if (this.finished) return Promise.resolve();
    if (this.pending) return this.pending;
    // Invoke every producer before awaiting any: a slow writer must not leave
    // another producer accepting new edits during shutdown.
    const tasks = this.producers.filter(producer => !this.retained.has(producer)).map(producer => {
      try {
        return Promise.resolve(producer.seal()).then(() => { this.retained.add(producer); });
      } catch (cause) {
        return Promise.reject(cause);
      }
    });
    this.pending = (async () => {
      const results = await Promise.allSettled(tasks);
      const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
      if (failures.length) throw new AggregateError(failures.map(result => result.reason), '部分编辑尚未保留，请重试或导出草稿');
      await this.session.close();
      this.finished = true;
    })().finally(() => { this.pending = undefined; });
    return this.pending;
  };

  exportDraft = () => this.session.exportDraft();
}
