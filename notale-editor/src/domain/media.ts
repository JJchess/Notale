import { patchObject } from './schema.js';
import { z } from 'zod';
export const mediaOptionsSchema = z
  .object({
    fit: z.enum(['contain', 'cover', 'fill', 'none', 'scale-down']).default('contain'),
    positionX: z.number().min(0).max(100).default(50),
    positionY: z.number().min(0).max(100).default(50),
    crop: z
      .object({
        top: z.number().min(0).max(99).default(0),
        right: z.number().min(0).max(99).default(0),
        bottom: z.number().min(0).max(99).default(0),
        left: z.number().min(0).max(99).default(0),
      })
      .strict()
      .refine(
        (c) => c.top + c.bottom < 100 && c.left + c.right < 100,
        'Crop must leave a visible area',
      )
      .default({ top: 0, right: 0, bottom: 0, left: 0 }),
    controls: z.boolean().default(true),
    muted: z.boolean().default(false),
    loop: z.boolean().default(false),
    volume: z.number().min(0).max(1).default(1),
    rate: z.number().min(0.25).max(4).default(1),
    startAt: z.number().min(0).max(86400).default(0),
    endAt: z.number().positive().max(86400).nullable().default(null),
    startStep: z.number().int().min(0).max(500).nullable().default(null),
    startSteps: z
      .array(z.number().int().min(0).max(500))
      .max(501)
      .refine((steps) => new Set(steps).size === steps.length, 'Media start steps must be unique')
      .optional(),
  })
  .strict();
export const mediaSettingsSchema = mediaOptionsSchema.refine(
  (s) => s.endAt === null || s.endAt > s.startAt,
  'Media end must be later than start',
);
export type MediaSettings = z.infer<typeof mediaSettingsSchema>;
const url = z
  .string()
  .min(1)
  .max(5000)
  .refine((s) => !/^\s*(javascript|vbscript):/i.test(s), 'Unsupported resource URL');
export const mediaPatchSchema = z
  .object({
    src: url.optional(),
    poster: url.nullable().optional(),
    alt: z.string().max(2000).optional(),
    settings: patchObject(mediaOptionsSchema.shape).optional(),
  })
  .strict();
