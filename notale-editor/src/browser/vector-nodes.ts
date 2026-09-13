import { curves, parseCurve } from './vector-kernel.js';
import { SVG_NS, shapePath, pointIn, cleanVector, vectorId, vectorNode } from './vector-dom.js';
type Path = paper.Path;
let clipboard: number[][][] = [];
export function editVectorNodes(
  target: SVGGraphicsElement,
  root: SVGSVGElement,
  commit: (before: Element) => void,
  changed: () => void,
) {
  let disposed = false;
  let model = parseCurve(shapePath(target)),
    chosen = new Set<string>(),
    drag:
      | {
          before: Element;
          start: DOMPoint;
          points: Map<string, { x: number; y: number }>;
          key: string;
          handle: string;
        }
      | undefined;
  const overlay = document.createElementNS(SVG_NS, 'svg');
  overlay.dataset.notaleHandles = '';
  overlay.setAttribute('aria-label', '编辑顶点');
  overlay.setAttribute('tabindex', '-1');
  overlay.style.cssText =
    'position:fixed;inset:0;width:100%;height:100%;z-index:2147483646;pointer-events:none;overflow:visible';
  document.documentElement.append(overlay);
  const key = (p: number, s: number) => `${p}:${s}`;
  const parts = () => model.children as Path[];
  function locate(k: string) {
    const [p, s] = k.split(':').map(Number);
    return parts()[p]?.segments[s];
  }
  function write() {
    if (target.localName !== 'path') {
      const next = document.createElementNS(SVG_NS, 'path');
      for (const a of target.attributes) next.setAttribute(a.name, a.value);
      target.replaceWith(next);
      target = next;
    }
    target.setAttribute('d', model.pathData);
  }
  function dot(x: number, y: number, size: number, attrs: Record<string, string>) {
    const c = document.createElementNS(SVG_NS, 'circle');
    for (const [k, v] of Object.entries({
      cx: String(x),
      cy: String(y),
      r: String(size),
      fill: '#fff',
      stroke: '#7450e9',
      'stroke-width': '1.5',
      ...attrs,
    }))
      c.setAttribute(k, v);
    c.style.pointerEvents = 'all';
    overlay.append(c);
    return c;
  }
  function screen(p: paper.Point) {
    return new DOMPoint(p.x, p.y).matrixTransform(target.getScreenCTM()!);
  }
  function refresh() {
    overlay.replaceChildren();
    if (!target.isConnected) return;
    for (const [pi, p] of parts().entries()) {
      const trace = document.createElementNS(SVG_NS, 'path');
      trace.setAttribute('d', p.pathData);
      const m = target.getScreenCTM()!;
      trace.setAttribute('transform', `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`);
      trace.setAttribute('fill', 'none');
      trace.setAttribute('stroke', 'transparent');
      trace.setAttribute('stroke-width', String(12 / Math.max(0.01, Math.hypot(m.a, m.b))));
      trace.style.pointerEvents = 'stroke';
      trace.ondblclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const before = cleanVector(root),
          q = pointIn(target, e.clientX, e.clientY),
          loc = p.getNearestLocation(new curves.Point(q.x, q.y));
        p.divideAt(loc);
        write();
        commit(before);
        refresh();
      };
      overlay.append(trace);
      p.segments.forEach((s, si) => {
        const k = key(pi, si),
          a = screen(s.point);
        if (chosen.has(k))
          for (const h of ['handleIn', 'handleOut'] as const) {
            const v = s[h];
            if (!v.length) continue;
            const b = screen(s.point.add(v)),
              line = document.createElementNS(SVG_NS, 'line');
            for (const [n, val] of Object.entries({
              x1: a.x,
              y1: a.y,
              x2: b.x,
              y2: b.y,
              stroke: '#9477ec',
            }))
              line.setAttribute(n, String(val));
            overlay.append(line);
            dot(b.x, b.y, 4, { 'data-node': k, 'data-handle': h });
          }
        dot(a.x, a.y, chosen.has(k) ? 5 : 4, {
          'data-node': k,
          fill: chosen.has(k) ? '#7450e9' : 'white',
        });
      });
    }
    changed();
  }
  overlay.addEventListener('pointerdown', (e) => {
    const hit = (e.target as Element).closest('[data-node]');
    if (!hit) return;
    window.focus();
    overlay.focus({ preventScroll: true });
    e.preventDefault();
    e.stopPropagation();
    const k = hit.getAttribute('data-node')!,
      handle = hit.getAttribute('data-handle') ?? '';
    if (e.shiftKey && !handle) {
      if (chosen.has(k)) chosen.delete(k);
      else chosen.add(k);
    } else if (!chosen.has(k)) chosen = new Set([k]);
    const start = pointIn(target, e.clientX, e.clientY),
      points = new Map<string, { x: number; y: number }>();
    for (const k of chosen) {
      const s = locate(k);
      if (s) points.set(k, { x: s.point.x, y: s.point.y });
    }
    drag = { before: cleanVector(root), start, points, key: k, handle };
    overlay.setPointerCapture(e.pointerId);
    refresh();
  });
  overlay.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const q = pointIn(target, e.clientX, e.clientY),
      s = locate(drag.key);
    if (e.shiftKey && !drag.handle) {
      if (Math.abs(q.x - drag.start.x) > Math.abs(q.y - drag.start.y)) q.y = drag.start.y;
      else q.x = drag.start.x;
    }
    if (drag.handle && s) {
      const h = drag.handle as 'handleIn' | 'handleOut',
        other = h === 'handleIn' ? 'handleOut' : 'handleIn';
      s[h] = new curves.Point(q.x - s.point.x, q.y - s.point.y);
      if (e.shiftKey) s[h].angle = Math.round(s[h].angle / 15) * 15;
      if (!e.altKey && s[other].length) s[other] = s[h].normalize(-s[other].length);
    } else
      for (const [k, p] of drag.points) {
        const s = locate(k);
        if (s) s.point = new curves.Point(p.x + q.x - drag.start.x, p.y + q.y - drag.start.y);
      }
    write();
    refresh();
  });
  overlay.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const before = drag.before;
    drag = undefined;
    if (overlay.hasPointerCapture(e.pointerId)) overlay.releasePointerCapture(e.pointerId);
    commit(before);
    refresh();
  });
  function cancel() {
    if (!drag) return;
    const old = vectorNode(vectorId(target), drag.before);
    if (old) {
      const copy = old.cloneNode(true) as SVGGraphicsElement;
      target.replaceWith(copy);
      target = copy;
      model.remove();
      model = parseCurve(shapePath(target));
    }
    drag = undefined;
    refresh();
  }
  const blur = () => cancel();
  window.addEventListener('blur', blur);
  overlay.addEventListener('pointercancel', cancel);
  function action(name: string, value = 0) {
    const before = cleanVector(root);
    if (name === 'copy' || name === 'cut') {
      clipboard = parts()
        .map((p, pi) =>
          p.segments
            .filter((_, si) => chosen.has(key(pi, si)))
            .map((s) => [
              s.point.x,
              s.point.y,
              s.handleIn.x,
              s.handleIn.y,
              s.handleOut.x,
              s.handleOut.y,
            ]),
        )
        .filter((a) => a.length);
      void navigator.clipboard
        ?.writeText(JSON.stringify({ notaleVectorNodes: clipboard }))
        .catch(() => {});
      if (name === 'copy') return;
      name = 'delete';
    }
    if (name === 'paste') {
      const apply = (data: number[][][]) => {
        if (disposed) return;
        const before = cleanVector(root);
        chosen.clear();
        for (const segs of data) {
          const p = new curves.Path({ insert: false });
          for (const s of segs)
            p.add(
              new curves.Segment(
                new curves.Point(s[0] + 12, s[1] + 12),
                new curves.Point(s[2], s[3]),
                new curves.Point(s[4], s[5]),
              ),
            );
          model.addChild(p);
          const pi = parts().indexOf(p);
          p.segments.forEach((_, si) => chosen.add(key(pi, si)));
        }
        write();
        commit(before);
        refresh();
      };
      void navigator.clipboard
        .readText()
        .then((text) => {
          const data = JSON.parse(text).notaleVectorNodes;
          if (
            !Array.isArray(data) ||
            data.length > 1000 ||
            data.some(
              (p: any) =>
                !Array.isArray(p) ||
                p.length > 10000 ||
                p.some(
                  (s: any) => !Array.isArray(s) || s.length !== 6 || !s.every(Number.isFinite),
                ),
            )
          )
            throw Error();
          apply(data);
        })
        .catch(() => apply(clipboard));
      return;
    }
    if (name === 'join') {
      const ends = [...chosen].map((k) => locate(k)).filter((s): s is paper.Segment => !!s);
      if (
        ends.length !== 2 ||
        ends.some((s) => s.index !== 0 && s.index !== s.path.segments.length - 1)
      )
        throw Error('请选择两个端点');
      const [a, b] = ends;
      if (a.path === b.path) a.path.closed = true;
      else {
        const p = a.path,
          q = b.path;
        if (a.index === 0) p.reverse();
        if (b.index !== 0) q.reverse();
        p.join(q);
      }
      chosen.clear();
      write();
      commit(before);
      refresh();
      return;
    }
    if (name === 'scale' || name === 'rotate') {
      const selected = [...chosen].map((k) => locate(k)).filter((s): s is paper.Segment => !!s);
      if (!selected.length) return;
      const center = selected
        .reduce((p, s) => p.add(s.point), new curves.Point(0, 0))
        .divide(selected.length);
      for (const s of selected) {
        if (name === 'scale') {
          s.point = center.add(s.point.subtract(center).multiply(value));
          s.handleIn = s.handleIn.multiply(value);
          s.handleOut = s.handleOut.multiply(value);
        } else {
          s.point = s.point.rotate(value, center);
          s.handleIn = s.handleIn.rotate(value, new curves.Point(0, 0));
          s.handleOut = s.handleOut.rotate(value, new curves.Point(0, 0));
        }
      }
      write();
      commit(before);
      refresh();
      return;
    }
    if (name === 'all') {
      chosen = new Set(parts().flatMap((p, pi) => p.segments.map((_, si) => key(pi, si))));
      refresh();
      return;
    }
    for (const p of [...parts()]) {
      const pi = parts().indexOf(p),
        selected = p.segments.filter((_, si) => chosen.has(key(pi, si)));
      if (name === 'delete') for (const s of [...selected].reverse()) s.remove();
      if (name === 'corner')
        for (const s of selected) {
          s.handleIn = new curves.Point(0, 0);
          s.handleOut = new curves.Point(0, 0);
        }
      if (name === 'smooth') for (const s of selected) s.smooth();
      if (name === 'symmetric')
        for (const s of selected) {
          s.smooth();
          s.handleIn = s.handleOut.multiply(-1);
        }
      if (name === 'reverse') p.reverse();
      if (name === 'close') p.closed = !p.closed;
      if (name === 'simplify') {
        p.flatten(0.3);
        p.simplify(value || 1);
      }
      if (name === 'break' && selected[0]) {
        const tail = p.splitAt(selected[0].location);
        if (tail && tail !== p) model.addChild(tail);
      }
      if (name === 'nudge-x' || name === 'nudge-y')
        for (const s of selected) s.point[name === 'nudge-x' ? 'x' : 'y'] += value;
    }
    write();
    commit(before);
    if (['delete', 'break', 'simplify'].includes(name)) chosen.clear();
    refresh();
  }
  refresh();
  return {
    refresh,
    action,
    cancel,
    get dragging() {
      return !!drag;
    },
    destroy() {
      disposed = true;
      cancel();
      window.removeEventListener('blur', blur);
      overlay.remove();
      model.remove();
    },
  };
}
