type Item = { id: string; parent?: string; locked: boolean };
export function renderSelectionTools(objects: Item[], selected: Set<string>, groups: {members: string[]}[], ready: boolean) {
  const items = objects.filter(object => selected.has(object.id));
  const locked = items.some(object => object.locked);
  const nested = items.some(object => {
    const seen = new Set<string>(); let parent = object.parent;
    while (parent && !seen.has(parent)) {
      if (selected.has(parent)) return true;
      seen.add(parent); parent = objects.find(item => item.id === parent)?.parent;
    }
    return false;
  });
  const visibility: Record<string, boolean> = {
    group: items.length >= 2,
    ungroup: groups.some(group => group.members.some(id => selected.has(id))),
    'align-left': items.length >= 2,
    distribute: items.length >= 3,
  };
  for (const [id, visible] of Object.entries(visibility)) {
    const button = document.getElementById(id) as HTMLButtonElement;
    button.hidden = !visible;
    button.disabled = !ready || locked || (id === 'group' && nested);
    button.title = locked ? '先解锁所选对象' : id === 'group' && nested ? '父对象与内部对象不能同时编组' : '';
  }
  document.getElementById('selection-tools-separator')!.hidden = !Object.values(visibility).some(Boolean);
}
