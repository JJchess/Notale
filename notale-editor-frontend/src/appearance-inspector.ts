import type { Command } from '@notale/editor/browser';
type ObjectInfo = { id: string; parent?: string; tag: string; locked: boolean; style: Record<string, string>; attributes: Record<string, string> };
type Style = Record<string, string>;
// Appearance editing follows the Figma right-hand panel and PowerPoint "format shape":
// no Apply button, a "none" checkbox per paint, and one command per committed gesture.
const SHADOWS: Record<string, [label: string, css: string, svg: string]> = {
  none: ['无阴影', 'none', 'none'],
  soft: ['柔和', '0 2px 8px rgba(20,38,48,.14)', 'drop-shadow(0 2px 6px rgba(20,38,48,.24))'],
  medium: ['中等', '0 6px 18px rgba(20,38,48,.18)', 'drop-shadow(0 5px 12px rgba(20,38,48,.3))'],
  strong: ['强烈', '0 14px 34px rgba(20,38,48,.28)', 'drop-shadow(0 10px 22px rgba(20,38,48,.38))'],
};
export function toHex(color: string | undefined) {
  if (!color) return undefined;
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(color)) return ('#' + [...color.slice(1)].map((c) => c + c).join('')).toLowerCase();
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(color);
  return m ? '#' + m.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, '0')).join('') : undefined;
}
const paintless = (v: string | undefined) => !v || v === 'none' || v === 'transparent' || /rgba\(0,\s*0,\s*0,\s*0\)/.test(v);
// Refreshing is only held back while a field is being typed in; clicking the panel's own
// buttons must not freeze the list.
const editing = (root: HTMLElement) =>
  !!root.querySelector('textarea:focus, select:focus, input:is([type=text],[type=search],[type=number],[type=url],[type=email]):focus');
