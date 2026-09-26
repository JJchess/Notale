import { z } from 'zod';
import { sceneCheckpointSchema } from './scene-checkpoints.js';

export const sceneScalarSchema = z.union([
  z.number().finite().min(-1e9).max(1e9),
  z.string().max(1000),
  z.boolean(),
]);
export const sceneValuesSchema = z
  .record(z.string().regex(/^[a-zA-Z_$][\w$]{0,79}$/), sceneScalarSchema)
  .refine((values) => Object.keys(values).length <= 100, 'Too many scene parameters');
export const sceneSettingsSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
    values: sceneValuesSchema,
    checkpoint: sceneCheckpointSchema.optional(),
  })
  .strict()
  .refine(
    (settings) => !settings.checkpoint || Object.keys(settings.values).length === 0,
    'Checkpoint and initializer overrides cannot be combined',
  );
export type SceneScalar = z.infer<typeof sceneScalarSchema>;
export type SceneSettings = z.infer<typeof sceneSettingsSchema>;
