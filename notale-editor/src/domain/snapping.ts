/** All inputs and outputs use slide coordinates. The caller converts its screen
 * tolerance once, so zooming does not change the perceived magnetic distance. */
export type SnapRect = { x: number; y: number; width: number; height: number };
export type SnapLine = {
  axis: 'x' | 'y';
  position: number;
  source: 'page' | 'object' | 'guide' | 'grid';
};
export type SnapOptions = {
  width: number;
  height: number;
  tolerance: number;
  guides?: { axis: 'x' | 'y'; position: number }[];
  grid?: number;
  enabled?: boolean;
  constrain?: boolean;
};
function snapTargets(
  axis: 'x' | 'y',
  neighbors: SnapRect[],
  options: SnapOptions,
  positions: number[],
): SnapLine[] {
  // Explicit guides win exact ties. Otherwise the closest target always wins.
  const targets: SnapLine[] = (options.guides ?? [])
    .filter((g) => g.axis === axis)
    .map((g) => ({ ...g, source: 'guide' }));
  const size = axis === 'x' ? options.width : options.height;
  targets.push(
    ...[0, size / 2, size].map((position) => ({ axis, position, source: 'page' as const })),
  );
  for (const r of neighbors) {
    const start = r[axis],
      size = axis === 'x' ? r.width : r.height;
    targets.push(
      ...[start, start + size / 2, start + size].map((position) => ({
        axis,
        position,
        source: 'object' as const,
      })),
    );
  }
  const grid = options.grid ?? 0;
  if (grid > 0 && Number.isFinite(grid))
    targets.push(
      ...positions.map((a) => ({
        axis,
        position: Math.round(a / grid) * grid,
        source: 'grid' as const,
      })),
    );
  return targets;
}
export function snapTranslation(
  selection: SnapRect[],
  neighbors: SnapRect[],
  dx: number,
  dy: number,
  options: SnapOptions,
): { dx: number; dy: number; lines: SnapLine[] } {
  const lines: SnapLine[] = [];
  const axisLock = options.constrain ? (Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y') : undefined;
  if (axisLock === 'x') dy = 0;
  if (axisLock === 'y') dx = 0;
  if (!selection.length || options.enabled === false) return { dx, dy, lines };
  const left = Math.min(...selection.map((r) => r.x)),
    right = Math.max(...selection.map((r) => r.x + r.width)),
    top = Math.min(...selection.map((r) => r.y)),
    bottom = Math.max(...selection.map((r) => r.y + r.height));
  for (const axis of ['x', 'y'] as const) {
    if (axisLock && axis !== axisLock) continue;
    const anchors =
      axis === 'x' ? [left, (left + right) / 2, right] : [top, (top + bottom) / 2, bottom];
    const delta = axis === 'x' ? dx : dy;
    const targets = snapTargets(
      axis,
      neighbors,
      options,
      anchors.map((a) => a + delta),
    );
    let best: { correction: number; line: SnapLine } | undefined;
    for (const line of targets)
      for (const anchor of anchors) {
        const correction = line.position - anchor - delta;
        if (
          Math.abs(correction) <= options.tolerance &&
          (!best || Math.abs(correction) < Math.abs(best.correction) - 1e-8)
        )
          best = { correction, line };
      }
    if (best) {
      if (axis === 'x') dx += best.correction;
      else dy += best.correction;
      lines.push(best.line);
    }
  }
  return { dx, dy, lines };
}

export type ResizeHandle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';
export type ResizeResult = {
  anchor: [number, number];
  factorX: number;
  factorY: number;
  lines: SnapLine[];
};
/** Resize from the grabbed edge/corner. The fixed anchor never moves; proportional
 * snapping chooses one feasible ratio, with its full handle displacement inside
 * the screen-scaled tolerance, instead of independently snapping both axes. */
export function snapResize(
  box: SnapRect,
  handle: ResizeHandle,
  neighbors: SnapRect[],
  dx: number,
  dy: number,
  options: SnapOptions & { centered?: boolean },
): ResizeResult {
  const horizontal = /[ew]/.test(handle) && box.width > 0,
    vertical = /[ns]/.test(handle) && box.height > 0;
  const anchor: [number, number] = options.centered
    ? [box.x + box.width / 2, box.y + box.height / 2]
    : [
        handle.includes('w') ? box.x + box.width : horizontal ? box.x : box.x + box.width / 2,
        handle.includes('n') ? box.y + box.height : vertical ? box.y : box.y + box.height / 2,
      ];
  const spanX = (handle.includes('w') ? box.x : box.x + box.width) - anchor[0],
    spanY = (handle.includes('n') ? box.y : box.y + box.height) - anchor[1];
  const clamp = (v: number) => Math.max(0.01, Math.min(100, v));
  let factorX = horizontal ? 1 + dx / spanX : 1,
    factorY = vertical ? 1 + dy / spanY : 1;
  if (options.constrain) {
    const factor = !horizontal
      ? factorY
      : !vertical
        ? factorX
        : Math.abs(factorX - 1) >= Math.abs(factorY - 1)
          ? factorX
          : factorY;
    factorX = factorY = factor;
  }
  factorX = clamp(factorX);
  factorY = clamp(factorY);
  const result: ResizeResult = { anchor, factorX, factorY, lines: [] };
  if (options.enabled === false) return result;
  const candidates: { axis: 'x' | 'y'; factor: number; distance: number; line: SnapLine }[] = [];
  const radius = Math.hypot(horizontal ? spanX : 0, vertical ? spanY : 0);
  for (const axis of ['x', 'y'] as const) {
    if (axis === 'x' ? !horizontal : !vertical) continue;
    const span = axis === 'x' ? spanX : spanY,
      pivot = anchor[axis === 'x' ? 0 : 1],
      factor = axis === 'x' ? factorX : factorY,
      position = pivot + span * factor;
    for (const line of snapTargets(axis, neighbors, options, [position])) {
      const next = (line.position - pivot) / span;
      if (next < 0.01 || next > 100) continue;
      const distance = Math.abs(next - factor) * (options.constrain ? radius : Math.abs(span));
      if (distance <= options.tolerance + 1e-8)
        candidates.push({ axis, factor: next, distance, line });
    }
  }
  candidates.sort((a, b) =>
    Math.abs(a.distance - b.distance) > 1e-8
      ? a.distance - b.distance
      : Number(b.line.source === 'guide') - Number(a.line.source === 'guide'),
  );
  if (options.constrain) {
    const best = candidates[0];
    if (best) {
      result.factorX = result.factorY = best.factor;
      for (const axis of ['x', 'y'] as const) {
        const match = candidates.find(
          (c) => c.axis === axis && Math.abs(c.factor - best.factor) < 1e-8,
        );
        if (match) result.lines.push(match.line);
      }
    }
  } else {
    for (const axis of ['x', 'y'] as const) {
      const best = candidates.find((c) => c.axis === axis);
      if (best) {
        result[axis === 'x' ? 'factorX' : 'factorY'] = best.factor;
        result.lines.push(best.line);
      }
    }
  }
  return result;
}

export type SnapPoint = { x: number; y: number };
/** Snap a point along one permitted direction or an invertible pair. Directions
 * map parameter changes into page space; tolerance bounds the entire point move,
 * including its perpendicular component under rotation/skew. */
export function snapConstrainedPoint(
  point: SnapPoint,
  directions: SnapPoint[],
  neighbors: SnapRect[],
  options: SnapOptions,
): { delta: number[]; lines: SnapLine[] } {
  const unchanged = { delta: directions.map(() => 0), lines: [] as SnapLine[] };
  if (options.enabled === false || !directions.length || directions.length > 2) return unchanged;
  const candidates: { delta: number[]; lines: SnapLine[]; distance: number }[] = [];
  const targets = (axis: 'x' | 'y') =>
    snapTargets(axis, neighbors, options, [point[axis]]).filter(
      (line) => Math.abs(line.position - point[axis]) <= options.tolerance + 1e-8,
    );
  const xs = targets('x'),
    ys = targets('y');
  function add(delta: number[], lines: SnapLine[]) {
    const dx = directions.reduce((v, d, i) => v + d.x * delta[i], 0);
    const dy = directions.reduce((v, d, i) => v + d.y * delta[i], 0);
    const distance = Math.hypot(dx, dy);
    if (Number.isFinite(distance) && distance <= options.tolerance + 1e-8)
      candidates.push({ delta, lines, distance });
  }
  if (directions.length === 1) {
    const d = directions[0];
    for (const line of [...xs, ...ys]) {
      if (Math.abs(d[line.axis]) < 1e-10) continue;
      const delta = (line.position - point[line.axis]) / d[line.axis];
      const other = (line.axis === 'x' ? ys : xs).find(
        (l) => Math.abs(point[l.axis] + d[l.axis] * delta - l.position) < 1e-8,
      );
      add([delta], other ? [line, other] : [line]);
    }
  } else {
    const [a, b] = directions,
      det = a.x * b.y - a.y * b.x;
    if (Math.abs(det) < 1e-10) return unchanged;
    const inverse = (x: number, y: number) => [
      (b.y * x - b.x * y) / det,
      (-a.y * x + a.x * y) / det,
    ];
    for (const x of xs) add(inverse(x.position - point.x, 0), [x]);
    for (const y of ys) add(inverse(0, y.position - point.y), [y]);
    // Only the nearest line on each axis can improve a two-axis candidate's
    // Euclidean distance. Source priority remains deterministic for exact ties.
    const nearest = (lines: SnapLine[], axis: 'x' | 'y') =>
      [...lines].sort(
        (a, b) => Math.abs(a.position - point[axis]) - Math.abs(b.position - point[axis]),
      )[0];
    const x = nearest(xs, 'x'),
      y = nearest(ys, 'y');
    if (x && y) add(inverse(x.position - point.x, y.position - point.y), [x, y]);
  }
  candidates.sort(
    (a, b) =>
      b.lines.length - a.lines.length ||
      (Math.abs(a.distance - b.distance) > 1e-8
        ? a.distance - b.distance
        : b.lines.filter((l) => l.source === 'guide').length -
          a.lines.filter((l) => l.source === 'guide').length),
  );
  const best = candidates[0];
  return best ? { delta: best.delta, lines: best.lines } : unchanged;
}
