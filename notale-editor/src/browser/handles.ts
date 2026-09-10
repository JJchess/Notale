import {
  textBox,
  boxSize,
  boxPoint,
  beginBoxResize,
  previewBoxResize,
  type BoxGesture,
  type BoxEdit,
} from './text-box.js';
import { affineGeometry, type Geometry } from '../domain/affine.js';
import {
  snapResize,
  type SnapRect,
  type SnapLine,
  type SnapOptions,
  type ResizeHandle,
} from '../domain/snapping.js';
import { editShortcut } from './shortcuts.js';

type Rect = SnapRect & { id?: string; geometry?: Geometry };
type Operation = {
  action: 'scale' | 'rotate';
  factorX?: number;
  factorY?: number;
  angle?: number;
  anchor: [number, number];
  lines?: SnapLine[];
};
function bounds(rects: SnapRect[]) {
  const x = Math.min(...rects.map((r) => r.x)),
    y = Math.min(...rects.map((r) => r.y));
  return {
    x,
    y,
    width: Math.max(...rects.map((r) => r.x + r.width)) - x,
    height: Math.max(...rects.map((r) => r.y + r.height)) - y,
  };
}
/** Fixed-size editor chrome, isolated from authored slide CSS. Only handles catch
 * pointers, so native content and normal selection/dragging keep their hit areas. */
