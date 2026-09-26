import type { SnapLine, SnapRect } from '../domain/snapping.js';

/** Shadow DOM prevents a lecture's global SVG/line/text CSS from styling editor chrome. */
export function guideOverlay(width: number, height: number) {
  const host = document.createElement('div');
  host.dataset.notaleGuides = '';
  host.style.setProperty('all', 'initial', 'important');
  host.setAttribute('aria-hidden', 'true');
  for (const [name, value] of Object.entries({
    position: 'fixed',
    'pointer-events': 'none',
    'z-index': '2147483647',
    margin: '0',
    padding: '0',
    border: '0',
  }))
    host.style.setProperty(name, value, 'important');
  const root = host.attachShadow({ mode: 'open' });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.style.cssText = 'display:block;width:100%;height:100%;overflow:hidden';
  root.append(svg);
  document.documentElement.append(host);
  return (
    visible: boolean,
    guides: { axis: 'x' | 'y'; position: number }[],
    lines: SnapLine[] = [],
    grid = 0,
    marquee?: SnapRect,
  ) => {
    host.style.setProperty('display', visible ? 'block' : 'none', 'important');
    if (!visible) return;
    const r = document.getElementById('stage')?.getBoundingClientRect();
    const scale = (r?.width ?? width) / width;
    for (const [name, value] of Object.entries({
      left: `${r?.x ?? 0}px`,
      top: `${r?.y ?? 0}px`,
      width: `${r?.width ?? width}px`,
      height: `${r?.height ?? height}px`,
    }))
      host.style.setProperty(name, value, 'important');
    svg.replaceChildren();
    function line(axis: 'x' | 'y', position: number, color: string, dashed = false) {
      const el = document.createElementNS(svg.namespaceURI, 'line');
      for (const [key, value] of Object.entries({
        x1: axis === 'x' ? position : 0,
        x2: axis === 'x' ? position : width,
        y1: axis === 'y' ? position : 0,
        y2: axis === 'y' ? position : height,
        stroke: color,
        'stroke-width': 1 / scale,
        'stroke-dasharray': dashed ? `${4 / scale} ${4 / scale}` : 'none',
        'data-axis': axis,
        'data-position': position,
      }))
        el.setAttribute(key, String(value));
      svg.append(el);
    }
    if (grid > 0) {
      const stride = grid * Math.max(1, Math.ceil(12 / (grid * scale)));
      for (let x = stride; x < width; x += stride) line('x', x, '#b4c2d344');
      for (let y = stride; y < height; y += stride) line('y', y, '#b4c2d344');
    }
    if (marquee) {
      const box = document.createElementNS(svg.namespaceURI, 'rect');
      for (const [key, value] of Object.entries({
        ...marquee,
        fill: '#466ddb18',
        stroke: '#466ddb',
        'stroke-width': 1 / scale,
        'data-marquee': '',
      }))
        box.setAttribute(key, String(value));
      svg.append(box);
    }
    for (const g of guides) line(g.axis, g.position, '#078baf', true);
    for (const g of lines) {
      line(g.axis, g.position, '#d83183');
      const label = document.createElementNS(svg.namespaceURI, 'text');
      label.setAttribute('x', String(g.axis === 'x' ? g.position + 5 / scale : 8 / scale));
      label.setAttribute('y', String(g.axis === 'y' ? g.position - 5 / scale : 16 / scale));
      label.setAttribute('fill', '#b71d69');
      label.setAttribute('font-family', 'system-ui, sans-serif');
      label.setAttribute('font-size', String(11 / scale));
      label.textContent = `${g.axis.toUpperCase()} ${Math.round(g.position * 10) / 10}`;
      svg.append(label);
    }
  };
}