export function createAppearanceInspector(context: {
  objects: () => ObjectInfo[];
  selected: () => string[];
  key: () => string;
  slideId: () => string;
  commands: (commands: Command[]) => Promise<unknown>;
  capture: (ids: string[]) => Promise<{ computedStyles: Record<string, Record<string, string>>; rectangles?: { id: string; width: number; height: number }[] }>;
  error: (e: unknown) => void;
}) {
  const panel = document.createElement('fieldset');
  panel.id = 'property-appearance';
  panel.className = 'property-group';
  panel.innerHTML = `<legend>外观</legend>
 <div class="paint-row"><label class="paint-none"><input id="appearance-fill-none" type="checkbox"> 无填充</label><label>填充<input id="appearance-fill" type="color"></label></div>
 <div class="paint-row" id="appearance-gradient-row"><label class="paint-none"><input id="appearance-gradient" type="checkbox"> 渐变</label><label>渐变终点<input id="appearance-gradient-color" type="color"></label><label>角度<input id="appearance-gradient-angle" type="number" min="0" max="360" step="15" value="90"></label></div>
 <div class="paint-row"><label class="paint-none"><input id="appearance-stroke-none" type="checkbox"> 无描边</label><label>描边<input id="appearance-stroke" type="color"></label><label>粗细<input id="appearance-stroke-width" type="number" min="0" max="80" step="0.5"></label></div>
 <div class="field-grid"><label id="appearance-radius-field">圆角<input id="appearance-radius" type="number" min="0" max="400" step="1"></label><label>阴影<select id="appearance-shadow">${Object.entries(SHADOWS)
   .map(([key, [label]]) => `<option value="${key}">${label}</option>`)
   .join('')}<option value="custom">自定义</option></select></label></div>
 <label class="appearance-opacity">不透明度<input id="appearance-opacity" type="range" min="0" max="100" step="1" value="100"><output id="appearance-opacity-value">100%</output></label>
 <label id="appearance-accent-field" hidden>主色（联动整组配色）<input id="appearance-accent" type="color"></label>
 <label id="appearance-fit-field" hidden>文字框大小<select id="appearance-fit"><option value="fixed">固定尺寸</option><option value="height">高度随文字</option><option value="both">宽高随文字</option></select></label>`;
  // The format panel is assembled by other modules and may be regrouped, so the
  // group re-attaches itself next to 位置与尺寸 whenever it has been detached.
  function attach() {
    if (panel.isConnected) return;
    const anchor = document.getElementById('property-geometry');
    if (anchor) anchor.after(panel);
    else document.querySelector('[data-panel="format"]')?.append(panel);
  }
  attach();
  const el = <T extends HTMLElement = HTMLElement>(id: string) => panel.querySelector<T>('#' + id)!;
  const value = (id: string) => el<HTMLInputElement>(id).value;
  const checked = (id: string) => el<HTMLInputElement>(id).checked;
  let key = '', queue: Promise<unknown> = Promise.resolve();
  const chosen = () => context.objects().filter((o) => context.selected().includes(o.id));
  const isVector = (o: ObjectInfo) => o.tag === 'svg' || !!o.attributes['data-notale-shape'] || !!o.attributes['data-notale-icon'];
  const templated = (o: ObjectInfo) => o.attributes['data-notale-smart'] !== undefined || o.attributes['data-notale-wordart'] !== undefined;
  let rects: Record<string, { width: number; height: number }> = {};
  function patchFor(o: ObjectInfo, field: string): Style {
    // Text box sizing mirrors PowerPoint's autofit choices: keep the box, follow the
    // text's height, or hug the text in both directions.
    if (field === 'fit') {
      const mode = value('appearance-fit'), rect = rects[o.id];
      if (mode === 'both') return { width: 'max-content', height: 'auto' };
      if (mode === 'height') return { width: rect ? `${Math.round(rect.width)}px` : (o.style.width ?? '600px'), height: 'auto' };
      return { width: rect ? `${Math.round(rect.width)}px` : (o.style.width ?? '600px'), height: rect ? `${Math.round(rect.height)}px` : 'auto' };
    }
    const svg = isVector(o), fill = value('appearance-fill'), stroke = value('appearance-stroke');
    if (field === 'fill' || field === 'gradient') {
      if (svg) return { fill: checked('appearance-fill-none') ? 'none' : fill };
      const flat = checked('appearance-fill-none') ? 'transparent' : fill;
      const gradient = checked('appearance-gradient') && !checked('appearance-fill-none')
        ? `linear-gradient(${value('appearance-gradient-angle')}deg, ${fill}, ${value('appearance-gradient-color')})`
        : 'none';
      return { 'background-color': flat, 'background-image': gradient };
    }
    if (field === 'stroke') {
      const none = checked('appearance-stroke-none'), width = value('appearance-stroke-width') || '0';
      if (svg) return { stroke: none ? 'none' : stroke, 'stroke-width': none ? '0' : width };
      return none ? { border: 'none' } : { 'border-style': 'solid', 'border-color': stroke, 'border-width': `${width}px` };
    }
    if (field === 'radius') return { 'border-radius': `${value('appearance-radius') || 0}px` };
    if (field === 'opacity') return { opacity: String(Number(value('appearance-opacity')) / 100) };
    if (field === 'shadow') {
      const preset = SHADOWS[value('appearance-shadow')];
      if (!preset) return {};
      return svg ? { filter: preset[2] } : { 'box-shadow': preset[1] };
    }
    if (field === 'accent') return { '--accent': value('appearance-accent') };
    return {};
  }
  // Edits queue instead of dropping: changing fill and then stroke within the same
  // second must produce both commits, in order.
  function apply(field: string) {
    const targets = chosen().filter((o) => !o.locked);
    if (!targets.length) return;
    const slideId = context.slideId();
    const edits = targets.map((o) => ({ type: 'element.patch', slideId, target: o.id, patch: { style: patchFor(o, field) } }) as Command);
    queue = queue.catch(() => {}).then(() => context.commands(edits)).then(() => { key = ''; }, context.error);
  }
  for (const [id, field] of [
    ['appearance-fill', 'fill'], ['appearance-fill-none', 'fill'],
    ['appearance-gradient', 'gradient'], ['appearance-gradient-color', 'gradient'], ['appearance-gradient-angle', 'gradient'],
    ['appearance-stroke', 'stroke'], ['appearance-stroke-none', 'stroke'], ['appearance-stroke-width', 'stroke'],
    ['appearance-radius', 'radius'], ['appearance-shadow', 'shadow'], ['appearance-opacity', 'opacity'],
    ['appearance-accent', 'accent'], ['appearance-fit', 'fit'],
  ] as const)
    el<HTMLInputElement>(id).addEventListener('change', () => {
      if (!el<HTMLInputElement>(id).reportValidity()) return;
      // Picking a colour or width restores a paint that was switched off, so adding a
      // fill back is one gesture rather than two.
      if (id === 'appearance-fill' || id === 'appearance-gradient') el<HTMLInputElement>('appearance-fill-none').checked = false;
      if (id === 'appearance-stroke' || id === 'appearance-stroke-width') el<HTMLInputElement>('appearance-stroke-none').checked = false;
      refreshEnabled();
      apply(field);
    });
  el('appearance-opacity').addEventListener('input', () => (el('appearance-opacity-value').textContent = `${value('appearance-opacity')}%`));
  // Paint inputs stay usable while a paint is off; only the gradient's own fields go dim.
  function refreshEnabled() {
    const flat = checked('appearance-fill-none') || !checked('appearance-gradient');
    for (const id of ['appearance-gradient-color', 'appearance-gradient-angle']) el<HTMLInputElement>(id).disabled = flat;
    for (const [id, off] of [['appearance-fill', 'appearance-fill-none'], ['appearance-stroke', 'appearance-stroke-none'], ['appearance-stroke-width', 'appearance-stroke-none']] as const)
      el(id).closest('label')!.classList.toggle('paint-off', checked(off));
  }
  function fill(css: Style, o: ObjectInfo) {
    const svg = isVector(o);
    const paint = svg ? css.fill : css['background-color'];
    el<HTMLInputElement>('appearance-fill-none').checked = paintless(paint);
    set('appearance-fill', toHex(paint) ?? '#dee8ff');
    const image = css['background-image'] ?? css.background ?? '';
    const gradient = /linear-gradient\(([^,]+)?/.exec(image);
    el<HTMLInputElement>('appearance-gradient').checked = !svg && image.includes('linear-gradient');
    if (gradient) {
      const angle = /(-?\d+(?:\.\d+)?)deg/.exec(image);
      if (angle) set('appearance-gradient-angle', Math.round(Number(angle[1])));
      const stops = [...image.matchAll(/rgba?\([^)]+\)|#[0-9a-f]{3,8}/gi)].map((m) => m[0]);
      if (stops.length) set('appearance-gradient-color', toHex(stops.at(-1)) ?? '#28a69b');
    }
    const line = svg ? css.stroke : css['border-color'] ?? css.border;
    const width = parseFloat(svg ? css['stroke-width'] ?? '0' : css['border-width'] ?? css.border ?? '0') || 0;
    el<HTMLInputElement>('appearance-stroke-none').checked = paintless(line) || width === 0;
    set('appearance-stroke', toHex(line) ?? '#466ddb');
    set('appearance-stroke-width', width || (svg ? 3 : 1));
    set('appearance-radius', Math.round(parseFloat(css['border-radius'] ?? '0') || 0));
    const shadow = svg ? css.filter : css['box-shadow'];
    const preset = Object.entries(SHADOWS).find(([, [, cssValue, svgValue]]) => (svg ? svgValue : cssValue) === shadow);
    set('appearance-shadow', paintless(shadow) ? 'none' : preset?.[0] ?? 'custom');
    set('appearance-opacity', Math.round((parseFloat(css.opacity ?? '1') || 1) * 100));
    el('appearance-opacity-value').textContent = `${value('appearance-opacity')}%`;
    set('appearance-accent', toHex(o.style['--accent']) ?? toHex(css['--accent'] ?? (isVector(o) ? css.stroke : css.color)) ?? '#466ddb');
    const authoredWidth = o.style.width ?? '', authoredHeight = o.style.height ?? '';
    set('appearance-fit', authoredWidth.includes('max-content') ? 'both' : !authoredHeight || authoredHeight === 'auto' ? 'height' : 'fixed');
    refreshEnabled();
  }
  // A focused field is left alone only while it holds text the author is typing; a
  // focused swatch or slider still follows the document, so an undo shows up in it.
  const set = (id: string, v: unknown) => {
    const input = el<HTMLInputElement>(id);
    const typing = document.activeElement === input && ['text', 'search', 'number', 'url', 'email', ''].includes(input.type);
    if (!typing) input.value = String(v);
  };
  return {
    render() {
      attach();
      const targets = chosen();
      panel.hidden = !targets.length;
      (panel as HTMLFieldSetElement).disabled = targets.every((o) => o.locked);
      if (!targets.length) { key = ''; return; }
      const html = targets.every((o) => !isVector(o));
      el('appearance-gradient-row').hidden = !html;
      el('appearance-radius-field').hidden = !html;
      el('appearance-accent-field').hidden = !targets.every(templated);
      el('appearance-fit-field').hidden = !targets.every(
        (o) => /^(p|h[1-6]|pre|blockquote|li|span|div)$/.test(o.tag) && !isVector(o) && !context.objects().some((child) => child.parent === o.id),
      );
      const next = context.key();
      if (next === key || editing(panel)) return;
      key = next;
      const first = targets[0];
      // Templates paint through CSS variables, so the resolved values come from the canvas.
      void context.capture(targets.map((o) => o.id)).then((capture) => {
        if (key !== next) return;
        rects = Object.fromEntries((capture.rectangles ?? []).map((r) => [r.id, { width: r.width, height: r.height }]));
        fill(capture.computedStyles?.[first.id] ?? first.style, first);
      }, () => fill(first.style, first));
    },
  };
}
