import { z } from 'zod';
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const attrs = z.record(z.string().regex(/^[\w:-]+$/), z.string().max(500000).nullable());
export const vectorMutationSchema = z.discriminatedUnion('op', [
  z
    .object({
      op: z.literal('set'),
      target: id,
      attributes: attrs.optional(),
      text: z.string().max(100000).optional(),
    })
    .strict(),
  z
    .object({
      op: z.literal('insert'),
      parent: id,
      index: z.number().int().nonnegative(),
      html: z.string().min(1).max(1000000),
    })
    .strict(),
  z.object({ op: z.literal('remove'), target: id }).strict(),
  z.object({ op: z.literal('replace'), target: id, html: z.string().min(1).max(1000000) }).strict(),
  z
    .object({
      op: z.literal('move'),
      target: id,
      parent: id,
      index: z.number().int().nonnegative(),
      attributes: attrs.optional(),
    })
    .strict(),
]);
export type VectorMutation = z.infer<typeof vectorMutationSchema>;
export const vectorActionSchema = z.enum([
  'group',
  'ungroup',
  'move',
  'union',
  'subtract',
  'intersect',
  'exclude',
  'flatten',
  'split',
  'outline',
  'offset',
  'cut',
  'erase',
  'clip',
  'mask',
  'release',
  'detach',
  'source',
  'draw',
  'gradient',
  'pattern',
  'text',
  'snapshot',
]);
export const vectorCommands = [
  z
    .object({
      type: z.literal('svg.patch'),
      slideId: id,
      mutations: z.array(vectorMutationSchema).min(1).max(2000),
    })
    .strict(),
  z
    .object({
      type: z.literal('svg.structure'),
      slideId: id,
      action: vectorActionSchema,
      mutations: z.array(vectorMutationSchema).min(1).max(2000),
    })
    .strict(),
  z
    .object({
      type: z.literal('svg.import'),
      slideId: id,
      parent: id.optional(),
      html: z.string().min(1).max(1000000),
    })
    .strict(),
] as const;
