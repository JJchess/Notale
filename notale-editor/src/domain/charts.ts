import { z } from 'zod';
const chartColor = z
  .string()
  .regex(/^#(?:[a-fA-F0-9]{3}|[a-fA-F0-9]{4}|[a-fA-F0-9]{6}|[a-fA-F0-9]{8})$/);
const values = z.array(z.number().finite().min(-1e12).max(1e12)).max(100);
export const chartDataSchema = z
  .object({
    kind: z.enum(['bar', 'line', 'area', 'pie', 'doughnut']).default('bar'),
    labels: z.array(z.string().max(200)).min(1).max(100),
    values: values.default([]),
    series: z
      .array(z.object({ name: z.string().max(200), values }).strict())
      .min(1)
      .max(8)
      .optional(),
    colors: z
      .array(chartColor)
      .min(1)
      .max(20)
      .default(['#466ddb', '#28a69b', '#e69444', '#a46bd1', '#dc667a']),
    title: z.string().max(300).default(''),
    showValues: z.boolean().default(true),
    showLegend: z.boolean().default(true),
    showGrid: z.boolean().default(true),
    fontSize: z.number().min(10).max(24).default(16),
    textColor: chartColor.default('#273247'),
    background: chartColor.default('#ffffff'),
    gridColor: chartColor.default('#dce3ed'),
    labelAngle: z.union([z.literal(0), z.literal(-45), z.literal(-90)]).default(0),
    labelEvery: z.number().int().min(0).max(100).default(0),
    valueDecimals: z.number().int().min(0).max(6).default(0),
    lineWidth: z.number().min(0.5).max(12).default(3),
    pointRadius: z.number().min(0).max(12).default(4),
  })
  .strict()
  .superRefine((data, ctx) => {
    const series = data.series ?? [{ values: data.values }];
    if (series.some((s) => s.values.length !== data.labels.length))
      ctx.addIssue({ code: 'custom', message: 'Every series must have one value per label' });
    if (
      ['pie', 'doughnut'].includes(data.kind) &&
      (series.length !== 1 ||
        series[0].values.some((v) => v < 0) ||
        series[0].values.reduce((a, b) => a + b, 0) <= 0)
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Pie/doughnut require one nonnegative series with a positive total',
      });
  });
export type ChartData = z.infer<typeof chartDataSchema>;
const esc = (s: unknown) =>
  String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
