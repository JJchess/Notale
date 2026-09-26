import { z } from 'zod';
import { transformSchema } from './transform-schema.js';
import { containerLayoutSchema } from './container-layout.js';
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const style = z.record(
  z.string().regex(/^(--[\w-]+|[a-z][a-z-]*)$/),
  z
    .string()
    .max(1000)
    .refine(
      (value) => !/(?:url\s*\(|@import)/i.test(value),
      'State styles use existing object resources; switch visibility between image objects',
    ),
);
export const componentPatchSchema = z
  .object({
    text: z.string().max(10000).optional(),
    style: style.optional(),
    visible: z.boolean().optional(),
    nativeChartValue: z.enum(['1.0', '0.1', '0.02']).optional(),
  })
  .strict();
export const componentInstanceSchema = z
  .object({
    definitionId: id,
    initial: id.optional(),
    steps: z
      .array(z.object({ step: z.number().int().min(0).max(500), state: id }).strict())
      .max(501)
      .optional(),
    layouts: z.record(id, containerLayoutSchema).default({}),
    transforms: z.record(id, transformSchema).default({}),
    objects: z.record(id, id),
    overrides: z.record(id, componentPatchSchema).default({}),
    stateOverrides: z.record(id, z.record(id, componentPatchSchema)).default({}),
  })
  .strict();
export const componentSchema = z
  .object({
    id,
    root: id,
    instance: componentInstanceSchema.optional(),
    name: z.string().min(1).max(200),
    initial: id,
    states: z
      .array(
        z
          .object({
            id,
            name: z.string().min(1).max(200),
            patches: z.record(id, componentPatchSchema),
          })
          .strict(),
      )
      .min(1)
      .max(100),
    events: z
      .array(
        z
          .object({
            id,
            target: id,
            event: z.enum(['click', 'pointerenter', 'pointerleave']),
            from: id.optional(),
            to: id,
          })
          .strict(),
      )
      .max(500)
      .default([]),
    steps: z
      .array(z.object({ step: z.number().int().min(0).max(500), state: id }).strict())
      .max(501)
      .default([]),
    duration: z.number().min(0).max(10000).default(250),
    easing: z.enum(['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out']).default('ease'),
  })
  .strict();
export type InteractiveComponent = z.infer<typeof componentSchema>;
export type ComponentPatch = z.infer<typeof componentPatchSchema>;
export function componentTargets(component: InteractiveComponent) {
  return [
    ...new Set([
      component.root,
      ...component.events.map((event) => event.target),
      ...component.states.flatMap((state) => Object.keys(state.patches)),
    ]),
  ];
}
