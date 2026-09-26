import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCommands, validateDocument } from '../src/domain/commands.js';
import { authorChanges, applyAuthorChanges, reverseAuthorChanges } from '../src/domain/author-changes.js';
import { inspectSlide } from '../src/domain/html.js';
import { commitSchema, DomainError, type Command, type DeckDocument } from '../src/domain/model.js';

const tipHtml = '<!doctype html><html><body><main id="stage" data-notale-id="stage"><h1 data-notale-id="title">标题</h1>'
  + '<section data-notale-id="tip-root"><button data-notale-id="tip-toggle">看答案</button><p data-notale-id="tip-body">答案</p></section></main></body></html>';
const component = { id: 'tip', root: 'tip-root', name: '点击展开', initial: 'closed', duration: 200, easing: 'ease', steps: [],
  states: [{ id: 'closed', name: '收起', patches: { 'tip-body': { visible: false } } }, { id: 'open', name: '展开', patches: { 'tip-body': { visible: true } } }],
  events: [{ id: 'e1', target: 'tip-toggle', event: 'click', from: 'closed', to: 'open' }] };
const doc = (): DeckDocument => validateDocument({ schemaVersion: 1, id: 'doc', title: 't', slides: [
  { id: 'p1', name: '一', sourcePath: 'pages/p1.html', html: tipHtml, components: [component] },
  { id: 'p2', name: '二', sourcePath: 'pages/p2.html', html: '<!doctype html><html><body><main id="stage" data-notale-id="stage2"><p data-notale-id="x">x</p></main></body></html>' },
] });
const replace = (base: DeckDocument, slide: Record<string, unknown>) =>
  applyCommands(base, commitSchema.parse({ baseVersion: 1, mutationId: 'm', commands: [{ type: 'slide.replace', slideId: 'p1', slide }] }).commands as Command[]);
const rejects = (work: () => unknown, code: string) =>
  assert.throws(work, (error: unknown) => error instanceof DomainError && error.code === code);

test('a replaced page keeps the ids its author wrote and stamps only what is new', () => {
  const base = doc();
  const html = tipHtml.replace('<h1 data-notale-id="title">标题</h1>', '<h1 data-notale-id="title" style="color:#123">新标题</h1><p>新段落</p>');
  const next = replace(base, { ...base.slides[0], html });
  const objects = inspectSlide(next.slides[0]);
  assert.equal(objects.find(object => object.id === 'title')?.text, '新标题');
  const added = objects.find(object => object.text === '新段落');
  assert.ok(added && added.id.length > 0 && added.id !== 'title', 'the new paragraph got an id of its own');
  assert.equal(next.slides[0].components?.[0].id, 'tip', 'the component still points at tip-root');
  assert.equal(next.slides[1].html, base.slides[1].html, 'the other page is untouched');
});
test('page-level fields travel with the page', () => {
  const base = doc();
  const next = replace(base, { ...base.slides[0], name: '改名', notes: '讲到这里停一下', components: [] });
  assert.equal(next.slides[0].name, '改名');
  assert.equal(next.slides[0].notes, '讲到这里停一下');
  assert.deepEqual(next.slides[0].components, []);
});
test('a page cannot be renamed on disk or given another id by replacing it', () => {
  const base = doc();
  rejects(() => replace(base, { ...base.slides[0], id: 'other' }), 'SLIDE_IDENTITY');
  rejects(() => replace(base, { ...base.slides[0], sourcePath: 'pages/moved.html' }), 'SLIDE_IDENTITY');
});
test('removing an object a component still uses is refused, not silently dropped', () => {
  const base = doc();
  const html = tipHtml.replace('<p data-notale-id="tip-body">答案</p>', '');
  assert.throws(() => replace(base, { ...base.slides[0], html }), (error: unknown) => error instanceof DomainError);
});
test('a replacement undoes exactly: the reversed change set restores the page', () => {
  const base = doc();
  const next = replace(base, { ...base.slides[0], html: tipHtml.replace('标题', '别的标题'), name: '改名' });
  const change = authorChanges({ version: 1, document: base } as never, { version: 2, document: next } as never);
  const undone = applyAuthorChanges({ version: 2, document: next } as never, reverseAuthorChanges(change));
  assert.deepEqual(undone.document, base);
});
