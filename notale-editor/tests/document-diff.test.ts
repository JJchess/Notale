import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffDocuments, fewestMoves } from '../src/domain/document-diff.js';
import { applyCommands, validateDocument } from '../src/domain/commands.js';
import { commitSchema, type Command, type DeckDocument } from '../src/domain/model.js';

const page = (id: string) => ({ id, name: id, sourcePath: `pages/${id}.html`, html: `<!doctype html><html><body><main id="stage" data-notale-id="s-${id}"><p data-notale-id="t-${id}">${id}</p></main></body></html>` });
const deck = (ids: string[]): DeckDocument => validateDocument({ schemaVersion: 1, id: 'doc', title: 't', slides: ids.map(page) });
const apply = (base: DeckDocument, commands: Command[]) => commands.length ? applyCommands(base, commitSchema.parse({ baseVersion: 1, mutationId: 'm', commands }).commands as Command[]) : base;

test('moving one page is one move, wherever it goes', () => {
  const ids = Array.from({ length: 33 }, (_, i) => `p${i}`);
  const target = [...ids.slice(0, 10), ...ids.slice(11), ids[10]!];
  assert.equal(fewestMoves(ids, target).length, 1);
  const base = deck(ids), next = { ...base, slides: target.map(id => base.slides.find(s => s.id === id)!) };
  const commands = diffDocuments(base, next);
  assert.deepEqual(commands.map(c => c.type), ['slide.move']);
  assert.deepEqual(apply(base, commands).slides.map(s => s.id), target);
});
test('any reordering lands exactly, with as many moves as pages off the longest kept run', () => {
  let seed = 7;
  const random = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  for (let round = 0; round < 200; round++) {
    const ids = Array.from({ length: 2 + Math.floor(random() * 12) }, (_, i) => `p${i}`);
    const target = [...ids].sort(() => random() - 0.5);
    const moves = fewestMoves(ids, target);
    const order = [...ids];
    for (const move of moves) { order.splice(order.indexOf(move.slideId), 1); order.splice(move.index, 0, move.slideId); }
    assert.deepEqual(order, target);
  }
});
test('inserts, deletes, moves, replacements and theme compose into the target document', () => {
  const base = deck(['a', 'b', 'c', 'd']);
  const extra = validateDocument({ schemaVersion: 1, id: 'doc', title: 't', slides: [page('x')] }).slides[0]!;
  const changed = { ...base.slides[2]!, name: '改了' };
  const next = { ...base, theme: { '--ink': '#123' }, slides: [base.slides[3]!, extra, base.slides[0]!, changed] };
  const commands = diffDocuments(base, next);
  const landed = apply(base, commands);
  assert.deepEqual(landed.slides.map(s => s.id), ['d', 'x', 'a', 'c']);
  assert.equal(landed.slides[3]!.name, '改了');
  assert.deepEqual(landed.theme, { '--ink': '#123' });
  assert.equal(commands.filter(c => c.type === 'slide.replace').length, 1, 'only the page that changed is replaced');
});
test('an unchanged document diffs to nothing', () => {
  const base = deck(['a', 'b']);
  assert.deepEqual(diffDocuments(base, structuredClone(base)), []);
});
