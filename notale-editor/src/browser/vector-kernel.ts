import paper from 'paper';
import svgpath from 'svgpath';
// @ts-ignore PathKit publishes a browser WASM loader without declarations.
import PathKitInit from 'pathkit-wasm';
let ready: Promise<any> | undefined;
let worker: Worker | undefined,
  job = 0;
const jobs = new Map<
  number,
  { resolve: (value: string) => void; reject: (error: Error) => void }
>();
export function cancelVectorCalculation() {
  worker?.terminate();
  worker = undefined;
  for (const j of jobs.values()) j.reject(Error('已取消图形计算'));
  jobs.clear();
}
export function calculatePaths(
  url: string,
  items: Parameters<typeof combinePaths>[1],
  action: string,
  amount?: number,
  extra: Record<string, unknown> = {},
): Promise<string> {
  if (!worker) {
    worker = new Worker(new URL('vector-worker.js', new URL(url, location.href)));
    worker.onmessage = (e) => {
      const j = jobs.get(e.data.id);
      if (!j) return;
      jobs.delete(e.data.id);
      if (e.data.error) j.reject(Error(e.data.error));
      else j.resolve(e.data.result);
    };
    worker.onerror = () => {
      cancelVectorCalculation();
    };
  }
  const id = ++job;
  return new Promise((resolve, reject) => {
    jobs.set(id, { resolve, reject });
    worker!.postMessage({
      id,
      url: new URL(url, location.href).href,
      items,
      action,
      amount,
      ...extra,
    });
  });
}
export const curves = paper;
export function kernel(url: string) {
  return (ready ??= PathKitInit({ locateFile: () => url }));
}
export function transformPath(d: string, m: DOMMatrix) {
  return svgpath(d).matrix([m.a, m.b, m.c, m.d, m.e, m.f]).toString();
}
export function parseCurve(d: string) {
  return new paper.CompoundPath({
    pathData: svgpath(d).unshort().unarc().toString(),
    insert: false,
  });
}
export async function combinePaths(
  url: string,
  items: { d: string; fill: string; stroke: string; width: number; cap: string; join: string }[],
  action: string,
  amount = 10,
) {
  const k = await kernel(url),
    owned: any[] = [];
  const own = (p: any) => {
    if (!p) throw Error('路径计算失败，原图未改变');
    owned.push(p);
    return p;
  };
  try {
    const paths = items.map((i) => {
      let p = own(k.FromSVGString(i.d));
      if (action === 'outline' || i.fill === 'none') {
        p.stroke({
          width: i.width || 1,
          cap: k.StrokeCap[i.cap === 'round' ? 'ROUND' : i.cap === 'square' ? 'SQUARE' : 'BUTT'],
          join: k.StrokeJoin[i.join === 'round' ? 'ROUND' : i.join === 'bevel' ? 'BEVEL' : 'MITER'],
        });
      }
      return p;
    });
    let result = own(paths[0].copy());
    if (action === 'offset') {
      const ring = own(result.copy()).stroke({
        width: Math.abs(amount) * 2,
        join: k.StrokeJoin.ROUND,
      });
      result = own(k.MakeFromOp(result, ring, amount >= 0 ? k.PathOp.UNION : k.PathOp.DIFFERENCE));
    } else
      for (const p of paths.slice(1))
        result = own(
          k.MakeFromOp(
            result,
            p,
            k.PathOp[
              {
                union: 'UNION',
                subtract: 'DIFFERENCE',
                intersect: 'INTERSECT',
                exclude: 'XOR',
                outline: 'UNION',
                flatten: 'UNION',
              }[action] ?? 'UNION'
            ],
          ),
        );
    return result.toSVGString();
  } finally {
    for (const p of owned) p.delete();
  }
}
