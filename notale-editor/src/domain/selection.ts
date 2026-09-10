export type SelectionObject = { id: string; parent?: string };
export type SelectionMode = 'replace' | 'add' | 'toggle';

/** Groups are selected atomically. A selection never contains both an ancestor
 * and its descendant, so downstream edits cannot transform/delete a node twice. */
export function selectIds(
  current: string[],
  incoming: string[],
  objects: SelectionObject[],
  groups: { members: string[] }[],
  mode: SelectionMode = 'replace',
): string[] {
  const byId = new Map(objects.map((o) => [o.id, o]));
  function ancestor(a: string, b: string) {
    const visited = new Set<string>();
    let parent = byId.get(b)?.parent;
    while (parent && !visited.has(parent)) {
      if (parent === a) return true;
      visited.add(parent);
      parent = byId.get(parent)?.parent;
    }
    return false;
  }
  const unit = (id: string) =>
    (groups.find((g) => g.members.includes(id))?.members ?? [id]).filter((id) => byId.has(id));
  const roots = (ids: string[]) =>
    [...new Set(ids)].filter(
      (id) => byId.has(id) && !ids.some((other) => other !== id && ancestor(other, id)),
    );
  let selected = new Set(mode === 'replace' ? [] : selectIds([], current, objects, groups));
  const handled = new Set<string>();
  for (const id of roots(incoming)) {
    if (handled.has(id)) continue;
    const next = unit(id);
    next.forEach((id) => handled.add(id));
    if (mode === 'toggle' && next.every((id) => selected.has(id))) {
      next.forEach((id) => selected.delete(id));
      continue;
    }
    for (const old of [...selected])
      if (next.some((id) => ancestor(id, old) || ancestor(old, id)))
        unit(old).forEach((id) => selected.delete(id));
    next.forEach((id) => selected.add(id));
  }
  return [...selected];
}
