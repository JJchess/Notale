import { z } from 'zod';
const size = z.enum(['fixed', 'hug', 'fill']);
const dimension = z.number().finite().min(0).max(100000);
const sizing = {
  width: size.default('fixed'),
  height: size.default('hug'),
  widthValue: dimension.optional(),
  heightValue: dimension.optional(),
  minWidth: dimension.optional(),
  maxWidth: dimension.optional(),
  minHeight: dimension.optional(),
  maxHeight: dimension.optional(),
};
export const containerLayoutSchema = z
  .object({
    mode: z.enum(['row', 'column', 'grid', 'block']),
    gap: dimension.default(20),
    padding: dimension.default(0),
    columns: z.number().int().min(1).max(24).default(2),
    wrap: z.boolean().default(false),
    align: z.enum(['start', 'center', 'end', 'stretch']).default('stretch'),
    justify: z.enum(['start', 'center', 'end', 'space-between', 'space-around']).default('start'),
    ...sizing,
    children: z
      .record(
        z.string().regex(/^[\w-]{1,100}$/),
        z
          .object({
            ...sizing,
            grow: z.number().min(0).max(100).default(0),
            shrink: z.number().min(0).max(100).default(1),
            align: z.enum(['auto', 'start', 'center', 'end', 'stretch']).default('auto'),
          })
          .strict(),
      )
      .default({}),
  })
  .strict();
export type ContainerLayout = z.infer<typeof containerLayoutSchema>;
