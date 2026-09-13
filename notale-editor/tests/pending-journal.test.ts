import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PendingJournal, pendingRecordKey, type Pending } from '../src/browser/pending-journal.js';
class MemoryStorage {
  map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}
const task = (documentId = 'lecture'): Pending => ({
  documentId,
  kind: 'commit',
  request: {
    baseVersion: 1,
    mutationId: randomUUID(),
    commands: [{ type: 'deck.update', title: 'Edited' }],
  },
  after: { undo: [1], redo: [] },
});
test('independent tab pointers and per-mutation journals retain unrelated pending writes and closed-tab recovery', () => {
  const local = new MemoryStorage(),
    sessionA = new MemoryStorage(),
    sessionB = new MemoryStorage();
  const a = new PendingJournal(local, sessionA),
    b = new PendingJournal(local, sessionB);
  const first = task(),
    second = task();
  a.put(first, 'A');
  b.put(second, 'B');
  assert.deepEqual(a.own('lecture')?.task, first);
  assert.deepEqual(b.own('lecture')?.task, second);
  assert.equal(a.list().entries.length, 2);
  b.clear(second);
  assert.deepEqual(a.own('lecture')?.task, first);
  assert.equal(b.own('lecture'), undefined);
  const reopened = new PendingJournal(local, new MemoryStorage());
  assert.equal(reopened.own('lecture'), undefined);
  reopened.adopt(reopened.list().entries[0].key);
  assert.deepEqual(reopened.own('lecture')?.task, first);
  reopened.clear(first);
  assert.equal(local.length, 0);
  assert.equal(a.own('lecture'), undefined);
});
test('a reused mutation cannot overwrite its request and clearing another mutation does not clear the current pointer', () => {
  const local = new MemoryStorage(),
    session = new MemoryStorage(),
    journal = new PendingJournal(local, session);
  const first = task(),
    second = task();
  journal.put(first, 'A');
  journal.put(second, 'B');
  assert.throws(
    () =>
      journal.put(
        {
          ...first,
          request: { ...first.request, commands: [{ type: 'deck.update', title: 'Different' }] },
        } as Pending,
        'different',
      ),
    /内容不同/,
  );
  journal.clear(first);
  assert.deepEqual(journal.own('lecture')?.task, second);
  assert.equal(journal.list().entries.length, 1);
});
test('durable-write and session-pointer failures leave the exact recoverable boundary', () => {
  const local = new MemoryStorage(),
    session = new MemoryStorage(),
    journal = new PendingJournal(local, session);
  const pending = task();
  local.setItem = () => {
    throw new Error('quota');
  };
  assert.throws(() => journal.put(pending, 'A'), /quota/);
  assert.equal(session.length, 0);
  local.setItem = (k, v) => {
    local.map.set(k, v);
  };
  session.setItem = () => {
    throw new Error('session denied');
  };
  assert.throws(() => journal.put(pending, 'A'), /session denied/);
  assert.deepEqual(journal.list().entries[0].entry.task, pending);
});
test('legacy requests migrate once without deleting an older application slot or resurrecting acknowledged work', () => {
  const local = new MemoryStorage(),
    journal = new PendingJournal(local, new MemoryStorage());
  const pending = task();
  delete pending.kind;
  const raw = JSON.stringify(pending);
  local.setItem('notale-editor-pending-v1', raw);
  const migrated = journal.migrateLegacy();
  assert.deepEqual(migrated?.task, pending);
  assert.equal(local.getItem('notale-editor-pending-v1'), raw);
  journal.adopt(pendingRecordKey(pending));
  journal.clear(pending);
  assert.equal(new PendingJournal(local, new MemoryStorage()).migrateLegacy(), undefined);
  assert.equal(journal.list().entries.length, 0);
  const later = task('other');
  local.setItem('notale-editor-pending-v1', JSON.stringify(later));
  assert.deepEqual(journal.migrateLegacy()?.task, later);
});
test('restore records and separate documents survive reload while corrupt records remain exportable', () => {
  const local = new MemoryStorage(),
    session = new MemoryStorage(),
    journal = new PendingJournal(local, session);
  const first = task(),
    restore: Pending = {
      documentId: 'other',
      kind: 'restore',
      request: { baseVersion: 4, mutationId: randomUUID(), version: 2 },
      after: { undo: [1, 4], redo: [] },
    };
  journal.put(first, 'First');
  journal.put(restore, 'Restore');
  const reload = new PendingJournal(local, session);
  assert.deepEqual(reload.own('lecture')?.task, first);
  assert.deepEqual(reload.own('other')?.task, restore);
  const key = pendingRecordKey(first);
  local.setItem(key, 'truncated');
  assert.throws(() => reload.own('lecture'), /无法解析/);
  assert.deepEqual(reload.list().invalid, [{ key, raw: 'truncated' }]);
  assert.deepEqual(reload.list().entries[0].entry.task, restore);
  assert.equal(local.getItem(key), 'truncated');
});

test('exported recovery imports its exact request without silently adopting it or replacing an existing mutation', () => {
  const local = new MemoryStorage(),
    journal = new PendingJournal(local, new MemoryStorage());
  const pending = task(),
    entry = journal.put(pending, 'Exported');
  const raw = JSON.stringify(entry);
  journal.clear(pending);
  assert.deepEqual(journal.importFile(raw).task, pending);
  assert.equal(journal.own(pending.documentId), undefined);
  assert.throws(() => journal.importFile('{invalid'), /JSON/);
  const invalid = JSON.parse(raw);
  invalid.task.documentId = '../../another-endpoint';
  assert.throws(() => journal.importFile(JSON.stringify(invalid)), /格式不正确/);
  const changed = JSON.parse(raw);
  changed.task.request.commands[0].title = 'Changed request';
  assert.throws(() => journal.importFile(JSON.stringify(changed)), /内容不同/);
  assert.deepEqual(journal.list().entries[0].entry.task, pending);
});
