import { z } from 'zod';
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
export const connectorEndpointSchema = z
  .object({
    target: id.optional(),
    point: z
      .object({
        x: z.number().finite().min(-1e6).max(1e6),
        y: z.number().finite().min(-1e6).max(1e6),
      })
      .strict()
      .optional(),
    anchor: z.enum(['auto', 'top', 'right', 'bottom', 'left']).default('auto'),
  })
  .strict()
  .refine(
    (endpoint) => Boolean(endpoint.target) !== Boolean(endpoint.point),
    'Choose an object or a free point',
  );
export const connectorSchema = z
  .object({
    id,
    start: connectorEndpointSchema,
    end: connectorEndpointSchema,
    kind: z.enum(['straight', 'elbow', 'curve']).default('straight'),
    color: z
      .string()
      .regex(/^#(?:[a-fA-F0-9]{3}|[a-fA-F0-9]{4}|[a-fA-F0-9]{6}|[a-fA-F0-9]{8})$/)
      .default('#466ddb'),
    width: z.number().min(0.5).max(30).default(3),
    dash: z.enum(['solid', 'dashed', 'dotted']).default('solid'),
    startArrow: z.boolean().default(false),
    endArrow: z.boolean().default(true),
  })
  .strict()
  .refine(
    (c) => !c.start.target || !c.end.target || c.start.target !== c.end.target,
    'Choose two different endpoint objects',
  );
export type ConnectorEndpoint = z.infer<typeof connectorEndpointSchema>;
export type Connector = z.infer<typeof connectorSchema>;
export type Point = { x: number; y: number };
export type Port = Point & { nx: number; ny: number };
const p = (point: Point) => `${point.x} ${point.y}`;
export function connectorGeometry(data: Connector, start: Port, end: Port) {
  const distance = Math.hypot(end.x - start.x, end.y - start.y);
  const reach = Math.min(180, Math.max(24, distance / 3));
  let first: Point = end,
    last: Point = start;
  let d = `M${p(start)} L${p(end)}`;
  if (data.kind === 'curve') {
    first = { x: start.x + start.nx * reach, y: start.y + start.ny * reach };
    last = { x: end.x + end.nx * reach, y: end.y + end.ny * reach };
    d = `M${p(start)} C${p(first)} ${p(last)} ${p(end)}`;
  } else if (data.kind === 'elbow') {
    const stub = Math.min(30, Math.max(8, distance / 5));
    first = { x: start.x + start.nx * stub, y: start.y + start.ny * stub };
    last = { x: end.x + end.nx * stub, y: end.y + end.ny * stub };
    const mid =
      Math.abs(start.nx) >= Math.abs(start.ny)
        ? [
            { x: (first.x + last.x) / 2, y: first.y },
            { x: (first.x + last.x) / 2, y: last.y },
          ]
        : [
            { x: first.x, y: (first.y + last.y) / 2 },
            { x: last.x, y: (first.y + last.y) / 2 },
          ];
    d = `M${p(start)} ${[first, ...mid, last, end].map((point) => 'L' + p(point)).join(' ')}`;
  }
  function arrow(at: Point, toward: Point) {
    const angle = Math.atan2(at.y - toward.y, at.x - toward.x),
      size = 8 + data.width * 1.5;
    const base = { x: at.x - Math.cos(angle) * size, y: at.y - Math.sin(angle) * size };
    return `M${base.x + Math.sin(angle) * size * 0.5} ${base.y - Math.cos(angle) * size * 0.5} L${p(at)} L${base.x - Math.sin(angle) * size * 0.5} ${base.y + Math.cos(angle) * size * 0.5}`;
  }
  return {
    d,
    arrows: [
      data.startArrow ? arrow(start, first) : '',
      data.endArrow ? arrow(end, last) : '',
    ].join(' '),
  };
}
export function connectorSvg(input: unknown, width: number, height: number) {
  const data = connectorSchema.parse(input);
  const dash =
    data.dash === 'dashed'
      ? `${data.width * 4} ${data.width * 3}`
      : data.dash === 'dotted'
        ? `0 ${data.width * 3}`
        : 'none';
  return `<svg data-notale-id="${data.id}" data-notale-connector="" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="position:absolute;left:0;top:0;width:${width}px;height:${height}px;overflow:visible;pointer-events:none;z-index:10" aria-label="连接线"><path data-connector-line="" fill="none" stroke="${data.color}" stroke-width="${data.width}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="${dash}" style="pointer-events:stroke;fill:none;stroke:${data.color};stroke-width:${data.width};stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:${dash}"/><path data-connector-arrows="" fill="none" stroke="${data.color}" stroke-width="${data.width}" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:stroke;fill:none;stroke:${data.color};stroke-width:${data.width};stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:none"/></svg>`;
}
