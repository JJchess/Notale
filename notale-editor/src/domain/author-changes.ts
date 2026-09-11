import type { Command, Snapshot } from './model.js';

/** Wire changes describe committed author state, never live/runtime DOM. */
export type AuthorChange = {
  path: (string | number)[];
  before?: unknown;
  after?: unknown;
  /** HTML is losslessly spliced so a paint edit does not transfer a whole slide. */
  splice?: { start: number; removed: string; inserted: string };
};
export type AuthorChangeSet = {
  protocol: 2;
  mutationId?: string;
  slideIds?: string[];
  documentId: string;
  fromVersion: number;
  toVersion: number;
  changes: AuthorChange[];
};
export type SyncAcknowledgement = { mutationId: string; committedVersion: number; change: AuthorChangeSet };
export type AuthorChangesPage = { changes: AuthorChangeSet[]; headVersion: number; throughVersion: number; hasMore: boolean };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const same = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

export function authorChanges(before: Snapshot, after: Snapshot): AuthorChangeSet {
  if (before.document.id !== after.document.id) throw Error('Cannot diff different documents');
  const changes: AuthorChange[] = [];
  function visit(a: unknown, b: unknown, path: (string | number)[]) {
    if (same(a, b)) return;
    if (typeof a === 'string' && typeof b === 'string' && path.at(-1) === 'html') {
      let start = 0, end = 0;
      while (start < Math.min(a.length, b.length) && a[start] === b[start]) start++;
      while (end < Math.min(a.length, b.length) - start && a[a.length - end - 1] === b[b.length - end - 1]) end++;
      changes.push({ path, splice: { start, removed: a.slice(start, a.length - end), inserted: b.slice(start, b.length - end) } });
    } else if (object(a) && object(b)) {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) visit(a[key], b[key], [...path, key]);
    } else if (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => !object(v) || !('id' in v) || object(b[i]) && v.id === b[i].id)) {
      a.forEach((value, i) => visit(value, b[i], [...path, i]));
    } else changes.push({ path, ...(a === undefined ? {} : { before: a }), ...(b === undefined ? {} : { after: b }) });
  }
  visit(before.document, after.document, []);
  return { protocol: 2, slideIds: before.document.slides.map(s=>s.id), documentId: after.document.id, fromVersion: before.version, toVersion: after.version, changes };
}

/** Copy only modified branches. Preconditions detect a missing/out-of-order base. */
export function applyAuthorChanges(snapshot: Snapshot, change: AuthorChangeSet): Snapshot {
  if (snapshot.document.id !== change.documentId || snapshot.version !== change.fromVersion) throw Error('AUTHOR_VERSION_GAP');
  let document = snapshot.document;
  for (const patch of change.changes) {
    if (patch.path.some(key => ['__proto__', 'constructor', 'prototype'].includes(String(key)))) throw Error('INVALID_AUTHOR_PATH');
    function apply(value: any, depth: number): any {
      if (depth === patch.path.length) {
        if (patch.splice) {
          const { start, removed, inserted } = patch.splice;
          if (typeof value !== 'string' || value.slice(start, start + removed.length) !== removed) throw Error('AUTHOR_BASE_MISMATCH');
          return value.slice(0, start) + inserted + value.slice(start + removed.length);
        }
        if (!same(value, patch.before)) throw Error('AUTHOR_BASE_MISMATCH');
        return structuredClone(patch.after);
      }
      const key = patch.path[depth], result = Array.isArray(value) ? [...value] : { ...value };
      const next = apply(value?.[key], depth + 1);
      if (next === undefined) delete result[key]; else result[key] = next;
      return result;
    }
    document = apply(document, 0);
  }
  return { ...snapshot, version: change.toVersion, document };
}

export function reverseAuthorChanges(change: AuthorChangeSet, fromVersion = change.toVersion, toVersion = change.fromVersion): AuthorChangeSet {
  return { ...change, fromVersion, toVersion, changes: [...change.changes].reverse().map(p => p.splice
    ? { path: p.path, splice: { start: p.splice.start, removed: p.splice.inserted, inserted: p.splice.removed } }
    : { path: p.path, ...('after' in p ? { before: p.after } : {}), ...('before' in p ? { after: p.before } : {}) }) };
}

export type OperationPolicy = 'property' | 'structure' | 'metadata' | 'runtime' | 'resource';
/** Exhaustive registration is mandatory for every new domain command. */
export const operationPolicies = {
  'svg.patch':'runtime','svg.structure':'runtime','svg.import':'structure',
  'deck.update':'metadata','layout.set':'runtime','comment.set':'metadata','comment.remove':'metadata',
  'layout.remove':'runtime','layout.detach':'structure','layout.checkout':'structure','layout.publish':'runtime','layout.image':'runtime','layout.values':'runtime',
  'slide.insert':'structure','slide.duplicate':'structure','slide.delete':'structure','slide.move':'metadata','slide.update':'metadata',
  'connector.set':'runtime','element.patch':'property','media.update':'runtime','native-chart.convert':'runtime','chart.update':'runtime','table.edit':'structure',
  'element.content':'structure','element.insert':'structure','element.delete':'structure','element.duplicate':'structure','elements.order':'property','elements.transfer':'structure',
  'elements.arrange':'property','element.move':'structure','element.transform':'property','element.lock':'metadata','group.set':'metadata','group.remove':'metadata',
  'step.initialize':'metadata','step.insert':'metadata','step.duplicate':'metadata','step.remove':'metadata','step.move':'metadata','step.update':'metadata',
  'animation.set':'metadata','animation.remove':'metadata','animation.reorder':'metadata',
  'native-chart.set':'runtime','native-chart.remove':'runtime','native-chart.create':'runtime','native-chart.edit':'runtime','native-chart.reset':'runtime',
  'container.layout':'structure','component.publish':'runtime','component.instantiate':'runtime','component.override':'runtime','component.unlink':'runtime',
  'component.library-remove':'runtime','component.checkout':'runtime','component.set':'runtime','component.remove':'runtime','component.state':'runtime',
  'native-chart.state':'runtime','native-chart.component':'runtime','native-chart.appearance':'runtime',
  'scene.set':'runtime','scene.remove':'runtime','scene.checkpoint':'runtime','binding.set':'runtime','binding.remove':'runtime','asset.put':'resource','asset.remove':'resource',
} satisfies Record<Command['type'], OperationPolicy>;
