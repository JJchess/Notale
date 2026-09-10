import { commitSchema, identifier } from '@notale/editor/browser';

export type HistoryPlan = { undo: number[]; redo: number[] };
export type Pending = {
  owner?: string;
  inverseVersion?: number;
  historyAction?: 'undo' | 'redo';
  geometry?: boolean;
  vector?: boolean;
  textEdit?: {sessionId:string;sequence:number;target:string};
  documentId: string;
  after?: HistoryPlan;
  slideId?: string;
  selection?: string[];
} & (
  | { kind?: 'commit'; request: { baseVersion: number; mutationId: string; commands: unknown[] } }
  | { kind: 'restore'; request: { baseVersion: number; mutationId: string; version: number } }
);
export type PendingEntry = { schema: 2; task: Pending; title: string; createdAt: number };
type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;
const prefix = 'notale-editor-pending-v2:';
const pointerPrefix = 'notale-editor-own-pending-v2:';
const legacyKey = 'notale-editor-pending-v1';
export const isJournalKey = (key: string | null) => !key || key.startsWith(prefix);
export function validHistory(value: unknown): value is HistoryPlan {
  const plan = value as HistoryPlan | undefined;
  return (
    !!plan &&
    [plan.undo, plan.redo].every(
      (entries) => Array.isArray(entries) && entries.every((v) => Number.isSafeInteger(v) && v > 0),
    )
  );
}
export function isPending(value: unknown): value is Pending {
  const p = value as Pending | undefined;
  if (
    !p ||
    !identifier.safeParse(p.documentId).success ||
    !p.request ||
    (p.after !== undefined && !validHistory(p.after)) ||
    (p.slideId !== undefined && typeof p.slideId !== 'string') ||
    (p.selection !== undefined &&
      (!Array.isArray(p.selection) || !p.selection.every((id) => typeof id === 'string')))
  )
    return false;
  if (p.kind === 'restore') {
    return (
      commitSchema.shape.baseVersion.safeParse(p.request.baseVersion).success &&
      commitSchema.shape.mutationId.safeParse(p.request.mutationId).success &&
      Number.isSafeInteger(p.request.version) &&
      p.request.version > 0
    );
  }
  return (p.kind === undefined || p.kind === 'commit') && commitSchema.safeParse(p.request).success;
}
export const pendingRecordKey = (p: Pending) =>
  `${prefix}${encodeURIComponent(p.documentId)}:${encodeURIComponent(p.request.mutationId)}`;
const pointerKey = (documentId: string) => pointerPrefix + encodeURIComponent(documentId);
/** Each mutation owns a separate immutable record. A tab's per-document pointer
 * is only a convenience: losing a tab never makes its local records unreachable.
 * Duplicated tabs may share a pointer; retrying that exact request remains safe
 * through server idempotency, without overwriting unrelated pending mutations. */
export class PendingJournal {
  constructor(
    private local: StorageLike,
    private session: StorageLike,
    private now = Date.now,
  ) {}
  read(key: string): PendingEntry | undefined {
    const raw = this.local.getItem(key);
    if (raw === null) return undefined;
    let entry: PendingEntry;
    try {
      entry = JSON.parse(raw);
    } catch {
      throw new Error('恢复记录无法解析，原始修改仍保留在本机');
    }
    if (
      entry?.schema !== 2 ||
      !isPending(entry.task) ||
      typeof entry.title !== 'string' ||
      !Number.isFinite(entry.createdAt) ||
      pendingRecordKey(entry.task) !== key
    )
      throw new Error('恢复记录格式不正确，原始修改仍保留在本机');
    return entry;
  }
  list() {
    const entries: { key: string; entry: PendingEntry }[] = [],
      invalid: { key: string; raw: string }[] = [];
    for (let i = 0; i < this.local.length; i++) {
      const key = this.local.key(i);
      if (!key?.startsWith(prefix)) continue;
      try {
        const entry = this.read(key);
        if (entry) entries.push({ key, entry });
      } catch {
        invalid.push({ key, raw: this.local.getItem(key) ?? '' });
      }
    }
    entries.sort((a, b) => a.entry.createdAt - b.entry.createdAt || a.key.localeCompare(b.key));
    return { entries, invalid };
  }
  own(documentId: string) {
    const key = this.session.getItem(pointerKey(documentId));
    if (!key) return undefined;
    const entry = this.read(key);
    if (entry && entry.task.documentId !== documentId) throw new Error('恢复记录与讲义不匹配');
    if (!entry) this.session.removeItem(pointerKey(documentId));
    return entry;
  }
  private store(task: Pending, title: string, createdAt = this.now()) {
    if (!isPending(task)) throw new Error('无法记录无效的保存请求');
    const key = pendingRecordKey(task),
      existing = this.read(key);
    if (existing) {
      if (JSON.stringify(existing.task) !== JSON.stringify(task))
        throw new Error('这批修改的恢复记录已存在且内容不同');
      return existing;
    }
    const entry: PendingEntry = { schema: 2, task, title, createdAt };
    this.local.setItem(key, JSON.stringify(entry));
    return entry;
  }
  put(task: Pending, title: string) {
    const entry = this.store(task, title);
    // Only publish the tab pointer after the complete request is durable.
    this.session.setItem(pointerKey(task.documentId), pendingRecordKey(task));
    return entry;
  }
  adopt(key: string) {
    const entry = this.read(key);
    if (!entry) throw new Error('这批修改已由其他窗口处理，请刷新讲义');
    this.session.setItem(pointerKey(entry.task.documentId), key);
    return entry;
  }
  clear(task: Pending) {
    const key = pendingRecordKey(task),
      existing = this.read(key);
    if (existing && JSON.stringify(existing.task) !== JSON.stringify(task))
      throw new Error('恢复记录内容已变化，尚未清除');
    this.local.removeItem(key);
    if (this.session.getItem(pointerKey(task.documentId)) === key)
      this.session.removeItem(pointerKey(task.documentId));
  }
  importFile(raw: string) {
    let entry: PendingEntry;
    try {
      entry = JSON.parse(raw);
    } catch {
      throw new Error('恢复文件不是有效的 JSON');
    }
    if (
      entry?.schema !== 2 ||
      !isPending(entry.task) ||
      typeof entry.title !== 'string' ||
      !Number.isFinite(entry.createdAt)
    )
      throw new Error('恢复文件格式不正确');
    return this.store(entry.task, entry.title, entry.createdAt);
  }
  migrateLegacy() {
    const raw = this.local.getItem(legacyKey);
    if (!raw) return undefined;
    let task: unknown;
    try {
      task = JSON.parse(raw);
    } catch {
      throw new Error('旧版恢复记录无法解析，原始数据已保留');
    }
    if (!isPending(task)) throw new Error('旧版恢复记录格式不正确，原始数据已保留');
    const marker = 'notale-editor-migrated-v1:' + pendingRecordKey(task);
    if (this.local.getItem(marker)) return undefined;
    const entry = this.store(task, '此前未确认的修改');
    // Retain the old slot rather than racing an older application writing to it.
    // The marker prevents a successfully handled legacy request being resurrected.
    this.local.setItem(marker, '1');
    return entry;
  }
}
