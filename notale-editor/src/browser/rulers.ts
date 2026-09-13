import {stageBounds} from './stage-bounds.js';
export type Guide = { id: string; axis: 'x' | 'y'; position: number };
export type GuideEdit = {
  id?: string;
  create?: boolean;
  axis: 'x' | 'y';
  position?: number;
  remove?: boolean;
  delta?: number;
};
/** Screen-sized ruler chrome belongs to the editor, never to authored HTML. */
export function rulerOverlay(options: {
  width: number;
  height: number;
  guides: () => Guide[];
  start: () => void;
  preview: (guides?: Guide[]) => void;
  commit: (edit: GuideEdit) => void;
}) {
  const host = document.createElement('div');
  host.dataset.notaleRulers = '';
  host.tabIndex = -1;
  for (const [key, value] of Object.entries({
    all: 'initial',
    position: 'fixed',
    'pointer-events': 'none',
    'z-index': '2147483646',
    margin: '0',
    padding: '0',
    border: '0',
    outline: 'none',
  }))
    host.style.setProperty(key, value, 'important');
  const root = host.attachShadow({ mode: 'open' }),
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.style.cssText = 'display:block;width:100%;height:100%;overflow:hidden;font:10px system-ui;';
  root.append(svg);
  document.documentElement.append(host);
  let enabled = false,
    visible = true,
    activeId: string | undefined;
  type Drag = {
    id?: string;
    axis: 'x' | 'y';
    position: number;
    remove: boolean;
    pointer: number;
    x: number;
    y: number;
    scale: number;
    rect: DOMRect;
    viewport: [number, number];
  };
  let drag: Drag | undefined;
  let optimistic: Guide | undefined;
  const currentGuides = () => {
    const guides = options.guides().map((g) => ({ ...g }));
    if (optimistic && !guides.some((guide) => guide.id === optimistic!.id))
      guides.push({ ...optimistic });
    if (!drag) return guides;
    const without = guides.filter((g) => g.id !== drag!.id);
    return drag.remove
      ? without
      : [...without, { id: drag.id ?? 'preview', axis: drag.axis, position: drag.position }];
  };
  function draw() {
    host.style.setProperty('display', enabled ? 'block' : 'none', 'important');
    if (!enabled) return;
    const r = stageBounds(options.width,options.height),
      scale = r.width / options.width;
    for (const [k, v] of Object.entries({
      left: `${r.x}px`,
      top: `${r.y}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
    }))
      host.style.setProperty(k, v, 'important');
    svg.setAttribute('viewBox', `0 0 ${r.width} ${r.height}`);
    svg.replaceChildren();
    function shape(tag: string, attrs: Record<string, string | number>, text?: string) {
      const e = document.createElementNS(svg.namespaceURI, tag);
      for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
      if (text) e.textContent = text;
      svg.append(e);
      return e;
    }
    const decade = 10 ** Math.floor(Math.log10(50 / scale));
    const stride = [1, 2, 5, 10].map((n) => n * decade).find((n) => n * scale >= 50)!;
    for (const axis of ['x', 'y'] as const) {
      const horizontal = axis === 'x',
        size = horizontal ? options.width : options.height;
      shape('rect', {
        x: 0,
        y: 0,
        width: horizontal ? r.width : 22,
        height: horizontal ? 22 : r.height,
        fill: '#f4f6fa',
        stroke: '#c8d1df',
        'pointer-events': 'all',
        'data-ruler': horizontal ? 'horizontal' : 'vertical',
        'data-axis': horizontal ? 'y' : 'x',
        role: 'button',
        'aria-label': horizontal ? '拖出水平参考线' : '拖出垂直参考线',
        style: `cursor:${horizontal ? 'ns' : 'ew'}-resize;touch-action:none`,
      });
      for (let value = 0; value <= size; value += stride / 5) {
        const p = value * scale,
          major = Math.abs(value / stride - Math.round(value / stride)) < 1e-6;
        shape('line', {
          x1: horizontal ? p : major ? 10 : 16,
          y1: horizontal ? (major ? 10 : 16) : p,
          x2: horizontal ? p : 22,
          y2: horizontal ? 22 : p,
          stroke: '#8b98aa',
          'pointer-events': 'none',
        });
        if (major && value > 0)
          shape(
            'text',
            {
              x: horizontal ? p + 3 : 3,
              y: horizontal ? 9 : p - 3,
              fill: '#526174',
              'font-size': 9,
              'pointer-events': 'none',
            },
            String(Math.round(value * 100) / 100),
          );
      }
    }
    if (visible)
      for (const g of currentGuides()) {
        const p = g.position * scale,
          vertical = g.axis === 'x';
        if (p < 0 || p > (vertical ? r.width : r.height)) continue;
        const attrs = {
          'data-guide-handle': g.id,
          'data-axis': g.axis,
          'pointer-events': 'all',
          role: 'button',
          'aria-label': `${g.axis.toUpperCase()} 参考线 ${Math.round(g.position * 100) / 100}`,
          style: `cursor:${vertical ? 'ew' : 'ns'}-resize;touch-action:none`,
        };
        shape('rect', {
          x: vertical ? p - 4 : 22,
          y: vertical ? 22 : p - 4,
          width: vertical ? 8 : Math.max(0, r.width - 22),
          height: vertical ? Math.max(0, r.height - 22) : 8,
          fill: 'transparent',
          ...attrs,
        });
        shape('path', {
          d: vertical
            ? `M${p - 5} 11 L${p + 5} 11 L${p} 21 Z`
            : `M11 ${p - 5} L11 ${p + 5} L21 ${p} Z`,
          fill: g.id === activeId ? '#d83183' : '#078baf',
          ...attrs,
        });
      }
    if (drag)
      shape(
        'text',
        {
          x: 30,
          y: 38,
          fill: drag.remove ? '#b42318' : '#078baf',
          'font-size': 12,
          'pointer-events': 'none',
        },
        drag.remove
          ? '松开删除参考线'
          : `${drag.axis.toUpperCase()} ${Math.round(drag.position * 100) / 100}`,
      );
  }
  function cancel() {
    const old = drag;
    drag = undefined;
    if (old) {
      options.preview();
      if (host.hasPointerCapture(old.pointer)) host.releasePointerCapture(old.pointer);
    }
    draw();
  }
  function valid(g: Drag) {
    const r = stageBounds(options.width,options.height);
    return (
      innerWidth === g.viewport[0] &&
      innerHeight === g.viewport[1] &&
      Math.abs(r.x - g.rect.x) < 0.01 &&
      Math.abs(r.y - g.rect.y) < 0.01 &&
      Math.abs(r.width - g.rect.width) < 0.01 &&
      Math.abs(r.height - g.rect.height) < 0.01
    );
  }
  function update(event: PointerEvent) {
    const g = drag!;
    const x = event.clientX - g.rect.x,
      y = event.clientY - g.rect.y;
    g.position = Math.round(((g.axis === 'x' ? x : y) / g.scale) * 100) / 100;
    if (event.shiftKey) g.position = Math.round(g.position / 10) * 10;
    g.remove =
      x < 0 || y < 0 || x > g.rect.width || y > g.rect.height || (g.axis === 'x' ? x < 22 : y < 22);
    options.preview(currentGuides());
    draw();
  }
  host.addEventListener('pointerdown', (event) => {
    if (!enabled || event.button !== 0) return;
    const target = event
      .composedPath()
      .find(
        (e) =>
          e instanceof Element &&
          (e.hasAttribute('data-ruler') || e.hasAttribute('data-guide-handle')),
      ) as Element | undefined;
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    cancel();
    options.start();
    host.focus({ preventScroll: true });
    const id = target.getAttribute('data-guide-handle') ?? undefined,
      axis = target.getAttribute('data-axis') as 'x' | 'y';
    activeId = id;
    const rect = stageBounds(options.width,options.height);
    drag = {
      id,
      axis,
      position: options.guides().find((g) => g.id === id)?.position ?? 0,
      remove: false,
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      scale: rect.width / options.width,
      rect,
      viewport: [innerWidth, innerHeight],
    };
    host.setPointerCapture(event.pointerId);
  });
  host.addEventListener('pointermove', (event) => {
    if (!drag || drag.pointer !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!valid(drag)) {
      cancel();
      return;
    }
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) >= 3) update(event);
  });
  host.addEventListener('pointerup', (event) => {
    if (!drag || drag.pointer !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const g = drag;
    if (!valid(g) || Math.hypot(event.clientX - g.x, event.clientY - g.y) < 3) {
      cancel();
      return;
    }
    update(event);
    const edit = { id: g.id, axis: g.axis, position: g.position, remove: g.remove };
    cancel();
    if (edit.remove && !edit.id) return;
    if (
      edit.id &&
      !edit.remove &&
      options.guides().find((v) => v.id === edit.id)?.position === edit.position
    )
      return;
    if (!edit.id) {
      edit.id = crypto.randomUUID();
      optimistic = { id: edit.id, axis: edit.axis, position: edit.position };
      activeId = edit.id;
      draw();
      options.commit({ ...edit, create: true });
    } else options.commit(edit);
  });
  for (const name of ['pointercancel', 'lostpointercapture'])
    host.addEventListener(name, (event) => {
      if (drag?.pointer === (event as PointerEvent).pointerId) cancel();
    });
  window.addEventListener(
    'keydown',
    (event) => {
      if (!enabled || !event.composedPath().includes(host)) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        cancel();
        return;
      }
      const guide =
        options.guides().find((g) => g.id === activeId) ??
        (optimistic?.id === activeId ? optimistic : undefined);
      if (
        !guide &&
        ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Delete', 'Backspace'].includes(
          event.key,
        )
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      const nudge =
        guide?.axis === 'x'
          ? event.key === 'ArrowRight'
            ? 1
            : event.key === 'ArrowLeft'
              ? -1
              : 0
          : event.key === 'ArrowDown'
            ? 1
            : event.key === 'ArrowUp'
              ? -1
              : 0;
      if (guide && (nudge || event.key === 'Delete' || event.key === 'Backspace')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        cancel();
        options.commit({
          ...guide,
          remove: !nudge,
          delta: nudge * (event.shiftKey ? 10 : 1),
        });
      }
    },
    true,
  );
  for (const name of ['resize', 'blur', 'pagehide'])
    window.addEventListener(name, () => {
      cancel();
    });
  return {
    cancel,
    refresh(active: boolean, showGuides: boolean) {
      if (optimistic && options.guides().some((guide) => guide.id === optimistic!.id))
        optimistic = undefined;
      const hidden = visible && !showGuides;
      enabled = active;
      visible = showGuides;
      if (!active || hidden) cancel();
      else draw();
    },
    focus(id: string) {
      activeId = id;
      host.focus({ preventScroll: true });
      draw();
    },
  };
}
