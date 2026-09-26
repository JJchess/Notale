export type PathPoint = { x: number; y: number };
export const motionPresets: Record<string, PathPoint[]> = {
  line: [
    { x: 0, y: 0 },
    { x: 200, y: 0 },
  ],
  arc: [
    { x: 0, y: 0 },
    { x: 45, y: -55 },
    { x: 100, y: -80 },
    { x: 155, y: -55 },
    { x: 200, y: 0 },
  ],
  zigzag: [
    { x: 0, y: 0 },
    { x: 65, y: -60 },
    { x: 130, y: 60 },
    { x: 200, y: 0 },
  ],
};
export interface MotionPath {
  points: PathPoint[];
  preset: string;
  change?: () => void;
}
const initial: MotionPath = { points: motionPresets.line, preset: "line" };
let model = initial,
  owner: symbol | undefined;
const listeners = new Set<() => void>();
function publish(next: MotionPath) {
  model = next;
  listeners.forEach((listener) => listener());
}
function points(value: PathPoint[]) {
  if (
    value.length < 2 ||
    value.length > 50 ||
    value.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))
  )
    throw Error("路径需要 2–50 个有效控制点");
  return structuredClone(value);
}
export const animationPathState = {
  getSnapshot: () => model,
  getServerSnapshot: () => initial,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
export function createAnimationPath(changed: () => void) {
  const token = Symbol();
  owner = token;
  publish({
    ...initial,
    points: structuredClone(initial.points),
    change: changed,
  });
  return {
    get: () => structuredClone(model.points),
    set(value: PathPoint[]) {
      if (owner === token)
        publish({
          points: points(value),
          preset: value.length > 2 ? "custom" : "line",
          change: changed,
        });
    },
    dispose() {
      if (owner === token) {
        owner = undefined;
        publish(initial);
      }
    },
  };
}
export function updateMotionPath(
  source: MotionPath,
  value: PathPoint[],
  preset = "custom",
) {
  if (model !== source || !source.change)
    throw Error("运动路径已变化，请重新操作");
  const next = points(value);
  if (
    next.length === source.points.length &&
    next.every(
      (point, index) =>
        point.x === source.points[index].x &&
        point.y === source.points[index].y,
    )
  )
    return;
  publish({ ...source, points: next, preset });
  source.change();
}
