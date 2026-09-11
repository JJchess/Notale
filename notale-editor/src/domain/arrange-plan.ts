import {type Command,type DeckDocument,type Slide,invariant,transformSchema} from './model.js';
import {affineGeometry} from './affine.js';
export function arrangePlan(doc:DeckDocument,slide:Slide,command:Extract<Command,{type:'elements.arrange'}>):Command[]{
 const rects=command.rectangles;
  const left = Math.min(...rects.map((r) => r.x)),
    right = Math.max(...rects.map((r) => r.x + r.width)),
    top = Math.min(...rects.map((r) => r.y)),
    bottom = Math.max(...rects.map((r) => r.y + r.height));
  const bounds =
    command.reference === 'slide'
      ? { left: 0, right: doc.width, top: 0, bottom: doc.height }
      : { left, right, top, bottom };
  const target = new Map(rects.map((r) => [r.id, { x: r.x, y: r.y }]));
  if (command.action.startsWith('distribute')) {
    invariant(rects.length >= 3, 'SMALL_SELECTION', 'Distribution requires at least three objects');
    const horizontal = command.action === 'distribute-x',
      key = horizontal ? 'x' : 'y',
      size = horizontal ? 'width' : 'height';
    const sorted = [...rects].sort((a, b) => a[key] - b[key]);
    const min = horizontal ? bounds.left : bounds.top,
      max = horizontal ? bounds.right : bounds.bottom;
    const gap = (max - min - rects.reduce((n, r) => n + r[size], 0)) / (rects.length - 1);
    let cursor = min;
    for (const r of sorted) {
      target.get(r.id)![key] = cursor;
      cursor += r[size] + gap;
    }
  }
  return rects.map((r) => {
    const old = transformSchema.parse(slide.transforms[r.id] ?? {}),
      p = target.get(r.id)!;
    let rotate = old.rotate,
      scaleX = old.scaleX,
      scaleY = old.scaleY;
    switch (command.action) {
      case 'left':
        p.x = bounds.left;
        break;
      case 'center':
        p.x = (bounds.left + bounds.right - r.width) / 2;
        break;
      case 'right':
        p.x = bounds.right - r.width;
        break;
      case 'top':
        p.y = bounds.top;
        break;
      case 'middle':
        p.y = (bounds.top + bounds.bottom - r.height) / 2;
        break;
      case 'bottom':
        p.y = bounds.bottom - r.height;
        break;
      case 'translate':
        p.x += command.dx;
        p.y += command.dy;
        break;
      case 'rotate': {
        const cx = command.anchor?.[0] ?? (left + right) / 2,
          cy = command.anchor?.[1] ?? (top + bottom) / 2,
          x = r.x + r.width / 2 - cx,
          y = r.y + r.height / 2 - cy,
          a = (command.angle * Math.PI) / 180;
        p.x = cx + x * Math.cos(a) - y * Math.sin(a) - r.width / 2;
        p.y = cy + x * Math.sin(a) + y * Math.cos(a) - r.height / 2;
        rotate += command.angle;
        break;
      }
      case 'scale': {
        const cx = command.anchor?.[0] ?? (left + right) / 2,
          cy = command.anchor?.[1] ?? (top + bottom) / 2;
        p.x = cx + (r.x + r.width / 2 - cx) * (command.factorX ?? command.factor) - r.width / 2;
        p.y = cy + (r.y + r.height / 2 - cy) * (command.factorY ?? command.factor) - r.height / 2;
        scaleX *= command.factorX ?? command.factor;
        scaleY *= command.factorY ?? command.factor;
        break;
      }
    }
    if (r.geometry) {
      const angle = command.action === 'rotate' ? (command.angle * Math.PI) / 180 : 0,
        fx = command.action === 'scale' ? (command.factorX ?? command.factor) : 1,
        fy = command.action === 'scale' ? (command.factorY ?? command.factor) : 1;
      const matrix = affineGeometry(
        r.geometry,
        [Math.cos(angle) * fx, Math.sin(angle) * fx, -Math.sin(angle) * fy, Math.cos(angle) * fy],
        p.x - r.x,
        p.y - r.y,
      );
      invariant(matrix, 'SINGULAR_GEOMETRY', 'The parent transform is not invertible');
      return {
        type: 'element.transform',
        slideId: slide.id,
        target: r.id,
        transform: { ...old, x: 0, y: 0, rotate: 0, scaleX: 1, scaleY: 1, matrix },
      };
    }
    return {
      type: 'element.transform',
      slideId: slide.id,
      target: r.id,
      transform: { ...old, x: old.x + p.x - r.x, y: old.y + p.y - r.y, rotate, scaleX, scaleY },
    };
  });
}
