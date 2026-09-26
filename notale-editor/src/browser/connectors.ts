import {
  connectorGeometry,
  type Connector,
  type ConnectorEndpoint,
  type Port,
} from '../domain/connectors.js';
import { linearMatrix } from './coordinates.js';
function ports(element: Element): Port[] {
  let points: Array<{ x: number; y: number }>;
  if (element instanceof SVGGraphicsElement) {
    const box = element.getBBox(),
      matrix = element.getScreenCTM();
    if (!matrix) return [];
    points = [
      [box.x, box.y],
      [box.x + box.width, box.y],
      [box.x + box.width, box.y + box.height],
      [box.x, box.y + box.height],
    ].map(([x, y]) => new DOMPoint(x, y).matrixTransform(matrix));
  } else if (element instanceof HTMLElement) {
    const box = element.getBoundingClientRect(),
      matrix = linearMatrix(element);
    if (!matrix || !matrix.is2D) return [];
    points = [
      [-0.5, -0.5],
      [0.5, -0.5],
      [0.5, 0.5],
      [-0.5, 0.5],
    ].map(([x, y]) => ({
      x:
        box.x +
        box.width / 2 +
        matrix.a * x * element.offsetWidth +
        matrix.c * y * element.offsetHeight,
      y:
        box.y +
        box.height / 2 +
        matrix.b * x * element.offsetWidth +
        matrix.d * y * element.offsetHeight,
    }));
  } else return [];
  const center = {
    x: points.reduce((s, p) => s + p.x, 0) / 4,
    y: points.reduce((s, p) => s + p.y, 0) / 4,
  };
  return points
    .map((point, i) => {
      const next = points[(i + 1) % 4],
        x = (point.x + next.x) / 2,
        y = (point.y + next.y) / 2;
      // A perpendicular to the transformed edge stays outward under shear and reflection.
      let nx = next.y - point.y,
        ny = point.x - next.x;
      if (nx * (x - center.x) + ny * (y - center.y) < 0) {
        nx = -nx;
        ny = -ny;
      }
      const length = Math.hypot(nx, ny) || 1;
      return { x, y, nx: nx / length, ny: ny / length };
    })
    .filter((p) => Object.values(p).every(Number.isFinite));
}
type EditorOptions = {
  selected: () => string | undefined;
  locked: (element: Element) => boolean;
  start: () => void;
  commit: (connector: Connector) => void;
};
export function connectorController(connectors: Connector[], editor?: EditorOptions) {
  const get = (id: string) => document.querySelector(`[data-notale-id="${CSS.escape(id)}"]`);
  const positions = new Map<string, [Port, Port]>();
  function screenCandidates(endpoint: ConnectorEndpoint, svg: SVGSVGElement): Port[] {
    if (endpoint.point) {
      const matrix = svg.getScreenCTM();
      if (!matrix) return [];
      const point = new DOMPoint(endpoint.point.x, endpoint.point.y).matrixTransform(matrix);
      return [{ x: point.x, y: point.y, nx: 0, ny: 0 }];
    }
    const el = endpoint.target ? get(endpoint.target) : null;
    if (!el || !el.getClientRects().length) return [];
    const all = ports(el),
      index = ['top', 'right', 'bottom', 'left'].indexOf(endpoint.anchor);
    return index < 0 ? all : all[index] ? [all[index]] : [];
  }
  const host = editor ? document.createElement('div') : undefined;
  const shadow = host?.attachShadow({ mode: 'open' });
  if (host && shadow) {
    host.dataset.notaleConnectorHandles = '';
    for (const [key, value] of Object.entries({
      all: 'initial',
      position: 'fixed',
      left: '0',
      top: '0',
      width: '0',
      height: '0',
      'pointer-events': 'none',
      'z-index': '2147483647',
    }))
      host.style.setProperty(key, value, 'important');
    const style = document.createElement('style');
    style.textContent =
      'button[hidden]{display:none}button{all:initial;box-sizing:border-box;position:fixed;width:14px;height:14px;border:2px solid #466ddb;border-radius:50%;background:white;pointer-events:auto;touch-action:none;cursor:crosshair;transform:translate(-50%,-50%)}button[data-bound]{background:#466ddb}button:focus{outline:2px solid white;outline-offset:1px}';
    shadow.append(style);
    document.documentElement.append(host);
  }
  const buttons = (['start', 'end'] as const).map((side) => {
    const button = document.createElement('button');
    button.dataset.connectorHandle = side;
    button.setAttribute('aria-label', side === 'start' ? '拖动连接线起点' : '拖动连接线终点');
    button.hidden = true;
    shadow?.append(button);
    return button;
  });
  type Drag = {
    original: Connector;
    preview: Connector;
    side: 'start' | 'end';
    pointerId: number;
    button: HTMLButtonElement;
    signature: string;
    moved: boolean;
    x: number;
    y: number;
  };
  let drag: Drag | undefined;
  function signature(svg: SVGSVGElement) {
    const m = svg.getScreenCTM();
    return `${innerWidth},${innerHeight},${m && [m.a, m.b, m.c, m.d, m.e, m.f].join(',')}`;
  }
  function cancel() {
    const old = drag;
    drag = undefined;
    if (old?.button.hasPointerCapture(old.pointerId))
      old.button.releasePointerCapture(old.pointerId);
    refresh();
  }
  function endpointAt(event: PointerEvent, data: Drag): ConnectorEndpoint | undefined {
    const svg = get(data.original.id);
    if (!(svg instanceof SVGSVGElement)) return;
    const matrix = svg.getScreenCTM();
    if (!matrix || signature(svg) !== data.signature) return;
    const other = data.original[data.side === 'start' ? 'end' : 'start'].target;
    if (!event.altKey) {
      for (const hit of document.elementsFromPoint(event.clientX, event.clientY)) {
        const candidate = hit.closest('[data-notale-id]');
        const id = candidate?.getAttribute('data-notale-id');
        if (
          !candidate ||
          !id ||
          candidate.id === 'stage' ||
          candidate.contains(svg) ||
          candidate.closest('[data-notale-connector]') ||
          id === other
        )
          continue;
        const all = ports(candidate);
        if (!all.length) continue;
        const distances = all.map((p) => Math.hypot(p.x - event.clientX, p.y - event.clientY));
        const nearest = distances.indexOf(Math.min(...distances));
        return {
          target: id,
          anchor:
            distances[nearest] <= 18
              ? (['top', 'right', 'bottom', 'left'] as const)[nearest]
              : 'auto',
        };
      }
    }
    const local = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    if (![local.x, local.y].every((value) => Number.isFinite(value) && Math.abs(value) <= 1e6))
      return;
    return { point: { x: local.x, y: local.y }, anchor: 'auto' };
  }
  buttons.forEach((button, i) => {
    button.addEventListener('click', (event) => event.stopPropagation());
    button.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || !editor) return;
      event.preventDefault();
      event.stopPropagation();
      const id = editor.selected(),
        original = connectors.find((c) => c.id === id),
        svg = id ? get(id) : null;
      if (!original || !(svg instanceof SVGSVGElement) || editor.locked(svg)) return;
      editor.start();
      drag = {
        original,
        preview: original,
        side: i === 0 ? 'start' : 'end',
        pointerId: event.pointerId,
        button,
        signature: signature(svg),
        moved: false,
        x: event.clientX,
        y: event.clientY,
      };
      button.setPointerCapture(event.pointerId);
    });
    button.addEventListener('pointermove', (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      const endpoint = endpointAt(event, drag);
      if (!endpoint) return cancel();
      drag.moved ||= Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 2;
      if (drag.moved) drag.preview = { ...drag.original, [drag.side]: endpoint };
      refresh();
    });
    button.addEventListener('pointerup', (event) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      const data = drag,
        endpoint = endpointAt(event, data),
        svg = get(data.original.id);
      const valid = editor?.selected() === data.original.id && !!svg && !editor.locked(svg);
      cancel();
      if (
        valid &&
        data.moved &&
        endpoint &&
        JSON.stringify(endpoint) !== JSON.stringify(data.original[data.side])
      )
        editor!.commit({ ...data.original, [data.side]: endpoint });
    });
    for (const name of ['pointercancel', 'lostpointercapture'])
      button.addEventListener(name, () => {
        if (drag) cancel();
      });
  });
  window.addEventListener(
    'keydown',
    (event) => {
      if (drag && event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        cancel();
      }
    },
    true,
  );
  for (const name of ['blur', 'resize', 'pagehide']) window.addEventListener(name, cancel);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancel();
  });
  function refresh() {
    const selectedId = editor?.selected();
    if (
      drag &&
      (selectedId !== drag.original.id ||
        !(get(drag.original.id) instanceof SVGSVGElement) ||
        signature(get(drag.original.id) as SVGSVGElement) !== drag.signature)
    ) {
      cancel();
      return;
    }
    positions.clear();
    for (const original of connectors) {
      const connector = drag?.original.id === original.id ? drag.preview : original;
      const svg = get(connector.id);
      if (!(svg instanceof SVGSVGElement)) continue;
      const line = svg.querySelector('[data-connector-line]'),
        arrows = svg.querySelector('[data-connector-arrows]');
      if (!line || !arrows) continue;
      let result: ReturnType<typeof connectorGeometry> | undefined;
      let pair: [Port, Port] | undefined,
        best = Infinity;
      for (const start of screenCandidates(connector.start, svg))
        for (const end of screenCandidates(connector.end, svg)) {
          const distance = Math.hypot(start.x - end.x, start.y - end.y);
          if (distance < best) {
            pair = [start, end];
            best = distance;
          }
        }
      const matrix = svg.getScreenCTM();
      if (pair && matrix) {
        const inverse = matrix.inverse();
        const local = pair.map((point) => {
          const p = new DOMPoint(point.x, point.y).matrixTransform(inverse);
          const nx = inverse.a * point.nx + inverse.c * point.ny,
            ny = inverse.b * point.nx + inverse.d * point.ny,
            length = Math.hypot(nx, ny) || 1;
          return { x: p.x, y: p.y, nx: nx / length, ny: ny / length };
        });
        for (const [i, endpoint] of [connector.start, connector.end].entries())
          if (endpoint.point) {
            const dx = local[1 - i].x - local[i].x,
              dy = local[1 - i].y - local[i].y;
            // Cardinal tangents give free curves a bend and keep elbow stubs orthogonal.
            const horizontal = Math.abs(dx) >= Math.abs(dy);
            local[i].nx = horizontal ? Math.sign(dx) || 1 : 0;
            local[i].ny = horizontal ? 0 : Math.sign(dy) || 1;
          }
        if (local.every((point) => Object.values(point).every(Number.isFinite))) {
          result = connectorGeometry(connector, local[0], local[1]);
          positions.set(connector.id, pair);
        }
      }
      for (const [element, d] of [
        [line, result?.d ?? ''],
        [arrows, result?.arrows ?? ''],
      ] as const)
        if (element.getAttribute('d') !== d) element.setAttribute('d', d);
    }
    const current = drag?.preview ?? connectors.find((c) => c.id === selectedId);
    const pair = selectedId ? positions.get(selectedId) : undefined,
      svg = selectedId ? get(selectedId) : null;
    buttons.forEach((button, i) => {
      button.hidden = !pair || !current || !svg || !!editor?.locked(svg);
      if (button.hidden || !pair || !current) return;
      button.style.left = `${pair[i].x}px`;
      button.style.top = `${pair[i].y}px`;
      button.toggleAttribute('data-bound', !!current[i === 0 ? 'start' : 'end'].target);
    });
  }
  let frame = 0;
  const tick = () => {
    refresh();
    frame = requestAnimationFrame(tick);
  };
  const stop = () => cancelAnimationFrame(frame);
  if (connectors.length) {
    // Bridge initializes selection/gesture state synchronously after constructing this controller.
    frame = requestAnimationFrame(tick);
    window.addEventListener('pagehide', stop);
    window.addEventListener('pageshow', () => {
      stop();
      frame = requestAnimationFrame(tick);
    });
  }
  return { refresh, stop, cancel, update(next: Connector[]) {connectors=next;cancel();refresh();if(connectors.length&&!frame)frame=requestAnimationFrame(tick);} };
}