function textWidth(text: string, size: number) {
  return Array.from(text).reduce(
    (width, char) => width + (char.codePointAt(0)! > 255 ? 1 : 0.58) * size,
    0,
  );
}
function wrapLabel(text: string, width: number, size: number, rows: number): string[] {
  const result: string[] = [];
  let line = '';
  for (const char of Array.from(text)) {
    if (textWidth(line + char, size) > width && line) {
      result.push(line);
      line = '';
    }
    line += char;
  }
  if (line) result.push(line);
  if (result.length > rows) {
    result.length = rows;
    result[rows - 1] =
      Array.from(result[rows - 1])
        .slice(0, -1)
        .join('') + '…';
  }
  return result;
}
function boundedText(
  text: string,
  x: number,
  y: number,
  width: number,
  size: number,
  color: string,
  anchor = 'start',
  attributes = '',
  truncate = true,
) {
  if (!text) return '';
  const label = truncate ? (wrapLabel(text, Math.max(width, size), size, 1)[0] ?? '') : text;
  return `<text ${attributes} x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}" fill="${color}" style="font-size:${size}px;font-family:system-ui;fill:${color}" textLength="${Math.min(width, textWidth(label, size))}" lengthAdjust="spacingAndGlyphs"><title>${esc(text)}</title>${esc(label)}</text>`;
}
export function chartMarkup(input: unknown) {
  const data = chartDataSchema.parse(input),
    series = data.series ?? [{ name: '', values: data.values }],
    color = (i: number) => data.colors[i % data.colors.length];
  let body = `<rect data-chart-background="" width="680" height="400" fill="${data.background}"/>`;
  if (data.title)
    body += boundedText(
      data.title,
      28,
      30,
      624,
      22,
      data.textColor,
      'start',
      'data-chart-title=""',
    );
  if (data.kind === 'pie' || data.kind === 'doughnut') {
    const vals = series[0].values,
      total = vals.reduce((a, b) => a + b, 0);
    let angle = -Math.PI / 2;
    vals.forEach((v, i) => {
      const next = angle + (v / total) * Math.PI * 2,
        x = 260 + Math.cos(angle) * 140,
        y = 205 + Math.sin(angle) * 140,
        x2 = 260 + Math.cos(next) * 140,
        y2 = 205 + Math.sin(next) * 140;
      if (v === total) {
        body +=
          data.kind === 'doughnut'
            ? `<path data-chart-slice="${i}" fill-rule="evenodd" d="M120 205 a140 140 0 1 0 280 0 a140 140 0 1 0 -280 0 Z M186 205 a74 74 0 1 0 148 0 a74 74 0 1 0 -148 0 Z" fill="${color(i)}"/>`
            : `<circle data-chart-slice="${i}" cx="260" cy="205" r="140" fill="${color(i)}"/>`;
      } else if (v > 0) {
        const large = next - angle > Math.PI ? 1 : 0;
        const tail =
          data.kind === 'doughnut'
            ? `L${260 + Math.cos(next) * 74} ${205 + Math.sin(next) * 74} A74 74 0 ${large} 0 ${260 + Math.cos(angle) * 74} ${205 + Math.sin(angle) * 74}`
            : 'L260 205';
        body += `<path data-chart-slice="${i}" d="M${x} ${y} A140 140 0 ${large} 1 ${x2} ${y2} ${tail} Z" fill="${color(i)}"><title>${esc(data.labels[i])}: ${v}</title></path>`;
      }
      if (data.showLegend)
        body += `<g data-chart-legend="${i}"><rect x="445" y="${65 + i * (data.fontSize + 9)}" width="14" height="14" fill="${color(i)}"/>${boundedText(data.labels[i] + (data.showValues ? ` · ${v.toFixed(data.valueDecimals)}` : ''), 468, 78 + i * (data.fontSize + 9), 188, data.fontSize, data.textColor)}</g>`;
      angle = next;
    });
  } else {
    const size = data.fontSize;
    const named = series.map((s, j) => ({ ...s, j })).filter((s) => s.name);
    const legendRows = data.showLegend ? Math.ceil(named.length / 4) : 0;
    const legendRowHeight = size * 1.6 + 8;
    const legendTop = 400 - legendRows * legendRowHeight - 8;
    const labelRoom = data.labelAngle === 0 ? size * 3.2 + 18 : 100;
    const left = 66,
      right = 660,
      top = data.title ? 65 : 28;
    const bottom = Math.min(330, legendTop - labelRoom - 12);
    const all = series.flatMap((s) => s.values);
    const low = Math.min(0, ...all),
      high = Math.max(1, ...all),
      padding = (high - low) * 0.12;
    const min = low < 0 ? low - padding : 0,
      max = high + padding;
    const y = (v: number) => bottom - ((v - min) / (max - min)) * (bottom - top);
    const slot = (right - left) / data.labels.length;
    const x = (i: number) => left + (i + 0.5) * slot;
    const labelWidth = data.labelAngle === 0 ? 100 : 90;
    const required = data.labelAngle === -90 ? size + 7 : data.labelAngle === -45 ? 78 : labelWidth;
    const every = data.labelEvery || Math.max(1, Math.ceil(required / slot));
    const categoryIndexes = data.labels.map((_, i) => i).filter((i) => i % every === 0);
    const tickCount = Math.min(4, Math.max(1, Math.floor((bottom - top) / (size * 1.6 + 4))));
    for (let tick = 0; tick <= tickCount; tick++) {
      const v = min + ((max - min) * tick) / tickCount,
        at = y(v);
      if (data.showGrid)
        body += `<path data-chart-grid="" d="M${left} ${at}H${right}" stroke="${data.gridColor}" fill="none"/>`;
      body += boundedText(
        new Intl.NumberFormat('en-US', {
          maximumSignificantDigits: 3,
          notation: Math.abs(v) >= 1e6 ? 'compact' : 'standard',
        }).format(v),
        left - 8,
        at + size * 0.3,
        52,
        size - 2,
        data.textColor,
        'end',
        'data-chart-tick=""',
        false,
      );
    }
    body += `<path data-chart-axis="" d="M${left} ${top}V${bottom}H${right} M${left} ${y(0)}H${right}" stroke="${data.textColor}" opacity="0.5" fill="none"/>`;
    for (const i of categoryIndexes) {
      const width =
        data.labelAngle === 0 ? Math.max(4, Math.min(labelWidth, every * slot - 8)) : 90;
      const atX = x(i);
      if (data.labelAngle === 0) {
        const parts = wrapLabel(data.labels[i], width, size, 2);
        body += `<g data-chart-category="${i}"><title>${esc(data.labels[i])}</title>${parts.map((line, row) => boundedText(line, atX, bottom + size + 7 + row * (size * 1.6 + 3), width, size, data.textColor, 'middle')).join('')}</g>`;
      } else {
        body += `<g data-chart-category="${i}" transform="translate(${atX} ${bottom + 10}) rotate(${data.labelAngle})">${boundedText(data.labels[i], 0, 0, width, size, data.textColor, 'end')}</g>`;
      }
    }
    const occupied: Array<{ x: number; y: number; width: number; height: number }> = [];
    function valueLabel(value: number, atX: number, atY: number, negative: boolean) {
      if (!data.showValues) return;
      const label = value.toFixed(data.valueDecimals),
        width = textWidth(label, size - 2);
      if (width > 90) return;
      const box = {
        x: atX - width / 2,
        y: atY + (negative ? 5 : -size * 1.5 - 5),
        width,
        height: size,
      };
      if (
        box.x < left ||
        box.x + width > right ||
        box.y < top ||
        box.y + box.height > bottom ||
        occupied.some(
          (b) =>
            box.x < b.x + b.width + 4 &&
            box.x + width + 4 > b.x &&
            box.y < b.y + b.height + 3 &&
            box.y + box.height + 3 > b.y,
        )
      )
        return;
      occupied.push(box);
      body += boundedText(
        label,
        atX,
        box.y + size * 1.1,
        width,
        size - 2,
        data.textColor,
        'middle',
        'data-chart-value=""',
      );
    }
    series.forEach((s, j) => {
      if (data.kind !== 'bar') {
        const points = s.values.map((v, i) => `${x(i)},${y(v)}`);
        if (data.kind === 'area')
          body += `<polygon points="${x(0)},${y(0)} ${points.join(' ')} ${x(s.values.length - 1)},${y(0)}" fill="${color(j)}" opacity="0.2"/>`;
        body += `<polyline points="${points.join(' ')}" fill="none" stroke="${color(j)}" stroke-width="${data.lineWidth}"/>`;
      }
      s.values.forEach((v, i) => {
        const tip = `${s.name ? s.name + ' · ' : ''}${data.labels[i]}: ${v}`;
        let atX = x(i);
        body += `<g data-chart-point="${j}:${i}"><title>${esc(tip)}</title>`;
        if (data.kind === 'bar') {
          const w = (slot * 0.78) / series.length,
            bx = left + i * slot + slot * 0.11 + j * w;
          atX = bx + w * 0.45;
          body += `<rect x="${bx}" y="${Math.min(y(v), y(0))}" width="${w * 0.9}" height="${Math.abs(y(v) - y(0))}" fill="${color(j)}"/>`;
        } else
          body += `<circle cx="${atX}" cy="${y(v)}" r="${data.pointRadius}" fill="${color(j)}"/>`;
        body += '</g>';
        valueLabel(v, atX, y(v), v < 0);
      });
    });
    if (data.showLegend)
      named.forEach((s, i) => {
        const lx = 28 + (i % 4) * 162,
          ly = legendTop + Math.floor(i / 4) * legendRowHeight + size;
        body += `<g data-chart-legend="${s.j}"><title>${esc(s.name)}</title><rect x="${lx}" y="${ly - size * 0.7}" width="12" height="12" fill="${color(s.j)}"/>${boundedText(s.name, lx + 18, ly, 140, size - 1, data.textColor)}</g>`;
      });
  }
  return { data, body };
}
export function chartSvg(input: unknown) {
  const { data, body } = chartMarkup(input);
  return `<svg width="680" height="400" viewBox="0 0 680 400" data-notale-chart="${esc(JSON.stringify(data))}" style="position:absolute;left:120px;top:160px;background:transparent;color:#273247;font-family:system-ui">${body}</svg>`;
}
