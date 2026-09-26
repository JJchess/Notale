import { z } from 'zod';
const identifier = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
export const canvasInstanceSchema = z
  .object({
    adapter: z.literal('correlation-v1'),
    lang: z
      .string()
      .regex(/^[a-zA-Z0-9-]{1,100}$/)
      .default('zh'),
    script: z.string().max(100000),
    members: z.record(identifier, identifier),
  })
  .strict();
export type CanvasInstance = z.infer<typeof canvasInstanceSchema>;
