import type { Command, DeckDocument, Slide } from '@notale/editor/browser';
// Per-page background, shaped like PowerPoint's "Format Background": a solid colour or a
// two-stop gradient for the current page, plus "apply to all". Page themes override the
// deck theme, so a page can differ without detaching from the shared palette.
// Refreshing is only held back while a field is being typed in; clicking the panel's own
// buttons must not freeze the list.
const editing = (root: HTMLElement) =>
  !!root.querySelector('textarea:focus, select:focus, input:is([type=text],[type=search],[type=number],[type=url],[type=email]):focus');
export function createPageBackground(context: {
  document: () => DeckDocument;
  slide: () => Slide;
  commands: (commands: Command[]) => Promise<unknown>;
  error: (e: unknown) => void;
}) {
  const panel = document.createElement('fieldset');
  panel.id = 'page-background';
  panel.className = 'property-group';
  panel.innerHTML = `<legend>页面背景</legend>
 <div class="paint-row"><label>底色<input id="background-color" type="color"></label><label>渐变终点<input id="background-color-2" type="color"></label><label>角度<input id="background-angle" type="number" min="0" max="360" step="15" value="160"></label></div>
 <label class="inline"><input id="background-gradient" type="checkbox"> 渐变背景</label>
 <div class="inline"><button id="background-apply-all">应用到全部页面</button><button id="background-reset">恢复讲义底色</button></div>
 <p class="hint">页面背景覆盖讲义主题的底色，只影响当前页面。</p>`;
  const el = <T extends HTMLElement = HTMLElement>(id: string) => panel.querySelector<T>('#' + id)!;
  const value = (id: string) => el<HTMLInputElement>(id).value;
  let busy = false, rendered = '';
  // The lecture chassis paints `background: var(--bg)`, so the shorthand takes a
  // gradient as readily as a colour; --page-background records the flat colour that
  // other rules may still need.
  function paint(): Record<string, string> {
    const base = value('background-color');
    return el<HTMLInputElement>('background-gradient').checked
      ? { '--bg': `linear-gradient(${value('background-angle')}deg, ${base}, ${value('background-color-2')})`, '--page-background': base }
      : { '--bg': base, '--page-background': base };
  }
  function write(values: Record<string, string> | undefined, all = false) {
    if (busy) return;
    const slides = all ? context.document().slides : [context.slide()];
    busy = true;
    rendered = '';
    void context
      .commands(
        slides.map((slide) => {
          const theme = { ...slide.theme };
          for (const key of ['--bg', '--page-background']) delete theme[key];
          return { type: 'slide.update', slideId: slide.id, patch: { theme: { ...theme, ...(values ?? {}) } } } as Command;
        }),
      )
      .catch(context.error)
      .finally(() => (busy = false));
  }
  for (const id of ['background-color', 'background-color-2', 'background-angle', 'background-gradient'])
    el(id).addEventListener('change', () => write(paint()));
  el('background-apply-all').onclick = () => write(paint(), true);
  el('background-reset').onclick = () => write(undefined);
  function attach() {
    if (panel.isConnected) return;
    const anchor = document.getElementById('deck-theme');
    if (anchor) anchor.after(panel);
    else document.getElementById('global-style')?.append(panel);
  }
  return {
    render() {
      attach();
      const theme = context.slide().theme ?? {}, deck = context.document().theme ?? {};
      const key = JSON.stringify([context.slide().id, theme['--bg'], theme['--page-background'], deck['--bg']]);
      if (key === rendered || editing(panel)) return;
      rendered = key;
      const gradient = theme['--bg']?.includes('linear-gradient') ?? false;
      el<HTMLInputElement>('background-gradient').checked = gradient;
      el<HTMLInputElement>('background-color').value = (theme['--page-background'] ?? (gradient ? undefined : theme['--bg']) ?? deck['--bg'] ?? '#e8eef1').trim();
      if (gradient) {
        const image = theme['--bg']!;
        const angle = /(-?\d+(?:\.\d+)?)deg/.exec(image);
        if (angle) el<HTMLInputElement>('background-angle').value = String(Math.round(Number(angle[1])));
        const stops = [...image.matchAll(/#[0-9a-f]{3,8}|rgba?\([^)]+\)/gi)].map((m) => m[0]);
        if (stops.length > 1) el<HTMLInputElement>('background-color-2').value = stops.at(-1)!.trim();
      }
      el<HTMLButtonElement>('background-reset').disabled = !theme['--bg'] && !theme['--page-background'];
    },
  };
}
