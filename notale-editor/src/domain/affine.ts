/** Shared by source commits and temporary browser previews. Coordinates are in
 * page space; geometry records the object's local and parent coordinate bases. */
export type Geometry = {
  parent: number[];
  local: number[];
  origin: number[];
  size: number[];
  center?: number[];
};
function multiply(a: number[], b: number[]) {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
  ];
}
function vector(a: number[], x: number, y: number) {
  return [a[0] * x + a[2] * y, a[1] * x + a[3] * y];
}
export function affineGeometry(basis: Geometry, world: number[], dx: number, dy: number) {
  const [a, b, c, d] = basis.parent,
    det = a * d - b * c;
  if (Math.abs(det) < 1e-10) return undefined;
  const inv = [d / det, -b / det, -c / det, a / det];
  const next = multiply(multiply(multiply(inv, world), basis.parent), basis.local);
  const delta = vector(inv, dx, dy),
    cx = (basis.center?.[0] ?? basis.size[0] / 2) - basis.origin[0],
    cy = (basis.center?.[1] ?? basis.size[1] / 2) - basis.origin[1];
  const previousCenter = vector(basis.local, cx, cy),
    nextCenter = vector(next, cx, cy);
  return [
    ...next,
    basis.local[4] + delta[0] + previousCenter[0] - nextCenter[0],
    basis.local[5] + delta[1] + previousCenter[1] - nextCenter[1],
  ];
}
