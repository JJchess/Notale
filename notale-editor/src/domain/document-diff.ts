import type { Command, DeckDocument } from './model.js';

/** The commands that turn `base` into `next`: pages deleted, inserted, replaced where anything about
 * them changed, moved into `next`'s order with as few moves as possible, assets put and removed, the
 * theme updated. Pure; the same diff serves an AI turn's commit and the review of a baseline. */
export function diffDocuments(base: DeckDocument, next: DeckDocument): Command[] {
  const commands: Command[] = [];
  for (const [path, asset] of Object.entries(next.assets))
    if (base.assets[path]?.hash !== asset.hash) commands.push({ type: 'asset.put', path, asset });
  for (const path of Object.keys(base.assets)) if (!(path in next.assets)) commands.push({ type: 'asset.remove', path });

  const kept = new Set(next.slides.map(slide => slide.id));
  for (const slide of base.slides) if (!kept.has(slide.id)) commands.push({ type: 'slide.delete', slideId: slide.id });
  // `order` is the page sequence exactly as the commands so far leave it.
  const order = base.slides.map(slide => slide.id).filter(id => kept.has(id));
  let previous: string | null = null;
  for (const slide of next.slides) {
    const old = base.slides.find(entry => entry.id === slide.id);
    if (!old) {
      commands.push({ type: 'slide.insert', after: previous, slide });
      order.splice(previous === null ? 0 : order.indexOf(previous) + 1, 0, slide.id);
    } else if (JSON.stringify(old) !== JSON.stringify(slide)) commands.push({ type: 'slide.replace', slideId: slide.id, slide });
    previous = slide.id;
  }
  for (const move of fewestMoves(order, next.slides.map(slide => slide.id))) commands.push({ type: 'slide.move', ...move });
  if (JSON.stringify(base.theme) !== JSON.stringify(next.theme)) commands.push({ type: 'deck.update', theme: next.theme });
  return commands;
}

/** Moves that turn `current` into `target` (same members): pages on a longest increasing
 * subsequence stay put, every other page moves once, right after the page that precedes it in the
 * target. `index` is the position after the move, as `slide.move` applies it. */
export function fewestMoves(current: readonly string[], target: readonly string[]): { slideId: string; index: number }[] {
  const rank = new Map(target.map((id, index) => [id, index]));
  const ranks = current.map(id => rank.get(id)!);
  // Patience sorting: tails[k] is the index in `ranks` ending the best increasing run of length k+1.
  const tails: number[] = [], parent: number[] = new Array(ranks.length).fill(-1);
  ranks.forEach((value, index) => {
    let low = 0, high = tails.length;
    while (low < high) { const mid = (low + high) >> 1; if (ranks[tails[mid]!]! < value) low = mid + 1; else high = mid; }
    if (low > 0) parent[index] = tails[low - 1]!;
    tails[low] = index;
  });
  const stay = new Set<string>();
  for (let at = tails.length ? tails[tails.length - 1]! : -1; at >= 0; at = parent[at]!) stay.add(current[at]!);
  const order = [...current], moves: { slideId: string; index: number }[] = [];
  target.forEach((id, index) => {
    if (stay.has(id)) return;
    order.splice(order.indexOf(id), 1);
    const at = index === 0 ? 0 : order.indexOf(target[index - 1]!) + 1;
    order.splice(at, 0, id);
    moves.push({ slideId: id, index: at });
  });
  return moves;
}
