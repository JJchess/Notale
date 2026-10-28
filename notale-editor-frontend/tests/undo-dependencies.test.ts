import assert from 'node:assert/strict';
import { test } from 'node:test';
import { authorChanges, type Snapshot } from '@notale/editor/browser';
import { documentSchema } from '@notale/editor';
import { EditorKernel } from '../src/editor-kernel';
import { isPending, PendingJournal, type Pending } from '../src/pending-journal';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    key: (index: number) => [...values.keys()][index] ?? null,
  };
}

function fixture() {
  const queue: Pending[] = [];
  const kernel = new EditorKernel({
    operations: () => queue, owner: () => 'owner',
    stage: async () => {}, finalize: async () => {},
    enqueue: async task => { queue.push(structuredClone(task)); },
    // The first edit has already been sent, so undo must be an inverse edit.
    cancel: async () => false,
    prepare: async () => { throw Error('Unexpected preparation'); },
    barrier: async () => {}, changed: () => {}, preview: () => {}, error: () => {},
  });
  const initial: Snapshot = {
    version: 1, createdAt: '2026-10-21T00:00:00Z', actor: 'test',
    document: documentSchema.parse({ schemaVersion: 1, id: 'document', title: 'Before', slides: [{ id: 'page', name: 'Page', sourcePath: 'pages/page.html', html: '<p>Content</p>' }] }),
  };
  kernel.load(initial);
  function acknowledge(task: Pending, title: string) {
    const next = structuredClone(kernel.confirmed);
    next.version++;
    next.document.title = title;
    kernel.accept({ ...authorChanges(kernel.confirmed, next), mutationId: task.request.mutationId });
    kernel.acknowledge(task.request.mutationId, next.version);
  }
  return { kernel, queue, acknowledge };
}

test('undo and redo admitted before the first acknowledgement retain their causal predecessors', async () => {
  const { kernel, queue } = fixture();
  await kernel.execute([{ type: 'deck.update', title: 'After' }]);
  const edit = queue[0];
  assert.equal(await kernel.undo(), true);
  const undo = queue[1];
  assert.equal(kernel.current.document.title, 'Before');
  assert.equal(await kernel.redo(), true);
  const redo = queue[2];
  assert.equal(kernel.current.document.title, 'After');

  assert.equal(undo.inverseMutationId, edit.request.mutationId);
  assert.equal(redo.inverseMutationId, undo.request.mutationId);
  assert.deepEqual(undo.kernel?.dependencies, [edit.request.mutationId]);
  assert.deepEqual(redo.kernel?.dependencies, [edit.request.mutationId, undo.request.mutationId]);
  assert.deepEqual(queue.map(task => task.request.baseVersion), [1, 1, 1]);
  assert.equal(undo.historyAction, 'undo');
  assert.equal(redo.historyAction, 'redo');
  for (const task of queue) assert.equal(isPending(JSON.parse(JSON.stringify(task))), true);
});

test('durable inverse retries keep the same request after earlier acknowledgements advance the base', async () => {
  const { kernel, queue, acknowledge } = fixture();
  await kernel.execute([{ type: 'deck.update', title: 'After' }]);
  await kernel.undo();
  await kernel.redo();
  const [edit, undo, redo] = queue;
  let timestamp = 0;
  const journal = new PendingJournal(memoryStorage(), memoryStorage(), () => timestamp++);
  const undoBytes = JSON.stringify(undo), redoBytes = JSON.stringify(redo);
  journal.put(undo, 'Undo');
  journal.put(redo, 'Redo');

  acknowledge(edit, 'After');
  acknowledge(undo, 'Before');
  assert.equal(kernel.confirmed.version, 3);
  assert.equal(kernel.current.document.title, 'After');
  assert.equal(JSON.stringify(undo), undoBytes);
  assert.equal(JSON.stringify(redo), redoBytes);
  // Reusing the durable mutation is accepted only if its complete request is unchanged.
  assert.doesNotThrow(() => journal.put(JSON.parse(undoBytes), 'Undo retry'));
  assert.doesNotThrow(() => journal.put(JSON.parse(redoBytes), 'Redo retry'));
  assert.deepEqual(journal.list().entries.map(item => item.entry.task), [JSON.parse(undoBytes), JSON.parse(redoBytes)]);
  assert.deepEqual(redo.kernel?.dependencies, [edit.request.mutationId, undo.request.mutationId]);
  assert.equal(redo.request.baseVersion, 1);
});

test('confirmed inverse history remains undoable while acknowledged predecessors leave new dependencies', async () => {
  const { kernel, queue, acknowledge } = fixture();
  await kernel.execute([{ type: 'deck.update', title: 'After' }]);
  await kernel.undo();
  await kernel.redo();
  const [edit, undo, redo] = queue;
  acknowledge(edit, 'After');
  acknowledge(undo, 'Before');
  acknowledge(redo, 'After');
  assert.equal(kernel.confirmed.version, 4);

  // Keep acknowledged records in operations(), as happens before journal cleanup.
  assert.equal(await kernel.undo(), true);
  const secondUndo = queue[3];
  assert.equal(secondUndo.inverseMutationId, redo.request.mutationId);
  assert.equal(secondUndo.request.baseVersion, 4);
  assert.deepEqual(secondUndo.kernel?.dependencies, []);
  assert.equal(kernel.current.document.title, 'Before');
  acknowledge(secondUndo, 'Before');
  queue.splice(0, 4);

  assert.equal(await kernel.redo(), true);
  const secondRedo = queue[0];
  assert.equal(secondRedo.inverseMutationId, secondUndo.request.mutationId);
  assert.equal(secondRedo.request.baseVersion, 5);
  assert.deepEqual(secondRedo.kernel?.dependencies, []);
  assert.equal(kernel.current.document.title, 'After');
  acknowledge(secondRedo, 'After');
  assert.equal(kernel.confirmed.version, 6);
  assert.equal(kernel.confirmed.document.title, 'After');
});
