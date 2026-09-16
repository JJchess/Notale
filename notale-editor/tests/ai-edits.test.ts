import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scopeIds, checkAiCommands, parseCommands, aiEdit } from '../src/server/ai-edits.js';
import { DomainError, type Command } from '../src/domain/model.js';
const objects = [
  { id: 'stage' },
  { id: 'card', parent: 'stage' },
  { id: 'title', parent: 'card' },
  { id: 'body', parent: 'card' },
  { id: 'outside', parent: 'stage' },
];
const scope = scopeIds(objects, ['card']);
const check = (commands: unknown[], intent: 'insert-interactive' | 'edit-selection' = 'edit-selection') =>
  checkAiCommands(commands as Command[], { intent, slideId: 'page', scope });
const rejects = (commands: unknown[], code: string, intent?: 'insert-interactive' | 'edit-selection') =>
  assert.throws(() => check(commands, intent), (error: unknown) => error instanceof DomainError && error.code === code);

test('a local edit reaches the selection and everything inside it, nothing else', () => {
  assert.deepEqual([...scope].sort(), ['body', 'card', 'title']);
  check([{ type: 'element.patch', slideId: 'page', target: 'title', patch: { text: '新标题' } }]);
  rejects([{ type: 'element.patch', slideId: 'page', target: 'outside', patch: { text: 'x' } }], 'AI_TARGET_OUT_OF_SCOPE');
  rejects([{ type: 'element.insert', slideId: 'page', html: '<p>x</p>', parent: 'outside' }], 'AI_TARGET_OUT_OF_SCOPE');
  rejects([{ type: 'component.set', slideId: 'page', component: { id: 'c', root: 'outside', initial: 'a', states: [], events: [] } }], 'AI_TARGET_OUT_OF_SCOPE');
});
test('commands outside the vocabulary never reach the document', () => {
  for (const command of [
    { type: 'deck.update', title: '改标题' },
    { type: 'asset.remove', path: 'media/x.png' },
    { type: 'layout.publish', slideId: 'page' },
    { type: 'svg.import', slideId: 'page', html: '<svg/>' },
  ])
    rejects([command], 'AI_COMMAND_NOT_ALLOWED');
});
test('an edit may not wander onto another page', () => {
  rejects([{ type: 'element.patch', slideId: 'other', target: 'title', patch: { text: 'x' } }], 'AI_SLIDE_OUT_OF_SCOPE');
});
test('inserting an interaction may use a scratch page it created in the same batch', () => {
  const batch = [
    { type: 'slide.insert', after: 'page', slide: { id: 'temp' } },
    { type: 'elements.transfer', slideId: 'page', sourceSlideId: 'temp', targets: ['root'] },
    { type: 'slide.delete', slideId: 'temp' },
  ];
  check(batch, 'insert-interactive');
  rejects(
    [{ type: 'elements.transfer', slideId: 'page', sourceSlideId: 'someone-elses-page', targets: ['root'] }],
    'AI_SLIDE_OUT_OF_SCOPE',
    'insert-interactive',
  );
  rejects([{ type: 'slide.delete', slideId: 'page' }], 'AI_SLIDE_OUT_OF_SCOPE', 'insert-interactive');
});
test('an insert may not quietly rewrite or delete what is already on the page', () => {
  rejects([{ type: 'element.delete', slideId: 'page', target: 'title' }], 'AI_COMMAND_NOT_ALLOWED', 'insert-interactive');
  rejects([{ type: 'element.content', slideId: 'page', target: 'card', html: '<p/>' }], 'AI_COMMAND_NOT_ALLOWED', 'insert-interactive');
});
test('fenced and chatty model output still yields commands, junk does not', () => {
  assert.equal(parseCommands('```json\n{"commands":[{"type":"element.delete"}]}\n```').length, 1);
  assert.equal(parseCommands('好的：\n{"commands":[{"type":"element.delete"}]}').length, 1);
  assert.throws(() => parseCommands('抱歉，我做不到'), (error: unknown) => error instanceof DomainError);
  assert.throws(() => parseCommands('{"notcommands":[]}'), (error: unknown) => error instanceof DomainError);
});

