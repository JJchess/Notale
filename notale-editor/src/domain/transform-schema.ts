import { z } from 'zod';
export const transformSchema = z
  .object({
    x: z.number().finite().min(-100000).max(100000).default(0),
    y: z.number().finite().min(-100000).max(100000).default(0),
    rotate: z.number().finite().default(0),
    scaleX: z.number().finite().min(-100).max(100).default(1),
    scaleY: z.number().finite().min(-100).max(100).default(1),
    matrix: z.array(z.number().finite()).length(6).optional(),
    width: z.number().positive().max(100000).nullable().optional(),
    height: z.number().positive().max(100000).nullable().optional(),
  })
  .strict();
