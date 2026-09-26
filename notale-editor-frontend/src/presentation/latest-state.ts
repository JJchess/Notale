/** Checkpoints can lag behind broadcast updates within the same controller term. */
export function latestPresentationState<T extends { term: number; sequence: number }>(current: T, saved?: T): T {
  if (!saved) return current;
  return saved.term > current.term || (saved.term === current.term && saved.sequence > current.sequence)
    ? saved
    : current;
}
