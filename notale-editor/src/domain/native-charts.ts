import { chartAuthoringSchema } from './chart-authoring.js';
import { z } from 'zod';

const color = z
  .string()
  .regex(/^#(?:[a-fA-F0-9]{3}|[a-fA-F0-9]{4}|[a-fA-F0-9]{6}|[a-fA-F0-9]{8})$/);
const textStyle = z
  .object({
    color: color.optional(),
    fontSize: z.number().min(6).max(200).optional(),
    fontFamily: z.string().max(300).optional(),
    fontWeight: z
      .union([z.enum(['normal', 'bold']), z.number().int().min(100).max(900)])
      .optional(),
  })
  .strict();
const lineStyle = z
  .object({
    color: color.optional(),
    width: z.number().min(0).max(50).optional(),
    type: z.enum(['solid', 'dashed', 'dotted']).optional(),
    opacity: z.number().min(0).max(1).optional(),
  })
  .strict();
const scalar = z.union([z.number().finite(), z.string().max(1000), z.null()]);
const sample = z.union([
  scalar,
  z.array(scalar).min(1).max(10),
  z
    .object({
      name: z.string().max(1000).optional(),
      value: z.union([scalar, z.array(scalar).min(1).max(10)]),
      itemStyle: z
        .object({ color: color.optional(), opacity: z.number().min(0).max(1).optional() })
        .strict()
        .optional(),
    })
    .strict(),
]);
const series = z
  .object({
    id: z.string().max(200).optional(),
    name: z.string().max(1000).optional(),
    type: z.enum(['line', 'bar', 'scatter', 'pie']).optional(),
    data: z.array(sample).max(20000).optional(),
    lineStyle: lineStyle.optional(),
    itemStyle: z
      .object({ color: color.optional(), opacity: z.number().min(0).max(1).optional() })
      .strict()
      .optional(),
    showSymbol: z.boolean().optional(),
    symbolSize: z.number().min(0).max(100).optional(),
    smooth: z.union([z.boolean(), z.number().min(0).max(1)]).optional(),
    label: textStyle
      .extend({ show: z.boolean().optional(), formatter: z.string().max(1000).optional() })
      .optional(),
    endLabel: textStyle
      .extend({ show: z.boolean().optional(), formatter: z.string().max(1000).optional() })
      .optional(),
  })
  .strict();
const axis = z
  .object({
    name: z.string().max(1000).optional(),
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
    interval: z.number().positive().finite().optional(),
    data: z.array(scalar).max(20000).optional(),
    axisLabel: textStyle
      .extend({ rotate: z.number().min(-90).max(90).optional(), show: z.boolean().optional() })
      .optional(),
    splitLine: z
      .object({ show: z.boolean().optional(), lineStyle: lineStyle.optional() })
      .strict()
      .optional(),
  })
  .strict()
  .refine(
    (a) => a.min === undefined || a.max === undefined || a.min < a.max,
    'Axis minimum must be less than maximum',
  );
// Persist edits only. Native formatter functions and script-owned state stay in the source runtime.
export const nativeChartOptionSchema = z
  .object({
    backgroundColor: color.optional(),
    color: z.array(color).min(1).max(100).optional(),
    textStyle: textStyle.optional(),
    title: z
      .object({
        text: z.string().max(1000).optional(),
        subtext: z.string().max(2000).optional(),
        textStyle: textStyle.optional(),
      })
      .strict()
      .optional(),
    legend: z
      .object({ show: z.boolean().optional(), textStyle: textStyle.optional() })
      .strict()
      .optional(),
    xAxis: z.union([axis, z.array(axis).max(20)]).optional(),
    yAxis: z.union([axis, z.array(axis).max(20)]).optional(),
    series: z.array(series).max(100).optional(),
  })
  .strict()
  .refine(
    (o) => JSON.stringify(o).length <= 1_000_000,
    'Native chart patch exceeds one million characters',
  );
export const learningRateSchema = z.enum(['1.0', '0.1', '0.02']);
const nodeId = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const buttonStyle = z
  .object({
    backgroundColor: z.string().max(100),
    color: z.string().max(100),
    borderColor: z.string().max(100),
    fontWeight: z.string().max(100),
  })
  .strict();
export const nativeChartAppearancePatchSchema = buttonStyle
  .partial()
  .refine(
    (patch) =>
      Object.keys(patch).length > 0 &&
      Object.values(patch).every((value) => value.trim().length > 0),
    'Provide at least one nonempty appearance property',
  );
export type NativeChartAppearancePatch = z.infer<typeof nativeChartAppearancePatchSchema>;
export const nativeChartStateSchema = z
  .object({
    value: learningRateSchema,
    active: buttonStyle,
    inactive: buttonStyle,
  })
  .strict();
export const nativeChartInteractionSchema = nativeChartStateSchema.extend({
  adapter: z.literal('learning-rate-v1'),
  root: nodeId,
  controls: z.object({ '1.0': nodeId, '0.1': nodeId, '0.02': nodeId }).strict(),
  metrics: z.object({ optM: nodeId, minErr: nodeId, overfit: nodeId, verdict: nodeId }).strict(),
});
export type NativeChartInteraction = z.infer<typeof nativeChartInteractionSchema>;
export type NativeChartState = z.infer<typeof nativeChartStateSchema>;
export type LearningRate = z.infer<typeof learningRateSchema>;
export const nativeChartSchema = z
  .object({
    adapter: z.literal('echarts'),
    authoring: chartAuthoringSchema.optional(),
    option: nativeChartOptionSchema,
    interaction: nativeChartInteractionSchema.optional(),
    source: z
      .object({
        script: z.string().max(100000),
        domId: z.string().max(100),
        library: z
          .string()
          .min(1)
          .max(500)
          .refine(
            (p) =>
              !p.startsWith('/') &&
              !p.includes('\\') &&
              !p.split('/').some((s) => s === '..' || s === '.' || s === '') &&
              !/[\x00-\x1f?#:]/.test(p),
          ),
      })
      .strict()
      .optional(),
  })
  .strict();
export type NativeChart = z.infer<typeof nativeChartSchema>;
export type NativeChartOption = z.infer<typeof nativeChartOptionSchema>;
export type NativeChartSource = NonNullable<NativeChart['source']>;
