// The header keeps three entries: 导入, 导出, 放映. The first two are menus holding the
// existing actions, so their ids and wiring stay untouched. Behaviour matches the other
// popup menus in the editor: click outside or press Escape to close, arrows to move.
export function createHeaderMenus() {
  const menus = [...document.querySelectorAll<HTMLDetailsElement>('details.header-menu')];
  if (!menus.length) return;
  const items = (menu: HTMLDetailsElement) =>
    [...menu.querySelectorAll<HTMLElement>('.editor-popup > button, .editor-popup > label')].filter((node) => !node.hidden);
  const close = (menu: HTMLDetailsElement, focus = false) => {
    menu.open = false;
    if (focus) menu.querySelector('summary')?.focus();
  };
  for (const menu of menus) {
    // Only one menu at a time, and a chosen action closes the menu it came from.
    menu.addEventListener('toggle', () => {
      if (!menu.open) return;
      for (const other of menus) if (other !== menu) other.open = false;
    });
    menu.querySelector('.editor-popup')!.addEventListener('click', (event) => {
      if ((event.target as HTMLElement).closest('button, label')) close(menu);
    });
    menu.addEventListener('keydown', (event) => {
      const keys = items(menu);
      const at = keys.indexOf(document.activeElement as HTMLElement);
      if (event.key === 'Escape') { event.stopPropagation(); close(menu, true); return; }
      if (event.key === 'Tab') { close(menu); return; }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      if (!menu.open) { menu.open = true; keys[0]?.focus(); return; }
      keys[(at + (event.key === 'ArrowDown' ? 1 : -1) + keys.length) % keys.length]?.focus();
    });
  }
  document.addEventListener('pointerdown', (event) => {
    for (const menu of menus) if (!menu.contains(event.target as Node)) close(menu);
  }, true);
  window.addEventListener('blur', () => { for (const menu of menus) close(menu); });
}
