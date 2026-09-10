import { z } from 'zod';
/** Zod defaults belong to complete author objects, not partial update commands.
 * Strip only outer defaults; an explicitly supplied nested value is still parsed. */
export function patchObject<T extends z.ZodRawShape>(shape: T) {
  const fields = Object.fromEntries(
    Object.entries(shape).map(([key, schema]) => [
      key,
      z.optional(schema instanceof z.ZodDefault ? schema.removeDefault() : schema),
    ]),
  );
  return z
    .object(
      fields as {
        [K in keyof T]: z.ZodOptional<T[K] extends z.ZodDefault<infer Inner> ? Inner : T[K]>;
      },
    )
    .strict();
}
