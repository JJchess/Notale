import { z } from 'zod';
export const teachingStepSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
    name: z.string().min(1).max(200),
    notes: z.string().max(100000).default(''),
    advanceAfter: z.number().min(0).max(3600000).nullable().default(null),
  })
  .strict();
export type TeachingStep = z.infer<typeof teachingStepSchema>;
