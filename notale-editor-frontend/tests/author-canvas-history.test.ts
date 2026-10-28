import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Command, Snapshot } from '@notale/editor/browser';
import { documentSchema } from '@notale/editor';
import { AuthorCanvasController } from '../src/canvas/author-controller';

const markup = (text: string) => `<p data-notale-id="object">${text}</p>`;

// This fixture only models a paragraph's textContent, which the real projection
// code reads/writes. Full CSS/geometry reconciliation is covered in the browser.
function documentEnvironment() {
  const originals = new Map(['DOMParser', 'CSS'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const values = {
    DOMParser: class {
      parseFromString(html: string) {
        assert.ok(html.startsWith('<p data-notale-id="object">') && html.endsWith('</p>'));
        const node = { textContent: html.slice('<p data-notale-id="object">'.length, -4) };
        return {
          doctype: null,
          querySelector: (selector: string) => { assert.equal(selector, '[data-notale-id="object"]'); return node; },
          documentElement: { get outerHTML() { return markup(node.textContent); } },
        };
      }
    },
    CSS: { escape: (value: string) => value },
  };
  for (const [key, value] of Object.entries(values)) Object.defineProperty(globalThis, key, { configurable: true, value });
  return () => {
    for (const [key, value] of originals) {
      if (value) Object.defineProperty(globalThis, key, value);
      else Reflect.deleteProperty(globalThis, key);
    }
  };
}

function snapshot(html: string): Snapshot {
  return {
    version: 1, createdAt: '2026-10-21T00:00:00Z', actor: 'test',
    document: documentSchema.parse({
      schemaVersion: 1, id: 'document', title: 'Document',
      slides: [{ id: 'page', name: 'Page', sourcePath: 'page.html', html }],
    }),
  };
}

function fixture() {
  const restore = documentEnvironment();
  let current = snapshot(markup('original'));
  const messages: { type: string; data: unknown }[] = [];
  const controller = new AuthorCanvasController({
    send: (type, data) => messages.push({ type, data }), onDispose: () => () => {},
  }, {
    snapshot: () => current, confirmed: () => current, pageId: () => 'page',
    preview: async () => { throw Error('Unexpected resource request'); },
    painted: () => {}, refreshed: () => {}, pageRemoved: async () => {},
  });
  const seed = () => controller.seed(current, current.document.slides[0], 'https://content.test/page.html');
  seed();
  const updates = () => messages.filter(message => message.type === 'author-update').map(message => ({
    ...message, data: message.data as { before: string; after: string },
  }));
  return { controller, messages, seed, set: (text: string) => { current = snapshot(markup(text)); }, updates, close: () => { controller.dispose(); restore(); } };
}

function localPaint(text: string): Command[] {
  return [{ type: 'element.patch', slideId: 'page', target: 'object', patch: { text } }];
}

test('already painted edits become the undo baseline without sending a duplicate preview', async () => {
  const f = fixture();
  try {
    const commands = localPaint('dragged');
    f.controller.recordLocalPreview(commands);
    (commands[0] as Extract<Command, { type: 'element.patch' }>).patch.text = 'mutated after admission';
    assert.deepEqual(f.messages, []);
    await f.controller.update();
    assert.equal(f.updates()[0].data.before, markup('dragged'));
    assert.equal(f.updates()[0].data.after, markup('original'));
  } finally { f.close(); }
});

test('multiple local paints are consumed once before acknowledgement and a later undo', async () => {
  const f = fixture();
  try {
    f.controller.recordLocalPreview(localPaint('first drag'));
    f.controller.recordLocalPreview(localPaint('second drag'));
    f.set('second drag');
    await f.controller.update();
    f.set('first drag');
    await f.controller.update();
    assert.deepEqual(f.updates().map(message => [message.data.before, message.data.after]), [
      [markup('second drag'), markup('second drag')], [markup('second drag'), markup('first drag')],
    ]);
    assert.equal(f.messages.some(message => message.type === 'author-preview'), false);
  } finally { f.close(); }
});

test('changing pages discards local paint baselines even when object and page identities are reused', async () => {
  const f = fixture();
  try {
    f.controller.recordLocalPreview(localPaint('old page drag'));
    f.controller.beginPage();
    f.set('new page original');
    f.seed();
    f.set('new page change');
    await f.controller.update();
    assert.deepEqual(f.updates().map(message => [message.data.before, message.data.after]), [[markup('new page original'), markup('new page change')]]);
    f.controller.recordLocalPreview(localPaint('new page drag'));
    f.controller.resetDocument();
    f.set('another document original');
    f.seed();
    await f.controller.update();
    assert.equal(f.updates().at(-1)?.data.before, markup('another document original'));
  } finally { f.close(); }
});

test('disposed controllers ignore late local paints and preview calls', async () => {
  const f = fixture();
  try {
    f.controller.dispose();
    f.controller.recordLocalPreview(localPaint('late drag'));
    f.controller.preview(localPaint('late inspector preview'));
    await f.controller.update();
    assert.deepEqual(f.messages, []);
  } finally { f.close(); }
});