export function transformHandles(options: {
  width: number;
  height: number;
  capture: () => Rect[];
  get: (id: string) => HTMLElement | null;
  locked: (el: Element) => boolean;
  start: () => void;
  neighbors: () => SnapRect[];
  snapping: () => Pick<SnapOptions, 'enabled' | 'grid' | 'guides'>;
  guides: (lines: SnapLine[]) => void;
  boxCommit: (id: string, edit: BoxEdit) => void;
  commit: (rectangles: Rect[], operation: Operation) => void;
}) {
  const host = document.createElement('div');
  host.dataset.notaleHandles = '';
  host.tabIndex = -1;
  for (const [key, value] of Object.entries({
    all: 'initial',
    position: 'fixed',
    'pointer-events': 'none',
    'z-index': '2147483647',
    margin: '0',
    padding: '0',
    border: '0',
    'touch-action': 'none',
    outline: 'none',
  }))
    host.style.setProperty(key, value, 'important');
  const shadow = host.attachShadow({ mode: 'open' });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${options.width} ${options.height}`);
  svg.style.cssText = 'display:block;width:100%;height:100%;overflow:visible;pointer-events:none';
  shadow.append(svg);
  document.documentElement.append(host);
  let enabled = false,
    reflow = true;
  type Gesture = {
    handle: string;
    text?: BoxGesture;
    pointerId: number;
    x: number;
    y: number;
    scale: number;
    viewportWidth: number;
    viewportHeight: number;
    stageX: number;
    stageY: number;
    box: SnapRect;
    rectangles: Rect[];
    neighbors: SnapRect[];
    nodes: { el: HTMLElement; style: string | null }[];
  };
  let gesture: Gesture | undefined;
  function draw() {
    if (!enabled) {
      host.style.setProperty('display', 'none', 'important');
      return;
    }
    const rectangles = options.capture();
    const usable =
      enabled &&
      rectangles.length &&
      rectangles.every((r) => {
        const el = r.id && options.get(r.id);
        return (
          el &&
          !el.isContentEditable &&
          !options.locked(el) &&
          r.geometry &&
          affineGeometry(r.geometry, [1, 0, 0, 1], 0, 0)
        );
      });
    host.style.setProperty('display', usable ? 'block' : 'none', 'important');
    if (!usable) return;
    const stage = document.getElementById('stage')!.getBoundingClientRect(),
      scale = stage.width / options.width,
      box = bounds(rectangles);
    for (const [key, value] of Object.entries({
      left: `${stage.x}px`,
      top: `${stage.y}px`,
      width: `${stage.width}px`,
      height: `${stage.height}px`,
    }))
      host.style.setProperty(key, value, 'important');
    svg.replaceChildren();
    function shape(tag: string, attrs: Record<string, string | number>) {
      const el = document.createElementNS(svg.namespaceURI, tag);
      for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
      svg.append(el);
      return el;
    }
    shape('rect', {
      ...box,
      fill: 'none',
      stroke: '#466ddb',
      'stroke-width': 1 / scale,
      'data-selection-bounds': '',
    });
    const cx = box.x + box.width / 2,
      cy = box.y + box.height / 2;
    shape('line', {
      x1: cx,
      y1: box.y,
      x2: cx,
      y2: box.y - 28 / scale,
      stroke: '#466ddb',
      'stroke-width': 1 / scale,
    });
    const positions: [string, number, number, string][] = [
      ['nw', box.x, box.y, 'nwse-resize'],
      ['n', cx, box.y, 'ns-resize'],
      ['ne', box.x + box.width, box.y, 'nesw-resize'],
      ['e', box.x + box.width, cy, 'ew-resize'],
      ['se', box.x + box.width, box.y + box.height, 'nwse-resize'],
      ['s', cx, box.y + box.height, 'ns-resize'],
      ['sw', box.x, box.y + box.height, 'nesw-resize'],
      ['w', box.x, cy, 'ew-resize'],
      ['rotate', cx, box.y - 28 / scale, 'grab'],
    ];
    const single = rectangles.length === 1 ? options.get(rectangles[0].id!) : null;
    if (reflow && single && textBox(single)) {
      svg.replaceChildren();
      const size = boxSize(single),
        point = (x: number, y: number) => {
          const p = boxPoint(single, x * size.width, y * size.height);
          return { x: (p.x - stage.x) / scale, y: (p.y - stage.y) / scale };
        };
      const corners = [point(0, 0), point(1, 0), point(1, 1), point(0, 1)];
      shape('polygon', {
        points: corners.map((p) => `${p.x},${p.y}`).join(' '),
        fill: 'none',
        stroke: '#466ddb',
        'stroke-width': 1 / scale,
        'data-text-box': '',
      });
      const fractions = [
        [0, 0],
        [0.5, 0],
        [1, 0],
        [1, 0.5],
        [1, 1],
        [0.5, 1],
        [0, 1],
        [0, 0.5],
      ];
      for (let i = 0; i < 8; i++) {
        const p = point(...(fractions[i] as [number, number]));
        positions[i][1] = p.x;
        positions[i][2] = p.y;
      }
      const top = point(0.5, 0),
        center = point(0.5, 0.5),
        distance = Math.hypot(top.x - center.x, top.y - center.y) || 1;
      positions[8][1] = top.x + ((top.x - center.x) * 28) / scale / distance;
      positions[8][2] = top.y + ((top.y - center.y) * 28) / scale / distance;
      shape('line', {
        x1: top.x,
        y1: top.y,
        x2: positions[8][1],
        y2: positions[8][2],
        stroke: '#466ddb',
        'stroke-width': 1 / scale,
      });
    }
    for (const [name, x, y, cursor] of positions) {
      if (
        name !== 'rotate' &&
        ((!box.width && /[ew]/.test(name)) || (!box.height && /[ns]/.test(name)))
      )
        continue;
      const el = shape(name === 'rotate' ? 'circle' : 'rect', {
        ...(name === 'rotate'
          ? { cx: x, cy: y, r: 6 / scale }
          : { x: x - 5 / scale, y: y - 5 / scale, width: 10 / scale, height: 10 / scale }),
        fill: '#fff',
        stroke: '#466ddb',
        'stroke-width': 1.5 / scale,
        'data-handle': name,
        'aria-label':
          name === 'rotate'
            ? '旋转（Shift：15° 吸附）'
            : reflow && single && textBox(single)
              ? `调整文字框 ${name}（字号不变；Shift：等比尺寸；Alt：中心；Ctrl/⌘：不吸附）`
              : `缩放 ${name}（Shift：等比；Alt：中心；Ctrl/⌘：不吸附）`,
        style: `pointer-events:all;cursor:${cursor};touch-action:none`,
      });
      const title = document.createElementNS(svg.namespaceURI, 'title');
      title.textContent = el.getAttribute('aria-label');
      el.append(title);
    }
  }
  function restore(g: Gesture) {
    for (const { el, style } of g.nodes) {
      if (style === null) el.removeAttribute('style');
      else el.setAttribute('style', style);
    }
  }
  function cancel() {
    if (!gesture) return;
    const g = gesture;
    gesture = undefined;
    restore(g);
    options.guides([]);
    if (host.hasPointerCapture(g.pointerId)) host.releasePointerCapture(g.pointerId);
    draw();
  }
  function currentViewport(g: Gesture) {
    const stage = document.getElementById('stage')?.getBoundingClientRect();
    return (
      !!stage &&
      innerWidth === g.viewportWidth &&
      innerHeight === g.viewportHeight &&
      Math.abs(stage.width - g.scale * options.width) < 0.01 &&
      Math.abs(stage.x - g.stageX) < 0.01 &&
      Math.abs(stage.y - g.stageY) < 0.01
    );
  }
  function operation(g: Gesture, event: PointerEvent): Operation {
    const b = g.box,
      cx = b.x + b.width / 2,
      cy = b.y + b.height / 2;
    if (g.handle === 'rotate') {
      const angleAt = (x: number, y: number) =>
        Math.atan2((y - g.stageY) / g.scale - cy, (x - g.stageX) / g.scale - cx);
      let angle = ((angleAt(event.clientX, event.clientY) - angleAt(g.x, g.y)) * 180) / Math.PI;
      angle = ((angle + 540) % 360) - 180;
      if (event.shiftKey) angle = Math.round(angle / 15) * 15;
      return { action: 'rotate', angle, anchor: [cx, cy] };
    }
    return {
      action: 'scale',
      ...snapResize(
        g.box,
        g.handle as ResizeHandle,
        g.neighbors,
        (event.clientX - g.x) / g.scale,
        (event.clientY - g.y) / g.scale,
        {
          ...options.snapping(),
          width: options.width,
          height: options.height,
          tolerance: 6 / g.scale,
          constrain: event.shiftKey,
          centered: event.altKey,
          enabled: options.snapping().enabled !== false && !event.ctrlKey && !event.metaKey,
        },
      ),
    };
  }

  function preview(g: Gesture, op: Operation) {
    const a = ((op.angle ?? 0) * Math.PI) / 180,
      fx = op.factorX ?? 1,
      fy = op.factorY ?? 1,
      world = [Math.cos(a) * fx, Math.sin(a) * fx, -Math.sin(a) * fy, Math.cos(a) * fy];
    for (const r of g.rectangles) {
      const x = r.x + r.width / 2 - op.anchor[0],
        y = r.y + r.height / 2 - op.anchor[1];
      const m = affineGeometry(
        r.geometry!,
        world,
        world[0] * x + world[2] * y - x,
        world[1] * x + world[3] * y - y,
      );
      if (!m) continue;
      const el = options.get(r.id!)!;
      el.style.transform = `matrix(${m.join(',')})`;
      el.style.translate = el.style.rotate = el.style.scale = 'none';
    }
    options.guides(op.lines ?? []);
    draw();
  }
  function textPreview(g: Gesture, event: PointerEvent) {
    return previewBoxResize(
      g.text!,
      event.clientX - g.x,
      event.clientY - g.y,
      event.altKey,
      event.shiftKey,
      g.scale,
      {
        stageX: g.stageX,
        stageY: g.stageY,
        neighbors: g.neighbors,
        options: {
          ...options.snapping(),
          width: options.width,
          height: options.height,
          tolerance: 6 / g.scale,
          enabled: options.snapping().enabled !== false && !event.ctrlKey && !event.metaKey,
        },
      },
    );
  }
  host.addEventListener('pointerdown', (event) => {
    const target = event
      .composedPath()
      .find((el) => el instanceof Element && el.hasAttribute('data-handle')) as Element | undefined;
    if (!enabled || event.button !== 0 || !target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    cancel();
    host.focus({ preventScroll: true });
    options.start();
    const rectangles = options.capture();
    if (
      !rectangles.length ||
      rectangles.some(
        (r) => !r.geometry || !r.id || !options.get(r.id) || options.locked(options.get(r.id)!),
      )
    )
      return;
    const stage = document.getElementById('stage')!.getBoundingClientRect();
    const text =
      reflow &&
      rectangles.length === 1 &&
      target.getAttribute('data-handle') !== 'rotate' &&
      textBox(options.get(rectangles[0].id!)!)
        ? beginBoxResize(
            options.get(rectangles[0].id!)!,
            target.getAttribute('data-handle') as ResizeHandle,
          )
        : undefined;
    gesture = {
      text,
      handle: target.getAttribute('data-handle')!,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      scale: stage.width / options.width,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      stageX: stage.x,
      stageY: stage.y,
      box: bounds(rectangles),
      neighbors: options.neighbors(),
      rectangles,
      nodes: rectangles.map((r) => {
        const el = options.get(r.id!)!;
        return { el, style: el.getAttribute('style') };
      }),
    };
    host.setPointerCapture(event.pointerId);
  });
  host.addEventListener('pointermove', (event) => {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!currentViewport(gesture)) {
      cancel();
      return;
    }
    if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) >= 3) {
      if (gesture.text) {
        options.guides(textPreview(gesture, event).lines);
        draw();
      } else preview(gesture, operation(gesture, event));
    }
  });
  host.addEventListener('pointerup', (event) => {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!currentViewport(gesture)) {
      cancel();
      return;
    }
    const g = gesture;
    if (g.text) {
      const moved = Math.hypot(event.clientX - g.x, event.clientY - g.y) >= 3;
      const edit = moved ? textPreview(g, event) : undefined;
      cancel();
      if (edit) options.boxCommit(g.rectangles[0].id!, edit);
      return;
    }
    const op = operation(g, event);
    cancel();
    if (Math.hypot(event.clientX - g.x, event.clientY - g.y) < 3) return;
    if (
      Math.abs(op.angle ?? 0) < 1e-8 &&
      Math.abs((op.factorX ?? 1) - 1) < 1e-8 &&
      Math.abs((op.factorY ?? 1) - 1) < 1e-8
    )
      return;
    const { lines: _lines, ...command } = op;
    options.commit(g.rectangles, command);
  });
  for (const name of ['lostpointercapture', 'pointercancel'])
    host.addEventListener(name, (event) => {
      if (gesture?.pointerId === (event as PointerEvent).pointerId) cancel();
    });
  window.addEventListener('blur', cancel);
  window.addEventListener('resize', cancel);
  window.addEventListener('pagehide', cancel);
  document.addEventListener(
    'keydown',
    (event) => {
      if (gesture && event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        cancel();
      } else if (gesture && editShortcut(event)) cancel();
    },
    true,
  );
  return {
    refresh(active: boolean) {
      enabled = active;
      if (!active) cancel();
      draw();
    },
    textReflow(value: boolean) {
      if (reflow === value) return;
      cancel();
      reflow = value;
      draw();
    },
    cancel,
  };
}
