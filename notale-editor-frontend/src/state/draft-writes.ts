import type {Pending} from '../pending-journal';

/** Serial staging with retained snapshots for failed local writes. */
export class DraftWrites {
  private tail = Promise.resolve();
  private pending = new Map<string, Pending>();
  constructor(private write: (task: Pending) => Promise<void>) {}

  stage(task: Pending): Promise<void> {
    const snapshot = structuredClone(task);
    const id = snapshot.request.mutationId;
    this.pending.set(id, snapshot);
    this.tail = this.tail.catch(() => {}).then(async () => {
      await this.write(snapshot);
      if (this.pending.get(id) === snapshot) this.pending.delete(id);
    });
    return this.tail;
  }

  /** Called after producers stop; successful writes are never replayed. */
  async retain(): Promise<void> {
    await this.tail.catch(() => {});
    const failures: unknown[] = [];
    for (const task of [...this.pending.values()]) {
      try { await this.stage(task); } catch (cause) { failures.push(cause); }
    }
    if (failures.length) throw new AggregateError(failures, '部分草稿未能写入本机');
  }
}
