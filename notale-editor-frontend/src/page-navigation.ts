/** Page ordering uses the same versioned commands as every other edit. */
export function bindPageNavigation(options: {
  pages: () => { id: string }[];
  documentId: () => string;
  show: (id: string) => Promise<void>;
  move: (id: string, index: number) => Promise<unknown>;
  error: (error: unknown) => void;
}) {
  const rail = document.getElementById('slides')!;
  const announcement = document.createElement('span');
  announcement.className = 'sr-only';
  announcement.setAttribute('role', 'status');
  rail.after(announcement);
  let moving: { id: string; documentId: string } | undefined;
  const cardAt = (target: EventTarget | null) => target instanceof Element
    ? target.closest<HTMLElement>('.slide-card[data-slide]') : null;
  const clear = () => {
    for (const card of rail.querySelectorAll('.drop-before, .drop-after')) card.classList.remove('drop-before', 'drop-after');
  };
  async function move(id: string, index: number) {
    await options.move(id, index);
    rail.querySelector<HTMLElement>(`[data-slide="${CSS.escape(id)}"]`)?.focus({ preventScroll: true });
    announcement.textContent = `页面已移动到第 ${index + 1} 页`;
  }
  rail.addEventListener('dragstart', event => {
    const card = cardAt(event.target);
    if (!card || !event.dataTransfer) return;
    moving = { id: card.dataset.slide!, documentId: options.documentId() };
    event.dataTransfer.setData('application/x-notale-page', moving.id);
    event.dataTransfer.effectAllowed = 'move';
  });
  rail.addEventListener('dragover', event => {
    const card = cardAt(event.target);
    if (!card || !moving || moving.documentId !== options.documentId()) return;
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'move';
    clear();
    if (card.dataset.slide !== moving.id) card.classList.add(event.clientY < card.getBoundingClientRect().top + card.offsetHeight / 2 ? 'drop-before' : 'drop-after');
  });
  rail.addEventListener('drop', event => {
    const card = cardAt(event.target), source = moving;
    const after = card?.classList.contains('drop-after');
    clear();
    moving = undefined;
    if (!card || !source || source.documentId !== options.documentId()) return;
    event.preventDefault();
    if (card.dataset.slide === source.id) return;
    const remaining = options.pages().filter(page => page.id !== source.id);
    const target = remaining.findIndex(page => page.id === card.dataset.slide);
    if (target < 0 || !options.pages().some(page => page.id === source.id)) return;
    void move(source.id, target + (after ? 1 : 0)).catch(options.error);
  });
  rail.addEventListener('dragend', () => { clear(); moving = undefined; });
  rail.addEventListener('keydown', event => {
    const card = cardAt(event.target);
    if (!card || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const id = card.dataset.slide!;
    if (event.altKey) {
      const pages = options.pages(), from = pages.findIndex(page => page.id === id);
      const to = event.key === 'Home' ? 0 : event.key === 'End' ? pages.length - 1 : Math.max(0, Math.min(pages.length - 1, from + (event.key === 'ArrowUp' ? -1 : 1)));
      if (from !== to) void move(id, to).catch(options.error);
      return;
    }
    const visible = Array.from(rail.querySelectorAll<HTMLElement>('.slide-card:not([hidden])'));
    const from = visible.indexOf(card);
    const to = event.key === 'Home' ? 0 : event.key === 'End' ? visible.length - 1 : Math.max(0, Math.min(visible.length - 1, from + (event.key === 'ArrowUp' ? -1 : 1)));
    const next = visible[to]?.dataset.slide;
    if (next && next !== id) void options.show(next).then(() => {
      rail.querySelector<HTMLElement>(`[data-slide="${CSS.escape(next)}"]`)?.focus();
    }).catch(options.error);
  });
}