const slide = { id: 'page', name: '页面', sourcePath: 'page.html', locked: [], html: '<html><body><main id="stage" data-notale-id="stage"><p data-notale-id="title">标题</p></main></body></html>' };
const deps = (reply: string, extra: Partial<Parameters<typeof aiEdit>[1]> = {}) => {
  const prepared: unknown[] = [];
  return {
    prepared,
    deps: {
      provider: { available: true, reason: '', model: 'test', async complete() { return reply; } },
      async snapshot() { return { version: 7, document: { width: 1600, height: 900, theme: {}, slides: [slide] } } as never; },
      async prepare(commit: unknown) { prepared.push(commit); return { changes: [] }; },
      mutationId: () => 'mutation-' + prepared.length,
      ...extra,
    } as Parameters<typeof aiEdit>[1],
  };
};
test('a candidate is verified against the document before anyone sees it', async () => {
  const { deps: d, prepared } = deps('{"commands":[{"type":"element.patch","slideId":"page","target":"title","patch":{"text":"新标题"}}]}');
  const candidate = await aiEdit({ slideId: 'page', intent: 'edit-selection', instruction: '改标题', targets: ['title'] }, d);
  assert.equal(candidate.baseVersion, 7);
  assert.equal(candidate.commands.length, 1);
  assert.equal(prepared.length, 1, 'the batch is dry-run through prepare');
});
test('a rejected batch is retried with the reason, and never returned as a candidate', async () => {
  let asked = 0;
  const { deps: d } = deps('', {
    provider: {
      available: true, reason: '', model: 'test',
      async complete(request: { user: string }) {
        asked++;
        if (asked === 1) return '{"commands":[{"type":"deck.update","title":"x"}]}';
        assert.match(request.user, /上一次尝试被拒绝/);
        return '{"commands":[{"type":"element.patch","slideId":"page","target":"title","patch":{"text":"好"}}]}';
      },
    } as never,
  });
  const candidate = await aiEdit({ slideId: 'page', intent: 'edit-selection', instruction: '改', targets: ['title'] }, d);
  assert.equal(asked, 2);
  assert.equal(candidate.commands[0].type, 'element.patch');
});
test('a model that keeps refusing produces a failure, not a bad candidate', async () => {
  const { deps: d } = deps('{"commands":[{"type":"deck.update","title":"x"}]}');
  await assert.rejects(
    aiEdit({ slideId: 'page', intent: 'edit-selection', instruction: '改', targets: ['title'] }, d),
    (error: unknown) => error instanceof DomainError && error.code === 'AI_REJECTED',
  );
});
test('without a configured model the route refuses with a reason', async () => {
  const { deps: d } = deps('', { provider: { available: false, reason: '未配置模型服务：设置环境变量 GEMINI_API_KEY 后可用', model: 'gemini', async complete() { throw new Error('unreachable'); } } as never });
  await assert.rejects(
    aiEdit({ slideId: 'page', intent: 'insert-interactive', instruction: '插入', targets: [] }, d),
    (error: unknown) => error instanceof DomainError && error.code === 'AI_UNCONFIGURED' && error.status === 503,
  );
});
test('a local edit with nothing selected is refused before the model is called', async () => {
  let called = false;
  const { deps: d } = deps('', { provider: { available: true, reason: '', model: 't', async complete() { called = true; return ''; } } as never });
  await assert.rejects(
    aiEdit({ slideId: 'page', intent: 'edit-selection', instruction: '改', targets: [] }, d),
    (error: unknown) => error instanceof DomainError && error.code === 'AI_NO_TARGET',
  );
  assert.equal(called, false);
});
